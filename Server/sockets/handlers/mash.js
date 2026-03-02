const { MashGame } = require("../../moduleGetter");

function registerMashHandlers({
  io,
  socket,
  pseudo,
  FileService,
  dbUsers,
  getMashGame,
  setMashGame,
}) {
  const MASH_RATE_WINDOW_MS = 1000;
  const MASH_RATE_MAX_ACTIONS = 80;
  const MASH_RATE_MIN_INTERVAL_MS = 8;

  let mashGame = typeof getMashGame === "function" ? getMashGame() : null;

  if (!mashGame) {
    mashGame = new MashGame((msg) => {}); // broadcastSystemMessage(io, msg));
    if (typeof setMashGame === "function") {
      setMashGame(mashGame);
    }
  }

  if (mashGame && !mashGame.emitState) {
    mashGame.setEmitter((state) => io.emit("mash:state", state));
    mashGame.setPayoutCallback((winnerPseudo, score, extra = null) => {
      io.to("user:" + winnerPseudo).emit("clicker:you", { score });
      if (extra && extra.wallet) {
        io.to("user:" + winnerPseudo).emit("economy:wallet", extra.wallet);
      }
      if (extra && Number(extra.moneyGain || 0) > 0) {
        io.to("user:" + winnerPseudo).emit("economy:gameMoney", {
          game: extra.game || "mash",
          gained: Number(extra.moneyGain || 0),
          total: Number(extra.moneyGain || 0),
          final: extra.final === true,
        });
      }
    });
  }

  socket.on("mash:join", () => {
    mashGame.join(socket, pseudo);

    // Appliquer la touche Mash sauvegardée au moment de rejoindre.
    // Sans ça, MashGame.addPlayer() met mashKey="k" par défaut et le joueur
    // doit re-cliquer OK à chaque session, ce qui donne l'impression que le choix ne marche pas.
    try {
      const dbUser = dbUsers.findBypseudo(pseudo);
      const key =
        dbUser && typeof dbUser.mashKey === "string" ? dbUser.mashKey : null;
      if (key && key.length === 1) {
        mashGame.setMashKey(pseudo, key);
        mashGame.broadcastState();
      }
    } catch {}
  });

  socket.on("mash:leave", () => {
    mashGame.leave(socket, pseudo);
  });

  socket.on("mash:key", (key) => {
    if (typeof key === "string" && key.length === 1) {
      mashGame.setMashKey(pseudo, key);
      dbUsers.updateUserMashKey(pseudo, key);
    }
  });

  function isMashRateLimited() {
    try {
      if (!socket.data) socket.data = {};
      if (!socket.data.mashRate) {
        socket.data.mashRate = { timestamps: [], lastAt: 0 };
      }

      const now = Date.now();
      const bucket = socket.data.mashRate;

      if (
        Number.isFinite(bucket.lastAt) &&
        bucket.lastAt > 0 &&
        now - bucket.lastAt < MASH_RATE_MIN_INTERVAL_MS
      ) {
        return true;
      }

      bucket.timestamps = Array.isArray(bucket.timestamps)
        ? bucket.timestamps.filter((t) => now - t < MASH_RATE_WINDOW_MS)
        : [];

      if (bucket.timestamps.length >= MASH_RATE_MAX_ACTIONS) {
        bucket.lastAt = now;
        return true;
      }

      bucket.timestamps.push(now);
      bucket.lastAt = now;
      return false;
    } catch (e) {
      return false;
    }
  }

  socket.on("mash:mash", (key) => {
    if (isMashRateLimited()) return;
    if (typeof key !== "string" || key.length !== 1) return;
    mashGame.handleMash(pseudo, key);
  });

  // State & LB
  if (mashGame) socket.emit("mash:state", mashGame.getState());

  const mashLB = Object.entries(FileService.data.mashWins || {})
    .map(([u, w]) => ({ pseudo: u, wins: w }))
    .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
  socket.emit("mash:leaderboard", mashLB);
}

module.exports = { registerMashHandlers };
