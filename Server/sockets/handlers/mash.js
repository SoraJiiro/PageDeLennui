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
  let mashGame = typeof getMashGame === "function" ? getMashGame() : null;

  if (!mashGame) {
    mashGame = new MashGame((msg) => {}); // broadcastSystemMessage(io, msg));
    if (typeof setMashGame === "function") {
      setMashGame(mashGame);
    }
  }

  if (mashGame && !mashGame.emitState) {
    mashGame.setEmitter((state) => io.emit("mash:state", state));
    mashGame.setPayoutCallback((winnerPseudo, score) => {
      io.to("user:" + winnerPseudo).emit("clicker:you", { score });
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

  socket.on("mash:bet", (data) => {
    try {
      const betOn = data?.betOn;
      const amount = Number(data?.amount);

      if (mashGame.gameState !== "betting") {
        socket.emit("mash:betError", "Les paris ne sont pas ouverts.");
        return;
      }

      if (typeof betOn !== "string" || betOn.length === 0) {
        socket.emit("mash:betError", "Cible du pari invalide.");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        socket.emit("mash:betError", "Mise invalide.");
        return;
      }

      const userClicks = FileService.data.clicks[pseudo] || 0;
      if (userClicks < amount) {
        socket.emit("mash:betError", "Pas assez de clicks.");
        return;
      }

      const maxBet = Math.floor(userClicks * 0.25);
      if (amount > maxBet) {
        socket.emit(
          "mash:betError",
          `Mise trop élevée. Max: ${maxBet.toLocaleString("fr-FR")}`,
        );
        return;
      }

      const targetIsPlayer = Array.isArray(mashGame.players)
        ? mashGame.players.some((p) => p.pseudo === betOn)
        : false;
      if (!targetIsPlayer) {
        socket.emit("mash:betError", "Joueur ciblé introuvable.");
        return;
      }

      if (
        Array.isArray(mashGame.bets) &&
        mashGame.bets.some((b) => b.pseudo === pseudo)
      ) {
        socket.emit("mash:betError", "Tu as déjà parié pour cette manche.");
        return;
      }

      const ok = mashGame.placeBet(pseudo, betOn, amount);
      if (!ok) {
        socket.emit("mash:betError", "Impossible de placer la mise.");
        return;
      }

      const clicks = FileService.data.clicks[pseudo] || 0;
      socket.emit("clicker:you", { score: clicks });
      socket.emit("mash:betSuccess", {
        betOn,
        amount,
        clicks,
      });
    } catch (e) {
      socket.emit("mash:betError", "Erreur serveur lors du pari.");
    }
  });

  socket.on("mash:key", (key) => {
    if (typeof key === "string" && key.length === 1) {
      mashGame.setMashKey(pseudo, key);
      dbUsers.updateUserMashKey(pseudo, key);
    }
  });

  socket.on("mash:mash", (key) => {
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
