function registerPuissance4Handlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  Puissance4Game,
  getP4Game,
  setP4Game,
  withGame,
  colors,
}) {
  const { addMoney } = require("../../services/wallet");
  const { applyAutoBadges } = require("../../services/badgesAuto");
  function ensureGame() {
    if (!getP4Game()) setP4Game(new Puissance4Game());
    return getP4Game();
  }

  function p4_majSocketIds() {
    const p4Game = getP4Game();
    if (!p4Game) return;
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      p4Game.updateSocketId(clientUsername, clientSocket.id);
    });
  }

  function p4_broadcastLobby() {
    const p4Game = ensureGame();
    p4_majSocketIds();
    const lobbyState = p4Game.getLobbyState();
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const estAuLobby = p4Game.joueurs.some(
        (p) => p.pseudo === clientUsername,
      );
      clientSocket.emit("p4:lobby", {
        ...lobbyState,
        myUsername: clientUsername,
        estAuLobby,
      });
    });
  }

  function p4_broadcastGame(message = "") {
    const p4Game = getP4Game();
    if (!p4Game || !p4Game.gameStarted) return;
    p4_majSocketIds();
    [...p4Game.joueurs, ...p4Game.spectators].forEach((p) => {
      const pSocket = io.sockets.sockets.get(p.socketId);
      if (pSocket) {
        const state = p4Game.getState(p.pseudo);
        if (message) state.message = message;
        pSocket.emit("p4:update", state);
      }
    });
  }

  socket.on("p4:getState", () => {
    const p4Game = ensureGame();
    p4_majSocketIds();
    const lobbyState = p4Game.getLobbyState();
    const estAuLobby = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    socket.emit("p4:lobby", { ...lobbyState, myUsername: pseudo, estAuLobby });
    if (p4Game.gameStarted) socket.emit("p4:update", p4Game.getState(pseudo));
  });

  socket.on("p4:join", () => {
    const p4Game = ensureGame();
    if (p4Game.gameStarted) {
      socket.emit("p4:error", "La partie a déjà commencé");
      p4Game.addSpectator(pseudo, socket.id);
      p4_broadcastLobby();
      return;
    }
    p4Game.removeSpectator(pseudo);
    const res = p4Game.addPlayer(pseudo, socket.id);
    if (!res.success) {
      if (res.reason === "alreadyIn") {
        console.log(
          withGame(
            `⚠️  [${colors.orange}${pseudo}${colors.red}] est déjà dans le lobby PUISSANCE 4`,
            colors.red,
          ),
        );
      } else if (res.reason === "full") {
        socket.emit("p4:error", "Le lobby est plein (2/2)");
      }
      p4_broadcastLobby();
      return;
    }
    console.log(
      withGame(
        `\n➡️ [${colors.orange}${pseudo}${colors.red}] a rejoint le lobby PUISSANCE 4 (${p4Game.joueurs.length}/2)`,
        colors.red,
      ),
    );
    p4_broadcastLobby();
  });

  socket.on("p4:leave", () => {
    const p4Game = getP4Game();
    if (!p4Game) return;
    const etaitJoueur = p4Game.removePlayer(pseudo);
    if (etaitJoueur) {
      console.log(
        withGame(
          `⬅️ [${colors.orange}${pseudo}${colors.red}] a quitté le lobby PUISSANCE 4`,
          colors.red,
        ),
      );
      if (p4Game.gameStarted) {
        console.log(
          withGame(`⚠️  Partie Puissance4 annulée (joueur parti)`, colors.red),
        );
        io.emit("p4:gameEnd", {
          winner: "Partie annulée !",
          reason: `${pseudo} est parti`,
        });
        setP4Game(new Puissance4Game());
        p4_broadcastLobby();
        return;
      }
      p4Game.addSpectator(pseudo, socket.id);
      p4_broadcastLobby();
    } else {
      p4Game.removeSpectator(pseudo);
    }
  });

  socket.on("p4:start", () => {
    const p4Game = ensureGame();
    const isPlayer = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) return socket.emit("p4:error", "Tu n'es pas dans le lobby");
    if (!p4Game.canStart())
      return socket.emit(
        "p4:error",
        "Impossible de démarrer (2 joueurs requis)",
      );

    p4Game.startGame();
    console.log(
      withGame(
        `\n🎮 Partie Puissance4 démarrée avec ${p4Game.joueurs.length} joueurs`,
        colors.red,
      ),
    );
    p4_majSocketIds();

    p4Game.joueurs.forEach((p) => {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.emit("p4:gameStart", p4Game.getState(p.pseudo));
    });

    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const isPlayer = p4Game.joueurs.some((p) => p.pseudo === clientUsername);
      if (!isPlayer) {
        p4Game.addSpectator(clientUsername, clientSocket.id);
        clientSocket.emit("p4:gameStart", p4Game.getState(clientUsername));
      }
    });

    p4_broadcastLobby();
  });

  socket.on("p4:play", ({ col }) => {
    const p4Game = getP4Game();
    if (!p4Game || !p4Game.gameStarted) return;
    const joueur = p4Game.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("p4:error", "Tu n'es pas dans la partie");

    const res = p4Game.playMove(joueur, col);
    if (!res.success) return socket.emit("p4:error", res.message);

    if (res.winner) {
      const participants = p4Game.joueurs.map((p) => p.pseudo);
      const moneyByPlayer = Object.fromEntries(
        participants.map((p) => [p, p === res.winner ? 250 : 0]),
      );

      console.log(
        withGame(
          `\n🏆 [${colors.orange}${res.winner}${colors.red}] a gagné la partie de Puissance4 !\n`,
          colors.red,
        ),
      );
      FileService.data.p4Wins[res.winner] =
        (FileService.data.p4Wins[res.winner] || 0) + 1;
      FileService.save("p4Wins", FileService.data.p4Wins);
      try {
        applyAutoBadges({ pseudo: res.winner, FileService });
      } catch {}

      const winnerWallet = addMoney(
        FileService,
        res.winner,
        250,
        FileService.data.clicks[res.winner] || 0,
      );
      io.to("user:" + res.winner).emit("economy:wallet", winnerWallet);
      io.to("user:" + res.winner).emit("economy:gameMoney", {
        game: "puissance4",
        gained: 250,
        total: 250,
        final: true,
      });
      try {
        FileService.appendLog({
          type: "GAME_MONEY_REWARD",
          pseudo: res.winner,
          game: "puissance4",
          gained: 250,
          total: 250,
          at: new Date().toISOString(),
        });
      } catch {}

      leaderboardManager.broadcastP4LB(io);

      p4_broadcastGame();
      setTimeout(() => {
        io.emit("p4:gameEnd", { winner: res.winner, moneyByPlayer });
        setP4Game(new Puissance4Game());
        p4_broadcastLobby();
      }, 100);
      return;
    }

    if (res.draw) {
      console.log(withGame(`\n🤝 Match nul Puissance4 !\n`, colors.red));
      p4_broadcastGame();
      setTimeout(() => {
        io.emit("p4:gameEnd", { draw: true });
        setP4Game(new Puissance4Game());
        p4_broadcastLobby();
      }, 100);
      return;
    }

    p4_broadcastGame();
  });

  function onDisconnect() {
    const p4Game = getP4Game();
    if (!p4Game) return;

    const etaitJoueurP4 = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    if (etaitJoueurP4) {
      if (p4Game.gameStarted) {
        console.log(
          withGame(
            `⚠️  Partie Puissance4 annulée ([${colors.orange}${pseudo}${colors.red}] déconnecté)`,
            colors.red,
          ),
        );
        io.emit("p4:gameEnd", {
          winner: "Partie annulée !",
          reason: `${pseudo} s'est déconnecté`,
        });
      }
      setP4Game(new Puissance4Game());
      p4_broadcastLobby();
    } else {
      p4Game.removeSpectator(pseudo);
    }
  }

  return { onDisconnect };
}

module.exports = { registerPuissance4Handlers };
