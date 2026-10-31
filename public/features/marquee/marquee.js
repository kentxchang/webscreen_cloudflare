// ===== 跑馬燈 =====
function startMarquee() {
    const text = document.getElementById('marquee-input').value;
    const size = document.getElementById('marquee-size').value;
    const color = document.getElementById('marquee-color').value;
    const speed = document.getElementById('marquee-speed').value;
    const position = document.getElementById('marquee-position').value;

    if (!text.trim()) {
        alert('請輸入跑馬燈文字');
        return;
    }

    const container = document.getElementById('marquee-container');
    const marqueeText = document.getElementById('marquee-text');

    // 設定文字樣式
    marqueeText.textContent = text;
    marqueeText.style.fontSize = size + 'px';
    marqueeText.style.color = color;
    marqueeText.style.animationDuration = speed + 's';

    // 設定垂直位置
    container.style.top = 'auto';
    container.style.bottom = 'auto';
    switch(position) {
        case 'top':
            container.style.top = '20px';
            break;
        case 'middle':
            container.style.top = '50%';
            container.style.transform = 'translateY(-50%)';
            break;
        case 'bottom':
            container.style.bottom = '20px';
            break;
    }

    container.classList.add('active');
}

function stopMarquee() {
    document.getElementById('marquee-container').classList.remove('active');
}
