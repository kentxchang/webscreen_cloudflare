var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
import { DurableObject } from "cloudflare:workers";
var CHUNK_SIZE = 5e5;
var PBKDF2_ITERATIONS = 15e3;
var MASTER_PASSWORD = {
  salt: "a0557885bfc696cbaa1d0eef84afd7b5",
  hash: "2d65becedea15c79e5d5ccb356332f76b898940da58d61f4f96cc14a868bbefa"
};
var SESSION_HOURS = 12;
var MAX_LOGIN_FAILURES = 5;
var LOCK_SECONDS = 60;
var MIN_PASSWORD_LENGTH = 4;
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/h/")) {
      const stub = env.SAVE_STORE.get(env.SAVE_STORE.idFromName("main"));
      return stub.fetch(request);
    }
    if (/^\/m\/[^/]+\/[^/]+$/.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/mindmap/editor", url)));
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
    const columns = this.sql.exec("PRAGMA table_info(saves)").toArray().map((col) => col.name);
    if (!columns.includes("size")) this.sql.exec("ALTER TABLE saves ADD COLUMN size INTEGER");
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
    `);
    this.loginFailures = /* @__PURE__ */ new Map();
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const htmlMatch = url.pathname.match(/^\/h\/([^/]+)\/([^/]+)$/);
      if (htmlMatch && request.method === "GET") {
        return this.serveHtml(decodeURIComponent(htmlMatch[1]), decodeURIComponent(htmlMatch[2]));
      }
      const mindmapMatch = url.pathname.match(/^\/api\/mindmaps\/([^/]+)\/([^/]+)$/);
      if (mindmapMatch && request.method === "GET") {
        return json(this.getMindmap(decodeURIComponent(mindmapMatch[1]), decodeURIComponent(mindmapMatch[2])));
      }
      if (url.pathname === "/api/usage" && request.method === "GET") return json(this.getUsage());
      if (url.pathname.startsWith("/api/auth/")) return await this.handleAuth(request, url.pathname.slice("/api/auth/".length));
      const match = url.pathname.match(/^\/api\/saves(?:\/([^/]+))?$/);
      if (!match) return json({ success: false, error: "\u672A\u77E5\u7684\u64CD\u4F5C" }, 404);
      const id = match[1] ? decodeURIComponent(match[1]) : null;
      const method = request.method;
      if (method !== "GET" && !this.getSessionRole(request)) {
        return json({ success: false, error: "\u9700\u8981\u7BA1\u7406\u8005\u767B\u5165", needLogin: true }, 401);
      }
      if (!id && method === "GET") return json(this.listSaves());
      if (!id && method === "POST") {
        return json(this.saveData(url.searchParams.get("name"), await request.text()));
      }
      if (id && method === "GET") return this.loadSaveResponse(id);
      if (id && method === "PUT") {
        return json(this.updateSave(id, url.searchParams.get("name"), await request.text()));
      }
      if (id && method === "PATCH") return json(this.renameSave(id, url.searchParams.get("name")));
      if (id && method === "DELETE") return json(this.deleteSave(id));
      return json({ success: false, error: "\u672A\u77E5\u7684\u64CD\u4F5C" }, 405);
    } catch (error) {
      return json({ success: false, error: error.toString() }, 500);
    }
  }
  // ===== 管理者密碼與登入 =====
  async handleAuth(request, action) {
    const method = request.method;
    const readPassword = /* @__PURE__ */ __name(async () => String((await request.json()).password || ""), "readPassword");
    if (action === "status" && method === "GET") {
      return json({ success: true, configured: !!this.getAdminPassword() });
    }
    if (action === "me" && method === "GET") {
      const role = this.getSessionRole(request);
      return role ? json({ success: true, role }) : json({ success: false, error: "\u5C1A\u672A\u767B\u5165" }, 401);
    }
    if (action === "logout" && method === "POST") {
      const token = getBearerToken(request);
      if (token) this.sql.exec("DELETE FROM sessions WHERE token = ?", token);
      return json({ success: true });
    }
    if (action === "setup" && method === "POST") {
      if (this.getAdminPassword()) return json({ success: false, error: "\u7BA1\u7406\u8005\u5BC6\u78BC\u5DF2\u8A2D\u5B9A\u904E" }, 403);
      const password = await readPassword();
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json({ success: false, error: "\u5BC6\u78BC\u81F3\u5C11\u9700\u8981 " + MIN_PASSWORD_LENGTH + " \u500B\u5B57\u5143" }, 400);
      }
      await this.setAdminPassword(password);
      return json({ success: true, role: "admin", token: this.createSession("admin") });
    }
    if (action === "login" && method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      const failure = this.loginFailures.get(ip) || { count: 0, until: 0 };
      if (failure.until > Date.now()) {
        return json({ success: false, error: "\u8F38\u5165\u932F\u8AA4\u6B21\u6578\u904E\u591A\uFF0C\u8ACB " + LOCK_SECONDS + " \u79D2\u5F8C\u518D\u8A66" }, 429);
      }
      const password = await readPassword();
      let role = null;
      if (await verifyPassword(password, MASTER_PASSWORD)) {
        role = "master";
      } else {
        const admin = this.getAdminPassword();
        if (admin && await verifyPassword(password, admin)) role = "admin";
      }
      if (!role) {
        const count = failure.until ? 1 : failure.count + 1;
        this.loginFailures.set(ip, {
          count,
          until: count >= MAX_LOGIN_FAILURES ? Date.now() + LOCK_SECONDS * 1e3 : 0
        });
        return json({ success: false, error: "\u5BC6\u78BC\u932F\u8AA4" }, 401);
      }
      this.loginFailures.delete(ip);
      return json({ success: true, role, token: this.createSession(role) });
    }
    if (action === "password" && method === "POST") {
      if (this.getSessionRole(request) !== "master") {
        return json({ success: false, error: "\u6C92\u6709\u6B0A\u9650\u4FEE\u6539\u7BA1\u7406\u8005\u5BC6\u78BC" }, 403);
      }
      const password = await readPassword();
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json({ success: false, error: "\u5BC6\u78BC\u81F3\u5C11\u9700\u8981 " + MIN_PASSWORD_LENGTH + " \u500B\u5B57\u5143" }, 400);
      }
      await this.setAdminPassword(password);
      this.sql.exec("DELETE FROM sessions WHERE role = 'admin'");
      return json({ success: true, message: "\u5DF2\u4FEE\u6539\u7BA1\u7406\u8005\u5BC6\u78BC" });
    }
    return json({ success: false, error: "\u672A\u77E5\u7684\u64CD\u4F5C" }, 404);
  }
  getAdminPassword() {
    const row = this.sql.exec("SELECT value FROM settings WHERE key = 'admin_password'").toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }
  async setAdminPassword(password) {
    const salt = randomHex(16);
    const value = JSON.stringify({ salt, hash: await hashPassword(password, salt) });
    this.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)", value);
  }
  createSession(role) {
    const token = randomHex(32);
    const now = Date.now();
    this.sql.exec("DELETE FROM sessions WHERE expires < ?", now);
    this.sql.exec("INSERT INTO sessions (token, role, expires) VALUES (?, ?, ?)", token, role, now + SESSION_HOURS * 3600 * 1e3);
    return token;
  }
  // 回傳登入身分（'admin'、'master'），未登入或已過期回傳 null
  getSessionRole(request) {
    const token = getBearerToken(request);
    if (!token) return null;
    const row = this.sql.exec("SELECT role FROM sessions WHERE token = ? AND expires > ?", token, Date.now()).toArray()[0];
    return row ? row.role : null;
  }
  listSaves() {
    const saves = this.sql.exec(
      "SELECT id, name, created_at, updated_at FROM saves ORDER BY seq DESC"
    ).toArray().map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    return { success: true, saves };
  }
  getUsage() {
    this.sql.exec("UPDATE saves SET size = " + SIZE_SQL + " WHERE size IS NULL");
    const saves = this.sql.exec(
      "SELECT id, name, updated_at, size FROM saves ORDER BY size DESC"
    ).toArray().map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      size: row.size
    }));
    return { success: true, databaseSize: this.sql.databaseSize, saves };
  }
  saveData(fileName, content) {
    if (!fileName || !content) return { success: false, error: "\u7F3A\u5C11\u5B58\u6A94\u540D\u7A31\u6216\u8CC7\u6599" };
    const saveId = "SAVE_" + Date.now() + "_" + crypto.randomUUID().slice(0, 8);
    const now = formatNow();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO saves (id, name, created_at, updated_at, seq) VALUES (?, ?, ?, ?, ?)",
        saveId,
        fileName,
        now,
        now,
        Date.now()
      );
      this.writeChunks(saveId, content);
    });
    return { success: true, message: "\u5132\u5B58\u6210\u529F", saveId, fileName };
  }
  updateSave(saveId, fileName, content) {
    if (!fileName || !content) return { success: false, error: "\u7F3A\u5C11\u5B58\u6A94\u540D\u7A31\u6216\u8CC7\u6599" };
    if (this.sql.exec("SELECT id FROM saves WHERE id = ?", saveId).toArray().length === 0) {
      return { success: false, error: "\u627E\u4E0D\u5230\u5B58\u6A94" };
    }
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE saves SET name = ?, updated_at = ? WHERE id = ?",
        fileName,
        formatNow(),
        saveId
      );
      this.sql.exec("DELETE FROM save_chunks WHERE save_id = ?", saveId);
      this.writeChunks(saveId, content);
    });
    return { success: true, message: "\u66F4\u65B0\u6210\u529F", saveId };
  }
  // 寫入內容（原始 JSON 文字）並記錄大小
  writeChunks(saveId, content) {
    for (let i = 0; i * CHUNK_SIZE < content.length; i++) {
      this.sql.exec(
        "INSERT INTO save_chunks (save_id, idx, data) VALUES (?, ?, ?)",
        saveId,
        i,
        content.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
    this.sql.exec("UPDATE saves SET size = " + SIZE_SQL + " WHERE id = ?", saveId);
  }
  // 讀出存檔的原始 JSON 文字，不存在時回傳 null
  readContent(saveId) {
    const chunks = this.sql.exec(
      "SELECT data FROM save_chunks WHERE save_id = ? ORDER BY idx",
      saveId
    ).toArray();
    return chunks.length === 0 ? null : chunks.map((c) => c.data).join("");
  }
  // 直接把存檔文字拼進回應，不解析也不重新序列化
  loadSaveResponse(saveId) {
    const content = this.readContent(saveId);
    if (content === null) return json({ success: false, error: "\u627E\u4E0D\u5230\u5B58\u6A94" });
    const save = this.sql.exec("SELECT name FROM saves WHERE id = ?", saveId).one();
    return new Response('{"success":true,"name":' + JSON.stringify(save.name) + ',"state":' + content + "}", {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  // 上傳的 HTML 以 sandbox 方式提供，無法存取本站的資料與 API
  serveHtml(saveId, htmlId) {
    const content = this.readContent(saveId);
    const item = content !== null && (JSON.parse(content).htmlItems || []).find((h) => h.id === htmlId);
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
  getMindmap(saveId, mapId) {
    const content = this.readContent(saveId);
    const item = content !== null && (JSON.parse(content).mindmapItems || []).find((m) => m.id === mapId);
    if (!item) return { success: false, error: "\u627E\u4E0D\u5230\u6B64\u5FC3\u667A\u5716\uFF0C\u53EF\u80FD\u5DF2\u88AB\u522A\u9664\u6216\u5C1A\u672A\u96F2\u7AEF\u5B58\u6A94\u3002" };
    return { success: true, mindmap: item };
  }
  renameSave(saveId, fileName) {
    const name = (fileName || "").trim();
    if (!name) return { success: false, error: "\u8ACB\u8F38\u5165\u5B58\u6A94\u540D\u7A31" };
    if (this.sql.exec("SELECT id FROM saves WHERE id = ?", saveId).toArray().length === 0) {
      return { success: false, error: "\u627E\u4E0D\u5230\u5B58\u6A94" };
    }
    this.sql.exec("UPDATE saves SET name = ? WHERE id = ?", name, saveId);
    return { success: true, message: "\u5DF2\u4FEE\u6539\u540D\u7A31", name };
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
var SIZE_SQL = "(SELECT COALESCE(SUM(LENGTH(CAST(data AS BLOB))), 0) FROM save_chunks WHERE save_id = saves.id)";
function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}
__name(getBearerToken, "getBearerToken");
function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomHex, "randomHex");
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const hash = await hashPassword(password, stored.salt);
  let diff = hash.length ^ stored.hash.length;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ stored.hash.charCodeAt(i % stored.hash.length);
  return diff === 0;
}
__name(verifyPassword, "verifyPassword");

// C:/Users/kentxchang/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
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

// C:/Users/kentxchang/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
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

// .wrangler/tmp/bundle-k21B5Q/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// C:/Users/kentxchang/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
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

// .wrangler/tmp/bundle-k21B5Q/middleware-loader.entry.ts
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
