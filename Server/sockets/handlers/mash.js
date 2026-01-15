const MashGame = require("../../games/mashGame");

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
  });

  socket.on("mash:leave", () => {
    mashGame.leave(socket, pseudo);
  });

  socket.on("mash:bet", (data) => {
    mashGame.placeBet(pseudo, data.betOn, Number(data.amount));
    const clicks = FileService.data.clicks[pseudo] || 0;
    socket.emit("clicker:you", { score: clicks });
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
