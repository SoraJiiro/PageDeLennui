const { applyAutoBadges } = require("../../services/badgesAuto");

function trackBlackjackBet(pseudo, amount, FileService) {
  const bet = Number(amount) || 0;
  if (bet <= 0) return;
  if (!FileService.data.blackjackStats) FileService.data.blackjackStats = {};
  if (!FileService.data.blackjackStats[pseudo]) {
    FileService.data.blackjackStats[pseudo] = {
      handsPlayed: 0,
      handsWon: 0,
      handsLost: 0,
      biggestBet: 0,
      doubles: 0,
      bjs: 0,
      totalBet: 0,
    };
  }
  const stats = FileService.data.blackjackStats[pseudo];
  stats.totalBet = (stats.totalBet || 0) + bet;
  if (bet > (stats.biggestBet || 0)) stats.biggestBet = bet;
  FileService.save("blackjackStats", FileService.data.blackjackStats);
}

function ensureBlackjackGameConfigured({
  io,
  blackjackGame,
  FileService,
  recalculateMedals,
  leaderboardManager,
}) {
  const { addTokens, getWallet } = require("../../services/wallet");

  // Init émetteur blackjack si non défini
  if (blackjackGame && !blackjackGame.emitState) {
    blackjackGame.setEmitter((state) => io.emit("blackjack:state", state));

    blackjackGame.setRoundEndCallback((roundStats) => {
      blackjackGame.joueurs.forEach((p) => {
        const totalPayout = p.bet + p.winnings;
        if (totalPayout > 0) {
          addTokens(
            FileService,
            p.pseudo,
            totalPayout,
            FileService.data.clicks[p.pseudo] || 0,
          );
        }

        try {
          const sock = io.sockets.sockets.get(p.socketId);
          if (sock) {
            sock.emit(
              "economy:wallet",
              getWallet(
                FileService,
                p.pseudo,
                FileService.data.clicks[p.pseudo] || 0,
              ),
            );
          }
        } catch (e) {}

        try {
          FileService.appendLog({
            type: "BLACKJACK_RESULT",
            pseudo: p.pseudo,
            currency: "token",
            bet: p.bet,
            netChange: Number(p.winnings || 0),
            timestamp: new Date().toISOString(),
          });
        } catch {}
      });

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
          if (current.totalBet == null) current.totalBet = 0;
        });
        FileService.save("blackjackStats", FileService.data.blackjackStats);
        leaderboardManager.broadcastBlackjackLB(io);
      }

      // Update all players with new wallet
      blackjackGame.joueurs.forEach((p) => {
        const socketId = p.socketId;
        if (io.sockets.sockets.get(socketId)) {
          io.sockets.sockets
            .get(socketId)
            .emit(
              "economy:wallet",
              getWallet(
                FileService,
                p.pseudo,
                FileService.data.clicks[p.pseudo] || 0,
              ),
            );
        }
      });
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
  const {
    getWallet,
    spendTokens,
    canSpendTokens,
  } = require("../../services/wallet");

  function emitWalletFor(p) {
    io.to("user:" + p).emit(
      "economy:wallet",
      getWallet(FileService, p, FileService.data.clicks[p] || 0),
    );
  }

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

    const hasFunds = canSpendTokens(
      FileService,
      pseudo,
      bet,
      FileService.data.clicks[pseudo] || 0,
    );
    if (!hasFunds) {
      socket.emit("blackjack:error", "Pas assez de tokens !");
      return;
    }

    if (blackjackGame.placeBet(pseudo, bet)) {
      spendTokens(
        FileService,
        pseudo,
        bet,
        FileService.data.clicks[pseudo] || 0,
      );
      trackBlackjackBet(pseudo, bet, FileService);
      try {
        applyAutoBadges({ pseudo, FileService });
      } catch {}
      emitWalletFor(pseudo);

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
    const hasFunds = canSpendTokens(
      FileService,
      pseudo,
      cost,
      FileService.data.clicks[pseudo] || 0,
    );
    if (!hasFunds) {
      socket.emit("blackjack:error", "Pas assez de tokens pour doubler !");
      return;
    }

    const res = blackjackGame.double(pseudo);
    if (res.success) {
      spendTokens(
        FileService,
        pseudo,
        res.cost,
        FileService.data.clicks[pseudo] || 0,
      );
      trackBlackjackBet(pseudo, res.cost, FileService);
      try {
        applyAutoBadges({ pseudo, FileService });
      } catch {}
      emitWalletFor(pseudo);
      io.emit("blackjack:state", blackjackGame.getState());
    }
  });

  socket.on("blackjack:split", () => {
    const player = blackjackGame.joueurs.find((p) => p.pseudo === pseudo);
    if (!player) return;
    const hand = player.hands[player.activeHandIndex];
    if (!hand) return;

    const cost = hand.bet;
    const hasFunds = canSpendTokens(
      FileService,
      pseudo,
      cost,
      FileService.data.clicks[pseudo] || 0,
    );
    if (!hasFunds) {
      socket.emit("blackjack:error", "Pas assez de tokens pour spliter !");
      return;
    }

    const res = blackjackGame.split(pseudo);
    if (res.success) {
      spendTokens(
        FileService,
        pseudo,
        res.cost,
        FileService.data.clicks[pseudo] || 0,
      );
      trackBlackjackBet(pseudo, res.cost, FileService);
      try {
        applyAutoBadges({ pseudo, FileService });
      } catch {}
      emitWalletFor(pseudo);
      io.emit("blackjack:state", blackjackGame.getState());
    } else {
      if (res.reason === "max_splits") {
        socket.emit("blackjack:error", "Max splits atteints !");
      }
    }
  });
}

module.exports = { ensureBlackjackGameConfigured, registerBlackjackHandlers };
