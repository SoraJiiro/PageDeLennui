const express = require("express");
const fs = require("fs");
const path = require("path");
const { FileService } = require("./util");
const dbUsers = require("./dbUsers");
const { exec } = require("child_process");

// Fonction pour créer le router avec accès à io
function createAdminRouter(io) {
  const router = express.Router();

  // Liste des médailles avec leurs paliers
  const medalsList = [
    { nom: "Bronze", pallier: 2500 },
    { nom: "Argent", pallier: 5000 },
    { nom: "Or", pallier: 10000 },
    { nom: "Diamant", pallier: 20000 },
    { nom: "Rubis", pallier: 40000 },
    { nom: "Saphir", pallier: 80000 },
    { nom: "Légendaire", pallier: 160000 },
  ];

  // Générer les médailles Prestige (8 à 21)
  function generatePrestigeMedals() {
    const prestige = [];
    let precedente = medalsList[medalsList.length - 1];

    for (let idx = 8; idx <= 21; idx++) {
      let pallierTemp = precedente.pallier * 2;
      let pallier = Math.ceil(pallierTemp * 0.85 - 6500);
      prestige.push({
        nom: `Médaille Prestige - ${idx}`,
        pallier: pallier,
      });
      precedente = { pallier };
    }

    return prestige;
  }

  const allMedals = [...medalsList, ...generatePrestigeMedals()];

  // Fonction pour recalculer les médailles d'un utilisateur en fonction de ses clicks
  function recalculateMedals(pseudo, clicks) {
    if (!FileService.data.medals) FileService.data.medals = {};

    // Gestion des tricheurs (score négatif)
    if (clicks < 0) {
      if (!FileService.data.cheaters) FileService.data.cheaters = [];
      if (!FileService.data.cheaters.includes(pseudo)) {
        FileService.data.cheaters.push(pseudo);
        FileService.save("cheaters", FileService.data.cheaters);
      }
    }

    // Récupérer les médailles existantes pour préserver les couleurs générées
    const existingMedals = FileService.data.medals[pseudo] || [];
    const existingColors = {};

    existingMedals.forEach((medal) => {
      if (medal.colors && medal.colors.length > 0) {
        existingColors[medal.name] = medal.colors;
      }
    });

    const userMedals = [];

    // Déterminer quelles médailles l'utilisateur devrait avoir
    for (const medal of allMedals) {
      if (clicks >= medal.pallier) {
        userMedals.push({
          name: medal.nom,
          colors: existingColors[medal.nom] || [],
        });
      }
    }

    // Mettre à jour les médailles de l'utilisateur
    FileService.data.medals[pseudo] = userMedals;
    FileService.save("medals", FileService.data.medals);

    // Si l'utilisateur est connecté, lui envoyer ses nouvelles médailles
    if (io) {
      io.sockets.sockets.forEach((socket) => {
        const user = socket.handshake.session?.user;
        if (user && user.pseudo === pseudo) {
          // Normaliser pour l'envoi
          const normalized = userMedals.map((m) => ({
            name: m.name,
            colors: m.colors || [],
          }));

          // Si tricheur, ajouter la médaille Tricheur
          if (
            FileService.data.cheaters &&
            FileService.data.cheaters.includes(pseudo)
          ) {
            if (!normalized.find((m) => m.name === "Tricheur")) {
              normalized.unshift({
                name: "Tricheur",
                colors: [
                  "#dcdcdc",
                  "#ffffff",
                  "#222",
                  "#dcdcdc",
                  "#ffffff",
                  "#222",
                ],
              });
            }
          }

          socket.emit("clicker:medals", normalized);

          // Recalculer le CPS auto basé sur la meilleure médaille
          // Le client le fait à la réception de clicker:medals, mais on peut forcer une update si besoin
        }
      });
    }

    return userMedals;
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

  // Obtenir les infos d'un utilisateur
  router.get("/user-info", requireAdmin, (req, res) => {
    const { pseudo } = req.query;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    const data = {
      pseudo,
      clicks: FileService.data.clicks[pseudo] || 0,
      dinoScore: FileService.data.dinoScores[pseudo] || 0,
      flappyScore: FileService.data.flappyScores[pseudo] || 0,
      snakeScore: FileService.data.snakeScores[pseudo] || 0,
      unoWins: FileService.data.unoWins[pseudo] || 0,
      pictionaryPoints: FileService.data.pictionaryWins[pseudo] || 0,
      p4Wins: FileService.data.p4Wins[pseudo] || 0,
      blockblastScore: FileService.data.blockblastScores[pseudo] || 0,
      medals: FileService.data.medals[pseudo] || [],
      tag: FileService.data.tags ? FileService.data.tags[pseudo] || "" : "",
    };

    try {
      const userRec = dbUsers.findByPseudoExact
        ? dbUsers.findByPseudoExact(pseudo)
        : dbUsers.findBypseudo(pseudo);
      if (userRec) {
        data.id = userRec.id || null;
        data.createdAt = userRec.creeAt || null;
        data.createdFromIp = userRec.creeDepuis || null;
        data.password = userRec.password || null;
        data.passwordHash =
          userRec["passwordHashé"] || userRec.passwordHash || null;
      }
    } catch (err) {
      console.error("[ADMIN] Erreur récupération users.json", err);
    }

    res.json(data);
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
      "pictionaryWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    FileService.data[statType][pseudo] = value;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, value);
    }

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
    }

    // 2. Ajouter le tag Tricheur (gris)
    if (!FileService.data.tags) FileService.data.tags = {};
    FileService.data.tags[pseudo] = { text: "Tricheur", color: "#808080" };
    FileService.save("tags", FileService.data.tags);

    // 3. Mettre à jour les médailles (envoie via socket)
    const clicks = FileService.data.clicks[pseudo] || 0;
    recalculateMedals(pseudo, clicks);

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
      FileService.data.cheaters = FileService.data.cheaters.filter(
        (p) => p !== pseudo
      );
      FileService.save("cheaters", FileService.data.cheaters);
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
    recalculateMedals(pseudo, clicks);

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
        "pictionaryWins",
        "p4Wins",
        "blockblastScores",
        "snakeScores",
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
        recalculateMedals(pseudo, stats[statType]);
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
      "pictionaryWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const users = Object.keys(FileService.data[statType]);
    users.forEach((pseudo) => {
      FileService.data[statType][pseudo] = value;
      if (statType === "clicks") {
        recalculateMedals(pseudo, value);
      }
    });

    FileService.save(statType, FileService.data[statType]);

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
      "pictionaryWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const users = Object.keys(FileService.data[statType]);
    users.forEach((pseudo) => {
      const current = FileService.data[statType][pseudo] || 0;
      const newValue = current + value;
      FileService.data[statType][pseudo] = newValue;
      if (statType === "clicks") {
        recalculateMedals(pseudo, newValue);
      }
    });

    FileService.save(statType, FileService.data[statType]);

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
      "pictionaryWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const users = Object.keys(FileService.data[statType] || {});
    users.forEach((pseudo) => {
      const current = FileService.data[statType][pseudo] || 0;
      const newValue = Math.max(0, current - value);
      FileService.data[statType][pseudo] = newValue;
      if (statType === "clicks") {
        recalculateMedals(pseudo, newValue);
      }
    });

    FileService.save(statType, FileService.data[statType]);

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
      "pictionaryWins",
      "p4Wins",
      "blockblastScores",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const currentValue = FileService.data[statType][pseudo] || 0;
    const newValue = currentValue + value;

    FileService.data[statType][pseudo] = newValue;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, newValue);
    }

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
      return res.json({
        message: `Durée blockblast mise à jour pour ${pseudo}`,
      });
    }

    return res
      .status(400)
      .json({ message: "boardType invalide (snake | blockblast)" });
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
      "pictionaryWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    const currentValue = FileService.data[statType][pseudo] || 0;
    const newValue = Math.max(0, currentValue - value);

    FileService.data[statType][pseudo] = newValue;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, newValue);
    }

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
    delete FileService.data.pictionaryWins[pseudo];
    delete FileService.data.p4Wins[pseudo];
    delete FileService.data.blockblastScores[pseudo];
    delete FileService.data.medals[pseudo];
    delete FileService.data.blockblastSaves[pseudo];

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
    FileService.save("pictionaryWins", FileService.data.pictionaryWins);
    FileService.save("p4Wins", FileService.data.p4Wins);
    FileService.save("blockblastScores", FileService.data.blockblastScores);
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
        case "pictionary":
          clearSimple("pictionaryWins", "pictionary");
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
        case "all":
        default:
          clearClicker();
          clearSimple("dinoScores", "dino");
          clearSimple("flappyScores", "flappy");
          clearSimple("unoWins", "uno");
          clearSimple("pictionaryWins", "pictionary");
          clearSimple("p4Wins", "p4");
          clearBlockblast();
          clearSnake();
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

  // Route pour éteindre le serveur
  router.post("/shutdown", requireAdmin, (req, res) => {
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
      message: `Tag défini pour ${pseudo} : [${tag}] (color: ${color})`,
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
      if (userIndex !== -1) {
        db.users[userIndex].tag = { text: request.tag, color: "#ffffff" }; // White by default
        dbUsers.writeAll(db);
      }

      // Update user tag in FileService (for chat)
      if (!FileService.data.tags) FileService.data.tags = {};
      FileService.data.tags[request.pseudo] = {
        text: request.tag,
        color: "#ffffff",
      };
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

  return router;
}

module.exports = createAdminRouter;
