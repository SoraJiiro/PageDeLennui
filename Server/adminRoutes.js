const express = require("express");
const router = express.Router();
const { FileService } = require("./util");

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
    unoWins: FileService.data.unoWins[pseudo] || 0,
    pictionaryPoints: FileService.data.pictionaryWins[pseudo] || 0,
    p4Wins: FileService.data.p4Wins[pseudo] || 0,
    blockblastScore: FileService.data.blockblastScores[pseudo] || 0,
    medals: FileService.data.medals[pseudo] || [],
  };

  res.json(data);
});

// Modifier une statistique
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
  ];

  if (!validStats.includes(statType)) {
    return res.status(400).json({ message: "Type de statistique invalide" });
  }

  FileService.data[statType][pseudo] = value;
  FileService.save(statType, FileService.data[statType]);

  console.log(`[ADMIN] Modification: ${pseudo} - ${statType} = ${value}`);

  res.json({
    message: `Statistique ${statType} de ${pseudo} mise à jour à ${value}`,
  });
});

// Supprimer un utilisateur
router.post("/delete-user", requireAdmin, (req, res) => {
  const { pseudo } = req.body;

  if (!pseudo) {
    return res.status(400).json({ message: "Pseudo manquant" });
  }

  if (pseudo === "Admin") {
    return res.status(403).json({ message: "Impossible de supprimer l'Admin" });
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

  console.log(`[ADMIN] Utilisateur supprimé: ${pseudo}`);

  res.json({ message: `Utilisateur ${pseudo} supprimé avec succès` });
});

module.exports = router;
