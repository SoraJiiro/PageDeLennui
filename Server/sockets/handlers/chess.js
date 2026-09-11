function registerChessHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  ChessGame,
  getChessGame,
  setChessGame,
}) {
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");
  function ensureGame() {
    if (!getChessGame()) setChessGame(new ChessGame());
    return getChessGame();
  }

  function refreshIds(game) {
    io.sockets.sockets.forEach((clientSocket) => {
      const username = clientSocket.handshake.session?.user?.pseudo;
      if (username) game.updateSocketId(username, clientSocket.id);
    });
  }

  function broadcastLobby() {
    const game = ensureGame();
    refreshIds(game);
    const lobby = game.getLobbyState();
    io.sockets.sockets.forEach((clientSocket) => {
      const username = clientSocket.handshake.session?.user?.pseudo;
      if (!username) return;
      clientSocket.emit("chess:lobby", {
        ...lobby,
        myUsername: username,
        estAuLobby: game.joueurs.some((player) => player.pseudo === username),
      });
    });
  }

  function broadcastGame(message = "") {
    const game = getChessGame();
    if (!game?.gameStarted) return;
    refreshIds(game);
    [...game.joueurs, ...game.spectators].forEach((entry) => {
      const clientSocket = io.sockets.sockets.get(entry.socketId);
      if (!clientSocket) return;
      const state = game.getState(entry.pseudo);
      if (message) state.message = message;
      clientSocket.emit("chess:update", state);
    });
  }

  function recordGame(game, winner) {
    const games = FileService.data.chessGames;
    const wins = FileService.data.chessWins;
    game.joueurs.forEach((player) => {
      games[player.pseudo] = (games[player.pseudo] || 0) + 1;
    });
    if (winner) wins[winner] = (wins[winner] || 0) + 1;
    FileService.save("chessGames", games);
    FileService.save("chessWins", wins);
    game.joueurs.forEach((player) => {
      applyAutoBadges({ pseudo: player.pseudo, FileService });
    });
    leaderboardManager.broadcastChessLB(io);
  }

  function emitGameEnd(game, result) {
    refreshIds(game);
    [...game.joueurs, ...game.spectators].forEach((entry) => {
      const entryResult = {
        ...result,
        gained: entry.pseudo === result.winner ? result.gained : 0,
      };
      io.sockets.sockets
        .get(entry.socketId)
        ?.emit("chess:gameEnd", entryResult);
    });
  }

  function rewardWinner(winner) {
    if (!winner) return 0;
    const wallet = addMoney(
      FileService,
      winner,
      175,
      FileService.data.clicks[winner] || 0,
      "jeu:echecs",
    );
    io.to("user:" + winner).emit("economy:wallet", wallet);
    io.to("user:" + winner).emit("economy:gameMoney", {
      game: "echecs",
      gained: 175,
      total: 175,
      final: true,
    });
    return 175;
  }

  function finishGame(game, { winner = null, draw = false, reason = "" } = {}) {
    if (!game || getChessGame() !== game) return;
    game.stopClock();
    recordGame(game, winner);
    const gained = rewardWinner(winner);
    emitGameEnd(game, { winner, draw, reason, gained });
    setChessGame(new ChessGame());
    broadcastLobby();
  }

  function cancelGame(game, leavingPseudo) {
    if (!game?.gameStarted) return false;

    game.stopClock();
    refreshIds(game);
    const reason = `${leavingPseudo} est parti`;
    [...game.joueurs, ...game.spectators].forEach((entry) => {
      io.sockets.sockets
        .get(entry.socketId)
        ?.emit("chess:gameEnd", { winner: "Partie annulée !", reason });
    });
    setChessGame(new ChessGame());
    return true;
  }

  function finishTimedGame(game) {
    if (!game || getChessGame() !== game || !game.winner) return;
    finishGame(game, { winner: game.winner, reason: "Temps écoulé" });
  }

  socket.on("chess:getState", () => {
    const game = ensureGame();
    refreshIds(game);
    socket.emit("chess:lobby", {
      ...game.getLobbyState(),
      myUsername: pseudo,
      estAuLobby: Boolean(game.getPlayer(pseudo)),
    });
    if (game.gameStarted) socket.emit("chess:update", game.getState(pseudo));
  });

  socket.on("chess:join", () => {
    const game = ensureGame();
    if (game.gameStarted) {
      game.addSpectator(pseudo, socket.id);
      socket.emit("chess:error", "La partie a déjà commencé");
      broadcastLobby();
      return;
    }
    game.removeSpectator(pseudo);
    const result = game.addPlayer(pseudo, socket.id);
    if (!result.success && result.reason === "full") {
      socket.emit("chess:error", "Le lobby est plein (2/2)");
    }
    broadcastLobby();
  });

  socket.on("chess:leave", () => {
    const game = getChessGame();
    if (!game) return;
    const wasInStartedGame = Boolean(
      game.getPlayer(pseudo) && game.gameStarted,
    );
    if (wasInStartedGame) cancelGame(game, pseudo);
    game.removePlayer(pseudo);
    game.removeSpectator(pseudo);
    broadcastLobby();
  });

  socket.on("chess:start", () => {
    const game = ensureGame();
    if (!game.getPlayer(pseudo))
      return socket.emit("chess:error", "Tu n'es pas dans le lobby");
    if (!game.startGame())
      return socket.emit(
        "chess:error",
        "Impossible de démarrer (2 joueurs requis)",
      );
    game.startClock(
      () => finishTimedGame(game),
      () => {
        if (getChessGame() === game) broadcastGame();
      },
    );
    refreshIds(game);
    game.joueurs.forEach((player) => {
      io.sockets.sockets
        .get(player.socketId)
        ?.emit("chess:gameStart", game.getState(player.pseudo));
    });
    broadcastLobby();
  });

  socket.on("chess:play", (move) => {
    const game = getChessGame();
    const result = game?.playMove(game.getPlayer(pseudo), move);
    if (result?.timedOut) {
      finishTimedGame(game);
      return;
    }
    if (!result?.success)
      return socket.emit(
        "chess:error",
        result?.message || "Partie indisponible",
      );
    if (result.winner || result.draw) {
      finishGame(game, { winner: result.winner, draw: result.draw });
      return;
    }
    broadcastGame();
  });

  return {
    onDisconnect() {
      const game = getChessGame();
      if (!game) return;
      const wasInStartedGame = Boolean(
        game.getPlayer(pseudo) && game.gameStarted,
      );
      if (wasInStartedGame) cancelGame(game, pseudo);
      game.removePlayer(pseudo);
      game.removeSpectator(pseudo);
      broadcastLobby();
    },
  };
}

module.exports = { registerChessHandlers };
