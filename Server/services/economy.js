function getTodayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureDailyEarningsBucket(FileService) {
  if (
    !FileService.data.dailyEarnings ||
    typeof FileService.data.dailyEarnings !== "object"
  ) {
    FileService.data.dailyEarnings = {};
  }
  return FileService.data.dailyEarnings;
}

/**
 * Limite un profit (gain net) selon un cap quotidien = 25% des clicks "base" du jour.
 * - Le "baseClicks" est figé au premier gain du jour (snapshot).
 * - Ne cappe que les profits positifs; les remboursements de mise doivent rester hors cap.
 */
function applyDailyProfitCap({ FileService, pseudo, profit, currentClicks }) {
  const p = Number(profit);
  if (!pseudo || !Number.isFinite(p) || p <= 0) {
    return { allowedProfit: 0, capped: false, cap: 0, earned: 0, remaining: 0 };
  }

  const dailyEarnings = ensureDailyEarningsBucket(FileService);
  const today = getTodayKey();

  const existing = dailyEarnings[pseudo];
  if (!existing || existing.date !== today) {
    dailyEarnings[pseudo] = {
      date: today,
      earned: 0,
      baseClicks: Math.max(0, Math.floor(Number(currentClicks) || 0)),
    };
  }

  const bucket = dailyEarnings[pseudo];
  bucket.earned = Math.max(0, Math.floor(Number(bucket.earned) || 0));
  bucket.baseClicks = Math.max(0, Math.floor(Number(bucket.baseClicks) || 0));

  const cap = Math.floor(bucket.baseClicks * 0.25);
  const remaining = Math.max(0, cap - bucket.earned);

  const allowedProfit = Math.min(p, remaining);
  const capped = allowedProfit !== p;

  if (allowedProfit > 0) {
    bucket.earned += allowedProfit;
    FileService.save("dailyEarnings", dailyEarnings);
  } else {
    // Même si rien n'est ajouté, on persiste le reset journalier éventuel
    // (utile pour fixer baseClicks + date au 1er passage)
    if (!existing || existing.date !== today) {
      FileService.save("dailyEarnings", dailyEarnings);
    }
  }

  return {
    allowedProfit,
    capped,
    cap,
    earned: bucket.earned,
    remaining: Math.max(0, cap - bucket.earned),
  };
}

function getDailyProfitCapInfo({ FileService, pseudo, currentClicks }) {
  if (!pseudo) return { cap: 0, earned: 0, remaining: 0, baseClicks: 0 };

  const dailyEarnings = ensureDailyEarningsBucket(FileService);
  const today = getTodayKey();

  const existing = dailyEarnings[pseudo];
  if (!existing || existing.date !== today) {
    const baseClicks = Math.max(0, Math.floor(Number(currentClicks) || 0));
    const cap = Math.floor(baseClicks * 0.25);
    return { cap, earned: 0, remaining: cap, baseClicks, active: false };
  }

  const bucket = existing;
  bucket.earned = Math.max(0, Math.floor(Number(bucket.earned) || 0));
  bucket.baseClicks = Math.max(0, Math.floor(Number(bucket.baseClicks) || 0));

  const cap = Math.floor(bucket.baseClicks * 0.25);
  const remaining = Math.max(0, cap - bucket.earned);

  return {
    cap,
    earned: bucket.earned,
    remaining,
    baseClicks: bucket.baseClicks,
    active: true,
    date: bucket.date,
  };
}

function ensureReviveContext(socket) {
  if (!socket.data) socket.data = {};
  if (!socket.data.reviveContext) socket.data.reviveContext = {};
  return socket.data.reviveContext;
}

function updateReviveContextFromScore(socket, game, score) {
  const s = Number(score);
  if (!Number.isFinite(s) || s < 0) return;

  const ctxAll = ensureReviveContext(socket);
  const prev = ctxAll[game];

  // Si le score redescend, on considère que c'est une nouvelle run -> reset revivesUsed
  const isNewRun =
    prev && Number.isFinite(prev.lastScore) && s < prev.lastScore;

  ctxAll[game] = {
    lastScore: Math.floor(s),
    revivesUsed: isNewRun ? 0 : Math.max(0, Math.floor(prev?.revivesUsed || 0)),
    lastGameOverAt: Date.now(),
  };
}

const REVIVE_PRICING = {
  dino: { multiplier: 50, min: 5000, max: 5_000_000 },
  flappy: { multiplier: 1000, min: 5000, max: 5_000_000 },
  snake: { multiplier: 500, min: 5000, max: 5_000_000 },
  2048: { multiplier: 5, min: 5000, max: 5_000_000 },
  blockblast: { multiplier: 5, min: 5000, max: 5_000_000 },
};

function computeReviveCost(game, score, revivesUsed) {
  const s = Math.max(0, Math.floor(Number(score) || 0));
  const used = Math.max(0, Math.floor(Number(revivesUsed) || 0));

  const cfg = REVIVE_PRICING[game];
  if (!cfg) return null;

  const escalation = 1 + used * 0.75;
  let cost = Math.floor(s * cfg.multiplier * escalation);

  if (!Number.isFinite(cost) || cost < 0) cost = cfg.min;
  cost = Math.max(cfg.min, cost);
  cost = Math.min(cfg.max, cost);
  return cost;
}

function getReviveCostForSocket(socket, game) {
  const ctxAll = ensureReviveContext(socket);
  const ctx = ctxAll[game];
  if (!ctx || !Number.isFinite(ctx.lastScore)) return null;

  const used = Math.max(0, Math.floor(Number(ctx.revivesUsed) || 0));
  if (used >= 3) return { error: "Limite de réanimations atteinte." };

  const cost = computeReviveCost(game, ctx.lastScore, used);
  if (cost == null) return null;

  return { cost, used };
}

function incrementReviveUsed(socket, game) {
  const ctxAll = ensureReviveContext(socket);
  if (!ctxAll[game]) return;
  ctxAll[game].revivesUsed =
    Math.max(0, Math.floor(ctxAll[game].revivesUsed || 0)) + 1;
}

module.exports = {
  applyDailyProfitCap,
  updateReviveContextFromScore,
  getReviveCostForSocket,
  incrementReviveUsed,
  computeReviveCost,
  REVIVE_PRICING,
  getDailyProfitCapInfo,
};
