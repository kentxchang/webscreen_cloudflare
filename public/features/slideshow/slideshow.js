// ===== 依序呈現 =====
// 列出畫面上顯示中的物件（視窗、PDF、網頁、HTML、圖片），勾選並排序後依序佔滿畫面呈現
let slideshowOrder = [];               // 物件元素 id 的排列順序（記住上次的順序）
const slideshowUnchecked = new Set();  // 取消勾選的物件
let slideshowList = [];                // 呈現中的物件 id
let slideshowIndex = 0;
let slideshowPrevState = null;         // 目前呈現物件原本的狀態，離開時還原

function isImageObject(el) {
    return el.classList.contains('draggable-image-container');
}

// 畫面上顯示中的物件，依上次排好的順序；新出現的物件排在後面
function getScreenObjects() {
    const objects = Array.from(document.querySelectorAll('.modal.active, .draggable-image-container'))
        .filter(el => el.id);
    const rank = id => {
        const index = slideshowOrder.indexOf(id);
        return index < 0 ? Infinity : index;
    };
    return objects.sort((a, b) => rank(a.id) - rank(b.id));
}

function describeObject(el) {
    if (isImageObject(el)) {
        const img = el.querySelector('img');
        return { icon: '🖼️', name: (img && img.alt) || '圖片' };
    }
    const title = el.querySelector('.modal-title');
    const icon = el.id.startsWith('pdf-modal-') ? '📄'
        : el.id.startsWith('web-modal-') ? '🌐'
        : el.id.startsWith('html-modal-') ? '🧩'
        : el.id.startsWith('mindmap-modal-') ? '🧠'
        : el.id.startsWith('note-modal-') ? '🗒️'
        : el.id.startsWith('image-modal-') ? '🖼️'
        : '🪟';
    return { icon: icon, name: (title && title.textContent) || el.id };
}

function openSlideshowLayer() {
    renderSlideshowList();
    document.getElementById('slideshow-layer').classList.add('active');
}

function closeSlideshowLayer() {
    document.getElementById('slideshow-layer').classList.remove('active');
}

function renderSlideshowList() {
    const objects = getScreenObjects();
    slideshowOrder = objects.map(el => el.id);

    const listEl = document.getElementById('slideshow-list');
    listEl.innerHTML = '';
    objects.forEach((el, i) => {
        const info = describeObject(el);
        const checked = !slideshowUnchecked.has(el.id);
        const row = document.createElement('div');
        row.className = 'manage-item slideshow-item' + (checked ? '' : ' unchecked');
        row.innerHTML = `
            <input type="checkbox" ${checked ? 'checked' : ''} title="是否呈現">
            <span class="slideshow-item-icon"></span>
            <div class="manage-item-info">
                <div class="manage-item-name"></div>
                <div class="manage-item-state">第 ${i + 1} 個</div>
            </div>
            <div class="manage-item-actions">
                <button title="往前" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button title="往後" ${i === objects.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
        `;
        row.querySelector('.slideshow-item-icon').textContent = info.icon;
        row.querySelector('.manage-item-name').textContent = info.name;
        row.querySelector('input').onchange = e => {
            if (e.target.checked) slideshowUnchecked.delete(el.id);
            else slideshowUnchecked.add(el.id);
            renderSlideshowList();
        };
        const [upBtn, downBtn] = row.querySelectorAll('.manage-item-actions button');
        upBtn.onclick = () => moveSlideshowItem(i, -1);
        downBtn.onclick = () => moveSlideshowItem(i, 1);
        listEl.appendChild(row);
    });

    document.getElementById('slideshow-count').textContent =
        objects.filter(el => !slideshowUnchecked.has(el.id)).length;
}

function moveSlideshowItem(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= slideshowOrder.length) return;
    [slideshowOrder[index], slideshowOrder[target]] = [slideshowOrder[target], slideshowOrder[index]];
    renderSlideshowList();
}

function startSlideshow() {
    slideshowList = slideshowOrder.filter(id => !slideshowUnchecked.has(id));
    if (slideshowList.length === 0) {
        alert('請至少勾選一個物件');
        return;
    }
    closeSlideshowLayer();
    document.getElementById('slideshow-bar').classList.add('active');
    showSlide(0);
}

function isOnScreen(id) {
    const el = document.getElementById(id);
    return !!el && (isImageObject(el) || el.classList.contains('active'));
}

function showSlide(index) {
    leaveCurrentSlide();

    // 呈現中被關掉的物件自動略過
    const currentId = slideshowList[index];
    slideshowList = slideshowList.filter(isOnScreen);
    if (slideshowList.length === 0) {
        endSlideshow();
        return;
    }
    const kept = slideshowList.indexOf(currentId);
    slideshowIndex = kept >= 0 ? kept : Math.max(0, Math.min(index, slideshowList.length - 1));

    const el = document.getElementById(slideshowList[slideshowIndex]);
    slideshowPrevState = {
        id: el.id,
        maximized: el.classList.contains('maximized'),
        minimized: el.classList.contains('minimized')
    };
    el.classList.add('slideshow-current');
    if (!isImageObject(el)) {
        // 同時加上 maximized，讓計時器、時鐘等視窗的內容也以最大化樣式顯示
        el.classList.add('maximized');
        el.classList.remove('minimized');
    }

    document.getElementById('slideshow-info').textContent =
        (slideshowIndex + 1) + ' / ' + slideshowList.length + '　' + describeObject(el).name;
    document.getElementById('slideshow-prev').disabled = slideshowIndex === 0;
    document.getElementById('slideshow-next').disabled = slideshowIndex === slideshowList.length - 1;
}

function leaveCurrentSlide() {
    if (!slideshowPrevState) return;
    const el = document.getElementById(slideshowPrevState.id);
    if (el) {
        el.classList.remove('slideshow-current');
        if (!isImageObject(el)) {
            el.classList.toggle('maximized', slideshowPrevState.maximized);
            el.classList.toggle('minimized', slideshowPrevState.minimized);
        }
    }
    slideshowPrevState = null;
}

function slideshowStep(delta) {
    showSlide(slideshowIndex + delta);
}

function endSlideshow() {
    leaveCurrentSlide();
    slideshowList = [];
    document.getElementById('slideshow-bar').classList.remove('active');
}

// Esc 結束依序呈現
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('slideshow-bar').classList.contains('active')) endSlideshow();
});

// 呈現中的圖片不可拖曳（避免改到原本的位置）；滑鼠與觸控都要攔
['mousedown', 'touchstart'].forEach(type => {
    document.addEventListener(type, e => {
        if (e.target.closest('.draggable-image-container.slideshow-current')) e.stopPropagation();
    }, true);
});
