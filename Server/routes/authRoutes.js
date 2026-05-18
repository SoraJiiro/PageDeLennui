const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const config = require("../config");
const { FileService } = require("../util");
const { requireAuth } = require("../middlewareGetter");

const router = express.Router();
const usersFile = path.join(__dirname, "..", "..", "data", "users.json");

function uuidv4() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString("hex");
  return (
    hex.substring(0, 8) +
    "-" +
    hex.substring(8, 12) +
    "-" +
    hex.substring(12, 16) +
    "-" +
    hex.substring(16, 20) +
    "-" +
    hex.substring(20)
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

function getUserPasswordHash(user) {
  if (!user || typeof user !== "object") return "";
  return user.passwordHashé || user.passHash || "";
}

function updateUserRecord(users, user, changes) {
  if (!Array.isArray(users) || !user || !changes) return false;
  let index = users.findIndex((u) => u && u.id && u.id === user.id);
  if (index === -1) {
    const key = String(user.pseudo || "").toLowerCase();
    index = users.findIndex(
      (u) => u && String(u.pseudo || "").toLowerCase() === key,
    );
  }
  if (index === -1) return false;
  users[index] = { ...users[index], ...changes };
  setUtilisateur(users);
  return true;
}

async function verifyPasswordAndMigrate(users, user, password) {
  const hash = getUserPasswordHash(user);
  if (hash) {
    return bcrypt.compare(password, hash);
  }
  const plain = typeof user.password === "string" ? user.password : "";
  if (!plain || plain !== password) return false;

  try {
    const nextHash = await bcrypt.hash(password, 12);
    updateUserRecord(users, user, {
      passwordHashé: nextHash,
      password: undefined,
    });
  } catch (e) {
    // best effort migration
  }

  return true;
}

function normalizePseudoValue(pseudo) {
  const p = String(pseudo || "").trim();
  return p ? p.toLowerCase() : "";
}

function isPseudoBlacklisted(pseudo) {
  const key = normalizePseudoValue(pseudo);
  if (!key) return false;
  const list = Array.isArray(config.BLACKLIST_PSEUDOS)
    ? config.BLACKLIST_PSEUDOS
    : [];
  return list.some((p) => normalizePseudoValue(p) === key);
}

function verifNombreCompte(ip) {
  const users = readUsers();
  return users.filter((u) => u.creeDepuis === ip).length;
}

function extractClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const firstForwarded = forwarded.split(",")[0].trim();
  return String(firstForwarded || req.socket.remoteAddress || "")
    .replace("::ffff:", "")
    .trim();
}

function isUnlimitedRegistrationIp(ip) {
  const normalizedIp = String(ip || "").trim();
  const normalizedHost = String(config.HOST || "").trim();
  const unlimitedIps = new Set([
    "127.0.0.1",
    "::1",
    "localhost",
    "192.168.197.32",
  ]);

  if (
    normalizedHost &&
    normalizedHost !== "0.0.0.0" &&
    normalizedHost !== "::"
  ) {
    unlimitedIps.add(normalizedHost);
  }

  return unlimitedIps.has(normalizedIp);
}

router.post("/register", async (req, res) => {
  const rawPseudo = req.body ? req.body.pseudo : "";
  const rawPassword = req.body ? req.body.password : "";
  const pseudo = String(rawPseudo || "").trim();
  const password = String(rawPassword || "").trim();
  const ip = extractClientIp(req);

  if (!pseudo || !password)
    return res.status(400).json({ message: "Champs manquants." });

  if (isPseudoBlacklisted(pseudo)) {
    return res.status(403).json({ message: "Pseudo banni." });
  }

  const users = readUsers();

  if (pseudo.toLowerCase() === "admin") {
    return res
      .status(400)
      .json({ message: "Ce pseudo est réservé. (bien tenté, idiot)" });
  }

  const pseudoKey = pseudo.toLowerCase();
  if (
    users.find(
      (u) => String(u && u.pseudo ? u.pseudo : "").toLowerCase() === pseudoKey,
    )
  ) {
    return res.status(400).json({ message: "Nom d'utilisateur déjà pris." });
  }

  if (verifNombreCompte(ip) >= 2 && !isUnlimitedRegistrationIp(ip)) {
    return res.status(403).json({
      message: "Tu as déjà créé 2 comptes depuis cette IP.",
    });
  }

  const passHash = await bcrypt.hash(password, 12);
  const newUser = {
    id: uuidv4(),
    pseudo: pseudo,
    passwordHashé: passHash,
    creeDepuis: ip,
    creeAt: new Date().toISOString(),
  };

  users.push(newUser);
  setUtilisateur(users);

  console.log({
    level: "action",
    message: `Compte créé: ${newUser.pseudo} (IP: ${ip})`,
  });

  req.session.user = { id: newUser.id, pseudo: newUser.pseudo };
  req.session.save((err) => {
    if (err) return res.status(500).json({ message: "Erreur de session." });
    res.json({ message: "Compte créé avec succès.", pseudo: newUser.pseudo });
  });
  console.log(`Compte créé ${newUser.pseudo} (${ip}) à [${newUser.creeAt}]`);
});

router.get("/users/list", requireAuth, (req, res) => {
  const users = readUsers();
  const safeList = users.map((u) => ({ pseudo: u.pseudo }));
  res.json(safeList);
});

router.post("/login", async (req, res) => {
  const rawPseudo = req.body ? req.body.pseudo : "";
  const rawPassword = req.body ? req.body.password : "";
  const pseudo = String(rawPseudo || "").trim();
  const password = String(rawPassword || "").trim();
  const ip = extractClientIp(req);

  if (!pseudo || !password)
    return res.status(400).json({ message: "Champs manquants." });

  if (isPseudoBlacklisted(pseudo)) {
    return res.status(403).json({ message: "Compte banni." });
  }

  const users = readUsers();

  const user = users.find(
    (u) => u.pseudo.toLowerCase() === pseudo.toLowerCase(),
  );

  if (!user) {
    return res.status(401).json({ message: "Identifiants invalides." });
  }

  const match = await verifyPasswordAndMigrate(users, user, password);
  if (!match) {
    console.log(
      `[ECHEC_CONNEXION] Tentative de connexion échouée pour ${pseudo} depuis ${ip}`,
    );
    return res.status(401).json({ message: "Identifiants invalides." });
  }

  if (user.password) {
    updateUserRecord(users, user, { password: undefined });
  }

  req.session.user = { id: user.id, pseudo: user.pseudo };

  console.log(
    `[CONNEXION] L'utilisateur ${user.pseudo} s'est connecté depuis l'IP : ${ip}`,
  );
  FileService.appendLog({
    type: "LOGIN",
    pseudo: user.pseudo,
    ip: ip,
    date: new Date().toISOString(),
  });

  req.session.save((err) => {
    if (err) return res.status(500).json({ message: "Erreur de session." });
    res.json({ message: "Connexion réussie.", pseudo: user.pseudo });
  });
});

router.get("/session", (req, res) => {
  if (req.session && req.session.user && req.session.user.pseudo) {
    const users = readUsers();
    const user = users.find(
      (u) => u.pseudo.toLowerCase() === req.session.user.pseudo.toLowerCase(),
    );
    res.json({
      pseudo: req.session.user.pseudo,
      rulesAccepted: user ? !!user.rulesAccepted : false,
    });
  } else {
    res.status(401).json({ error: "Non connecté" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Déconnecté." });
  });
});

router.post("/verify-password", async (req, res) => {
  const { password } = req.body;

  if (!req.session || !req.session.user || !req.session.user.pseudo) {
    return res.status(401).json({ success: false, message: "Non connecté" });
  }

  if (!password) {
    return res
      .status(400)
      .json({ success: false, message: "Mot de passe manquant" });
  }

  const users = readUsers();
  const user = users.find(
    (u) => u.pseudo.toLowerCase() === req.session.user.pseudo.toLowerCase(),
  );

  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "Utilisateur introuvable" });
  }

  const match = await verifyPasswordAndMigrate(users, user, password);
  res.json({ success: !!match });
});

router.post("/request-password-change", requireAuth, async (req, res) => {
  const pseudo = req.session?.user?.pseudo;
  const rawPassword = req.body ? req.body.newPassword : "";
  const newPassword = String(rawPassword || "").trim();
  const ip = extractClientIp(req);

  if (!pseudo || !newPassword) {
    return res.status(400).json({ message: "Champs manquants." });
  }

  const reqFile = path.join(
    __dirname,
    "..",
    "..",
    "data",
    "password_requests.json",
  );
  let requests = [];
  try {
    if (fs.existsSync(reqFile)) {
      requests = JSON.parse(fs.readFileSync(reqFile, "utf-8")).requests || [];
    }
  } catch (e) {
    requests = [];
  }

  // Vérifier si une demande existe déjà
  const existing = requests.find(
    (r) => r.pseudo === pseudo && r.status === "pending",
  );
  if (existing) {
    return res.status(400).json({ message: "Une demande est déjà en cours." });
  }

  let newPasswordHash = "";
  try {
    newPasswordHash = await bcrypt.hash(newPassword, 12);
  } catch (e) {
    return res.status(500).json({ message: "Erreur de hash." });
  }

  const newReq = {
    id: Date.now().toString(36),
    pseudo,
    ip,
    newPasswordHash,
    status: "pending",
    date: new Date().toISOString(),
  };

  requests.push(newReq);
  fs.writeFileSync(reqFile, JSON.stringify({ requests }, null, 2), "utf-8");

  console.log(`[DEMANDE_MDP] Demande de ${pseudo} (${ip})`);
  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (io) {
    io.to("admins").emit("admin:data:refresh", { type: "password-requests" });
  }
  res.json({ message: "Demande envoyée à l'administrateur." });
});

module.exports = router;
