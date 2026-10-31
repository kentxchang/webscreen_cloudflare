let wheelOptions = ['1', '2', '3', '4', '5', '6'];
let wheelAngle = 0;
let wheelSpinning = false;

// ===== 幸運轉盤 =====
function initWheel() {
    drawWheel();
}

function updateWheel() {
    const input = document.getElementById('wheel-options').value;
    wheelOptions = input.split(',').map(s => s.trim()).filter(s => s);
    drawWheel();
}

function drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 150;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    const sliceAngle = (2 * Math.PI) / wheelOptions.length;

    for (let i = 0; i < wheelOptions.length; i++) {
        const startAngle = i * sliceAngle + wheelAngle;
        const endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        ctx.stroke();

        // 文字
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + sliceAngle / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#000';
        ctx.font = '14px Arial';
        ctx.fillText(wheelOptions[i], radius - 20, 5);
        ctx.restore();
    }

    // 指針
    ctx.beginPath();
    ctx.moveTo(centerX + radius + 10, centerY);
    ctx.lineTo(centerX + radius + 30, centerY - 10);
    ctx.lineTo(centerX + radius + 30, centerY + 10);
    ctx.fillStyle = '#333';
    ctx.fill();

    // 點擊事件
    canvas.onclick = spinWheel;
}

function spinWheel() {
    if (wheelSpinning) return;
    wheelSpinning = true;

    const spins = 5 + Math.random() * 5;
    const targetAngle = wheelAngle + spins * 2 * Math.PI;
    const duration = 4000;
    const startTime = Date.now();
    const startAngle = wheelAngle;

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);

        wheelAngle = startAngle + (targetAngle - startAngle) * easeOut;
        drawWheel();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            wheelSpinning = false;
            // 計算結果
            const normalizedAngle = (2 * Math.PI - (wheelAngle % (2 * Math.PI))) % (2 * Math.PI);
            const sliceAngle = (2 * Math.PI) / wheelOptions.length;
            const index = Math.floor(normalizedAngle / sliceAngle);
            document.getElementById('wheel-result').textContent = '結果：' + wheelOptions[index];
        }
    }

    animate();
}
