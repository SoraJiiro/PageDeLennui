const fs = require("fs");
const path = require("path");
const session = require("express-session");
const config = require("./config");

const BLACKLIST_PATH = path.join(__dirname, "..", "blacklist.json");

function getIpFromSocket(s) {
  try {
    const ipHeader = s.handshake.headers["x-forwarded-for"];
    const ip = (
      ipHeader ||
      s.request.socket.remoteAddress ||
      s.handshake.address ||
      ""
    ).replace("::ffff:", "");
    return ip || "";
  } catch (e) {
    return "";
  }
}

function persistBanIp(ip) {
  try {
    if (!fs.existsSync(BLACKLIST_PATH)) {
      const defaultData = { alwaysBlocked: [] };
      fs.writeFileSync(
        BLACKLIST_PATH,
        JSON.stringify(defaultData, null, 2),
        "utf8"
      );
    }
    const raw = fs.readFileSync(BLACKLIST_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    data.alwaysBlocked = Array.isArray(data.alwaysBlocked)
      ? data.alwaysBlocked
      : [];
    if (!data.alwaysBlocked.includes(ip)) {
      data.alwaysBlocked.push(ip);
      fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(data, null, 2), "utf8");
    }
    // Mettre à jour la blacklist de la configuration d'exécution aussi
    if (!config.BLACKLIST.includes(ip)) config.BLACKLIST.push(ip);
    return true;
  } catch (e) {
    console.error("Erreur persistance blacklist:", e);
    return false;
  }
}

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
const alreadyTriedToConnect = [];

const blacklistMiddleware = (req, res, next) => {
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");

  if (config.BLACKLIST.includes(ip)) {
    if (!alreadyTriedToConnect.includes(ip)) {
      console.log(`\n🚫 Accès refusé à ${ip}\n`);
      alreadyTriedToConnect.push(ip);
    }
    return res.status(403).sendFile(path.join(config.PUBLIC, "403.html"));
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
      blockblastScores: path.join(config.DATA, "blockblast_scores.json"),
      blockblastSaves: path.join(config.DATA, "blockblast_saves.json"),
      blockblastBestTimes: path.join(config.DATA, "blockblast_best_times.json"),
      snakeScores: path.join(config.DATA, "snake_scores.json"),
      snakeBestTimes: path.join(config.DATA, "snake_best_times.json"),
      cheaters: path.join(config.DATA, "cheaters.json"),
      tags: path.join(config.DATA, "tags.json"),
      uis: path.join(config.DATA, "uis.json"),
      motusState: path.join(config.DATA, "motus_state.json"),
      motusScores: path.join(config.DATA, "motus_scores.json"),
      scores2048: path.join(config.DATA, "2048_scores.json"),
      mashWins: path.join(config.DATA, "mash_wins.json"),
      transactions: path.join(config.DATA, "transactions.json"),
      blackjackStats: path.join(config.DATA, "blackjack_stats.json"),
      coinflipStats: path.join(config.DATA, "coinflip_stats.json"),
      annonces: path.join(config.DATA, "annonces.json"),
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
      blockblastScores: this.readJSON(this.files.blockblastScores, {}),
      blockblastSaves: this.readJSON(this.files.blockblastSaves, {}),
      blockblastBestTimes: this.readJSON(this.files.blockblastBestTimes, {}),
      snakeScores: this.readJSON(this.files.snakeScores, {}),
      snakeBestTimes: this.readJSON(this.files.snakeBestTimes, {}),
      cheaters: this.readJSON(this.files.cheaters, []),
      tags: this.readJSON(this.files.tags, {}),
      uis: this.readJSON(this.files.uis, {}),
      motusState: this.readJSON(this.files.motusState, {}),
      motusScores: this.readJSON(this.files.motusScores, {}),
      scores2048: this.readJSON(this.files.scores2048, {}),
      mashWins: this.readJSON(this.files.mashWins, {}),
      transactions: this.readJSON(this.files.transactions, []),
      blackjackStats: this.readJSON(this.files.blackjackStats, {}),
      coinflipStats: this.readJSON(this.files.coinflipStats, {}),
      annonces: this.readJSON(this.files.annonces, []),
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
      blockblastScores: this.files.blockblastScores,
      blockblastSaves: this.files.blockblastSaves,
      blockblastBestTimes: this.files.blockblastBestTimes,
      snakeScores: this.files.snakeScores,
      snakeBestTimes: this.files.snakeBestTimes,
      cheaters: this.files.cheaters,
      tags: this.files.tags,
      uis: this.files.uis,
      backgrounds: this.files.backgrounds,
      motusState: this.files.motusState,
      motusScores: this.files.motusScores,
      scores2048: this.files.scores2048,
      mashWins: this.files.mashWins,
      transactions: this.files.transactions,
      blackjackStats: this.files.blackjackStats,
      coinflipStats: this.files.coinflipStats,
      annonces: this.files.annonces,
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

      // Si ce n'est pas l'Admin, on déconnecte les anciennes sessions pour éviter les doublons
      if (pseudo !== "Admin") {
        oldSockets.forEach((oldId) => {
          if (oldId !== socketId) {
            const oldSocket = io.sockets.sockets.get(oldId);
            if (oldSocket) {
              console.log(`\n🔄 Reset socket ${oldId} -> ${pseudo}\n`);
              oldSocket.disconnect(true);
            }
          }
        });
        oldSockets.clear();
      }
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
  getIpFromSocket,
  persistBanIp,
};
