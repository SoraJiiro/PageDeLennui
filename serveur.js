// -----------------------------
// Init
// -----------------------------
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const session = require("express-session");
const sharedSession = require("express-socket.io-session");
const { Server } = require("socket.io");

// -----------------------------
// Import
// -----------------------------
const authRoutes = require("./Server/authRoutes");
const requireAuth = require("./Server/requireAuth");

// -----------------------------
// Config
// -----------------------------
const PORT = process.env.PORT || 7550;
const HOTE = "";
const SESSION_SECRET = process.env.CLE_SID;

const app = express();
const serveur = http.createServer(app);
const io = new Server(serveur);

// -----------------------------
// Middleware
// -----------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const expressSession = session({
  name: "sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

app.use(expressSession);
io.use(sharedSession(expressSession, { autoSave: true }));

// -----------------------------
// Blacklist
// -----------------------------
const blacklist = ["192.168.197.197", "192.168.197.1"];
app.use((req, res, next) => {
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");
  if (blacklist.includes(ip)) {
    console.log(`🚫 Accès refusé à ${ip} (HTTP blacklist)`);
    res
      .status(403)
      .send(
        `<html><body><h1>Accès refusé</h1><p>Votre IP (${ip}) n'est pas reconnue.</p></body></html>`
      );
    return;
  }
  next();
});

// -----------------------------
// Routing
// -----------------------------
const WEBROOT = path.join(__dirname, "Public");
app.use("/api", authRoutes);

app.get("/login", (req, res) => res.sendFile(path.join(WEBROOT, "login.html")));
app.get("/register", (req, res) =>
  res.sendFile(path.join(WEBROOT, "register.html"))
);

app.use(requireAuth);
app.use(express.static(WEBROOT));

// -----------------------------
// Gestion des fichiers JSON
// -----------------------------
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8").trim();
      if (!raw) throw new Error("empty");
      return JSON.parse(raw);
    }
  } catch {
    console.warn(`⚠️ Fichier corrompu ou vide : ${file}, régénéré.`);
  }
  fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  return fallback;
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

const files = {
  leaderboard: path.join(dataDir, "leaderboard.json"),
  historique: path.join(dataDir, "chat_history.json"),
  chatLogs: path.join(dataDir, "chat_logs.jsonl"),
  dinoScores: path.join(dataDir, "dino_scores.json"),
  medals: path.join(dataDir, "medals.json"),
};

let scores = readJSON(files.leaderboard, {});
let historique = readJSON(files.historique, []);
let dinoScores = readJSON(files.dinoScores, {});
let medals = readJSON(files.medals, {});

// -----------------------------
// Logique principale
// -----------------------------
let users = new Map(); // socket.id → { name }
let connectedUsers = new Set(); // usernames uniques connectés

function clickerLeaderboardClasse() {
  return Object.entries(scores)
    .map(([username, score]) => ({ username, score: Number(score) || 0 }))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
}
function broadcastClickerLeaderboard() {
  io.emit("clicker:leaderboard", clickerLeaderboardClasse());
}

// Anti-spam clicker
const clickWindowMs = 1200;
const clickMaxPerWindow = 25;
const clickBuckets = new Map();

function allowClick(socketId) {
  const now = Date.now();
  const bucket = clickBuckets.get(socketId) || { windowStart: now, count: 0 };
  if (now - bucket.windowStart >= clickWindowMs) {
    bucket.windowStart = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  clickBuckets.set(socketId, bucket);
  return bucket.count <= clickMaxPerWindow;
}

// -----------------------------
// SOCKET.IO : gestion des connexions
// -----------------------------
io.on("connection", (socket) => {
  const user = socket.handshake.session?.user;

  if (!user || !user.username) {
    console.log("❌ Connexion refusée : pas d'utilisateur en session");
    socket.disconnect(true);
    return;
  }

  const username = user.username;
  console.log(`✅ Connexion socket pour ${username} (${socket.id})`);

  // Supprimer anciennes connexions du même utilisateur
  for (const [id, data] of users.entries()) {
    if (data.name === username && id !== socket.id) {
      users.delete(id);
    }
  }

  users.set(socket.id, { name: username });
  connectedUsers.add(username);

  // Envoyer infos initiales
  socket.emit("you:name", username);
  socket.emit("chat:history", historique);
  socket.emit("clicker:you", { score: scores[username] || 0 });
  socket.emit("clicker:leaderboard", clickerLeaderboardClasse());
  socket.emit("clicker:medals", medals[username] || []);
  socket.emit(
    "dino:leaderboard",
    Object.entries(dinoScores).map(([u, s]) => ({ username: u, score: s }))
  );

  // Broadcast liste + info
  io.emit("users:list", Array.from(connectedUsers.values()));
  io.emit("system:info", `${username} a rejoint le chat`);

  // ===== Chat =====
  socket.on("chat:message", ({ text }) => {
    const msg = String(text || "").trim();
    if (!msg) return;
    const payload = { name: username, text: msg, at: new Date().toISOString() };
    historique.push(payload);
    if (historique.length > 200) historique = historique.slice(-200);
    writeJSON(files.historique, historique);
    fs.appendFileSync(files.chatLogs, JSON.stringify(payload) + "\n");
    io.emit("chat:message", payload);
  });

  // ===== Clicker =====
  socket.on("clicker:click", () => {
    if (!allowClick(socket.id)) return;
    scores[username] = (scores[username] || 0) + 1;
    writeJSON(files.leaderboard, scores);
    socket.emit("clicker:you", { score: scores[username] });
    broadcastClickerLeaderboard();
  });

  socket.on("clicker:reset", () => {
    scores[username] = 0;
    medals[username] = [];
    writeJSON(files.leaderboard, scores);
    writeJSON(files.medals, medals);
    socket.emit("clicker:you", { score: 0 });
    socket.emit("clicker:medals", []);
    broadcastClickerLeaderboard();
    console.log(`🔄 Reset complet pour ${username}`);
  });

  socket.on("clicker:medalUnlock", ({ medalName }) => {
    const validMedals = [
      "Bronze",
      "Argent",
      "Or",
      "Diamant",
      "Rubis",
      "Saphir",
      "Légendaire",
    ];
    if (!validMedals.includes(medalName)) return;
    const userMedals = medals[username] || [];
    if (!userMedals.includes(medalName)) {
      userMedals.push(medalName);
      medals[username] = userMedals;
      writeJSON(files.medals, medals);
      console.log(`🏅 ${username} a débloqué ${medalName}`);
      socket.emit("clicker:medals", medals[username]);
    }
  });

  // ===== Dino =====
  socket.on("dino:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = dinoScores[username] || 0;
    if (s > current) {
      dinoScores[username] = s;
      writeJSON(files.dinoScores, dinoScores);
      console.log(`🦖 Nouveau score Dino enregistré pour ${username}: ${s}`);
    }
    const arr = Object.entries(dinoScores)
      .map(([u, sc]) => ({ username: u, score: sc }))
      .sort(
        (a, b) => b.score - a.score || a.username.localeCompare(b.username)
      );
    io.emit("dino:leaderboard", arr);
  });

  // ===== Déconnexion =====
  socket.on("disconnect", (reason) => {
    users.delete(socket.id);

    const stillConnected = Array.from(users.values()).some(
      (u) => u.name === username
    );
    if (!stillConnected) {
      connectedUsers.delete(username);
      io.emit("system:info", `${username} a quitté le chat`);
    }

    io.emit("users:list", Array.from(connectedUsers.values()));
    clickBuckets.delete(socket.id);
    console.log(`❌ ${username} déconnecté (${reason})`);
  });
});

// -----------------------------
// Auto reload
// -----------------------------
const watchDir = path.join(__dirname, "Public");
console.log("[AUTO RELOAD : OK]\n");
let reloadTimer = null;

fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log(`♻️ Modification détectée : ${filename}`);
    io.emit("reload");
    reloadTimer = null;
  }, 500);
});

// -----------------------------
// Lancement du serveur
// -----------------------------
serveur.listen(PORT, HOTE, () => {
  console.log(`>>> ✅ Serveur lancé sur http://${HOTE || "localhost"}:${PORT}`);
});
