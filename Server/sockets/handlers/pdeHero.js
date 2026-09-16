function registerPdeHeroHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  const { applyAutoBadges } = require("../../services/badgesAuto");

  socket.on("pdehero:final", ({ score, duration, difficulty } = {}) => {
    const safeScore = Math.floor(Number(score));
    const safeDuration = Math.floor(Number(duration));
    const safeDifficulty = ["easy", "medium", "hard", "expert"].includes(
      difficulty,
    )
      ? difficulty
      : null;
    if (
      !Number.isFinite(safeScore) ||
      !Number.isFinite(safeDuration) ||
      !safeDifficulty ||
      safeScore < 0 ||
      safeDuration < 0 ||
      safeDuration > 3600
    )
      return;

    const maxScorePerSecond = { easy: 700, medium: 1200, hard: 2500, expert: 4375 };
    const maxPlausibleScore = safeDuration * maxScorePerSecond[safeDifficulty] + 1000;
    const verifiedScore = Math.min(safeScore, maxPlausibleScore);
    const scores = FileService.data.pdeHeroScores || {};
    const current =
      scores[pseudo] && typeof scores[pseudo] === "object"
        ? scores[pseudo]
        : {};
    const currentScores = current.scores && typeof current.scores === "object"
      ? current.scores
      : { hard: Number(current.bestScore) || 0 };
    scores[pseudo] = {
      scores: {
        easy: Math.max(Number(currentScores.easy) || 0, safeDifficulty === "easy" ? verifiedScore : 0),
        medium: Math.max(Number(currentScores.medium) || 0, safeDifficulty === "medium" ? verifiedScore : 0),
        hard: Math.max(Number(currentScores.hard) || 0, safeDifficulty === "hard" ? verifiedScore : 0),
        expert: Math.max(Number(currentScores.expert) || 0, safeDifficulty === "expert" ? verifiedScore : 0),
      },
      longestGame: Math.max(Number(current.longestGame) || 0, safeDuration),
    };
    FileService.data.pdeHeroScores = scores;
    FileService.save("pdeHeroScores", scores);
    applyAutoBadges({ pseudo, FileService });
    leaderboardManager.broadcastPdeHeroLB(io);
  });
}

module.exports = { registerPdeHeroHandlers };
