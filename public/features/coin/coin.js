// ===== 硬幣 =====
function flipCoin() {
    const coin = document.getElementById('coin');
    coin.classList.add('flipping');

    setTimeout(() => {
        const isHeads = Math.random() < 0.5;
        coin.className = 'coin ' + (isHeads ? 'heads' : 'tails');
        coin.textContent = isHeads ? '正' : '反';
    }, 500);
}
