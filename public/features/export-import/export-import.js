// ===== 匯出/匯入 =====
function exportState() {
    // 收集所有開啟的模組視窗狀態
    const modals = document.querySelectorAll('.modal');
    const modalStates = [];

    modals.forEach(modal => {
        // 只匯出實際開啟的視窗（有 active class）
        if (modal.classList.contains('active')) {
            // 使用實際計算值而非 style 屬性（可能為空）
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

            // 處理動態圖片視窗
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


    // 收集所有資料
    const state = {
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
            text: document.getElementById('marquee-text') ? document.getElementById('marquee-text').value : '',
            position: document.getElementById('marquee-position') ? document.getElementById('marquee-position').value : 'top',
            size: document.getElementById('marquee-size') ? document.getElementById('marquee-size').value : '48',
            color: document.getElementById('marquee-color') ? document.getElementById('marquee-color').value : '#ff0000',
            speed: document.getElementById('marquee-speed') ? document.getElementById('marquee-speed').value : '10',
            active: document.getElementById('marquee-container') ? document.getElementById('marquee-container').style.display !== 'none' : false
        },
        settings: {
            toolbarPosition: document.getElementById('toolbar-position').value,
            defaultColor: document.getElementById('default-color').value,
            palmRejection: palmRejection
        },
        canvasData: canvas.toDataURL('image/png'),
        bgUrl: document.getElementById('bg-url').value || '',
        htmlItems: htmlItems,
        pdfItems: pdfItems,
        imageItems: collectImageItems(),
        webItems: webItems,
        mindmapItems: mindmapItems,
        noteItems: noteItems
    };

    // 匯出為 JSON 檔案
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classroom-dashboard-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importState(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const state = JSON.parse(e.target.result);

            // 關閉所有目前開啟的模組
            document.querySelectorAll('.modal').forEach(modal => {
                // 移除動態建立的圖片、HTML 視窗
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
                    lotteryDrawn.map(n => `<span class="lottery-number">${n}</span>`).join('');
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
                if (state.inputs.wheelOptions) document.getElementById('wheel-options').value = state.inputs.wheelOptions;
                if (state.inputs.customTimer) document.getElementById('custom-timer').value = state.inputs.customTimer;

            }

            // 還原跑馬燈
            if (state.marquee) {
                if (document.getElementById('marquee-text')) {
                    document.getElementById('marquee-text').value = state.marquee.text || '';
                    document.getElementById('marquee-position').value = state.marquee.position || 'top';
                    document.getElementById('marquee-size').value = state.marquee.size || '48';
                    document.getElementById('marquee-color').value = state.marquee.color || '#ff0000';
                    document.getElementById('marquee-speed').value = state.marquee.speed || '10';
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

            alert('匯入成功！');
        } catch (err) {
            alert('匯入失敗：檔案格式錯誤');
            console.error(err);
        }
    };
    reader.readAsText(file);

    // 清除 input 值以便可以再次選擇相同檔案
    event.target.value = '';
}
