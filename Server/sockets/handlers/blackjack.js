function ensureBlackjackGameConfigured({
  io,
  blackjackGame,
  FileService,
  recalculateMedals,
  leaderboardManager,
}) {
  const {
    applyDailyProfitCap,
    getDailyProfitCapInfo,
  } = require("../../services/economy");

  // Init émetteur blackjack si non défini
  if (blackjackGame && !blackjackGame.emitState) {
    blackjackGame.setEmitter((state) => io.emit("blackjack:state", state));

    blackjackGame.setRoundEndCallback((roundStats) => {
      blackjackGame.joueurs.forEach((p) => {
        const totalPayout = p.bet + p.winnings;
        if (!FileService.data.clicks[p.pseudo])
          FileService.data.clicks[p.pseudo] = 0;

        if (totalPayout > 0) {
          // Décomposer: remboursement (non cap) + profit (cap)
          const refundPart = Math.min(p.bet, totalPayout);
          const profitPart = Math.max(0, totalPayout - refundPart);
          const capInfo = applyDailyProfitCap({
            FileService,
            pseudo: p.pseudo,
            profit: profitPart,
            currentClicks: FileService.data.clicks[p.pseudo],
          });

          const amountToAdd = refundPart + capInfo.allowedProfit;
          if (amountToAdd > 0) {
            FileService.data.clicks[p.pseudo] += amountToAdd;
            recalculateMedals(p.pseudo, FileService.data.clicks[p.pseudo], io);
          }

          // Informer le client du statut du cap quotidien
          try {
            const sock = io.sockets.sockets.get(p.socketId);
            if (sock) sock.emit("economy:profitCap", capInfo);
          } catch (e) {}
        } else {
          // Perte: si le quota est déjà atteint, rembourser la mise
          try {
            const capInfo = getDailyProfitCapInfo({
              FileService,
              pseudo: p.pseudo,
              currentClicks: FileService.data.clicks[p.pseudo],
            });
            if (capInfo && Number(capInfo.remaining) === 0) {
              FileService.data.clicks[p.pseudo] += p.bet;
              recalculateMedals(
                p.pseudo,
                FileService.data.clicks[p.pseudo],
                io,
              );
            }
            try {
              const sock = io.sockets.sockets.get(p.socketId);
              if (sock) sock.emit("economy:profitCap", capInfo);
            } catch (e) {}
          } catch (e) {}
        }
      });

      FileService.save("clicks", FileService.data.clicks);

      // Update Blackjack Stats
      if (roundStats && Array.isArray(roundStats)) {
        if (!FileService.data.blackjackStats)
          FileService.data.blackjackStats = {};

        roundStats.forEach((stat) => {
          const u = stat.pseudo;
          const updates = stat.statUpdates;
          if (!FileService.data.blackjackStats[u]) {
            FileService.data.blackjackStats[u] = {
              handsPlayed: 0,
              handsWon: 0,
              handsLost: 0,
              biggestBet: 0,
              doubles: 0,
              bjs: 0,
            };
          }
          const current = FileService.data.blackjackStats[u];
          current.handsPlayed =
            (current.handsPlayed || 0) + updates.handsPlayed;
          current.handsWon = (current.handsWon || 0) + updates.handsWon;
          current.handsLost = (current.handsLost || 0) + updates.handsLost;
          current.doubles = (current.doubles || 0) + updates.doubles;
          current.bjs = (current.bjs || 0) + updates.bjs;
          if (updates.biggestBet > (current.biggestBet || 0)) {
            current.biggestBet = updates.biggestBet;
          }
        });
        FileService.save("blackjackStats", FileService.data.blackjackStats);
        leaderboardManager.broadcastBlackjackLB(io);
      }

      // Update all players with new scores
      blackjackGame.joueurs.forEach((p) => {
        const socketId = p.socketId;
        if (io.sockets.sockets.get(socketId)) {
          io.sockets.sockets.get(socketId).emit("clicker:you", {
            score: FileService.data.clicks[p.pseudo],
          });
        }
      });

      leaderboardManager.broadcastClickerLB(io);
      io.emit("blackjack:state", blackjackGame.getState());
    });
  }
}

function registerBlackjackHandlers({
  io,
  socket,
  pseudo,
  FileService,
  recalculateMedals,
  blackjackGame,
}) {
  socket.on("blackjack:join", () => {
    const res = blackjackGame.addPlayer(pseudo, socket.id);
    if (!res.success) {
      if (res.reason === "alreadyIn") {
        // Déjà dedans, pas grave
      } else {
        // Autre erreur
      }
    } else {
      if (res.status === "queued") {
        socket.emit(
          "blackjack:error",
          `Table pleine ou partie en cours. Vous êtes en position ${res.position} dans la file d'attente.`,
        );
      }
    }
    io.emit("blackjack:state", blackjackGame.getState());
  });

  socket.on("blackjack:leave", () => {
    blackjackGame.removePlayer(pseudo);
    blackjackGame.removeSpectator(pseudo);
    io.emit("blackjack:state", blackjackGame.getState());
  });

  socket.on("blackjack:start", () => {
    if (blackjackGame.startBetting()) {
      io.emit("blackjack:state", blackjackGame.getState());
    }
  });

  socket.on("blackjack:bet", (amount) => {
    let bet = parseInt(amount);
    if (isNaN(bet) || bet <= 0) return;

    const currentClicks = FileService.data.clicks[pseudo] || 0;

    // Limite 50% de la richesse
    const maxBet = Math.floor(currentClicks * 0.5);
    if (bet > maxBet) {
      bet = maxBet;
    }

    if (bet <= 0) {
      socket.emit("blackjack:error", "Mise impossible (fonds insuffisants)");
      return;
    }

    /* Redondant avec le cap mais securité */
    if (currentClicks < bet) {
      socket.emit("blackjack:error", "Pas assez de clicks !");
      return;
    }

    if (blackjackGame.placeBet(pseudo, bet)) {
      // Deduct bet immediately
      FileService.data.clicks[pseudo] = currentClicks - bet;
      FileService.save("clicks", FileService.data.clicks);
      recalculateMedals(pseudo, FileService.data.clicks[pseudo], io);
      io.to("user:" + pseudo).emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });

      io.emit("blackjack:state", blackjackGame.getState());
    }
  });

  socket.on("blackjack:hit", () => {
    if (blackjackGame.hit(pseudo)) {
      io.emit("blackjack:state", blackjackGame.getState());
    }
  });

  socket.on("blackjack:stand", () => {
    if (blackjackGame.stand(pseudo)) {
      io.emit("blackjack:state", blackjackGame.getState());
    }
  });

  socket.on("blackjack:double", () => {
    const player = blackjackGame.joueurs.find((p) => p.pseudo === pseudo);
    if (!player) return;
    // On suppose que le client sait quelle main est active, le serveur gère activeHandIndex
    const hand = player.hands[player.activeHandIndex];
    if (!hand) return;

    const cost = hand.bet;
    const currentClicks = FileService.data.clicks[pseudo] || 0;

    if (currentClicks < cost) {
      socket.emit("blackjack:error", "Pas assez de clicks pour doubler !");
      return;
    }

    const res = blackjackGame.double(pseudo);
    if (res.success) {
      FileService.data.clicks[pseudo] = currentClicks - res.cost;
      FileService.save("clicks", FileService.data.clicks);
      recalculateMedals(pseudo, FileService.data.clicks[pseudo], io);
      io.to("user:" + pseudo).emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      io.emit("blackjack:state", blackjackGame.getState());
    }
  });

  socket.on("blackjack:split", () => {
    const player = blackjackGame.joueurs.find((p) => p.pseudo === pseudo);
    if (!player) return;
    const hand = player.hands[player.activeHandIndex];
    if (!hand) return;

    const cost = hand.bet;
    const currentClicks = FileService.data.clicks[pseudo] || 0;

    if (currentClicks < cost) {
      socket.emit("blackjack:error", "Pas assez de clicks pour spliter !");
      return;
    }

    const res = blackjackGame.split(pseudo);
    if (res.success) {
      FileService.data.clicks[pseudo] = currentClicks - res.cost;
      FileService.save("clicks", FileService.data.clicks);
      recalculateMedals(pseudo, FileService.data.clicks[pseudo], io);
      io.to("user:" + pseudo).emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      io.emit("blackjack:state", blackjackGame.getState());
    } else {
      if (res.reason === "max_splits") {
        socket.emit("blackjack:error", "Max splits atteints !");
      }
    }
  });
}

module.exports = { ensureBlackjackGameConfigured, registerBlackjackHandlers };
