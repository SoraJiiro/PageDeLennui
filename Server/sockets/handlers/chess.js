function registerChessHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  ChessGame,
  chessGames,
}) {
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");
  const DEFAULT_ELO = 500;
  const ELO_K_FACTOR = 32;
  let selectedGameId = null;
  const getElo = (name) => Number(FileService.data.chessElo?.[name]) || 500;
  const getGame = (id = selectedGameId) => chessGames.get(id);
  const findUserGame = () =>
    [...chessGames.entries()].find(
      ([, game]) =>
        game.getPlayer(pseudo) ||
        game.spectators.some((entry) => entry.pseudo === pseudo),
    );
  const refreshIds = (game) =>
    io.sockets.sockets.forEach((client) => {
      const username = client.handshake.session?.user?.pseudo;
      if (username) game.updateSocketId(username, client.id);
    });
  const listGames = () =>
    [...chessGames.entries()].map(([id, game]) => ({
      id,
      joueurs: game.joueurs.map((p) => p.pseudo),
      elos: Object.fromEntries(
        game.joueurs.map((player) => [player.pseudo, getElo(player.pseudo)]),
      ),
      spectators: game.spectators.length,
      gameStarted: game.gameStarted,
      vsBot: Boolean(game.vsBot),
      timeMinutes: Math.round((game.initialTimeMs || 600000) / 60000),
    }));
  const broadcastLobby = () =>
    io.sockets.sockets.forEach((client) => {
      const username = client.handshake.session?.user?.pseudo;
      if (!username) return;
      const playerGame = [...chessGames.entries()].find(([, game]) =>
        game.getPlayer(username),
      );
      client.emit("chess:lobby", {
        games: listGames(),
        playerGameId: playerGame?.[0] || null,
        myElo: getElo(username),
      });
    });
  const broadcastGame = (id) => {
    const game = getGame(id);
    if (!game?.gameStarted) return;
    refreshIds(game);
    [...game.joueurs, ...game.spectators].forEach((entry) =>
      io.sockets.sockets.get(entry.socketId)?.emit("chess:update", {
        ...game.getState(entry.pseudo),
        gameId: id,
        chessElos: Object.fromEntries(
          game.joueurs.map((player) => [player.pseudo, getElo(player.pseudo)]),
        ),
      }),
    );
  };
  const startGameClock = (id, game) =>
    game.startClock(
      () => finishGame(id, { winner: game.winner, reason: "Temps écoulé" }),
      () => broadcastGame(id),
    );
  const resumeGame = (id, game) => {
    if (!game?.pausedBy || game.pausedBy !== pseudo) return;
    clearTimeout(game.pauseTimer);
    game.pauseTimer = null;
    game.pausedBy = null;
    game.pauseDeadline = null;
    game.lastTurnAt = Date.now();
    startGameClock(id, game);
    broadcastGame(id);
  };
  const pauseGame = (id, game, leavingPseudo) => {
    if (!game?.gameStarted || game.pausedBy) return;
    game.stopClock();
    game.pausedBy = leavingPseudo;
    game.pauseDeadline = Date.now() + 30000;
    game.pauseTimer = setTimeout(() => {
      if (getGame(id)?.pausedBy === leavingPseudo) {
        cancelGame(id, leavingPseudo);
        broadcastLobby();
      }
    }, 30000);
    broadcastGame(id);
  };
  const recordGame = (game, winner) => {
    if (game.vsBot) return;

    const players = game.joueurs.filter((player) => !player.isBot);
    if (players.length !== 2) return;
    if (!FileService.data.chessElo) FileService.data.chessElo = {};

    const [first, second] = players;
    const firstElo =
      Number(FileService.data.chessElo[first.pseudo]) || DEFAULT_ELO;
    const secondElo =
      Number(FileService.data.chessElo[second.pseudo]) || DEFAULT_ELO;
    const expectedFirst = 1 / (1 + 10 ** ((secondElo - firstElo) / 400));
    const firstResult = winner ? (winner === first.pseudo ? 1 : 0) : 0.5;
    const secondResult = 1 - firstResult;

    FileService.data.chessElo[first.pseudo] = Math.round(
      firstElo + ELO_K_FACTOR * (firstResult - expectedFirst),
    );
    FileService.data.chessElo[second.pseudo] = Math.round(
      secondElo + ELO_K_FACTOR * (secondResult - (1 - expectedFirst)),
    );

    game.joueurs.forEach((player) => {
      FileService.data.chessGames[player.pseudo] =
        (FileService.data.chessGames[player.pseudo] || 0) + 1;
    });
    if (winner)
      FileService.data.chessWins[winner] =
        (FileService.data.chessWins[winner] || 0) + 1;
    FileService.save("chessGames", FileService.data.chessGames);
    FileService.save("chessWins", FileService.data.chessWins);
    FileService.save("chessElo", FileService.data.chessElo);
    game.joueurs.forEach((player) =>
      applyAutoBadges({ pseudo: player.pseudo, FileService }),
    );
    leaderboardManager.broadcastChessLB(io);
  };
  const finishGame = (
    id,
    { winner = null, draw = false, reason = "" } = {},
  ) => {
    const game = getGame(id);
    if (!game) return;
    game.stopClock();
    clearTimeout(game.pauseTimer);
    recordGame(game, winner);
    if (winner && winner !== "Bot") {
      const wallet = addMoney(
        FileService,
        winner,
        175,
        FileService.data.clicks[winner] || 0,
        "jeu:echecs",
      );
      io.to(`user:${winner}`).emit("economy:wallet", wallet);
      io.to(`user:${winner}`).emit("economy:gameMoney", {
        game: "echecs",
        gained: 175,
        total: 175,
        final: true,
      });
    }
    refreshIds(game);
    [...game.joueurs, ...game.spectators].forEach((entry) =>
      io.sockets.sockets.get(entry.socketId)?.emit("chess:gameEnd", {
        winner,
        draw,
        reason,
        gained: entry.pseudo === winner ? 175 : 0,
      }),
    );
    chessGames.delete(id);
    broadcastLobby();
  };
  const cancelGame = (id, leavingPseudo) => {
    const game = getGame(id);
    if (!game?.gameStarted) return;
    game.stopClock();
    clearTimeout(game.pauseTimer);
    refreshIds(game);
    [...game.joueurs, ...game.spectators].forEach((entry) =>
      io.sockets.sockets.get(entry.socketId)?.emit("chess:gameEnd", {
        winner: "Partie annulée !",
        reason: `${leavingPseudo} est parti`,
      }),
    );
    chessGames.delete(id);
  };
  const leaveCurrent = () => {
    const found = findUserGame();
    if (!found) return;
    const [id, game] = found;
    if (game.vsBot) {
      chessGames.delete(id);
      selectedGameId = null;
      return;
    }
    if (game.getPlayer(pseudo) && game.gameStarted) cancelGame(id, pseudo);
    else {
      game.removePlayer(pseudo);
      game.removeSpectator(pseudo);
      if (!game.joueurs.length) chessGames.delete(id);
    }
    selectedGameId = null;
  };
  socket.on("chess:getState", () => {
    const found = findUserGame();
    if (found) {
      selectedGameId = found[0];
      refreshIds(found[1]);
      resumeGame(found[0], found[1]);
    }
    broadcastLobby();
    const game = getGame();
    if (game?.gameStarted)
      socket.emit("chess:update", {
        ...game.getState(pseudo),
        gameId: selectedGameId,
        chessElos: Object.fromEntries(
          game.joueurs.map((player) => [player.pseudo, getElo(player.pseudo)]),
        ),
      });
  });
  socket.on(
    "chess:create",
    ({ timeMinutes = 10, vsBot = false, botType = "classic" } = {}) => {
      const found = findUserGame();
      if (found?.[1].getPlayer(pseudo))
        return socket.emit(
          "chess:error",
          "Quitte ta table actuelle avant d'en créer une autre",
        );
      leaveCurrent();
      const id = `chess-${Date.now()}-${socket.id}`;
      const game = new ChessGame({
        timeMinutes: Number(timeMinutes),
        vsBot: Boolean(vsBot),
        botType,
      });
      game.addPlayer(pseudo, socket.id);
      if (game.vsBot) game.addBot();
      chessGames.set(id, game);
      selectedGameId = id;
      broadcastLobby();
    },
  );
  socket.on("chess:join", ({ gameId: id } = {}) => {
    const game = getGame(id);
    if (!game || game.gameStarted)
      return socket.emit("chess:error", "Cette table n'est plus disponible");
    if (game.vsBot)
      return socket.emit(
        "chess:error",
        "Cette table est en mode solo contre l'ordi",
      );
    const found = findUserGame();
    if (found?.[1].getPlayer(pseudo) && found[0] !== id)
      return socket.emit(
        "chess:error",
        "Tu attends déjà un autre joueur dans une table",
      );
    if (found && found[0] !== id) leaveCurrent();
    const result = game.addPlayer(pseudo, socket.id);
    if (!result.success && result.reason !== "alreadyIn")
      return socket.emit("chess:error", "Le lobby est plein (2/2)");
    selectedGameId = id;
    broadcastLobby();
  });
  socket.on("chess:spectate", ({ gameId: id } = {}) => {
    const game = getGame(id);
    if (!game?.gameStarted)
      return socket.emit("chess:error", "Cette partie n'est plus en cours");
    const found = findUserGame();
    if (found && found[0] !== id) leaveCurrent();
    game.addSpectator(pseudo, socket.id);
    selectedGameId = id;
    socket.emit("chess:update", {
      ...game.getState(pseudo),
      gameId: id,
      chessElos: Object.fromEntries(
        game.joueurs.map((player) => [player.pseudo, getElo(player.pseudo)]),
      ),
    });
    broadcastLobby();
  });
  socket.on("chess:leave", () => {
    leaveCurrent();
    broadcastLobby();
  });
  socket.on("chess:start", () => {
    const game = getGame();
    if (!game?.getPlayer(pseudo) || !game.startGame())
      return socket.emit(
        "chess:error",
        game?.vsBot
          ? "Impossible de démarrer (1 joueur requis en solo)"
          : "Impossible de démarrer (2 joueurs requis)",
      );
    const id = selectedGameId;
    startGameClock(id, game);
    refreshIds(game);
    game.joueurs.forEach((player) =>
      io.sockets.sockets.get(player.socketId)?.emit("chess:gameStart", {
        ...game.getState(player.pseudo),
        gameId: id,
        chessElos: Object.fromEntries(
          game.joueurs.map((entry) => [entry.pseudo, getElo(entry.pseudo)]),
        ),
      }),
    );
    broadcastLobby();
  });
  socket.on("chess:play", (move) => {
    const game = getGame();
    if (game?.pausedBy)
      return socket.emit(
        "chess:error",
        "La partie est en pause pendant la reconnexion d'un joueur",
      );
    const result = game?.playMove(game.getPlayer(pseudo), move);
    if (result?.timedOut)
      return finishGame(selectedGameId, {
        winner: game.winner,
        reason: "Temps écoulé",
      });
    if (!result?.success)
      return socket.emit(
        "chess:error",
        result?.message || "Partie indisponible",
      );
    if (result.winner || result.draw)
      return finishGame(selectedGameId, {
        winner: result.winner,
        draw: result.draw,
      });

    broadcastGame(selectedGameId);

    if (game.vsBot && game.chess.turn() === "b") {
      setTimeout(async () => {
        const currentGame = getGame(selectedGameId);
        if (!currentGame || !currentGame.gameStarted) return;
        const botResult =
          currentGame.botType === "stockfish"
            ? await currentGame.playStockfishMove()
            : currentGame.playBotMove();
        if (botResult?.winner || botResult?.draw)
          return finishGame(selectedGameId, {
            winner: botResult.winner,
            draw: botResult.draw,
          });
        if (botResult?.success) broadcastGame(selectedGameId);
      }, 220);
    }
  });
  socket.on("chess:resign", () => {
    const game = getGame();
    const player = game?.getPlayer(pseudo);
    if (!game?.gameStarted || !player) return;
    if (!game.vsBot && !game.canResign()) {
      return socket.emit(
        "chess:error",
        "L'abandon est disponible après la moitié du temps total",
      );
    }
    const opponent = game.joueurs.find((entry) => entry.pseudo !== pseudo);
    finishGame(selectedGameId, {
      winner: opponent?.pseudo || null,
      reason: "Abandon",
    });
  });
  socket.on("chess:offerDraw", () => {
    const game = getGame();
    if (!game?.gameStarted || game.vsBot) {
      return socket.emit(
        "chess:error",
        "La nulle est disponible uniquement entre joueurs",
      );
    }
    const result = game.offerDraw(pseudo);
    if (!result.success) return;
    if (result.agreed) {
      return finishGame(selectedGameId, {
        draw: true,
        reason: "Nulle par accord",
      });
    }
    game.joueurs
      .filter((player) => player.pseudo !== pseudo && !player.isBot)
      .forEach((player) =>
        io.sockets.sockets.get(player.socketId)?.emit("chess:drawOffer", {
          from: pseudo,
        }),
      );
    broadcastGame(selectedGameId);
  });
  return {
    onDisconnect() {
      const found = findUserGame();
      if (found?.[1].getPlayer(pseudo) && found[1].gameStarted)
        pauseGame(found[0], found[1], pseudo);
      else leaveCurrent();
      broadcastLobby();
    },
  };
}
module.exports = { registerChessHandlers };
