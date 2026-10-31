// ===== 骰子 =====
function updateDiceCount() {
    const count = parseInt(document.getElementById('dice-count').value);
    const container = document.getElementById('dice-container');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        container.innerHTML += '<div class="dice">⚀</div>';
    }
}

function rollDice() {
    const diceChars = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const dices = document.querySelectorAll('.dice');

    dices.forEach(dice => {
        dice.classList.add('rolling');
        setTimeout(() => {
            const result = Math.floor(Math.random() * 6);
            dice.textContent = diceChars[result];
            dice.classList.remove('rolling');
        }, 500);
    });
}
