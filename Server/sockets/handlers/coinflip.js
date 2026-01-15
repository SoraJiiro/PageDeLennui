function registerCoinflipHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  getIpFromSocket,
  recalculateMedals,
}) {
  socket.on("coinflip:bet", (data) => {
    const { amount, side } = data;
    const bet = parseInt(amount);

    if (isNaN(bet) || bet <= 0) {
      socket.emit("coinflip:error", "Mise invalide");
      return;
    }

    if (side !== "heads" && side !== "tails") {
      socket.emit("coinflip:error", "Choix invalide");
      return;
    }

    const currentClicks = FileService.data.clicks[pseudo] || 0;
    if (currentClicks < bet) {
      socket.emit("coinflip:error", "Pas assez de clicks !");
      return;
    }

    // Déduire mise immédiatement
    FileService.data.clicks[pseudo] = currentClicks - bet;

    // Logique pile ou face (50/50)
    const isHeads = Math.random() < 0.5;
    const resultSide = isHeads ? "heads" : "tails";
    const won = side === resultSide;
    const winnings = won ? bet * 2 : 0;

    if (won) {
      // Ajouter gains (mise * 2)
      FileService.data.clicks[pseudo] += winnings;
    }

    // Update Coin Flip Stats
    if (!FileService.data.coinflipStats) FileService.data.coinflipStats = {};
    if (!FileService.data.coinflipStats[pseudo]) {
      FileService.data.coinflipStats[pseudo] = {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        biggestBet: 0,
        biggestLoss: 0,
        allIns: 0,
      };
    }
    const stats = FileService.data.coinflipStats[pseudo];
    stats.gamesPlayed++;
    if (won) {
      stats.wins++;
    } else {
      stats.losses++;
      if (bet > stats.biggestLoss) stats.biggestLoss = bet;
    }
    if (bet > stats.biggestBet) stats.biggestBet = bet;
    if (bet >= Math.floor(currentClicks)) stats.allIns++;

    FileService.save("coinflipStats", FileService.data.coinflipStats);
    leaderboardManager.broadcastCoinflipLB(io);

    // Log transaction with IP
    const ip = getIpFromSocket(socket);
    const logDetails = {
      type: "BET_COINFLIP",
      pseudo: `${pseudo} (${ip})`,
      bet: bet,
      result: won ? "WIN" : "LOSS",
      netChange: won ? bet : -bet,
      timestamp: new Date().toISOString(),
    };
    console.log(
      `[PILE_OU_FACE] ${logDetails.pseudo} a parié ${bet} sur ${
        side === "heads" ? "PILE" : "FACE"
      } -> ${won ? "GAGNÉ" : "PERDU"} (${logDetails.netChange})`
    );
    FileService.appendLog(logDetails);

    FileService.save("clicks", FileService.data.clicks);
    recalculateMedals(pseudo, FileService.data.clicks[pseudo], io, true); // Silent recalc

    // Emettre résultat
    socket.emit("coinflip:result", {
      won: won,
      side: resultSide,
      newScore: FileService.data.clicks[pseudo],
      amount: bet,
    });

    // Mettre à jour affichage score client
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });

    // Diffuser mise à jour classement
    leaderboardManager.broadcastClickerLB(io);
  });
}

module.exports = { registerCoinflipHandlers };
