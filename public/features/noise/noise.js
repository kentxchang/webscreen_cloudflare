let audioContext = null;
let noiseAnalyser = null;
let noiseMeterActive = false;

// ===== 噪音偵測器 =====
async function toggleNoiseMeter() {
    if (noiseMeterActive) {
        stopNoiseMeter();
    } else {
        startNoiseMeter();
    }
}

async function startNoiseMeter() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        noiseAnalyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(noiseAnalyser);

        noiseAnalyser.fftSize = 256;
        const bufferLength = noiseAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        noiseMeterActive = true;
        document.getElementById('noise-toggle').textContent = '停止偵測';

        function updateNoise() {
            if (!noiseMeterActive) return;

            noiseAnalyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;

            const light = document.getElementById('noise-light');
            const level = document.getElementById('noise-level');

            if (average < 30) {
                light.className = 'noise-light green';
                level.textContent = '安靜';
            } else if (average < 80) {
                light.className = 'noise-light yellow';
                level.textContent = '警告';
            } else {
                light.className = 'noise-light red';
                level.textContent = '吵鬧';
            }

            requestAnimationFrame(updateNoise);
        }

        updateNoise();
    } catch (err) {
        alert('無法存取麥克風');
    }
}

function stopNoiseMeter() {
    noiseMeterActive = false;
    if (audioContext) {
        audioContext.close();
    }
    document.getElementById('noise-toggle').textContent = '開始偵測';
    document.getElementById('noise-light').className = 'noise-light green';
    document.getElementById('noise-level').textContent = '安靜';
}
