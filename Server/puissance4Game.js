class Puissance4Game {
  constructor() {
    this.joueurs = [];
    this.spectators = [];
    this.board = Array(6)
      .fill(null)
      .map(() => Array(7).fill(0));
    this.currentPlayerIndex = 0;
    this.gameStarted = false;
    this.winner = null;
    this.draw = false;
  }

  addPlayer(pseudo, socketId) {
    if (this.gameStarted) return { success: false, reason: "gameStarted" };
    if (this.joueurs.length >= 2) return { success: false, reason: "full" };

    const existingPlayer = this.joueurs.find((p) => p.pseudo === pseudo);
    if (existingPlayer) {
      return { success: false, reason: "alreadyIn" };
    }

    this.joueurs.push({ pseudo, socketId, color: this.joueurs.length + 1 });
    return { success: true };
  }

  removePlayer(pseudo) {
    const index = this.joueurs.findIndex((p) => p.pseudo === pseudo);
    if (index !== -1) {
      this.joueurs.splice(index, 1);
      return true;
    }
    return false;
  }

  addSpectator(pseudo, socketId) {
    const existingSpectator = this.spectators.find((s) => s.pseudo === pseudo);
    if (existingSpectator) {
      existingSpectator.socketId = socketId;
    } else {
      this.spectators.push({ pseudo, socketId });
    }
  }

  removeSpectator(pseudo) {
    const index = this.spectators.findIndex((s) => s.pseudo === pseudo);
    if (index !== -1) {
      this.spectators.splice(index, 1);
    }
  }

  updateSocketId(pseudo, newSocketId) {
    const joueur = this.joueurs.find((p) => p.pseudo === pseudo);
    if (joueur) {
      joueur.socketId = newSocketId;
    }
    const spectator = this.spectators.find((s) => s.pseudo === pseudo);
    if (spectator) {
      spectator.socketId = newSocketId;
    }
  }

  canStart() {
    return this.joueurs.length === 2 && !this.gameStarted;
  }

  startGame() {
    if (!this.canStart()) return false;
    this.gameStarted = true;
    this.currentPlayerIndex = 0;
    this.board = Array(6)
      .fill(null)
      .map(() => Array(7).fill(0));
    this.winner = null;
    this.draw = false;
    return true;
  }

  getCurrentPlayer() {
    if (this.joueurs.length === 0) return null;
    return this.joueurs[this.currentPlayerIndex];
  }

  nextPlayer() {
    if (this.joueurs.length === 0) return;
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % this.joueurs.length;
  }

  playMove(joueur, col) {
    if (!joueur || joueur !== this.getCurrentPlayer()) {
      return { success: false, message: "Ce n'est pas ton tour !" };
    }

    if (this.winner || this.draw) {
      return { success: false, message: "La partie est terminée" };
    }

    if (col < 0 || col >= 7) {
      return { success: false, message: "Colonne invalide" };
    }

    // Trouver la ligne la plus basse disponible
    let row = -1;
    for (let r = 5; r >= 0; r--) {
      if (this.board[r][col] === 0) {
        row = r;
        break;
      }
    }

    if (row === -1) {
      return { success: false, message: "Cette colonne est pleine" };
    }

    // Placer le jeton
    const playerColor = joueur.color;
    this.board[row][col] = playerColor;

    // Vérifier la victoire
    if (this.checkWin(row, col, playerColor)) {
      this.winner = joueur.pseudo;
      return { success: true, winner: joueur.pseudo };
    }

    // Vérifier match nul
    if (this.isBoardFull()) {
      this.draw = true;
      return { success: true, draw: true };
    }

    // Passer au joueur suivant
    this.nextPlayer();

    return { success: true };
  }

  checkWin(row, col, color) {
    // Vérifier horizontal
    if (this.checkDirection(row, col, 0, 1, color)) return true;
    // Vérifier vertical
    if (this.checkDirection(row, col, 1, 0, color)) return true;
    // Vérifier diagonal /
    if (this.checkDirection(row, col, 1, 1, color)) return true;
    // Vérifier diagonal \
    if (this.checkDirection(row, col, 1, -1, color)) return true;
    return false;
  }

  checkDirection(row, col, dRow, dCol, color) {
    let count = 1;

    // Compter dans une direction
    for (let i = 1; i < 4; i++) {
      const r = row + dRow * i;
      const c = col + dCol * i;
      if (r < 0 || r >= 6 || c < 0 || c >= 7) break;
      if (this.board[r][c] !== color) break;
      count++;
    }

    // Compter dans la direction opposée
    for (let i = 1; i < 4; i++) {
      const r = row - dRow * i;
      const c = col - dCol * i;
      if (r < 0 || r >= 6 || c < 0 || c >= 7) break;
      if (this.board[r][c] !== color) break;
      count++;
    }

    return count >= 4;
  }

  isBoardFull() {
    for (let col = 0; col < 7; col++) {
      if (this.board[0][col] === 0) return false;
    }
    return true;
  }

  getState(forUsername) {
    const joueur = this.joueurs.find((p) => p.pseudo === forUsername);
    const estSpec = !joueur;
    const currentPlayer = this.getCurrentPlayer();

    return {
      estSpec,
      estMonTour: joueur && currentPlayer && joueur === currentPlayer,
      currentPlayer: currentPlayer ? currentPlayer.pseudo : null,
      board: this.board,
      joueurs: this.joueurs.map((j) => j.pseudo),
      winner: this.winner,
      draw: this.draw,
    };
  }

  getLobbyState() {
    return {
      joueurs: this.joueurs.map((p) => p.pseudo),
      spectators: this.spectators.map((s) => s.pseudo),
      gameStarted: this.gameStarted,
      canStart: this.canStart(),
    };
  }
}

module.exports = Puissance4Game;
