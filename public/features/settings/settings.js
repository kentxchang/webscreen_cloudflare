function setToolbarPosition() {
    const position = document.getElementById('toolbar-position').value;
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('left', 'right', 'bottom');
    sidebar.classList.add(position);
    saveSettings();
}

function setDefaultColor() {
    currentColor = document.getElementById('default-color').value;
    setColor(currentColor);
    saveSettings();
}

function setAutoHideSetting() {
    setSidebarAutoHide(document.getElementById('sidebar-autohide').checked);
    saveSettings();
}

function setAutoSave() {
    setAutoSaveInterval(parseInt(document.getElementById('autosave-interval').value));
    saveSettings();
}

function saveSettings() {
    const settings = {
        toolbarPosition: document.getElementById('toolbar-position').value,
        defaultColor: document.getElementById('default-color').value,
        palmRejection: palmRejection,
        autoSaveMinutes: document.getElementById('autosave-interval').value,
        autoHideSidebar: document.getElementById('sidebar-autohide').checked
    };
    localStorage.setItem('appSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        document.getElementById('toolbar-position').value = settings.toolbarPosition || 'left';
        document.getElementById('default-color').value = settings.defaultColor || '#ff0000';
        palmRejection = settings.palmRejection || false;
        document.getElementById('palm-rejection').checked = palmRejection;
        setToolbarPosition();
        setColor(settings.defaultColor || '#ff0000');
        if (settings.autoSaveMinutes !== undefined) {
            document.getElementById('autosave-interval').value = settings.autoSaveMinutes;
        }
        if (settings.autoHideSidebar !== undefined) {
            document.getElementById('sidebar-autohide').checked = settings.autoHideSidebar;
        }
    }
    setAutoSaveInterval(parseInt(document.getElementById('autosave-interval').value));
    setSidebarAutoHide(document.getElementById('sidebar-autohide').checked);
}

// ===== 資料庫使用空間 =====
// Cloudflare Durable Objects（SQLite）免費方案儲存空間上限
const STORAGE_QUOTA = 5 * 1024 * 1024 * 1024;

async function loadStorageUsage() {
    const totalText = document.getElementById('storage-total-text');
    const listEl = document.getElementById('storage-list');
    totalText.textContent = '讀取中...';

    try {
        const result = await (await fetch('api/usage')).json();
        if (!result.success) throw new Error(result.error);
        renderStorageUsage(result);
    } catch (error) {
        totalText.textContent = '讀取失敗：' + error.message;
        listEl.innerHTML = '';
    }
}

function renderStorageUsage(usage) {
    const percent = usage.databaseSize / STORAGE_QUOTA * 100;
    document.getElementById('storage-total-text').textContent =
        '資料庫共 ' + formatBytes(usage.databaseSize) + ' / 免費額度 5 GB（' +
        (percent < 0.01 && percent > 0 ? '< 0.01' : percent.toFixed(2)) + '%），存檔 ' + usage.saves.length + ' 個';
    const bar = document.getElementById('storage-total-bar');
    bar.style.width = Math.min(100, Math.max(percent, usage.databaseSize > 0 ? 0.5 : 0)) + '%';
    bar.classList.toggle('warning', percent >= 80);

    const listEl = document.getElementById('storage-list');
    listEl.innerHTML = '';
    if (usage.saves.length === 0) {
        listEl.innerHTML = '<div class="storage-empty">目前沒有雲端存檔</div>';
        return;
    }

    // 各存檔長條以最大的存檔為 100%
    const maxSize = Math.max(...usage.saves.map(s => s.size), 1);
    usage.saves.forEach(save => {
        const row = document.createElement('div');
        row.className = 'storage-item';
        row.innerHTML = `
            <div class="storage-item-head">
                <span class="storage-item-name"></span>
                <span class="storage-item-size">${formatBytes(save.size)}</span>
                <button class="storage-item-delete edit-only" title="刪除此存檔">刪除</button>
            </div>
            <div class="storage-item-bar"><div class="storage-item-fill" style="width:${save.size / maxSize * 100}%"></div></div>
        `;
        const nameEl = row.querySelector('.storage-item-name');
        nameEl.textContent = save.name + (save.id === currentSaveId ? '（目前開啟）' : '');
        nameEl.title = '更新：' + save.updatedAt;
        row.querySelector('.storage-item-delete').onclick = () => deleteSaveForStorage(save);
        listEl.appendChild(row);
    });
}

async function deleteSaveForStorage(save) {
    if (!requireEditor()) return;
    if (!confirm('確定要刪除存檔「' + save.name + '」（' + formatBytes(save.size) + '）嗎？此操作無法復原。')) return;

    try {
        const result = await (await fetch(API_BASE + '/' + encodeURIComponent(save.id), {
            method: 'DELETE',
            headers: authHeaders()
        })).json();
        if (handleNeedLogin(result)) return;
        if (!result.success) throw new Error(result.error);
        if (save.id === currentSaveId) setCurrentSave(null);
    } catch (error) {
        alert('刪除失敗：' + error.message);
    }
    loadStorageUsage();
}

// ===== 管理者 =====
async function logoutFromSettings() {
    if (!confirm('確定要登出嗎？登出後為唯讀模式。')) return;
    await logout();
    closeModal('settings-modal');
}

// 修改管理者密碼（需有權限，伺服器會檢查）
async function changeAdminPassword() {
    const passwordInput = document.getElementById('new-admin-password');
    const confirmInput = document.getElementById('new-admin-password-confirm');
    const statusEl = document.getElementById('admin-password-status');
    statusEl.style.color = '#e5484d';
    if (passwordInput.value.length < 4) {
        statusEl.textContent = '密碼至少需要 4 個字元';
        return;
    }
    if (passwordInput.value !== confirmInput.value) {
        statusEl.textContent = '兩次輸入的密碼不一樣';
        return;
    }

    try {
        const result = await authRequest('password', { password: passwordInput.value });
        if (handleNeedLogin(result)) return;
        if (!result.success) throw new Error(result.error);
        statusEl.style.color = '#1a7f2e';
        statusEl.textContent = '已修改管理者密碼，其他已登入的管理者需要用新密碼重新登入。';
        passwordInput.value = confirmInput.value = '';
    } catch (error) {
        statusEl.textContent = '修改失敗：' + error.message;
    }
}
