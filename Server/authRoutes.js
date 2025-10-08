const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// ===============================
// Fichiers et outils
// ===============================
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

function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify({ users }, null, 2), "utf-8");
}

// ===============================
// 🔹 Limite 2 comptes par IP
// ===============================
function countByIp(ip) {
  const users = readUsers();
  return users.filter((u) => u.createdFromIp === ip).length;
}

// ===============================
// 🔹 POST /api/register
// ===============================
router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");

  if (!username || !password)
    return res.status(400).json({ message: "Champs manquants." });

  const users = readUsers();

  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ message: "Nom d'utilisateur déjà pris." });
  }

  if (countByIp(ip) >= 2) {
    return res.status(403).json({
      message: "Tu as déjà créé 2 comptes depuis cette IP.",
    });
  }

  const passHash = await bcrypt.hash(password, 12);
  const newUser = {
    id: uuidv4(),
    username,
    passHash,
    createdFromIp: ip,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeUsers(users);

  req.session.user = { id: newUser.id, username: newUser.username };
  res.json({ message: "Compte créé avec succès.", username });
});

// ===============================
// 🔹 POST /api/login
// ===============================
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Champs manquants." });

  const users = readUsers();
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );

  if (!user) {
    return res.status(404).json({ message: "Utilisateur introuvable." });
  }

  const match = await bcrypt.compare(password, user.passHash);
  if (!match) {
    return res.status(401).json({ message: "Mot de passe incorrect." });
  }

  req.session.user = { id: user.id, username: user.username };
  res.json({ message: "Connexion réussie.", username: user.username });
});

// ===============================
// 🔹 GET /api/session
// ===============================
router.get("/session", (req, res) => {
  if (req.session && req.session.user) {
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
