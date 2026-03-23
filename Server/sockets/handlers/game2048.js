function register2048Handlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  withGame,
  colors,
}) {
  const { updateReviveContextFromScore } = require("../../services/economy");
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");
  const {
    recordGameScoreContribution,
    getGameScoreMultiplier,
  } = require("../../services/guerreClans");
  const SCORE_2048_MAX = 2000000;
  const TILE_2048_MAX = 65536;

  function normalizeMaxTile(value) {
    const n = Math.floor(Number(value) || 0);
    if (!Number.isFinite(n) || n < 2) return 0;
    let p = 1;
    while (p * 2 <= n) p *= 2;
    return p;
  }

  function reward2048ByMaxTile(maxTile) {
    const newMax = normalizeMaxTile(maxTile);
    if (newMax < 2) return;

    if (!FileService.data.scores2048MaxTile)
      FileService.data.scores2048MaxTile = {};

    const prevMax = normalizeMaxTile(
      FileService.data.scores2048MaxTile[pseudo] || 0,
    );
    if (newMax <= prevMax) return;

    const prevPow = prevMax >= 2 ? Math.log2(prevMax) : 0;
    const newPow = Math.log2(newMax);
    const steps = Math.max(0, newPow - prevPow);
    const gain = steps * 5;

    FileService.data.scores2048MaxTile[pseudo] = newMax;
    FileService.save("scores2048MaxTile", FileService.data.scores2048MaxTile);

    if (gain <= 0) return;

    const wallet = addMoney(
      FileService,
      pseudo,
      gain,
      FileService.data.clicks[pseudo] || 0,
      "jeu:2048",
    );
    io.to("user:" + pseudo).emit("economy:wallet", wallet);
    io.to("user:" + pseudo).emit("economy:gameMoney", {
      game: "2048",
      gained: gain,
      total: gain,
      final: true,
      maxTile: newMax,
    });
    try {
      FileService.appendLog({
        type: "GAME_MONEY_REWARD",
        pseudo,
        game: "2048",
        gained: gain,
        total: gain,
        maxTile: newMax,
        at: new Date().toISOString(),
      });
    } catch {}
  }

  function setRunnerProgress(score) {
    const s = Math.floor(Number(score) || 0);
    if (!Number.isFinite(s) || s < 0) return;
    try {
      if (!socket.data) socket.data = {};
      if (!socket.data.runnerProgress) socket.data.runnerProgress = {};
      socket.data.runnerProgress["2048"] = s;
    } catch (e) {}
  }

  function consumeRunnerResume() {
    try {
      const resume = FileService.data.runnerResume;
      if (!resume || typeof resume !== "object") return;
      if (!resume[pseudo]) return;
      delete resume[pseudo]["2048"];
      const hasAny =
        resume[pseudo].dino != null ||
        resume[pseudo].flappy != null ||
        resume[pseudo].snake != null ||
        resume[pseudo].subway != null ||
        resume[pseudo]["2048"] != null ||
        resume[pseudo].blockblast != null;
      if (!hasAny) delete resume[pseudo];
      FileService.save("runnerResume", resume);
    } catch (e) {}
  }

  socket.on("2048:progress", ({ score }) => setRunnerProgress(score));
  socket.on("2048:resumeConsumed", () => consumeRunnerResume());

  socket.on("2048:submit_score", (payload) => {
    const asObject = payload && typeof payload === "object" ? payload : null;
    const s = Math.floor(Number(asObject ? asObject.score : payload));
    const maxTile = Math.floor(Number(asObject ? asObject.maxTile : 0));
    if (!Number.isFinite(s) || s < 0 || s > SCORE_2048_MAX) return;
    if (!Number.isFinite(maxTile) || maxTile < 0 || maxTile > TILE_2048_MAX)
      return;
    if (maxTile > 0 && s > 0 && maxTile > s * 2) return;

    updateReviveContextFromScore(socket, "2048", s);
    recordGameScoreContribution({
      FileService,
      io,
      pseudo,
      game: "2048",
      score: s,
      multiplier: getGameScoreMultiplier("2048"),
    });
    setRunnerProgress(s);

    if (!FileService.data.scores2048) FileService.data.scores2048 = {};
    const currentBest = FileService.data.scores2048[pseudo] || 0;

    if (s > currentBest) {
      FileService.data.scores2048[pseudo] = s;
      FileService.save("scores2048", FileService.data.scores2048);

      console.log(
        withGame(`[2048] Nouveau record pour ${pseudo} : ${s}`, colors.green),
      );

      socket.emit("2048:best_score", s);
    }

    reward2048ByMaxTile(maxTile);

    try {
      applyAutoBadges({ pseudo, FileService });
    } catch {}

    leaderboardManager.broadcast2048LB(io);
  });

  socket.on("2048:get_best_score", () => {
    const best =
      (FileService.data.scores2048 && FileService.data.scores2048[pseudo]) || 0;
    socket.emit("2048:best_score", best);
  });

  socket.on("2048:get_leaderboard", () => {
    leaderboardManager.broadcast2048LB(io);
  });

  // Send LB on connect (comportement historique)
  leaderboardManager.broadcast2048LB(io);
}

module.exports = { register2048Handlers };
