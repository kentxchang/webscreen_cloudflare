var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
import { DurableObject } from "cloudflare:workers";
var CHUNK_SIZE = 5e5;
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/h/")) {
      const stub = env.SAVE_STORE.get(env.SAVE_STORE.idFromName("main"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
var SaveStore = class extends DurableObject {
  static {
    __name(this, "SaveStore");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_count INTEGER NOT NULL DEFAULT 0,
        seq INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS save_chunks (
        save_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (save_id, idx)
      );
    `);
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const htmlMatch = url.pathname.match(/^\/h\/([^/]+)\/([^/]+)$/);
      if (htmlMatch && request.method === "GET") {
        return this.serveHtml(decodeURIComponent(htmlMatch[1]), decodeURIComponent(htmlMatch[2]));
      }
      if (url.pathname === "/api/usage" && request.method === "GET") return json(this.getUsage());
      const match = url.pathname.match(/^\/api\/saves(?:\/([^/]+))?$/);
      if (!match) return json({ success: false, error: "\u672A\u77E5\u7684\u64CD\u4F5C" }, 404);
      const id = match[1] ? decodeURIComponent(match[1]) : null;
      const method = request.method;
      if (!id && method === "GET") return json(this.listSaves());
      if (!id && method === "POST") {
        const body = await request.json();
        return json(this.saveData(body.name, body.state));
      }
      if (id && method === "GET") return json(this.loadSave(id));
      if (id && method === "PUT") {
        const body = await request.json();
        return json(this.updateSave(id, body.name, body.state));
      }
      if (id && method === "DELETE") return json(this.deleteSave(id));
      return json({ success: false, error: "\u672A\u77E5\u7684\u64CD\u4F5C" }, 405);
    } catch (error) {
      return json({ success: false, error: error.toString() }, 500);
    }
  }
  listSaves() {
    const saves = this.sql.exec(
      "SELECT id, name, created_at, updated_at, data_count FROM saves ORDER BY seq DESC"
    ).toArray().map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dataCount: row.data_count
    }));
    return { success: true, saves };
  }
  getUsage() {
    const saves = this.sql.exec(`
      SELECT s.id, s.name, s.updated_at, COALESCE(SUM(LENGTH(CAST(c.data AS BLOB))), 0) AS size
      FROM saves s LEFT JOIN save_chunks c ON c.save_id = s.id
      GROUP BY s.id ORDER BY size DESC
    `).toArray().map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      size: row.size
    }));
    return { success: true, databaseSize: this.sql.databaseSize, saves };
  }
  saveData(fileName, state) {
    if (!fileName || !state) return { success: false, error: "\u7F3A\u5C11\u5B58\u6A94\u540D\u7A31\u6216\u8CC7\u6599" };
    const saveId = "SAVE_" + Date.now() + "_" + crypto.randomUUID().slice(0, 8);
    const now = formatNow();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO saves (id, name, created_at, updated_at, data_count, seq) VALUES (?, ?, ?, ?, ?, ?)",
        saveId,
        fileName,
        now,
        now,
        countDataItems(state),
        Date.now()
      );
      this.writeChunks(saveId, state);
    });
    return { success: true, message: "\u5132\u5B58\u6210\u529F", saveId, fileName };
  }
  updateSave(saveId, fileName, state) {
    if (!fileName || !state) return { success: false, error: "\u7F3A\u5C11\u5B58\u6A94\u540D\u7A31\u6216\u8CC7\u6599" };
    if (this.sql.exec("SELECT id FROM saves WHERE id = ?", saveId).toArray().length === 0) {
      return { success: false, error: "\u627E\u4E0D\u5230\u5B58\u6A94" };
    }
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE saves SET name = ?, updated_at = ?, data_count = ? WHERE id = ?",
        fileName,
        formatNow(),
        countDataItems(state),
        saveId
      );
      this.sql.exec("DELETE FROM save_chunks WHERE save_id = ?", saveId);
      this.writeChunks(saveId, state);
    });
    return { success: true, message: "\u66F4\u65B0\u6210\u529F", saveId };
  }
  writeChunks(saveId, state) {
    const content = JSON.stringify(state);
    for (let i = 0; i * CHUNK_SIZE < content.length; i++) {
      this.sql.exec(
        "INSERT INTO save_chunks (save_id, idx, data) VALUES (?, ?, ?)",
        saveId,
        i,
        content.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
  }
  loadSave(saveId) {
    const chunks = this.sql.exec(
      "SELECT data FROM save_chunks WHERE save_id = ? ORDER BY idx",
      saveId
    ).toArray();
    if (chunks.length === 0) return { success: false, error: "\u627E\u4E0D\u5230\u5B58\u6A94" };
    const save = this.sql.exec("SELECT name FROM saves WHERE id = ?", saveId).one();
    return { success: true, name: save.name, state: JSON.parse(chunks.map((c) => c.data).join("")) };
  }
  // 上傳的 HTML 以 sandbox 方式提供，無法存取本站的資料與 API
  serveHtml(saveId, htmlId) {
    const result = this.loadSave(saveId);
    const item = result.success && (result.state.htmlItems || []).find((h) => h.id === htmlId);
    if (!item) {
      return new Response("\u627E\u4E0D\u5230\u6B64 HTML\uFF0C\u53EF\u80FD\u5DF2\u88AB\u522A\u9664\u6216\u5C1A\u672A\u96F2\u7AEF\u5B58\u6A94\u3002", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
    return new Response(item.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads"
      }
    });
  }
  deleteSave(saveId) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM save_chunks WHERE save_id = ?", saveId);
      this.sql.exec("DELETE FROM saves WHERE id = ?", saveId);
    });
    return { success: true, message: "\u522A\u9664\u6210\u529F" };
  }
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function formatNow() {
  return (/* @__PURE__ */ new Date()).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}
__name(formatNow, "formatNow");
function countDataItems(state) {
  let count = 0;
  if (state.data) {
    count += (state.data.todoItems || []).length;
    count += (state.data.bookmarks || []).length;
    count += (state.data.lotteryDrawn || []).length;
  }
  count += (state.modals || []).length;
  return count;
}
__name(countDataItems, "countDataItems");

// C:/Users/kentxchang/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// C:/Users/kentxchang/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-3SBwHb/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// C:/Users/kentxchang/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-3SBwHb/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  SaveStore,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
