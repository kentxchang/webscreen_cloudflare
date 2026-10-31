// ===== 上傳 HTML =====
// 上傳的 HTML 存在目前畫面的狀態中，隨雲端存檔一起存入資料庫
// 管理介面是獨立圖層（不屬於畫面上的物件）；每個 HTML 可個別決定是否以視窗放到畫面上
let htmlItems = []; // { id, name, html }

function openHtmlLayer() {
    renderHtmlItems();
    document.getElementById('html-layer').classList.add('active');
}

function closeHtmlLayer() {
    document.getElementById('html-layer').classList.remove('active');
}

function newHtmlItem(name, html) {
    const item = {
        id: 'h' + Date.now() + Math.random().toString(36).slice(2, 6),
        name: name,
        html: html
    };
    htmlItems.push(item);
    return item;
}

// 上傳多個 HTML 檔案，名稱預設為檔名
async function uploadHtmlFiles(event) {
    if (!requireEditor()) return;
    const files = Array.from(event.target.files);
    event.target.value = '';
    if (files.length === 0) return;

    const texts = await Promise.all(files.map(file => file.text()));
    files.forEach((file, i) => newHtmlItem(file.name.replace(/\.html?$/i, ''), texts[i]));

    renderHtmlItems();
    document.getElementById('html-upload-status').textContent = '已上傳 ' + files.length + ' 個 HTML';
}

// 新增貼上的原始碼
function addPastedHtml() {
    if (!requireEditor()) return;
    const name = document.getElementById('html-upload-name').value.trim();
    const html = document.getElementById('html-upload-code').value;
    if (!name) {
        alert('請輸入名稱');
        return;
    }
    if (!html.trim()) {
        alert('請貼上 HTML 原始碼');
        return;
    }

    newHtmlItem(name, html);
    document.getElementById('html-upload-name').value = '';
    document.getElementById('html-upload-code').value = '';
    renderHtmlItems();
    document.getElementById('html-upload-status').textContent = '已新增「' + name + '」';
}

function isHtmlOnScreen(id) {
    return !!document.getElementById('html-modal-' + id);
}

function renderHtmlItems() {
    const listEl = document.getElementById('html-item-list');
    listEl.innerHTML = '';
    document.getElementById('html-item-count').textContent = htmlItems.length;

    htmlItems.forEach(item => {
        const onScreen = isHtmlOnScreen(item.id);
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
        screenBtn.onclick = () => toggleHtmlOnScreen(item.id);
        shareBtn.onclick = () => shareHtmlItem(item.id);
        renameBtn.onclick = () => renameHtmlItem(item.id);
        deleteBtn.onclick = () => deleteHtmlItem(item.id);
        listEl.appendChild(row);
    });
}

// 放到畫面上（視窗）或從畫面移除
function toggleHtmlOnScreen(id) {
    const existing = document.getElementById('html-modal-' + id);
    if (existing) {
        existing.remove();
    } else {
        const item = htmlItems.find(h => h.id === id);
        if (!item) return;
        openModal(createHtmlModal(item).id);
    }
    renderHtmlItems();
}

function createHtmlModal(item) {
    const modal = document.createElement('div');
    modal.className = 'modal html-window';
    modal.id = 'html-modal-' + item.id;
    modal.style.width = '800px';
    modal.style.height = '600px';
    modal.innerHTML = `
        <div class="modal-header">
            <div class="window-controls">
                <button class="window-btn close" onclick="removeHtmlModal(this)"></button>
                <button class="window-btn minimize" onclick="minimizeModal(this)"></button>
                <button class="window-btn maximize" onclick="maximizeModal(this)"></button>
            </div>
            <div class="modal-title"></div>
        </div>
        <div class="modal-content">
            <iframe class="html-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe>
        </div>
    `;
    modal.querySelector('.modal-title').textContent = item.name;
    modal.querySelector('.html-frame').srcdoc = item.html;
    document.body.appendChild(modal);
    return modal;
}

function removeHtmlModal(btn) {
    btn.closest('.modal').remove();
    renderHtmlItems();
}

// 還原存檔時，依視窗 ID 重建 HTML 視窗
function createHtmlModalById(modalId) {
    if (!modalId.startsWith('html-modal-')) return null;
    const item = htmlItems.find(h => 'html-modal-' + h.id === modalId);
    return item ? createHtmlModal(item) : null;
}

function restoreHtmlItems(items) {
    htmlItems = items || [];
    renderHtmlItems();
    document.getElementById('html-upload-status').textContent = '';
}

// 分享：先更新雲端存檔，再開啟並複製此 HTML 的獨立網址
// 分享：直接開啟並複製此 HTML 的分享網址
// 畫面有尚未存到雲端的變更時先更新存檔（否則分享頁面看不到剛上傳的 HTML）
async function shareHtmlItem(id) {
    if (!currentSaveId) {
        if (isEditor()) {
            closeHtmlLayer();
            cloudUpdate(true); // 會提示先另存新檔並開啟雲端存檔視窗
        } else {
            alert('目前沒有開啟雲端存檔，無法分享。');
        }
        return;
    }

    const unsaved = isEditor() && lastSavedContent !== null &&
        screenFingerprint(JSON.stringify(collectCurrentState())) !== lastSavedContent;
    if (unsaved && !await cloudUpdate(true)) return;

    const url = new URL('h/' + encodeURIComponent(currentSaveId) + '/' + encodeURIComponent(id), window.location.href).href;
    // 沒有未存變更時在點擊當下直接開啟；存檔後才開啟時，少數瀏覽器（如 iPad Safari）可能擋下，改用下方連結
    const opened = window.open(url, '_blank');

    let copied = false;
    try {
        await navigator.clipboard.writeText(url);
        copied = true;
    } catch (e) { /* 無法複製時只顯示網址 */ }

    const statusEl = document.getElementById('html-upload-status');
    statusEl.textContent = (copied ? '已複製分享網址：' : '分享網址：') + url + ' ';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = opened ? '🔗 再次開啟' : '🔗 開啟分享頁面（瀏覽器擋下了新分頁，請點這裡）';
    statusEl.appendChild(link);

    // 分享網址的 QR Code（與「雲端 → 分享」使用相同的 QR Code 服務）
    const item = htmlItems.find(h => h.id === id);
    const qr = document.createElement('div');
    qr.className = 'html-share-qr';
    qr.innerHTML = '<img alt="分享網址的 QR Code"><div class="html-share-qr-caption"></div>';
    qr.querySelector('img').src = 'https://quickchart.io/qr?text=' + encodeURIComponent(url) + '&size=300';
    qr.querySelector('.html-share-qr-caption').textContent = '掃描 QR Code 開啟「' + (item ? item.name : 'HTML') + '」';
    statusEl.appendChild(qr);
}

function renameHtmlItem(id) {
    if (!requireEditor()) return;
    const item = htmlItems.find(h => h.id === id);
    if (!item) return;
    const name = prompt('輸入新名稱', item.name);
    if (!name || !name.trim()) return;

    item.name = name.trim();
    const modal = document.getElementById('html-modal-' + id);
    if (modal) modal.querySelector('.modal-title').textContent = item.name;
    renderHtmlItems();
}

function deleteHtmlItem(id) {
    if (!requireEditor()) return;
    const item = htmlItems.find(h => h.id === id);
    if (!item || !confirm('確定要刪除「' + item.name + '」嗎？')) return;

    htmlItems = htmlItems.filter(h => h.id !== id);
    const modal = document.getElementById('html-modal-' + id);
    if (modal) modal.remove();
    renderHtmlItems();
}
