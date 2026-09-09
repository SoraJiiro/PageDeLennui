const { Chess } = require("chess.js");

class ChessGame {
  constructor() {
    this.joueurs = [];
    this.spectators = [];
    this.chess = new Chess();
    this.gameStarted = false;
    this.winner = null;
    this.draw = false;
  }

  addPlayer(pseudo, socketId) {
    if (this.gameStarted) return { success: false, reason: "gameStarted" };
    if (this.joueurs.length >= 2) return { success: false, reason: "full" };
    if (this.joueurs.some((player) => player.pseudo === pseudo)) {
      return { success: false, reason: "alreadyIn" };
    }

    this.joueurs.push({
      pseudo,
      socketId,
      color: this.joueurs.length === 0 ? "w" : "b",
    });
    return { success: true };
  }

  removePlayer(pseudo) {
    const index = this.joueurs.findIndex((player) => player.pseudo === pseudo);
    if (index === -1) return false;
    this.joueurs.splice(index, 1);
    return true;
  }

  addSpectator(pseudo, socketId) {
    const spectator = this.spectators.find((entry) => entry.pseudo === pseudo);
    if (spectator) spectator.socketId = socketId;
    else this.spectators.push({ pseudo, socketId });
  }

  removeSpectator(pseudo) {
    this.spectators = this.spectators.filter((entry) => entry.pseudo !== pseudo);
  }

  updateSocketId(pseudo, socketId) {
    [...this.joueurs, ...this.spectators]
      .filter((entry) => entry.pseudo === pseudo)
      .forEach((entry) => {
        entry.socketId = socketId;
      });
  }

  canStart() {
    return this.joueurs.length === 2 && !this.gameStarted;
  }

  startGame() {
    if (!this.canStart()) return false;
    this.chess.reset();
    this.gameStarted = true;
    this.winner = null;
    this.draw = false;
    return true;
  }

  getPlayer(pseudo) {
    return this.joueurs.find((player) => player.pseudo === pseudo);
  }

  playMove(player, move) {
    if (!player) return { success: false, message: "Tu n'es pas dans la partie" };
    if (!this.gameStarted) return { success: false, message: "La partie n'a pas commencé" };
    if (this.winner || this.draw) return { success: false, message: "La partie est terminée" };
    if (this.chess.turn() !== player.color) return { success: false, message: "Ce n'est pas ton tour !" };

    let played;
    try {
      played = this.chess.move({
        from: String(move?.from || ""),
        to: String(move?.to || ""),
        promotion: String(move?.promotion || "q"),
      });
    } catch {
      return { success: false, message: "Mouvement invalide" };
    }

    if (this.chess.isGameOver()) {
      if (this.chess.isCheckmate()) {
        this.winner = player.pseudo;
      } else {
        this.draw = true;
      }
    }

    return { success: true, move: played, winner: this.winner, draw: this.draw };
  }

  getState(forUsername) {
    const player = this.getPlayer(forUsername);
    const currentPlayer = this.joueurs.find(
      (entry) => entry.color === this.chess.turn(),
    );
    return {
      estSpec: !player,
      estMonTour: Boolean(player && currentPlayer && player === currentPlayer),
      myColor: player?.color || null,
      currentPlayer: currentPlayer?.pseudo || null,
      board: this.chess.board(),
      turn: this.chess.turn(),
      fen: this.chess.fen(),
      joueurs: this.joueurs.map((entry) => ({ pseudo: entry.pseudo, color: entry.color })),
      winner: this.winner,
      draw: this.draw,
      inCheck: this.chess.inCheck(),
    };
  }

  getLobbyState() {
    return {
      joueurs: this.joueurs.map((entry) => entry.pseudo),
      spectators: this.spectators.map((entry) => entry.pseudo),
      gameStarted: this.gameStarted,
      canStart: this.canStart(),
    };
  }
}

module.exports = ChessGame;