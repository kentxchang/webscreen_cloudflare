// ===== 圖片 =====
// 上傳的圖片存在目前畫面的狀態中（隨雲端存檔存入資料庫）
// 管理介面是獨立圖層；每張圖片可個別決定是否放到畫面上（可拖曳、縮放），可同時放多張
const IMAGE_MAX_SIDE = 1920;          // 超過此邊長會縮小
const IMAGE_MAX_BYTES = 1024 * 1024;  // 超過此大小會重新壓縮

let imageItems = []; // { id, name, data }

function openImageLayer() {
    renderImageItems();
    document.getElementById('image-layer').classList.add('active');
}

function closeImageLayer() {
    document.getElementById('image-layer').classList.remove('active');
}

function setImageStatus(text) {
    document.getElementById('image-status').textContent = text;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 太大的圖片縮到最長邊 1920 像素並轉成 JPEG，減少資料庫空間
async function compressImage(dataUrl, fileSize) {
    const img = await loadImage(dataUrl);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= IMAGE_MAX_SIDE && fileSize <= IMAGE_MAX_BYTES) return dataUrl;

    const scale = Math.min(1, IMAGE_MAX_SIDE / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // 透明背景轉 JPEG 時填白色
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
}

async function addImageFiles(files) {
    if (!requireEditor()) return;
    let added = 0;
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
            setImageStatus('「' + file.name + '」處理中...');
            const data = await compressImage(await readFileAsDataUrl(file), file.size);
            imageItems.push({
                id: 'i' + Date.now() + Math.random().toString(36).slice(2, 6),
                name: file.name.replace(/\.[^.]+$/, ''),
                data: data
            });
            added++;
            renderImageItems();
        } catch (err) {
            alert('無法讀取「' + file.name + '」：' + err.message);
        }
    }
    setImageStatus(added ? '已上傳 ' + added + ' 張圖片' : '');
}

function uploadImageFiles(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';
    addImageFiles(files);
}

function renderImageItems() {
    const listEl = document.getElementById('image-item-list');
    listEl.innerHTML = '';
    document.getElementById('image-item-count').textContent = imageItems.length;
    document.getElementById('image-total-size').textContent =
        formatBytes(imageItems.reduce((sum, item) => sum + item.data.length, 0));

    imageItems.forEach(item => {
        const onScreen = !!document.getElementById('image-item-' + item.id);
        const row = document.createElement('div');
        row.className = 'manage-item';
        row.innerHTML = `
            <img class="image-thumb" alt="">
            <div class="manage-item-info">
                <div class="manage-item-name"></div>
                <div class="manage-item-state ${onScreen ? 'on-screen' : ''}">
                    約 ${formatBytes(item.data.length)}・${onScreen ? '● 已在畫面上' : '未放到畫面'}
                </div>
            </div>
            <div class="manage-item-actions">
                <button style="background:${onScreen ? '#999' : '#667eea'};">${onScreen ? '從畫面移除' : '放到畫面'}</button>
                <button class="edit-only" style="background:#f0a020;">改名</button>
                <button class="edit-only" style="background:#ff5f57;">刪除</button>
            </div>
        `;
        row.querySelector('.image-thumb').src = item.data;
        row.querySelector('.manage-item-name').textContent = item.name;
        const [screenBtn, renameBtn, deleteBtn] = row.querySelectorAll('button');
        screenBtn.onclick = () => toggleImageOnScreen(item.id);
        renameBtn.onclick = () => renameImageItem(item.id);
        deleteBtn.onclick = () => deleteImageItem(item.id);
        listEl.appendChild(row);
    });
}

function toggleImageOnScreen(id) {
    const existing = document.getElementById('image-item-' + id);
    if (existing) {
        existing.remove();
    } else {
        const item = imageItems.find(i => i.id === id);
        if (item) createDraggableImage(item);
    }
    renderImageItems();
}

function renameImageItem(id) {
    if (!requireEditor()) return;
    const item = imageItems.find(i => i.id === id);
    if (!item) return;
    const name = prompt('輸入新名稱', item.name);
    if (!name || !name.trim()) return;

    item.name = name.trim();
    const img = document.querySelector('#image-item-' + id + ' .draggable-image');
    if (img) img.alt = item.name;
    renderImageItems();
}

function deleteImageItem(id) {
    if (!requireEditor()) return;
    const item = imageItems.find(i => i.id === id);
    if (!item || !confirm('確定要刪除「' + item.name + '」嗎？')) return;

    imageItems = imageItems.filter(i => i.id !== id);
    const container = document.getElementById('image-item-' + id);
    if (container) container.remove();
    renderImageItems();
}

// 存檔用：圖片清單加上畫面上的位置與大小（不在畫面上時 placement 為 null）
function collectImageItems() {
    return imageItems.map(item => {
        const container = document.getElementById('image-item-' + item.id);
        return Object.assign({}, item, {
            placement: container ? {
                left: container.style.left,
                top: container.style.top,
                width: container.style.width,
                height: container.style.height,
                zIndex: container.style.zIndex
            } : null
        });
    });
}

// 還原圖片清單；舊版存檔的可拖曳圖片（存在 modals 中）會轉成清單項目
function restoreImageItems(items, modals) {
    let restored = items;
    if (!restored) {
        restored = (modals || [])
            .filter(m => (m.isDraggableImage || m.id.startsWith('draggable-image-')) && m.imageData)
            .map((m, i) => ({
                id: 'i' + Date.now() + i,
                name: m.imageTitle || '圖片',
                data: m.imageData,
                placement: { left: m.left, top: m.top, width: m.width, height: m.height, zIndex: m.zIndex }
            }));
    }

    imageItems = restored.map(item => ({ id: item.id, name: item.name, data: item.data }));
    restored.forEach(item => {
        if (item.placement) createDraggableImage(item, item.placement);
    });
    renderImageItems();
    setImageStatus('');
}

// 把圖片放到畫面上；placement 為還原存檔時的位置與大小，未提供時以寬 350px 置中
function createDraggableImage(item, placement) {
    const img = new Image();
    img.onload = function() {
        const aspectRatio = img.width / img.height;
        const initialWidth = 350;
        const initialHeight = initialWidth / aspectRatio;

        // 創建圖片容器
        const container = document.createElement('div');
        container.className = 'draggable-image-container';
        container.id = 'image-item-' + item.id;
        container.dataset.itemId = item.id;
        container.dataset.aspectRatio = aspectRatio;

        if (placement) {
            container.style.left = placement.left;
            container.style.top = placement.top;
            container.style.width = placement.width;
            container.style.height = placement.height;
            container.style.zIndex = placement.zIndex || '1000';
        } else {
            container.style.width = initialWidth + 'px';
            container.style.height = initialHeight + 'px';
            container.style.left = (window.innerWidth - initialWidth) / 2 + 'px';
            container.style.top = (window.innerHeight - initialHeight) / 2 + 'px';
        }

        // 創建圖片元素
        const imgElement = document.createElement('img');
        imgElement.src = item.data;
        imgElement.className = 'draggable-image';
        imgElement.alt = item.name;

        // 創建關閉按鈕（從畫面移除，圖片仍保留在清單中）
        const closeBtn = document.createElement('button');
        closeBtn.className = 'draggable-image-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = function() {
            container.remove();
            renderImageItems();
        };

        // 創建四個角的縮放手柄
        const corners = ['nw', 'ne', 'sw', 'se'];
        corners.forEach(corner => {
            const handle = document.createElement('div');
            handle.className = 'image-resize-handle ' + corner;
            container.appendChild(handle);
        });

        // 組裝元素
        container.appendChild(imgElement);
        container.appendChild(closeBtn);
        document.body.appendChild(container);
        if (!placement) bringToFront(container);

        // 添加拖曳功能
        initImageDrag(container);

        // 添加縮放功能
        initImageResize(container);

        // 點擊圖片時置頂（用 pointerdown，滑鼠、手指、觸控筆都會觸發；iPad 觸控不會產生 mousedown）
        container.addEventListener('pointerdown', function(e) {
            // 如果不是點擊手柄和關閉按鈕，就置頂
            if (!e.target.classList.contains('image-resize-handle') &&
                !e.target.classList.contains('draggable-image-close')) {
                bringToFront(container);
            }
        });

        renderImageItems();
    };
    img.src = item.data;
}

// 拖曳圖片檔到管理圖層上傳
function initImageDrop() {
    const panel = document.getElementById('image-layer-panel');
    panel.addEventListener('dragover', e => {
        e.preventDefault();
        panel.classList.add('dragover');
    });
    panel.addEventListener('dragleave', () => panel.classList.remove('dragover'));
    panel.addEventListener('drop', e => {
        e.preventDefault();
        panel.classList.remove('dragover');
        addImageFiles(Array.from(e.dataTransfer.files));
    });
}
initImageDrop();

function initImageDrag(container) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    container.addEventListener('mousedown', function(e) {
        // 如果點擊的是關閉按鈕或縮放手柄，不觸發拖曳
        if (e.target.classList.contains('draggable-image-close') ||
            e.target.classList.contains('image-resize-handle')) {
            return;
        }

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = container.offsetLeft;
        initialTop = container.offsetTop;

        container.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        container.style.left = (initialLeft + deltaX) + 'px';
        container.style.top = (initialTop + deltaY) + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = 'grab';
        }
    });

    // 觸控支援
    container.addEventListener('touchstart', function(e) {
        if (e.target.classList.contains('draggable-image-close') ||
            e.target.classList.contains('image-resize-handle')) {
            return;
        }

        const touch = e.touches[0];
        isDragging = true;
        startX = touch.clientX;
        startY = touch.clientY;
        initialLeft = container.offsetLeft;
        initialTop = container.offsetTop;
        e.preventDefault();
    });

    document.addEventListener('touchmove', function(e) {
        if (!isDragging) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        container.style.left = (initialLeft + deltaX) + 'px';
        container.style.top = (initialTop + deltaY) + 'px';
    });

    document.addEventListener('touchend', function() {
        isDragging = false;
    });
}

function initImageResize(container) {
    const handles = container.querySelectorAll('.image-resize-handle');

    handles.forEach(handle => {
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        let aspectRatio; // Will be set on mousedown/touchstart

        // 滑鼠事件
        handle.addEventListener('mousedown', function(e) {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = container.offsetWidth;
            startHeight = container.offsetHeight;
            startLeft = container.offsetLeft;
            startTop = container.offsetTop;

            aspectRatio = parseFloat(container.dataset.aspectRatio) || 1;

            bringToFront(container);
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;

            const corner = handle.classList[1]; // nw, ne, sw, se
            resizeFromCorner(e.clientX, e.clientY, corner);
        });

        document.addEventListener('mouseup', function() {
            isResizing = false;
        });

        // 觸控事件
        handle.addEventListener('touchstart', function(e) {
            const touch = e.touches[0];
            isResizing = true;
            startX = touch.clientX;
            startY = touch.clientY;
            startWidth = container.offsetWidth;
            startHeight = container.offsetHeight;
            startLeft = container.offsetLeft;
            startTop = container.offsetTop;
            
            aspectRatio = parseFloat(container.dataset.aspectRatio) || 1;

            bringToFront(container);
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('touchmove', function(e) {
            if (!isResizing) return;

            const touch = e.touches[0];
            const corner = handle.classList[1];
            resizeFromCorner(touch.clientX, touch.clientY, corner);
        });

        document.addEventListener('touchend', function() {
            isResizing = false;
        });

        function resizeFromCorner(currentX, currentY, corner) {
            const deltaX = currentX - startX;
            const deltaY = currentY - startY;

            let newWidth, newHeight, newLeft, newTop;

            switch(corner) {
                case 'se': // 右下角
                    newWidth = Math.max(100, startWidth + deltaX);
                    newHeight = newWidth / aspectRatio;
                    newLeft = startLeft;
                    newTop = startTop;
                    break;

                case 'sw': // 左下角
                    newWidth = Math.max(100, startWidth - deltaX);
                    newHeight = newWidth / aspectRatio;
                    newLeft = startLeft + (startWidth - newWidth);
                    newTop = startTop;
                    break;

                case 'ne': // 右上角
                    newWidth = Math.max(100, startWidth + deltaX);
                    newHeight = newWidth / aspectRatio;
                    newLeft = startLeft;
                    newTop = startTop + (startHeight - newHeight);
                    break;

                case 'nw': // 左上角
                    newWidth = Math.max(100, startWidth - deltaX);
                    newHeight = newWidth / aspectRatio;
                    newLeft = startLeft + (startWidth - newWidth);
                    newTop = startTop + (startHeight - newHeight);
                    break;
            }

            container.style.width = newWidth + 'px';
            container.style.height = newHeight + 'px';
            container.style.left = newLeft + 'px';
            container.style.top = newTop + 'px';
        }
    });
}
