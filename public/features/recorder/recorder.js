let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let availableMicrophones = [];
let microphoneStream = null;
let microphonePreviewStream = null;
let microphoneAnalyser = null;
let microphoneAudioContext = null;
let volumeCheckInterval = null;
let microphonesReady = false;

// ===== 螢幕錄影 =====
// 第一次開啟錄影視窗時才要求麥克風權限；之後開啟只重新啟動音量預覽
function openRecorder() {
    openModal('recorder-modal');
    if (microphonesReady) {
        startMicrophonePreview();
    } else {
        microphonesReady = true;
        initMicrophones();
    }
}

// 關閉錄影視窗時停止麥克風音量預覽（錄影中使用的麥克風不受影響）
function closeRecorder() {
    closeModal('recorder-modal');
    stopMicrophonePreview();
}

// 初始化麥克風列表
async function initMicrophones() {
    try {
        // 請求麥克風權限
        await navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                // 獲得權限後立即停止流
                stream.getTracks().forEach(track => track.stop());
            });

        // 獲取設備列表
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableMicrophones = devices.filter(device => device.kind === 'audioinput');

        updateMicrophoneList();

        // 自動啟動麥克風預覽
        startMicrophonePreview();
    } catch (err) {
        console.log('無法獲取麥克風權限:', err);
        document.getElementById('microphone-select').innerHTML = '<option value="">無法獲取麥克風</option>';
    }
}

// 更新麥克風列表UI
function updateMicrophoneList() {
    const select = document.getElementById('microphone-select');
    const enableMic = document.getElementById('enable-mic-audio').checked;

    select.disabled = !enableMic;

    if (enableMic && availableMicrophones.length > 0) {
        select.innerHTML = availableMicrophones.map((mic, index) =>
            `<option value="${mic.deviceId}">${mic.label || '麥克風 ' + (index + 1)}</option>`
        ).join('');
    } else if (!enableMic) {
        select.innerHTML = '<option value="">已停用</option>';
    } else {
        select.innerHTML = '<option value="">無可用麥克風</option>';
    }
}

// 切換麥克風預覽
function toggleMicrophonePreview() {
    const enableMic = document.getElementById('enable-mic-audio').checked;
    updateMicrophoneList();

    if (enableMic) {
        startMicrophonePreview();
    } else {
        stopMicrophonePreview();
    }
}

// 切換麥克風設備
function switchMicrophone() {
    const enableMic = document.getElementById('enable-mic-audio').checked;
    if (enableMic) {
        stopMicrophonePreview();
        setTimeout(() => startMicrophonePreview(), 100);
    }
}

// 啟動麥克風預覽（用於音量監測）
async function startMicrophonePreview() {
    const enableMic = document.getElementById('enable-mic-audio').checked;
    if (!enableMic) return;

    try {
        stopMicrophonePreview(); // 先停止現有的

        const micDeviceId = document.getElementById('microphone-select').value;
        if (!micDeviceId) return;

        // 獲取麥克風流
        microphonePreviewStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: micDeviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // 創建音訊分析器
        microphoneAudioContext = new AudioContext();
        const source = microphoneAudioContext.createMediaStreamSource(microphonePreviewStream);
        microphoneAnalyser = microphoneAudioContext.createAnalyser();
        microphoneAnalyser.fftSize = 256;
        source.connect(microphoneAnalyser);

        // 開始監測音量
        startVolumeMonitoring();
    } catch (err) {
        console.error('無法啟動麥克風預覽:', err);
    }
}

// 停止麥克風預覽
function stopMicrophonePreview() {
    if (volumeCheckInterval) {
        clearInterval(volumeCheckInterval);
        volumeCheckInterval = null;
    }

    if (microphonePreviewStream) {
        microphonePreviewStream.getTracks().forEach(track => track.stop());
        microphonePreviewStream = null;
    }

    if (microphoneAudioContext) {
        microphoneAudioContext.close();
        microphoneAudioContext = null;
    }

    microphoneAnalyser = null;

    // 重置音量顯示
    document.getElementById('mic-volume-bar').style.width = '0%';
    document.getElementById('mic-volume-text').textContent = '0%';
}

// 監測音量
function startVolumeMonitoring() {
    if (volumeCheckInterval) {
        clearInterval(volumeCheckInterval);
    }

    volumeCheckInterval = setInterval(() => {
        if (!microphoneAnalyser) return;

        const dataArray = new Uint8Array(microphoneAnalyser.frequencyBinCount);
        microphoneAnalyser.getByteFrequencyData(dataArray);

        // 計算平均音量
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const volume = Math.min(100, Math.round((average / 128) * 100));

        // 更新顯示
        document.getElementById('mic-volume-bar').style.width = volume + '%';
        document.getElementById('mic-volume-text').textContent = volume + '%';
    }, 100);
}

async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        // 獲取螢幕錄製流
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always"
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });

        let finalStream;
        const enableMic = document.getElementById('enable-mic-audio').checked;
        const micDeviceId = document.getElementById('microphone-select').value;

        // 如果啟用麥克風且有選擇麥克風
        if (enableMic && micDeviceId) {
            try {
                // 獲取麥克風流（重新獲取用於錄製）
                microphoneStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: { exact: micDeviceId },
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 44100
                    }
                });

                // 使用 Web Audio API 混合音訊
                const audioContext = new AudioContext();
                const destination = audioContext.createMediaStreamDestination();

                // 添加麥克風音訊（增加音量增益）
                const micSource = audioContext.createMediaStreamSource(microphoneStream);
                const micGain = audioContext.createGain();
                micGain.gain.value = 2.0; // 增加麥克風音量
                micSource.connect(micGain);
                micGain.connect(destination);

                // 添加系統音訊（如果有）
                const displayAudioTracks = displayStream.getAudioTracks();
                if (displayAudioTracks.length > 0) {
                    const displaySource = audioContext.createMediaStreamSource(
                        new MediaStream(displayAudioTracks)
                    );
                    const displayGain = audioContext.createGain();
                    displayGain.gain.value = 1.0;
                    displaySource.connect(displayGain);
                    displayGain.connect(destination);
                }

                // 組合視訊和混合音訊
                const videoTrack = displayStream.getVideoTracks()[0];
                const mixedAudioTrack = destination.stream.getAudioTracks()[0];

                finalStream = new MediaStream([videoTrack, mixedAudioTrack]);

                console.log('音訊混合成功 - 視訊軌:', videoTrack, '音訊軌:', mixedAudioTrack);
            } catch (micErr) {
                console.error('麥克風獲取失敗，僅使用螢幕音訊:', micErr);
                finalStream = displayStream;
            }
        } else {
            // 不使用麥克風，僅錄製螢幕
            finalStream = displayStream;
        }

        // 使用支援的編碼格式
        let options = { mimeType: 'video/webm;codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm;codecs=vp8,opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'video/webm' };
            }
        }

        mediaRecorder = new MediaRecorder(finalStream, options);
        recordedChunks = [];

        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
                console.log('錄製數據塊:', e.data.size, 'bytes');
            }
        };

        mediaRecorder.onstop = () => {
            console.log('錄製停止，總數據塊:', recordedChunks.length);
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            console.log('生成檔案大小:', blob.size, 'bytes');

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'recording-' + Date.now() + '.webm';
            link.href = url;
            link.click();

            // 清理 URL
            setTimeout(() => URL.revokeObjectURL(url), 100);
        };

        mediaRecorder.onerror = (e) => {
            console.error('MediaRecorder 錯誤:', e);
        };

        // 每秒儲存一次數據
        mediaRecorder.start(1000);
        isRecording = true;

        console.log('開始錄製，編碼:', options.mimeType);

        const btn = document.getElementById('record-btn');
        btn.classList.remove('idle');
        btn.classList.add('recording');
        btn.textContent = '⏹';
        document.getElementById('record-status').textContent = '錄製中...';
    } catch (err) {
        console.error('錄影錯誤:', err);
        alert('無法開始錄影: ' + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        console.log('停止錄製...');

        mediaRecorder.stop();

        // 停止所有軌道
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => {
                track.stop();
                console.log('停止軌道:', track.kind, track.label);
            });
        }

        // 停止錄製用的麥克風流
        if (microphoneStream) {
            microphoneStream.getTracks().forEach(track => track.stop());
            microphoneStream = null;
        }

        isRecording = false;

        const btn = document.getElementById('record-btn');
        btn.classList.remove('recording');
        btn.classList.add('idle');
        btn.textContent = '⏺';
        document.getElementById('record-status').textContent = '準備就緒';
    }
}
