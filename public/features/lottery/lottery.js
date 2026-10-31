let lotteryDrawn = [];
// ===== 抽籤系統 =====
function drawLottery() {
    const total = parseInt(document.getElementById('lottery-total').value);
    const available = [];

    for (let i = 1; i <= total; i++) {
        if (!lotteryDrawn.includes(i)) {
            available.push(i);
        }
    }

    if (available.length === 0) {
        alert('已抽完所有號碼！');
        return;
    }

    const result = available[Math.floor(Math.random() * available.length)];
    lotteryDrawn.push(result);

    document.getElementById('lottery-result').textContent = result;
    document.getElementById('lottery-history').textContent = '已抽：' + lotteryDrawn.join(', ');

    playSound('lottery');
}

function resetLottery() {
    lotteryDrawn = [];
    document.getElementById('lottery-result').textContent = '?';
    document.getElementById('lottery-history').textContent = '已抽：';
}
