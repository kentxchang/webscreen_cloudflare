// ===== 初始化（所有子功能載入後由 index.html 呼叫）=====
function initApp() {
    initToolbar();
    initCanvas();
    loadSettings();
    loadData();
    initScoreboard();
    initWheel();
    initDragAndDrop();
    initSidebarDragScroll();

    // 依網址開啟分享的存檔，或顯示開新畫面/開啟舊存檔選擇圖層
    initStartup();

    // 防止右鍵選單
    document.addEventListener('contextmenu', e => e.preventDefault());
}

// 顯示/隱藏載入動畫
function showLoading() {
    document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
}

// ===== 側邊欄控制 =====
function toggleSidebarPosition() {
    const sidebar = document.getElementById('sidebar');
    const showBtn = document.getElementById('show-sidebar-btn');

    if (sidebar.classList.contains('left')) {
        // 從左側切換到右側
        sidebar.classList.remove('left');
        sidebar.classList.add('right');
        showBtn.style.left = 'auto';
        showBtn.style.right = '10px';
        showBtn.style.top = '10px';
        showBtn.style.bottom = 'auto';
    } else if (sidebar.classList.contains('right')) {
        // 從右側切換到底部
        sidebar.classList.remove('right');
        sidebar.classList.add('bottom');
        showBtn.style.left = '50%';
        showBtn.style.right = 'auto';
        showBtn.style.top = 'auto';
        showBtn.style.bottom = '10px';
        showBtn.style.transform = 'translateX(-50%)';
    } else {
        // 從底部切換回左側
        sidebar.classList.remove('bottom');
        sidebar.classList.add('left');
        showBtn.style.left = '10px';
        showBtn.style.right = 'auto';
        showBtn.style.top = '10px';
        showBtn.style.bottom = 'auto';
        showBtn.style.transform = 'none';
    }
}

function hideSidebar() {
    const sidebar = document.getElementById('sidebar');
    const showBtn = document.getElementById('show-sidebar-btn');

    sidebar.classList.add('hidden');
    showBtn.style.display = 'flex';

    // 根據側邊欄當前位置設置顯示按鈕位置
    if (sidebar.classList.contains('left')) {
        showBtn.style.left = '10px';
        showBtn.style.right = 'auto';
        showBtn.style.top = '10px';
        showBtn.style.bottom = 'auto';
        showBtn.style.transform = 'none';
    } else if (sidebar.classList.contains('right')) {
        showBtn.style.left = 'auto';
        showBtn.style.right = '10px';
        showBtn.style.top = '10px';
        showBtn.style.bottom = 'auto';
        showBtn.style.transform = 'none';
    } else if (sidebar.classList.contains('bottom')) {
        showBtn.style.left = '50%';
        showBtn.style.right = 'auto';
        showBtn.style.top = 'auto';
        showBtn.style.bottom = '10px';
        showBtn.style.transform = 'translateX(-50%)';
    }
}

function showSidebar() {
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('show-sidebar-btn').style.display = 'none';
}

// ===== 工具列：分類選單、釘選常用工具、自動隱藏 =====
// 各分類的工具寫在 core.html 的 .sidebar-section（data-category、data-icon）。
// 初始化時把它們移到彈出面板（#tool-flyout），側邊欄只顯示釘選的工具與分類按鈕。
const DEFAULT_PINNED_TOOLS = ['繪圖模式', '計時器', '抽籤', 'PDF']; // 以按鈕的 title 識別
let openCategorySection = null;
let sidebarAutoHide = false;
let sidebarCollapseTimer = null;

function initToolbar() {
    const sidebar = document.getElementById('sidebar');
    const flyout = document.createElement('div');
    flyout.className = 'tool-flyout';
    flyout.id = 'tool-flyout';
    document.body.appendChild(flyout);

    const categoriesEl = document.getElementById('sidebar-categories');
    sidebar.querySelectorAll('.sidebar-section[data-category]').forEach(section => {
        flyout.appendChild(section);

        // 每個工具加上釘選星號；選了工具後收起面板
        section.querySelectorAll('.sidebar-item').forEach(item => {
            const btn = item.querySelector('.sidebar-btn');
            const pin = document.createElement('button');
            pin.className = 'tool-pin';
            pin.onclick = e => {
                e.stopPropagation();
                togglePinnedTool(btn.title);
            };
            item.appendChild(pin);
            btn.addEventListener('click', () => {
                closeToolFlyout();
                syncPinnedActive();
            });
        });

        // 分類按鈕
        const cat = document.createElement('div');
        cat.className = 'sidebar-item category-item';
        cat.style.background = getComputedStyle(section).backgroundColor;
        cat.innerHTML = '<button class="sidebar-btn category-btn"><span></span></button><span class="sidebar-label"></span>';
        const catBtn = cat.querySelector('.category-btn');
        catBtn.title = section.dataset.category;
        catBtn.querySelector('span').textContent = section.dataset.icon;
        cat.querySelector('.sidebar-label').textContent = section.dataset.category;
        catBtn.onclick = () => toggleToolFlyout(section, cat);
        categoriesEl.appendChild(cat);
    });

    renderPinnedTools();
    initSidebarAutoHide();

    // 點面板與側邊欄以外的地方、或按 Esc，收起面板
    document.addEventListener('pointerdown', e => {
        if (e.target.closest('#tool-flyout, #sidebar')) return;
        closeToolFlyout();
        collapseSidebar();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeToolFlyout();
    });
}

function toggleToolFlyout(section, categoryItem) {
    if (openCategorySection === section) {
        closeToolFlyout();
        return;
    }

    const flyout = document.getElementById('tool-flyout');
    flyout.querySelectorAll('.sidebar-section').forEach(s => s.classList.toggle('open', s === section));
    document.querySelectorAll('.category-item').forEach(c => c.classList.toggle('active', c === categoryItem));
    flyout.classList.add('active');
    openCategorySection = section;
    positionToolFlyout(categoryItem);
}

function closeToolFlyout() {
    if (!openCategorySection) return;
    document.getElementById('tool-flyout').classList.remove('active');
    document.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
    openCategorySection = null;
    scheduleSidebarCollapse();
}

// 面板放在分類按鈕旁邊：工具列在左／右時放在旁邊，在底部時放在上方
function positionToolFlyout(categoryItem) {
    const flyout = document.getElementById('tool-flyout');
    const sidebar = document.getElementById('sidebar');
    const bar = sidebar.getBoundingClientRect();
    const btn = categoryItem.getBoundingClientRect();
    const gap = 8;

    flyout.style.left = flyout.style.right = flyout.style.top = flyout.style.bottom = 'auto';
    const width = flyout.offsetWidth;
    const height = flyout.offsetHeight;
    const clamp = (value, max) => Math.max(gap, Math.min(value, max - gap));

    if (sidebar.classList.contains('bottom')) {
        flyout.style.bottom = (window.innerHeight - bar.top + gap) + 'px';
        flyout.style.left = clamp(btn.left + btn.width / 2 - width / 2, window.innerWidth - width) + 'px';
    } else {
        flyout.style.top = clamp(btn.top, window.innerHeight - height) + 'px';
        if (sidebar.classList.contains('right')) {
            flyout.style.right = (window.innerWidth - bar.left + gap) + 'px';
        } else {
            flyout.style.left = (bar.right + gap) + 'px';
        }
    }
}

// ===== 釘選常用工具（記在這台電腦的瀏覽器中） =====
function getPinnedTools() {
    try {
        const saved = JSON.parse(localStorage.getItem('pinnedTools'));
        if (Array.isArray(saved)) return saved;
    } catch (e) { /* 使用預設值 */ }
    return DEFAULT_PINNED_TOOLS;
}

function togglePinnedTool(title) {
    const pinned = getPinnedTools().slice();
    const index = pinned.indexOf(title);
    if (index >= 0) pinned.splice(index, 1);
    else pinned.push(title);
    localStorage.setItem('pinnedTools', JSON.stringify(pinned));
    renderPinnedTools();
}

function findFlyoutTool(title) {
    return Array.from(document.querySelectorAll('#tool-flyout .sidebar-item'))
        .find(item => item.querySelector('.sidebar-btn').title === title);
}

function renderPinnedTools() {
    const pinned = getPinnedTools();
    const container = document.getElementById('sidebar-pinned');
    container.innerHTML = '';

    pinned.forEach(title => {
        const source = findFlyoutTool(title);
        if (!source) return;
        const sourceBtn = source.querySelector('.sidebar-btn');

        // 釘選按鈕是彈出面板中工具的捷徑，按下時觸發原本的按鈕
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (source.classList.contains('edit-only') ? ' edit-only' : '');
        const btn = document.createElement('button');
        btn.className = 'sidebar-btn';
        btn.title = title;
        btn.dataset.pinned = title;
        btn.innerHTML = sourceBtn.innerHTML;
        btn.onclick = () => sourceBtn.click();
        const label = document.createElement('span');
        label.className = 'sidebar-label';
        label.textContent = source.querySelector('.sidebar-label').textContent;
        item.appendChild(btn);
        item.appendChild(label);
        container.appendChild(item);
    });
    container.style.display = container.children.length ? '' : 'none';

    document.querySelectorAll('#tool-flyout .sidebar-item').forEach(item => {
        const isPinned = pinned.includes(item.querySelector('.sidebar-btn').title);
        const pin = item.querySelector('.tool-pin');
        pin.classList.toggle('pinned', isPinned);
        pin.title = isPinned ? '取消釘選' : '釘選到工具列';
    });
    syncPinnedActive();
}

// 讓釘選按鈕跟原本的按鈕同步「啟用中」狀態（例如畫筆）
function syncPinnedActive() {
    document.querySelectorAll('#sidebar-pinned .sidebar-btn').forEach(btn => {
        const source = findFlyoutTool(btn.dataset.pinned);
        if (source) btn.classList.toggle('active', source.querySelector('.sidebar-btn').classList.contains('active'));
    });
}

// ===== 自動隱藏：平常縮在畫面邊緣，滑鼠移過去或點一下就展開 =====
function initSidebarAutoHide() {
    const sidebar = document.getElementById('sidebar');
    const flyout = document.getElementById('tool-flyout');

    sidebar.addEventListener('pointerenter', expandSidebar);
    flyout.addEventListener('pointerenter', expandSidebar);
    const leave = e => {
        if (e.pointerType === 'mouse') scheduleSidebarCollapse();
    };
    sidebar.addEventListener('pointerleave', leave);
    flyout.addEventListener('pointerleave', leave);
}

function setSidebarAutoHide(enabled) {
    sidebarAutoHide = enabled;
    if (enabled) collapseSidebar();
    else expandSidebar();
}

function expandSidebar() {
    clearTimeout(sidebarCollapseTimer);
    document.getElementById('sidebar').classList.remove('tucked');
}

function collapseSidebar() {
    if (!sidebarAutoHide || openCategorySection) return;
    document.getElementById('sidebar').classList.add('tucked');
}

function scheduleSidebarCollapse() {
    clearTimeout(sidebarCollapseTimer);
    sidebarCollapseTimer = setTimeout(() => {
        // 滑鼠還在工具列或面板上時不收起
        if (document.querySelector('#sidebar:hover, #tool-flyout:hover')) return;
        collapseSidebar();
    }, 800);
}

// ===== 側邊欄拖動捲動功能 =====
function initSidebarDragScroll() {
    const sidebar = document.getElementById('sidebar');
    let isDown = false;
    let startX, startY;
    let scrollLeft, scrollTop;
    let isDragging = false;

    sidebar.addEventListener('mousedown', function(e) {
        // 如果點擊的是按鈕，不觸發拖動
        if (e.target.closest('.sidebar-btn') ||
            e.target.closest('.sidebar-item') ||
            e.target.closest('button')) {
            return;
        }

        isDown = true;
        isDragging = false;
        sidebar.style.cursor = 'grabbing';
        startX = e.pageX - sidebar.offsetLeft;
        startY = e.pageY - sidebar.offsetTop;
        scrollLeft = sidebar.scrollLeft;
        scrollTop = sidebar.scrollTop;
    });

    sidebar.addEventListener('mouseleave', function() {
        isDown = false;
        sidebar.style.cursor = 'grab';
    });

    sidebar.addEventListener('mouseup', function() {
        isDown = false;
        sidebar.style.cursor = 'grab';
    });

    sidebar.addEventListener('mousemove', function(e) {
        if (!isDown) return;
        e.preventDefault();
        isDragging = true;

        if (sidebar.classList.contains('bottom')) {
            // 底部模式：橫向捲動
            const x = e.pageX - sidebar.offsetLeft;
            const walk = (x - startX) * 2; // 速度倍數
            sidebar.scrollLeft = scrollLeft - walk;
        } else {
            // 左右模式：垂直捲動
            const y = e.pageY - sidebar.offsetTop;
            const walk = (y - startY) * 2; // 速度倍數
            sidebar.scrollTop = scrollTop - walk;
        }
    });

    // 觸控支援
    sidebar.addEventListener('touchstart', function(e) {
        if (e.target.closest('.sidebar-btn') ||
            e.target.closest('.sidebar-item') ||
            e.target.closest('button')) {
            return;
        }

        isDown = true;
        isDragging = false;
        const touch = e.touches[0];
        startX = touch.pageX - sidebar.offsetLeft;
        startY = touch.pageY - sidebar.offsetTop;
        scrollLeft = sidebar.scrollLeft;
        scrollTop = sidebar.scrollTop;
    }, { passive: true });

    sidebar.addEventListener('touchmove', function(e) {
        if (!isDown) return;
        isDragging = true;
        const touch = e.touches[0];

        if (sidebar.classList.contains('bottom')) {
            // 底部模式：橫向捲動
            const x = touch.pageX - sidebar.offsetLeft;
            const walk = (x - startX) * 2;
            sidebar.scrollLeft = scrollLeft - walk;
        } else {
            // 左右模式：垂直捲動
            const y = touch.pageY - sidebar.offsetTop;
            const walk = (y - startY) * 2;
            sidebar.scrollTop = scrollTop - walk;
        }
    }, { passive: true });

    sidebar.addEventListener('touchend', function() {
        isDown = false;
    });

    // 滑鼠滾輪橫向捲動支援（僅底部模式）
    sidebar.addEventListener('wheel', function(e) {
        if (!sidebar.classList.contains('bottom')) {
            return;
        }

        e.preventDefault();
        sidebar.scrollLeft += e.deltaY;
    }, { passive: false });

    // 更新游標樣式
    sidebar.style.cursor = 'grab';

    // 當切換模式時，更新游標樣式
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
                sidebar.style.cursor = 'grab';
            }
        });
    });

    observer.observe(sidebar, { attributes: true });
}

function toggleSize() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('mini');
}

// ===== 視窗系統 =====
function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('active');
    bringToFront(modal);

    // 置中
    if (!modal.style.left || modal.style.left === 'auto') {
        modal.style.left = (window.innerWidth - modal.offsetWidth) / 2 + 'px';
        modal.style.top = (window.innerHeight - modal.offsetHeight) / 2 + 'px';
    }

    makeDraggable(modal);
    makeResizable(modal);
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.getElementById(id).classList.remove('minimized');
    document.getElementById(id).classList.remove('maximized');
}

function minimizeModal(btn) {
    const modal = btn.closest('.modal');
    modal.classList.toggle('minimized');
    if (modal.classList.contains('maximized')) {
        modal.classList.remove('maximized');
    }
}

function maximizeModal(btn) {
    const modal = btn.closest('.modal');

    if (modal.classList.contains('maximized')) {
        // 還原到原本大小
        modal.classList.remove('maximized');
        // 還原位置
        if (modal.dataset.originalLeft) {
            modal.style.left = modal.dataset.originalLeft;
            modal.style.top = modal.dataset.originalTop;
        }
    } else {
        // 儲存原本位置
        modal.dataset.originalLeft = modal.style.left;
        modal.dataset.originalTop = modal.style.top;
        // 最大化
        modal.classList.add('maximized');
        modal.classList.remove('minimized');
    }
}

// 連點兩下視窗標題列：最大化／還原（與按最大化按鈕相同）
document.addEventListener('dblclick', e => {
    const header = e.target.closest('.modal-header');
    if (!header || e.target.closest('.window-btn')) return;
    const maximizeBtn = header.querySelector('.window-btn.maximize');
    if (maximizeBtn) maximizeModal(maximizeBtn);
});

function makeDraggable(modal) {
    // 防止對可拖曳圖片容器調用此函數
    if (modal.classList.contains('draggable-image-container')) {
        console.warn('makeDraggable 不應該被調用在 draggable-image-container 上');
        return;
    }

    // 對於圖片視窗，使用 image-container 作為拖曳區域
    const dragHandle = modal.classList.contains('image-window')
        ? modal.querySelector('.image-container')
        : modal.querySelector('.modal-header');

    if (!dragHandle) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    dragHandle.addEventListener('pointerdown', function(e) {
        // 排除按鈕點擊
        if (e.target.classList.contains('window-btn') ||
            e.target.classList.contains('image-close-btn')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = modal.offsetLeft;
        initialY = modal.offsetTop;
        bringToFront(modal);

        // 捕獲指標，確保滑鼠移動事件被正確追蹤
        dragHandle.setPointerCapture(e.pointerId);
    });

    dragHandle.addEventListener('pointermove', function(e) {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        modal.style.left = initialX + dx + 'px';
        modal.style.top = initialY + dy + 'px';
    });

    dragHandle.addEventListener('pointerup', function(e) {
        if (isDragging) {
            isDragging = false;
            dragHandle.releasePointerCapture(e.pointerId);
        }
    });

    dragHandle.addEventListener('pointercancel', function(e) {
        if (isDragging) {
            isDragging = false;
            dragHandle.releasePointerCapture(e.pointerId);
        }
    });
}

function makeResizable(modal) {
    // 防止對可拖曳圖片容器調用此函數
    if (modal.classList.contains('draggable-image-container')) {
        console.warn('makeResizable 不應該被調用在 draggable-image-container 上');
        return;
    }

    // 如果已經有手柄就跳過
    if (modal.querySelector('.resize-handle')) return;

    // 檢查是否為圖片視窗，如果是則獲取原始比例
    const isImageWindow = modal.classList.contains('image-window');
    const minWidth = modal.classList.contains('note-window') ? 150 : 200; // 便利貼可以縮得較窄
    let aspectRatio = null;
    if (isImageWindow) {
        aspectRatio = modal.offsetWidth / modal.offsetHeight;
    }

    // 建立四個角落的手柄
    const corners = ['nw', 'ne', 'sw', 'se'];
    corners.forEach(corner => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${corner}`;
        modal.appendChild(handle);

        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;

        handle.addEventListener('pointerdown', function(e) {
            e.stopPropagation();
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = modal.offsetWidth;
            startHeight = modal.offsetHeight;
            startLeft = modal.offsetLeft;
            startTop = modal.offsetTop;
            bringToFront(modal);

            // 更新圖片視窗的比例
            if (isImageWindow) {
                aspectRatio = startWidth / startHeight;
            }
        });

        document.addEventListener('pointermove', function(e) {
            if (!isResizing) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            if (isImageWindow && aspectRatio) {
                // 圖片視窗：保持比例調整，無尺寸限制

                // 計算新寬度
                if (corner.includes('e')) {
                    newWidth = startWidth + dx;
                } else if (corner.includes('w')) {
                    newWidth = startWidth - dx;
                }

                // 防止負數或過小的尺寸
                if (newWidth < 10) newWidth = 10;

                // 根據比例精確計算高度
                newHeight = newWidth / aspectRatio;

                // 更新位置（針對西側和北側）
                if (corner.includes('w')) {
                    newLeft = startLeft + (startWidth - newWidth);
                }
                if (corner.includes('n')) {
                    newTop = startTop + (startHeight - newHeight);
                }

                // 只設置寬度和 aspect-ratio，高度自動計算
                modal.style.width = newWidth + 'px';
                modal.style.aspectRatio = aspectRatio;
                modal.style.left = newLeft + 'px';
                modal.style.top = newTop + 'px';
            } else {
                // 一般視窗：自由調整
                if (corner.includes('e')) {
                    newWidth = Math.max(minWidth, startWidth + dx);
                }
                if (corner.includes('w')) {
                    newWidth = Math.max(minWidth, startWidth - dx);
                    newLeft = startLeft + (startWidth - newWidth);
                }
                if (corner.includes('s')) {
                    newHeight = Math.max(100, startHeight + dy);
                }
                if (corner.includes('n')) {
                    newHeight = Math.max(100, startHeight - dy);
                    newTop = startTop + (startHeight - newHeight);
                }

                modal.style.width = newWidth + 'px';
                modal.style.height = newHeight + 'px';
                modal.style.left = newLeft + 'px';
                modal.style.top = newTop + 'px';
            }
        });

        document.addEventListener('pointerup', function() {
            isResizing = false;
        });
    });
}

// let modalZIndex = 1000; // 由 bringToFront() 取代
function bringToFront(element) {
    // 從一個基礎的 z-index 開始，這個值應該比靜態元素高
    let maxZ = 1000; 
    
    // 檢查所有活動中的視窗和可拖曳的圖片
    document.querySelectorAll('.modal.active, .draggable-image-container').forEach(el => {
        // 不將元素與其自身進行比較
        if (el === element) return;
        
        const z = parseInt(el.style.zIndex, 10);
        if (!isNaN(z) && z > maxZ) {
            maxZ = z;
        }
    });

    element.style.zIndex = maxZ + 1;
}

// ===== 音效 =====
// 共用的音訊環境（每次都建立新的會在播放多次後失效）
let sharedAudioContext = null;

function getAudioContext() {
    if (!sharedAudioContext) {
        sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume();
    return sharedAudioContext;
}

// 播放一個音：frequency 頻率、duration 秒數；options：type 波形、volume 音量、delay 延遲秒數
function playTone(frequency, duration, options = {}) {
    const ctx = getAudioContext();
    const start = ctx.currentTime + (options.delay || 0);
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.type || 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.volume || 0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
}

function playSound(type) {
    // 使用 Web Audio API 生成簡單音效
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    switch(type) {
        case 'reward':
            oscillator.frequency.value = 880;
            oscillator.type = 'sine';
            break;
        case 'penalty':
            oscillator.frequency.value = 220;
            oscillator.type = 'square';
            break;
        case 'explosion':
            oscillator.frequency.value = 150;
            oscillator.type = 'sawtooth';
            break;
        case 'lottery':
            oscillator.frequency.value = 660;
            oscillator.type = 'triangle';
            break;
    }

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
}

// ===== 資料儲存 =====
function saveData() {
    localStorage.setItem('scoreboardScores', JSON.stringify(scores));
    localStorage.setItem('todoList', JSON.stringify(todoItems));
}

function loadData() {
    const savedScores = localStorage.getItem('scoreboardScores');
    if (savedScores) {
        scores = JSON.parse(savedScores);
    }

    const savedTodos = localStorage.getItem('todoList');
    if (savedTodos) {
        todoItems = JSON.parse(savedTodos);
        renderTodos();
    }
}

// Enter鍵支援
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        if (document.activeElement.id === 'todo-input') {
            addTodo();
        } else if (document.activeElement.id === 'web-add-url') {
            addWebFromUrl();
        } else if (document.activeElement.id === 'pdf-add-url') {
            addPdfFromUrl();
        }
    }
});

// ===== 共用工具 =====
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}
