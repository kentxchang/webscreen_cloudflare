// ===== 雲端功能 (Cloudflare) =====
const API_BASE = 'api/saves';

// 目前開啟的雲端存檔（開新畫面時為 null）
let currentSaveId = null;
let currentSaveName = '';

function setCurrentSave(id, name) {
    currentSaveId = id;
    currentSaveName = name || '';
    const group = document.getElementById('cloud-current-save-group');
    group.style.display = id ? 'flex' : 'none';
    document.getElementById('cloud-current-save-name').textContent = currentSaveName;
}

// 目前存檔的獨立網址
function getScreenUrl(saveId) {
    return window.location.href.split(/[?#]/)[0] + '?screen=' + encodeURIComponent(saveId);
}

// 上次存到雲端的畫面內容，用來判斷畫面是否有變更（null = 尚未選擇畫面）
let lastSavedContent = null;

// 比較畫面內容時忽略每次都不同的 timestamp
function screenFingerprint(content) {
    return content.replace(/"timestamp":"[^"]*"/, '');
}

// 以目前畫面作為「已存檔」的基準（等畫布等非同步還原完成後再記錄）
function markScreenSaved() {
    setTimeout(() => { lastSavedContent = screenFingerprint(JSON.stringify(collectCurrentState())); }, 1500);
}

// 雲端分類的「新畫面」：清空成新畫面；目前畫面有尚未存到雲端的變更時先確認
function newScreen() {
    if (!requireEditor()) return;
    const changed = lastSavedContent !== null &&
        screenFingerprint(JSON.stringify(collectCurrentState())) !== lastSavedContent;
    if (changed && !confirm('目前畫面有尚未存到雲端的變更，開新畫面後這些變更會遺失。\n確定要開新畫面嗎？')) return;

    // 移除網址中的 ?screen=，避免重新整理時又載入原本的存檔
    history.replaceState(null, '', window.location.pathname);
    startNewScreen();
}

// 把畫面狀態送到雲端：saveId 為 null 時新增存檔，否則更新
// 內容直接以 JSON 文字送出，名稱放在網址參數，伺服器不需解析大型內容
async function putStateToCloud(saveId, name, content) {
    const url = (saveId ? API_BASE + '/' + encodeURIComponent(saveId) : API_BASE) +
        '?name=' + encodeURIComponent(name);
    const response = await fetch(url, {
        method: saveId ? 'PUT' : 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: content
    });
    return response.json();
}

// 更新目前開啟的存檔（silent 為 true 時不顯示成功訊息）
async function cloudUpdate(silent) {
    if (!requireEditor()) return false;
    if (!currentSaveId) {
        alert('目前畫面尚未雲端存檔，請先輸入名稱另存新檔。');
        openModal('cloud-save-modal');
        return false;
    }

    let updated = false;
    showLoading();

    try {
        const content = JSON.stringify(collectCurrentState());
        const result = await putStateToCloud(currentSaveId, currentSaveName, content);

        if (result.success) {
            lastSavedContent = screenFingerprint(content);
            updated = true;
            if (!silent) alert('已更新雲端存檔「' + currentSaveName + '」');
        } else if (!handleNeedLogin(result)) {
            alert('更新失敗：' + result.error);
        }
    } catch (error) {
        alert('錯誤：' + error.message);
    }

    hideLoading();
    return updated;
}

// 雲端存檔（另存新檔）
async function cloudSave() {
    if (!requireEditor()) return;
    const fileName = document.getElementById('cloud-save-name').value.trim();
    if (!fileName) {
        alert('請輸入存檔名稱');
        return;
    }

    showLoading();

    try {
        // 收集當前狀態 (使用現有的 exportState 邏輯)
        const content = JSON.stringify(collectCurrentState());
        const result = await putStateToCloud(null, fileName, content);

        if (result.success) {
            setCurrentSave(result.saveId, fileName);
            lastSavedContent = screenFingerprint(content);
            document.getElementById('cloud-save-status').textContent = '存檔成功！';
            document.getElementById('cloud-save-status').style.color = '#28ca41';
            alert('雲端存檔成功！\n存檔名稱：' + fileName);
            document.getElementById('cloud-save-name').value = '';
        } else if (!handleNeedLogin(result)) {
            document.getElementById('cloud-save-status').textContent = '存檔失敗：' + result.error;
            document.getElementById('cloud-save-status').style.color = '#ff5f57';
        }
    } catch (error) {
        document.getElementById('cloud-save-status').textContent = '錯誤：' + error.message;
        document.getElementById('cloud-save-status').style.color = '#ff5f57';
    }

    hideLoading();
}

// 收集當前狀態
function collectCurrentState() {
    // 收集所有開啟的模組視窗狀態
    const modals = document.querySelectorAll('.modal');
    const modalStates = [];

    modals.forEach(modal => {
        if (modal.classList.contains('active')) {
            const rect = modal.getBoundingClientRect();
            const modalData = {
                id: modal.id,
                left: modal.style.left || (rect.left + 'px'),
                top: modal.style.top || (rect.top + 'px'),
                width: modal.style.width || (rect.width + 'px'),
                height: modal.style.height || (rect.height + 'px'),
                zIndex: modal.style.zIndex || '1000',
                maximized: modal.classList.contains('maximized'),
                minimized: modal.classList.contains('minimized')
            };

            if (modal.id.startsWith('image-modal-')) {
                const img = modal.querySelector('.image-viewer');
                if (img) {
                    modalData.imageData = img.src;
                    modalData.imageTitle = img.dataset.filename || '圖片';
                    modalData.isDynamic = true;
                }
            }

            modalStates.push(modalData);
        }
    });

    // 壓縮畫布資料
    let canvasDataUrl = canvas.toDataURL('image/png');
    console.log('畫布資料大小:', canvasDataUrl.length, '字元');

    return {
        version: '2.0',
        timestamp: new Date().toISOString(),
        modals: modalStates,
        data: {
            scores: scores,
            todoItems: todoItems,
            lotteryDrawn: lotteryDrawn,
            lotteryTotal: document.getElementById('lottery-total').value
        },
        timer: {
            seconds: timerSeconds,
            display: document.getElementById('timer-display').textContent
        },
        inputs: {
            wheelOptions: document.getElementById('wheel-options').value,
            customTimer: document.getElementById('custom-timer').value
        },
        marquee: {
            text: document.getElementById('marquee-input') ? document.getElementById('marquee-input').value : '',
            position: document.getElementById('marquee-position') ? document.getElementById('marquee-position').value : 'middle',
            size: document.getElementById('marquee-size') ? document.getElementById('marquee-size').value : '48',
            color: document.getElementById('marquee-color') ? document.getElementById('marquee-color').value : '#ff0000',
            speed: document.getElementById('marquee-speed') ? document.getElementById('marquee-speed').value : '15',
            active: document.getElementById('marquee-container') ? document.getElementById('marquee-container').classList.contains('active') : false
        },
        settings: {
            toolbarPosition: document.getElementById('toolbar-position').value,
            defaultColor: document.getElementById('default-color').value,
            palmRejection: palmRejection
        },
        canvasData: canvasDataUrl,
        bgUrl: document.getElementById('bg-url').value || '',
        htmlItems: htmlItems,
        pdfItems: pdfItems,
        imageItems: collectImageItems(),
        webItems: webItems,
        mindmapItems: mindmapItems,
        noteItems: noteItems
    };
}

// 重新整理雲端清單
async function refreshCloudList() {
    showLoading();

    try {
        const response = await fetch(API_BASE);

        const result = await response.json();

        if (result.success) {
            renderCloudSaveList(result.saves);
        } else {
            alert('讀取清單失敗：' + result.error);
        }
    } catch (error) {
        alert('錯誤：' + error.message);
    }

    hideLoading();
}

// 渲染雲端存檔清單
function renderCloudSaveList(saves) {
    const listEl = document.getElementById('cloud-save-list');

    if (!saves || saves.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">目前沒有雲端存檔</div>';
        return;
    }

    // 以 DOM 建立清單，名稱含引號等特殊字元時按鈕也能正常運作
    listEl.innerHTML = '';
    saves.forEach(save => {
        const item = document.createElement('div');
        item.className = 'cloud-save-item';
        item.innerHTML = `
            <div class="cloud-save-info">
                <div class="cloud-save-name"></div>
                <div class="cloud-save-date"></div>
            </div>
            <div class="cloud-save-actions">
                <button class="gas-btn-success">載入</button>
                <button class="gas-btn-rename edit-only">改名</button>
                <button class="gas-btn-danger edit-only">刪除</button>
            </div>
        `;
        item.querySelector('.cloud-save-name').textContent = save.name;
        item.querySelector('.cloud-save-date').textContent = '更新：' + save.updatedAt;
        const [loadBtn, renameBtn, deleteBtn] = item.querySelectorAll('button');
        loadBtn.onclick = () => cloudLoad(save.id);
        renameBtn.onclick = () => cloudRename(save.id, save.name);
        deleteBtn.onclick = () => cloudDelete(save.id, save.name);
        listEl.appendChild(item);
    });
}

// 修改雲端存檔名稱（只改名稱，不改內容與更新時間）
async function cloudRename(saveId, oldName) {
    if (!requireEditor()) return false;
    const input = prompt('輸入新的存檔名稱', oldName);
    if (input === null) return false;
    const name = input.trim();
    if (!name || name === oldName) return false;

    try {
        const response = await fetch(API_BASE + '/' + encodeURIComponent(saveId) + '?name=' + encodeURIComponent(name), {
            method: 'PATCH',
            headers: authHeaders()
        });
        const result = await response.json();
        if (handleNeedLogin(result)) return false;
        if (!result.success) throw new Error(result.error);

        if (saveId === currentSaveId) setCurrentSave(saveId, name);
        if (document.getElementById('cloud-load-modal').classList.contains('active')) refreshCloudList();
        return true;
    } catch (error) {
        alert('改名失敗：' + error.message);
        return false;
    }
}

// 雲端讀檔（fromStartup 為 true 時不詢問確認、不顯示成功訊息）
async function cloudLoad(saveId, fromStartup) {
    if (!fromStartup && !confirm('確定要載入此存檔嗎？目前的資料將被覆蓋。')) {
        return false;
    }
    let loaded = false;

    showLoading();

    try {
        const response = await fetch(API_BASE + '/' + encodeURIComponent(saveId));

        const result = await response.json();

        if (result.success) {
            // 套用載入的狀態
            applyLoadedState(result.state);
            setCurrentSave(saveId, result.name);
            markScreenSaved();
            loaded = true;
            if (!fromStartup) alert('載入成功！');
            closeModal('cloud-load-modal');
        } else {
            alert('載入失敗：' + result.error);
        }
    } catch (error) {
        alert('錯誤：' + error.message);
    }

    hideLoading();
    return loaded;
}

// 套用載入的狀態
function applyLoadedState(state) {
    // 關閉所有目前開啟的模組
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.id.startsWith('image-modal-') || modal.id.startsWith('html-modal-') || modal.id.startsWith('pdf-modal-') || modal.id.startsWith('web-modal-') || modal.id.startsWith('mindmap-modal-') || modal.id.startsWith('note-modal-')) {
            modal.remove();
        } else {
            modal.classList.remove('active', 'maximized', 'minimized');
        }
    });

    // 移除所有可拖曳的圖片
    document.querySelectorAll('.draggable-image-container').forEach(container => {
        container.remove();
    });

    // 還原資料
    if (state.data) {
        scores = state.data.scores || [0, 0, 0, 0, 0, 0];
        todoItems = state.data.todoItems || [];
        lotteryDrawn = state.data.lotteryDrawn || [];

        initScoreboard();
        renderTodos();

        if (state.data.lotteryTotal) {
            document.getElementById('lottery-total').value = state.data.lotteryTotal;
        }
        document.getElementById('lottery-history').innerHTML =
            lotteryDrawn.map(n => '<span class="lottery-number">' + n + '</span>').join('');
    }

    // 還原上傳的 HTML
    restoreHtmlItems(state.htmlItems);

    // 還原心智圖
    restoreMindmapItems(state.mindmapItems);

    // 還原文字便利貼
    restoreNoteItems(state.noteItems);

    // 還原 PDF（含舊版只有一份 PDF 的存檔）
    restorePdfItems(state.pdfItems, state.inputs);

    // 還原圖片與網頁清單（含舊版存檔的可拖曳圖片、書籤與網頁瀏覽器網址）
    restoreImageItems(state.imageItems, state.modals);
    restoreWebItems(state.webItems, state);

    // 還原計時器
    if (state.timer) {
        timerSeconds = state.timer.seconds || 0;
        updateTimerDisplay();
    }

    // 還原輸入欄位
    if (state.inputs) {
        if (state.inputs.wheelOptions) {
            document.getElementById('wheel-options').value = state.inputs.wheelOptions;
            updateWheel(); // 更新轉盤
        }
        if (state.inputs.customTimer) document.getElementById('custom-timer').value = state.inputs.customTimer;
    }

    // 還原跑馬燈
    if (state.marquee) {
        if (document.getElementById('marquee-input')) {
            document.getElementById('marquee-input').value = state.marquee.text || '';
            document.getElementById('marquee-position').value = state.marquee.position || 'middle';
            document.getElementById('marquee-size').value = state.marquee.size || '48';
            document.getElementById('marquee-color').value = state.marquee.color || '#ff0000';
            document.getElementById('marquee-speed').value = state.marquee.speed || '15';
        }
    }

    // 還原設定
    if (state.settings) {
        document.getElementById('toolbar-position').value = state.settings.toolbarPosition || 'left';
        document.getElementById('default-color').value = state.settings.defaultColor || '#ff0000';
        palmRejection = state.settings.palmRejection || false;
        document.getElementById('palm-rejection').checked = palmRejection;
        setToolbarPosition();
        setColor(state.settings.defaultColor || '#ff0000');
    }

    // 還原開啟的模組視窗和可拖曳圖片
    if (state.modals) {
        state.modals.forEach(modalState => {
            // 處理可拖曳的圖片（新版）
            // 判斷條件：有 isDraggableImage 標記，或 ID 以 'draggable-image-' 開頭
            if ((modalState.isDraggableImage || modalState.id.startsWith('draggable-image-')) && modalState.imageData) {
                // 舊版可拖曳圖片已由 restoreImageItems() 轉成圖片清單
            }
            // 處理 modal 視窗中的圖片（舊版）- 僅用於舊格式的 image-modal
            else if (modalState.isDynamic && modalState.imageData && modalState.id.startsWith('image-modal-')) {
                const modal = document.createElement('div');
                modal.className = 'modal active image-window';
                modal.id = modalState.id;
                modal.innerHTML = `
                    <div class="image-container">
                        <button class="image-close-btn" onclick="document.getElementById('${modalState.id}').remove()" title="關閉"></button>
                        <img src="${modalState.imageData}" class="image-viewer" data-filename="${modalState.imageTitle || '圖片'}">
                    </div>
                `;
                document.body.appendChild(modal);

                if (modalState.left) modal.style.left = modalState.left;
                if (modalState.top) modal.style.top = modalState.top;
                if (modalState.width) modal.style.width = modalState.width;
                if (modalState.height) modal.style.height = modalState.height;
                if (modalState.zIndex) modal.style.zIndex = modalState.zIndex;

                if (!modalState.left || !modalState.top) {
                    modal.style.left = (window.innerWidth - modal.offsetWidth) / 2 + 'px';
                    modal.style.top = (window.innerHeight - modal.offsetHeight) / 2 + 'px';
                }

                if (modalState.maximized) modal.classList.add('maximized');
                if (modalState.minimized) modal.classList.add('minimized');

                makeDraggable(modal);
                makeResizable(modal);
            }
            // 處理一般的 modal 視窗（排除圖片相關的 ID）
            else if (!modalState.id.startsWith('draggable-image-') && !modalState.id.startsWith('image-modal-')) {
                const modal = document.getElementById(modalState.id) || createHtmlModalById(modalState.id) || createPdfModalById(modalState.id) || createWebModalById(modalState.id) || createMindmapModalById(modalState.id) || createNoteModalById(modalState.id);
                if (modal) {
                    modal.classList.add('active');

                    if (modalState.left) modal.style.left = modalState.left;
                    if (modalState.top) modal.style.top = modalState.top;
                    if (modalState.width) modal.style.width = modalState.width;
                    if (modalState.height) modal.style.height = modalState.height;
                    if (modalState.zIndex) modal.style.zIndex = modalState.zIndex;

                    if (!modalState.left || !modalState.top) {
                        modal.style.left = (window.innerWidth - modal.offsetWidth) / 2 + 'px';
                        modal.style.top = (window.innerHeight - modal.offsetHeight) / 2 + 'px';
                    }

                    if (modalState.maximized) modal.classList.add('maximized');
                    if (modalState.minimized) modal.classList.add('minimized');

                    makeDraggable(modal);
                    makeResizable(modal);
                }
            }
        });
    }

    // 還原畫布資料
    if (state.canvasData) {
        const img = new Image();
        img.onload = function() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = state.canvasData;
    }

    // 還原網頁背景
    if (state.bgUrl) {
        document.getElementById('bg-url').value = state.bgUrl;
        setBgUrl();
    } else {
        clearBgUrl();
    }

    // 儲存到 localStorage
    saveData();
    saveSettings();
}

// 雲端刪除
async function cloudDelete(saveId, saveName) {
    if (!requireEditor()) return;
    if (!confirm('確定要刪除存檔「' + saveName + '」嗎？此操作無法復原。')) {
        return;
    }

    showLoading();

    try {
        const response = await fetch(API_BASE + '/' + encodeURIComponent(saveId), {
            method: 'DELETE',
            headers: authHeaders()
        });

        const result = await response.json();

        if (result.success) {
            if (saveId === currentSaveId) setCurrentSave(null);
            alert('刪除成功！');
            refreshCloudList();
        } else if (!handleNeedLogin(result)) {
            alert('刪除失敗：' + result.error);
        }
    } catch (error) {
        alert('錯誤：' + error.message);
    }

    hideLoading();
}

// 產生分享連結：分享目前開啟的存檔（產生前先把目前畫面更新到雲端）
async function generateShareLink() {
    if (isEditor()) {
        if (!await cloudUpdate(true)) return;
    } else if (!currentSaveId) {
        alert('目前沒有開啟雲端存檔，無法分享。');
        return;
    }

    showLoading();

    try {
        const longUrl = getScreenUrl(currentSaveId);

        // 使用 is.gd 短網址服務
        const shortUrlResponse = await fetch('https://is.gd/create.php?format=json&url=' + encodeURIComponent(longUrl));
        const shortUrlResult = await shortUrlResponse.json();

        let finalUrl = longUrl;
        if (shortUrlResult.shorturl) {
            finalUrl = shortUrlResult.shorturl;
        }

        // 顯示 QR Code、短網址和原始連結
        const qrSection = document.getElementById('qr-section');
        const qrImg = document.getElementById('qr-code-img');
        const shareUrlInput = document.getElementById('share-url');
        const originalUrlInput = document.getElementById('original-url');

        qrImg.src = 'https://quickchart.io/qr?text=' + encodeURIComponent(finalUrl) + '&size=200';
        shareUrlInput.value = finalUrl;
        originalUrlInput.value = longUrl;
        qrSection.style.display = 'block';

    } catch (error) {
        alert('產生分享連結失敗：' + error.message);
    }

    hideLoading();
}

// 複製短網址
function copyShareUrl() {
    const shareUrlInput = document.getElementById('share-url');
    shareUrlInput.select();
    document.execCommand('copy');
    alert('短網址已複製到剪貼簿！');
}

// 複製原始連結
function copyOriginalUrl() {
    const originalUrlInput = document.getElementById('original-url');
    originalUrlInput.select();
    document.execCommand('copy');
    alert('原始連結已複製到剪貼簿！');
}

// ===== 自動雲端存檔 =====
// 每隔設定的時間檢查一次，只有畫面有變更時才存檔；新畫面第一次自動存檔時建立「自動存檔 日期時間」
let autoSaveTimer = null;
let autoSaving = false;
let autoSaveHideTimer = null;

function setAutoSaveInterval(minutes) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = minutes > 0 ? setInterval(autoSave, minutes * 60 * 1000) : null;
}

async function autoSave() {
    // 尚未選擇畫面（啟動圖層顯示中）或正在存檔時略過
    if (autoSaving || lastSavedContent === null || !isEditor()) return;

    const content = JSON.stringify(collectCurrentState());
    if (screenFingerprint(content) === lastSavedContent) return;

    autoSaving = true;
    const time = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const name = currentSaveName || '自動存檔 ' + new Date().toLocaleString('zh-TW', { hour12: false });
    try {
        const result = await putStateToCloud(currentSaveId, name, content);
        if (!result.success) throw new Error(result.error);
        if (!currentSaveId) setCurrentSave(result.saveId, name);
        lastSavedContent = screenFingerprint(content);
        showAutoSaveStatus('☁️ 已自動存檔 ' + time, false);
    } catch (error) {
        showAutoSaveStatus('⚠️ 自動存檔失敗（' + time + '）：' + error.message, true);
    }
    autoSaving = false;
}

// 右下角顯示自動存檔狀態；成功訊息幾秒後淡出，失敗訊息保留到下次成功
function showAutoSaveStatus(text, isError) {
    const el = document.getElementById('autosave-indicator');
    el.textContent = text;
    el.classList.toggle('error', isError);
    el.classList.add('visible');
    clearTimeout(autoSaveHideTimer);
    if (!isError) autoSaveHideTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}
