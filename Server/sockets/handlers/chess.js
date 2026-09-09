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
    leaderboardManager.broadcastChessLB(io);
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
    const wasPlayer = game.removePlayer(pseudo);
    game.removeSpectator(pseudo);
    if (wasPlayer && game.gameStarted) {
      io.emit("chess:gameEnd", { winner: "Partie annulée !", reason: `${pseudo} est parti` });
      setChessGame(new ChessGame());
    }
    broadcastLobby();
  });

  socket.on("chess:start", () => {
    const game = ensureGame();
    if (!game.getPlayer(pseudo)) return socket.emit("chess:error", "Tu n'es pas dans le lobby");
    if (!game.startGame()) return socket.emit("chess:error", "Impossible de démarrer (2 joueurs requis)");
    refreshIds(game);
    game.joueurs.forEach((player) => {
      io.sockets.sockets.get(player.socketId)?.emit("chess:gameStart", game.getState(player.pseudo));
    });
    broadcastLobby();
  });

  socket.on("chess:play", (move) => {
    const game = getChessGame();
    const result = game?.playMove(game.getPlayer(pseudo), move);
    if (!result?.success) return socket.emit("chess:error", result?.message || "Partie indisponible");
    if (result.winner || result.draw) {
      recordGame(game, result.winner);
      broadcastGame();
      setTimeout(() => {
        io.emit("chess:gameEnd", { winner: result.winner, draw: result.draw });
        setChessGame(new ChessGame());
        broadcastLobby();
      }, 100);
      return;
    }
    broadcastGame();
  });

  return {
    onDisconnect() {
      const game = getChessGame();
      if (!game) return;
      const wasPlayer = game.removePlayer(pseudo);
      game.removeSpectator(pseudo);
      if (wasPlayer && game.gameStarted) setChessGame(new ChessGame());
      broadcastLobby();
    },
  };
}

module.exports = { registerChessHandlers };