const fs = require("fs");
const path = require("path");
const config = require("../config");
const logger = require("../logger");
const { addMoney, spendMoney, getWallet } = require("./wallet");

const STORE_FILE = path.join(config.DATA, "clan_wars.json");
const CLANS = ["SLAM", "SISR"];
const TICK_MS = 4000;
let GAME_WAR_MULTIPLIERS = {
  dino: 2.25,
  flappy: 715,
  snake: 715,
  subway: 1.65,
  blockblast: 6.75,
  2048: 6.75,
  aim_15: 725,
  aim_30: 717.5,
  aim_60: 700,
};

// Clan-specific temporary boosts: { SLAM: { multiplier: Number, expiresAt: msEpoch }, SISR: {...} }
let CLAN_BOOSTS = {
  SLAM: { multiplier: 1, expiresAt: null },
  SISR: { multiplier: 1, expiresAt: null },
};

function setGameWarMultiplier(game, value) {
  if (!game || typeof value !== "number" || value <= 0) return false;
  GAME_WAR_MULTIPLIERS[game] = value;
  return true;
}

function setClanBoost(clan, multiplier, durationMs) {
  const c = String(clan || "").toUpperCase();
  if (!CLANS.includes(c)) return false;
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 0) return false;
  // If durationMs is provided and >0, set an expiry; otherwise make it persistent until cleared
  const d = Number(durationMs);
  const expiresAt =
    Number.isFinite(d) && d > 0
      ? Date.now() + Math.max(0, Math.floor(d))
      : null;
  CLAN_BOOSTS[c] = { multiplier: m, expiresAt };
  return true;
}

function getClanBoostMultiplier(clan) {
  const c = String(clan || "").toUpperCase();
  if (!CLANS.includes(c)) return 1;
  const entry = CLAN_BOOSTS[c] || { multiplier: 1, expiresAt: null };
  // persistent boost if expiresAt === null
  if (entry.expiresAt === null) return Number(entry.multiplier) || 1;
  if (
    !Number.isFinite(Number(entry.expiresAt)) ||
    Date.now() > Number(entry.expiresAt)
  )
    return 1;
  return Number(entry.multiplier) || 1;
}

function getAllGameWarMultipliers() {
  return { ...GAME_WAR_MULTIPLIERS };
}
function getAllClanBoosts() {
  // return copy with remaining durations in ms
  const out = {};
  for (const k of CLANS) {
    const e = CLAN_BOOSTS[k] || { multiplier: 1, expiresAt: 0 };
    let remaining = null;
    if (e.expiresAt === null) remaining = null;
    else remaining = Math.max(0, (Number(e.expiresAt) || 0) - Date.now());
    out[k] = { multiplier: Number(e.multiplier) || 1, remainingMs: remaining };
  }
  return out;
}

function clearClanBoost(clan) {
  const c = String(clan || "").toUpperCase();
  if (!CLANS.includes(c)) return false;
  CLAN_BOOSTS[c] = { multiplier: 1, expiresAt: null };
  return true;
}
const WINNER_BADGE_EMOJI = "✪";
const BETTING_WINDOW_MS = 10 * 60 * 1000;
const BET_MIN_AMOUNT = 2500;
const BET_MAX_RATIO = 0.83;
const BET_WIN_MULTIPLIER = 3.75;

let ticker = null;

function makeSystemChatPayload(text) {
  return {
    id: "sys-" + Date.now().toString(36) + Math.random().toString(36).substr(2),
    name: "Système",
    text: String(text || ""),
    at: new Date().toISOString(),
    tag: null,
    pfp: null,
    badges: [],
  };
}

function pushAnnouncement({ FileService, author, message, duration = 9000 }) {
  try {
    if (!Array.isArray(FileService.data.annonces))
      FileService.data.annonces = [];
    FileService.data.annonces.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      at: nowIso(),
      author: String(author || "Système"),
      message: String(message || ""),
      rawMessage: String(message || ""),
      withCountdown: false,
      duration: Math.max(1000, Math.floor(Number(duration) || 9000)),
    });
    if (FileService.data.annonces.length > 200) {
      FileService.data.annonces = FileService.data.annonces.slice(-200);
    }
    FileService.save("annonces", FileService.data.annonces);
  } catch (e) {}
}

function emitWarGlobalSignals({
  FileService,
  io,
  broadcastSystemMessage,
  author,
  message,
  notifDuration = 9000,
}) {
  const msg = String(message || "").trim();
  if (!msg) return;

  io.emit("system:notification", {
    message: msg,
    duration: Math.max(1000, Math.floor(Number(notifDuration) || 9000)),
  });

  pushAnnouncement({
    FileService,
    author: author || "Système",
    message: msg,
    duration: notifDuration,
  });

  const payload = makeSystemChatPayload(msg);
  try {
    if (!Array.isArray(FileService.data.historique))
      FileService.data.historique = [];
    FileService.data.historique.push(payload);
    if (FileService.data.historique.length > 200) {
      FileService.data.historique = FileService.data.historique.slice(-200);
    }
    FileService.save("historique", FileService.data.historique);
    FileService.appendLog(payload);
  } catch (e) {}

  io.emit("chat:message", payload);

  if (typeof broadcastSystemMessage === "function") {
    broadcastSystemMessage(io, msg, false);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function safeObj(v) {
  return v && typeof v === "object" ? v : {};
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      const initial = { activeWar: null, history: [] };
      fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return {
      activeWar: parsed && parsed.activeWar ? parsed.activeWar : null,
      history: Array.isArray(parsed && parsed.history) ? parsed.history : [],
    };
  } catch (e) {
    return { activeWar: null, history: [] };
  }
}

function writeStore(store) {
  const safe = {
    activeWar: store && store.activeWar ? store.activeWar : null,
    history: Array.isArray(store && store.history) ? store.history : [],
  };
  fs.writeFileSync(STORE_FILE, JSON.stringify(safe, null, 2), "utf8");
}

function normalizePseudo(pseudo) {
  return String(pseudo || "").trim();
}

function normalizeClan(clan) {
  const c = String(clan || "")
    .trim()
    .toUpperCase();
  return CLANS.includes(c) ? c : null;
}

function normalizeBadgeName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function makeBadgeIdFromName(name) {
  const base = normalizeBadgeName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 28);
  return `GW_${base || "winner"}`;
}

function hasBadge(userBucket, badgeId) {
  if (!userBucket || typeof userBucket !== "object") return false;
  const assigned = Array.isArray(userBucket.assigned)
    ? userBucket.assigned
    : [];
  const selected = Array.isArray(userBucket.selected)
    ? userBucket.selected
    : [];
  return assigned.includes(badgeId) || selected.includes(badgeId);
}

function getClanForPseudo(chatBadges, pseudo) {
  const users = safeObj(chatBadges && chatBadges.users);
  const bucket = users[pseudo];
  const hasSlam = hasBadge(bucket, "SLAM");
  const hasSisr = hasBadge(bucket, "SISR");
  if (hasSlam && !hasSisr) return "SLAM";
  if (hasSisr && !hasSlam) return "SISR";
  return null;
}

function addEntry(map, pseudo, value) {
  const p = normalizePseudo(pseudo);
  if (!p) return;
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  map[p] = (map[p] || 0) + Math.max(0, Math.floor(n)) * 1;
}

function addSimpleBucket(map, bucket) {
  const src = safeObj(bucket);
  for (const [pseudo, score] of Object.entries(src)) {
    addEntry(map, pseudo, score);
  }
}

function addStatBucket(map, bucket, key) {
  const src = safeObj(bucket);
  for (const [pseudo, stat] of Object.entries(src)) {
    const val = stat && typeof stat === "object" ? stat[key] : 0;
    addEntry(map, pseudo, val);
  }
}

function addMotusBucket(map, bucket) {
  const src = safeObj(bucket);
  for (const [pseudo, stat] of Object.entries(src)) {
    const words = stat && typeof stat === "object" ? stat.words : 0;
    addEntry(map, pseudo, words);
  }
}

function addSudokuBucket(map, bucket) {
  const src = safeObj(bucket);
  for (const [pseudo, stat] of Object.entries(src)) {
    let completed = 0;
    if (typeof stat === "number") completed = stat;
    else if (typeof stat === "string") completed = Number(stat) || 0;
    else if (stat && typeof stat === "object")
      completed = Number(stat.completed) || 0;
    addEntry(map, pseudo, completed);
  }
}

function addAimTrainerBucket(map, bucket) {
  const src = safeObj(bucket);
  const hasDurations =
    src && typeof src === "object" && (src["15"] || src["30"] || src["60"]);

  if (!hasDurations) {
    addSimpleBucket(map, src);
    return;
  }

  const maxByPseudo = {};
  ["15", "30", "60"].forEach((duration) => {
    const durationScores = safeObj(src[duration]);
    for (const [pseudo, score] of Object.entries(durationScores)) {
      const p = normalizePseudo(pseudo);
      const n = Number(score);
      if (!p || !Number.isFinite(n)) continue;
      const v = Math.max(0, Math.floor(n));
      if (maxByPseudo[p] == null || v > maxByPseudo[p]) {
        maxByPseudo[p] = v;
      }
    }
  });

  for (const [pseudo, best] of Object.entries(maxByPseudo)) {
    addEntry(map, pseudo, best);
  }
}

function addPixelWarBucket(map, bucket) {
  const src = safeObj(bucket);
  for (const [pseudo, stat] of Object.entries(src)) {
    const placed = stat && typeof stat === "object" ? stat.pixelsPlaced : 0;
    addEntry(map, pseudo, placed);
  }
}

function computeGlobalScoreByPseudo(FileService) {
  const out = {};
  const data = FileService && FileService.data ? FileService.data : {};

  // Tous les scores sauf clicks.json.
  addSimpleBucket(out, data.unoWins);
  addSimpleBucket(out, data.p4Wins);
  addSimpleBucket(out, data.mashWins);

  addMotusBucket(out, data.motusScores);
  addStatBucket(out, data.blackjackStats, "handsWon");
  addStatBucket(out, data.coinflipStats, "wins");
  addStatBucket(out, data.rouletteStats, "wins");
  addStatBucket(out, data.slotsStats, "wins");
  addSudokuBucket(out, data.sudokuScores);
  addPixelWarBucket(out, data.pixelWarUsers);

  return out;
}

function getActiveWarStore() {
  const store = readStore();
  if (!store.activeWar) return { store, activeWar: null };
  const activeWar = store.activeWar;
  if (
    !activeWar.runScoresByPseudo ||
    typeof activeWar.runScoresByPseudo !== "object"
  ) {
    activeWar.runScoresByPseudo = {};
  }
  if (
    !activeWar.runScoresByGame ||
    typeof activeWar.runScoresByGame !== "object"
  ) {
    activeWar.runScoresByGame = {};
  }
  if (!activeWar.bets || typeof activeWar.bets !== "object") {
    activeWar.bets = {};
  }
  if (!activeWar.betPools || typeof activeWar.betPools !== "object") {
    activeWar.betPools = { SLAM: 0, SISR: 0 };
  }
  if (!Number.isFinite(Number(activeWar.betPools.SLAM)))
    activeWar.betPools.SLAM = 0;
  if (!Number.isFinite(Number(activeWar.betPools.SISR)))
    activeWar.betPools.SISR = 0;
  if (!activeWar.betDeadlineAt) {
    const startMs = Date.parse(activeWar.startedAt || "") || Date.now();
    activeWar.betDeadlineAt = new Date(
      startMs + BETTING_WINDOW_MS,
    ).toISOString();
  }
  if (typeof activeWar.betPhaseClosedNotified !== "boolean") {
    activeWar.betPhaseClosedNotified = false;
  }
  return { store, activeWar };
}

function getGameScoreMultiplier(game) {
  const key = String(game || "").trim();
  if (!key) return WAR_SCORE_MULTIPLIER;
  return Math.max(1, Number(GAME_WAR_MULTIPLIERS[key]) || WAR_SCORE_MULTIPLIER);
}

function recordGameScoreContribution({
  FileService,
  io,
  pseudo,
  game,
  score,
  multiplier = null,
}) {
  const p = normalizePseudo(pseudo);
  if (!p) return false;

  const raw = Number(score);
  const requestedMultiplier = Number(multiplier);
  const defaultMultiplier = getGameScoreMultiplier(game);
  const m =
    Number.isFinite(requestedMultiplier) && requestedMultiplier > 0
      ? Math.max(1, requestedMultiplier)
      : defaultMultiplier;
  if (!Number.isFinite(raw) || raw <= 0) return false;

  const { store, activeWar } = getActiveWarStore();
  if (!activeWar) return false;

  const participants = safeObj(activeWar.participants);
  const participant = participants[p];
  if (!participant || !CLANS.includes(participant.clan)) return false;

  // Appliquer un éventuel boost de clan
  const clanBoost = getClanBoostMultiplier(participant.clan) || 1;
  // Appliquer d'abord le multiplicateur du jeu (ou demandé) au score brut,
  // puis appliquer le boost de clan sur le gain final (et non pas multiplier le multiplicateur).
  const baseGain = Math.ceil(raw * m);
  const gained = Math.ceil(baseGain * clanBoost);
  // Retirer 8% du résultat final (taxe/retrait)
  const withheld = Math.floor(gained * 0.08);
  const finalGained = Math.max(0, gained - withheld);
  activeWar.runScoresByPseudo[p] =
    Math.max(0, Math.floor(Number(activeWar.runScoresByPseudo[p]) || 0)) +
    finalGained;

  if (
    !activeWar.runScoresByGame[p] ||
    typeof activeWar.runScoresByGame[p] !== "object"
  ) {
    activeWar.runScoresByGame[p] = {};
  }
  const g = String(game || "unknown");
  activeWar.runScoresByGame[p][g] =
    Math.max(0, Math.floor(Number(activeWar.runScoresByGame[p][g]) || 0)) +
    finalGained;

  writeStore(store);

  if (io) {
    io.emit("clanwar:update", buildLiveState(FileService, activeWar));
  }

  return true;
}

function buildLiveState(FileService, activeWar) {
  const currentScores = computeGlobalScoreByPseudo(FileService);
  const chatBadges = safeObj(
    FileService && FileService.data && FileService.data.chatBadges,
  );
  const badgesCatalog = safeObj(chatBadges.catalog);
  const winnerBadge = safeObj(
    badgesCatalog[activeWar && activeWar.winnerBadgeId],
  );
  const participants = safeObj(activeWar && activeWar.participants);
  const clanScores = { SLAM: 0, SISR: 0 };
  const contributors = [];
  const runScoresByPseudo = safeObj(activeWar.runScoresByPseudo);

  for (const [pseudo, info] of Object.entries(participants)) {
    const clan = info && typeof info === "object" ? info.clan : null;
    if (!CLANS.includes(clan)) continue;
    const startScore = Number(info.startScore) || 0;
    const nowScore = Number(currentScores[pseudo]) || 0;
    const baseGain = Math.max(0, Math.floor(nowScore - startScore));
    const runGain = Math.max(
      0,
      Math.floor(Number(runScoresByPseudo[pseudo]) || 0),
    );
    const gain = baseGain + runGain;
    clanScores[clan] += gain;
    contributors.push({ pseudo, clan, gain });
  }

  contributors.sort(
    (a, b) => b.gain - a.gain || a.pseudo.localeCompare(b.pseudo),
  );

  const startMs = Date.parse(activeWar.startedAt || "") || Date.now();
  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - startMs);
  const betDeadlineMs =
    Date.parse(activeWar.betDeadlineAt || "") || startMs + BETTING_WINDOW_MS;
  const betRemainingMs = Math.max(0, betDeadlineMs - nowMs);
  const betPools = safeObj(activeWar.betPools);
  const bets = safeObj(activeWar.bets);

  return {
    id: activeWar.id,
    startedAt: activeWar.startedAt,
    startedBy: activeWar.startedBy,
    winnerBadgeName: activeWar.winnerBadgeName || null,
    winnerBadgeId: activeWar.winnerBadgeId || null,
    winnerBadgeEmoji: winnerBadge.emoji || WINNER_BADGE_EMOJI,
    elapsedMs,
    clanScores,
    contributors: contributors.slice(0, 50),
    participantCount: contributors.length,
    betting: {
      isOpen: betRemainingMs > 0,
      endsAt: new Date(betDeadlineMs).toISOString(),
      remainingMs: betRemainingMs,
      pools: {
        SLAM: Math.max(0, Math.floor(Number(betPools.SLAM) || 0)),
        SISR: Math.max(0, Math.floor(Number(betPools.SISR) || 0)),
      },
      totalBets: Object.keys(bets).length,
    },
  };
}

function getPublicState(FileService, pseudo) {
  const store = readStore();
  const active = store.activeWar
    ? buildLiveState(FileService, store.activeWar)
    : null;
  const normalizedPseudo = normalizePseudo(pseudo);
  const myBet =
    active && normalizedPseudo && store.activeWar && store.activeWar.bets
      ? store.activeWar.bets[normalizedPseudo] || null
      : null;
  return {
    activeWar: active,
    myBet,
    gameMultipliers: { ...GAME_WAR_MULTIPLIERS },
    history: (store.history || []).slice().reverse(),
  };
}

function placeBet({ FileService, io, pseudo, clan, amount }) {
  const p = normalizePseudo(pseudo);
  if (!p) return { ok: false, message: "Pseudo invalide." };

  const c = normalizeClan(clan);
  if (!c) return { ok: false, message: "Clan invalide." };

  const stake = Math.floor(Number(amount) || 0);
  if (!Number.isFinite(stake) || stake <= 0) {
    return { ok: false, message: "Montant invalide." };
  }

  const { store, activeWar } = getActiveWarStore();
  if (!activeWar) {
    return { ok: false, message: "Aucune guerre en cours." };
  }

  const nowMs = Date.now();
  const deadlineMs = Date.parse(activeWar.betDeadlineAt || "") || 0;
  if (deadlineMs > 0 && nowMs > deadlineMs) {
    return {
      ok: false,
      message: "La periode de paris (10 min) est terminee.",
    };
  }

  if (activeWar.bets[p]) {
    return {
      ok: false,
      message: "Tu as deja place un pari pour cette guerre.",
    };
  }

  const walletBefore = getWallet(
    FileService,
    p,
    Number(FileService.data.clicks?.[p]) || 0,
  );
  const currentMoney = Math.max(
    0,
    Math.floor(Number(walletBefore && walletBefore.money) || 0),
  );
  const maxStake = Math.floor(currentMoney * BET_MAX_RATIO);

  if (stake < BET_MIN_AMOUNT) {
    return {
      ok: false,
      message: `Mise minimale: ${BET_MIN_AMOUNT} monnaie.`,
      wallet: walletBefore,
    };
  }
  if (maxStake < BET_MIN_AMOUNT) {
    return {
      ok: false,
      message: `Tu dois avoir au moins ${Math.ceil(BET_MIN_AMOUNT / BET_MAX_RATIO)} monnaie pour miser (max 83%).`,
      wallet: walletBefore,
    };
  }
  if (stake > maxStake) {
    return {
      ok: false,
      message: `Mise max autorisee: ${maxStake} monnaie (83% de ton solde).`,
      wallet: walletBefore,
    };
  }

  const spent = spendMoney(
    FileService,
    p,
    stake,
    Number(FileService.data.clicks?.[p]) || 0,
  );
  if (!spent.ok) {
    return {
      ok: false,
      message: "Monnaie insuffisante.",
      wallet: spent.wallet,
    };
  }

  activeWar.bets[p] = {
    pseudo: p,
    clan: c,
    amount: stake,
    placedAt: nowIso(),
  };
  activeWar.betPools[c] =
    Math.max(0, Math.floor(Number(activeWar.betPools[c]) || 0)) + stake;

  logger.action(
    `[clanwar:bet] ${p} mise ${stake} sur ${c} (guerre:${activeWar.id})`,
  );

  writeStore(store);

  const live = buildLiveState(FileService, activeWar);
  if (io) {
    io.emit("clanwar:update", live);
    io.to("user:" + p).emit("economy:wallet", spent.wallet);
  }

  return {
    ok: true,
    state: live,
    myBet: activeWar.bets[p],
    wallet: spent.wallet,
  };
}

function settleBets({ FileService, io, activeWar, winnerClan }) {
  const bets = safeObj(activeWar && activeWar.bets);
  const pools = safeObj(activeWar && activeWar.betPools);
  const slamPool = Math.max(0, Math.floor(Number(pools.SLAM) || 0));
  const sisrPool = Math.max(0, Math.floor(Number(pools.SISR) || 0));
  const totalPool = slamPool + sisrPool;
  const entries = Object.values(bets).filter(
    (b) => b && typeof b === "object" && normalizePseudo(b.pseudo),
  );

  if (!entries.length) {
    return {
      totalStaked: totalPool,
      pools: { SLAM: slamPool, SISR: sisrPool },
      betsCount: 0,
      winnersCount: 0,
      totalPayout: 0,
    };
  }

  if (!winnerClan) {
    let refunded = 0;
    for (const bet of entries) {
      const amount = Math.max(0, Math.floor(Number(bet.amount) || 0));
      if (amount <= 0) continue;
      const pseudo = normalizePseudo(bet.pseudo);
      const wallet = addMoney(
        FileService,
        pseudo,
        amount,
        Number(FileService.data.clicks?.[pseudo]) || 0,
        "pari_rembourse_egalite",
      );
      refunded += amount;
      logger.action(
        `[clanwar:bet] remboursement egalite ${pseudo} +${amount} (guerre:${activeWar.id})`,
      );
      if (io) {
        io.to("user:" + pseudo).emit("economy:wallet", wallet);
        io.to("user:" + pseudo).emit("system:notification", {
          message: `Pari rembourse: +${amount} monnaie (egalite).`,
          duration: 8000,
        });
      }
    }
    return {
      totalStaked: totalPool,
      pools: { SLAM: slamPool, SISR: sisrPool },
      betsCount: entries.length,
      winnersCount: 0,
      totalPayout: refunded,
    };
  }

  const normalizedWinner = normalizeClan(winnerClan);
  const winnerBets = entries.filter(
    (b) => normalizeClan(b.clan) === normalizedWinner,
  );

  let totalPayout = 0;
  for (const bet of winnerBets) {
    const stake = Math.max(0, Math.floor(Number(bet.amount) || 0));
    if (stake <= 0) continue;
    const pseudo = normalizePseudo(bet.pseudo);
    const payout = Math.floor(stake * BET_WIN_MULTIPLIER);
    if (payout <= 0) continue;
    const wallet = addMoney(
      FileService,
      pseudo,
      payout,
      Number(FileService.data.clicks?.[pseudo]) || 0,
      "pari_gagne_x3_5",
    );
    totalPayout += payout;
    logger.action(
      `[clanwar:bet] gain ${pseudo} +${payout} (mise:${stake}, x${BET_WIN_MULTIPLIER}) (guerre:${activeWar.id})`,
    );
    if (io) {
      io.to("user:" + pseudo).emit("economy:wallet", wallet);
      io.to("user:" + pseudo).emit("system:notification", {
        message: `Pari gagne: +${payout} monnaie (${stake} x ${BET_WIN_MULTIPLIER}).`,
        duration: 9000,
      });
    }
  }

  for (const bet of entries) {
    if (normalizeClan(bet.clan) === normalizedWinner) continue;
    const pseudo = normalizePseudo(bet.pseudo);
    const lost = Math.max(0, Math.floor(Number(bet.amount) || 0));
    if (!pseudo || lost <= 0) continue;
    logger.action(
      `[clanwar:bet] perdu ${pseudo} -${lost} (mise sur ${bet.clan}, gagnant:${normalizedWinner}) (guerre:${activeWar.id})`,
    );
  }

  return {
    totalStaked: totalPool,
    pools: { SLAM: slamPool, SISR: sisrPool },
    betsCount: entries.length,
    winnersCount: winnerBets.length,
    totalPayout,
    payoutMultiplier: BET_WIN_MULTIPLIER,
  };
}

function ensureWarWinnerBadge(FileService, badgeName) {
  const name = normalizeBadgeName(badgeName);
  if (!name) {
    return { ok: false, message: "Nom du badge manquant." };
  }

  const badges = safeObj(FileService.data.chatBadges);
  if (!badges.catalog || typeof badges.catalog !== "object")
    badges.catalog = {};
  if (!badges.users || typeof badges.users !== "object") badges.users = {};

  let badgeId = makeBadgeIdFromName(name);
  if (badges.catalog[badgeId] && badges.catalog[badgeId].name !== name) {
    let i = 2;
    while (badges.catalog[`${badgeId}_${i}`]) i++;
    badgeId = `${badgeId}_${i}`;
  }

  badges.catalog[badgeId] = {
    emoji: WINNER_BADGE_EMOJI,
    name,
  };

  FileService.data.chatBadges = badges;
  FileService.save("chatBadges", badges);
  return { ok: true, badgeId, badgeName: name };
}

function startWar({
  FileService,
  io,
  startedBy,
  winnerBadgeName,
  broadcastSystemMessage,
}) {
  const store = readStore();
  if (store.activeWar) {
    return { ok: false, message: "Une guerre est deja en cours." };
  }

  const badge = ensureWarWinnerBadge(FileService, winnerBadgeName);
  if (!badge.ok) {
    return { ok: false, message: badge.message || "Badge invalide." };
  }

  const chatBadges = safeObj(FileService.data.chatBadges);
  const users = safeObj(chatBadges.users);
  const currentScores = computeGlobalScoreByPseudo(FileService);

  const participants = {};
  for (const pseudo of Object.keys(users)) {
    const clan = getClanForPseudo(chatBadges, pseudo);
    if (!clan) continue;
    participants[pseudo] = {
      clan,
      startScore: Number(currentScores[pseudo]) || 0,
    };
  }

  if (Object.keys(participants).length === 0) {
    return {
      ok: false,
      message: "Aucun participant avec badge SLAM ou SISR detecte.",
    };
  }

  const now = Date.now();
  store.activeWar = {
    id: `cw_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date(now).toISOString(),
    startedBy: String(startedBy || "Admin"),
    winnerBadgeId: badge.badgeId,
    winnerBadgeName: badge.badgeName,
    participants,
    runScoresByPseudo: {},
    runScoresByGame: {},
    betDeadlineAt: new Date(now + BETTING_WINDOW_MS).toISOString(),
    bets: {},
    betPools: { SLAM: 0, SISR: 0 },
    betPhaseClosedNotified: false,
  };
  writeStore(store);

  const payload = getPublicState(FileService);
  if (io) {
    io.emit("clanwar:update", payload.activeWar);
    io.emit("clanwar:history", payload.history.slice(0, 50));

    const warMsg = `⚔️ Guerre SLAM vs SISR commencee par ${String(startedBy || "Admin")} ! Les paris sont ouverts pendant 10 minutes.`;
    emitWarGlobalSignals({
      FileService,
      io,
      broadcastSystemMessage,
      author: String(startedBy || "Admin"),
      message: warMsg,
      notifDuration: 9000,
    });
  }

  return { ok: true, state: payload.activeWar };
}

function rewardWinners({ FileService, io, winnerClan, winnerBadgeId }) {
  if (!winnerClan || !CLANS.includes(winnerClan)) return [];
  if (!winnerBadgeId) return [];

  const {
    getUserUpgrades,
    getUpgradePayload,
  } = require("../sockets/handlers/clicker");

  const badgesData = safeObj(FileService.data.chatBadges);
  const users = safeObj(badgesData.users);

  if (!badgesData.catalog || typeof badgesData.catalog !== "object") {
    badgesData.catalog = {};
  }
  if (!badgesData.catalog[winnerBadgeId]) {
    badgesData.catalog[winnerBadgeId] = {
      emoji: WINNER_BADGE_EMOJI,
      name: "Gagnants",
    };
  }

  const rewarded = [];
  let badgesChanged = false;

  for (const pseudo of Object.keys(users)) {
    const clan = getClanForPseudo(badgesData, pseudo);
    if (clan !== winnerClan) continue;

    if (!users[pseudo] || typeof users[pseudo] !== "object") {
      users[pseudo] = { assigned: [], selected: [] };
      badgesChanged = true;
    }
    if (!Array.isArray(users[pseudo].assigned)) {
      users[pseudo].assigned = [];
      badgesChanged = true;
    }
    if (!users[pseudo].assigned.includes(winnerBadgeId)) {
      users[pseudo].assigned.push(winnerBadgeId);
      badgesChanged = true;
    }

    const wallet = addMoney(
      FileService,
      pseudo,
      12500,
      Number(FileService.data.clicks?.[pseudo]) || 0,
      "guerre_clans_recompense_victoire",
    );

    const upgrades = getUserUpgrades(FileService, pseudo);
    const payload = getUpgradePayload(FileService, pseudo);
    const catalog = Array.isArray(payload && payload.catalog)
      ? payload.catalog
      : [];
    for (const def of catalog) {
      if (!def || !def.id) continue;
      const cur = Math.max(0, Math.floor(Number(upgrades[def.id] || 0)));
      const maxLevel = Number.isFinite(Number(def.maxLevel))
        ? Math.max(1, Math.floor(Number(def.maxLevel)))
        : Number.MAX_SAFE_INTEGER;
      upgrades[def.id] = Math.min(maxLevel, cur + 1);
    }

    io.to("user:" + pseudo).emit("economy:wallet", wallet);
    io.to("user:" + pseudo).emit(
      "clicker:upgrades",
      getUpgradePayload(FileService, pseudo),
    );
    io.to("user:" + pseudo).emit("system:notification", {
      message: "🏆 Ton clan gagne la guerre ! Recompenses ajoutees.",
      duration: 9000,
    });

    rewarded.push(pseudo);
  }

  if (badgesChanged) {
    FileService.save("chatBadges", badgesData);
  }
  FileService.save("clickerUpgrades", FileService.data.clickerUpgrades || {});

  return rewarded;
}

function finishWar({
  FileService,
  io,
  endedBy,
  reason,
  broadcastSystemMessage,
}) {
  const store = readStore();
  const activeWar = store.activeWar;
  if (!activeWar) {
    return { ok: false, message: "Aucune guerre en cours." };
  }

  const live = buildLiveState(FileService, activeWar);
  let winnerClan = null;
  if (live.clanScores.SLAM > live.clanScores.SISR) winnerClan = "SLAM";
  if (live.clanScores.SISR > live.clanScores.SLAM) winnerClan = "SISR";

  const rewardedPseudos =
    winnerClan != null
      ? rewardWinners({
          FileService,
          io,
          winnerClan,
          winnerBadgeId: activeWar.winnerBadgeId,
        })
      : [];
  const betting = settleBets({ FileService, io, activeWar, winnerClan });

  const finishedAt = nowIso();
  const historyEntry = {
    id: activeWar.id,
    startedAt: activeWar.startedAt,
    endAt: finishedAt,
    endedBy: String(endedBy || "Admin"),
    reason: String(reason || "manual"),
    elapsedMinutes: Math.max(0, Math.floor((live.elapsedMs || 0) / 60000)),
    participantCount: live.participantCount,
    scores: live.clanScores,
    winnerClan: winnerClan || "DRAW",
    winnerBadgeId: activeWar.winnerBadgeId || null,
    winnerBadgeName: activeWar.winnerBadgeName || null,
    rewardedPseudos,
    betting,
    topContributors: live.contributors.slice(0, 10),
  };

  store.history = Array.isArray(store.history) ? store.history : [];
  store.history.push(historyEntry);
  if (store.history.length > 120) {
    store.history = store.history.slice(-120);
  }
  store.activeWar = null;
  writeStore(store);

  if (winnerClan) {
    const msg = `🏁 Guerre terminee ! ${winnerClan} gagne (${live.clanScores[winnerClan]} pts). Recompenses distribuees.`;
    if (typeof broadcastSystemMessage === "function") {
      broadcastSystemMessage(io, msg, true);
    } else {
      io.emit("system:notification", { message: msg, duration: 9000 });
    }
  } else {
    const msg = `🏁 Guerre terminee ! Egalite parfaite (${live.clanScores.SLAM} - ${live.clanScores.SISR}).`;
    if (typeof broadcastSystemMessage === "function") {
      broadcastSystemMessage(io, msg, true);
    } else {
      io.emit("system:notification", { message: msg, duration: 9000 });
    }
  }

  io.emit("clanwar:update", null);
  io.emit("clanwar:history:new", historyEntry);
  io.emit("clanwar:history", getPublicState(FileService).history.slice(0, 50));

  return { ok: true, historyEntry };
}

function tick({ FileService, io, broadcastSystemMessage }) {
  const { store, activeWar } = getActiveWarStore();
  if (!activeWar) return;

  const live = buildLiveState(FileService, activeWar);
  io.emit("clanwar:update", live);

  if (
    live &&
    live.betting &&
    live.betting.isOpen === false &&
    activeWar.betPhaseClosedNotified !== true
  ) {
    activeWar.betPhaseClosedNotified = true;
    writeStore(store);

    const betMsg = `⏳ La phase de paris de la guerre des clans est terminee. Les mises sont maintenant fermees.`;
    emitWarGlobalSignals({
      FileService,
      io,
      broadcastSystemMessage,
      author: "Système",
      message: betMsg,
      notifDuration: 9000,
    });
  }
}

function ensureTicker({ FileService, io, broadcastSystemMessage }) {
  if (ticker) return;
  ticker = setInterval(() => {
    try {
      tick({ FileService, io, broadcastSystemMessage });
    } catch (e) {
      console.warn("[clanwar] tick error", e);
    }
  }, TICK_MS);
  if (typeof ticker.unref === "function") ticker.unref();
}

module.exports = {
  getPublicState,
  startWar,
  finishWar,
  ensureTicker,
  recordGameScoreContribution,
  getGameScoreMultiplier,
  placeBet,
  setGameWarMultiplier,
  getAllGameWarMultipliers,
  setClanBoost,
  getAllClanBoosts,
  getClanBoostMultiplier,
  clearClanBoost,
};
