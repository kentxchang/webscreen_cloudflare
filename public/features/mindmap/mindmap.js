// ===== 心智圖 =====
// 心智圖存在目前畫面的狀態中，隨雲端存檔一起存入資料庫
// 管理介面是獨立圖層；每個心智圖可個別決定是否以視窗放到畫面上
// 視窗中是 mindmap/editor 編輯頁（同網域 iframe），透過 getMindmapItem / updateMindmapData 讀寫這裡的資料
let mindmapItems = []; // { id, name, data: jsMind node_tree 資料, md: 尚未開啟編輯前的 Markdown 內容 }

function openMindmapLayer() {
    renderMindmapItems();
    document.getElementById('mindmap-layer').classList.add('active');
}

function closeMindmapLayer() {
    document.getElementById('mindmap-layer').classList.remove('active');
}

// 新增心智圖：可只輸入名稱（之後在視窗中手動增加節點），或貼上範本格式的 Markdown
function addMindmap() {
    if (!requireEditor()) return;
    const nameInput = document.getElementById('mindmap-new-name');
    const mdInput = document.getElementById('mindmap-new-md');
    const md = mdInput.value.trim();
    const rootLine = md.match(/^#\s+(.+)$/m);
    const name = nameInput.value.trim() || (rootLine ? rootLine[1].trim() : '');
    if (!name) {
        alert('請輸入心智圖名稱');
        return;
    }

    const item = {
        id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
        name: name,
        data: null,
        // 沒有中心主題（# 開頭）時以名稱當中心主題
        md: rootLine ? md : '# ' + name + (md ? '\n' + md : '')
    };
    mindmapItems.push(item);

    nameInput.value = '';
    mdInput.value = '';
    renderMindmapItems();
    document.getElementById('mindmap-status').textContent = '已新增「' + name + '」';
}

async function loadMindmapMdFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    document.getElementById('mindmap-new-md').value = await file.text();
    const nameInput = document.getElementById('mindmap-new-name');
    if (!nameInput.value.trim()) nameInput.value = file.name.replace(/\.(md|txt)$/i, '');
}

function toggleMindmapPrompt() {
    document.getElementById('mindmap-prompt').classList.toggle('active');
}

async function copyMindmapPrompt() {
    try {
        await navigator.clipboard.writeText(document.getElementById('mindmap-prompt-text').textContent);
        document.getElementById('mindmap-status').textContent = 'Prompt 已複製';
    } catch (e) {
        document.getElementById('mindmap-status').textContent = '複製失敗，請手動選取複製';
    }
}

// 編輯頁讀寫資料用
function getMindmapItem(id) {
    return mindmapItems.find(m => m.id === id) || null;
}

function updateMindmapData(id, data) {
    const item = getMindmapItem(id);
    if (!item) return;
    item.data = data;
    delete item.md;
}

function isMindmapOnScreen(id) {
    return !!document.getElementById('mindmap-modal-' + id);
}

function renderMindmapItems() {
    const listEl = document.getElementById('mindmap-item-list');
    listEl.innerHTML = '';
    document.getElementById('mindmap-item-count').textContent = mindmapItems.length;

    mindmapItems.forEach(item => {
        const onScreen = isMindmapOnScreen(item.id);
        const row = document.createElement('div');
        row.className = 'manage-item';
        row.innerHTML = `
            <div class="manage-item-info">
                <div class="manage-item-name"></div>
                <div class="manage-item-state ${onScreen ? 'on-screen' : ''}">${onScreen ? '● 已在畫面上' : '未放到畫面'}</div>
            </div>
            <div class="manage-item-actions">
                <button style="background:${onScreen ? '#999' : '#667eea'};">${onScreen ? '從畫面移除' : '放到畫面'}</button>
                <button style="background:#28ca41;">分享</button>
                <button class="edit-only" style="background:#f0a020;">改名</button>
                <button class="edit-only" style="background:#ff5f57;">刪除</button>
            </div>
        `;
        row.querySelector('.manage-item-name').textContent = item.name;
        const [screenBtn, shareBtn, renameBtn, deleteBtn] = row.querySelectorAll('button');
        screenBtn.onclick = () => toggleMindmapOnScreen(item.id);
        shareBtn.onclick = () => shareMindmapItem(item.id);
        renameBtn.onclick = () => renameMindmapItem(item.id);
        deleteBtn.onclick = () => deleteMindmapItem(item.id);
        listEl.appendChild(row);
    });
}

// 放到畫面上（視窗）或從畫面移除
function toggleMindmapOnScreen(id) {
    const existing = document.getElementById('mindmap-modal-' + id);
    if (existing) {
        existing.remove();
    } else {
        const item = getMindmapItem(id);
        if (!item) return;
        openModal(createMindmapModal(item).id);
    }
    renderMindmapItems();
}

function createMindmapModal(item) {
    const modal = document.createElement('div');
    modal.className = 'modal mindmap-window';
    modal.id = 'mindmap-modal-' + item.id;
    modal.style.width = '900px';
    modal.style.height = '600px';
    modal.innerHTML = `
        <div class="modal-header">
            <div class="window-controls">
                <button class="window-btn close" onclick="removeMindmapModal(this)"></button>
                <button class="window-btn minimize" onclick="minimizeModal(this)"></button>
                <button class="window-btn maximize" onclick="maximizeModal(this)"></button>
            </div>
            <div class="modal-title"></div>
        </div>
        <div class="modal-content">
            <iframe class="mindmap-frame"></iframe>
        </div>
    `;
    modal.querySelector('.modal-title').textContent = item.name;
    modal.querySelector('.mindmap-frame').src = 'mindmap/editor?embed=' + encodeURIComponent(item.id);
    document.body.appendChild(modal);
    return modal;
}

function removeMindmapModal(btn) {
    btn.closest('.modal').remove();
    renderMindmapItems();
}

// 還原存檔時，依視窗 ID 重建心智圖視窗
function createMindmapModalById(modalId) {
    if (!modalId.startsWith('mindmap-modal-')) return null;
    const item = mindmapItems.find(m => 'mindmap-modal-' + m.id === modalId);
    return item ? createMindmapModal(item) : null;
}

function restoreMindmapItems(items) {
    mindmapItems = items || [];
    renderMindmapItems();
    document.getElementById('mindmap-status').textContent = '';
}

// 分享：直接開啟並複製此心智圖的分享網址，同時顯示 QR Code
// 畫面有尚未存到雲端的變更時先更新存檔（否則分享頁面看不到剛建立或修改的心智圖）
async function shareMindmapItem(id) {
    if (!currentSaveId) {
        if (isEditor()) {
            closeMindmapLayer();
            cloudUpdate(true); // 會提示先另存新檔並開啟雲端存檔視窗
        } else {
            alert('目前沒有開啟雲端存檔，無法分享。');
        }
        return;
    }

    const unsaved = isEditor() && lastSavedContent !== null &&
        screenFingerprint(JSON.stringify(collectCurrentState())) !== lastSavedContent;
    if (unsaved && !await cloudUpdate(true)) return;

    const url = new URL('m/' + encodeURIComponent(currentSaveId) + '/' + encodeURIComponent(id), window.location.href).href;
    const opened = window.open(url, '_blank');

    let copied = false;
    try {
        await navigator.clipboard.writeText(url);
        copied = true;
    } catch (e) { /* 無法複製時只顯示網址 */ }

    const statusEl = document.getElementById('mindmap-status');
    statusEl.textContent = (copied ? '已複製分享網址：' : '分享網址：') + url + ' ';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = opened ? '🔗 再次開啟' : '🔗 開啟分享頁面（瀏覽器擋下了新分頁，請點這裡）';
    statusEl.appendChild(link);

    // 與「上傳 HTML」的分享使用相同的 QR Code 樣式
    const item = getMindmapItem(id);
    const qr = document.createElement('div');
    qr.className = 'html-share-qr';
    qr.innerHTML = '<img alt="分享網址的 QR Code"><div class="html-share-qr-caption"></div>';
    qr.querySelector('img').src = 'https://quickchart.io/qr?text=' + encodeURIComponent(url) + '&size=300';
    qr.querySelector('.html-share-qr-caption').textContent = '掃描 QR Code 開啟「' + (item ? item.name : '心智圖') + '」';
    statusEl.appendChild(qr);
}

function renameMindmapItem(id) {
    if (!requireEditor()) return;
    const item = getMindmapItem(id);
    if (!item) return;
    const name = prompt('輸入新名稱', item.name);
    if (!name || !name.trim()) return;

    item.name = name.trim();
    const modal = document.getElementById('mindmap-modal-' + id);
    if (modal) modal.querySelector('.modal-title').textContent = item.name;
    renderMindmapItems();
}

function deleteMindmapItem(id) {
    if (!requireEditor()) return;
    const item = getMindmapItem(id);
    if (!item || !confirm('確定要刪除「' + item.name + '」嗎？')) return;

    mindmapItems = mindmapItems.filter(m => m.id !== id);
    const modal = document.getElementById('mindmap-modal-' + id);
    if (modal) modal.remove();
    renderMindmapItems();
}
