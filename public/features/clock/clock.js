// ===== 時鐘 =====
// 指針時鐘＋數字時間＋日期；音效（整點報時、秒針滴答聲）只在時鐘視窗開啟時播放
const CLOCK_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 產生 60 個刻度與 1～12 的數字
function buildClockFace() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const marks = document.getElementById('clock-marks');
    for (let i = 0; i < 60; i++) {
        const isHour = i % 5 === 0;
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', 100);
        line.setAttribute('y1', isHour ? 10 : 8);
        line.setAttribute('x2', 100);
        line.setAttribute('y2', isHour ? 20 : 13);
        line.setAttribute('class', isHour ? 'clock-mark hour' : 'clock-mark');
        line.setAttribute('transform', 'rotate(' + i * 6 + ' 100 100)');
        marks.appendChild(line);
    }
    for (let h = 1; h <= 12; h++) {
        const angle = h * 30 * Math.PI / 180;
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', 100 + 68 * Math.sin(angle));
        text.setAttribute('y', 100 - 68 * Math.cos(angle));
        text.setAttribute('class', 'clock-number');
        text.textContent = h;
        marks.appendChild(text);
    }
}

function updateClock() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();

    document.getElementById('clock-display').textContent =
        [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    document.getElementById('clock-date').textContent =
        `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${CLOCK_WEEKDAYS[now.getDay()]}`;

    const rotate = (id, deg) => document.getElementById(id).setAttribute('transform', 'rotate(' + deg + ' 100 100)');
    rotate('clock-hour', (h % 12) * 30 + m * 0.5);
    rotate('clock-minute', m * 6 + s * 0.1);
    rotate('clock-second', s * 6);

    // 音效只在時鐘視窗開啟時播放
    if (!document.getElementById('clock-modal').classList.contains('active')) return;
    if (m === 0 && s === 0 && document.getElementById('clock-chime').checked) {
        playClockChime(h);
    } else if (document.getElementById('clock-tick').checked) {
        playTone(1600, 0.03, { type: 'square', volume: 0.04 });
    }
}

// 整點報時：四個音的鐘聲旋律，接著敲幾點就響幾聲
function playClockChime(hour) {
    [659, 523, 587, 392].forEach((frequency, i) => {
        playTone(frequency, 0.6, { volume: 0.25, delay: i * 0.6 });
    });
    const strikes = hour % 12 || 12;
    for (let i = 0; i < strikes; i++) {
        playTone(196, 0.9, { type: 'triangle', volume: 0.3, delay: 3 + i * 1.1 });
    }
}

function saveClockSoundOptions() {
    localStorage.setItem('clockSound', JSON.stringify({
        chime: document.getElementById('clock-chime').checked,
        tick: document.getElementById('clock-tick').checked
    }));
}

function loadClockSoundOptions() {
    try {
        const saved = JSON.parse(localStorage.getItem('clockSound'));
        if (saved) {
            document.getElementById('clock-chime').checked = !!saved.chime;
            document.getElementById('clock-tick').checked = !!saved.tick;
        }
    } catch (e) { /* 使用預設值 */ }
}

// 依視窗大小調整指針時鐘與文字：視窗太矮時一起縮小（避免內容被切掉），最大化時放大並與數字並排
function fitClockLayout() {
    const modal = document.getElementById('clock-modal');
    if (!modal.classList.contains('active')) return;
    const body = modal.querySelector('.clock-body');
    const face = document.getElementById('clock-face');
    const display = document.getElementById('clock-display');
    const date = document.getElementById('clock-date');
    const style = getComputedStyle(body);
    const paddingV = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const paddingH = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);

    if (modal.classList.contains('maximized')) {
        // 最大化時文字大小由 clock.css 決定
        display.style.fontSize = date.style.fontSize = '';
        const size = Math.min(window.innerHeight * 0.7, window.innerWidth * 0.45, body.clientHeight - paddingV);
        face.style.width = face.style.height = Math.max(80, size) + 'px';
        return;
    }

    // 數字時間與日期的字級跟著時鐘大小縮放（時鐘 220px 時為 48px、18px）
    const apply = size => {
        face.style.width = face.style.height = size + 'px';
        display.style.fontSize = Math.max(18, Math.round(size * 0.22)) + 'px';
        date.style.fontSize = Math.max(12, Math.round(size * 0.082)) + 'px';
    };
    let size = Math.max(60, Math.min(220, body.clientWidth - paddingH));
    apply(size);
    // 視窗有固定高度時，超出多少就把時鐘縮小多少（文字約佔時鐘大小的三分之一），最多調整三次
    if (modal.style.height) {
        for (let i = 0; i < 3; i++) {
            const overflow = body.scrollHeight - body.clientHeight;
            if (overflow <= 0 || size <= 60) break;
            size = Math.max(60, Math.floor(size - overflow / 1.33) - 1);
            apply(size);
        }
    }
}

// 啟動時鐘
new ResizeObserver(fitClockLayout).observe(document.querySelector('#clock-modal .clock-body'));
buildClockFace();
loadClockSoundOptions();
setInterval(updateClock, 1000);
updateClock();
