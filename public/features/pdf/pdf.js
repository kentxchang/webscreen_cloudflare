// ===== PDF 閱讀器 =====
// 上傳或連結的 PDF 每頁轉成 JPEG 圖片，存在目前畫面的狀態中（隨雲端存檔存入資料庫）
// 管理介面是獨立圖層；每個 PDF 可個別決定是否以視窗放到畫面上
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let pdfJsLoading = null;

// 第一次加入 PDF 時才載入 pdf.js（約 300 KB），加快網頁開啟速度
function loadPdfJs() {
    if (!pdfJsLoading) {
        pdfJsLoading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = PDFJS_URL;
            script.onload = () => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                resolve();
            };
            script.onerror = () => {
                pdfJsLoading = null;
                reject(new Error('無法載入 PDF 元件，請檢查網路連線'));
            };
            document.head.appendChild(script);
        });
    }
    return pdfJsLoading;
}

let pdfItems = []; // { id, name, url, pages: [JPEG dataURL], page, scale, links: [{ page, x, y, w, h, url }] }
// links 的 x、y、w、h 是佔頁面寬高的比例（0～1），與顯示大小無關
const pdfViews = {}; // 畫面上視窗的暫存資料（不存檔）：{ img, token }
let activePdfId = null; // 鍵盤換頁的對象（最後操作的 PDF 視窗）

// ===== 管理圖層 =====
function openPdfLayer() {
    renderPdfItems();
    document.getElementById('pdf-layer').classList.add('active');
}

function closePdfLayer() {
    document.getElementById('pdf-layer').classList.remove('active');
}

function setPdfStatus(text) {
    document.getElementById('pdf-status').textContent = text;
}

function pdfItemSize(item) {
    return item.pages.reduce((sum, page) => sum + page.length, 0);
}

// 讀取 PDF 並把每頁轉成圖片（寬 1024 像素 JPEG，單頁壓縮到約 1MB 以下）
async function convertPdfToImages(source, onProgress) {
    await loadPdfJs();
    const doc = await pdfjsLib.getDocument(source).promise;
    const pages = [];

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);

        // 計算縮放比例，使寬度為 1024px
        const originalViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 1024 / originalViewport.width });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;

        // 壓縮圖片到 1MB 以下
        let quality = 0.9;
        let imageData = canvas.toDataURL('image/jpeg', quality);
        while (imageData.length > 1024 * 1024 && quality > 0.1) {
            quality -= 0.1;
            imageData = canvas.toDataURL('image/jpeg', quality);
        }

        pages.push(imageData);
        onProgress(i, doc.numPages);
    }
    return pages;
}

async function addPdfItem(name, source, url) {
    const pages = await convertPdfToImages(source, (i, total) => {
        setPdfStatus('「' + name + '」轉換中 ' + i + ' / ' + total + '...');
    });
    const item = {
        id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6),
        name: name,
        url: url || '',
        pages: pages,
        page: 1,
        scale: 1
    };
    pdfItems.push(item);
    renderPdfItems();
    setPdfStatus('已加入「' + name + '」，共 ' + pages.length + ' 頁，約 ' + formatBytes(pdfItemSize(item)));
}

async function addPdfFiles(files) {
    if (!requireEditor()) return;
    for (const file of files) {
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) continue;
        const name = file.name.replace(/\.pdf$/i, '');
        try {
            await addPdfItem(name, new Uint8Array(await file.arrayBuffer()));
        } catch (err) {
            setPdfStatus('');
            alert('無法載入「' + name + '」：' + err.message);
        }
    }
}

function uploadPdfFiles(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';
    addPdfFiles(files);
}

async function addPdfFromUrl() {
    if (!requireEditor()) return;
    const urlInput = document.getElementById('pdf-add-url');
    const nameInput = document.getElementById('pdf-add-name');
    const url = urlInput.value.trim();
    if (!url) {
        alert('請輸入 PDF 網址');
        return;
    }
    const name = nameInput.value.trim() ||
        decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'PDF').replace(/\.pdf$/i, '');

    try {
        await addPdfItem(name, url, url);
        urlInput.value = '';
        nameInput.value = '';
    } catch (err) {
        setPdfStatus('');
        alert('無法載入 PDF：' + err.message + '\n（該網址的伺服器可能不允許跨網域讀取）');
    }
}

function renderPdfItems() {
    const listEl = document.getElementById('pdf-item-list');
    listEl.innerHTML = '';
    document.getElementById('pdf-item-count').textContent = pdfItems.length;
    document.getElementById('pdf-total-size').textContent =
        formatBytes(pdfItems.reduce((sum, item) => sum + pdfItemSize(item), 0));

    pdfItems.forEach(item => {
        const onScreen = !!document.getElementById('pdf-modal-' + item.id);
        const row = document.createElement('div');
        row.className = 'manage-item';
        row.innerHTML = `
            <div class="manage-item-info">
                <div class="manage-item-name"></div>
                <div class="manage-item-state ${onScreen ? 'on-screen' : ''}">
                    ${item.pages.length} 頁・約 ${formatBytes(pdfItemSize(item))}・${item.links && item.links.length ? item.links.length + ' 個連結・' : ''}${onScreen ? '● 已在畫面上' : '未放到畫面'}
                </div>
            </div>
            <div class="manage-item-actions">
                <button style="background:${onScreen ? '#999' : '#667eea'};">${onScreen ? '從畫面移除' : '放到畫面'}</button>
                <button style="background:#28ca41;">下載壓縮 PDF</button>
                <button class="edit-only" style="background:#f0a020;">改名</button>
                <button class="edit-only" style="background:#ff5f57;">刪除</button>
            </div>
        `;
        const nameEl = row.querySelector('.manage-item-name');
        nameEl.textContent = item.name;
        nameEl.title = item.url;
        const [screenBtn, downloadBtn, renameBtn, deleteBtn] = row.querySelectorAll('button');
        screenBtn.onclick = () => togglePdfOnScreen(item.id);
        downloadBtn.onclick = () => downloadPdfItem(item.id);
        renameBtn.onclick = () => renamePdfItem(item.id);
        deleteBtn.onclick = () => deletePdfItem(item.id);
        listEl.appendChild(row);
    });
}

function renamePdfItem(id) {
    if (!requireEditor()) return;
    const item = pdfItems.find(p => p.id === id);
    if (!item) return;
    const name = prompt('輸入新名稱', item.name);
    if (!name || !name.trim()) return;

    item.name = name.trim();
    const modal = document.getElementById('pdf-modal-' + id);
    if (modal) modal.querySelector('.modal-title').textContent = item.name;
    renderPdfItems();
}

function deletePdfItem(id) {
    if (!requireEditor()) return;
    const item = pdfItems.find(p => p.id === id);
    if (!item || !confirm('確定要刪除「' + item.name + '」嗎？')) return;

    pdfItems = pdfItems.filter(p => p.id !== id);
    const modal = document.getElementById('pdf-modal-' + id);
    if (modal) modal.remove();
    renderPdfItems();
}

// ===== 下載壓縮後的 PDF：把每頁 JPEG 重新組成 PDF =====
async function downloadPdfItem(id) {
    const item = pdfItems.find(p => p.id === id);
    if (!item) return;

    const pages = await Promise.all(item.pages.map(async (src, index) => {
        const img = await loadImage(src);
        const binary = atob(src.split(',')[1]);
        const data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
        const links = (item.links || []).filter(link => link.page === index + 1);
        return { width: img.naturalWidth, height: img.naturalHeight, data: data, links: links };
    }));

    const a = document.createElement('a');
    a.href = URL.createObjectURL(buildPdfFromJpegs(pages));
    a.download = item.name + '（壓縮）.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 每頁放一張 JPEG（DCTDecode），頁面大小以 96 DPI 換算成 PDF 點數；設定的超連結區塊寫成 Link 註解
function buildPdfFromJpegs(pages) {
    const encoder = new TextEncoder();
    const parts = [];
    const offsets = [];
    let length = 0;
    const push = chunk => {
        const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
        parts.push(bytes);
        length += bytes.length;
    };
    const addObject = (id, writeBody) => {
        offsets[id] = length;
        push(id + ' 0 obj\n');
        writeBody();
        push('\nendobj\n');
    };

    // 物件編號：1 目錄、2 頁面樹，之後每頁 3 個（頁面、圖片、內容），最後是各頁的超連結註解
    const pageIds = pages.map((_, i) => 3 + i * 3);
    let nextId = 3 + pages.length * 3;
    const annotIds = pages.map(page => (page.links || []).map(() => nextId++));
    push('%PDF-1.4\n');
    addObject(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    addObject(2, () => push('<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>'));

    pages.forEach((page, i) => {
        const id = pageIds[i];
        const w = (page.width * 0.75).toFixed(2);
        const h = (page.height * 0.75).toFixed(2);
        const content = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q';
        const annots = annotIds[i].length ? ' /Annots [' + annotIds[i].map(a => a + ' 0 R').join(' ') + ']' : '';
        addObject(id, () => push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] ' +
            '/Resources << /XObject << /Im0 ' + (id + 1) + ' 0 R >> >> /Contents ' + (id + 2) + ' 0 R' + annots + ' >>'));
        addObject(id + 1, () => {
            push('<< /Type /XObject /Subtype /Image /Width ' + page.width + ' /Height ' + page.height +
                ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.data.length + ' >>\nstream\n');
            push(page.data);
            push('\nendstream');
        });
        addObject(id + 2, () => push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'));

        // 區塊位置是頁面比例；PDF 座標原點在左下角
        (page.links || []).forEach((link, j) => {
            const x1 = (link.x * w).toFixed(2);
            const x2 = ((link.x + link.w) * w).toFixed(2);
            const y1 = ((1 - link.y - link.h) * h).toFixed(2);
            const y2 = ((1 - link.y) * h).toFixed(2);
            addObject(annotIds[i][j], () => push('<< /Type /Annot /Subtype /Link /Rect [' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y2 + '] ' +
                '/Border [0 0 0] /A << /Type /Action /S /URI /URI (' + pdfUriString(link.url) + ') >> >>'));
        });
    });

    const total = nextId - 1;
    const xref = length;
    push('xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n');
    for (let id = 1; id <= total; id++) push(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    push('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    return new Blob(parts, { type: 'application/pdf' });
}

// PDF 的 URI 必須是 ASCII：中文等字元先做網址編碼，再跳脫 PDF 字串的特殊字元
function pdfUriString(url) {
    return url.replace(/[^\x20-\x7e]+/g, c => encodeURIComponent(c)).replace(/[\\()]/g, c => '\\' + c);
}

// ===== 畫面上的 PDF 視窗 =====
function togglePdfOnScreen(id) {
    const existing = document.getElementById('pdf-modal-' + id);
    if (existing) {
        existing.remove();
    } else {
        const item = pdfItems.find(p => p.id === id);
        if (!item) return;
        openModal(createPdfModal(item).id);
        activePdfId = id;
    }
    renderPdfItems();
}

function createPdfModal(item) {
    const modal = document.createElement('div');
    modal.className = 'modal pdf-window';
    modal.id = 'pdf-modal-' + item.id;
    modal.style.width = '850px';
    modal.style.height = '650px';
    modal.innerHTML = `
        <div class="modal-header">
            <div class="window-controls">
                <button class="window-btn close" onclick="removePdfModal(this)"></button>
                <button class="window-btn minimize" onclick="minimizeModal(this)"></button>
                <button class="window-btn maximize" onclick="maximizeModal(this)"></button>
            </div>
            <div class="modal-title"></div>
        </div>
        <div class="modal-content">
            <div class="pdf-viewer">
                <div class="pdf-stage">
                    <canvas class="pdf-page"></canvas>
                    <div class="pdf-link-layer"></div>
                </div>
            </div>
            <div class="pdf-laser"></div>
            <div class="pdf-link-hint">在頁面上拖曳拉出區塊，輸入網址即可設定超連結；點區塊可修改網址，按 ✕ 刪除。</div>
            <div class="pdf-play-bar">
                <div class="pdf-play-tools">
                    <button data-act="prev" title="上一頁（←）">◀</button>
                    <span class="pdf-page-info"></span>
                    <button data-act="next" title="下一頁（→）">▶</button>
                    <span class="pdf-play-divider"></span>
                    <button data-act="zoom-out" title="縮小">－</button>
                    <span class="pdf-zoom-info"></span>
                    <button data-act="zoom-in" title="放大">＋</button>
                    <button data-act="fit" title="符合框架">符合</button>
                    <span class="pdf-play-divider"></span>
                    <button data-act="laser" class="pdf-laser-btn" title="雷射筆">🔴 雷射筆</button>
                    <button data-act="link" class="pdf-link-btn edit-only" title="在頁面上拉出區塊設定超連結">🔗 設定連結</button>
                    <button data-act="play" class="pdf-play-btn" title="全螢幕播放（Esc 離開）">▶ 播放</button>
                    <button data-act="collapse" title="收合工具列">▾ 收合</button>
                </div>
                <button class="pdf-play-expand" data-act="collapse" title="展開工具列">▴ PDF 工具</button>
            </div>
        </div>
    `;
    modal.querySelector('.modal-title').textContent = item.name;
    document.body.appendChild(modal);

    const viewer = modal.querySelector('.pdf-viewer');
    const laser = modal.querySelector('.pdf-laser');

    modal.querySelector('.pdf-play-bar').addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (btn) pdfAction(item.id, btn.dataset.act);
    });
    modal.addEventListener('pointerdown', () => { activePdfId = item.id; });

    // 點擊框架左右兩側換頁（雷射筆、設定連結時不換頁）
    const sideOf = e => {
        const rect = viewer.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        return x < 0.3 ? -1 : x > 0.7 ? 1 : 0;
    };
    viewer.addEventListener('click', e => {
        if (modal.classList.contains('pdf-laser-on') || modal.classList.contains('pdf-link-mode')) return;
        const side = sideOf(e);
        if (side) changePdfPage(item.id, side);
    });
    viewer.addEventListener('pointermove', e => {
        if (modal.classList.contains('pdf-laser-on')) {
            const rect = modal.querySelector('.modal-content').getBoundingClientRect();
            laser.style.left = (e.clientX - rect.left) + 'px';
            laser.style.top = (e.clientY - rect.top) + 'px';
            laser.classList.add('visible');
        } else if (!modal.classList.contains('pdf-link-mode')) {
            const side = sideOf(e);
            viewer.style.cursor = side < 0 ? 'w-resize' : side > 0 ? 'e-resize' : '';
        }
    });
    viewer.addEventListener('pointerleave', () => laser.classList.remove('visible'));
    initPdfLinkDrawing(item.id, modal);

    // 框架大小改變（調整視窗、最大化、播放模式）時重新符合框架
    new ResizeObserver(() => drawPdfItem(item.id)).observe(viewer);

    pdfViews[item.id] = { img: null, token: 0 };
    renderPdfItemPage(item.id);
    return modal;
}

function removePdfModal(btn) {
    btn.closest('.modal').remove();
    renderPdfItems();
}

// 還原存檔時，依視窗 ID 重建 PDF 視窗
function createPdfModalById(modalId) {
    if (!modalId.startsWith('pdf-modal-')) return null;
    const item = pdfItems.find(p => 'pdf-modal-' + p.id === modalId);
    return item ? createPdfModal(item) : null;
}

// 舊版存檔只有一份 PDF（inputs.pdfPageImages），轉成清單中的一個項目
function restorePdfItems(items, inputs) {
    pdfItems = items || [];
    if (!items && inputs && inputs.pdfPageImages && inputs.pdfPageImages.length > 0) {
        pdfItems = [{
            id: 'p' + Date.now(),
            name: 'PDF',
            url: inputs.pdfUrl || '',
            pages: inputs.pdfPageImages,
            page: 1,
            scale: 1
        }];
    }
    renderPdfItems();
    setPdfStatus('');
}

function pdfAction(id, act) {
    const item = pdfItems.find(p => p.id === id);
    const modal = document.getElementById('pdf-modal-' + id);
    if (!item || !modal) return;

    if (act === 'prev') changePdfPage(id, -1);
    if (act === 'next') changePdfPage(id, 1);
    if (act === 'zoom-out') setPdfItemZoom(id, item.scale - 0.1);
    if (act === 'zoom-in') setPdfItemZoom(id, item.scale + 0.1);
    if (act === 'fit') setPdfItemZoom(id, 1);
    if (act === 'laser') {
        const on = modal.classList.toggle('pdf-laser-on');
        modal.querySelector('.pdf-laser-btn').classList.toggle('active', on);
        if (!on) modal.querySelector('.pdf-laser').classList.remove('visible');
        if (on) setPdfLinkMode(modal, item, false);
    }
    if (act === 'link') {
        if (!modal.classList.contains('pdf-link-mode') && !requireEditor()) return;
        setPdfLinkMode(modal, item, !modal.classList.contains('pdf-link-mode'));
    }
    if (act === 'play') setPdfPlaying(modal, !modal.classList.contains('pdf-playing'));
    if (act === 'collapse') modal.querySelector('.pdf-play-bar').classList.toggle('collapsed');
}

// ===== 頁面上的超連結區塊 =====
// 設定連結模式：在頁面上拖曳拉出區塊並輸入網址；一般模式：點區塊在新視窗開啟連結
function setPdfLinkMode(modal, item, on) {
    modal.classList.toggle('pdf-link-mode', on);
    const btn = modal.querySelector('.pdf-link-btn');
    btn.classList.toggle('active', on);
    btn.textContent = on ? '✓ 完成連結' : '🔗 設定連結';
    if (on) {
        modal.classList.remove('pdf-laser-on');
        modal.querySelector('.pdf-laser-btn').classList.remove('active');
        modal.querySelector('.pdf-laser').classList.remove('visible');
    }
    modal.querySelector('.pdf-viewer').style.cursor = on ? 'crosshair' : '';
    renderPdfLinks(item.id);
}

// 詢問網址：取消回傳 null，留空回傳 ''；只接受 http、https、mailto
function askPdfLinkUrl(current) {
    const input = prompt('輸入超連結網址（留空則刪除）', current || 'https://');
    if (input === null) return null;
    let url = input.trim();
    if (!url || url === 'https://') return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
    if (!/^(https?|mailto):/i.test(url)) {
        alert('只支援 http、https 或 mailto 開頭的網址');
        return null;
    }
    return url;
}

function renderPdfLinks(id) {
    const item = pdfItems.find(p => p.id === id);
    const modal = document.getElementById('pdf-modal-' + id);
    if (!item || !modal) return;
    const layer = modal.querySelector('.pdf-link-layer');
    const editing = modal.classList.contains('pdf-link-mode');
    layer.innerHTML = '';

    (item.links || []).filter(link => link.page === item.page).forEach(link => {
        const a = document.createElement('a');
        a.className = 'pdf-link';
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = link.url;
        a.style.left = link.x * 100 + '%';
        a.style.top = link.y * 100 + '%';
        a.style.width = link.w * 100 + '%';
        a.style.height = link.h * 100 + '%';

        if (editing) {
            a.innerHTML = '<span class="pdf-link-url"></span><button class="pdf-link-delete" title="刪除連結">✕</button>';
            a.querySelector('.pdf-link-url').textContent = link.url;
            a.onclick = e => {
                e.preventDefault();
                e.stopPropagation();
                const url = e.target.closest('.pdf-link-delete') ? '' : askPdfLinkUrl(link.url);
                if (url === null) return;
                if (url) link.url = url;
                else item.links = item.links.filter(l => l !== link);
                renderPdfLinks(id);
            };
        } else {
            a.onclick = e => e.stopPropagation(); // 點連結不觸發換頁
        }
        layer.appendChild(a);
    });
}

// 設定連結模式下，在頁面上拖曳拉出區塊
function initPdfLinkDrawing(id, modal) {
    const stage = modal.querySelector('.pdf-stage');
    let start = null;
    let box = null;

    const pointOf = e => {
        const rect = stage.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
        };
    };
    const rectOf = (a, b) => ({
        x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
        w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y)
    });

    stage.addEventListener('pointerdown', e => {
        if (!modal.classList.contains('pdf-link-mode') || e.target.closest('.pdf-link')) return;
        e.preventDefault();
        stage.setPointerCapture(e.pointerId);
        start = pointOf(e);
        box = document.createElement('div');
        box.className = 'pdf-link pdf-link-drawing';
        modal.querySelector('.pdf-link-layer').appendChild(box);
    });

    stage.addEventListener('pointermove', e => {
        if (!start) return;
        const r = rectOf(start, pointOf(e));
        box.style.left = r.x * 100 + '%';
        box.style.top = r.y * 100 + '%';
        box.style.width = r.w * 100 + '%';
        box.style.height = r.h * 100 + '%';
    });

    stage.addEventListener('pointerup', e => {
        if (!start) return;
        const r = rectOf(start, pointOf(e));
        start = null;
        const rect = stage.getBoundingClientRect();
        // 太小的區塊視為誤觸
        if (r.w * rect.width >= 10 && r.h * rect.height >= 10) {
            const url = askPdfLinkUrl('');
            const item = pdfItems.find(p => p.id === id);
            if (url && item) {
                item.links = item.links || [];
                const round = v => Math.round(v * 10000) / 10000;
                item.links.push({ page: item.page, x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h), url: url });
            }
        }
        renderPdfLinks(id);
    });

    stage.addEventListener('pointercancel', () => {
        start = null;
        renderPdfLinks(id);
    });
}

// 播放：使用瀏覽器全螢幕（隱藏瀏覽器的分頁與網址列）；瀏覽器不允許時只在網頁內佔滿
function setPdfPlaying(modal, playing) {
    modal.classList.toggle('pdf-playing', playing);
    modal.classList.remove('minimized');
    modal.querySelector('.pdf-play-btn').textContent = playing ? '✕ 離開' : '▶ 播放';

    if (playing && !document.fullscreenElement && modal.requestFullscreen) {
        modal.requestFullscreen().catch(() => {});
    } else if (!playing && document.fullscreenElement === modal) {
        document.exitFullscreen().catch(() => {});
    }
}

// 用 Esc 或瀏覽器按鈕離開全螢幕時，同步結束播放模式
document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) return;
    document.querySelectorAll('.modal.pdf-playing').forEach(modal => setPdfPlaying(modal, false));
});

function changePdfPage(id, delta) {
    const item = pdfItems.find(p => p.id === id);
    if (!item) return;
    const page = Math.max(1, Math.min(item.pages.length, item.page + delta));
    if (page === item.page) return;
    item.page = page;
    renderPdfItemPage(id);
}

function setPdfItemZoom(id, scale) {
    const item = pdfItems.find(p => p.id === id);
    if (!item) return;
    item.scale = Math.round(Math.max(0.5, Math.min(3, scale)) * 10) / 10;
    drawPdfItem(id);
}

function renderPdfItemPage(id) {
    const item = pdfItems.find(p => p.id === id);
    const modal = document.getElementById('pdf-modal-' + id);
    const view = pdfViews[id];
    if (!item || !modal || !view || item.pages.length === 0) return;

    item.page = Math.max(1, Math.min(item.pages.length, item.page || 1));
    modal.querySelector('.pdf-page-info').textContent = item.page + ' / ' + item.pages.length;
    renderPdfLinks(id);

    const token = ++view.token;
    const img = new Image();
    img.onload = function() {
        if (token !== view.token) return; // 快速翻頁時只畫最後一頁
        view.img = img;
        drawPdfItem(id);
    };
    img.src = item.pages[item.page - 1];
}

// 依框架大小計算「符合框架」的尺寸，再乘上縮放比例
function drawPdfItem(id) {
    const item = pdfItems.find(p => p.id === id);
    const modal = document.getElementById('pdf-modal-' + id);
    const view = pdfViews[id];
    if (!item || !modal || !view) return;

    modal.querySelector('.pdf-zoom-info').textContent = Math.round((item.scale || 1) * 100) + '%';

    const img = view.img;
    const viewer = modal.querySelector('.pdf-viewer');
    if (!img || viewer.clientWidth === 0) return; // 視窗未顯示時不畫

    const fit = Math.min(viewer.clientWidth / img.width, viewer.clientHeight / img.height);
    const width = Math.floor(img.width * fit * (item.scale || 1));
    const height = Math.floor(img.height * fit * (item.scale || 1));
    const dpr = window.devicePixelRatio || 1;

    const canvas = modal.querySelector('.pdf-page');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
}

// 鍵盤：← → / PageUp PageDown 換頁（播放中的 PDF 優先，否則為最後操作的 PDF 視窗），Esc 離開播放
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.pdf-playing').forEach(modal => setPdfPlaying(modal, false));
        return;
    }

    const delta = { ArrowLeft: -1, PageUp: -1, ArrowRight: 1, PageDown: 1 }[e.key];
    if (!delta || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;

    const playing = document.querySelector('.modal.pdf-playing');
    const id = playing ? playing.id.slice('pdf-modal-'.length)
        : document.getElementById('pdf-modal-' + activePdfId) ? activePdfId : null;
    if (!id) return;

    e.preventDefault();
    changePdfPage(id, delta);
});

// ===== PDF 拖曳上傳（拖到管理圖層） =====
function initDragAndDrop() {
    const panel = document.getElementById('pdf-layer-panel');

    panel.addEventListener('dragover', e => {
        e.preventDefault();
        panel.classList.add('dragover');
    });

    panel.addEventListener('dragleave', () => {
        panel.classList.remove('dragover');
    });

    panel.addEventListener('drop', e => {
        e.preventDefault();
        panel.classList.remove('dragover');
        addPdfFiles(Array.from(e.dataTransfer.files));
    });
}
