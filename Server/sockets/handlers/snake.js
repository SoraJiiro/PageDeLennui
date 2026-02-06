function registerSnakeHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  broadcastSystemMessage,
  withGame,
  colors,
}) {
  const { updateReviveContextFromScore } = require("../../services/economy");
  let isAlreadyLogged_snake = false;

  function setRunnerProgress(score) {
    const s = Math.floor(Number(score) || 0);
    if (!Number.isFinite(s) || s < 0) return;
    try {
      if (!socket.data) socket.data = {};
      if (!socket.data.runnerProgress) socket.data.runnerProgress = {};
      socket.data.runnerProgress.snake = s;
    } catch (e) {}
  }

  function consumeRunnerResume() {
    try {
      const resume = FileService.data.runnerResume;
      if (!resume || typeof resume !== "object") return;
      if (!resume[pseudo]) return;
      delete resume[pseudo].snake;
      const hasAny =
        resume[pseudo].dino != null ||
        resume[pseudo].flappy != null ||
        resume[pseudo].snake != null ||
        resume[pseudo]["2048"] != null ||
        resume[pseudo].blockblast != null;
      if (!hasAny) delete resume[pseudo];
      FileService.save("runnerResume", resume);
    } catch (e) {}
  }

  socket.on("snake:progress", ({ score }) => setRunnerProgress(score));
  socket.on("snake:resumeConsumed", () => consumeRunnerResume());

  socket.on("snake:score", ({ score, elapsedMs, final }) => {
    const s = Number(score);

    if (isNaN(s) || s < 0) return;

    updateReviveContextFromScore(socket, "snake", s);
    setRunnerProgress(s);

    const current = FileService.data.snakeScores[pseudo] || 0;

    if (s > current) {
      FileService.data.snakeScores[pseudo] = s;
      FileService.save("snakeScores", FileService.data.snakeScores);

      // Si score meilleur et indication finale, enregistrer le temps de run
      if (final === true && typeof elapsedMs === "number") {
        if (!FileService.data.snakeBestTimes)
          FileService.data.snakeBestTimes = {};
        FileService.data.snakeBestTimes[pseudo] = Math.max(0, elapsedMs);
        FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
      }

      if (isAlreadyLogged_snake === false) {
        console.log(
          withGame(
            `\n🐍 Nouveau score Snake pour [${colors.orange}${pseudo}${colors.green}] -> ${s}\n`,
            colors.green,
          ),
        );
        broadcastSystemMessage(
          io,
          `${pseudo} a fait un nouveau score de ${s} à Snake !`,
          true,
        );
        isAlreadyLogged_snake = true;
      }
    } else if (
      final === true &&
      s === current &&
      typeof elapsedMs === "number"
    ) {
      // Si la partie se termine avec un score égal au record actuel, mettre à jour le temps du meilleur run
      if (!FileService.data.snakeBestTimes)
        FileService.data.snakeBestTimes = {};
      FileService.data.snakeBestTimes[pseudo] = Math.max(0, elapsedMs);
      FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
    }

    leaderboardManager.broadcastSnakeLB(io);
  });

  socket.on("snake:reset", () => {
    console.log(
      withGame(
        `\n🔄 Reset Snake pour [${colors.orange}${pseudo}${colors.green}]\n`,
        colors.green,
      ),
    );
    leaderboardManager.broadcastSnakeLB(io);
    socket.emit("snake:resetConfirm", { success: true });
  });

  socket.on("snake:getBest", () => {
    const bestScore = FileService.data.snakeScores[pseudo] || 0;
    const bestTime = FileService.data.snakeBestTimes?.[pseudo] || 0;
    socket.emit("snake:best", { score: bestScore, timeMs: bestTime });
  });

  socket.on("snake:requestLeaderboard", () => {
    leaderboardManager.broadcastSnakeLB(io);
  });
}

module.exports = { registerSnakeHandlers };
