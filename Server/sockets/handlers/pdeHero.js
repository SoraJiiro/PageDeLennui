function registerPdeHeroHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
}) {
  const { applyAutoBadges } = require("../../services/badgesAuto");

  socket.on("pdehero:final", ({
    score,
    duration,
    difficulty,
    chartSpeed,
    hyperspeed,
    totalNotes,
    hits,
    misses,
    completed,
  } = {}) => {
    const safeScore = Math.floor(Number(score));
    const safeDuration = Math.floor(Number(duration));
    const safeChartSpeed = Number(chartSpeed);
    const safeHyperspeed = Number(hyperspeed);
    const safeTotalNotes = Math.floor(Number(totalNotes));
    const safeHits = Math.floor(Number(hits));
    const safeMisses = Math.floor(Number(misses));
    const safeDifficulty = ["easy", "medium", "hard", "expert"].includes(
      difficulty,
    )
      ? difficulty
      : null;
    if (
      !Number.isFinite(safeScore) ||
      !Number.isFinite(safeDuration) ||
      !Number.isFinite(safeChartSpeed) ||
      !Number.isFinite(safeHyperspeed) ||
      !Number.isSafeInteger(safeTotalNotes) ||
      !Number.isSafeInteger(safeHits) ||
      !Number.isSafeInteger(safeMisses) ||
      !safeDifficulty ||
      completed !== true ||
      safeScore < 0 ||
      safeDuration < 0 ||
      safeDuration > 3600 ||
      safeChartSpeed < 0.5 ||
      safeChartSpeed > 1 ||
      safeHyperspeed < 1 ||
      safeHyperspeed > 2.5 ||
      safeTotalNotes < 1 ||
      safeTotalNotes > 100000 ||
      safeHits < 0 ||
      safeMisses < 0 ||
      safeHits + safeMisses !== safeTotalNotes
    )
      return;

    const difficultyMultiplier = {
      easy: 0.25,
      medium: 0.5,
      hard: 1,
      expert: 1.75,
    }[safeDifficulty];
    const maxPointsPerHit = Math.ceil(
      400 * difficultyMultiplier * safeChartSpeed * safeHyperspeed,
    );
    const verifiedScore = Math.min(safeScore, safeHits * maxPointsPerHit);
    const scores = FileService.data.pdeHeroScores || {};
    const current =
      scores[pseudo] && typeof scores[pseudo] === "object"
        ? scores[pseudo]
        : {};
    const currentScores =
      current.scores && typeof current.scores === "object"
        ? current.scores
        : { hard: Number(current.bestScore) || 0 };
    scores[pseudo] = {
      ...current,
      scores: {
        easy: Math.max(
          Number(currentScores.easy) || 0,
          safeDifficulty === "easy" ? verifiedScore : 0,
        ),
        medium: Math.max(
          Number(currentScores.medium) || 0,
          safeDifficulty === "medium" ? verifiedScore : 0,
        ),
        hard: Math.max(
          Number(currentScores.hard) || 0,
          safeDifficulty === "hard" ? verifiedScore : 0,
        ),
        expert: Math.max(
          Number(currentScores.expert) || 0,
          safeDifficulty === "expert" ? verifiedScore : 0,
        ),
      },
      longestGame: Math.max(Number(current.longestGame) || 0, safeDuration),
      totalScore: Math.max(0, Number(current.totalScore) || 0) + verifiedScore,
    };
    FileService.data.pdeHeroScores = scores;
    FileService.save("pdeHeroScores", scores);
    applyAutoBadges({ pseudo, FileService });
    leaderboardManager.broadcastPdeHeroLB(io);
  });
}

module.exports = { registerPdeHeroHandlers };
