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
    getWallet,
    spendTokens,
    addTokens,
  } = require("../../services/wallet");
  const ROULETTE_RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
  ]);

  function emitWallet() {
    io.to("user:" + pseudo).emit(
      "economy:wallet",
      getWallet(FileService, pseudo, FileService.data.clicks[pseudo] || 0),
    );
  }

  function spendTokenBet(amount) {
    const bet = parseInt(amount);
    if (isNaN(bet) || bet <= 0) {
      return { ok: false, message: "Mise invalide" };
    }
    const spent = spendTokens(
      FileService,
      pseudo,
      bet,
      FileService.data.clicks[pseudo] || 0,
    );
    if (!spent.ok) {
      return { ok: false, message: "Pas assez de tokens !" };
    }
    emitWallet();
    return { ok: true, bet };
  }

  socket.on("coinflip:bet", (data) => {
    const { amount, side } = data;
    const parsed = spendTokenBet(amount);
    if (!parsed.ok) return socket.emit("coinflip:error", parsed.message);
    const bet = parsed.bet;

    if (side !== "heads" && side !== "tails") {
      socket.emit("coinflip:error", "Choix invalide");
      return;
    }

    // Logique pile ou face (50/50)
    const isHeads = Math.random() < 0.5;
    const resultSide = isHeads ? "heads" : "tails";
    const won = side === resultSide;
    if (won) {
      addTokens(
        FileService,
        pseudo,
        bet * 2,
        FileService.data.clicks[pseudo] || 0,
      );
      emitWallet();
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
    const walletNow = getWallet(
      FileService,
      pseudo,
      FileService.data.clicks[pseudo] || 0,
    );
    if (bet >= Math.max(1, Math.floor((walletNow.tokens || 0) + bet)))
      stats.allIns++;

    FileService.save("coinflipStats", FileService.data.coinflipStats);
    leaderboardManager.broadcastCoinflipLB(io);
    try {
      applyAutoBadges({ pseudo, FileService });
    } catch {}

    const ip = getIpFromSocket(socket);
    const netChange = won ? bet : -bet;
    const logDetails = {
      type: "BET_COINFLIP",
      pseudo: `${pseudo} (${ip})`,
      bet: bet,
      currency: "token",
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

    // Emettre résultat
    socket.emit("coinflip:result", {
      won: won,
      side: resultSide,
      newTokens: getWallet(
        FileService,
        pseudo,
        FileService.data.clicks[pseudo] || 0,
      ).tokens,
      amount: bet,
    });
  });

  socket.on("roulette:bet", ({ amount, color }) => {
    const allowedColors = ["red", "black", "green"];
    if (!allowedColors.includes(color)) {
      return socket.emit("roulette:error", "Couleur invalide");
    }
    const parsed = spendTokenBet(amount);
    if (!parsed.ok) return socket.emit("roulette:error", parsed.message);
    const bet = parsed.bet;

    const roll = Math.floor(Math.random() * 37);
    const isGreen = roll === 0;
    const isRed = !isGreen && ROULETTE_RED_NUMBERS.has(roll);
    const landed = isGreen ? "green" : isRed ? "red" : "black";

    let multiplier = 0;
    if (landed === color) {
      multiplier = landed === "green" ? 12 : 1.8;
    }
    const payout = Math.floor(bet * multiplier);
    if (payout > 0) {
      addTokens(
        FileService,
        pseudo,
        payout,
        FileService.data.clicks[pseudo] || 0,
      );
      emitWallet();
    }

    if (!FileService.data.rouletteStats) FileService.data.rouletteStats = {};
    if (!FileService.data.rouletteStats[pseudo]) {
      FileService.data.rouletteStats[pseudo] = {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        biggestBet: 0,
        biggestWin: 0,
        totalWon: 0,
        totalLost: 0,
        totalBet: 0,
      };
    }
    const rouletteStats = FileService.data.rouletteStats[pseudo];
    rouletteStats.gamesPlayed++;
    rouletteStats.totalBet = (rouletteStats.totalBet || 0) + bet;
    if (payout > 0) {
      rouletteStats.wins++;
      const net = Math.max(0, payout - bet);
      rouletteStats.totalWon = (rouletteStats.totalWon || 0) + net;
      if (net > (rouletteStats.biggestWin || 0)) rouletteStats.biggestWin = net;
    } else {
      rouletteStats.losses++;
      rouletteStats.totalLost = (rouletteStats.totalLost || 0) + bet;
    }
    if (bet > (rouletteStats.biggestBet || 0)) rouletteStats.biggestBet = bet;
    FileService.save("rouletteStats", FileService.data.rouletteStats);
    if (leaderboardManager?.broadcastRouletteLB) {
      leaderboardManager.broadcastRouletteLB(io);
    }
    try {
      applyAutoBadges({ pseudo, FileService });
    } catch {}

    FileService.appendLog({
      type: "BET_ROULETTE",
      pseudo: `${pseudo} (${getIpFromSocket(socket)})`,
      bet,
      currency: "token",
      pick: color,
      landed,
      multiplier,
      payout,
      result: payout > 0 ? "WIN" : "LOSS",
      netChange: payout > 0 ? payout - bet : -bet,
      timestamp: new Date().toISOString(),
    });

    if (payout > 0) {
      FileService.appendLog({
        type: "GAME_GAIN_ROULETTE",
        pseudo,
        bet,
        pick: color,
        landed,
        multiplier,
        payout,
        netGain: payout - bet,
        currency: "token",
        timestamp: new Date().toISOString(),
      });
    }

    socket.emit("roulette:result", {
      roll,
      landed,
      won: payout > 0,
      payout,
      amount: bet,
      tokens: getWallet(
        FileService,
        pseudo,
        FileService.data.clicks[pseudo] || 0,
      ).tokens,
    });
  });

  socket.on("slots:spin", ({ amount }) => {
    const parsed = spendTokenBet(amount);
    if (!parsed.ok) return socket.emit("slots:error", parsed.message);
    const bet = parsed.bet;

    const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
    const pick = () => symbols[Math.floor(Math.random() * symbols.length)];
    const reels = [pick(), pick(), pick()];

    let multiplier = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      multiplier = reels[0] === "7️⃣" ? 6 : 4;
    } else if (reels[0] === reels[1] && reels[1] !== reels[2]) {
      multiplier = 1.5;
    }

    const payout = Math.floor(bet * multiplier);
    if (payout > 0) {
      addTokens(
        FileService,
        pseudo,
        payout,
        FileService.data.clicks[pseudo] || 0,
      );
      emitWallet();
    }

    if (!FileService.data.slotsStats) FileService.data.slotsStats = {};
    if (!FileService.data.slotsStats[pseudo]) {
      FileService.data.slotsStats[pseudo] = {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        biggestBet: 0,
        biggestWin: 0,
        totalWon: 0,
        totalLost: 0,
        totalBet: 0,
      };
    }
    const slotsStats = FileService.data.slotsStats[pseudo];
    slotsStats.gamesPlayed++;
    slotsStats.totalBet = (slotsStats.totalBet || 0) + bet;
    if (payout > 0) {
      slotsStats.wins++;
      const net = Math.max(0, payout - bet);
      slotsStats.totalWon = (slotsStats.totalWon || 0) + net;
      if (net > (slotsStats.biggestWin || 0)) slotsStats.biggestWin = net;
    } else {
      slotsStats.losses++;
      slotsStats.totalLost = (slotsStats.totalLost || 0) + bet;
    }
    if (bet > (slotsStats.biggestBet || 0)) slotsStats.biggestBet = bet;
    FileService.save("slotsStats", FileService.data.slotsStats);
    if (leaderboardManager?.broadcastSlotsLB) {
      leaderboardManager.broadcastSlotsLB(io);
    }
    try {
      applyAutoBadges({ pseudo, FileService });
    } catch {}

    FileService.appendLog({
      type: "BET_SLOTS",
      pseudo: `${pseudo} (${getIpFromSocket(socket)})`,
      bet,
      currency: "token",
      reels,
      multiplier,
      payout,
      result: payout > 0 ? "WIN" : "LOSS",
      netChange: payout > 0 ? payout - bet : -bet,
      timestamp: new Date().toISOString(),
    });

    if (payout > 0) {
      FileService.appendLog({
        type: "GAME_GAIN_SLOTS",
        pseudo,
        bet,
        reels,
        multiplier,
        payout,
        netGain: payout - bet,
        currency: "token",
        timestamp: new Date().toISOString(),
      });
    }

    socket.emit("slots:result", {
      reels,
      won: payout > 0,
      payout,
      amount: bet,
      tokens: getWallet(
        FileService,
        pseudo,
        FileService.data.clicks[pseudo] || 0,
      ).tokens,
    });
  });
}

module.exports = { registerCoinflipHandlers };
