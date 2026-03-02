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
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");
  const DINO_MAX_SCORE = 250000;
  const FLAPPY_MAX_SCORE = 10000;

  function rewardFinalRun(game, score) {
    const s = Math.max(0, Math.floor(Number(score) || 0));
    if (s <= 0) return;

    let gain = 0;
    if (game === "dino") {
      gain = Math.floor(s / 1000) * 7;
    } else if (game === "flappy") {
      gain = Math.floor(s / 10) * 5;
    }

    if (gain <= 0) return;
    const wallet = addMoney(
      FileService,
      pseudo,
      gain,
      FileService.data.clicks[pseudo] || 0,
    );
    io.to("user:" + pseudo).emit("economy:wallet", wallet);
    io.to("user:" + pseudo).emit("economy:gameMoney", {
      game,
      gained: gain,
      total: gain,
      final: true,
      score: s,
    });
    try {
      FileService.appendLog({
        type: "GAME_MONEY_REWARD",
        pseudo,
        game,
        gained: gain,
        total: gain,
        score: s,
        at: new Date().toISOString(),
      });
    } catch {}
  }

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
  socket.on("dino:score", ({ score, final } = {}) => {
    const s = Math.floor(Number(score));
    if (!Number.isFinite(s) || s < 0 || s > DINO_MAX_SCORE) return;

    updateReviveContextFromScore(socket, "dino", s);
    setRunnerProgress("dino", s);
    const current = FileService.data.dinoScores[pseudo] || 0;
    if (s > current) {
      FileService.data.dinoScores[pseudo] = s;
      FileService.save("dinoScores", FileService.data.dinoScores);
      if (final === true) {
        try {
          applyAutoBadges({ pseudo, FileService });
        } catch {}
      }
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
    if (final === true) {
      rewardFinalRun("dino", s);
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
  socket.on("flappy:score", ({ score, final } = {}) => {
    const s = Math.floor(Number(score));
    if (!Number.isFinite(s) || s < 0 || s > FLAPPY_MAX_SCORE) return;

    updateReviveContextFromScore(socket, "flappy", s);
    setRunnerProgress("flappy", s);
    const current = FileService.data.flappyScores[pseudo] || 0;
    if (s > current) {
      FileService.data.flappyScores[pseudo] = s;
      FileService.save("flappyScores", FileService.data.flappyScores);
      if (final === true) {
        try {
          applyAutoBadges({ pseudo, FileService });
        } catch {}
      }
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
    if (final === true) {
      rewardFinalRun("flappy", s);
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
