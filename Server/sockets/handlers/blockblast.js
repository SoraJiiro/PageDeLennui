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
  const {
    getReviveCostForSocket,
    incrementReviveUsed,
  } = require("../../services/economy");
  socket.on("blockblast:score", ({ score, elapsedMs, final }) => {
    const s = Number(score);

    if (isNaN(s) || s < 0) return;

    updateReviveContextFromScore(socket, "blockblast", s);

    const current = FileService.data.blockblastScores[pseudo] || 0;

    if (s > current) {
      FileService.data.blockblastScores[pseudo] = s;
      FileService.save("blockblastScores", FileService.data.blockblastScores);
      // Si score meilleur et indication finale, enregistrer le temps de run
      if (final === true && typeof elapsedMs === "number") {
        if (!FileService.data.blockblastBestTimes)
          FileService.data.blockblastBestTimes = {};
        FileService.data.blockblastBestTimes[pseudo] = Math.max(0, elapsedMs);
        FileService.save(
          "blockblastBestTimes",
          FileService.data.blockblastBestTimes
        );
      }
      if (isAlreadyLogged_bb === false) {
        console.log(
          withGame(
            `\n🧱 Nouveau score Block Blast pour [${colors.orange}${pseudo}${colors.green}] -> ${s}\n`,
            colors.green
          )
        );
        broadcastSystemMessage(
          io,
          `${pseudo} a fait un nouveau score de ${s} à Block Blast !`,
          true
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
        FileService.data.blockblastBestTimes
      );
    }

    leaderboardManager.broadcastBlockBlastLB(io);
  });

  socket.on("blockblast:saveMove", (moveData) => {
    try {
      // If saving blockblast history is disabled in config, skip
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
        err
      );
    }
  });

  socket.on("blockblast:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const info = getReviveCostForSocket(socket, "blockblast");
    if (!info || info.cost == null) {
      socket.emit(
        "blockblast:reviveError",
        "Contexte de réanimation introuvable (score manquant)."
      );
      return;
    }
    if (info.error) {
      socket.emit("blockblast:reviveError", info.error);
      return;
    }

    const cost = Number(info.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      socket.emit("blockblast:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      recalculateMedals(
        pseudo,
        FileService.data.clicks[pseudo],
        io,
        false,
        true
      );

      // Notifier le nouveau solde de clicks
      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      incrementReviveUsed(socket, "blockblast");
      socket.emit("blockblast:reviveSuccess");

      console.log(
        withGame(
          `[BlockBlast] ${pseudo} a payé ${cost} clicks pour continuer.`,
          colors.green
        )
      );
    } else {
      socket.emit("blockblast:reviveError", "Pas assez de clicks !");
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
        FileService.data.blockblastBestTimes
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
        colors.green
      )
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
    }
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
