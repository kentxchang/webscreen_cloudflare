let canvas, ctx;
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#ff0000';
let currentSize = 5;
let currentStamp = '✓';
let palmRejection = false;
let drawingMode = false;

// ===== 畫布初始化 =====
function initCanvas() {
    canvas = document.getElementById('drawing-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Pointer Events
    canvas.addEventListener('pointerdown', startDrawing);
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointerleave', stopDrawing);
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawBackground();
}

// ===== 繪圖功能 =====
function startDrawing(e) {
    if (palmRejection && e.pointerType !== 'pen') return;

    isDrawing = true;
    const pos = getPointerPos(e);

    if (currentTool === 'stamp') {
        drawStamp(pos.x, pos.y);
        isDrawing = false;
        return;
    }

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
    if (!isDrawing) return;
    if (palmRejection && e.pointerType !== 'pen') return;

    const pos = getPointerPos(e);

    if (currentTool === 'pen') {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = currentColor;
        let size = currentSize;
        if (e.pressure && e.pressure > 0) {
            size = currentSize * e.pressure * 2;
        }
        ctx.lineWidth = size;
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    } else if (currentTool === 'eraser') {
        ctx.clearRect(pos.x - currentSize * 2, pos.y - currentSize * 2, currentSize * 4, currentSize * 4);
    }
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
}

function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function drawStamp(x, y) {
    ctx.font = '48px Arial';
    ctx.fillText(currentStamp, x - 24, y + 16);
}

function toggleDrawingMode() {
    drawingMode = !drawingMode;
    const container = document.getElementById('canvas-container');
    const toolbar = document.getElementById('canvas-toolbar');
    const toggleBtn = document.getElementById('drawing-toggle');
    const drawingItem = document.getElementById('drawing-item');

    if (drawingMode) {
        container.classList.add('drawing-mode');
        toolbar.classList.add('active');
        toggleBtn.classList.add('active');
        drawingItem.classList.add('active');
    } else {
        container.classList.remove('drawing-mode');
        toolbar.classList.remove('active');
        toggleBtn.classList.remove('active');
        drawingItem.classList.remove('active');
    }
}

function setTool(tool) {
    const stampPopup = document.getElementById('stamp-popup');

    if (tool === 'stamp') {
        // 如果已經是印章工具，切換選單顯示
        if (currentTool === 'stamp') {
            stampPopup.classList.toggle('active');
        } else {
            // 切換到印章工具，展開選單
            currentTool = tool;
            stampPopup.classList.add('active');
        }
    } else {
        // 其他工具，關閉選單
        currentTool = tool;
        stampPopup.classList.remove('active');
    }

    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === currentTool);
    });
}

function setColor(color) {
    currentColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
}

function setSize(size) {
    currentSize = size;
    document.querySelectorAll('.size-btn').forEach(btn => {
        const btnSize = {thin: 2, medium: 5, thick: 10, super: 20}[btn.dataset.size];
        btn.classList.toggle('active', btnSize === size);
    });
}

function setStamp(stamp) {
    currentStamp = stamp;
    document.querySelectorAll('.stamp-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.stamp === stamp);
    });
    // 選擇後收合選單
    document.getElementById('stamp-popup').classList.remove('active');
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
}

function saveCanvas() {
    const link = document.createElement('a');
    link.download = 'canvas-' + Date.now() + '.png';
    link.href = canvas.toDataURL();
    link.click();
}

function togglePalmRejection() {
    palmRejection = document.getElementById('palm-rejection').checked;
    saveSettings();
}
