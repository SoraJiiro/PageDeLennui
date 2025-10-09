const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const usersFile = path.join(__dirname, "../data/users.json");

function readUsers() {
  try {
    if (!fs.existsSync(usersFile)) {
      fs.writeFileSync(usersFile, JSON.stringify({ users: [] }, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(usersFile, "utf-8"));
    return data.users || [];
  } catch (err) {
    console.error("❌ Erreur lecture users.json :", err);
    return [];
  }
}

function setUtilisateur(users) {
  fs.writeFileSync(usersFile, JSON.stringify({ users }, null, 2), "utf-8");
}

function verifNombreCompte(ip) {
  const users = readUsers();
  return users.filter((u) => u.creeDepuis === ip).length;
}

// ===============================
// 🔹 POST /api/register
// ===============================
router.post("/register", async (req, res) => {
  const { pseudo, password } = req.body;
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");

  if (!pseudo || !password)
    return res.status(400).json({ message: "Champs manquants." });

  const users = readUsers();

  // Vérifier par "username" pour cohérence
  if (users.find((u) => u.username === pseudo)) {
    return res.status(400).json({ message: "Nom d'utilisateur déjà pris." });
  }

  if (verifNombreCompte(ip) >= 2) {
    return res.status(403).json({
      message: "Tu as déjà créé 2 comptes depuis cette IP.",
    });
  }

  const passHash = await bcrypt.hash(password, 12);
  const newUser = {
    id: uuidv4(),
    username: pseudo, // ⚠️ Stocker comme "username"
    passHash,
    creeDepuis: ip,
    creeAt: new Date().toISOString(),
  };

  users.push(newUser);
  setUtilisateur(users);

  // ⚠️ CRITICAL: Session avec "username"
  req.session.user = { id: newUser.id, username: newUser.username };
  res.json({ message: "Compte créé avec succès.", username: newUser.username });
});

// ===============================
// 🔹 POST /api/login
// ===============================
router.post("/login", async (req, res) => {
  const { pseudo, password } = req.body;
  if (!pseudo || !password)
    return res.status(400).json({ message: "Champs manquants." });

  const users = readUsers();

  // Chercher par "username"
  const user = users.find(
    (u) => u.username && u.username.toLowerCase() === pseudo.toLowerCase()
  );

  if (!user) {
    return res.status(404).json({ message: "Utilisateur introuvable." });
  }

  const match = await bcrypt.compare(password, user.passHash);
  if (!match) {
    return res.status(401).json({ message: "Mot de passe incorrect." });
  }

  // ⚠️ CRITICAL: Session avec "username"
  req.session.user = { id: user.id, username: user.username };
  res.json({ message: "Connexion réussie.", username: user.username });
});

// ===============================
// 🔹 GET /api/session
// ===============================
router.get("/session", (req, res) => {
  if (req.session && req.session.user && req.session.user.username) {
    // ⚠️ CRITICAL: Renvoyer "username"
    res.json({ username: req.session.user.username });
  } else {
    res.status(401).json({ error: "Non connecté" });
  }
});

// ===============================
// 🔹 POST /api/logout
// ===============================
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Déconnecté." });
  });
});

module.exports = router;
