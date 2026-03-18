const fs = require("fs");
const path = require("path");

let isAlreadyLogged_bb = false;

function registerBlockblastHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  recalculateMedals,
  broadcastSystemMessage,
  withGame,
  colors,
  config,
}) {
  const { updateReviveContextFromScore } = require("../../services/economy");
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");
  const { recordGameScoreContribution } = require("../../services/guerreClans");
  const {
    getReviveCostForSocket,
    incrementReviveUsed,
  } = require("../../services/economy");
  const { consumeLife, getLivesCount } = require("../../services/reviveLives");
  const { spendMoney } = require("../../services/wallet");
  const BLOCKBLAST_MAX_SCORE = 1000000;

  function rewardBlockblastFinal(score) {
    const s = Math.max(0, Math.floor(Number(score) || 0));
    if (s <= 0) return;
    const gain = Math.floor(s / 400) * 3;
    if (gain <= 0) return;

    const wallet = addMoney(
      FileService,
      pseudo,
      gain,
      FileService.data.clicks[pseudo] || 0,
      "jeu:blockblast",
    );
    io.to("user:" + pseudo).emit("economy:wallet", wallet);
    io.to("user:" + pseudo).emit("economy:gameMoney", {
      game: "blockblast",
      gained: gain,
      total: gain,
      final: true,
      score: s,
    });
    try {
      FileService.appendLog({
        type: "GAME_MONEY_REWARD",
        pseudo,
        game: "blockblast",
        gained: gain,
        total: gain,
        score: s,
        at: new Date().toISOString(),
      });
    } catch {}
  }

  function setRunnerProgress(score) {
    const s = Math.floor(Number(score) || 0);
    if (!Number.isFinite(s) || s < 0) return;
    try {
      if (!socket.data) socket.data = {};
      if (!socket.data.runnerProgress) socket.data.runnerProgress = {};
      socket.data.runnerProgress.blockblast = s;
    } catch (e) {}
  }

  function consumeRunnerResume() {
    try {
      const resume = FileService.data.runnerResume;
      if (!resume || typeof resume !== "object") return;
      if (!resume[pseudo]) return;
      delete resume[pseudo].blockblast;
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

  socket.on("blockblast:progress", ({ score }) => setRunnerProgress(score));
  socket.on("blockblast:resumeConsumed", () => consumeRunnerResume());
  socket.on("blockblast:score", ({ score, elapsedMs, final }) => {
    const s = Math.floor(Number(score));

    if (!Number.isFinite(s) || s < 0 || s > BLOCKBLAST_MAX_SCORE) return;

    updateReviveContextFromScore(socket, "blockblast", s);
    setRunnerProgress(s);

    const current = FileService.data.blockblastScores[pseudo] || 0;

    if (s > current) {
      FileService.data.blockblastScores[pseudo] = s;
      FileService.save("blockblastScores", FileService.data.blockblastScores);
      if (final === true) {
        try {
          applyAutoBadges({ pseudo, FileService });
        } catch {}
      }
      // Si score meilleur et indication finale, enregistrer le temps de run
      if (final === true && typeof elapsedMs === "number") {
        if (!FileService.data.blockblastBestTimes)
          FileService.data.blockblastBestTimes = {};
        FileService.data.blockblastBestTimes[pseudo] = Math.max(0, elapsedMs);
        FileService.save(
          "blockblastBestTimes",
          FileService.data.blockblastBestTimes,
        );
      }
      if (isAlreadyLogged_bb === false) {
        console.log(
          withGame(
            `\n🧱 Nouveau score Block Blast pour [${colors.orange}${pseudo}${colors.green}] -> ${s}\n`,
            colors.green,
          ),
        );
        isAlreadyLogged_bb = true;
      }
    } else if (
      final === true &&
      s === current &&
      typeof elapsedMs === "number"
    ) {
      // Si la partie se termine avec un score égal au record actuel, mettre à jour le temps du meilleur run
      if (!FileService.data.blockblastBestTimes)
        FileService.data.blockblastBestTimes = {};
      FileService.data.blockblastBestTimes[pseudo] = Math.max(0, elapsedMs);
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes,
      );
    }

    if (final === true) {
      recordGameScoreContribution({
        FileService,
        io,
        pseudo,
        game: "blockblast",
        score: s,
        multiplier: 3,
      });
      rewardBlockblastFinal(s);
      leaderboardManager.broadcastBlockBlastLB(io);
    }
  });

  socket.on("blockblast:saveMove", (moveData) => {
    try {
      if (!config.SAVE_BLOCKBLAST_HISTORY) return;
      // Créer le dossier d'historique si nécessaire
      const historyDir = path.join(config.DATA, "blockblast_history");
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      // Nom du fichier basé sur le pseudo et la date
      const date = new Date().toISOString().split("T")[0];
      // Sanitize pseudo pour un nom de fichier Windows-safe
      const safePseudo = String(pseudo).replace(/[^a-z0-9_-]/gi, "_");
      const filename = path.join(historyDir, `${safePseudo}_${date}.jsonl`);

      // Ajouter le pseudo et la date aux données
      const dataToSave = {
        ...moveData,
        pseudo,
        date: new Date().toISOString(),
      };

      fs.appendFileSync(filename, JSON.stringify(dataToSave) + "\n");
    } catch (err) {
      console.error(
        "Erreur lors de la sauvegarde du mouvement Block Blast:",
        err,
      );
    }
  });

  socket.on("blockblast:payToContinue", ({ price, mode } = {}) => {
    const info = getReviveCostForSocket(socket, "blockblast");
    if (!info || info.cost == null) {
      socket.emit(
        "blockblast:reviveError",
        "Contexte de réanimation introuvable (score manquant).",
      );
      return;
    }
    if (info.error) {
      socket.emit("blockblast:reviveError", info.error);
      return;
    }

    const requestedMode = mode === "life" || mode === "pay" ? mode : "auto";

    if (requestedMode === "life") {
      const lifeResult = consumeLife(FileService, pseudo);
      if (!lifeResult.used) {
        socket.emit(
          "blockblast:reviveError",
          "Tu n'as plus de vie disponible.",
        );
        return;
      }

      incrementReviveUsed(socket, "blockblast");
      socket.emit("blockblast:reviveSuccess", {
        usedLife: true,
        remainingLives: lifeResult.remaining,
      });

      console.log(
        withGame(
          `[BlockBlast] ${pseudo} a utilise une vie de reanimation.`,
          colors.green,
        ),
      );
      return;
    }

    if (requestedMode === "auto") {
      const lifeResult = consumeLife(FileService, pseudo);
      if (lifeResult.used) {
        incrementReviveUsed(socket, "blockblast");
        socket.emit("blockblast:reviveSuccess", {
          usedLife: true,
          remainingLives: lifeResult.remaining,
        });

        console.log(
          withGame(
            `[BlockBlast] ${pseudo} a utilise une vie de reanimation.`,
            colors.green,
          ),
        );
        return;
      }
    }

    const cost = Number(info.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      socket.emit("blockblast:reviveError", "Prix invalide.");
      return;
    }

    const spend = spendMoney(
      FileService,
      pseudo,
      cost,
      FileService.data.clicks?.[pseudo] || 0,
    );

    if (spend.ok) {
      socket.emit("economy:wallet", spend.wallet);
      incrementReviveUsed(socket, "blockblast");
      socket.emit("blockblast:reviveSuccess", {
        usedLife: false,
        remainingLives: getLivesCount(FileService, pseudo),
      });

      console.log(
        withGame(
          `[BlockBlast] ${pseudo} a payé ${cost} monnaie pour continuer.`,
          colors.green,
        ),
      );
    } else {
      socket.emit("blockblast:reviveError", "Pas assez de monnaie !");
    }
  });

  socket.on("blockblast:reset", () => {
    // Réinitialiser le meilleur score à 0
    FileService.data.blockblastScores[pseudo] = 0;
    FileService.save("blockblastScores", FileService.data.blockblastScores);

    // Réinitialiser le temps du meilleur run
    if (FileService.data.blockblastBestTimes) {
      delete FileService.data.blockblastBestTimes[pseudo];
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes,
      );
    }

    // Effacer toute sauvegarde de grille associée à ce joueur
    if (
      FileService.data.blockblastSaves &&
      FileService.data.blockblastSaves[pseudo]
    ) {
      delete FileService.data.blockblastSaves[pseudo];
      FileService.save("blockblastSaves", FileService.data.blockblastSaves);
    }
    console.log(
      withGame(
        `\n🔄 Reset Block Blast pour [${colors.orange}${pseudo}${colors.green}]\n`,
        colors.green,
      ),
    );
    leaderboardManager.broadcastBlockBlastLB(io);
    socket.emit("blockblast:resetConfirm", { success: true });
  });

  // Sauvegarde/restauration de l'état courant de Block Blast
  socket.on(
    "blockblast:saveState",
    ({ grid, score, pieces, elapsedMs, gameOver }) => {
      try {
        // Validation simple
        if (
          !Array.isArray(grid) ||
          typeof score !== "number" ||
          !Array.isArray(pieces)
        )
          return;
        // Ne pas enregistrer les états finaux
        if (gameOver === true) return;
        if (!FileService.data.blockblastSaves)
          FileService.data.blockblastSaves = {};
        // Inclure elapsedMs si fourni (nombre de ms depuis le début de la partie)
        FileService.data.blockblastSaves[pseudo] = {
          grid,
          score,
          pieces,
          elapsedMs: typeof elapsedMs === "number" ? elapsedMs : 0,
        };
        FileService.save("blockblastSaves", FileService.data.blockblastSaves);
      } catch (e) {
        console.error("Erreur saveState Block Blast:", e);
      }
    },
  );

  socket.on("blockblast:loadState", () => {
    try {
      const save = FileService.data.blockblastSaves?.[pseudo] || null;
      if (save) {
        socket.emit("blockblast:state", { found: true, state: save });
      } else {
        socket.emit("blockblast:state", { found: false });
      }
    } catch (e) {
      socket.emit("blockblast:state", { found: false });
    }
  });

  socket.on("blockblast:clearState", () => {
    if (
      FileService.data.blockblastSaves &&
      FileService.data.blockblastSaves[pseudo]
    ) {
      delete FileService.data.blockblastSaves[pseudo];
      FileService.save("blockblastSaves", FileService.data.blockblastSaves);
    }
  });
}

module.exports = { registerBlockblastHandlers };
