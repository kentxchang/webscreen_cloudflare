/**
 * Classroom Dashboard Cloudflare 後端 API
 * 功能：雲端存檔/讀檔，使用 Durable Object 內建 SQLite 作為資料庫（免費方案可用）
 *
 * API：
 *   GET    /api/usage       資料庫使用空間（總大小與各存檔大小）
 *   GET    /api/saves       列出所有存檔
 *   POST   /api/saves?name=名稱       新增存檔   body: 畫面狀態 JSON
 *   GET    /api/saves/:id             載入存檔
 *   PUT    /api/saves/:id?name=名稱   更新存檔   body: 畫面狀態 JSON
 *   PATCH  /api/saves/:id?name=名稱   只修改存檔名稱（不改內容與更新時間）
 *   DELETE /api/saves/:id             刪除存檔
 *   GET    /h/:id/:htmlId             直接開啟存檔中上傳的 HTML（分享用）
 *   GET    /m/:id/:mapId              開啟存檔中心智圖的分享頁面（頁面再讀取下方 API）
 *   GET    /api/mindmaps/:id/:mapId   讀取存檔中的單一心智圖
 *
 *   GET    /api/auth/status    是否已設定管理者密碼
 *   POST   /api/auth/setup     首次設定管理者密碼       body: { password }
 *   POST   /api/auth/login     登入                     body: { password }
 *   GET    /api/auth/me        目前登入身分
 *   POST   /api/auth/logout    登出
 *   POST   /api/auth/password  修改管理者密碼（僅萬用管理者） body: { password }
 *
 * 權限：讀取（清單、載入、分享）不需登入；新增、更新、改名、刪除存檔需登入
 * （請求標頭 Authorization: Bearer <token>）。
 *
 * 效能：存檔內容以原始文字直接切塊存入、讀取時直接拼接回傳，不做 JSON 解析與重新序列化，
 * 大型存檔（含 PDF、圖片）也只需極少的 CPU 時間。
 */
import { DurableObject } from 'cloudflare:workers';

// SQLite 單列上限約 2MB；畫布與圖片的 base64 可能超過，因此將狀態 JSON 切塊儲存
// 每塊 50 萬字元（中文每字 3 位元組，最多 1.5MB）
const CHUNK_SIZE = 500000;

// 密碼以 PBKDF2-SHA256 加鹽雜湊後儲存（次數兼顧安全與免費方案的 CPU 時間限制）
const PBKDF2_ITERATIONS = 15000;

// 萬用管理者密碼：只保存雜湊值，不保存明碼
const MASTER_PASSWORD = {
  salt: 'a0557885bfc696cbaa1d0eef84afd7b5',
  hash: '2d65becedea15c79e5d5ccb356332f76b898940da58d61f4f96cc14a868bbefa'
};

const SESSION_HOURS = 12;        // 登入有效時間
const MAX_LOGIN_FAILURES = 5;    // 連續輸錯幾次後暫停
const LOCK_SECONDS = 60;         // 暫停秒數
const MIN_PASSWORD_LENGTH = 4;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/h/')) {
      // 所有存檔集中在同一個 Durable Object 實例
      const stub = env.SAVE_STORE.get(env.SAVE_STORE.idFromName('main'));
      return stub.fetch(request);
    }
    if (/^\/m\/[^/]+\/[^/]+$/.test(url.pathname)) {
      // 心智圖分享頁面：提供同一個編輯器頁面，由頁面依網址讀取心智圖
      return env.ASSETS.fetch(new Request(new URL('/mindmap/editor', url)));
    }
    return env.ASSETS.fetch(request);
  }
};

export class SaveStore extends DurableObject {
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
    // 存檔大小欄位（舊資料庫沒有此欄位時補上），查詢使用空間時不必掃描全部資料
    const columns = this.sql.exec('PRAGMA table_info(saves)').toArray().map(col => col.name);
    if (!columns.includes('size')) this.sql.exec('ALTER TABLE saves ADD COLUMN size INTEGER');

    // 管理者密碼與登入狀態
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
    this.loginFailures = new Map(); // 依來源 IP 記錄連續輸錯次數
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);

      const htmlMatch = url.pathname.match(/^\/h\/([^/]+)\/([^/]+)$/);
      if (htmlMatch && request.method === 'GET') {
        return this.serveHtml(decodeURIComponent(htmlMatch[1]), decodeURIComponent(htmlMatch[2]));
      }

      const mindmapMatch = url.pathname.match(/^\/api\/mindmaps\/([^/]+)\/([^/]+)$/);
      if (mindmapMatch && request.method === 'GET') {
        return json(this.getMindmap(decodeURIComponent(mindmapMatch[1]), decodeURIComponent(mindmapMatch[2])));
      }

      if (url.pathname === '/api/usage' && request.method === 'GET') return json(this.getUsage());

      if (url.pathname.startsWith('/api/auth/')) return await this.handleAuth(request, url.pathname.slice('/api/auth/'.length));

      const match = url.pathname.match(/^\/api\/saves(?:\/([^/]+))?$/);
      if (!match) return json({ success: false, error: '未知的操作' }, 404);

      const id = match[1] ? decodeURIComponent(match[1]) : null;
      const method = request.method;

      // 讀取不需登入；新增、更新、改名、刪除需登入
      if (method !== 'GET' && !this.getSessionRole(request)) {
        return json({ success: false, error: '需要管理者登入', needLogin: true }, 401);
      }

      if (!id && method === 'GET') return json(this.listSaves());
      if (!id && method === 'POST') {
        return json(this.saveData(url.searchParams.get('name'), await request.text()));
      }
      if (id && method === 'GET') return this.loadSaveResponse(id);
      if (id && method === 'PUT') {
        return json(this.updateSave(id, url.searchParams.get('name'), await request.text()));
      }
      if (id && method === 'PATCH') return json(this.renameSave(id, url.searchParams.get('name')));
      if (id && method === 'DELETE') return json(this.deleteSave(id));

      return json({ success: false, error: '未知的操作' }, 405);
    } catch (error) {
      return json({ success: false, error: error.toString() }, 500);
    }
  }

  // ===== 管理者密碼與登入 =====
  async handleAuth(request, action) {
    const method = request.method;
    const readPassword = async () => String((await request.json()).password || '');

    if (action === 'status' && method === 'GET') {
      return json({ success: true, configured: !!this.getAdminPassword() });
    }

    if (action === 'me' && method === 'GET') {
      const role = this.getSessionRole(request);
      return role ? json({ success: true, role: role }) : json({ success: false, error: '尚未登入' }, 401);
    }

    if (action === 'logout' && method === 'POST') {
      const token = getBearerToken(request);
      if (token) this.sql.exec('DELETE FROM sessions WHERE token = ?', token);
      return json({ success: true });
    }

    // 首次設定管理者密碼（已設定過就不能再用這個方式）
    if (action === 'setup' && method === 'POST') {
      if (this.getAdminPassword()) return json({ success: false, error: '管理者密碼已設定過' }, 403);
      const password = await readPassword();
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json({ success: false, error: '密碼至少需要 ' + MIN_PASSWORD_LENGTH + ' 個字元' }, 400);
      }
      await this.setAdminPassword(password);
      return json({ success: true, role: 'admin', token: this.createSession('admin') });
    }

    if (action === 'login' && method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const failure = this.loginFailures.get(ip) || { count: 0, until: 0 };
      if (failure.until > Date.now()) {
        return json({ success: false, error: '輸入錯誤次數過多，請 ' + LOCK_SECONDS + ' 秒後再試' }, 429);
      }

      const password = await readPassword();
      let role = null;
      if (await verifyPassword(password, MASTER_PASSWORD)) {
        role = 'master';
      } else {
        const admin = this.getAdminPassword();
        if (admin && await verifyPassword(password, admin)) role = 'admin';
      }

      if (!role) {
        // 暫停時間結束後重新計算次數
        const count = failure.until ? 1 : failure.count + 1;
        this.loginFailures.set(ip, {
          count: count,
          until: count >= MAX_LOGIN_FAILURES ? Date.now() + LOCK_SECONDS * 1000 : 0
        });
        return json({ success: false, error: '密碼錯誤' }, 401);
      }

      this.loginFailures.delete(ip);
      return json({ success: true, role: role, token: this.createSession(role) });
    }

    // 修改管理者密碼：只有用萬用管理者密碼登入時可以；改完後其他管理者登入失效
    if (action === 'password' && method === 'POST') {
      if (this.getSessionRole(request) !== 'master') {
        return json({ success: false, error: '沒有權限修改管理者密碼' }, 403);
      }
      const password = await readPassword();
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json({ success: false, error: '密碼至少需要 ' + MIN_PASSWORD_LENGTH + ' 個字元' }, 400);
      }
      await this.setAdminPassword(password);
      this.sql.exec("DELETE FROM sessions WHERE role = 'admin'");
      return json({ success: true, message: '已修改管理者密碼' });
    }

    return json({ success: false, error: '未知的操作' }, 404);
  }

  getAdminPassword() {
    const row = this.sql.exec("SELECT value FROM settings WHERE key = 'admin_password'").toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }

  async setAdminPassword(password) {
    const salt = randomHex(16);
    const value = JSON.stringify({ salt: salt, hash: await hashPassword(password, salt) });
    this.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)", value);
  }

  createSession(role) {
    const token = randomHex(32);
    const now = Date.now();
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    this.sql.exec('INSERT INTO sessions (token, role, expires) VALUES (?, ?, ?)', token, role, now + SESSION_HOURS * 3600 * 1000);
    return token;
  }

  // 回傳登入身分（'admin'、'master'），未登入或已過期回傳 null
  getSessionRole(request) {
    const token = getBearerToken(request);
    if (!token) return null;
    const row = this.sql.exec('SELECT role FROM sessions WHERE token = ? AND expires > ?', token, Date.now()).toArray()[0];
    return row ? row.role : null;
  }

  listSaves() {
    const saves = this.sql.exec(
      'SELECT id, name, created_at, updated_at FROM saves ORDER BY seq DESC'
    ).toArray().map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    return { success: true, saves: saves };
  }

  getUsage() {
    // 舊存檔第一次查詢時補算大小
    this.sql.exec('UPDATE saves SET size = ' + SIZE_SQL + ' WHERE size IS NULL');
    const saves = this.sql.exec(
      'SELECT id, name, updated_at, size FROM saves ORDER BY size DESC'
    ).toArray().map(row => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      size: row.size
    }));
    return { success: true, databaseSize: this.sql.databaseSize, saves: saves };
  }

  saveData(fileName, content) {
    if (!fileName || !content) return { success: false, error: '缺少存檔名稱或資料' };

    const saveId = 'SAVE_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
    const now = formatNow();

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'INSERT INTO saves (id, name, created_at, updated_at, seq) VALUES (?, ?, ?, ?, ?)',
        saveId, fileName, now, now, Date.now()
      );
      this.writeChunks(saveId, content);
    });

    return { success: true, message: '儲存成功', saveId: saveId, fileName: fileName };
  }

  updateSave(saveId, fileName, content) {
    if (!fileName || !content) return { success: false, error: '缺少存檔名稱或資料' };
    if (this.sql.exec('SELECT id FROM saves WHERE id = ?', saveId).toArray().length === 0) {
      return { success: false, error: '找不到存檔' };
    }

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'UPDATE saves SET name = ?, updated_at = ? WHERE id = ?',
        fileName, formatNow(), saveId
      );
      this.sql.exec('DELETE FROM save_chunks WHERE save_id = ?', saveId);
      this.writeChunks(saveId, content);
    });

    return { success: true, message: '更新成功', saveId: saveId };
  }

  // 寫入內容（原始 JSON 文字）並記錄大小
  writeChunks(saveId, content) {
    for (let i = 0; i * CHUNK_SIZE < content.length; i++) {
      this.sql.exec(
        'INSERT INTO save_chunks (save_id, idx, data) VALUES (?, ?, ?)',
        saveId, i, content.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      );
    }
    this.sql.exec('UPDATE saves SET size = ' + SIZE_SQL + ' WHERE id = ?', saveId);
  }

  // 讀出存檔的原始 JSON 文字，不存在時回傳 null
  readContent(saveId) {
    const chunks = this.sql.exec(
      'SELECT data FROM save_chunks WHERE save_id = ? ORDER BY idx', saveId
    ).toArray();
    return chunks.length === 0 ? null : chunks.map(c => c.data).join('');
  }

  // 直接把存檔文字拼進回應，不解析也不重新序列化
  loadSaveResponse(saveId) {
    const content = this.readContent(saveId);
    if (content === null) return json({ success: false, error: '找不到存檔' });

    const save = this.sql.exec('SELECT name FROM saves WHERE id = ?', saveId).one();
    return new Response('{"success":true,"name":' + JSON.stringify(save.name) + ',"state":' + content + '}', {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  // 上傳的 HTML 以 sandbox 方式提供，無法存取本站的資料與 API
  serveHtml(saveId, htmlId) {
    const content = this.readContent(saveId);
    const item = content !== null && (JSON.parse(content).htmlItems || []).find(h => h.id === htmlId);
    if (!item) {
      return new Response('找不到此 HTML，可能已被刪除或尚未雲端存檔。', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    return new Response(item.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads'
      }
    });
  }

  getMindmap(saveId, mapId) {
    const content = this.readContent(saveId);
    const item = content !== null && (JSON.parse(content).mindmapItems || []).find(m => m.id === mapId);
    if (!item) return { success: false, error: '找不到此心智圖，可能已被刪除或尚未雲端存檔。' };
    return { success: true, mindmap: item };
  }

  renameSave(saveId, fileName) {
    const name = (fileName || '').trim();
    if (!name) return { success: false, error: '請輸入存檔名稱' };
    if (this.sql.exec('SELECT id FROM saves WHERE id = ?', saveId).toArray().length === 0) {
      return { success: false, error: '找不到存檔' };
    }
    this.sql.exec('UPDATE saves SET name = ? WHERE id = ?', name, saveId);
    return { success: true, message: '已修改名稱', name: name };
  }

  deleteSave(saveId) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM save_chunks WHERE save_id = ?', saveId);
      this.sql.exec('DELETE FROM saves WHERE id = ?', saveId);
    });
    return { success: true, message: '刪除成功' };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function formatNow() {
  return new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

// 計算某個存檔佔用的位元組數（用於 saves.size）
const SIZE_SQL = '(SELECT COALESCE(SUM(LENGTH(CAST(data AS BLOB))), 0) FROM save_chunks WHERE save_id = saves.id)';

// ===== 密碼雜湊與登入憑證 =====
function getBearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 以固定時間比較雜湊值，避免從回應時間推測密碼
async function verifyPassword(password, stored) {
  const hash = await hashPassword(password, stored.salt);
  let diff = hash.length ^ stored.hash.length;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ stored.hash.charCodeAt(i % stored.hash.length);
  return diff === 0;
}
