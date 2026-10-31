// ===== 聚光燈 =====
function toggleSpotlight() {
    const overlay = document.getElementById('spotlight-overlay');
    overlay.classList.toggle('active');

    if (overlay.classList.contains('active')) {
        const hole = document.getElementById('spotlight-hole');
        const width = hole.classList.contains('circle') ? 250 : 300;
        const height = hole.classList.contains('circle') ? 250 : 200;
        hole.style.left = (window.innerWidth - width) / 2 + 'px';
        hole.style.top = (window.innerHeight - height) / 2 + 'px';
        makeSpotlightDraggable();
    }
}

function setSpotlightShape(shape) {
    const hole = document.getElementById('spotlight-hole');

    // 移除所有形狀類別
    hole.classList.remove('circle', 'rectangle', 'rounded');
    hole.classList.add(shape);

    // 更新按鈕狀態
    document.querySelectorAll('.spotlight-shape-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // 調整尺寸
    if (shape === 'circle') {
        hole.style.width = '250px';
        hole.style.height = '250px';
    } else {
        hole.style.width = '300px';
        hole.style.height = '200px';
    }
}

function makeSpotlightDraggable() {
    const hole = document.getElementById('spotlight-hole');
    let isDragging = false;
    let isResizing = false;
    let resizeDir = '';
    let startX, startY, initialX, initialY, initialW, initialH;

    // 處理調整大小手柄
    const resizeHandles = hole.querySelectorAll('.spotlight-resize');
    resizeHandles.forEach(handle => {
        handle.addEventListener('pointerdown', function(e) {
            e.stopPropagation();
            isResizing = true;
            resizeDir = this.dataset.dir;
            startX = e.clientX;
            startY = e.clientY;
            initialX = hole.offsetLeft;
            initialY = hole.offsetTop;
            initialW = hole.offsetWidth;
            initialH = hole.offsetHeight;
        });
    });

    // 處理拖曳（只有點擊hole本身，不是resize handle）
    hole.addEventListener('pointerdown', function(e) {
        if (e.target.classList.contains('spotlight-resize')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = hole.offsetLeft;
        initialY = hole.offsetTop;
    });

    document.addEventListener('pointermove', function(e) {
        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            hole.style.left = initialX + dx + 'px';
            hole.style.top = initialY + dy + 'px';
        } else if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // 計算中心點
            const centerX = initialX + initialW / 2;
            const centerY = initialY + initialH / 2;

            let newW = initialW;
            let newH = initialH;

            // 根據拖曳方向計算新尺寸（從中心縮放）
            if (resizeDir === 'se') {
                newW = initialW + dx * 2;
                newH = initialH + dy * 2;
            } else if (resizeDir === 'sw') {
                newW = initialW - dx * 2;
                newH = initialH + dy * 2;
            } else if (resizeDir === 'ne') {
                newW = initialW + dx * 2;
                newH = initialH - dy * 2;
            } else if (resizeDir === 'nw') {
                newW = initialW - dx * 2;
                newH = initialH - dy * 2;
            }

            // 限制最小尺寸
            newW = Math.max(50, newW);
            newH = Math.max(50, newH);

            // 從中心點重新計算位置
            hole.style.width = newW + 'px';
            hole.style.height = newH + 'px';
            hole.style.left = centerX - newW / 2 + 'px';
            hole.style.top = centerY - newH / 2 + 'px';
        }
    });

    document.addEventListener('pointerup', function() {
        isDragging = false;
        isResizing = false;
        resizeDir = '';
    });
}
