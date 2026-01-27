const { MashGame } = require("../../moduleGetter");
const { getDailyProfitCapInfo } = require("../../services/economy");

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
      try {
        const capInfo = getDailyProfitCapInfo({
          FileService,
          pseudo: winnerPseudo,
          currentClicks: score,
        });
        io.to("user:" + winnerPseudo).emit("economy:profitCap", capInfo);
      } catch (e) {}
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
