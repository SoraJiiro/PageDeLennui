const { Chess } = require("chess.js");

class ChessGame {
  constructor() {
    this.initialTimeMs = 10 * 60 * 1000;
    this.joueurs = [];
    this.spectators = [];
    this.chess = new Chess();
    this.gameStarted = false;
    this.winner = null;
    this.draw = false;
    this.clockMs = { w: this.initialTimeMs, b: this.initialTimeMs };
    this.lastTurnAt = null;
    this.clockTimer = null;
    this.pausedBy = null;
    this.pauseDeadline = null;
    this.pauseTimer = null;
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
    this.spectators = this.spectators.filter(
      (entry) => entry.pseudo !== pseudo,
    );
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
    this.clockMs = { w: this.initialTimeMs, b: this.initialTimeMs };
    this.lastTurnAt = Date.now();
    return true;
  }

  startClock(onTimeout, onTick) {
    this.stopClock();
    this.clockTimer = setInterval(() => {
      const expiredColor = this.updateClock();
      if (expiredColor) onTimeout(expiredColor);
      else onTick?.();
    }, 1000);
  }

  stopClock() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  updateClock(now = Date.now()) {
    if (
      !this.gameStarted ||
      this.pausedBy ||
      this.winner ||
      this.draw ||
      this.lastTurnAt === null
    )
      return null;
    const color = this.chess.turn();
    const elapsed = Math.max(0, now - this.lastTurnAt);
    this.clockMs[color] = Math.max(0, this.clockMs[color] - elapsed);
    this.lastTurnAt = now;
    if (this.clockMs[color] > 0) return null;
    this.winner =
      this.joueurs.find((player) => player.color !== color)?.pseudo || null;
    return color;
  }

  getClockMs() {
    this.updateClock();
    return { ...this.clockMs };
  }

  getPlayer(pseudo) {
    return this.joueurs.find((player) => player.pseudo === pseudo);
  }

  playMove(player, move) {
    if (!player)
      return { success: false, message: "Tu n'es pas dans la partie" };
    if (!this.gameStarted)
      return { success: false, message: "La partie n'a pas commencé" };
    if (this.winner || this.draw)
      return { success: false, message: "La partie est terminée" };
    if (this.updateClock()) {
      return {
        success: false,
        timedOut: true,
        winner: this.winner,
        message: "Ton temps est écoulé",
      };
    }
    if (this.chess.turn() !== player.color)
      return { success: false, message: "Ce n'est pas ton tour !" };

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

    if (!this.winner && !this.draw) this.lastTurnAt = Date.now();

    return {
      success: true,
      move: played,
      winner: this.winner,
      draw: this.draw,
    };
  }

  getState(forUsername) {
    this.updateClock();
    const player = this.getPlayer(forUsername);
    const currentPlayer = this.joueurs.find(
      (entry) => entry.color === this.chess.turn(),
    );
    const legalMoves = {};
    const captured = { w: [], b: [] };
    const history = this.chess.history({ verbose: true });
    history.forEach((move) => {
      if (!move.captured) return;
      captured[move.color === "w" ? "b" : "w"].push(move.captured);
    });
    const pieceOrder = { p: 0, n: 1, b: 2, r: 3, q: 4 };
    captured.w.sort((a, b) => pieceOrder[a] - pieceOrder[b]);
    captured.w.reverse();
    captured.b.sort((a, b) => pieceOrder[a] - pieceOrder[b]);
    for (const row of this.chess.board()) {
      for (const piece of row) {
        if (!piece || piece.color !== this.chess.turn()) continue;
        legalMoves[piece.square] = this.chess
          .moves({
            square: piece.square,
            verbose: true,
          })
          .map((move) => ({
            to: move.to,
            capture: Boolean(move.captured),
            promotion: move.promotion || null,
          }));
      }
    }
    return {
      estSpec: !player,
      estMonTour: Boolean(player && currentPlayer && player === currentPlayer),
      myColor: player?.color || null,
      currentPlayer: currentPlayer?.pseudo || null,
      board: this.chess.board(),
      turn: this.chess.turn(),
      fen: this.chess.fen(),
      joueurs: this.joueurs.map((entry) => ({
        pseudo: entry.pseudo,
        color: entry.color,
      })),
      winner: this.winner,
      draw: this.draw,
      inCheck: this.chess.inCheck(),
      pausedBy: this.pausedBy,
      pauseDeadline: this.pauseDeadline,
      legalMoves,
      captured,
      lastMove: history.length ? history.at(-1) : null,
      clocks: this.getClockMs(),
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
