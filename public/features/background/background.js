// ===== 背景設定 =====
let bgImage = null;
let bgOpacity = 0.3;
let currentGrid = 'none';

function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 繪製底圖
    if (currentGrid !== 'none') {
        ctx.save();

        // 白板和黑板背景
        if (currentGrid === 'whiteboard') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (currentGrid === 'blackboard') {
            ctx.fillStyle = '#2d5016';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            // 其他格線底圖
            ctx.globalAlpha = bgOpacity;
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 1;

            switch(currentGrid) {
                case 'grid':
                    drawGridPattern(40);
                    break;
                case 'tianzi':
                    drawTianziPattern();
                    break;
                case 'mizi':
                    drawMiziPattern();
                    break;
                case 'english':
                    drawEnglishLines();
                    break;
                case 'music':
                    drawMusicLines();
                    break;
            }
        }
        ctx.restore();
    }

    // 繪製背景圖片
    if (bgImage) {
        ctx.save();
        ctx.globalAlpha = bgOpacity;

        // 計算保持比例的最大尺寸並置中
        const imgRatio = bgImage.width / bgImage.height;
        const canvasRatio = canvas.width / canvas.height;

        let drawWidth, drawHeight, drawX, drawY;

        if (imgRatio > canvasRatio) {
            // 圖片較寬，以寬度為準
            drawWidth = canvas.width;
            drawHeight = canvas.width / imgRatio;
        } else {
            // 圖片較高，以高度為準
            drawHeight = canvas.height;
            drawWidth = canvas.height * imgRatio;
        }

        // 置中
        drawX = (canvas.width - drawWidth) / 2;
        drawY = (canvas.height - drawHeight) / 2;

        ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
    }
}

function drawGridPattern(size) {
    for (let x = 0; x <= canvas.width; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawTianziPattern() {
    const size = 80;
    for (let x = 0; x <= canvas.width; x += size) {
        for (let y = 0; y <= canvas.height; y += size) {
            ctx.strokeRect(x, y, size, size);
            ctx.beginPath();
            ctx.moveTo(x + size/2, y);
            ctx.lineTo(x + size/2, y + size);
            ctx.moveTo(x, y + size/2);
            ctx.lineTo(x + size, y + size/2);
            ctx.stroke();
        }
    }
}

function drawMiziPattern() {
    const size = 80;
    for (let x = 0; x <= canvas.width; x += size) {
        for (let y = 0; y <= canvas.height; y += size) {
            ctx.strokeRect(x, y, size, size);
            ctx.beginPath();
            ctx.moveTo(x + size/2, y);
            ctx.lineTo(x + size/2, y + size);
            ctx.moveTo(x, y + size/2);
            ctx.lineTo(x + size, y + size/2);
            ctx.moveTo(x, y);
            ctx.lineTo(x + size, y + size);
            ctx.moveTo(x + size, y);
            ctx.lineTo(x, y + size);
            ctx.stroke();
        }
    }
}

function drawEnglishLines() {
    const lineHeight = 30;
    const groupHeight = lineHeight * 4;
    for (let y = groupHeight; y <= canvas.height; y += groupHeight + 20) {
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(0, y - i * lineHeight);
            ctx.lineTo(canvas.width, y - i * lineHeight);
            if (i === 0 || i === 3) {
                ctx.lineWidth = 2;
            } else {
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function drawMusicLines() {
    const lineSpacing = 15;
    const groupSpacing = 60;
    for (let y = 100; y <= canvas.height; y += groupSpacing) {
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(50, y + i * lineSpacing);
            ctx.lineTo(canvas.width - 50, y + i * lineSpacing);
            ctx.stroke();
        }
    }
}

function setGrid(type) {
    currentGrid = type;
    document.querySelectorAll('.grid-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.includes(
            {none: '無', grid: '方格', tianzi: '田字格', mizi: '米字格', english: '英文四線', music: '五線譜'}[type]
        ));
    });
    drawBackground();
}

function setBgImage(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            bgImage = new Image();
            bgImage.onload = function() {
                drawBackground();
            };
            bgImage.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function clearBgImage() {
    bgImage = null;
    document.getElementById('bg-image').value = '';
    drawBackground();
}

function setBgOpacity() {
    bgOpacity = document.getElementById('bg-opacity').value / 100;
    drawBackground();
}

function setBgUrl() {
    const url = document.getElementById('bg-url').value.trim();
    if (!url) {
        alert('請輸入網址');
        return;
    }

    // 確保網址有協議
    let finalUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        finalUrl = 'https://' + url;
    }

    const iframe = document.getElementById('bg-iframe');
    iframe.src = finalUrl;
    iframe.classList.add('active');

    // 讓 body 背景透明，才能看到 iframe
    document.body.style.background = 'transparent';
}

function clearBgUrl() {
    const iframe = document.getElementById('bg-iframe');
    iframe.src = 'about:blank';
    iframe.classList.remove('active');
    document.getElementById('bg-url').value = '';

    // 還原 body 背景
    document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
}
