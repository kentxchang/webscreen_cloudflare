let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let timerTotal = 0; // 本次設定的總秒數（進度環與「重置」使用）
let timerSoundOn = localStorage.getItem('timerSound') !== 'off';

const TIMER_RING_LENGTH = 2 * Math.PI * 90; // 進度環周長（半徑 90）

// ===== 計時器 =====
function setTimer(seconds) {
    stopTimer();
    timerSeconds = seconds;
    timerTotal = seconds;
    setTimerFinished(false);
    updateTimerDisplay();
}

function setCustomTimer() {
    const custom = parseInt(document.getElementById('custom-timer').value);
    if (custom > 0) {
        setTimer(custom);
    }
}

function toggleTimer() {
    if (timerRunning) stopTimer();
    else startTimer();
}

function startTimer() {
    if (timerRunning || timerSeconds <= 0) return;
    if (timerTotal < timerSeconds) timerTotal = timerSeconds;
    timerRunning = true;
    setTimerFinished(false);
    if (timerSoundOn) playTone(880, 0.12, { volume: 0.15 });
    timerInterval = setInterval(timerTick, 1000);
    updateTimerDisplay();
}

function timerTick() {
    timerSeconds--;
    updateTimerDisplay();

    // 最後 10 秒每秒提示一聲
    if (timerSeconds > 0 && timerSeconds <= 10 && timerSoundOn) {
        playTone(1000, 0.08, { type: 'square', volume: 0.08 });
    }

    if (timerSeconds <= 0) {
        stopTimer();
        setTimerFinished(true);
        if (timerSoundOn) playTimerAlarm();
    }
}

function stopTimer() {
    timerRunning = false;
    clearInterval(timerInterval);
    updateTimerDisplay();
}

// 重置到本次設定的時間
function resetTimer() {
    stopTimer();
    timerSeconds = timerTotal;
    setTimerFinished(false);
    updateTimerDisplay();
}

// 時間到：上行三音，重複三次
function playTimerAlarm() {
    for (let round = 0; round < 3; round++) {
        [523, 659, 784].forEach((frequency, i) => {
            playTone(frequency, 0.3, { volume: 0.3, delay: round * 0.9 + i * 0.18 });
        });
    }
}

function setTimerFinished(finished) {
    document.getElementById('timer-modal').classList.toggle('finished', finished);
    updateTimerDisplay();
}

function toggleTimerSound() {
    timerSoundOn = !timerSoundOn;
    localStorage.setItem('timerSound', timerSoundOn ? 'on' : 'off');
    updateTimerSoundButton();
}

function updateTimerSoundButton() {
    const btn = document.getElementById('timer-sound-btn');
    btn.textContent = timerSoundOn ? '🔔' : '🔕';
    btn.title = timerSoundOn ? '音效：開' : '音效：關';
}

function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    document.getElementById('timer-display').textContent =
        String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

    // 進度環：剩餘時間佔總時間的比例
    const total = Math.max(timerTotal, timerSeconds);
    const ratio = total > 0 ? timerSeconds / total : 0;
    document.getElementById('timer-ring-progress').style.strokeDashoffset = TIMER_RING_LENGTH * (1 - ratio);

    const modal = document.getElementById('timer-modal');
    const finished = modal.classList.contains('finished');
    modal.classList.toggle('running', timerRunning);
    modal.classList.toggle('warning', timerRunning && timerSeconds <= 10);

    let status = '選擇時間後按開始';
    if (finished) status = '⏰ 時間到！';
    else if (timerRunning) status = '倒數中';
    else if (timerSeconds > 0 && timerSeconds < total) status = '已暫停';
    else if (timerSeconds > 0) status = '準備開始';
    document.getElementById('timer-status').textContent = status;

    document.getElementById('timer-start').textContent = timerRunning ? '⏸ 暫停'
        : (timerSeconds > 0 && timerSeconds < total ? '▶ 繼續' : '▶ 開始');
}

// 依視窗大小調整進度環與數字：視窗太矮時縮小（避免內容被切掉），最大化時放大
function fitTimerLayout() {
    const modal = document.getElementById('timer-modal');
    if (!modal.classList.contains('active')) return;
    const body = modal.querySelector('.timer-body');
    const wrap = modal.querySelector('.timer-ring-wrap');
    const maximized = modal.classList.contains('maximized');

    let size = maximized ? Math.min(window.innerHeight * 0.62, window.innerWidth * 0.7) : 230;
    // 視窗有固定高度（拉過大小、還原存檔、最大化）時，扣掉其他內容後剩下的高度就是進度環的上限
    if (maximized || modal.style.height) {
        const style = getComputedStyle(body);
        const others = Array.from(body.children).filter(el => el !== wrap)
            .reduce((sum, el) => sum + el.offsetHeight, 0);
        const gaps = (parseFloat(style.rowGap) || 0) * (body.children.length - 1);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        size = Math.min(size, body.clientHeight - others - gaps - padding);
    }
    size = Math.max(90, Math.min(size, body.clientWidth - 32));

    wrap.style.width = wrap.style.height = size + 'px';
    modal.querySelector('.timer-display').style.fontSize = Math.round(size * 0.24) + 'px';
    modal.querySelector('.timer-status').style.fontSize = Math.max(12, Math.round(size * 0.06)) + 'px';
}

new ResizeObserver(fitTimerLayout).observe(document.querySelector('#timer-modal .timer-body'));
document.getElementById('timer-ring-progress').style.strokeDasharray = TIMER_RING_LENGTH;
updateTimerSoundButton();
updateTimerDisplay();
