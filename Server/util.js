const fs = require("fs");
const path = require("path");
const session = require("express-session");
const config = require("./config");
const { AUTO_BADGES } = require("./services/badgesAuto");

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
const ALLOWED_403_ASSET_PATHS = new Set([
  "/403.html",
  "/css/403.css",
  "/imgs/icon_d.png",
  "/imgs/icon_l.png",
  "/js/uiColor.js",
  "/js/auto_reload.js",
]);

const blacklistMiddleware = (req, res, next) => {
  if (ALLOWED_403_ASSET_PATHS.has(req.path)) {
    return next();
  }

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
      subwayScores: path.join(config.DATA, "subway_scores.json"),
      aimTrainerScores: path.join(config.DATA, "aim_trainer_scores.json"),
      aimTrainerStats: path.join(config.DATA, "aim_trainer_stats.json"),
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
      dailyRewards: path.join(config.DATA, "daily_rewards.json"),
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
      clickerAntiCheatSettings: path.join(
        config.DATA,
        "clicker_anti_cheat_settings.json",
      ),
      clickerUpgrades: path.join(config.DATA, "clicker_upgrades.json"),
      fileActions: path.join(config.DATA, "file_actions.log"),
    };

    this.pendingJsonWrites = new Map();
    this.jsonFlushTimer = null;
    this.jsonWriteDelayMs = Math.max(
      20,
      Math.floor(Number(process.env.JSON_WRITE_DEBOUNCE_MS) || 120),
    );

    this.pendingLogAppends = {
      chatLogs: [],
      fileActions: [],
    };
    this.logFlushTimer = null;
    this.logWriteDelayMs = Math.max(
      20,
      Math.floor(Number(process.env.LOG_WRITE_DEBOUNCE_MS) || 150),
    );

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

  queueJSONWrite(file, data) {
    try {
      const payload = JSON.stringify(data, null, 2);
      this.pendingJsonWrites.set(file, payload);
      this.scheduleJsonFlush();
    } catch (e) {
      console.error("Erreur serialisation JSON:", e);
    }
  }

  scheduleJsonFlush() {
    if (this.jsonFlushTimer) return;
    this.jsonFlushTimer = setTimeout(() => {
      this.jsonFlushTimer = null;
      this.flushJSONWrites().catch((e) => {
        console.error("Erreur flush JSON:", e);
      });
    }, this.jsonWriteDelayMs);
    if (typeof this.jsonFlushTimer.unref === "function") {
      this.jsonFlushTimer.unref();
    }
  }

  async flushJSONWrites() {
    const entries = Array.from(this.pendingJsonWrites.entries());
    if (entries.length === 0) return;
    this.pendingJsonWrites.clear();

    await Promise.allSettled(
      entries.map(([file, payload]) =>
        fs.promises.writeFile(file, payload, "utf8"),
      ),
    );
  }

  queueLogAppend(target, line) {
    if (!target || !line) return;
    const bucket = this.pendingLogAppends[target];
    if (!bucket) return;
    bucket.push(line);
    this.scheduleLogFlush();
  }

  scheduleLogFlush() {
    if (this.logFlushTimer) return;
    this.logFlushTimer = setTimeout(() => {
      this.logFlushTimer = null;
      this.flushLogAppends().catch((e) => {
        console.error("Erreur flush logs:", e);
      });
    }, this.logWriteDelayMs);
    if (typeof this.logFlushTimer.unref === "function") {
      this.logFlushTimer.unref();
    }
  }

  async flushLogAppends() {
    const chatChunk = this.pendingLogAppends.chatLogs.join("");
    const fileActionChunk = this.pendingLogAppends.fileActions.join("");
    this.pendingLogAppends.chatLogs = [];
    this.pendingLogAppends.fileActions = [];

    const ops = [];
    if (chatChunk) {
      ops.push(fs.promises.appendFile(this.files.chatLogs, chatChunk, "utf8"));
    }
    if (fileActionChunk) {
      ops.push(
        fs.promises.appendFile(this.files.fileActions, fileActionChunk, "utf8"),
      );
    }
    if (ops.length > 0) {
      await Promise.allSettled(ops);
    }
  }

  async flushAllPendingWrites() {
    try {
      if (this.jsonFlushTimer) {
        clearTimeout(this.jsonFlushTimer);
        this.jsonFlushTimer = null;
      }
      if (this.logFlushTimer) {
        clearTimeout(this.logFlushTimer);
        this.logFlushTimer = null;
      }
      await this.flushJSONWrites();
      await this.flushLogAppends();
    } catch (e) {
      console.error("Erreur flushAllPendingWrites:", e);
    }
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
        pixel_double_1m: {
          id: "pixel_double_1m",
          name: "x2 Pixel War 2 min",
          emoji: "\u23F1\uFE0F",
          price: 1200,
          available: true,
          type: "pixelwar",
          upgrade: "pixel_double_1m",
          desc: "Pendant 2 minutes, chaque tick Pixel War donne 2 pixels au lieu de 1.",
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
      subwayScores: this.readJSON(this.files.subwayScores, {}),
      aimTrainerScores: this.readJSON(this.files.aimTrainerScores, {
        15: {},
        30: {},
        60: {},
      }),
      aimTrainerStats: this.readJSON(this.files.aimTrainerStats, {}),
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
      dailyRewards: this.readJSON(this.files.dailyRewards, {}),
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
      clickerAntiCheatSettings: this.readJSON(
        this.files.clickerAntiCheatSettings,
        {},
      ),
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
      const ensureSystemBadgesAndAssignments = (badgesData) => {
        if (!badgesData || typeof badgesData !== "object") return false;
        if (!badgesData.catalog || typeof badgesData.catalog !== "object") {
          badgesData.catalog = {};
        }
        if (!badgesData.users || typeof badgesData.users !== "object") {
          badgesData.users = {};
        }

        let changed = false;
        const fixedCatalog = {
          birthday: { emoji: "🎂", name: "Anniversaire" },
        };
        const eeCatalog = {
          EE_S1: { emoji: "🌈​", name: "EE [S1]" },
          EE_S2: { emoji: "​📨​", name: "EE [S2]" },
        };

        for (const [badgeId, def] of Object.entries(fixedCatalog)) {
          const cur = badgesData.catalog[badgeId];
          if (!cur || typeof cur !== "object") {
            badgesData.catalog[badgeId] = { emoji: def.emoji, name: def.name };
            changed = true;
            continue;
          }
          if (!cur.name) {
            cur.name = def.name;
            changed = true;
          }
          if (!cur.emoji) {
            cur.emoji = def.emoji;
            changed = true;
          }
        }

        const autoCatalog = Array.isArray(AUTO_BADGES) ? AUTO_BADGES : [];
        for (const badge of autoCatalog) {
          if (!badge || !badge.id) continue;
          const cur = badgesData.catalog[badge.id];
          if (!cur || typeof cur !== "object") {
            badgesData.catalog[badge.id] = {
              emoji: String(badge.emoji || "🏷️"),
              name: String(badge.name || badge.id),
            };
            changed = true;
            continue;
          }
          if (!cur.name) {
            cur.name = String(badge.name || badge.id);
            changed = true;
          }
          if (!cur.emoji) {
            cur.emoji = String(badge.emoji || "🏷️");
            changed = true;
          }
        }

        for (const [badgeId, def] of Object.entries(eeCatalog)) {
          const cur = badgesData.catalog[badgeId];
          if (!cur || typeof cur !== "object") {
            badgesData.catalog[badgeId] = { emoji: def.emoji, name: def.name };
            changed = true;
            continue;
          }
          if (!cur.name) {
            cur.name = def.name;
            changed = true;
          }
          if (!cur.emoji) {
            cur.emoji = def.emoji;
            changed = true;
          }
        }

        const eeUsers =
          this.data &&
          this.data.easterEggs &&
          this.data.easterEggs.users &&
          typeof this.data.easterEggs.users === "object"
            ? this.data.easterEggs.users
            : {};

        for (const [pseudo, eggs] of Object.entries(eeUsers)) {
          if (
            !badgesData.users[pseudo] ||
            typeof badgesData.users[pseudo] !== "object"
          ) {
            badgesData.users[pseudo] = { assigned: [], selected: [] };
            changed = true;
          }
          const bucket = badgesData.users[pseudo];
          if (!Array.isArray(bucket.assigned)) {
            bucket.assigned = [];
            changed = true;
          }
          if (!Array.isArray(bucket.selected)) {
            bucket.selected = [];
            changed = true;
          }

          const s1 = eggs && eggs.S1;
          const s2 = eggs && eggs.S2;
          const s1Steps =
            s1 && s1.steps && typeof s1.steps === "object" ? s1.steps : {};
          const s2Steps =
            s2 && s2.steps && typeof s2.steps === "object" ? s2.steps : {};
          const s1Completed = Boolean(s1 && (s1.completed || s1Steps.rainbow));
          const s2Completed = Boolean(
            s2 &&
            (s2.completed ||
              (s2Steps.index_x &&
                s2Steps.ann_link &&
                s2Steps.suggestions_code)),
          );

          if (s1Completed && !bucket.assigned.includes("EE_S1")) {
            bucket.assigned.push("EE_S1");
            changed = true;
          }
          if (s2Completed && !bucket.assigned.includes("EE_S2")) {
            bucket.assigned.push("EE_S2");
            changed = true;
          }
        }

        return changed;
      };

      const raw = this.data.chatBadges;
      if (!raw || typeof raw !== "object") {
        this.data.chatBadges = { catalog: {}, users: {} };
        ensureSystemBadgesAndAssignments(this.data.chatBadges);
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
        if (ensureSystemBadgesAndAssignments(this.data.chatBadges)) {
          this.save("chatBadges", this.data.chatBadges);
        }
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
      ensureSystemBadgesAndAssignments(migrated);
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
      subwayScores: this.files.subwayScores,
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
      dailyRewards: this.files.dailyRewards,
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
      clickerAntiCheatSettings: this.files.clickerAntiCheatSettings,
      clickerUpgrades: this.files.clickerUpgrades,
      chatMuted: this.files.chatMuted,
    };
    if (fileMap[key]) {
      this.queueJSONWrite(fileMap[key], data);
    }
  }

  appendLog(payload) {
    this.queueLogAppend("chatLogs", JSON.stringify(payload) + "\n");
  }

  appendFileAction(payload) {
    try {
      const line = JSON.stringify(payload) + "\n";
      this.queueLogAppend("fileActions", line);
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
