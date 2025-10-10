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
const blacklist = [
  "192.168.197.197",
  "192.168.197.1",
  "192.168.193.193",
  "192.168.193.1",
];
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
    console.warn(`⚠️ Fichier corrompu : ${file}, régénéré.`);
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
let users = new Map(); // socket.id -> { name, socketId }
let userSockets = new Map(); // username -> Set de socket.id

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
    io.emit("reload");
    socket.disconnect(true);
    return;
  }

  const username = user.username;

  if (userSockets.has(username)) {
    const oldSockets = userSockets.get(username);
    oldSockets.forEach((oldSocketId) => {
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket && oldSocket.id !== socket.id) {
        console.log(
          `🔄 Déconnexion de l'ancienne socket ${oldSocketId} pour ${username}`
        );
        oldSocket.disconnect(true);
      }
    });
    oldSockets.clear();
  }

  // Enregistrer la nouvelle socket
  if (!userSockets.has(username)) {
    userSockets.set(username, new Set());
  }
  userSockets.get(username).add(socket.id);
  users.set(socket.id, { name: username });

  console.log(`>> [${username}] connecté`);

  // Envoyer infos initiales
  socket.emit("you:name", username);
  socket.emit("chat:history", historique);
  socket.emit("clicker:you", { score: scores[username] || 0 });
  socket.emit("clicker:leaderboard", clickerLeaderboardClasse());
  socket.emit("clicker:medals", medals[username] || []);
  socket.emit(
    "dino:leaderboard",
    Object.entries(dinoScores)
      .map(([u, s]) => ({ username: u, score: s }))
      .sort((a, b) => b.score - a.score)
  );

  // Broadcast liste (utilisateurs uniques)
  const uniqueUsers = Array.from(userSockets.keys());
  io.emit("users:list", uniqueUsers);
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
    console.log(`\n🔄 Reset Clicker pour [${username}]\n`);
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
      console.log(`\n🏅 ${username} a débloqué ${medalName}\n`);
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
      console.log(`\n🦖 Nouveau score Dino pour [${username}] ::: ${s}\n`);
    }
    const arr = Object.entries(dinoScores)
      .map(([u, sc]) => ({ username: u, score: sc }))
      .sort(
        (a, b) => b.score - a.score || a.username.localeCompare(b.username)
      );
    io.emit("dino:leaderboard", arr);
  });

  // ===== Déconnexion =====
  socket.on("disconnect", () => {
    users.delete(socket.id);
    clickBuckets.delete(socket.id);

    if (userSockets.has(username)) {
      userSockets.get(username).delete(socket.id);
      if (userSockets.get(username).size === 0) {
        userSockets.delete(username);
        io.emit("system:info", `${username} a quitté le chat`);
        console.log(`>> [${username}] déconnecté`);
      }
    }

    // Mise à jour liste utilisateurs
    const uniqueUsers = Array.from(userSockets.keys());
    io.emit("users:list", uniqueUsers);
  });
});

// -----------------------------
// Auto reload
// -----------------------------
const watchDir = path.join(__dirname, "Public");
console.log("\n[AUTO RELOAD : OK]\n");
let reloadTimer = null;

fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log(`\n♻️  Modification détectée : ${filename}\n`);
    io.emit("reload");
    reloadTimer = null;
  }, 500);
});

// -----------------------------
// Lancement du serveur
// -----------------------------
serveur.listen(PORT, HOTE, () => {
  console.log(
    `>>> ✅ Serveur lancé sur http://${HOTE || "localhost"}:${PORT}\n`
  );
});
