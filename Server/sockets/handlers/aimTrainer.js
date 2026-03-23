function registerAimTrainerHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  const {
    recordGameScoreContribution,
    getGameScoreMultiplier,
  } = require("../../services/guerreClans");
  const AIM_SCORE_MAX = 50000;
  const AIM_MISSES_MAX = 20000;

  const normalizeDuration = (raw) => {
    const n = Number.parseInt(String(raw || "30"), 10);
    if (n === 15 || n === 30 || n === 60) return String(n);
    return "30";
  };

  const ensureDurationScores = () => {
    const src = FileService.data.aimTrainerScores;
    const next = { 15: {}, 30: {}, 60: {} };

    let changed = false;
    if (src && typeof src === "object") {
      const hasBuckets =
        typeof src["15"] === "object" ||
        typeof src["30"] === "object" ||
        typeof src["60"] === "object";

      if (hasBuckets) {
        ["15", "30", "60"].forEach((key) => {
          const bucket = src[key];
          if (!bucket || typeof bucket !== "object") return;
          Object.entries(bucket).forEach(([user, score]) => {
            const safe = Math.max(0, Math.floor(Number(score) || 0));
            next[key][user] = safe;
          });
        });
      } else {
        Object.entries(src).forEach(([user, score]) => {
          const safe = Math.max(0, Math.floor(Number(score) || 0));
          next["30"][user] = safe;
        });
        changed = true;
      }
    } else {
      changed = true;
    }

    if (
      !src ||
      typeof src !== "object" ||
      !src["15"] ||
      !src["30"] ||
      !src["60"]
    ) {
      changed = true;
    }

    FileService.data.aimTrainerScores = next;
    if (changed) {
      FileService.save("aimTrainerScores", FileService.data.aimTrainerScores);
    }
    return FileService.data.aimTrainerScores;
  };

  socket.on("aim:submit", (payload = {}) => {
    const raw = payload && typeof payload === "object" ? payload.score : 0;
    const score = Math.floor(Number(raw) || 0);
    const misses = Math.floor(Number(payload?.misses) || 0);
    const duration = normalizeDuration(payload?.duration);
    if (!Number.isFinite(score) || score < 0 || score > AIM_SCORE_MAX) return;
    if (!Number.isFinite(misses) || misses < 0 || misses > AIM_MISSES_MAX)
      return;

    recordGameScoreContribution({
      FileService,
      io,
      pseudo,
      game: `aim_${duration}`,
      score,
      multiplier: getGameScoreMultiplier(`aim_${duration}`),
    });

    const durationScores = ensureDurationScores();
    if (!FileService.data.aimTrainerStats)
      FileService.data.aimTrainerStats = {};

    const current = Math.floor(Number(durationScores[duration][pseudo]) || 0);
    if (score > current) {
      FileService.data.aimTrainerScores[duration][pseudo] = score;
      FileService.save("aimTrainerScores", FileService.data.aimTrainerScores);
    }

    const shots = Math.max(0, score + misses);
    const accuracy = shots > 0 ? (score / shots) * 100 : 0;

    const prev =
      FileService.data.aimTrainerStats[pseudo] &&
      typeof FileService.data.aimTrainerStats[pseudo] === "object"
        ? FileService.data.aimTrainerStats[pseudo]
        : {};

    const games = Math.max(0, Math.floor(Number(prev.games) || 0)) + 1;
    const totalHits =
      Math.max(0, Math.floor(Number(prev.totalHits) || 0)) + score;
    const totalMisses =
      Math.max(0, Math.floor(Number(prev.totalMisses) || 0)) + misses;
    const totalShots = totalHits + totalMisses;
    const avgAccuracy = totalShots > 0 ? (totalHits / totalShots) * 100 : 0;
    const bestAccuracy = Math.max(
      0,
      Number.isFinite(Number(prev.bestAccuracy))
        ? Number(prev.bestAccuracy)
        : 0,
      accuracy,
    );
    const bestRatio =
      Number.isFinite(Number(prev.bestAccuracy)) &&
      Number(prev.bestAccuracy) >= accuracy &&
      typeof prev.bestRatio === "string" &&
      prev.bestRatio.includes(":")
        ? prev.bestRatio
        : `${score}:${misses}`;
    const avgRatio = `${totalHits}:${totalMisses}`;

    FileService.data.aimTrainerStats[pseudo] = {
      games,
      totalHits,
      totalMisses,
      avgAccuracy,
      bestAccuracy,
      avgRatio,
      bestRatio,
      lastHits: score,
      lastMisses: misses,
      lastAccuracy: accuracy,
      lastRatio: `${score}:${misses}`,
      updatedAt: new Date().toISOString(),
    };
    FileService.save("aimTrainerStats", FileService.data.aimTrainerStats);

    if (leaderboardManager?.broadcastAimTrainerLB) {
      leaderboardManager.broadcastAimTrainerLB(io, duration);
    }
  });

  socket.on("aim:requestLeaderboard", (payload = {}) => {
    const duration = normalizeDuration(payload?.duration);
    ensureDurationScores();
    if (leaderboardManager?.broadcastAimTrainerLB) {
      leaderboardManager.broadcastAimTrainerLB(io, duration, socket);
    }
  });
}

module.exports = { registerAimTrainerHandlers };
