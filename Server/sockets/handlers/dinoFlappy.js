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
  const { recordGameScoreContribution } = require("../../services/guerreClans");
  const DINO_MAX_SCORE = 250000;
  const FLAPPY_MAX_SCORE = 10000;
  const SUBWAY_MAX_SCORE = 250000;

  socket.on("subway:score", ({ score, revivePending } = {}) => {
    const s = Math.floor(Number(score));
    if (!Number.isFinite(s) || s < 0 || s > SUBWAY_MAX_SCORE) return;
    updateReviveContextFromScore(socket, "subway", s);
    if (revivePending === true) {
      clearRunnerProgress("subway");
      setRunnerState("subway", false);
      return;
    }
    setRunnerProgress("subway", s);
  });

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
      `jeu:${game}`,
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
      if (!socket.data.runnerState) socket.data.runnerState = {};
      socket.data.runnerState[game] = { active: true, at: Date.now() };
    } catch (e) {}
  }

  function setRunnerState(game, active) {
    try {
      if (!socket.data) socket.data = {};
      if (!socket.data.runnerState) socket.data.runnerState = {};
      socket.data.runnerState[game] = { active: !!active, at: Date.now() };
    } catch (e) {}
  }

  function clearRunnerProgress(game) {
    try {
      if (socket?.data?.runnerProgress && game in socket.data.runnerProgress) {
        delete socket.data.runnerProgress[game];
      }
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
        resume[pseudo].subway != null ||
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
  socket.on("subway:resumeConsumed", () => consumeRunnerResume("subway"));
  socket.on("subway:progress", ({ score }) =>
    setRunnerProgress("subway", score),
  );

  // ------- Dino -------
  socket.on("dino:score", ({ score, final } = {}) => {
    const s = Math.floor(Number(score));
    if (!Number.isFinite(s) || s < 0 || s > DINO_MAX_SCORE) return;

    updateReviveContextFromScore(socket, "dino", s);
    if (final === true) {
      clearRunnerProgress("dino");
      setRunnerState("dino", false);
      consumeRunnerResume("dino");
    } else {
      setRunnerProgress("dino", s);
    }
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
    }
    if (final === true) {
      recordGameScoreContribution({
        FileService,
        io,
        pseudo,
        game: "dino",
        score: s,
        multiplier: 3,
      });
      rewardFinalRun("dino", s);
      leaderboardManager.broadcastDinoLB(io);
    }
  });

  socket.on("dino:reset", () => {
    clearRunnerProgress("dino");
    setRunnerState("dino", false);
    consumeRunnerResume("dino");
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
    if (final === true) {
      clearRunnerProgress("flappy");
      setRunnerState("flappy", false);
      consumeRunnerResume("flappy");
    } else {
      setRunnerProgress("flappy", s);
    }
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
    }
    if (final === true) {
      recordGameScoreContribution({
        FileService,
        io,
        pseudo,
        game: "flappy",
        score: s,
        multiplier: 3,
      });
      rewardFinalRun("flappy", s);
      leaderboardManager.broadcastFlappyLB(io);
    }
  });

  socket.on("flappy:reset", () => {
    clearRunnerProgress("flappy");
    setRunnerState("flappy", false);
    consumeRunnerResume("flappy");
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

  // ------- Subway Surfer -------
  socket.on("subway:final", ({ score, coins } = {}) => {
    const s = Math.floor(Number(score));
    const c = Math.floor(Number(coins));

    if (!Number.isFinite(s) || s < 0 || s > SUBWAY_MAX_SCORE) return;
    if (!Number.isFinite(c) || c < 0) return;

    updateReviveContextFromScore(socket, "subway", s);
    recordGameScoreContribution({
      FileService,
      io,
      pseudo,
      game: "subway",
      score: s,
      multiplier: 3,
    });
    clearRunnerProgress("subway");
    setRunnerState("subway", false);
    consumeRunnerResume("subway");

    const currentBest = Math.floor(
      Number((FileService.data.subwayScores || {})[pseudo]) || 0,
    );
    if (s > currentBest) {
      if (
        !FileService.data.subwayScores ||
        typeof FileService.data.subwayScores !== "object"
      ) {
        FileService.data.subwayScores = {};
      }
      FileService.data.subwayScores[pseudo] = s;
      FileService.save("subwayScores", FileService.data.subwayScores);
      if (leaderboardManager?.broadcastSubwayLB) {
        leaderboardManager.broadcastSubwayLB(io);
      }
    }

    // Anti-abus: limite pieces plausible en fonction du score.
    const maxCoins = Math.floor(s / 25) + 50;
    const safeCoins = Math.min(c, Math.max(0, maxCoins));

    // 2 monnaie par tranche de 750 points + bonus des pieces ramassees.
    const gainFromScore = Math.floor(s / 750) * 2;
    const gain = Math.max(0, gainFromScore + safeCoins);
    if (gain <= 0) return;

    // Anti-spam: eviter plusieurs rewards successifs en quelques ms.
    const now = Date.now();
    const lastAt = Number(socket?.data?.subwayRewardAt || 0);
    if (now - lastAt < 1500) return;
    if (!socket.data) socket.data = {};
    socket.data.subwayRewardAt = now;

    const wallet = addMoney(
      FileService,
      pseudo,
      gain,
      FileService.data.clicks[pseudo] || 0,
      "jeu:subway",
    );

    io.to("user:" + pseudo).emit("economy:wallet", wallet);
    io.to("user:" + pseudo).emit("economy:gameMoney", {
      game: "subway",
      gained: gain,
      total: gain,
      final: true,
      score: s,
      coins: safeCoins,
    });
  });
}

module.exports = { registerDinoFlappyHandlers };
