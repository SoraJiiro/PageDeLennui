let socket;
let gameState = null;
let myPseudo = null;

export function initCodenames(s) {
    socket = s;
    
    // Get pseudo from main app context if possible, or wait for state
    // Usually main.js sets window.currentUser or similar, but let's rely on server state matching socket id
    
    socket.on('codenames:state', (state) => {
        gameState = state;
        render();
    });

    // Bind UI events
    document.getElementById('cn-btn-join-red').addEventListener('click', () => socket.emit('codenames:team', 'red'));
    document.getElementById('cn-btn-join-blue').addEventListener('click', () => socket.emit('codenames:team', 'blue'));
    
    document.getElementById('cn-btn-role-spy-red').addEventListener('click', () => socket.emit('codenames:role', 'spymaster'));
    document.getElementById('cn-btn-role-op-red').addEventListener('click', () => socket.emit('codenames:role', 'operative'));
    document.getElementById('cn-btn-role-spy-blue').addEventListener('click', () => socket.emit('codenames:role', 'spymaster'));
    document.getElementById('cn-btn-role-op-blue').addEventListener('click', () => socket.emit('codenames:role', 'operative'));

    document.getElementById('cn-btn-start').addEventListener('click', () => socket.emit('codenames:start'));
    
    document.getElementById('cn-btn-give-clue').addEventListener('click', () => {
        const word = document.getElementById('cn-clue-word').value.trim();
        const num = document.getElementById('cn-clue-num').value;
        if(word && num) socket.emit('codenames:clue', { word, number: num });
    });

    document.getElementById('cn-btn-pass').addEventListener('click', () => socket.emit('codenames:pass'));
    document.getElementById('cn-btn-leave').addEventListener('click', () => socket.emit('codenames:leave'));
}

function render() {
    if (!gameState) return;

    const lobbyDiv = document.querySelector('.codenames-lobby');
    const gameDiv = document.querySelector('.codenames-game');
    const statusDiv = document.querySelector('.codenames-status');

    // Find myself
    const me = gameState.players.find(p => p.socketId === socket.id);
    myPseudo = me ? me.pseudo : null;

    if (gameState.gameState === 'lobby') {
        lobbyDiv.style.display = 'grid';
        gameDiv.style.display = 'none';
        renderLobby(gameState.players);
    } else {
        lobbyDiv.style.display = 'none';
        gameDiv.style.display = 'flex';
        renderGame(me);
    }
}

function renderLobby(players) {
    // Clear slots
    const redSpymaster = players.find(p => p.team === 'red' && p.role === 'spymaster');
    const blueSpymaster = players.find(p => p.team === 'blue' && p.role === 'spymaster');
    const redOps = players.filter(p => p.team === 'red' && p.role === 'operative');
    const blueOps = players.filter(p => p.team === 'blue' && p.role === 'operative');

    updateSlot('cn-slot-spy-red', redSpymaster);
    updateSlot('cn-slot-spy-blue', blueSpymaster);
    
    updateList('cn-list-op-red', redOps);
    updateList('cn-list-op-blue', blueOps);
}

function updateSlot(id, player) {
    const el = document.getElementById(id);
    if (player) {
        el.textContent = player.pseudo;
        el.classList.add('filled');
    } else {
        el.textContent = 'Libre';
        el.classList.remove('filled');
    }
}

function updateList(id, list) {
    const el = document.getElementById(id);
    el.innerHTML = '';
    list.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-slot filled';
        div.textContent = p.pseudo;
        el.appendChild(div);
    });
}

function renderGame(me) {
    // Score & Turn
    document.getElementById('cn-score-red').textContent = gameState.scores.red;
    document.getElementById('cn-score-blue').textContent = gameState.scores.blue;
    
    const turnIndicator = document.getElementById('cn-turn-indicator');
    turnIndicator.textContent = `Tour ${gameState.turn === 'red' ? 'ROUGE' : 'BLEU'} (${gameState.turnStep === 'clue' ? 'Espion' : 'Agents'})`;
    turnIndicator.className = `turn-indicator turn-${gameState.turn}`;

    // Board
    const grid = document.getElementById('cn-board');
    grid.innerHTML = '';
    
    gameState.board.forEach((card, index) => {
        const el = document.createElement('div');
        el.className = 'word-card';
        el.textContent = card.word;
        
        if (card.revealed) {
            el.classList.add('revealed', card.color);
        } else if (me && me.role === 'spymaster') {
            // Spymaster view of unrevealed cards
            el.classList.add('spymaster-hint', card.color);
        }

        // Click handler
        if (!card.revealed && me && me.team === gameState.turn && me.role === 'operative' && gameState.turnStep === 'guess') {
            el.style.cursor = 'pointer';
            el.onclick = () => socket.emit('codenames:click', index);
        } else {
            el.style.cursor = 'default';
        }

        grid.appendChild(el);
    });

    // Controls
    const controls = document.getElementById('cn-controls');
    const clueInput = document.getElementById('cn-clue-input');
    const guessControls = document.getElementById('cn-guess-controls');
    const currentClueDisplay = document.getElementById('cn-current-clue');

    // Reset visibility
    clueInput.style.display = 'none';
    guessControls.style.display = 'none';
    currentClueDisplay.textContent = '';

    if (gameState.gameState === 'finished') {
        currentClueDisplay.textContent = gameState.winner ? `VICTOIRE ${gameState.winner.toUpperCase()} !` : 'Partie terminée';
        return;
    }

    if (gameState.turnStep === 'clue') {
        if (me && me.team === gameState.turn && me.role === 'spymaster') {
            clueInput.style.display = 'flex';
        } else {
            currentClueDisplay.textContent = `En attente de l'espion ${gameState.turn === 'red' ? 'Rouge' : 'Bleu'}...`;
        }
    } else {
        // Guessing phase
        currentClueDisplay.textContent = `Indice : ${gameState.currentClue.word} (${gameState.currentClue.number})`;
        if (me && me.team === gameState.turn && me.role === 'operative') {
            guessControls.style.display = 'block';
        }
    }

    // Logs
    const logDiv = document.getElementById('cn-log');
    logDiv.innerHTML = '';
    gameState.log.slice().reverse().forEach(l => {
        const div = document.createElement('div');
        div.className = 'log-entry';
        const time = new Date(l.time).toLocaleTimeString();
        div.innerHTML = `<span class="log-time">[${time}]</span> ${l.text}`;
        logDiv.appendChild(div);
    });
}
