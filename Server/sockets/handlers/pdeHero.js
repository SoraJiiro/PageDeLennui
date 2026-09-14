function registerPdeHeroHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  const { applyAutoBadges } = require("../../services/badgesAuto");

  socket.on("pdehero:final", ({ score, duration, maxCombo } = {}) => {
    const safeScore = Math.floor(Number(score));
    const safeDuration = Math.floor(Number(duration));
    const safeMaxCombo = Number.isFinite(Number(maxCombo))
      ? Math.floor(Number(maxCombo))
      : 0;
    if (
      !Number.isFinite(safeScore) ||
      !Number.isFinite(safeDuration) ||
      !Number.isFinite(safeMaxCombo) ||
      safeScore < 0 ||
      safeDuration < 0 ||
      safeDuration > 3600 ||
      safeMaxCombo < 0
    )
      return;

    const maxPlausibleScore = safeDuration * 2500 + 1000;
    const verifiedScore = Math.min(safeScore, maxPlausibleScore);
    const scores = FileService.data.pdeHeroScores || {};
    const current =
      scores[pseudo] && typeof scores[pseudo] === "object"
        ? scores[pseudo]
        : {};
    scores[pseudo] = {
      bestScore: Math.max(Number(current.bestScore) || 0, verifiedScore),
      longestGame: Math.max(Number(current.longestGame) || 0, safeDuration),
      maxCombo: Math.max(Number(current.maxCombo) || 0, safeMaxCombo),
    };
    FileService.data.pdeHeroScores = scores;
    FileService.save("pdeHeroScores", scores);
    applyAutoBadges({ pseudo, FileService });
    leaderboardManager.broadcastPdeHeroLB(io);
  });
}

module.exports = { registerPdeHeroHandlers };
