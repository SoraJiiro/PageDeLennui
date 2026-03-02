function registerSudokuHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");
  socket.on("sudoku:completed", (payload = {}) => {
    if (!FileService.data.sudokuScores) FileService.data.sudokuScores = {};

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
  });

  socket.on("sudoku:requestLeaderboard", () => {
    if (leaderboardManager?.broadcastSudokuLB) {
      leaderboardManager.broadcastSudokuLB(io);
    }
  });
}

module.exports = { registerSudokuHandlers };
