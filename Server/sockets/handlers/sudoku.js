function registerSudokuHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");

  function readCompletedCount(rawValue) {
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return Math.max(0, Math.floor(rawValue));
    }

    if (typeof rawValue === "string") {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    }

    if (rawValue && typeof rawValue === "object") {
      const parsed = Number(rawValue.completed);
      return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    }

    return 0;
  }

  socket.on("sudoku:saveState", (payload = {}) => {
    try {
      if (!payload || typeof payload !== "object") return;
      if (payload.completed === true) return;

      const puzzle = String(payload.puzzle || "");
      const solution = String(payload.solution || "");
      const board = Array.isArray(payload.board) ? payload.board : [];

      if (puzzle.length !== 81 || solution.length !== 81) return;
      if (board.length !== 81) return;

      const normalizedBoard = board.map((cell) => {
        const v = String(cell || "0");
        return /^[0-9]$/.test(v) ? v : "0";
      });

      if (!FileService.data.sudokuState) FileService.data.sudokuState = {};

      FileService.data.sudokuState[pseudo] = {
        puzzle,
        solution,
        board: normalizedBoard,
        selectedIndex: Number.isInteger(payload.selectedIndex)
          ? Math.max(-1, Math.min(80, payload.selectedIndex))
          : -1,
        accumulatedMs: Math.max(0, Number(payload.accumulatedMs) || 0),
        hasPlayerStarted: !!payload.hasPlayerStarted,
        completed: false,
        at: new Date().toISOString(),
      };

      FileService.save("sudokuState", FileService.data.sudokuState);
    } catch (e) {
      console.error("Erreur saveState Sudoku:", e);
    }
  });

  socket.on("sudoku:loadState", () => {
    try {
      const save = FileService.data.sudokuState?.[pseudo] || null;
      if (save) {
        socket.emit("sudoku:state", { found: true, state: save });
      } else {
        socket.emit("sudoku:state", { found: false });
      }
    } catch (e) {
      socket.emit("sudoku:state", { found: false });
    }
  });

  socket.on("sudoku:clearState", () => {
    if (FileService.data.sudokuState && FileService.data.sudokuState[pseudo]) {
      delete FileService.data.sudokuState[pseudo];
      FileService.save("sudokuState", FileService.data.sudokuState);
    }
  });

  socket.on("sudoku:completed", (payload = {}) => {
    if (!FileService.data.sudokuScores) FileService.data.sudokuScores = {};
    if (!FileService.data.sudokuState) FileService.data.sudokuState = {};

    const timeMs = Number(payload.timeMs || 0);
    const clientIp =
      (socket.handshake && socket.handshake.address) ||
      (socket.conn && socket.conn.remoteAddress) ||
      (socket.request &&
        socket.request.connection &&
        socket.request.connection.remoteAddress) ||
      null;
    const MIN_TIME_MS = 90000; // 1 minute 30 seconds

    // If completed too fast, ignore the attempt for leaderboard/rewards
    if (timeMs > 0 && timeMs < MIN_TIME_MS) {
      try {
        FileService.appendLog({
          type: "SUDOKU_COMPLETED_IGNORED",
          pseudo,
          ip: clientIp,
          difficulty:
            typeof payload.difficulty === "string"
              ? payload.difficulty
              : "unknown",
          timeMs,
          reason: "TOO_FAST",
          at: new Date().toISOString(),
        });
      } catch {}

      // Ack without incrementing or rewarding
      socket.emit("sudoku:ack", {
        completed: readCompletedCount(FileService.data.sudokuScores[pseudo]),
        skipped: true,
        reason: "TOO_FAST",
        timeMs,
      });

      return;
    }

    const current = readCompletedCount(FileService.data.sudokuScores[pseudo]);
    const next = current + 1;
    FileService.data.sudokuScores[pseudo] = next;
    FileService.save("sudokuScores", FileService.data.sudokuScores);
    try {
      applyAutoBadges({ pseudo, FileService });
    } catch {}

    try {
      FileService.appendLog({
        type: "SUDOKU_COMPLETED",
        pseudo,
        difficulty:
          typeof payload.difficulty === "string"
            ? payload.difficulty
            : "unknown",
        timeMs,
        totalCompleted: next,
        at: new Date().toISOString(),
      });
    } catch {}

    if (leaderboardManager?.broadcastSudokuLB) {
      leaderboardManager.broadcastSudokuLB(io);
    }

    const gain = 250;
    const wallet = addMoney(
      FileService,
      pseudo,
      gain,
      FileService.data.clicks[pseudo] || 0,
      "jeu:sudoku",
    );
    io.to("user:" + pseudo).emit("economy:wallet", wallet);
    io.to("user:" + pseudo).emit("economy:gameMoney", {
      game: "sudoku",
      gained: gain,
      total: gain,
      final: true,
    });
    try {
      FileService.appendLog({
        type: "GAME_MONEY_REWARD",
        pseudo,
        game: "sudoku",
        gained: gain,
        total: gain,
        at: new Date().toISOString(),
      });
    } catch {}

    socket.emit("sudoku:ack", {
      completed: next,
      moneyGained: gain,
      moneyTotal: gain,
    });

    if (FileService.data.sudokuState[pseudo]) {
      delete FileService.data.sudokuState[pseudo];
      FileService.save("sudokuState", FileService.data.sudokuState);
    }
  });

  socket.on("sudoku:requestLeaderboard", () => {
    if (leaderboardManager?.broadcastSudokuLB) {
      leaderboardManager.broadcastSudokuLB(io);
    }
  });
}

module.exports = { registerSudokuHandlers };
