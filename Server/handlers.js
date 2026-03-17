const {
  FileService,
  getIpFromSocket,
  persistBanIp,
  persistBanPseudo,
  isPseudoBlacklisted,
} = require("./util");
const dbUsers = require("./db/dbUsers");
const {
  recalculateMedals,
  UnoGame,
  Puissance4Game,
  MotusGame,
  BlackjackGame,
} = require("./moduleGetter");

const fs = require("fs");
const path = require("path");
const config = require("./config");

const { createMotusHelpers } = require("./sockets/handlers/motusHelpers");
const { registerCoinflipHandlers } = require("./sockets/handlers/coinflip");
const { registerUserHandlers } = require("./sockets/handlers/user");
const { registerChatHandlers } = require("./sockets/handlers/chat");
const { registerClickerHandlers } = require("./sockets/handlers/clicker");
const { registerDinoFlappyHandlers } = require("./sockets/handlers/dinoFlappy");
const { registerReviveHandlers } = require("./sockets/handlers/revive");
const { registerUnoHandlers } = require("./sockets/handlers/uno");
const { registerPuissance4Handlers } = require("./sockets/handlers/puissance4");
const { registerBlockblastHandlers } = require("./sockets/handlers/blockblast");
const { registerSnakeHandlers } = require("./sockets/handlers/snake");
const { register2048Handlers } = require("./sockets/handlers/game2048");
const { registerAdminHandlers } = require("./sockets/handlers/admin");
const { registerMotusHandlers } = require("./sockets/handlers/motus");
const { registerMashHandlers } = require("./sockets/handlers/mash");
const { applyAutoBadges } = require("./services/badgesAuto");
const {
  ensureBlackjackGameConfigured,
  registerBlackjackHandlers,
} = require("./sockets/handlers/blackjack");
const { registerSudokuHandlers } = require("./sockets/handlers/sudoku");
const { registerAimTrainerHandlers } = require("./sockets/handlers/aimTrainer");

const PixelWarGame = require("./games/pixelWarGame");
const { registerPixelWarHandlers } = require("./sockets/handlers/pixelWar");
const { migrateWalletsFromClicks } = require("./services/wallet");

function broadcastSystemMessage(io, text, persist = false) {
  io.emit("system:info", text);
  if (persist) {
    const payload = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: "Système",
      text: text,
      at: new Date().toISOString(),
      tag: null,
    };
    FileService.data.historique.push(payload);
    if (FileService.data.historique.length > 200) {
      FileService.data.historique = FileService.data.historique.slice(-200);
    }
    FileService.save("historique", FileService.data.historique);
    FileService.appendLog(payload);
  }
}

function safeNumber(n) {
  const v = Math.floor(Number(n) || 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function cleanupResumeExpired(existing, maxAgeMs) {
  const now = Date.now();
  const out = {};
  for (const [pseudo, entry] of Object.entries(existing || {})) {
    const at = Date.parse(entry?.at || "");
    if (!Number.isFinite(at)) continue;
    if (now - at > maxAgeMs) continue;
    out[pseudo] = entry;
  }
  return out;
}

function mergeProgressIntoResume(resume, pseudo, game, score) {
  const s = safeNumber(score);
  if (!pseudo || !game || s <= 0) return;

  if (!resume[pseudo]) resume[pseudo] = { at: new Date().toISOString() };
  resume[pseudo].at = new Date().toISOString();
  const prev = safeNumber(resume[pseudo][game]);
  if (s > prev) resume[pseudo][game] = s;
}

function isRunnerActive(state, game) {
  return !!(state && state[game] && state[game].active === true);
}

function persistRunnerResumeFromSocket(socket, pseudo) {
  try {
    if (!pseudo || !socket?.data) return;

    const rp = socket.data.runnerProgress || {};
    const rc = socket.data.reviveContext || {};
    const rs = socket.data.runnerState || {};

    const dinoInRun = isRunnerActive(rs, "dino");
    const flappyInRun = isRunnerActive(rs, "flappy");
    const snakeInRun = isRunnerActive(rs, "snake");
    const subwayInRun = isRunnerActive(rs, "subway");
    const game2048InRun = safeNumber(rp?.["2048"]) > 0;
    const blockblastInRun = safeNumber(rp?.blockblast) > 0;

    const hasAnyProgress =
      (dinoInRun && safeNumber(rp?.dino) > 0) ||
      (flappyInRun && safeNumber(rp?.flappy) > 0) ||
      (snakeInRun && safeNumber(rp?.snake) > 0) ||
      (subwayInRun && safeNumber(rp?.subway) > 0) ||
      game2048InRun ||
      blockblastInRun ||
      safeNumber(rc?.["2048"]?.lastScore) > 0 ||
      safeNumber(rc?.blockblast?.lastScore) > 0;

    if (!hasAnyProgress) return;

    const existing = cleanupResumeExpired(
      FileService.data.runnerResume || {},
      60 * 60 * 1000,
    );

    if (dinoInRun) mergeProgressIntoResume(existing, pseudo, "dino", rp?.dino);
    if (flappyInRun)
      mergeProgressIntoResume(existing, pseudo, "flappy", rp?.flappy);
    if (snakeInRun)
      mergeProgressIntoResume(existing, pseudo, "snake", rp?.snake);
    if (subwayInRun)
      mergeProgressIntoResume(existing, pseudo, "subway", rp?.subway);
    mergeProgressIntoResume(existing, pseudo, "2048", rp?.["2048"]);
    mergeProgressIntoResume(existing, pseudo, "blockblast", rp?.blockblast);

    // Fallback reviveContext conservé uniquement pour les jeux qui n'envoient
    // pas toujours un progress explicite en live.
    mergeProgressIntoResume(existing, pseudo, "2048", rc?.["2048"]?.lastScore);
    mergeProgressIntoResume(
      existing,
      pseudo,
      "blockblast",
      rc?.blockblast?.lastScore,
    );

    FileService.save("runnerResume", existing);
  } catch (e) {
    // best-effort
  }
}

function getSiteMoneyStatsPayload() {
  const wallets =
    FileService && FileService.data && FileService.data.wallets
      ? FileService.data.wallets
      : {};

  const entries = Object.values(wallets || {}).filter(
    (wallet) => wallet && typeof wallet === "object",
  );

  const usersCount = entries.length;
  const totalMoney = entries.reduce((sum, wallet) => {
    const money = Number(wallet?.money);
    return sum + (Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0);
  }, 0);

  const averageMoney = usersCount > 0 ? totalMoney / usersCount : 0;

  return {
    usersCount,
    totalMoney,
    averageMoney,
  };
}

function getUsersPresencePayload(gameState) {
  const onlineUsers = Array.isArray(gameState?.getUniqueUsers?.())
    ? gameState.getUniqueUsers()
    : [];

  const onlineByLower = new Map();
  onlineUsers.forEach((name) => {
    const pseudo = String(name || "").trim();
    if (!pseudo) return;
    onlineByLower.set(pseudo.toLowerCase(), pseudo);
  });

  const seen = new Set();
  const out = [];

  const addPseudo = (raw) => {
    const pseudo = String(raw || "").trim();
    if (!pseudo) return;
    const lower = pseudo.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    out.push({
      pseudo,
      online: onlineByLower.has(lower),
    });
  };

  const db = dbUsers.readAll ? dbUsers.readAll() : { users: [] };
  const allRegistered = Array.isArray(db?.users) ? db.users : [];
  allRegistered.forEach((entry) => addPseudo(entry?.pseudo));

  out.sort((a, b) =>
    a.pseudo.localeCompare(b.pseudo, "fr", { sensitivity: "base" }),
  );
  return out;
}

function broadcastSiteMoneyStats(io) {
  if (!io) return;
  io.emit("economy:siteMoneyStats", getSiteMoneyStatsPayload());
}

// ------- Games -------
let gameActuelle = new UnoGame();
let p4Game = new Puissance4Game();
let motusGame = new MotusGame();
let blackjackGame = new BlackjackGame();
let mashGame = null; // Will be initialized with broadcastSystemMessage wrapper
let pixelWarGame = new PixelWarGame(FileService);
pixelWarGame.startAutoSave();
try {
  migrateWalletsFromClicks(FileService);
} catch (e) {}

function getRuntimeGames() {
  return {
    blackjackGame,
    mashGame,
  };
}

// ------- Colors -------
const orange = "\x1b[38;5;208m"; // pseudos
const reset = "\x1b[0m";
const blue = "\x1b[38;5;33m"; // Dino
const green = "\x1b[38;5;46m"; // Clicker
const pink = "\x1b[38;5;205m"; // Flappy
const violet = "\x1b[38;5;141m"; // UNO
const red = "\x1b[38;5;167m"; // P4
const colorize = (s, color) => `${color}${s}${reset}`;
const withGame = (s, color) => `${color}${s}${reset}`;

const colors = { orange, reset, blue, green, pink, violet, red };

// ------- LB manager -------
const leaderboardManager = {
  _throttleTimers: new Map(),
  scheduleThrottledBroadcast(key, delayMs, emitter) {
    if (this._throttleTimers.has(key)) return;
    const timer = setTimeout(
      () => {
        this._throttleTimers.delete(key);
        try {
          emitter();
        } catch (e) {}
      },
      Math.max(50, Math.floor(Number(delayMs) || 200)),
    );
    this._throttleTimers.set(key, timer);
    if (typeof timer.unref === "function") timer.unref();
  },
  broadcastClickerLB(io) {
    const peakMap = FileService.data.clickerHumanPeakCps || {};
    const wallets = FileService.data.wallets || {};
    const arr = Object.entries(FileService.data.clicks)
      .map(([pseudo, score]) => ({
        pseudo,
        score: Number(score) || 0,
        peakHumanCps: Number(peakMap[pseudo]) || 0,
        money:
          wallets[pseudo] && Number(wallets[pseudo].money)
            ? Number(wallets[pseudo].money)
            : 0,
        tokens:
          wallets[pseudo] && Number(wallets[pseudo].tokens)
            ? Number(wallets[pseudo].tokens)
            : 0,
      }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("economie:leaderboard", arr);
  },
  broadcastClickerLBThrottled(io, delayMs = 300) {
    this.scheduleThrottledBroadcast("economie:leaderboard", delayMs, () => {
      this.broadcastClickerLB(io);
    });
  },
  broadcastDinoLB(io) {
    const arr = Object.entries(FileService.data.dinoScores)
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("dino:leaderboard", arr);
  },
  broadcastDinoLBThrottled(io, delayMs = 200) {
    this.scheduleThrottledBroadcast("dino:leaderboard", delayMs, () => {
      this.broadcastDinoLB(io);
    });
  },
  broadcastFlappyLB(io) {
    const arr = Object.entries(FileService.data.flappyScores)
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("flappy:leaderboard", arr);
  },
  broadcastFlappyLBThrottled(io, delayMs = 200) {
    this.scheduleThrottledBroadcast("flappy:leaderboard", delayMs, () => {
      this.broadcastFlappyLB(io);
    });
  },
  broadcastUnoLB(io) {
    const arr = Object.entries(FileService.data.unoWins)
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
    io.emit("uno:leaderboard", arr);
  },
  broadcastP4LB(io) {
    const arr = Object.entries(FileService.data.p4Wins)
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
    io.emit("p4:leaderboard", arr);
  },
  broadcastMotusLB(io) {
    const totalWords = Number(motusGame.getWordListLength()) || 0;
    const arr = Object.entries(FileService.data.motusScores || {})
      .map(([u, s]) => ({
        pseudo: u,
        words: s.words || 0,
        tries: s.tries || 0,
        totalWords,
      }))
      .sort(
        (a, b) =>
          b.words - a.words ||
          a.tries - b.tries ||
          a.pseudo.localeCompare(b.pseudo),
      );
    io.emit("motus:leaderboard", arr);
  },
  broadcastMashLB(io) {
    const arr = Object.entries(FileService.data.mashWins || {})
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
    io.emit("mash:leaderboard", arr);
  },
  broadcast2048LB(io) {
    const arr = Object.entries(FileService.data.scores2048 || {})
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("2048:leaderboard", arr);
  },
  broadcastBlockBlastLB(io) {
    const arr = Object.entries(FileService.data.blockblastScores || {})
      .map(([u, s]) => ({
        pseudo: u,
        score: s,
        timeMs: FileService.data.blockblastBestTimes
          ? FileService.data.blockblastBestTimes[u] || null
          : null,
      }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("blockblast:leaderboard", arr);
  },
  broadcastSnakeLB(io) {
    const arr = Object.entries(FileService.data.snakeScores || {})
      .map(([u, s]) => ({
        pseudo: u,
        score: s,
        timeMs: FileService.data.snakeBestTimes
          ? FileService.data.snakeBestTimes[u] || null
          : null,
      }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("snake:leaderboard", arr);
  },
  broadcastSnakeLBThrottled(io, delayMs = 200) {
    this.scheduleThrottledBroadcast("snake:leaderboard", delayMs, () => {
      this.broadcastSnakeLB(io);
    });
  },
  broadcastBlackjackLB(io) {
    const data = FileService.data.blackjackStats || {};
    const arr = Object.entries(data)
      .map(([u, s]) => ({
        pseudo: u,
        handsPlayed: s.handsPlayed || 0,
        handsWon: s.handsWon || 0,
        handsLost: s.handsLost || 0,
        biggestBet: s.biggestBet || 0,
        doubles: s.doubles || 0,
        bjs: s.bjs || 0,
      }))
      .sort(
        (a, b) =>
          b.handsWon - a.handsWon ||
          b.biggestBet - a.biggestBet ||
          a.pseudo.localeCompare(b.pseudo),
      );
    io.emit("blackjack:leaderboard", arr);
  },
  broadcastCoinflipLB(io) {
    const data = FileService.data.coinflipStats || {};
    const arr = Object.entries(data)
      .map(([u, s]) => ({
        pseudo: u,
        gamesPlayed: s.gamesPlayed || 0,
        wins: s.wins || 0,
        losses: s.losses || 0,
        biggestBet: s.biggestBet || 0,
        biggestLoss: s.biggestLoss || 0,
        allIns: s.allIns || 0,
      }))
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.biggestBet - a.biggestBet ||
          a.pseudo.localeCompare(b.pseudo),
      );
    io.emit("coinflip:leaderboard", arr);
  },
  broadcastRouletteLB(io) {
    const data = FileService.data.rouletteStats || {};
    const arr = Object.entries(data)
      .map(([u, s]) => ({
        pseudo: u,
        gamesPlayed: s.gamesPlayed || 0,
        wins: s.wins || 0,
        losses: s.losses || 0,
        biggestBet: s.biggestBet || 0,
        biggestWin: s.biggestWin || 0,
      }))
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.biggestWin - a.biggestWin ||
          a.pseudo.localeCompare(b.pseudo),
      );
    io.emit("roulette:leaderboard", arr);
  },
  broadcastSlotsLB(io) {
    const data = FileService.data.slotsStats || {};
    const arr = Object.entries(data)
      .map(([u, s]) => ({
        pseudo: u,
        gamesPlayed: s.gamesPlayed || 0,
        wins: s.wins || 0,
        losses: s.losses || 0,
        biggestBet: s.biggestBet || 0,
        biggestWin: s.biggestWin || 0,
      }))
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.biggestWin - a.biggestWin ||
          a.pseudo.localeCompare(b.pseudo),
      );
    io.emit("slots:leaderboard", arr);
  },
  broadcastSudokuLB(io) {
    const data = FileService.data.sudokuScores || {};

    const readCompletedCount = (rawValue) => {
      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        return Math.max(0, Math.floor(rawValue));
      }

      if (typeof rawValue === "string") {
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
      }

      if (rawValue && typeof rawValue === "object") {
        const parsed = Number(rawValue.completed);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
      }

      return 0;
    };

    const arr = Object.entries(data)
      .map(([u, s]) => ({ pseudo: u, completed: readCompletedCount(s) }))
      .sort(
        (a, b) => b.completed - a.completed || a.pseudo.localeCompare(b.pseudo),
      );
    io.emit("sudoku:leaderboard", arr);
  },
  broadcastSubwayLB(io) {
    const arr = Object.entries(FileService.data.subwayScores || {})
      .map(([u, s]) => ({ pseudo: u, score: Number(s) || 0 }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("subway:leaderboard", arr);
  },
  broadcastAimTrainerLB(io, selectedDuration = "30", targetSocket = null) {
    const src = FileService.data.aimTrainerScores || {};
    const isPerDuration =
      src && typeof src === "object" && (src["15"] || src["30"] || src["60"]);

    const byDuration = {
      15: isPerDuration ? src["15"] || {} : {},
      30: isPerDuration ? src["30"] || {} : src,
      60: isPerDuration ? src["60"] || {} : {},
    };

    const toRows = (bucket) =>
      Object.entries(bucket || {})
        .map(([u, s]) => ({ pseudo: u, score: Number(s) || 0 }))
        .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));

    const leaderboards = {
      15: toRows(byDuration["15"]),
      30: toRows(byDuration["30"]),
      60: toRows(byDuration["60"]),
    };

    const duration =
      String(selectedDuration) === "15" ||
      String(selectedDuration) === "30" ||
      String(selectedDuration) === "60"
        ? String(selectedDuration)
        : "30";

    const payload = {
      duration,
      items: leaderboards[duration],
      leaderboards,
    };

    if (targetSocket && typeof targetSocket.emit === "function") {
      targetSocket.emit("aim:leaderboard", payload);
      return;
    }

    io.emit("aim:leaderboard", payload);
  },
};

// ------- Handler Socket -------
function initSocketHandlers(io, socket, gameState) {
  ensureBlackjackGameConfigured({
    io,
    blackjackGame,
    FileService,
    recalculateMedals,
    leaderboardManager,
  });

  const user = socket.handshake.session?.user;
  if (!user || !user.pseudo) {
    return;
  }

  const pseudo = user.pseudo;

  if (isPseudoBlacklisted(pseudo)) {
    try {
      socket.emit("system:notification", {
        message: "🚫 Votre pseudo a été banni",
        duration: 8000,
      });
    } catch (e) {}
    try {
      socket.disconnect(true);
    } catch (e) {}
    return;
  }

  // Permet au shutdown manager (et autres) d'identifier le joueur via socket.data
  try {
    if (!socket.data) socket.data = {};
    socket.data.pseudo = pseudo;
  } catch (e) {}

  // Reprise Flappy / Dino après relance (snapshot au moment d'un shutdown admin)
  try {
    const resume = FileService.data.runnerResume || {};
    const entry = resume[pseudo];
    if (entry && entry.at) {
      const at = Date.parse(entry.at);
      // TTL: 1h (évite de garder des reprises éternellement)
      if (Number.isFinite(at) && Date.now() - at <= 60 * 60 * 1000) {
        if (entry.dino != null)
          socket.emit("dino:resume", { score: entry.dino });
        if (entry.flappy != null)
          socket.emit("flappy:resume", { score: entry.flappy });
        if (entry.snake != null)
          socket.emit("snake:resume", { score: entry.snake });
        if (entry.subway != null)
          socket.emit("subway:resume", { score: entry.subway });
        if (entry["2048"] != null)
          socket.emit("2048:resume", { score: entry["2048"] });
        if (entry.blockblast != null)
          socket.emit("blockblast:resume", { score: entry.blockblast });
      } else {
        delete resume[pseudo];
        FileService.save("runnerResume", resume);
      }
    }
  } catch (e) {}
  socket.join("user:" + pseudo);

  function getNormalizedMedalsFor(pseudo) {
    const rawUserMedals =
      (FileService.data.medals && FileService.data.medals[pseudo]) || [];
    const normalized = rawUserMedals.map((m) =>
      typeof m === "string"
        ? { name: m, colors: [] }
        : { name: m.name, colors: Array.isArray(m.colors) ? m.colors : [] },
    );

    // Forcer la médaille Tricheur si l'utilisateur est dans la liste.
    if (
      FileService.data.cheaters &&
      FileService.data.cheaters.includes(pseudo) &&
      !normalized.find((m) => m.name === "Tricheur")
    ) {
      normalized.unshift({
        name: "Tricheur",
        colors: ["#dcdcdc", "#ffffff", "#222", "#dcdcdc", "#ffffff", "#222"],
      });
    }

    return normalized;
  }

  // Joindre la room admin si Admin ou Moderateur
  if (pseudo === "Admin" || pseudo === "Moderateur") {
    try {
      socket.join("admins");
      // Envoyer l'historique récent des logs au nouvel admin connecté
      if (io._serverLogBuffer && Array.isArray(io._serverLogBuffer)) {
        socket.emit("server:log:init", io._serverLogBuffer);
      }
    } catch {}
  }

  const sessionId =
    socket.handshake.sessionID || socket.handshake.session?.id || null;
  gameState.addUser(socket.id, pseudo, io, sessionId);

  const emitUsersPresence = () => {
    io.emit("users:list", gameState.getUniqueUsers());
    io.emit("users:presence", getUsersPresencePayload(gameState));
  };

  socket.on("users:presence:get", () => {
    socket.emit("users:presence", getUsersPresencePayload(gameState));
  });

  if (pseudo !== "Admin") {
    if (config.LOG_SOCKET_EVENTS) {
      console.log(`>> [${colorize(pseudo, orange)}] connecté`);
    }
  }

  // Envoi dada initiales
  socket.emit("you:name", pseudo);
  try {
    applyAutoBadges({ pseudo, FileService });
  } catch {}

  const getSelectedBadgesForChat = (p) => {
    try {
      const badgesData = FileService.data.chatBadges || {
        catalog: {},
        users: {},
      };
      const userBucket = (badgesData.users && badgesData.users[p]) || null;
      const selectedIds = Array.isArray(userBucket && userBucket.selected)
        ? userBucket.selected.slice(0, 5)
        : [];
      const out = [];
      for (const id of selectedIds) {
        const def = badgesData.catalog ? badgesData.catalog[id] : null;
        if (!def) continue;
        out.push({
          id,
          emoji: String(def.emoji || "🏷️"),
          name: String(def.name || id),
        });
      }
      return out;
    } catch {
      return [];
    }
  };

  const getTagPayloadForChat = (p) => {
    try {
      const tagData = FileService.data.tags ? FileService.data.tags[p] : null;
      if (!tagData) return null;
      if (typeof tagData === "string") return { text: tagData, color: null };
      if (typeof tagData === "object") return tagData;
      return null;
    } catch {
      return null;
    }
  };

  const getDmHistoryFor = (p) => {
    const list = Array.isArray(FileService.data.dms)
      ? FileService.data.dms
      : [];
    const relevant = list
      .filter(
        (dm) =>
          dm &&
          typeof dm === "object" &&
          (dm.from === p || dm.to === p) &&
          // Éviter doublons: si c'est un MP reçu non livré, il sera envoyé par flushPendingDms
          !(dm.to === p && dm.delivered === false),
      )
      .slice(-120);

    // Tri chronologique (best-effort)
    relevant.sort((a, b) => {
      const ta = Date.parse(a.at || "") || 0;
      const tb = Date.parse(b.at || "") || 0;
      return ta - tb;
    });

    return relevant.map((dm) => {
      const from = dm.from;
      return {
        id: dm.id,
        from: dm.from,
        to: dm.to,
        text: dm.text,
        at: dm.at,
        tag: getTagPayloadForChat(from),
        pfp:
          FileService && typeof FileService.getPfpUrl === "function"
            ? FileService.getPfpUrl(from)
            : "/Public/imgs/defaultProfile.png",
        badges: getSelectedBadgesForChat(from),
      };
    });
  };

  socket.emit(
    "chat:history",
    (FileService.data.historique || []).map((m) => {
      if (!m || typeof m !== "object") return m;
      if (m.pfp) return m;
      const author = m.name;
      if (FileService && typeof FileService.getPfpUrl === "function") {
        return { ...m, pfp: FileService.getPfpUrl(author) };
      }
      return { ...m, pfp: "/Public/imgs/defaultProfile.png" };
    }),
  );
  socket.emit("chat:dm:history", getDmHistoryFor(pseudo));
  socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] || 0 });
  try {
    const { getWallet } = require("./services/wallet");
    socket.emit(
      "economy:wallet",
      getWallet(FileService, pseudo, FileService.data.clicks[pseudo] || 0),
    );
  } catch (e) {}
  socket.emit("economy:siteMoneyStats", getSiteMoneyStatsPayload());

  // Resync à la demande (utile si le client a raté un event init)
  socket.on("chat:sync", () => {
    socket.emit(
      "chat:history",
      (FileService.data.historique || []).map((m) => {
        if (!m || typeof m !== "object") return m;
        if (m.pfp) return m;
        const author = m.name;
        if (FileService && typeof FileService.getPfpUrl === "function") {
          return { ...m, pfp: FileService.getPfpUrl(author) };
        }
        return { ...m, pfp: "/Public/imgs/defaultProfile.png" };
      }),
    );
    socket.emit("chat:dm:history", getDmHistoryFor(pseudo));
  });

  socket.on("clicker:sync", () => {
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] || 0 });
    socket.emit("clicker:medals", getNormalizedMedalsFor(pseudo));

    // Bonus CPS auto ajouté par l'admin (distinct du CPS des médailles)
    try {
      const u = dbUsers.findBypseudo ? dbUsers.findBypseudo(pseudo) : null;
      const raw = u && u.adminAutoCps != null ? u.adminAutoCps : 0;
      const val = Number.isFinite(Number(raw))
        ? Math.max(0, Math.floor(Number(raw)))
        : 0;
      socket.emit("clicker:adminAutoCps", { value: val });
    } catch (e) {
      socket.emit("clicker:adminAutoCps", { value: 0 });
    }

    try {
      const {
        getUserUpgrades,
        getUpgradePayload,
      } = require("./sockets/handlers/clicker");
      getUserUpgrades(FileService, pseudo);
      socket.emit("clicker:upgrades", getUpgradePayload(FileService, pseudo));
    } catch (e) {}
  });

  socket.on("economy:siteMoneyStats:get", () => {
    socket.emit("economy:siteMoneyStats", getSiteMoneyStatsPayload());
  });

  // Init Mash Key
  const dbUser = dbUsers.findBypseudo(pseudo);
  const mashKey = dbUser && dbUser.mashKey ? dbUser.mashKey : "k";
  socket.emit("mash:init_key", mashKey);

  // Envoyer couleur tag actuelle
  const currentTagData = FileService.data.tags
    ? FileService.data.tags[pseudo]
    : null;
  let currentTagColor = "#ff0000";
  if (
    currentTagData &&
    typeof currentTagData === "object" &&
    currentTagData.color
  ) {
    currentTagColor = currentTagData.color;
  }
  socket.emit("user:tagColor", { color: currentTagColor });

  // Envoyer couleur UI sauvegardée
  const savedUiColor =
    FileService.data.uis && FileService.data.uis[pseudo]
      ? FileService.data.uis[pseudo]
      : null;
  if (savedUiColor) {
    socket.emit("ui:color", { color: savedUiColor });
  }

  // --- Socket handler modules (extraits de ce fichier) ---
  const { getMotusState: getMotusStateForChat } = createMotusHelpers({
    FileService,
    motusGame,
  });

  registerCoinflipHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    getIpFromSocket,
    recalculateMedals,
  });

  registerUserHandlers({
    io,
    socket,
    pseudo,
    FileService,
    dbUsers,
    gameState,
    leaderboardManager,
    getIpFromSocket,
    recalculateMedals,
  });

  registerChatHandlers({
    io,
    socket,
    pseudo,
    FileService,
    dbUsers,
    getMotusState: getMotusStateForChat,
  });

  registerClickerHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    getIpFromSocket,
    persistBanIp,
    persistBanPseudo,
    recalculateMedals,
    broadcastSystemMessage,
    applyAutoBadges,
    withGame,
    colors,
  });

  registerDinoFlappyHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    broadcastSystemMessage,
    withGame,
    colors,
  });

  registerReviveHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    recalculateMedals,
    withGame,
    colors,
  });

  const unoHooks = registerUnoHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    UnoGame,
    getUnoGame: () => gameActuelle,
    setUnoGame: (g) => (gameActuelle = g),
    withGame,
    colors,
  });

  const p4Hooks = registerPuissance4Handlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    Puissance4Game,
    getP4Game: () => p4Game,
    setP4Game: (g) => (p4Game = g),
    withGame,
    colors,
  });

  registerBlockblastHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    recalculateMedals,
    broadcastSystemMessage,
    withGame,
    colors,
    config,
  });

  const rawUserMedalsInit = FileService.data.medals[pseudo] || [];
  const normalizedInit = rawUserMedalsInit.map((m) =>
    typeof m === "string"
      ? { name: m, colors: [] }
      : { name: m.name, colors: Array.isArray(m.colors) ? m.colors : [] },
  );

  // Si le joueur est dans la liste des tricheurs, on force l'ajout de la médaille Tricheur
  if (
    FileService.data.cheaters &&
    FileService.data.cheaters.includes(pseudo) &&
    !normalizedInit.find((m) => m.name === "Tricheur")
  ) {
    normalizedInit.unshift({
      name: "Tricheur",
      colors: ["#dcdcdc", "#ffffff", "#222", "#dcdcdc", "#ffffff", "#222"],
    });
  }

  socket.emit("clicker:medals", normalizedInit);
  leaderboardManager.broadcastClickerLB(io);
  leaderboardManager.broadcastDinoLB(io);
  leaderboardManager.broadcastFlappyLB(io);
  leaderboardManager.broadcastUnoLB(io);
  leaderboardManager.broadcastP4LB(io);
  leaderboardManager.broadcastBlockBlastLB(io);
  leaderboardManager.broadcastSnakeLB(io);
  leaderboardManager.broadcastMotusLB(io);
  leaderboardManager.broadcastMashLB(io);
  leaderboardManager.broadcast2048LB(io);
  leaderboardManager.broadcastBlackjackLB(io);
  leaderboardManager.broadcastCoinflipLB(io);
  leaderboardManager.broadcastRouletteLB(io);
  leaderboardManager.broadcastSlotsLB(io);
  leaderboardManager.broadcastSudokuLB(io);
  leaderboardManager.broadcastSubwayLB(io);
  leaderboardManager.broadcastAimTrainerLB(io);

  emitUsersPresence();

  // ------- Snake (module) -------
  registerSnakeHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    broadcastSystemMessage,
    withGame,
    colors,
  });

  registerAdminHandlers({
    io,
    socket,
    pseudo,
    FileService,
    dbUsers,
    config,
    getIpFromSocket,
    broadcastSystemMessage,
    leaderboardManager,
    gameState,
    pixelWarGame,
  });

  registerMotusHandlers({
    io,
    socket,
    pseudo,
    FileService,
    motusGame,
    leaderboardManager,
  });

  registerSudokuHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
  });

  registerAimTrainerHandlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
  });

  // ------- Blackjack (module) -------
  registerBlackjackHandlers({
    io,
    socket,
    pseudo,
    FileService,
    recalculateMedals,
    blackjackGame,
  });

  // ------- 2048 (module) -------
  register2048Handlers({
    io,
    socket,
    pseudo,
    FileService,
    leaderboardManager,
    withGame,
    colors,
  });

  // ------- Log off -------
  // ------- Mash Game (module) -------
  registerMashHandlers({
    io,
    socket,
    pseudo,
    FileService,
    dbUsers,
    getMashGame: () => mashGame,
    setMashGame: (game) => {
      mashGame = game;
    },
  });

  registerPixelWarHandlers({
    io,
    socket,
    pseudo,
    FileService,
    pixelWarGame,
    leaderboardManager,
  });

  socket.on("disconnect", () => {
    // Permet la reprise après un refresh / fermeture onglet (best-effort)
    persistRunnerResumeFromSocket(socket, pseudo);

    const fullyDisconnected = gameState.removeUser(socket.id, pseudo);

    if (fullyDisconnected && pseudo !== "Admin") {
      // io.emit("system:info", `${pseudo} a quitté le chat`);
      if (config.LOG_SOCKET_EVENTS) {
        console.log(`>> [${colorize(pseudo, orange)}] déconnecté`);
      }
    }

    emitUsersPresence();

    if (fullyDisconnected) {
      // UNO / PUISSANCE 4 (externalisés)
      try {
        unoHooks?.onDisconnect?.();
      } catch {}
      try {
        p4Hooks?.onDisconnect?.();
      } catch {}

      // BLACKJACK
      if (blackjackGame) {
        const wasPlayer = blackjackGame.removePlayer(pseudo);
        const wasSpectator = blackjackGame.removeSpectator(pseudo);

        if (wasPlayer || wasSpectator) {
          io.emit("blackjack:state", blackjackGame.getState());
        }
      }

      // MASH
      if (mashGame) {
        mashGame.leave(socket, pseudo);
      }
    }
  });
}

module.exports = {
  initSocketHandlers,
  leaderboardManager,
  motusGame,
  pixelWarGame,
  getRuntimeGames,
  broadcastSiteMoneyStats,
};
