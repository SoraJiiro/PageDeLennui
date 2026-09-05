function registerPdeHeroHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  socket.on("pdehero:final", ({ score, duration } = {}) => {
    const safeScore = Math.floor(Number(score));
    const safeDuration = Math.floor(Number(duration));
    if (
      !Number.isFinite(safeScore) ||
      !Number.isFinite(safeDuration) ||
      safeScore < 0 ||
      safeDuration < 0 ||
      safeDuration > 3600
    )
      return;

    // Le client joue en temps reel, mais le score reste borne par une cadence plausible.
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
    };
    FileService.data.pdeHeroScores = scores;
    FileService.save("pdeHeroScores", scores);
    leaderboardManager.broadcastPdeHeroLB(io);
  });
}

module.exports = { registerPdeHeroHandlers };
