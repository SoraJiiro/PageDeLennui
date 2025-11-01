const fs = require("fs");
const path = require("path");
const session = require("express-session");
const config = require("./config");

// ========== Session ==========
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

// ========== Blacklist Middleware ==========
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

// ========== File Service ==========
class FileService {
  constructor() {
    if (!fs.existsSync(config.DATA_DIR)) {
      fs.mkdirSync(config.DATA_DIR, { recursive: true });
    }

    this.files = {
      clicks: path.join(config.DATA_DIR, "clicks.json"),
      historique: path.join(config.DATA_DIR, "chat_history.json"),
      chatLogs: path.join(config.DATA_DIR, "chat_logs.jsonl"),
      dinoScores: path.join(config.DATA_DIR, "dino_scores.json"),
      flappyScores: path.join(config.DATA_DIR, "flappy_scores.json"),
      unoWins: path.join(config.DATA_DIR, "uno_wins.json"),
      medals: path.join(config.DATA_DIR, "medals.json"),
      p4Wins: path.join(config.DATA_DIR, "p4_wins.json"),
      pictionaryWins: path.join(config.DATA_DIR, "pictionary_wins.json"),
    };

    // Charger tous les fichiers au démarrage
    this.data = this.loadAll();
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
    };
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
    };
    if (fileMap[key]) {
      this.writeJSON(fileMap[key], data);
    }
  }

  appendLog(payload) {
    fs.appendFileSync(this.files.chatLogs, JSON.stringify(payload) + "\n");
  }
}

// ========== Anti-Spam ==========
class AntiSpam {
  constructor() {
    this.buckets = new Map();
  }

  allow(socketId) {
    const now = Date.now();
    const bucket = this.buckets.get(socketId) || {
      windowStart: now,
      count: 0,
    };

    if (now - bucket.windowStart >= config.CLICK_WINDOW_MS) {
      bucket.windowStart = now;
      bucket.count = 0;
    }

    bucket.count++;
    this.buckets.set(socketId, bucket);

    return bucket.count <= config.CLICK_MAX_PER_WINDOW;
  }

  cleanup(socketId) {
    this.buckets.delete(socketId);
  }
}

// ========== Game State Manager ==========
class GameStateManager {
  constructor() {
    this.users = new Map();
    this.userSockets = new Map();
  }

  addUser(socketId, pseudo, io) {
    // Déconnecter anciennes sockets
    if (this.userSockets.has(pseudo)) {
      const oldSockets = this.userSockets.get(pseudo);
      oldSockets.forEach((oldId) => {
        if (oldId !== socketId) {
          const oldSocket = io.sockets.sockets.get(oldId);
          if (oldSocket) {
            console.log(`🔄 Reset socket ${oldId} -> ${pseudo}`);
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
        return true; // Complètement déconnecté
      }
    }
    return false;
  }

  getUniqueUsers() {
    return Array.from(this.userSockets.keys());
  }
}

// ========== Exports ==========
module.exports = {
  expressSession,
  blacklistMiddleware,
  FileService: new FileService(),
  AntiSpam: new AntiSpam(),
  GameStateManager,
};
