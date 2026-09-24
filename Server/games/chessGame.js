const { Chess } = require("chess.js");

class ChessGame {
  constructor({ timeMinutes = 10, vsBot = false, botType = "classic" } = {}) {
    this.initialTimeMs = this.clampTimeMs(timeMinutes);
    this.vsBot = Boolean(vsBot);
    this.botType = botType === "stockfish" ? "stockfish" : "classic";
    this.stockfish = null;
    this.stockfishReady = null;
    this.botPlayer = null;
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
    this.startedAt = null;
    this.drawOffers = new Set();
  }

  clampTimeMs(timeMinutes) {
    const minutes = Number(timeMinutes);
    const safeMinutes = Number.isFinite(minutes) ? minutes : 10;
    return Math.min(30, Math.max(1, safeMinutes)) * 60 * 1000;
  }

  addBot() {
    if (!this.vsBot || this.botPlayer) return;
    this.botPlayer = {
      pseudo: "Bot",
      socketId: null,
      color: "b",
      isBot: true,
    };
    this.joueurs.push(this.botPlayer);
  }

  addPlayer(pseudo, socketId) {
    if (this.gameStarted) return { success: false, reason: "gameStarted" };
    if (this.vsBot && this.joueurs.some((player) => player.isBot)) {
      return { success: false, reason: "botMode" };
    }
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
    const minimumPlayers = this.vsBot ? 1 : 2;
    return this.joueurs.length >= minimumPlayers && !this.gameStarted;
  }

  startGame() {
    if (!this.canStart()) return false;
    this.chess.reset();
    this.gameStarted = true;
    this.winner = null;
    this.draw = false;
    this.clockMs = { w: this.initialTimeMs, b: this.initialTimeMs };
    this.lastTurnAt = Date.now();
    this.startedAt = Date.now();
    this.drawOffers.clear();
    return true;
  }

  canResign(now = Date.now()) {
    return Boolean(
      this.gameStarted &&
      this.startedAt &&
      now - this.startedAt >= this.initialTimeMs / 2,
    );
  }

  offerDraw(pseudo) {
    if (!this.gameStarted || !this.getPlayer(pseudo) || this.vsBot) {
      return { success: false, reason: "unavailable" };
    }
    this.drawOffers.add(pseudo);
    return {
      success: true,
      agreed: this.joueurs
        .filter((player) => !player.isBot)
        .every((player) => this.drawOffers.has(player.pseudo)),
    };
  }

  startClock(onTimeout, onTick) {
    if (this.vsBot) return;
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
    if (this.vsBot) return null;
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

  evaluatePosition(chess) {
    const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
    const centerSquares = new Set([
      "d4",
      "d5",
      "e4",
      "e5",
      "c4",
      "c5",
      "f4",
      "f5",
    ]);

    let score = 0;
    const board = chess.board();

    board.forEach((row, rowIndex) => {
      row.forEach((piece, colIndex) => {
        if (!piece) return;

        const square = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;
        const baseScore = pieceValues[piece.type] || 0;
        const colorMultiplier = piece.color === "b" ? 1 : -1;
        const centralityBonus = centerSquares.has(square) ? 15 : 0;
        const mobilityBonus = piece.color === "b" ? 3 : -3;

        score +=
          (baseScore + centralityBonus + mobilityBonus) * colorMultiplier;

        if (piece.type === "p") {
          const pawnProgress = piece.color === "w" ? 7 - rowIndex : rowIndex;
          score += piece.color === "b" ? pawnProgress * 2 : -pawnProgress * 2;
        }
      });
    });

    if (chess.isCheckmate()) {
      return chess.turn() === "w" ? -100000 : 100000;
    }
    if (chess.isDraw()) {
      return 0;
    }

    return score;
  }

  minimax(chess, depth, alpha, beta, maximizingBlack) {
    if (depth === 0 || chess.isGameOver()) {
      return this.evaluatePosition(chess);
    }

    const moves = chess.moves({ verbose: true });
    if (!moves.length) {
      if (chess.isCheckmate()) {
        return chess.turn() === "w" ? -100000 : 100000;
      }
      return 0;
    }

    if (maximizingBlack) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const next = new Chess(chess.fen());
        next.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || "q",
        });
        const value = this.minimax(next, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, value);
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return maxEval;
    }

    let minEval = Infinity;
    for (const move of moves) {
      const next = new Chess(chess.fen());
      next.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || "q",
      });
      const value = this.minimax(next, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, value);
      beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return minEval;
  }

  chooseBotMove() {
    const moves = this.chess.moves({ verbose: true });
    if (!moves.length) return null;

    const orderedMoves = [...moves].sort((a, b) => {
      const scoreA =
        (a.captured ? 10 : 0) +
        (a.promotion ? 8 : 0) +
        (a.san.includes("+") || a.san.includes("#") ? 5 : 0);
      const scoreB =
        (b.captured ? 10 : 0) +
        (b.promotion ? 8 : 0) +
        (b.san.includes("+") || b.san.includes("#") ? 5 : 0);
      return scoreB - scoreA;
    });

    const depth = this.chess.board().flat().filter(Boolean).length > 12 ? 2 : 3;
    const scoredMoves = [];

    for (const move of orderedMoves) {
      const next = new Chess(this.chess.fen());
      next.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || "q",
      });

      const evaluation = this.minimax(
        next,
        depth - 1,
        -Infinity,
        Infinity,
        false,
      );
      scoredMoves.push({ move, evaluation });
    }

    const bestScore = Math.max(...scoredMoves.map((entry) => entry.evaluation));
    const candidates = scoredMoves.filter(
      (entry) => entry.evaluation >= bestScore - 5,
    );
    const selected =
      candidates[Math.floor(Math.random() * candidates.length)] ||
      scoredMoves[0];
    const bestMove = selected.move;

    return {
      from: bestMove.from,
      to: bestMove.to,
      promotion: bestMove.promotion || "q",
    };
  }

  async chooseStockfishMove() {
    if (!this.stockfishReady) {
      this.stockfishReady = new Promise((resolve, reject) => {
        let engine;
        const onOutput = (line) => {
          const output = String(line || "");
          if (output.startsWith("bestmove ")) this.stockfishBestMove = output;
        };
        engine = require("stockfish")("lite-single", (error, readyEngine) => {
          if (error) return reject(error);
          this.stockfish = readyEngine;
          readyEngine.sendCommand("uci");
          readyEngine.sendCommand("setoption name Skill Level value 20");
          readyEngine.sendCommand("setoption name Hash value 32");
          readyEngine.sendCommand("isready");
          resolve(readyEngine);
        });
        engine.listener = onOutput;
      });
    }

    const engine = await this.stockfishReady;
    this.stockfishBestMove = null;
    engine.sendCommand("position fen " + this.chess.fen());
    const thinkTime = Math.min(3000, Math.max(1200, this.initialTimeMs / 120));
    engine.sendCommand(`go movetime ${thinkTime}`);

    const deadline = Date.now() + 5000;
    while (!this.stockfishBestMove && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const match = String(this.stockfishBestMove || "").match(
      /^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/i,
    );
    if (!match) return null;
    return {
      from: match[1],
      to: match[2],
      promotion: match[3]?.toLowerCase() || "q",
    };
  }

  playBotMove() {
    if (!this.vsBot || !this.gameStarted || this.winner || this.draw)
      return { success: false };
    if (this.chess.turn() !== "b") return { success: false };

    const move = this.chooseBotMove();
    if (!move) {
      this.draw = true;
      return { success: true, draw: true };
    }

    const played = this.chess.move(move);

    if (this.chess.isGameOver()) {
      if (this.chess.isCheckmate()) {
        this.winner = "Bot";
      } else {
        this.draw = true;
      }
    }

    this.lastTurnAt = Date.now();
    return {
      success: true,
      move: played,
      winner: this.winner,
      draw: this.draw,
    };
  }

  async playStockfishMove() {
    if (!this.vsBot || !this.gameStarted || this.winner || this.draw)
      return { success: false };
    if (this.chess.turn() !== "b") return { success: false };

    const move = (await this.chooseStockfishMove()) || this.chooseBotMove();
    if (!move) {
      this.draw = true;
      return { success: true, draw: true };
    }

    const played = this.chess.move(move);
    if (this.chess.isGameOver()) {
      if (this.chess.isCheckmate()) this.winner = "Bot";
      else this.draw = true;
    }
    this.lastTurnAt = Date.now();
    return {
      success: true,
      move: played,
      winner: this.winner,
      draw: this.draw,
    };
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
      vsBot: this.vsBot,
      botType: this.botType,
      joueurs: this.joueurs.map((entry) => ({
        pseudo: entry.pseudo,
        color: entry.color,
      })),
      winner: this.winner,
      draw: this.draw,
      inCheck: this.chess.inCheck(),
      pausedBy: this.pausedBy,
      pauseDeadline: this.pauseDeadline,
      canResign: this.canResign(),
      drawOfferedByMe: this.drawOffers.has(forUsername),
      drawOfferedByOpponent: [...this.drawOffers].some(
        (pseudo) => pseudo !== forUsername,
      ),
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
