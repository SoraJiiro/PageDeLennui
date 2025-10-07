require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 7550;
const HOST = "192.168.1.70";

const HOSTIP = HOST;

const app = express();
const serveur = http.createServer(app);
const io = new Server(serveur, {}); // RIEN METTRE ICI SINON BUG

var blacklist = ["192.168.197.197", "192.168.197.1"];

const WEBROOT = path.join(__dirname, "Public");
app.use(express.static(WEBROOT));

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const files = {
  leaderboard: path.join(dataDir, "leaderboard.json"),
  historique: path.join(dataDir, "chat_history.json"),
  chatLogs: path.join(dataDir, "chat_logs.jsonl"),
};

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch (f) {}
  return fallback;
}
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch (f) {}
}
function appendLog(line) {
  try {
    fs.appendFileSync(files.chatLogs, line + "\n", "utf-8");
  } catch (f) {}
}

let users = new Map();
let scores = readJSON(files.leaderboard, {});
let historique = readJSON(files.historique, []);

function normalizeIp(addr) {
  if (!addr) return "unknown";
  if (Array.isArray(addr)) addr = addr[0];
  if (addr.startsWith("::ffff:")) addr = addr.slice(7);
  if (addr === "::1") return "127.0.0.1";
  return addr;
}
function leaderboardClasse() {
  const arr = Object.entries(scores).map(([ip, score]) => ({
    ip: ip === HOSTIP ? "LeDéveloppeur" : ip,
    score: Number(score) || 0,
  }));
  arr.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip));
  return arr;
}
function broadcastLeaderboard() {
  io.emit("leaderboard:update", leaderboardClasse());
}

const clickWindowMs = 1200;
const clickMaxPerWindow = 22;
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

io.on("connection", (socket) => {
  const ip = normalizeIp(
    socket.handshake.headers["x-forwarded-for"] || socket.handshake.address
  );

  if (blacklist.includes(ip)) {
    console.log(
      `❌ Connexion refusée pour IP blacklistée: ${ip}` +
        new Date().toISOString()
    );
    // socket.emit("system:info", "Vous êtes banni du serveur [ACCESS DENIED].");
    socket.disconnect(true);
    return;
  }

  let displayName = ip === HOSTIP ? "LeDéveloppeur" : ip;

  users.set(socket.id, { name: displayName });

  socket.emit("you:name", displayName);
  socket.emit("chat:history", historique);
  socket.emit("clicker:you", { score: scores[ip] || 0 });
  socket.emit("leaderboard:update", leaderboardClasse());

  io.emit("system:info", `${displayName} a rejoint le chat`);
  io.emit(
    "users:list",
    Array.from(users.values()).map((u) => u.name)
  );

  // MESSAGE HANDLER ICI
  socket.on("chat:message", ({ text }) => {
    const msg = String(text || "").trim();
    if (!msg) return;
    const payload = {
      name: displayName,
      text: msg,
      at: new Date().toISOString(),
    };
    historique.push(payload);
    if (historique.length > 200) historique = historique.slice(-200);
    writeJSON(files.historique, historique);
    appendLog(JSON.stringify(payload));
    io.emit("chat:message", payload);
  });

  socket.on("clicker:click", () => {
    if (!allowClick(socket.id)) return;
    scores[displayName] = (scores[displayName] || 0) + 1;
    writeJSON(files.leaderboard, scores);
    socket.emit("clicker:you", { score: scores[displayName] });
    broadcastLeaderboard();
  });

  socket.on("clicker:reset", () => {
    scores[displayName] = 0;
    writeJSON(files.leaderboard, scores);
    socket.emit("clicker:you", { score: 0 });
    broadcastLeaderboard();
    console.log(`🔁 Reset effectué pour ${displayName}`);
  });

  socket.on("disconnect", () => {
    const u = users.get(socket.id);
    if (u) {
      io.emit("system:info", `${u.name} a quitté le chat`);
      users.delete(socket.id);
      io.emit(
        "users:list",
        Array.from(users.values()).map((u) => u.name)
      );
    }
    clickBuckets.delete(socket.id);
  });
});

serveur.listen(PORT, HOST, () => {
  console.log(`>>> ✅ Serveur : http://${HOST}:${PORT}`);
});
