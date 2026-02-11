function registerCoinflipHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  getIpFromSocket,
  recalculateMedals,
}) {
  const { applyAutoBadges } = require("../../services/badgesAuto");
  const {
    applyDailyProfitCap,
    getDailyProfitCapInfo,
  } = require("../../services/economy");

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

    // Cap quotidien: on ne limite que le PROFIT (pas le remboursement de la mise)
    let profitAllowed = 0;
    let capInfo = null;
    if (won) {
      const profit = bet; // net profit d'un coinflip gagnant
      capInfo = applyDailyProfitCap({
        FileService,
        pseudo,
        profit,
        currentClicks,
      });
      profitAllowed = capInfo.allowedProfit;
    } else {
      // Fournir l'état courant du cap pour affichage client
      capInfo = getDailyProfitCapInfo({
        FileService,
        pseudo,
        currentClicks,
      });
    }

    if (won) {
      // Ajouter gains: remboursement mise + profit (cap)
      const credit = bet + profitAllowed;
      FileService.data.clicks[pseudo] += credit;
    }

    // Informer client du statut du cap quotidien (pour mise à jour sidebar)
    try {
      if (capInfo) io.to("user:" + pseudo).emit("economy:profitCap", capInfo);
    } catch (e) {}

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
        totalBet: 0,
      };
    }
    const stats = FileService.data.coinflipStats[pseudo];
    stats.gamesPlayed++;
    stats.totalBet = (stats.totalBet || 0) + bet;
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
    try {
      applyAutoBadges({ pseudo, FileService });
    } catch {}

    const ip = getIpFromSocket(socket);
    let netChange = 0;
    if (won) netChange = profitAllowed;
    else {
      try {
        if (capInfo && Number(capInfo.remaining) === 0) {
          // refund bet
          FileService.data.clicks[pseudo] += bet;
          netChange = 0;
        } else {
          netChange = -bet;
        }
      } catch (e) {
        netChange = -bet;
      }
    }
    const logDetails = {
      type: "BET_COINFLIP",
      pseudo: `${pseudo} (${ip})`,
      bet: bet,
      result: won ? "WIN" : "LOSS",
      netChange,
      timestamp: new Date().toISOString(),
    };
    console.log(
      `[PILE_OU_FACE] ${logDetails.pseudo} a parié ${bet} sur ${
        side === "heads" ? "PILE" : "FACE"
      } -> ${won ? "GAGNÉ" : "PERDU"} (${logDetails.netChange})`,
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
      capInfo,
    });

    // Mettre à jour affichage score client
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });

    // Diffuser mise à jour classement
    leaderboardManager.broadcastClickerLB(io);
  });
}

module.exports = { registerCoinflipHandlers };
