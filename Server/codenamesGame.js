const words = require('./codenamesWords');

class CodenamesGame {
    constructor() {
        this.reset();
    }

    reset() {
        this.players = []; // { socketId, pseudo, team: 'red'|'blue', role: 'operative'|'spymaster' }
        this.gameState = 'lobby'; // 'lobby', 'playing', 'finished'
        this.board = []; // 25 cards: { word, color, revealed }
        this.turn = 'red'; // 'red' or 'blue'
        this.turnStep = 'clue'; // 'clue' (spymaster) or 'guess' (operative)
        this.scores = { red: 0, blue: 0 }; // Cards left to guess
        this.winner = null;
        this.currentClue = { word: '', number: 0 };
        this.log = [];
    }

    join(socket, pseudo) {
        const existing = this.players.find(p => p.socketId === socket.id);
        if (existing) {
            existing.pseudo = pseudo;
        } else {
            this.players.push({
                socketId: socket.id,
                pseudo,
                team: null,
                role: null
            });
        }
        this.broadcastState(socket.server);
    }

    leave(socket) {
        this.players = this.players.filter(p => p.socketId !== socket.id);
        if (this.players.length === 0) {
            this.reset();
        } else {
            // If active player leaves, might need to handle it, but for now just remove
            this.broadcastState(socket.server);
        }
    }

    setTeam(socket, team) {
        const player = this.players.find(p => p.socketId === socket.id);
        if (player && this.gameState === 'lobby') {
            player.team = team;
            player.role = 'operative'; // Default role
            this.broadcastState(socket.server);
        }
    }

    setRole(socket, role) {
        const player = this.players.find(p => p.socketId === socket.id);
        if (player && this.gameState === 'lobby' && player.team) {
            // Check if spymaster is already taken for this team
            if (role === 'spymaster') {
                const existingSpymaster = this.players.find(p => p.team === player.team && p.role === 'spymaster');
                if (existingSpymaster && existingSpymaster !== player) {
                    return; // Already taken
                }
            }
            player.role = role;
            this.broadcastState(socket.server);
        }
    }

    startGame(io) {
        if (this.gameState !== 'lobby') return;

        // Validate teams
        const redPlayers = this.players.filter(p => p.team === 'red');
        const bluePlayers = this.players.filter(p => p.team === 'blue');
        
        // Need at least 1 spymaster and 1 operative per team ideally, but let's be flexible for testing
        // Minimal: 1 player per team
        if (redPlayers.length === 0 || bluePlayers.length === 0) return;

        // Generate Board
        const shuffledWords = [...words].sort(() => 0.5 - Math.random()).slice(0, 25);
        
        // Determine starting team (9 cards vs 8 cards)
        const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
        const secondTeam = startingTeam === 'red' ? 'blue' : 'red';

        // Assign colors
        // 9 starting, 8 second, 7 neutral, 1 assassin
        let colors = [
            ...Array(9).fill(startingTeam),
            ...Array(8).fill(secondTeam),
            ...Array(7).fill('neutral'),
            'assassin'
        ];
        colors = colors.sort(() => 0.5 - Math.random());

        this.board = shuffledWords.map((word, i) => ({
            word,
            color: colors[i],
            revealed: false
        }));

        this.turn = startingTeam;
        this.turnStep = 'clue';
        this.scores = {
            red: colors.filter(c => c === 'red').length,
            blue: colors.filter(c => c === 'blue').length
        };
        this.gameState = 'playing';
        this.log = [];
        this.addLog(`La partie commence ! L'équipe ${startingTeam === 'red' ? 'Rouge' : 'Bleue'} commence.`);

        this.broadcastState(io);
    }

    giveClue(socket, clue, number) {
        if (this.gameState !== 'playing') return;
        const player = this.players.find(p => p.socketId === socket.id);
        if (!player || player.team !== this.turn || player.role !== 'spymaster' || this.turnStep !== 'clue') return;

        this.currentClue = { word: clue, number: parseInt(number) };
        this.turnStep = 'guess';
        this.addLog(`Spymaster ${player.team}: "${clue}" (${number})`);
        this.broadcastState(socket.server);
    }

    clickCard(socket, index) {
        if (this.gameState !== 'playing') return;
        const player = this.players.find(p => p.socketId === socket.id);
        
        // Must be operative's turn
        if (!player || player.team !== this.turn || player.role !== 'operative' || this.turnStep !== 'guess') return;
        
        const card = this.board[index];
        if (card.revealed) return;

        card.revealed = true;
        this.addLog(`${player.pseudo} a révélé: ${card.word} (${this.getColorName(card.color)})`);

        if (card.color === 'assassin') {
            this.endGame(player.team === 'red' ? 'blue' : 'red', 'Assassin trouvé !');
        } else if (card.color === 'neutral') {
            this.endTurn();
        } else if (card.color !== player.team) {
            // Found opponent's card
            this.scores[card.color]--;
            this.checkWin();
            if (this.gameState === 'playing') this.endTurn();
        } else {
            // Found own card
            this.scores[player.team]--;
            this.checkWin();
            // Can continue guessing if number allows (logic usually allows number + 1, but here we just let them continue until they stop or fail)
            // If we want to enforce the limit, we'd need to track guesses count.
            // For simplicity, let's just let them continue.
        }

        this.broadcastState(socket.server);
    }

    passTurn(socket) {
        if (this.gameState !== 'playing') return;
        const player = this.players.find(p => p.socketId === socket.id);
        if (!player || player.team !== this.turn || player.role !== 'operative' || this.turnStep !== 'guess') return;

        this.addLog(`${player.pseudo} a passé son tour.`);
        this.endTurn();
        this.broadcastState(socket.server);
    }

    endTurn() {
        this.turn = this.turn === 'red' ? 'blue' : 'red';
        this.turnStep = 'clue';
        this.currentClue = { word: '', number: 0 };
    }

    checkWin() {
        if (this.scores.red === 0) this.endGame('red', 'Tous les agents rouges trouvés !');
        else if (this.scores.blue === 0) this.endGame('blue', 'Tous les agents bleus trouvés !');
    }

    endGame(winner, reason) {
        this.gameState = 'finished';
        this.winner = winner;
        this.addLog(`Victoire ${winner.toUpperCase()} ! ${reason}`);
        // Reveal all
        this.board.forEach(c => c.revealed = true);
    }

    addLog(msg) {
        this.log.push({ time: new Date(), text: msg });
        if (this.log.length > 50) this.log.shift();
    }

    getColorName(c) {
        if (c === 'red') return 'Rouge';
        if (c === 'blue') return 'Bleu';
        if (c === 'neutral') return 'Neutre';
        if (c === 'assassin') return 'Assassin';
        return c;
    }

    broadcastState(io) {
        // We need to send different states to spymasters vs operatives
        // But simpler: send full state, but mask unrevealed colors on client side?
        // NO, that allows cheating by inspecting network.
        // We must sanitize the board for operatives.

        const commonState = {
            players: this.players,
            gameState: this.gameState,
            turn: this.turn,
            turnStep: this.turnStep,
            scores: this.scores,
            winner: this.winner,
            currentClue: this.currentClue,
            log: this.log
        };

        this.players.forEach(p => {
            const socket = io.sockets.sockets.get(p.socketId);
            if (!socket) return;

            let clientBoard = [];
            if (this.gameState === 'lobby') {
                clientBoard = [];
            } else if (this.gameState === 'finished' || p.role === 'spymaster') {
                // See everything
                clientBoard = this.board;
            } else {
                // Operative / Spectator: Mask unrevealed colors
                clientBoard = this.board.map(c => ({
                    word: c.word,
                    revealed: c.revealed,
                    color: c.revealed ? c.color : null // Hide color if not revealed
                }));
            }

            socket.emit('codenames:state', { ...commonState, board: clientBoard });
        });
        
        // Also broadcast to spectators (anyone connected but not in players list? or just broadcast to room?)
        // Current architecture seems to broadcast to everyone connected to the socket event usually.
        // But here I'm iterating players.
        // If I want spectators to see, I should probably emit to a room 'codenames'.
        // For now, let's assume players join the game explicitly.
        // If we want a "lobby" where people can watch, we need to handle non-players.
        
        // Let's emit a sanitized version to everyone else not in the game?
        // Or just rely on join.
    }
}

module.exports = CodenamesGame;
