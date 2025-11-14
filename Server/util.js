const fs = require("fs");
const path = require("path");
const session = require("express-session");
const config = require("./config");

// ------- Session -------
const expressSession = session({
  name: "sid",
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

// ------- Blacklist + Middleware -------
const blacklistMiddleware = (req, res, next) => {
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");

  if (config.BLACKLIST.includes(ip)) {
    console.log(`\n🚫 Accès refusé à ${ip}\n`);
    return res
      .status(403)
      .send(`<html><body><h1>Accès refusé</h1><p>IP: ${ip}</p></body></html>`);
  }
  next();
};

// ------- Gestionnaire fichier data -------
class FileService {
  constructor() {
    if (!fs.existsSync(config.DATA)) {
      fs.mkdirSync(config.DATA, { recursive: true });
    }

    this.files = {
      clicks: path.join(config.DATA, "clicks.json"),
      historique: path.join(config.DATA, "chat_history.json"),
      chatLogs: path.join(config.DATA, "chat_logs.jsonl"),
      dinoScores: path.join(config.DATA, "dino_scores.json"),
      flappyScores: path.join(config.DATA, "flappy_scores.json"),
      unoWins: path.join(config.DATA, "uno_wins.json"),
      medals: path.join(config.DATA, "medals.json"),
      p4Wins: path.join(config.DATA, "p4_wins.json"),
      pictionaryWins: path.join(config.DATA, "pictionary_wins.json"),
      blockblastScores: path.join(config.DATA, "blockblast_scores.json"),
      blockblastSaves: path.join(config.DATA, "blockblast_saves.json"),
      blockblastBestTimes: path.join(config.DATA, "blockblast_best_times.json"),
    };

    this.data = this.loadAll();
    // Migration silencieuse des médailles vers format uniforme { name, colors: [] }
    this.migrateMedals();
  }

  readJSON(file, fallback) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf-8").trim();
        if (raw) return JSON.parse(raw);
      }
    } catch (err) {
      console.warn(`⚠️ Fichier corrompu : ${file}`);
    }
    this.writeJSON(file, fallback);
    return fallback;
  }

  writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  }

  loadAll() {
    return {
      clicks: this.readJSON(this.files.clicks, {}),
      historique: this.readJSON(this.files.historique, []),
      dinoScores: this.readJSON(this.files.dinoScores, {}),
      medals: this.readJSON(this.files.medals, {}),
      flappyScores: this.readJSON(this.files.flappyScores, {}),
      unoWins: this.readJSON(this.files.unoWins, {}),
      p4Wins: this.readJSON(this.files.p4Wins, {}),
      pictionaryWins: this.readJSON(this.files.pictionaryWins, {}),
      blockblastScores: this.readJSON(this.files.blockblastScores, {}),
      blockblastSaves: this.readJSON(this.files.blockblastSaves, {}),
      blockblastBestTimes: this.readJSON(this.files.blockblastBestTimes, {}),
    };
  }

  migrateMedals() {
    try {
      const medalsData = this.data.medals || {};
      let changed = false;
      Object.keys(medalsData).forEach((user) => {
        const arr = Array.isArray(medalsData[user]) ? medalsData[user] : [];
        const normalized = arr.map((m) => {
          if (typeof m === "string") {
            changed = true;
            return { name: m, colors: [] };
          }
          return {
            name: m.name,
            colors: Array.isArray(m.colors) ? m.colors : [],
          };
        });
        medalsData[user] = normalized;
      });
      if (changed) {
        this.save("medals", medalsData);
        console.log("[Migration] Médailles normalisées (format objets). ✔️");
      }
    } catch (e) {
      console.warn("[Migration] Échec de la normalisation des médailles", e);
    }
  }

  save(key, data) {
    this.data[key] = data;
    const fileMap = {
      clicks: this.files.clicks,
      historique: this.files.historique,
      dinoScores: this.files.dinoScores,
      medals: this.files.medals,
      flappyScores: this.files.flappyScores,
      unoWins: this.files.unoWins,
      p4Wins: this.files.p4Wins,
      pictionaryWins: this.files.pictionaryWins,
      blockblastScores: this.files.blockblastScores,
      blockblastSaves: this.files.blockblastSaves,
      blockblastBestTimes: this.files.blockblastBestTimes,
    };
    if (fileMap[key]) {
      this.writeJSON(fileMap[key], data);
    }
  }

  appendLog(payload) {
    fs.appendFileSync(this.files.chatLogs, JSON.stringify(payload) + "\n");
  }
}

// ------- Anti-Spam -------

// ------- Gestionnaire Game State -------
class GameStateManager {
  constructor() {
    this.users = new Map();
    this.userSockets = new Map();
  }

  addUser(socketId, pseudo, io) {
    if (this.userSockets.has(pseudo)) {
      const oldSockets = this.userSockets.get(pseudo); // Déco anciennes instances
      oldSockets.forEach((oldId) => {
        if (oldId !== socketId) {
          const oldSocket = io.sockets.sockets.get(oldId);
          if (oldSocket) {
            if (pseudo !== "Admin")
              console.log(`\n🔄 Reset socket ${oldId} -> ${pseudo}\n`);
            oldSocket.disconnect(true);
          }
        }
      });
      oldSockets.clear();
    }

    if (!this.userSockets.has(pseudo)) {
      this.userSockets.set(pseudo, new Set());
    }
    this.userSockets.get(pseudo).add(socketId);
    this.users.set(socketId, { name: pseudo });
  }

  removeUser(socketId, pseudo) {
    this.users.delete(socketId);
    if (this.userSockets.has(pseudo)) {
      this.userSockets.get(pseudo).delete(socketId);
      if (this.userSockets.get(pseudo).size === 0) {
        this.userSockets.delete(pseudo);
        return true;
      }
    }
    return false;
  }

  getUniqueUsers() {
    return Array.from(this.userSockets.keys());
  }
}

// ------- Exports -------
module.exports = {
  expressSession,
  blacklistMiddleware,
  FileService: new FileService(),
  GameStateManager,
};
