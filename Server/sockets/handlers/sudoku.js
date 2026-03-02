function registerSudokuHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");

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
    const MIN_TIME_MS = 150000; // 2 minutes 30 seconds

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
        completed: Number(FileService.data.sudokuScores[pseudo] || 0),
        skipped: true,
        reason: "TOO_FAST",
        timeMs,
      });

      return;
    }

    const current = Number(FileService.data.sudokuScores[pseudo] || 0);
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
