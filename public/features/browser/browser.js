// ===== 網頁 =====
// 網頁清單存在目前畫面的狀態中（隨雲端存檔存入資料庫）
// 管理介面是獨立圖層；每個網頁可個別決定是否以視窗放到畫面上，可同時放多個
let webItems = []; // { id, name, url }

function openWebLayer() {
    renderWebItems();
    document.getElementById('web-layer').classList.add('active');
}

function closeWebLayer() {
    document.getElementById('web-layer').classList.remove('active');
}

function setWebStatus(text) {
    document.getElementById('web-status').textContent = text;
}

// YouTube 網址轉成嵌入格式，沒有 http 開頭時補上 https://
function normalizeWebUrl(url) {
    if (url.includes('youtube.com/watch')) {
        const videoId = url.split('v=')[1]?.split('&')[0];
        if (videoId) url = 'https://www.youtube.com/embed/' + videoId;
    } else if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1]?.split('?')[0];
        if (videoId) url = 'https://www.youtube.com/embed/' + videoId;
    }

    if (!url.startsWith('http')) url = 'https://' + url;
    return url;
}

function addWebItem(name, url) {
    if (!name) {
        try {
            name = new URL(url).hostname;
        } catch (e) {
            name = url;
        }
    }
    webItems.push({
        id: 'w' + Date.now() + Math.random().toString(36).slice(2, 6),
        name: name,
        url: url
    });
    renderWebItems();
    setWebStatus('已加入「' + name + '」');
}

function addWebFromUrl() {
    if (!requireEditor()) return;
    const urlInput = document.getElementById('web-add-url');
    const nameInput = document.getElementById('web-add-name');
    const url = urlInput.value.trim();
    if (!url) {
        alert('請輸入網址');
        return;
    }

    addWebItem(nameInput.value.trim(), normalizeWebUrl(url));
    urlInput.value = '';
    nameInput.value = '';
}

// 從 iframe 嵌入碼取出 src
function addWebFromEmbed() {
    if (!requireEditor()) return;
    const codeInput = document.getElementById('web-embed-code');
    const nameInput = document.getElementById('web-embed-name');
    const srcMatch = codeInput.value.match(/src=["']([^"']+)["']/);
    if (!srcMatch) {
        alert('無法解析 iframe 嵌入碼，請確認格式正確');
        return;
    }

    addWebItem(nameInput.value.trim(), srcMatch[1]);
    codeInput.value = '';
    nameInput.value = '';
}

function renderWebItems() {
    const listEl = document.getElementById('web-item-list');
    listEl.innerHTML = '';
    document.getElementById('web-item-count').textContent = webItems.length;

    webItems.forEach(item => {
        const onScreen = !!document.getElementById('web-modal-' + item.id);
        const row = document.createElement('div');
        row.className = 'manage-item';
        row.innerHTML = `
            <div class="manage-item-info">
                <div class="manage-item-name"></div>
                <div class="web-item-url"></div>
                <div class="manage-item-state ${onScreen ? 'on-screen' : ''}">${onScreen ? '● 已在畫面上' : '未放到畫面'}</div>
            </div>
            <div class="manage-item-actions">
                <button style="background:${onScreen ? '#999' : '#667eea'};">${onScreen ? '從畫面移除' : '放到畫面'}</button>
                <button style="background:#28ca41;">新分頁</button>
                <button class="edit-only" style="background:#f0a020;">改名</button>
                <button class="edit-only" style="background:#ff5f57;">刪除</button>
            </div>
        `;
        row.querySelector('.manage-item-name').textContent = item.name;
        row.querySelector('.web-item-url').textContent = item.url;
        const [screenBtn, tabBtn, renameBtn, deleteBtn] = row.querySelectorAll('button');
        screenBtn.onclick = () => toggleWebOnScreen(item.id);
        tabBtn.onclick = () => window.open(item.url, '_blank', 'noopener');
        renameBtn.onclick = () => renameWebItem(item.id);
        deleteBtn.onclick = () => deleteWebItem(item.id);
        listEl.appendChild(row);
    });
}

function toggleWebOnScreen(id) {
    const existing = document.getElementById('web-modal-' + id);
    if (existing) {
        existing.remove();
    } else {
        const item = webItems.find(w => w.id === id);
        if (!item) return;
        openModal(createWebModal(item).id);
    }
    renderWebItems();
}

function createWebModal(item) {
    const modal = document.createElement('div');
    modal.className = 'modal web-window';
    modal.id = 'web-modal-' + item.id;
    modal.style.width = '850px';
    modal.style.height = '600px';
    modal.innerHTML = `
        <div class="modal-header">
            <div class="window-controls">
                <button class="window-btn close" onclick="removeWebModal(this)"></button>
                <button class="window-btn minimize" onclick="minimizeModal(this)"></button>
                <button class="window-btn maximize" onclick="maximizeModal(this)"></button>
            </div>
            <div class="modal-title"></div>
        </div>
        <div class="modal-content">
            <iframe class="web-frame" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
        </div>
    `;
    modal.querySelector('.modal-title').textContent = item.name;
    modal.querySelector('.web-frame').src = item.url;
    document.body.appendChild(modal);
    return modal;
}

function removeWebModal(btn) {
    btn.closest('.modal').remove();
    renderWebItems();
}

// 還原存檔時，依視窗 ID 重建網頁視窗
function createWebModalById(modalId) {
    if (!modalId.startsWith('web-modal-')) return null;
    const item = webItems.find(w => 'web-modal-' + w.id === modalId);
    return item ? createWebModal(item) : null;
}

function renameWebItem(id) {
    if (!requireEditor()) return;
    const item = webItems.find(w => w.id === id);
    if (!item) return;
    const name = prompt('輸入新名稱', item.name);
    if (!name || !name.trim()) return;

    item.name = name.trim();
    const modal = document.getElementById('web-modal-' + id);
    if (modal) modal.querySelector('.modal-title').textContent = item.name;
    renderWebItems();
}

function deleteWebItem(id) {
    if (!requireEditor()) return;
    const item = webItems.find(w => w.id === id);
    if (!item || !confirm('確定要刪除「' + item.name + '」嗎？')) return;

    webItems = webItems.filter(w => w.id !== id);
    const modal = document.getElementById('web-modal-' + id);
    if (modal) modal.remove();
    renderWebItems();
}

// 還原網頁清單；舊版存檔的書籤與網頁瀏覽器中開啟的網址會轉成清單項目
function restoreWebItems(items, state) {
    webItems = items || [];

    if (!items) {
        const legacy = [];
        ((state.data && state.data.bookmarks) || []).forEach(b => legacy.push({ name: b.title, url: normalizeWebUrl(b.url) }));

        const loadedUrl = state.inputs && state.inputs.browserLoadedUrl;
        let loadedItem = null;
        if (loadedUrl) {
            loadedItem = legacy.find(w => w.url === loadedUrl);
            if (!loadedItem) {
                loadedItem = { name: '', url: loadedUrl };
                legacy.push(loadedItem);
            }
        }

        webItems = legacy.map((w, i) => {
            w.id = 'w' + Date.now() + i;
            if (!w.name) {
                try {
                    w.name = new URL(w.url).hostname;
                } catch (e) {
                    w.name = w.url;
                }
            }
            return w;
        });

        // 舊版網頁瀏覽器視窗是開啟的，就把它載入的網頁放回畫面上原本的位置
        const oldWindow = (state.modals || []).find(m => m.id === 'browser-modal');
        if (loadedItem && oldWindow) {
            const modal = createWebModal(loadedItem);
            modal.classList.add('active');
            ['left', 'top', 'width', 'height', 'zIndex'].forEach(key => {
                if (oldWindow[key]) modal.style[key] = oldWindow[key];
            });
            makeDraggable(modal);
            makeResizable(modal);
        }
    }

    renderWebItems();
    setWebStatus('');
}
