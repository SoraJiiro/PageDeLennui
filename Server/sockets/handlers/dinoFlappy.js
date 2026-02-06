function registerDinoFlappyHandlers({
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

  function setRunnerProgress(game, score) {
    const s = Math.floor(Number(score) || 0);
    if (!Number.isFinite(s) || s < 0) return;
    try {
      if (!socket.data) socket.data = {};
      if (!socket.data.runnerProgress) socket.data.runnerProgress = {};
      socket.data.runnerProgress[game] = s;
    } catch (e) {}
  }

  function consumeRunnerResume(game) {
    try {
      const resume = FileService.data.runnerResume;
      if (!resume || typeof resume !== "object") return;
      if (!resume[pseudo]) return;
      delete resume[pseudo][game];
      // Si plus rien à reprendre, on supprime l'entrée
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

  // Le client peut pousser le score courant (run en cours) quand un shutdown arrive
  socket.on("dino:progress", ({ score }) => setRunnerProgress("dino", score));
  socket.on("flappy:progress", ({ score }) =>
    setRunnerProgress("flappy", score),
  );

  // Consommation (anti-abus): une fois la reprise utilisée, on l'efface
  socket.on("dino:resumeConsumed", () => consumeRunnerResume("dino"));
  socket.on("flappy:resumeConsumed", () => consumeRunnerResume("flappy"));

  // ------- Dino -------
  socket.on("dino:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;

    updateReviveContextFromScore(socket, "dino", s);
    setRunnerProgress("dino", s);
    const current = FileService.data.dinoScores[pseudo] || 0;
    if (s > current) {
      FileService.data.dinoScores[pseudo] = s;
      FileService.save("dinoScores", FileService.data.dinoScores);
      console.log(
        withGame(
          `\n🦖 Nouveau score Dino pour [${colors.orange}${pseudo}${colors.blue}] -> ${s}\n`,
          colors.blue,
        ),
      );
      broadcastSystemMessage(
        io,
        `${pseudo} a fait un nouveau score de ${s} à Dino !`,
        true,
      );
    }
    leaderboardManager.broadcastDinoLB(io);
  });

  socket.on("dino:reset", () => {
    FileService.data.dinoScores[pseudo] = 0;
    FileService.save("dinoScores", FileService.data.dinoScores);
    console.log(
      withGame(
        `\n🔄 Reset Dino pour [${colors.orange}${pseudo}${colors.blue}]\n`,
        colors.blue,
      ),
    );
    leaderboardManager.broadcastDinoLB(io);
    socket.emit("dino:resetConfirm", { success: true });
  });

  // ------- Flappy -------
  socket.on("flappy:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;

    updateReviveContextFromScore(socket, "flappy", s);
    setRunnerProgress("flappy", s);
    const current = FileService.data.flappyScores[pseudo] || 0;
    if (s > current) {
      FileService.data.flappyScores[pseudo] = s;
      FileService.save("flappyScores", FileService.data.flappyScores);
      console.log(
        withGame(
          `\n🐤 Nouveau score Flappy pour [${colors.orange}${pseudo}${colors.pink}] -> ${s}\n`,
          colors.pink,
        ),
      );
      broadcastSystemMessage(
        io,
        `${pseudo} a fait un nouveau score de ${s} à Flappy !`,
        true,
      );
    }
    leaderboardManager.broadcastFlappyLB(io);
  });

  socket.on("flappy:reset", () => {
    FileService.data.flappyScores[pseudo] = 0;
    FileService.save("flappyScores", FileService.data.flappyScores);
    console.log(
      withGame(
        `\n🔄 Reset Flappy pour [${colors.orange}${pseudo}${colors.pink}]\n`,
        colors.pink,
      ),
    );
    leaderboardManager.broadcastFlappyLB(io);
    socket.emit("flappy:resetConfirm", { success: true });
  });
}

module.exports = { registerDinoFlappyHandlers };
