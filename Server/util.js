const fs = require("fs");
const path = require("path");
const session = require("express-session");
const config = require("./config");

const DEFAULT_PFP_URL = "/Public/imgs/defaultProfile.png";

const BLACKLIST_PATH = path.join(__dirname, "..", "blacklist.json");

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
      const defaultData = { alwaysBlocked: [], alwaysBlockedPseudos: [] };
      fs.writeFileSync(
        BLACKLIST_PATH,
        JSON.stringify(defaultData, null, 2),
        "utf8",
      );
    }
    const raw = fs.readFileSync(BLACKLIST_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    data.alwaysBlocked = Array.isArray(data.alwaysBlocked)
      ? data.alwaysBlocked
      : [];
    data.alwaysBlockedPseudos = Array.isArray(data.alwaysBlockedPseudos)
      ? data.alwaysBlockedPseudos
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

function persistBanPseudo(pseudo) {
  try {
    const rawPseudo = String(pseudo || "").trim();
    if (!rawPseudo) return false;

    if (!fs.existsSync(BLACKLIST_PATH)) {
      const defaultData = { alwaysBlocked: [], alwaysBlockedPseudos: [] };
      fs.writeFileSync(
        BLACKLIST_PATH,
        JSON.stringify(defaultData, null, 2),
        "utf8",
      );
    }

    const raw = fs.readFileSync(BLACKLIST_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    data.alwaysBlocked = Array.isArray(data.alwaysBlocked)
      ? data.alwaysBlocked
      : [];
    data.alwaysBlockedPseudos = Array.isArray(data.alwaysBlockedPseudos)
      ? data.alwaysBlockedPseudos
      : [];

    const key = normalizePseudoValue(rawPseudo);
    const already = data.alwaysBlockedPseudos.some(
      (p) => normalizePseudoValue(p) === key,
    );

    if (!already) {
      data.alwaysBlockedPseudos.push(rawPseudo);
      fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(data, null, 2), "utf8");
    }

    if (!isPseudoBlacklisted(rawPseudo)) {
      if (!Array.isArray(config.BLACKLIST_PSEUDOS)) {
        config.BLACKLIST_PSEUDOS = [];
      }
      config.BLACKLIST_PSEUDOS.push(rawPseudo);
    }
    return true;
  } catch (e) {
    console.error("Erreur persistance blacklist pseudo:", e);
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
const alreadyTriedToConnectPseudos = [];

const blacklistMiddleware = (req, res, next) => {
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");

  const pseudo = req.session && req.session.user && req.session.user.pseudo;

  if (config.BLACKLIST.includes(ip)) {
    if (!alreadyTriedToConnect.includes(ip)) {
      console.log(`\n🚫 Accès refusé à ${ip}\n`);
      alreadyTriedToConnect.push(ip);
    }
    return res.status(403).sendFile(path.join(config.PUBLIC, "403.html"));
  }

  if (isPseudoBlacklisted(pseudo)) {
    const key = normalizePseudoValue(pseudo);
    if (key && !alreadyTriedToConnectPseudos.includes(key)) {
      console.log(`\n🚫 Accès refusé au pseudo ${pseudo}\n`);
      alreadyTriedToConnectPseudos.push(key);
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
      pfps: path.join(config.DATA, "pfps.json"),
      pfpRequests: path.join(config.DATA, "pfp_requests.json"),
      customBadgeRequests: path.join(config.DATA, "custom_badge_requests.json"),
      chatBadges: path.join(config.DATA, "chat_badges.json"),
      chatMuted: path.join(config.DATA, "chat_muted.json"),
      dinoScores: path.join(config.DATA, "dino_scores.json"),
      flappyScores: path.join(config.DATA, "flappy_scores.json"),
      runnerResume: path.join(config.DATA, "runner_resume.json"),
      unoWins: path.join(config.DATA, "uno_wins.json"),
      unoStats: path.join(config.DATA, "uno_stats.json"),
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
      scores2048MaxTile: path.join(config.DATA, "2048_max_tiles.json"),
      mashWins: path.join(config.DATA, "mash_wins.json"),
      transactions: path.join(config.DATA, "transactions.json"),
      blackjackStats: path.join(config.DATA, "blackjack_stats.json"),
      coinflipStats: path.join(config.DATA, "coinflip_stats.json"),
      rouletteStats: path.join(config.DATA, "roulette_stats.json"),
      slotsStats: path.join(config.DATA, "slots_stats.json"),
      sudokuScores: path.join(config.DATA, "sudoku_scores.json"),
      sudokuState: path.join(config.DATA, "sudoku_state.json"),
      dailyEarnings: path.join(config.DATA, "daily_earnings.json"),
      leaderboardBonusMeta: path.join(
        config.DATA,
        "leaderboard_bonus_meta.json",
      ),
      wallets: path.join(config.DATA, "wallets.json"),
      annonces: path.join(config.DATA, "annonces.json"),
      dms: path.join(config.DATA, "dms.json"),
      sharedFiles: path.join(config.DATA, "shared_files.json"),
      easterEggTracking: path.join(config.DATA, "easter_egg_tracking.json"),
      shopCatalog: path.join(config.DATA, "shop_catalog.json"),
      reviveLives: path.join(config.DATA, "revive_lives.json"),
      clickerHumanPeakCps: path.join(
        config.DATA,
        "clicker_human_peak_cps.json",
      ),
      clickerFouChallenges: path.join(
        config.DATA,
        "clicker_fou_challenges.json",
      ),
      clickerUpgrades: path.join(config.DATA, "clicker_upgrades.json"),
      fileActions: path.join(config.DATA, "file_actions.log"),
    };

    this.data = this.loadAll();
    // Migration silencieuse des médailles vers format uniforme { name, colors: [] }
    this.migrateMedals();
    // Migration silencieuse des badges chat (ancien format -> nouveau)
    this.migrateChatBadges();
  }

  getPfpUrl(pseudo) {
    const p = String(pseudo || "").trim();
    if (!p) return DEFAULT_PFP_URL;
    const url = this.data.pfps ? this.data.pfps[p] : null;
    return typeof url === "string" && url.trim() ? url : DEFAULT_PFP_URL;
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
    const defaultShopCatalog = {
      items: {
        life_1: {
          id: "life_1",
          name: "Vie x1",
          emoji: "\u2764\uFE0F",
          price: 18000,
          available: true,
          type: "revive_life",
          amount: 1,
          desc: "Ajoute 1 vie de reanimation pour les mini-jeux.",
        },
        life_2: {
          id: "life_2",
          name: "Vie x2",
          emoji: "\u2764\uFE0F\u2764\uFE0F",
          price: 34000,
          available: true,
          type: "revive_life",
          amount: 2,
          desc: "Ajoute 2 vies de reanimation pour les mini-jeux.",
        },
        life_3: {
          id: "life_3",
          name: "Vie x3",
          emoji: "\u2764\uFE0F\u2764\uFE0F\u2764\uFE0F",
          price: 50000,
          available: true,
          type: "revive_life",
          amount: 3,
          desc: "Ajoute 3 vies de reanimation pour les mini-jeux.",
        },
        pixel_1: {
          id: "pixel_1",
          name: "Pixel x1",
          emoji: "\uD83D\uDFE9",
          price: 250,
          available: true,
          type: "pixelwar",
          upgrade: "pixel_1",
          desc: "Ajoute 1 pixel a placer dans Pixel War.",
        },
        pixel_15: {
          id: "pixel_15",
          name: "Pixels x15",
          emoji: "\uD83D\uDFE9",
          price: 3000,
          available: true,
          type: "pixelwar",
          upgrade: "pixel_15",
          desc: "Ajoute 15 pixels a placer dans Pixel War.",
        },
        storage_10: {
          id: "storage_10",
          name: "Stockage +10",
          emoji: "\uD83D\uDCE6",
          price: 8000,
          available: true,
          type: "pixelwar",
          upgrade: "storage_10",
          desc: "Augmente la capacite Pixel War de 10.",
        },
        color_custom: {
          id: "color_custom",
          name: "Couleur Personnalisée",
          emoji: "\uD83C\uDFA8",
          price: 3000,
          available: true,
          type: "pixelwar",
          upgrade: "color_custom",
          desc: "Crée et débloque une couleur Pixel War personnalisée.",
        },
      },
    };
    return {
      clicks: this.readJSON(this.files.clicks, {}),
      historique: this.readJSON(this.files.historique, []),
      pfps: this.readJSON(this.files.pfps, {}),
      pfpRequests: this.readJSON(this.files.pfpRequests, []),
      customBadgeRequests: this.readJSON(this.files.customBadgeRequests, []),
      chatBadges: this.readJSON(this.files.chatBadges, {
        catalog: {},
        users: {},
      }),
      chatMuted: this.readJSON(this.files.chatMuted, {}),
      dinoScores: this.readJSON(this.files.dinoScores, {}),
      medals: this.readJSON(this.files.medals, {}),
      flappyScores: this.readJSON(this.files.flappyScores, {}),
      runnerResume: this.readJSON(this.files.runnerResume, {}),
      unoWins: this.readJSON(this.files.unoWins, {}),
      unoStats: this.readJSON(this.files.unoStats, {}),
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
      scores2048MaxTile: this.readJSON(this.files.scores2048MaxTile, {}),
      mashWins: this.readJSON(this.files.mashWins, {}),
      transactions: this.readJSON(this.files.transactions, []),
      blackjackStats: this.readJSON(this.files.blackjackStats, {}),
      coinflipStats: this.readJSON(this.files.coinflipStats, {}),
      rouletteStats: this.readJSON(this.files.rouletteStats, {}),
      slotsStats: this.readJSON(this.files.slotsStats, {}),
      sudokuScores: this.readJSON(this.files.sudokuScores, {}),
      sudokuState: this.readJSON(this.files.sudokuState, {}),
      dailyEarnings: this.readJSON(this.files.dailyEarnings, {}),
      leaderboardBonusMeta: this.readJSON(this.files.leaderboardBonusMeta, {}),
      wallets: this.readJSON(this.files.wallets, {}),
      annonces: this.readJSON(this.files.annonces, []),
      dms: this.readJSON(this.files.dms, []),
      sharedFiles: this.readJSON(this.files.sharedFiles, {}),
      easterEggs: this.readJSON(this.files.easterEggTracking, { users: {} }),
      shopCatalog: this.readJSON(this.files.shopCatalog, defaultShopCatalog),
      reviveLives: this.readJSON(this.files.reviveLives, { users: {} }),
      clickerHumanPeakCps: this.readJSON(this.files.clickerHumanPeakCps, {}),
      clickerFouChallenges: this.readJSON(this.files.clickerFouChallenges, {}),
      clickerUpgrades: this.readJSON(this.files.clickerUpgrades, {}),
      // fileActions is an append-only log, don't try to parse as JSON here
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

  migrateChatBadges() {
    try {
      const raw = this.data.chatBadges;
      if (!raw || typeof raw !== "object") {
        this.data.chatBadges = { catalog: {}, users: {} };
        this.save("chatBadges", this.data.chatBadges);
        return;
      }

      // Nouveau format attendu: { catalog: {id:{emoji,name}}, users: {pseudo:{assigned:[], selected:[]}} }
      const hasCatalog = raw.catalog && typeof raw.catalog === "object";
      const hasUsers = raw.users && typeof raw.users === "object";
      if (hasCatalog && hasUsers) {
        // Normalisation légère
        raw.catalog = raw.catalog || {};
        raw.users = raw.users || {};
        this.data.chatBadges = raw;
        return;
      }

      // Ancien format détecté: { "Pseudo": "badgeId" }
      const legacy = raw;
      const migrated = { catalog: {}, users: {} };
      for (const [pseudo, badgeIdRaw] of Object.entries(legacy)) {
        const badgeId = String(badgeIdRaw || "").trim();
        if (!badgeId) continue;
        if (!migrated.catalog[badgeId]) {
          let emoji = "🏷️";
          if (badgeId.toLowerCase() === "star") emoji = "⭐";
          migrated.catalog[badgeId] = { emoji, name: badgeId };
        }
        migrated.users[pseudo] = { assigned: [badgeId], selected: [badgeId] };
      }
      this.data.chatBadges = migrated;
      this.save("chatBadges", migrated);
      console.log(
        "[Migration] Badges chat migrés (format legacy -> nouveau). ✔️",
      );
    } catch (e) {
      console.warn("[Migration] Échec de la migration des badges chat", e);
    }
  }

  save(key, data) {
    this.data[key] = data;
    const fileMap = {
      clicks: this.files.clicks,
      historique: this.files.historique,
      pfps: this.files.pfps,
      pfpRequests: this.files.pfpRequests,
      customBadgeRequests: this.files.customBadgeRequests,
      chatBadges: this.files.chatBadges,
      dinoScores: this.files.dinoScores,
      medals: this.files.medals,
      flappyScores: this.files.flappyScores,
      runnerResume: this.files.runnerResume,
      unoWins: this.files.unoWins,
      unoStats: this.files.unoStats,
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
      scores2048MaxTile: this.files.scores2048MaxTile,
      mashWins: this.files.mashWins,
      transactions: this.files.transactions,
      blackjackStats: this.files.blackjackStats,
      coinflipStats: this.files.coinflipStats,
      rouletteStats: this.files.rouletteStats,
      slotsStats: this.files.slotsStats,
      sudokuScores: this.files.sudokuScores,
      sudokuState: this.files.sudokuState,
      dailyEarnings: this.files.dailyEarnings,
      leaderboardBonusMeta: this.files.leaderboardBonusMeta,
      wallets: this.files.wallets,
      annonces: this.files.annonces,
      dms: this.files.dms,
      sharedFiles: this.files.sharedFiles,
      easterEggs: this.files.easterEggTracking,
      shopCatalog: this.files.shopCatalog,
      reviveLives: this.files.reviveLives,
      clickerHumanPeakCps: this.files.clickerHumanPeakCps,
      clickerFouChallenges: this.files.clickerFouChallenges,
      clickerUpgrades: this.files.clickerUpgrades,
      chatMuted: this.files.chatMuted,
    };
    if (fileMap[key]) {
      this.writeJSON(fileMap[key], data);
    }
  }

  appendLog(payload) {
    fs.appendFileSync(this.files.chatLogs, JSON.stringify(payload) + "\n");
  }

  appendFileAction(payload) {
    try {
      const line = JSON.stringify(payload) + "\n";
      fs.appendFileSync(this.files.fileActions, line, { encoding: "utf8" });
    } catch (e) {
      console.error("Erreur écriture file action log:", e);
    }
  }
}

// ------- Nettoyage files -------

const { cleanExpiredFiles } = require("./sockets/handlers/chat");

setInterval(
  () => {
    const FileService = require("./util").FileService;
    cleanExpiredFiles(FileService);
  },
  120 * 120 * 1000,
);

// ------- Gestionnaire Game State -------
class GameStateManager {
  constructor() {
    this.users = new Map();
    this.userSockets = new Map();
    this.socketSessions = new Map();
  }

  addUser(socketId, pseudo, io, sessionId = null) {
    this.socketSessions.set(socketId, sessionId || null);

    if (this.userSockets.has(pseudo)) {
      const oldSockets = this.userSockets.get(pseudo); // Déco anciennes instances

      // Si ce n'est pas l'Admin, on déconnecte les anciennes sessions pour éviter les doublons.
      // Exception: on conserve les sockets issus de la MÊME session HTTP
      // (ex: index + iframe même utilisateur) pour garder l'app synchronisée.
      if (pseudo !== "Admin") {
        oldSockets.forEach((oldId) => {
          if (oldId !== socketId) {
            const oldSessionId = this.socketSessions.get(oldId) || null;
            const sameHttpSession =
              !!sessionId && !!oldSessionId && oldSessionId === sessionId;
            if (sameHttpSession) {
              return;
            }

            const oldSocket = io.sockets.sockets.get(oldId);
            if (oldSocket) {
              if (config.LOG_SOCKET_EVENTS) {
                console.log(`\n🔄 Reset socket ${oldId} -> ${pseudo}\n`);
              }
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
    this.socketSessions.delete(socketId);
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
  persistBanPseudo,
  isPseudoBlacklisted,
};
