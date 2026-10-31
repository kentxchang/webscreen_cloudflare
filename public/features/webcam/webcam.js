let webcamStream = null;
let webcamFrozen = false;
let webcamMirrored = false;

// ===== 實物投影 =====
// 開啟投影視窗時自動啟動攝影機（第一次會要求攝影機權限）
function openWebcam() {
    openModal('webcam-modal');
    if (!webcamStream) startWebcam();
}

// 取得攝影機畫面；deviceId 為空時優先使用後鏡頭（平板），桌機則使用預設攝影機
async function startWebcam(deviceId) {
    stopWebcam();
    resetWebcamFreeze();

    try {
        const video = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: video });
        } catch (err) {
            // 指定條件找不到攝影機時，改用任何可用的攝影機
            if (err.name !== 'OverconstrainedError') throw err;
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        document.getElementById('webcam-video').srcObject = webcamStream;

        // 取得權限後才能讀到攝影機名稱與編號，此時再更新清單並選中目前的攝影機
        await refreshCameraList();
    } catch (err) {
        alert(webcamErrorMessage(err));
    }
}

function webcamErrorMessage(err) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return '此瀏覽器不支援攝影機，請使用 Chrome 或 Edge，並以 https 網址開啟。';
    }
    switch (err.name) {
        case 'NotAllowedError':
            return '沒有攝影機權限。請點網址列左側的圖示，允許此網站使用攝影機後再按「開始」。';
        case 'NotFoundError':
            return '找不到攝影機，請確認攝影機已連接（外接攝影機插上後再按「開始」）。';
        case 'NotReadableError':
            return '攝影機正被其他程式使用（例如 Teams、Zoom、LINE），請關閉後再按「開始」。';
        default:
            return '無法存取攝影機：' + err.message;
    }
}

async function refreshCameraList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    const select = document.getElementById('camera-select');
    select.innerHTML = '';
    cameras.forEach((cam, i) => {
        const option = document.createElement('option');
        option.value = cam.deviceId;
        option.textContent = cam.label || '攝影機 ' + (i + 1);
        select.appendChild(option);
    });

    const track = webcamStream && webcamStream.getVideoTracks()[0];
    if (track) select.value = track.getSettings().deviceId || select.value;
}

function switchCamera() {
    const deviceId = document.getElementById('camera-select').value;
    if (deviceId) startWebcam(deviceId);
}

// 插拔攝影機（例如 USB 實物投影機）時更新清單
if (navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
        if (webcamStream) refreshCameraList();
    });
}

function resetWebcamFreeze() {
    document.getElementById('webcam-video').style.display = 'block';
    document.getElementById('webcam-canvas').style.display = 'none';
    document.getElementById('freeze-btn').textContent = '凍結';
    webcamFrozen = false;
}

function stopWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
}

function toggleFreeze() {
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    const btn = document.getElementById('freeze-btn');

    if (webcamFrozen) {
        video.style.display = 'block';
        canvas.style.display = 'none';
        btn.textContent = '凍結';
        webcamFrozen = false;
    } else {
        drawWebcamFrame(canvas, video);
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.borderRadius = '8px';
        video.style.display = 'none';
        btn.textContent = '解凍';
        webcamFrozen = true;
    }
}

function captureWebcam() {
    const video = document.getElementById('webcam-video');
    const canvas = document.createElement('canvas');
    drawWebcamFrame(canvas, video);

    const link = document.createElement('a');
    link.download = 'capture-' + Date.now() + '.png';
    link.href = canvas.toDataURL();
    link.click();
}

// 左右鏡像：畫面、凍結與截圖都會一起翻轉
function toggleWebcamMirror() {
    webcamMirrored = !webcamMirrored;
    document.getElementById('webcam-video').classList.toggle('mirrored', webcamMirrored);
    document.getElementById('mirror-btn').classList.toggle('active', webcamMirrored);

    // 已凍結時重畫凍結的畫面
    if (webcamFrozen) {
        const canvas = document.getElementById('webcam-canvas');
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext('2d').drawImage(canvas, 0, 0);

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(copy, 0, 0);
        ctx.restore();
    }
}

// 把目前的攝影機畫面畫到 canvas（依鏡像設定翻轉）
function drawWebcamFrame(canvas, video) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (webcamMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
}
