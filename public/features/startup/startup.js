// ===== 啟動選擇圖層 =====
// 流程：網址帶有 ?screen= 時直接開啟該存檔（未登入為唯讀）；
// 否則已登入 → 開新／開舊；未設定密碼 → 設定管理者密碼；已設定 → 登入（或以唯讀開啟舊存檔、開新畫面）
let loginDialogMode = false; // true：在使用中按「登入編輯」開啟的登入畫面，登入後回到目前畫面

async function initStartup() {
    const loggedIn = await restoreAuthSession();
    const screenId = new URLSearchParams(window.location.search).get('screen');
    if (screenId && await cloudLoad(screenId, true)) return;
    if (loggedIn) {
        showStartupChooser();
        return;
    }
    try {
        const status = await authRequest('status');
        if (status.configured) showLoginView(false);
        else showStartupView('startup-setup-view');
    } catch (e) {
        showLoginView(false);
    }
}

function showStartupView(id) {
    document.querySelectorAll('#startup-overlay .startup-view').forEach(view => {
        view.style.display = view.id === id ? 'flex' : 'none';
    });
    document.getElementById('startup-overlay').classList.add('active');
    const input = document.querySelector('#' + id + ' input');
    if (input) setTimeout(() => input.focus(), 50);
}

function showStartupChooser() {
    showStartupView('startup-choose-view');
}

function hideStartupChooser() {
    document.getElementById('startup-overlay').classList.remove('active');
}

// 開舊存檔畫面的「返回」：已登入回到開新／開舊，唯讀回到登入畫面
function startupBack() {
    if (isEditor()) showStartupChooser();
    else showLoginView(false);
}

function showLoginView(dialogMode) {
    loginDialogMode = dialogMode;
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
    // 使用中開啟的登入畫面只需要「取消」；啟動時則提供唯讀模式的兩個選擇
    document.getElementById('login-cancel-btn').style.display = dialogMode ? '' : 'none';
    document.getElementById('login-guest').style.display = dialogMode ? 'none' : '';
    showStartupView('startup-login-view');
}

// 使用中（唯讀模式）按「登入編輯」
function openLoginDialog() {
    showLoginView(true);
}

async function submitSetup(event) {
    event.preventDefault();
    const password = document.getElementById('setup-password').value;
    const confirmPassword = document.getElementById('setup-password-confirm').value;
    const errorEl = document.getElementById('setup-error');
    if (password.length < 4) {
        errorEl.textContent = '密碼至少需要 4 個字元';
        return;
    }
    if (password !== confirmPassword) {
        errorEl.textContent = '兩次輸入的密碼不一樣';
        return;
    }

    try {
        const result = await authRequest('setup', { password: password });
        if (!result.success) throw new Error(result.error);
        setAuth(result.token, result.role);
        showStartupChooser();
    } catch (error) {
        errorEl.textContent = '設定失敗：' + error.message;
    }
}

async function submitLogin(event) {
    event.preventDefault();
    const errorEl = document.getElementById('login-error');
    const button = event.target.querySelector('.startup-primary-btn');
    errorEl.textContent = '';
    button.disabled = true;

    try {
        const result = await authRequest('login', { password: document.getElementById('login-password').value });
        if (!result.success) throw new Error(result.error);
        setAuth(result.token, result.role);
        if (loginDialogMode) {
            hideStartupChooser();
            if (lastSavedContent === null) markScreenSaved();
        } else {
            showStartupChooser();
        }
    } catch (error) {
        errorEl.textContent = error.message;
        document.getElementById('login-password').select();
    }
    button.disabled = false;
}

// 開新畫面：清空計分板、待辦、抽籤、上傳的 HTML、PDF、圖片、網頁等資料
function startNewScreen() {
    applyLoadedState({
        data: { scores: [0, 0, 0, 0, 0, 0], todoItems: [], lotteryDrawn: [] }
    });
    setCurrentSave(null);
    markScreenSaved();
    hideStartupChooser();
}

// 開啟舊存檔：列出雲端存檔
function setStartupListMessage(html, isError) {
    const listEl = document.getElementById('startup-save-list');
    listEl.innerHTML = '<div class="startup-save-message' + (isError ? ' error' : '') + '">' + html + '</div>';
    return listEl.firstChild;
}

async function showStartupLoadView() {
    showStartupView('startup-load-view');
    setStartupListMessage('<div class="startup-spinner"></div>讀取存檔清單中...');

    try {
        const result = await (await fetch(API_BASE)).json();
        if (!result.success) throw new Error(result.error);

        if (result.saves.length === 0) {
            setStartupListMessage('<span class="big">🗂️</span>目前沒有雲端存檔<br>' +
                '<button class="gas-btn gas-btn-primary" onclick="startNewScreen()">✨ 開新畫面</button>');
            return;
        }

        const listEl = document.getElementById('startup-save-list');
        listEl.innerHTML = '';
        result.saves.forEach(save => {
            const card = document.createElement('div');
            card.className = 'startup-save-card';
            card.innerHTML = '<div class="startup-save-icon"></div>' +
                '<div class="startup-save-info"><div class="startup-save-name"></div><div class="startup-save-date"></div></div>' +
                '<div class="startup-save-arrow">›</div>';
            card.querySelector('.startup-save-icon').textContent = save.name.startsWith('自動存檔') ? '🕒' : '🗂️';
            card.querySelector('.startup-save-name').textContent = save.name;
            card.querySelector('.startup-save-date').textContent = '最後更新：' + save.updatedAt;
            card.onclick = async () => {
                if (await cloudLoad(save.id, true)) hideStartupChooser();
            };
            listEl.appendChild(card);
        });
    } catch (error) {
        setStartupListMessage('<span class="big">⚠️</span>', true).append('讀取清單失敗：' + error.message);
    }
}
