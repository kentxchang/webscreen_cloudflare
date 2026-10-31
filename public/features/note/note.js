// ===== 文字便利貼 =====
// 便利貼存在目前畫面的狀態中，隨雲端存檔一起存入資料庫
// 管理介面是獨立圖層；每張便利貼可個別決定是否以視窗放到畫面上
let noteItems = []; // { id, text, fontSize, color }
let editingNoteId = null; // 正在修改的便利貼，null 表示新增

const NOTE_COLORS = ['#fff59d', '#ffcc80', '#f8bbd0', '#c5e1a5', '#b3e5fc', '#d1c4e9', '#ffffff'];

function openNoteLayer() {
    renderNoteSwatches();
    renderNoteItems();
    document.getElementById('note-layer').classList.add('active');
}

function closeNoteLayer() {
    document.getElementById('note-layer').classList.remove('active');
}

function renderNoteSwatches() {
    const current = document.getElementById('note-color').value;
    const box = document.getElementById('note-swatches');
    box.innerHTML = '';
    NOTE_COLORS.forEach(color => {
        const swatch = document.createElement('button');
        swatch.className = 'note-swatch' + (color === current ? ' active' : '');
        swatch.style.background = color;
        swatch.title = color;
        swatch.onclick = () => selectNoteColor(color);
        box.appendChild(swatch);
    });
}

function selectNoteColor(color) {
    document.getElementById('note-color').value = color;
    renderNoteSwatches();
}

// 第一行當作便利貼的名稱
function noteTitle(item) {
    const firstLine = item.text.split('\n').find(line => line.trim()) || '便利貼';
    return firstLine.trim().slice(0, 30);
}

// 新增或儲存修改
function submitNote() {
    if (!requireEditor()) return;
    const text = document.getElementById('note-text').value;
    if (!text.trim()) {
        alert('請輸入便利貼內容');
        return;
    }
    const fontSize = Math.min(200, Math.max(12, parseInt(document.getElementById('note-font-size').value, 10) || 36));
    const color = document.getElementById('note-color').value;

    let item = noteItems.find(n => n.id === editingNoteId);
    if (item) {
        Object.assign(item, { text: text, fontSize: fontSize, color: color });
        const modal = document.getElementById('note-modal-' + item.id);
        if (modal) applyNoteToModal(modal, item);
        document.getElementById('note-status').textContent = '已修改「' + noteTitle(item) + '」';
    } else {
        item = {
            id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
            text: text,
            fontSize: fontSize,
            color: color
        };
        noteItems.push(item);
        document.getElementById('note-status').textContent = '已新增「' + noteTitle(item) + '」';
    }
    resetNoteForm();
    renderNoteItems();
}

// 清空表單，回到新增模式（保留上次的字體大小與顏色）
function resetNoteForm() {
    editingNoteId = null;
    document.getElementById('note-text').value = '';
    document.getElementById('note-form-title').textContent = '新增便利貼';
    document.getElementById('note-submit-btn').textContent = '＋ 新增便利貼';
    document.getElementById('note-cancel-btn').style.display = 'none';
}

function editNoteItem(id) {
    if (!requireEditor()) return;
    const item = noteItems.find(n => n.id === id);
    if (!item) return;
    editingNoteId = id;
    document.getElementById('note-text').value = item.text;
    document.getElementById('note-font-size').value = item.fontSize;
    selectNoteColor(item.color);
    document.getElementById('note-form-title').textContent = '修改便利貼';
    document.getElementById('note-submit-btn').textContent = '💾 儲存修改';
    document.getElementById('note-cancel-btn').style.display = '';
    document.getElementById('note-text').focus();
}

function isNoteOnScreen(id) {
    return !!document.getElementById('note-modal-' + id);
}

function renderNoteItems() {
    const listEl = document.getElementById('note-item-list');
    listEl.innerHTML = '';
    document.getElementById('note-item-count').textContent = noteItems.length;

    noteItems.forEach(item => {
        const onScreen = isNoteOnScreen(item.id);
        const row = document.createElement('div');
        row.className = 'manage-item';
        row.innerHTML = `
            <div class="note-item-color"></div>
            <div class="manage-item-info">
                <div class="manage-item-name"></div>
                <div class="manage-item-state ${onScreen ? 'on-screen' : ''}">${onScreen ? '● 已在畫面上' : '未放到畫面'}</div>
            </div>
            <div class="manage-item-actions">
                <button style="background:${onScreen ? '#999' : '#667eea'};">${onScreen ? '從畫面移除' : '放到畫面'}</button>
                <button class="edit-only" style="background:#f0a020;">修改</button>
                <button class="edit-only" style="background:#ff5f57;">刪除</button>
            </div>
        `;
        row.querySelector('.note-item-color').style.background = item.color;
        row.querySelector('.manage-item-name').textContent = noteTitle(item);
        const [screenBtn, editBtn, deleteBtn] = row.querySelectorAll('button');
        screenBtn.onclick = () => toggleNoteOnScreen(item.id);
        editBtn.onclick = () => editNoteItem(item.id);
        deleteBtn.onclick = () => deleteNoteItem(item.id);
        listEl.appendChild(row);
    });
}

// 放到畫面上（視窗）或從畫面移除
function toggleNoteOnScreen(id) {
    const existing = document.getElementById('note-modal-' + id);
    if (existing) {
        existing.remove();
    } else {
        const item = noteItems.find(n => n.id === id);
        if (!item) return;
        openModal(createNoteModal(item).id);
    }
    renderNoteItems();
}

function createNoteModal(item) {
    const modal = document.createElement('div');
    modal.className = 'modal note-window';
    modal.id = 'note-modal-' + item.id;
    modal.style.width = '360px';
    modal.style.height = '300px';
    modal.innerHTML = `
        <div class="modal-header">
            <div class="window-controls">
                <button class="window-btn close" onclick="removeNoteModal(this)"></button>
                <button class="window-btn minimize" onclick="minimizeModal(this)"></button>
                <button class="window-btn maximize" onclick="maximizeModal(this)"></button>
            </div>
            <div class="modal-title"></div>
        </div>
        <div class="modal-content">
            <div class="note-body"></div>
        </div>
    `;
    applyNoteToModal(modal, item);
    document.body.appendChild(modal);
    return modal;
}

function applyNoteToModal(modal, item) {
    modal.querySelector('.modal-title').textContent = noteTitle(item);
    modal.style.setProperty('--note-color', item.color);
    const body = modal.querySelector('.note-body');
    body.textContent = item.text;
    body.style.fontSize = item.fontSize + 'px';
}

function removeNoteModal(btn) {
    btn.closest('.modal').remove();
    renderNoteItems();
}

// 還原存檔時，依視窗 ID 重建便利貼視窗
function createNoteModalById(modalId) {
    if (!modalId.startsWith('note-modal-')) return null;
    const item = noteItems.find(n => 'note-modal-' + n.id === modalId);
    return item ? createNoteModal(item) : null;
}

function restoreNoteItems(items) {
    noteItems = items || [];
    resetNoteForm();
    renderNoteItems();
    document.getElementById('note-status').textContent = '';
}

function deleteNoteItem(id) {
    if (!requireEditor()) return;
    const item = noteItems.find(n => n.id === id);
    if (!item || !confirm('確定要刪除「' + noteTitle(item) + '」嗎？')) return;

    noteItems = noteItems.filter(n => n.id !== id);
    if (editingNoteId === id) resetNoteForm();
    const modal = document.getElementById('note-modal-' + id);
    if (modal) modal.remove();
    renderNoteItems();
}
