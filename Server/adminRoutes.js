const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { FileService } = require("./util");
const dbUsers = require("./dbUsers");
const { exec } = require("child_process");
const { recalculateMedals } = require("./medals");
const words = require("./words");

// Fonction pour créer le router avec accès à io
function createAdminRouter(io, motusGame, leaderboardManager) {
  const router = express.Router();

  // Helper pour refresh les leaderboards
  function refreshLeaderboard(statType) {
    if (!leaderboardManager) return;
    switch (statType) {
      case "clicks":
        leaderboardManager.broadcastClickerLB(io);
        break;
      case "dinoScores":
        leaderboardManager.broadcastDinoLB(io);
        break;
      case "flappyScores":
        leaderboardManager.broadcastFlappyLB(io);
        break;
      case "unoWins":
        leaderboardManager.broadcastUnoLB(io);
        break;
      case "p4Wins":
        leaderboardManager.broadcastP4LB(io);
        break;
      case "blockblastScores":
        leaderboardManager.broadcastBlockBlastLB(io);
        break;
      case "snakeScores":
        leaderboardManager.broadcastSnakeLB(io);
        break;
      case "motusScores":
        leaderboardManager.broadcastMotusLB(io);
        break;
      case "scores2048":
        leaderboardManager.broadcast2048LB(io);
        break;
      case "mashWins":
        leaderboardManager.broadcastMashLB(io);
        break;
    }
  }

  // Helper pour envoyer des messages système (copié de handlers.js pour éviter les dépendances circulaires)
  function broadcastSystemMessage(text, persist = false) {
    if (!io) return;
    const payload = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: "System",
      text: text,
      at: new Date().toISOString(),
      tag: { text: "System", color: "#ff0000" },
    };
    io.emit("chat:message", payload);
    if (persist) {
      FileService.data.historique.push(payload);
      if (FileService.data.historique.length > 200) {
        FileService.data.historique = FileService.data.historique.slice(-200);
      }
      FileService.save("historique", FileService.data.historique);
      FileService.appendLog(payload);
    }
  }

  // Middleware pour vérifier que l'utilisateur est Admin
  function requireAdmin(req, res, next) {
    if (
      !req.session ||
      !req.session.user ||
      req.session.user.pseudo !== "Admin"
    ) {
      return res.status(403).json({ message: "Accès refusé" });
    }
    next();
  }

  // --- Transactions ---
  router.get("/transactions", requireAdmin, (req, res) => {
    const transactions = FileService.data.transactions || [];
    res.json(transactions);
  });

  router.post("/transactions/approve", requireAdmin, (req, res) => {
    const { id } = req.body;
    if (!FileService.data.transactions)
      return res.status(400).json({ message: "Aucune transaction" });

    const txIndex = FileService.data.transactions.findIndex((t) => t.id === id);
    if (txIndex === -1)
      return res.status(404).json({ message: "Transaction introuvable" });

    const tx = FileService.data.transactions[txIndex];
    if (tx.status !== "pending")
      return res.status(400).json({ message: "Transaction déjà traitée" });

    // Effectuer le transfert
    if (!FileService.data.clicks[tx.to]) FileService.data.clicks[tx.to] = 0;
    FileService.data.clicks[tx.to] += tx.amount;
    FileService.save("clicks", FileService.data.clicks);

    // Recalculer médailles destinataire
    recalculateMedals(tx.to, FileService.data.clicks[tx.to], io);

    // Mettre à jour statut
    tx.status = "approved";
    tx.processedAt = new Date().toISOString();
    FileService.save("transactions", FileService.data.transactions);

    // Notifier
    broadcastSystemMessage(
      `Don de ${tx.amount} clicks de ${tx.from} à ${tx.to} approuvé par l'Admin.`,
      true
    );

    // Update destinataire si connecté
    // Note: On n'a pas accès facile aux sockets ici sans passer par io.sockets...
    // On va broadcast le leaderboard, ça suffira pour la mise à jour visuelle globale
    refreshLeaderboard("clicks");

    res.json({ success: true });
  });

  router.post("/transactions/reject", requireAdmin, (req, res) => {
    const { id } = req.body;
    if (!FileService.data.transactions)
      return res.status(400).json({ message: "Aucune transaction" });

    const txIndex = FileService.data.transactions.findIndex((t) => t.id === id);
    if (txIndex === -1)
      return res.status(404).json({ message: "Transaction introuvable" });

    const tx = FileService.data.transactions[txIndex];
    if (tx.status !== "pending")
      return res.status(400).json({ message: "Transaction déjà traitée" });

    // Rembourser l'expéditeur
    if (!FileService.data.clicks[tx.from]) FileService.data.clicks[tx.from] = 0;
    FileService.data.clicks[tx.from] += tx.amount;
    FileService.save("clicks", FileService.data.clicks);

    // Recalculer médailles expéditeur
    recalculateMedals(tx.from, FileService.data.clicks[tx.from], io);

    // Mettre à jour statut
    tx.status = "rejected";
    tx.processedAt = new Date().toISOString();
    FileService.save("transactions", FileService.data.transactions);

    broadcastSystemMessage(
      `Don de ${tx.amount} clicks de ${tx.from} à ${tx.to} refusé par l'Admin.`,
      true
    );
    refreshLeaderboard("clicks");

    res.json({ success: true });
  });

  // Obtenir les infos d'un utilisateur
  router.get("/user-info", requireAdmin, (req, res) => {
    const { pseudo } = req.query;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    try {
      const data = {
        pseudo,
        clicks:
          (FileService.data.clicks && FileService.data.clicks[pseudo]) || 0,
        dinoScore:
          (FileService.data.dinoScores &&
            FileService.data.dinoScores[pseudo]) ||
          0,
        flappyScore:
          (FileService.data.flappyScores &&
            FileService.data.flappyScores[pseudo]) ||
          0,
        snakeScore:
          (FileService.data.snakeScores &&
            FileService.data.snakeScores[pseudo]) ||
          0,
        unoWins:
          (FileService.data.unoWins && FileService.data.unoWins[pseudo]) || 0,
        p4Wins:
          (FileService.data.p4Wins && FileService.data.p4Wins[pseudo]) || 0,
        blockblastScore:
          (FileService.data.blockblastScores &&
            FileService.data.blockblastScores[pseudo]) ||
          0,
        score2048: FileService.data.scores2048
          ? FileService.data.scores2048[pseudo] || 0
          : 0,
        motusScores: FileService.data.motusScores
          ? FileService.data.motusScores[pseudo]
          : null,
        motusTotalWords: words.length,
        medals:
          (FileService.data.medals && FileService.data.medals[pseudo]) || [],
        tag: FileService.data.tags ? FileService.data.tags[pseudo] || "" : "",
      };

      const userRec = dbUsers.findByPseudoExact
        ? dbUsers.findByPseudoExact(pseudo)
        : dbUsers.findBypseudo(pseudo);
      if (userRec) {
        data.id = userRec.id || null;
        data.createdAt = userRec.creeAt || userRec.createdAt || null;
        data.createdFromIp =
          userRec.creeDepuis || userRec.createdFromIp || null;
        data.password = userRec.password || null;
        data.passwordHash =
          userRec["passwordHashé"] || userRec.passwordHash || null;
      }

      res.json(data);
    } catch (err) {
      console.error("[ADMIN] Erreur /user-info", err);
      res
        .status(500)
        .json({ message: "Erreur serveur lors de la récupération des infos" });
    }
  });

  // Modifier une stat
  router.post("/modify-stat", requireAdmin, (req, res) => {
    const { pseudo, statType, value } = req.body;

    if (!pseudo || !statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "scores2048",
      "mashWins",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (statType === "motusScores") {
      if (!FileService.data.motusScores) FileService.data.motusScores = {};
      const current = FileService.data.motusScores[pseudo] || {
        words: 0,
        tries: 0,
      };
      const currentTries = typeof current === "object" ? current.tries || 0 : 0;

      FileService.data.motusScores[pseudo] = {
        words: value,
        tries: currentTries,
      };
      FileService.save("motusScores", FileService.data.motusScores);
      refreshLeaderboard(statType);

      return res.json({
        message: `Statistique ${statType} (mots) de ${pseudo} mise à jour à ${value}`,
      });
    }

    FileService.data[statType][pseudo] = value;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, value, io);
    }

    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Modification: ${pseudo} - ${statType} = ${value}`,
    });

    res.json({
      message: `Statistique ${statType} de ${pseudo} mise à jour à ${value}`,
    });
  });

  // Ajouter un tricheur
  router.post("/cheater/add", requireAdmin, (req, res) => {
    const { pseudo } = req.body;
    if (!pseudo) return res.status(400).json({ message: "Pseudo requis" });

    // 1. Ajouter à la liste des cheaters
    if (!FileService.data.cheaters) FileService.data.cheaters = [];
    if (!FileService.data.cheaters.includes(pseudo)) {
      FileService.data.cheaters.push(pseudo);
      FileService.save("cheaters", FileService.data.cheaters);

      console.log(`[ACTION_ADMIN] ${pseudo} marqué comme TRICHEUR par l'Admin`);
      FileService.appendLog({
        type: "CHEATER_ADD",
        pseudo: pseudo,
        date: new Date().toISOString(),
      });
    }

    // 2. Ajouter le tag Tricheur (gris)
    if (!FileService.data.tags) FileService.data.tags = {};
    FileService.data.tags[pseudo] = { text: "Tricheur", color: "#808080" };
    FileService.save("tags", FileService.data.tags);

    // 3. Mettre à jour les médailles (envoie via socket)
    const clicks = FileService.data.clicks[pseudo] || 0;
    recalculateMedals(pseudo, clicks, io);

    res.json({ message: "Joueur ajouté aux tricheurs" });
  });

  // Obtenir la liste des tricheurs
  router.get("/cheater/list", requireAdmin, (req, res) => {
    const cheaters = FileService.data.cheaters || [];
    res.json(cheaters);
  });

  // Retirer un tricheur
  router.post("/cheater/remove", requireAdmin, (req, res) => {
    const { pseudo } = req.body;
    if (!pseudo) return res.status(400).json({ message: "Pseudo requis" });

    // Vérifier si le score est négatif
    const currentClicks = FileService.data.clicks[pseudo] || 0;
    if (currentClicks < 0) {
      return res.status(400).json({
        message:
          "Impossible de retirer ce tricheur : son score est négatif (" +
          currentClicks +
          ")",
      });
    }

    // 1. Retirer de la liste des cheaters
    if (FileService.data.cheaters) {
      const initialLength = FileService.data.cheaters.length;
      FileService.data.cheaters = FileService.data.cheaters.filter(
        (p) => p !== pseudo
      );
      if (FileService.data.cheaters.length < initialLength) {
        FileService.save("cheaters", FileService.data.cheaters);

        console.log(
          `[ACTION_ADMIN] ${pseudo} retiré de la liste des TRICHEURS par l'Admin`
        );
        FileService.appendLog({
          type: "CHEATER_REMOVE",
          pseudo: pseudo,
          date: new Date().toISOString(),
        });
      }
    }

    // 2. Retirer le tag Tricheur
    if (FileService.data.tags && FileService.data.tags[pseudo]) {
      if (FileService.data.tags[pseudo].text === "Tricheur") {
        delete FileService.data.tags[pseudo];
        FileService.save("tags", FileService.data.tags);
      }
    }

    // 3. Mettre à jour les médailles
    const clicks = FileService.data.clicks[pseudo] || 0;
    recalculateMedals(pseudo, clicks, io);

    res.json({ message: "Joueur retiré des tricheurs" });
  });

  // Modifier toutes les stats
  router.post("/modify-all-stats", requireAdmin, (req, res) => {
    const { pseudo, stats } = req.body;

    if (!pseudo || typeof stats !== "object") {
      return res.status(400).json({ message: "Données invalides" });
    }

    for (const statType in stats) {
      if (typeof stats[statType] !== "number") {
        return res
          .status(400)
          .json({ message: "Valeur de statistique invalide" });
      }

      const validStats = [
        "clicks",
        "dinoScores",
        "flappyScores",
        "unoWins",
        "p4Wins",
        "blockblastScores",
        "snakeScores",
        "motusScores",
        "scores2048",
        "mashWins",
      ];

      if (!validStats.includes(statType)) {
        return res
          .status(400)
          .json({ message: "Type de statistique invalide" });
      }

      FileService.data[statType][pseudo] = stats[statType];
      FileService.save(statType, FileService.data[statType]);

      // Si on modifie les clicks, recalculer les médailles
      if (statType === "clicks") {
        recalculateMedals(pseudo, stats[statType], io);
      }

      console.log({
        level: "action",
        message: `Modification: ${pseudo} ${statType} -> ${stats[statType]}`,
      });
    }

    res.json({
      message: `Toutes les statistiques de ${pseudo} ont été mises à jour`,
    });
  });

  router.post("/modify-all-users-stat", requireAdmin, (req, res) => {
    const { statType, value } = req.body;

    if (!statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "scores2048",
      "mashWins",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const users = Object.keys(FileService.data[statType] || {});
    users.forEach((pseudo) => {
      if (statType === "motusScores") {
        const current = FileService.data.motusScores[pseudo] || {
          words: 0,
          tries: 0,
        };
        const currentTries =
          typeof current === "object" ? current.tries || 0 : 0;
        FileService.data.motusScores[pseudo] = {
          words: value,
          tries: currentTries,
        };
      } else {
        FileService.data[statType][pseudo] = value;
        if (statType === "clicks") {
          recalculateMedals(pseudo, value, io);
        }
      }
    });

    FileService.save(statType, FileService.data[statType]);
    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Modification massive: ${statType} = ${value} pour ${users.length} joueurs`,
    });

    res.json({
      message: `${statType} de ${users.length} joueurs mis à ${value}`,
    });
  });

  // Ajouter stat pour ALL les utilisateurs
  router.post("/add-all-users-stat", requireAdmin, (req, res) => {
    const { statType, value } = req.body;

    if (!statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "scores2048",
      "mashWins",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const users = Object.keys(FileService.data[statType] || {});
    users.forEach((pseudo) => {
      if (statType === "motusScores") {
        const current = FileService.data.motusScores[pseudo] || {
          words: 0,
          tries: 0,
        };
        const currentWords =
          typeof current === "object" ? current.words || 0 : current;
        const currentTries =
          typeof current === "object" ? current.tries || 0 : 0;
        FileService.data.motusScores[pseudo] = {
          words: currentWords + value,
          tries: currentTries,
        };
      } else {
        const current = FileService.data[statType][pseudo] || 0;
        const newValue = current + value;
        FileService.data[statType][pseudo] = newValue;
        if (statType === "clicks") {
          recalculateMedals(pseudo, newValue, io);
        }
      }
    });

    FileService.save(statType, FileService.data[statType]);
    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Ajout massif: ${statType} +${value} pour ${users.length} joueurs`,
    });

    res.json({
      message: `${value} ajouté à ${statType} de ${users.length} joueurs`,
    });
  });

  // Retirer stat pour ALL les utilisateurs
  router.post("/remove-all-users-stat", requireAdmin, (req, res) => {
    const { statType, value } = req.body;

    if (!statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "scores2048",
      "mashWins",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const users = Object.keys(FileService.data[statType] || {});
    users.forEach((pseudo) => {
      if (statType === "motusScores") {
        const current = FileService.data.motusScores[pseudo] || {
          words: 0,
          tries: 0,
        };
        const currentWords =
          typeof current === "object" ? current.words || 0 : current;
        const currentTries =
          typeof current === "object" ? current.tries || 0 : 0;
        FileService.data.motusScores[pseudo] = {
          words: Math.max(0, currentWords - value),
          tries: currentTries,
        };
      } else {
        const current = FileService.data[statType][pseudo] || 0;
        const newValue = Math.max(0, current - value);
        FileService.data[statType][pseudo] = newValue;
        if (statType === "clicks") {
          recalculateMedals(pseudo, newValue, io);
        }
      }
    });

    FileService.save(statType, FileService.data[statType]);
    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Retrait massif: ${statType} -${value} pour ${users.length} joueurs`,
    });

    res.json({
      message: `${value} retiré de ${statType} de ${users.length} joueurs`,
    });
  });

  // Ajouter stat
  router.post("/add-stat", requireAdmin, (req, res) => {
    const { pseudo, statType, value } = req.body;

    if (!pseudo || !statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "scores2048",
      "mashWins",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (statType === "motusScores") {
      if (!FileService.data.motusScores) FileService.data.motusScores = {};
      const current = FileService.data.motusScores[pseudo] || {
        words: 0,
        tries: 0,
      };
      // Si c'est un nombre (ancien format), on convertit
      const currentWords =
        typeof current === "object" ? current.words || 0 : current;
      const currentTries = typeof current === "object" ? current.tries || 0 : 0;

      const newWords = currentWords + value;
      FileService.data.motusScores[pseudo] = {
        words: newWords,
        tries: currentTries,
      };
      FileService.save("motusScores", FileService.data.motusScores);
      refreshLeaderboard(statType);

      return res.json({
        message: `Statistique ${statType} (mots) de ${pseudo} augmentée de ${value} (total: ${newWords})`,
      });
    }

    const currentValue = FileService.data[statType][pseudo] || 0;
    const newValue = currentValue + value;

    FileService.data[statType][pseudo] = newValue;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, newValue, io);
    }

    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Ajout: ${pseudo} (${statType} + ${value}) -> ${newValue}`,
    });

    res.json({
      message: `Statistique ${statType} de ${pseudo} augmentée de ${value} (total: ${newValue})`,
    });
  });

  // Modifier un best-time (snake / blockblast)
  router.post("/modify-time", requireAdmin, (req, res) => {
    const { pseudo, boardType, time } = req.body || {};

    if (!pseudo || !boardType || typeof time !== "number" || time < 0) {
      return res.status(400).json({ message: "Données invalides" });
    }

    const type = String(boardType).toLowerCase();
    if (type === "snake") {
      if (!FileService.data.snakeBestTimes)
        FileService.data.snakeBestTimes = {};
      FileService.data.snakeBestTimes[pseudo] = time;
      FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
      refreshLeaderboard("snakeScores");
      return res.json({ message: `Durée snake mise à jour pour ${pseudo}` });
    }

    if (type === "blockblast") {
      if (!FileService.data.blockblastBestTimes)
        FileService.data.blockblastBestTimes = {};
      FileService.data.blockblastBestTimes[pseudo] = time;
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes
      );
      refreshLeaderboard("blockblastScores");
      return res.json({
        message: `Durée blockblast mise à jour pour ${pseudo}`,
      });
    }

    return res
      .status(400)
      .json({ message: "boardType invalide (snake | blockblast)" });
  });

  // Modifier le nombre d'essais (Motus)
  router.post("/modify-tries", requireAdmin, (req, res) => {
    const { pseudo, tries } = req.body || {};

    if (!pseudo || typeof tries !== "number" || tries < 0) {
      return res.status(400).json({ message: "Données invalides" });
    }

    if (!FileService.data.motusScores) FileService.data.motusScores = {};

    // Si l'utilisateur n'existe pas, on l'initialise
    if (!FileService.data.motusScores[pseudo]) {
      FileService.data.motusScores[pseudo] = { words: 0, tries: tries };
    } else {
      // Si c'est un objet (nouveau format)
      if (typeof FileService.data.motusScores[pseudo] === "object") {
        FileService.data.motusScores[pseudo].tries = tries;
      } else {
        // Migration si jamais c'était un nombre (peu probable mais sécurité)
        FileService.data.motusScores[pseudo] = {
          words: FileService.data.motusScores[pseudo] || 0,
          tries: tries,
        };
      }
    }

    FileService.save("motusScores", FileService.data.motusScores);
    refreshLeaderboard("motusScores");
    return res.json({ message: `Essais Motus mis à jour pour ${pseudo}` });
  });

  // Supprimer un best-time (snake / blockblast)
  router.post("/remove-time", requireAdmin, (req, res) => {
    const { pseudo, boardType } = req.body || {};
    if (!pseudo || !boardType)
      return res.status(400).json({ message: "Données invalides" });

    const type = String(boardType).toLowerCase();
    if (type === "snake") {
      if (
        FileService.data.snakeBestTimes &&
        pseudo in FileService.data.snakeBestTimes
      ) {
        delete FileService.data.snakeBestTimes[pseudo];
        FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
        refreshLeaderboard("snakeScores");
        return res.json({ message: `Durée snake supprimée pour ${pseudo}` });
      }
      return res
        .status(404)
        .json({ message: "Aucune durée snake trouvée pour ce pseudo" });
    }

    if (type === "blockblast") {
      if (
        FileService.data.blockblastBestTimes &&
        pseudo in FileService.data.blockblastBestTimes
      ) {
        delete FileService.data.blockblastBestTimes[pseudo];
        FileService.save(
          "blockblastBestTimes",
          FileService.data.blockblastBestTimes
        );
        refreshLeaderboard("blockblastScores");
        return res.json({
          message: `Durée blockblast supprimée pour ${pseudo}`,
        });
      }
      return res
        .status(404)
        .json({ message: "Aucune durée blockblast trouvée pour ce pseudo" });
    }

    return res
      .status(400)
      .json({ message: "boardType invalide (snake | blockblast)" });
  });

  // Retirer stat
  router.post("/remove-stat", requireAdmin, (req, res) => {
    const { pseudo, statType, value } = req.body;

    if (!pseudo || !statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "scores2048",
      "mashWins",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (statType === "motusScores") {
      if (!FileService.data.motusScores) FileService.data.motusScores = {};
      const current = FileService.data.motusScores[pseudo] || {
        words: 0,
        tries: 0,
      };
      const currentWords =
        typeof current === "object" ? current.words || 0 : current;
      const currentTries = typeof current === "object" ? current.tries || 0 : 0;

      const newWords = Math.max(0, currentWords - value);
      FileService.data.motusScores[pseudo] = {
        words: newWords,
        tries: currentTries,
      };
      FileService.save("motusScores", FileService.data.motusScores);
      refreshLeaderboard(statType);

      return res.json({
        message: `Statistique ${statType} (mots) de ${pseudo} diminuée de ${value} (total: ${newWords})`,
      });
    }

    const currentValue = FileService.data[statType][pseudo] || 0;
    const newValue = Math.max(0, currentValue - value);

    FileService.data[statType][pseudo] = newValue;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, newValue, io);
    }

    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Retrait: ${pseudo} (${statType} - ${value}) -> ${newValue}`,
    });

    res.json({
      message: `Statistique ${statType} de ${pseudo} diminuée de ${value} (total: ${newValue})`,
    });
  });

  // Supprimer un utilisateur
  router.post("/delete-user", requireAdmin, (req, res) => {
    const { pseudo } = req.body;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (pseudo === "Admin") {
      return res
        .status(403)
        .json({ message: "Impossible de supprimer cet administrateur" });
    }

    // Supprimer de users.json
    const deletedFromUsers = dbUsers.deleteUser(pseudo);

    if (!deletedFromUsers) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Supprimer de toutes les bases de données
    delete FileService.data.clicks[pseudo];
    delete FileService.data.dinoScores[pseudo];
    delete FileService.data.flappyScores[pseudo];
    delete FileService.data.unoWins[pseudo];
    delete FileService.data.p4Wins[pseudo];
    delete FileService.data.blockblastScores[pseudo];
    delete FileService.data.medals[pseudo];
    delete FileService.data.blockblastSaves[pseudo];
    if (FileService.data.motusScores)
      delete FileService.data.motusScores[pseudo];
    if (FileService.data.motusState) delete FileService.data.motusState[pseudo];

    // Supprimer aussi des nouveaux leaderboards
    if (FileService.data.blockblastBestTimes) {
      delete FileService.data.blockblastBestTimes[pseudo];
    }
    // Supprimer Snake data
    if (
      FileService.data.snakeScores &&
      pseudo in FileService.data.snakeScores
    ) {
      delete FileService.data.snakeScores[pseudo];
    }
    if (
      FileService.data.snakeBestTimes &&
      pseudo in FileService.data.snakeBestTimes
    ) {
      delete FileService.data.snakeBestTimes[pseudo];
    }

    // Sauvegarder toutes les modifications
    FileService.save("clicks", FileService.data.clicks);
    FileService.save("dinoScores", FileService.data.dinoScores);
    FileService.save("flappyScores", FileService.data.flappyScores);
    FileService.save("unoWins", FileService.data.unoWins);
    FileService.save("p4Wins", FileService.data.p4Wins);
    FileService.save("blockblastScores", FileService.data.blockblastScores);
    if (FileService.data.motusScores)
      FileService.save("motusScores", FileService.data.motusScores);
    if (FileService.data.motusState)
      FileService.save("motusState", FileService.data.motusState);
    FileService.save("medals", FileService.data.medals);
    FileService.save("blockblastSaves", FileService.data.blockblastSaves);
    if (FileService.data.blockblastBestTimes) {
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes
      );
    }
    // Save snake data if existed
    if (FileService.data.snakeScores)
      FileService.save("snakeScores", FileService.data.snakeScores);
    if (FileService.data.snakeBestTimes)
      FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);

    console.log({
      level: "action",
      message: `Utilisateur supprimé: ${pseudo}`,
    });

    res.json({ message: `Utilisateur ${pseudo} supprimé avec succès` });
  });

  // Remettre à 0 les entrées de leaderboard d'un utilisateur (sans supprimer le compte)
  router.post("/clear-from-leaderboard", requireAdmin, (req, res) => {
    const { pseudo, boardType, resetTimes } = req.body || {};
    const reset = !!resetTimes;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    // Normaliser la cible
    const type = String(boardType || "all").toLowerCase();

    // Fonctions utilitaires
    const removed = [];

    const clearClicker = () => {
      if (FileService.data.clicks && pseudo in FileService.data.clicks) {
        delete FileService.data.clicks[pseudo];
        FileService.save("clicks", FileService.data.clicks);
        removed.push("clicker");
      }
      if (!FileService.data.medals) FileService.data.medals = {};
      if (pseudo in FileService.data.medals) {
        FileService.data.medals[pseudo] = [];
        FileService.save("medals", FileService.data.medals);
      }
      // Forcer le client à nettoyer son localStorage autoCPS
      if (io) {
        io.sockets.sockets.forEach((socket) => {
          const user = socket.handshake.session?.user;
          if (user && user.pseudo === pseudo) {
            socket.emit("clicker:forceReset");
          }
        });
      }
    };

    const clearSimple = (key, label) => {
      if (FileService.data[key] && pseudo in FileService.data[key]) {
        delete FileService.data[key][pseudo];
        FileService.save(key, FileService.data[key]);
        removed.push(label);
      }
    };

    const clearBlockblast = () => {
      clearSimple("blockblastScores", "blockblast");
      if (reset) {
        if (
          FileService.data.blockblastBestTimes &&
          pseudo in FileService.data.blockblastBestTimes
        ) {
          delete FileService.data.blockblastBestTimes[pseudo];
          FileService.save(
            "blockblastBestTimes",
            FileService.data.blockblastBestTimes
          );
        }
        if (
          FileService.data.blockblastSaves &&
          pseudo in FileService.data.blockblastSaves
        ) {
          delete FileService.data.blockblastSaves[pseudo];
          FileService.save("blockblastSaves", FileService.data.blockblastSaves);
        }
      }
    };

    const clearSnake = () => {
      clearSimple("snakeScores", "snake");
      if (reset) {
        if (
          FileService.data.snakeBestTimes &&
          pseudo in FileService.data.snakeBestTimes
        ) {
          delete FileService.data.snakeBestTimes[pseudo];
          FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
        }
      }
    };

    const clearMotus = () => {
      clearSimple("motusScores", "motus");
      // On pourrait aussi reset le state, mais c'est pas un leaderboard
    };

    try {
      switch (type) {
        case "clicker":
          clearClicker();
          break;
        case "dino":
          clearSimple("dinoScores", "dino");
          break;
        case "flappy":
          clearSimple("flappyScores", "flappy");
          break;
        case "uno":
          clearSimple("unoWins", "uno");
          break;
        case "p4":
          clearSimple("p4Wins", "p4");
          break;
        case "blockblast":
          clearBlockblast();
          break;
        case "snake":
          clearSnake();
          break;
        case "motus":
          clearMotus();
          break;
        case "mash":
          clearSimple("mashWins", "mash");
          break;
        case "2048":
          clearSimple("scores2048", "2048");
          break;
        case "all":
        default:
          clearClicker();
          clearSimple("dinoScores", "dino");
          clearSimple("flappyScores", "flappy");
          clearSimple("unoWins", "uno");
          clearSimple("p4Wins", "p4");
          clearSimple("mashWins", "mash");
          clearSimple("scores2048", "2048");
          clearBlockblast();
          clearSnake();
          clearMotus();
          break;
      }

      if (removed.length === 0) {
        return res.json({
          message: `Aucune entrée de leaderboard trouvée pour ${pseudo}`,
        });
      }

      console.log({
        level: "action",
        message: `Leaderboards nettoyés (${removed.join(", ")}) pour ${pseudo}`,
      });
      return res.json({
        message: `Entrées supprimées des leaderboards (${removed.join(
          ", "
        )}) pour ${pseudo}`,
      });
    } catch (e) {
      console.error("[ADMIN] clear-from-leaderboard error", e);
      return res
        .status(500)
        .json({ message: "Erreur serveur lors du nettoyage" });
    }
  });

  // Réinitialiser un leaderboard entier (SAUF CLICKS)
  router.post("/reset-leaderboard", requireAdmin, (req, res) => {
    const { boardType } = req.body;

    if (!boardType) {
      return res.status(400).json({ message: "Type de leaderboard manquant" });
    }

    if (boardType === "clicks") {
      return res
        .status(403)
        .json({ message: "Impossible de reset les clicks globalement" });
    }

    // Helper pour backup
    const createBackup = () => {
      const backupDir = path.join(__dirname, "..", "data", "stat_backup");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const currentBackupPath = path.join(backupDir, timestamp);
      fs.mkdirSync(currentBackupPath, { recursive: true });

      const filesToBackup = [
        "dino_scores.json",
        "flappy_scores.json",
        "uno_wins.json",
        "p4_wins.json",
        "blockblast_scores.json",
        "blockblast_best_times.json",
        "blockblast_saves.json",
        "snake_scores.json",
        "snake_best_times.json",
        "motus_scores.json",
        "2048_scores.json",
        "mash_wins.json",
      ];

      filesToBackup.forEach((file) => {
        const src = path.join(__dirname, "..", "data", file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(currentBackupPath, file));
        }
      });

      return timestamp;
    };

    try {
      let message = "";

      if (boardType === "all") {
        const backupId = createBackup();

        // Reset ALL except clicks
        FileService.data.dinoScores = {};
        FileService.save("dinoScores", {});

        FileService.data.flappyScores = {};
        FileService.save("flappyScores", {});

        FileService.data.unoWins = {};
        FileService.save("unoWins", {});

        FileService.data.p4Wins = {};
        FileService.save("p4Wins", {});

        FileService.data.blockblastScores = {};
        FileService.save("blockblastScores", {});
        FileService.data.blockblastBestTimes = {};
        FileService.save("blockblastBestTimes", {});
        FileService.data.blockblastSaves = {};
        FileService.save("blockblastSaves", {});

        FileService.data.snakeScores = {};
        FileService.save("snakeScores", {});
        FileService.data.snakeBestTimes = {};
        FileService.save("snakeBestTimes", {});

        FileService.data.motusScores = {};
        FileService.save("motusScores", {});

        FileService.data.scores2048 = {};
        FileService.save("scores2048", {});

        FileService.data.mashWins = {};
        FileService.save("mashWins", {});

        // Refresh all leaderboards
        refreshLeaderboard("dinoScores");
        refreshLeaderboard("flappyScores");
        refreshLeaderboard("unoWins");
        refreshLeaderboard("p4Wins");
        refreshLeaderboard("blockblastScores");
        refreshLeaderboard("snakeScores");
        refreshLeaderboard("motusScores");
        refreshLeaderboard("scores2048");
        refreshLeaderboard("mashWins");

        message = `Tous les leaderboards (sauf clicks) ont été réinitialisés. Backup créé : ${backupId}`;
      } else {
        return res.status(400).json({
          message:
            "Seul le reset global ('all') est supporté avec backup automatique pour le moment.",
        });
      }

      console.log({
        level: "action",
        message: `[ADMIN] Reset global des leaderboards avec backup.`,
      });

      return res.json({ message });
    } catch (e) {
      console.error("[ADMIN] reset-leaderboard error", e);
      return res.status(500).json({ message: "Erreur serveur lors du reset" });
    }
  });

  // Créer un backup manuel (incluant clicks)
  router.post("/backups/create", requireAdmin, (req, res) => {
    try {
      const backupDir = path.join(__dirname, "..", "data", "stat_backup");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const currentBackupPath = path.join(backupDir, timestamp);
      fs.mkdirSync(currentBackupPath, { recursive: true });

      const filesToBackup = [
        "clicks.json", // Inclus explicitement pour le backup manuel
        "dino_scores.json",
        "flappy_scores.json",
        "uno_wins.json",
        "p4_wins.json",
        "blockblast_scores.json",
        "blockblast_best_times.json",
        "blockblast_saves.json",
        "snake_scores.json",
        "snake_best_times.json",
        "motus_scores.json",
        "2048_scores.json",
        "mash_wins.json",
      ];

      filesToBackup.forEach((file) => {
        const src = path.join(__dirname, "..", "data", file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(currentBackupPath, file));
        }
      });

      console.log({
        level: "action",
        message: `[ADMIN] Backup manuel créé : ${timestamp}`,
      });

      res.json({ message: "Backup créé avec succès", backupId: timestamp });
    } catch (e) {
      console.error("[ADMIN] create backup error", e);
      res.status(500).json({ message: "Erreur lors de la création du backup" });
    }
  });

  // Lister les backups
  router.get("/backups/list", requireAdmin, (req, res) => {
    const backupDir = path.join(__dirname, "..", "data", "stat_backup");
    if (!fs.existsSync(backupDir)) return res.json([]);

    try {
      const backups = fs
        .readdirSync(backupDir)
        .filter((file) => {
          return fs.statSync(path.join(backupDir, file)).isDirectory();
        })
        .sort()
        .reverse(); // Newest first
      res.json(backups);
    } catch (e) {
      res.status(500).json({ message: "Erreur lecture backups" });
    }
  });

  // Restaurer un backup
  router.post("/backups/restore", requireAdmin, (req, res) => {
    const { backupId } = req.body;
    if (!backupId)
      return res.status(400).json({ message: "ID de backup manquant" });

    const backupPath = path.join(
      __dirname,
      "..",
      "data",
      "stat_backup",
      backupId
    );
    if (!fs.existsSync(backupPath))
      return res.status(404).json({ message: "Backup introuvable" });

    try {
      const filesToRestore = [
        "dino_scores.json",
        "flappy_scores.json",
        "uno_wins.json",
        "p4_wins.json",
        "blockblast_scores.json",
        "blockblast_best_times.json",
        "blockblast_saves.json",
        "snake_scores.json",
        "snake_best_times.json",
        "motus_scores.json",
        "2048_scores.json",
      ];

      filesToRestore.forEach((file) => {
        const src = path.join(backupPath, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(__dirname, "..", "data", file));
        }
      });

      // Reload data in memory
      FileService.data = FileService.loadAll();

      // Refresh all leaderboards
      refreshLeaderboard("dinoScores");
      refreshLeaderboard("flappyScores");
      refreshLeaderboard("unoWins");
      refreshLeaderboard("p4Wins");
      refreshLeaderboard("blockblastScores");
      refreshLeaderboard("snakeScores");
      refreshLeaderboard("motusScores");
      refreshLeaderboard("scores2048");

      console.log({
        level: "action",
        message: `[ADMIN] Restauration du backup : ${backupId}`,
      });

      res.json({ message: `Backup ${backupId} restauré avec succès` });
    } catch (e) {
      console.error("[ADMIN] restore error", e);
      res.status(500).json({ message: "Erreur lors de la restauration" });
    }
  });

  // Route pour éteindre le serveur
  router.post("/shutdown", requireAdmin, (req, res) => {
    io.emit("system:redirect", "/ferme.html");
    console.log({
      level: "warn",
      message: "Arrêt du serveur demandé par l'admin...",
    });

    // On renvoie d'abord la redirection pour que le client puisse naviguer
    res.json({ redirect: "/ferme.html" });

    // On attend un peu que la réponse parte avant de tuer le processus
    setTimeout(() => {
      if (process.platform === "win32") {
        exec("taskkill /IM node.exe /F /T");
      } else {
        exec("pkill node");
      }
      // Fallback si les commandes échouent
      setTimeout(() => process.exit(0), 500);
    }, 1000);
  });

  // Définir un tag pour un utilisateur
  router.post("/set-tag", requireAdmin, (req, res) => {
    const { pseudo, tag, color } = req.body;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (!FileService.data.tags) FileService.data.tags = {};

    if (!tag || tag.trim() === "") {
      // Si tag vide, on le supprime
      if (FileService.data.tags[pseudo]) {
        delete FileService.data.tags[pseudo];
        FileService.save("tags", FileService.data.tags);
        return res.json({ message: `Tag supprimé pour ${pseudo}` });
      }
      return res.json({ message: `Aucun tag à supprimer pour ${pseudo}` });
    }

    FileService.data.tags[pseudo] = { text: tag.trim(), color: color || null };
    FileService.save("tags", FileService.data.tags);

    console.log({
      level: "action",
      message: `Tag défini pour ${pseudo} : [${tag}] (couleur : ${color})`,
    });

    res.json({ message: `Tag [${tag}] défini pour ${pseudo}` });
  });

  // Supprimer un tag
  router.post("/remove-tag", requireAdmin, (req, res) => {
    const { pseudo } = req.body;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (FileService.data.tags && FileService.data.tags[pseudo]) {
      delete FileService.data.tags[pseudo];
      FileService.save("tags", FileService.data.tags);

      console.log({
        level: "action",
        message: `Tag supprimé pour ${pseudo}`,
      });

      return res.json({ message: `Tag supprimé pour ${pseudo}` });
    }

    res.status(404).json({ message: "Aucun tag trouvé pour cet utilisateur" });
  });

  // --- Gestion des demandes de Tag ---
  const REQUESTS_FILE = path.join(__dirname, "..", "data", "tag_requests.json");

  function getTagRequests() {
    if (!fs.existsSync(REQUESTS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
    } catch (e) {
      return [];
    }
  }

  function saveTagRequests(reqs) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(reqs, null, 2));
  }

  router.get("/tag/list", (req, res) => {
    const requests = getTagRequests();
    const pending = requests.filter((r) => !r.fulfilled);
    res.json(pending);
  });

  router.post("/tag/respond", (req, res) => {
    const { requestId, action } = req.body; // action: 'accept' or 'reject'

    const requests = getTagRequests();
    const reqIndex = requests.findIndex((r) => r.id === requestId);

    if (reqIndex === -1)
      return res.status(404).json({ message: "Demande introuvable" });

    const request = requests[reqIndex];
    if (request.fulfilled)
      return res.status(400).json({ message: "Déjà traitée" });

    request.fulfilled = true;
    request.status = action === "accept" ? "accepted" : "rejected";

    if (action === "accept") {
      // Update user tag
      const db = dbUsers.readAll();
      const userIndex = db.users.findIndex((u) => u.pseudo === request.pseudo);

      const tagObject = {
        text: request.tag,
        colors:
          request.colors ||
          Array(request.tag.split(/\s+/).length).fill("#ffffff"),
        color: request.colors ? request.colors[0] : "#ffffff", // Fallback/Primary color
      };

      if (userIndex !== -1) {
        db.users[userIndex].tag = tagObject;
        dbUsers.writeAll(db);
      }

      // Update user tag in FileService (for chat)
      if (!FileService.data.tags) FileService.data.tags = {};
      FileService.data.tags[request.pseudo] = tagObject;
      FileService.save("tags", FileService.data.tags);
    }

    saveTagRequests(requests);

    // Notify user via socket
    const sockets = io.sockets.sockets;
    for (const [id, socket] of sockets) {
      if (
        socket.handshake.query &&
        socket.handshake.query.username === request.pseudo
      ) {
        socket.emit("tag:response", {
          accepted: action === "accept",
          tag: request.tag,
        });
      }
    }

    res.json({ success: true });
  });

  // --- Admin Panel Lock/Unlock ---
  router.get("/panel/state", (req, res) => {
    // Default to false (visible) if not set
    const hidden = !!req.session.adminPanelHidden;
    res.json({ hidden });
  });

  router.post("/panel/lock", (req, res) => {
    req.session.adminPanelHidden = true;
    req.session.save();
    res.json({ success: true });
  });

  router.post("/panel/unlock", async (req, res) => {
    const { password } = req.body;
    if (!password)
      return res
        .status(400)
        .json({ success: false, message: "Mot de passe requis" });

    if (!req.session.user || !req.session.user.pseudo) {
      return res.status(401).json({ success: false, message: "Non connecté" });
    }

    try {
      const user = dbUsers.findBypseudo(req.session.user.pseudo);
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "Utilisateur introuvable" });

      // Check password
      // Note: dbUsers stores 'passwordHashé' or 'passHash' depending on version/creation
      const hash = user.passwordHashé || user.passHash;
      if (!hash)
        return res
          .status(500)
          .json({ success: false, message: "Erreur données utilisateur" });

      const match = await bcrypt.compare(password, hash);
      if (!match)
        return res
          .status(401)
          .json({ success: false, message: "Mot de passe incorrect" });

      req.session.adminPanelHidden = false;
      req.session.save();
      res.json({ success: true });
    } catch (e) {
      console.error("Unlock error:", e);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  });

  // --- Password Requests ---
  router.get("/password-requests", requireAdmin, (req, res) => {
    const reqFile = path.join(__dirname, "../data/password_requests.json");
    try {
      if (fs.existsSync(reqFile)) {
        const data = JSON.parse(fs.readFileSync(reqFile, "utf-8"));
        res.json(data.requests || []);
      } else {
        res.json([]);
      }
    } catch (e) {
      res.status(500).json({ message: "Erreur lecture demandes" });
    }
  });

  router.post("/approve-password-change", requireAdmin, async (req, res) => {
    const { requestId, approve } = req.body;
    const reqFile = path.join(__dirname, "../data/password_requests.json");

    try {
      if (!fs.existsSync(reqFile))
        return res.status(404).json({ message: "Fichier non trouvé" });
      const data = JSON.parse(fs.readFileSync(reqFile, "utf-8"));
      const requestIndex = data.requests.findIndex((r) => r.id === requestId);

      if (requestIndex === -1)
        return res.status(404).json({ message: "Demande introuvable" });

      const request = data.requests[requestIndex];

      if (approve) {
        // Mettre à jour le mot de passe
        const users = dbUsers.readAll();
        const user = users.users.find((u) => u.pseudo === request.pseudo);

        if (user) {
          const passHash = await bcrypt.hash(request.newPassword, 12);
          user.password = request.newPassword;
          user.passwordHashé = passHash;
          dbUsers.writeAll(users);

          request.status = "approved";
          console.log(
            `[ADMIN] Changement de mot de passe approuvé pour ${request.pseudo}`
          );
        } else {
          request.status = "failed_user_not_found";
        }
      } else {
        request.status = "rejected";
        console.log(
          `[ADMIN] Changement de mot de passe rejeté pour ${request.pseudo}`
        );
      }

      data.requests.splice(requestIndex, 1); // remove from pending or keep log? User didn't specify. I'll remove done requests to keep it clean.
      fs.writeFileSync(reqFile, JSON.stringify(data, null, 2));

      res.json({ success: true, status: request.status });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Modify/Add score manually
  router.post("/set-score", requireAdmin, (req, res) => {
    const { pseudo, boardType, value } = req.body;
    if (!pseudo || !boardType)
      return res.status(400).json({ message: "Paramètres manquants" });

    const type = String(boardType).toLowerCase();

    try {
      let msg = "";
      let val = Number(value);

      if (type === "mash") {
        if (!FileService.data.mashWins) FileService.data.mashWins = {};
        FileService.data.mashWins[pseudo] = val;
        FileService.save("mashWins", FileService.data.mashWins);
        refreshLeaderboard("mashWins");
        msg = `Score Mash de ${pseudo} défini à ${val}`;
      } else {
        // Fallback for others if needed manually (not explicitly requested but good for "modif")
        // For now restrict to mash as per context of "new game"
        return res
          .status(400)
          .json({ message: "Type non supporté par /set-score pour l'instant" });
      }

      res.json({ message: msg });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  return router;
}

module.exports = createAdminRouter;
