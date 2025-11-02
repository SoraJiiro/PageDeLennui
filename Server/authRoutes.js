const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const router = express.Router();
const usersFile = path.join(__dirname, "../data/users.json");

function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

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

  if (users.find((u) => u.pseudo === pseudo)) {
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
    pseudo: pseudo,
    password: password,
    passwordHashé: passHash,
    creeDepuis: ip,
    creeAt: new Date().toISOString(),
  };

  users.push(newUser);
  setUtilisateur(users);

  req.session.user = { id: newUser.id, pseudo: newUser.pseudo };
  res.json({ message: "Compte créé avec succès.", pseudo: newUser.pseudo });
  console.log(`Compte créé ${newUser.pseudo} (${ip}) à [${newUser.creeAt}]`);
});

router.post("/login", async (req, res) => {
  const { pseudo, password } = req.body;
  if (!pseudo || !password)
    return res.status(400).json({ message: "Champs manquants." });

  const users = readUsers();

  const user = users.find(
    (u) => u.pseudo.toLowerCase() === pseudo.toLowerCase()
  );

  if (!user) {
    return res.status(404).json({ message: "Utilisateur introuvable." });
  }

  var match = await bcrypt.compare(password, user.passwordHashé);
  if (!match) {
    return res.status(401).json({ message: "Mot de passe incorrect." });
  }

  req.session.user = { id: user.id, pseudo: user.pseudo };
  res.json({ message: "Connexion réussie.", pseudo: user.pseudo });
});

router.get("/session", (req, res) => {
  if (req.session && req.session.user && req.session.user.pseudo) {
    res.json({ pseudo: req.session.user.pseudo });
  } else {
    res.status(401).json({ error: "Non connecté" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Déconnecté." });
  });
});

module.exports = router;
