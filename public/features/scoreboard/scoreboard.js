let scores = [0, 0, 0, 0, 0, 0];
// ===== 計分板 =====
function initScoreboard() {
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = '';

    for (let i = 0; i < 6; i++) {
        scoreboard.innerHTML += `
            <div class="score-group">
                <div class="group-name">第 ${i + 1} 組</div>
                <div class="group-score" id="score-${i}">${scores[i]}</div>
                <div class="score-controls">
                    <button class="score-btn plus" onclick="changeScore(${i}, 1)">+</button>
                    <button class="score-btn minus" onclick="changeScore(${i}, -1)">-</button>
                </div>
            </div>
        `;
    }
}

function changeScore(group, delta) {
    scores[group] += delta;
    document.getElementById('score-' + group).textContent = scores[group];
    playSound(delta > 0 ? 'reward' : 'penalty');
    saveData();
}

function resetScores() {
    scores = [0, 0, 0, 0, 0, 0];
    initScoreboard();
    saveData();
}
