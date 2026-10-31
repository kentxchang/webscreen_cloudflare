// ===== 管理者登入與唯讀模式 =====
// 登入後才能編輯與存檔；未登入為唯讀模式（可操作畫面，但不能存檔、不能新增或刪除教材）。
// 真正的權限由伺服器檢查，這裡只負責登入流程與介面。
// 登入憑證存在 sessionStorage：重新整理不用重登，關閉分頁就登出。
let authToken = sessionStorage.getItem('authToken') || '';
let authRole = ''; // 'admin'、'master'（管理者）、''（唯讀）

function isEditor() {
    return authRole === 'admin' || authRole === 'master';
}

function authHeaders() {
    return authToken ? { Authorization: 'Bearer ' + authToken } : {};
}

async function authRequest(action, body) {
    const response = await fetch('api/auth/' + action, {
        method: body === undefined ? 'GET' : 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return response.json();
}

function setAuth(token, role) {
    authToken = token;
    authRole = role;
    sessionStorage.setItem('authToken', token);
    applyAuthMode();
}

function clearAuth() {
    authToken = '';
    authRole = '';
    sessionStorage.removeItem('authToken');
    applyAuthMode();
}

// 重新整理頁面後，用保存的憑證恢復登入狀態
async function restoreAuthSession() {
    if (!authToken) return false;
    try {
        const result = await authRequest('me');
        if (result.success) {
            authRole = result.role;
            applyAuthMode();
            return true;
        }
    } catch (e) { /* 視為未登入 */ }
    clearAuth();
    return false;
}

async function logout() {
    try {
        await authRequest('logout', {});
    } catch (e) { /* 伺服器端憑證會自動過期 */ }
    clearAuth();
}

function applyAuthMode() {
    document.body.classList.toggle('read-only', !isEditor());
    document.body.classList.toggle('role-master', authRole === 'master');
    const roleEl = document.getElementById('auth-role-text');
    if (roleEl) roleEl.textContent = isEditor() ? '管理者' : '唯讀';
}

// 需要編輯權限的操作先呼叫；唯讀時提示並開啟登入，回傳 false
function requireEditor() {
    if (isEditor()) return true;
    alert('目前是唯讀模式，請先登入管理者才能進行這個操作。');
    openLoginDialog();
    return false;
}

// 伺服器回應需要登入（未登入或登入已過期）時呼叫
function handleNeedLogin(result) {
    if (!result || !result.needLogin) return false;
    clearAuth();
    alert('登入已過期或尚未登入，請重新登入管理者。');
    openLoginDialog();
    return true;
}

applyAuthMode();
