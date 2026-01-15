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
  // ------- Dino -------
  socket.on("dino:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = FileService.data.dinoScores[pseudo] || 0;
    if (s > current) {
      FileService.data.dinoScores[pseudo] = s;
      FileService.save("dinoScores", FileService.data.dinoScores);
      console.log(
        withGame(
          `\n🦖 Nouveau score Dino pour [${colors.orange}${pseudo}${colors.blue}] -> ${s}\n`,
          colors.blue
        )
      );
      broadcastSystemMessage(
        io,
        `${pseudo} a fait un nouveau score de ${s} à Dino !`,
        true
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
        colors.blue
      )
    );
    leaderboardManager.broadcastDinoLB(io);
    socket.emit("dino:resetConfirm", { success: true });
  });

  // ------- Flappy -------
  socket.on("flappy:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = FileService.data.flappyScores[pseudo] || 0;
    if (s > current) {
      FileService.data.flappyScores[pseudo] = s;
      FileService.save("flappyScores", FileService.data.flappyScores);
      console.log(
        withGame(
          `\n🐤 Nouveau score Flappy pour [${colors.orange}${pseudo}${colors.pink}] -> ${s}\n`,
          colors.pink
        )
      );
      broadcastSystemMessage(
        io,
        `${pseudo} a fait un nouveau score de ${s} à Flappy !`,
        true
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
        colors.pink
      )
    );
    leaderboardManager.broadcastFlappyLB(io);
    socket.emit("flappy:resetConfirm", { success: true });
  });
}

module.exports = { registerDinoFlappyHandlers };
