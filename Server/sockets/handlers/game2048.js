function register2048Handlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  withGame,
  colors,
}) {
  socket.on("2048:submit_score", (score) => {
    const s = Number(score);
    if (isNaN(s)) return;

    if (!FileService.data.scores2048) FileService.data.scores2048 = {};
    const currentBest = FileService.data.scores2048[pseudo] || 0;

    if (s > currentBest) {
      FileService.data.scores2048[pseudo] = s;
      FileService.save("scores2048", FileService.data.scores2048);

      console.log(
        withGame(`[2048] Nouveau record pour ${pseudo} : ${s}`, colors.green)
      );

      socket.emit("2048:best_score", s);
    }

    leaderboardManager.broadcast2048LB(io);
  });

  socket.on("2048:get_best_score", () => {
    const best =
      (FileService.data.scores2048 && FileService.data.scores2048[pseudo]) || 0;
    socket.emit("2048:best_score", best);
  });

  socket.on("2048:get_leaderboard", () => {
    leaderboardManager.broadcast2048LB(io);
  });

  // Send LB on connect (comportement historique)
  leaderboardManager.broadcast2048LB(io);
}

module.exports = { register2048Handlers };
