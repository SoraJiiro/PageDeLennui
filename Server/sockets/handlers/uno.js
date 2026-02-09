function registerUnoHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  UnoGame,
  getUnoGame,
  setUnoGame,
  withGame,
  colors,
}) {
  function ensureGame() {
    if (!getUnoGame()) setUnoGame(new UnoGame());
    return getUnoGame();
  }

  function uno_majSocketIds() {
    const gameActuelle = getUnoGame();
    if (!gameActuelle) return;
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;

      const joueur = gameActuelle.joueurs.find(
        (p) => p.pseudo === clientUsername,
      );
      if (joueur) joueur.socketId = clientSocket.id;

      const spectator = gameActuelle.spectators.find(
        (s) => s.pseudo === clientUsername,
      );
      if (spectator) spectator.socketId = clientSocket.id;
    });
  }

  function uno_broadcastLobby() {
    const gameActuelle = ensureGame();
    uno_majSocketIds();
    const lobbyState = gameActuelle.getLobbyState();
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const estAuLobby = gameActuelle.joueurs.some(
        (p) => p.pseudo === clientUsername,
      );
      clientSocket.emit("uno:lobby", {
        ...lobbyState,
        myUsername: clientUsername,
        estAuLobby,
      });
    });
  }

  function uno_broadcast(message = "", resetTimer = false) {
    const gameActuelle = getUnoGame();
    if (!gameActuelle || !gameActuelle.gameStarted) return;
    // Démarrer/Reset le timer uniquement quand le tour change (play/draw/timeout)
    if (resetTimer) uno_startTurnTimer();
    uno_majSocketIds();
    [...gameActuelle.joueurs, ...gameActuelle.spectators].forEach((p) => {
      const pSocket = io.sockets.sockets.get(p.socketId);
      if (pSocket) {
        const state = gameActuelle.getState(p.pseudo);
        if (message) state.message = message;
        pSocket.emit("uno:update", state);
      }
    });
  }

  // ----- Timer de tour UNO (10s) -----
  function uno_clearTurnTimer() {
    const gameActuelle = getUnoGame();
    if (gameActuelle && gameActuelle.turnTimer) {
      clearTimeout(gameActuelle.turnTimer);
      gameActuelle.turnTimer = null;
    }
    if (gameActuelle) gameActuelle.turnDeadlineAt = null;
  }

  function uno_startTurnTimer() {
    const gameActuelle = getUnoGame();
    uno_clearTurnTimer();
    if (!gameActuelle || !gameActuelle.gameStarted) return;
    const current = gameActuelle.getCurrentPlayer();
    if (!current) return;
    // Définir la deadline côté serveur pour affichage client
    gameActuelle.turnDeadlineAt = Date.now() + 10000;
    gameActuelle.turnTimer = setTimeout(() => {
      const res = gameActuelle.autoDrawAndPass();
      const msg =
        res && res.message
          ? res.message
          : `${current.pseudo} n'a pas joué en 10s: pioche auto.`;
      // Nouveau tour -> resetTimer = true
      uno_broadcast(msg, true);
    }, 10000);
  }

  socket.on("uno:getState", () => {
    const gameActuelle = ensureGame();
    uno_majSocketIds();
    const lobbyState = gameActuelle.getLobbyState();
    const estAuLobby = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
    socket.emit("uno:lobby", { ...lobbyState, myUsername: pseudo, estAuLobby });
    if (gameActuelle.gameStarted)
      socket.emit("uno:update", gameActuelle.getState(pseudo));
  });

  socket.on("uno:join", () => {
    const gameActuelle = ensureGame();

    if (gameActuelle.gameStarted) {
      socket.emit("uno:error", "La partie a déjà commencé");
      gameActuelle.addSpectator(pseudo, socket.id);
      uno_broadcastLobby();
      return;
    }

    gameActuelle.removeSpectator(pseudo);
    const res = gameActuelle.addPlayer(pseudo, socket.id);

    if (!res.success) {
      if (res.reason === "full")
        socket.emit("uno:error", "Le lobby est plein (4/4)");
      else if (res.reason === "gameStarted")
        socket.emit("uno:error", "La partie a déjà commencé");
      else if (res.reason === "alreadyIn")
        console.log(
          withGame(
            `⚠️  [${colors.orange}${pseudo}${colors.violet}] est déjà dans le lobby UNO`,
            colors.violet,
          ),
        );
      uno_broadcastLobby();
      return;
    }

    console.log(
      withGame(
        `\n➡️ [${colors.orange}${pseudo}${colors.violet}] a rejoint le lobby UNO (${gameActuelle.joueurs.length}/4)`,
        colors.violet,
      ),
    );
    uno_broadcastLobby();
  });

  socket.on("uno:leave", () => {
    const gameActuelle = getUnoGame();
    if (!gameActuelle) return;
    const wasCurrent =
      gameActuelle.getCurrentPlayer() &&
      gameActuelle.getCurrentPlayer().pseudo === pseudo;
    const etaitJoueur = gameActuelle.removePlayer(pseudo);

    if (etaitJoueur) {
      console.log(
        withGame(
          `⬅️ [${colors.orange}${pseudo}${colors.violet}] a quitté le lobby UNO`,
          colors.violet,
        ),
      );
      if (gameActuelle.gameStarted) {
        if (gameActuelle.joueurs.length < 2) {
          console.log(
            withGame(
              `⚠️  Partie UNO annulée (pas assez de joueurs)`,
              colors.violet,
            ),
          );
          uno_clearTurnTimer();
          setUnoGame(new UnoGame());
          uno_broadcastLobby();
          return;
        }
        // Si le joueur courant est parti, nouveau tour -> resetTimer = true
        uno_broadcast(`${pseudo} a quitté la partie`, wasCurrent);
      }
      gameActuelle.addSpectator(pseudo, socket.id);
      uno_broadcastLobby();
    }
  });

  socket.on("uno:start", () => {
    const gameActuelle = getUnoGame();
    if (!gameActuelle) return;
    const isPlayer = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) return socket.emit("uno:error", "Tu n'es pas dans le lobby");
    if (!gameActuelle.canStart())
      return socket.emit(
        "uno:error",
        "Impossible de démarrer (2-4 joueurs requis)",
      );

    gameActuelle.startGame();

    const joueursActu = gameActuelle.joueurs.map(
      (j) => `${colors.orange}${j.pseudo}${colors.violet}`,
    );
    console.log(
      withGame(
        `\n🎮 Partie UNO démarrée avec ${
          gameActuelle.joueurs.length
        } joueurs (${joueursActu.join(", ")})`,
        colors.violet,
      ),
    );

    // Démarrer le timer AVANT d'envoyer l'état initial pour inclure turnDeadlineAt
    uno_startTurnTimer();

    uno_majSocketIds();

    gameActuelle.joueurs.forEach((p) => {
      const joueurSocket = io.sockets.sockets.get(p.socketId);
      if (joueurSocket)
        joueurSocket.emit("uno:gameStart", gameActuelle.getState(p.pseudo));
    });

    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const isPlayer = gameActuelle.joueurs.some(
        (p) => p.pseudo === clientUsername,
      );
      if (!isPlayer) {
        gameActuelle.addSpectator(clientUsername, clientSocket.id);
        clientSocket.emit(
          "uno:gameStart",
          gameActuelle.getState(clientUsername),
        );
      }
    });

    uno_broadcastLobby();
  });

  socket.on("uno:play", ({ cardIndex, color }) => {
    const gameActuelle = getUnoGame();
    if (!gameActuelle || !gameActuelle.gameStarted)
      return socket.emit("uno:error", "Aucune partie en cours");
    const joueur = gameActuelle.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("uno:error", "Tu n'es pas dans la partie");

    const res = gameActuelle.jouerCarte(joueur, cardIndex, color);
    if (!res.success) return socket.emit("uno:error", res.message);

    if (res.winner) {
      console.log(
        withGame(
          `\n🏆 [${colors.orange}${res.winner}${colors.violet}] a gagné la partie de UNO !\n`,
          colors.violet,
        ),
      );
      uno_clearTurnTimer();
      FileService.data.unoWins[res.winner] =
        (FileService.data.unoWins[res.winner] || 0) + 1;
      FileService.save("unoWins", FileService.data.unoWins);
      io.emit("uno:gameEnd", { winner: res.winner });
      leaderboardManager.broadcastUnoLB(io);
      setUnoGame(new UnoGame());
      uno_broadcastLobby();
      return;
    }

    // Après un play, le tour change -> resetTimer = true
    uno_broadcast(res.message, true);
  });

  socket.on("uno:draw", () => {
    const gameActuelle = getUnoGame();
    if (!gameActuelle || !gameActuelle.gameStarted) return;
    const joueur = gameActuelle.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("uno:error", "Tu n'es pas dans la partie");
    const res = gameActuelle.drawCard(joueur);
    if (!res.success) return socket.emit("uno:error", res.message);
    // Après une pioche volontaire, le tour passe -> resetTimer = true
    uno_broadcast(res.message, true);
  });

  function onDisconnect() {
    const gameActuelle = getUnoGame();
    if (!gameActuelle) return;

    const wasCurrent =
      gameActuelle.getCurrentPlayer() &&
      gameActuelle.getCurrentPlayer().pseudo === pseudo;
    const etaitJoueur = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);

    if (etaitJoueur) {
      gameActuelle.removePlayer(pseudo);
      if (gameActuelle.gameStarted && gameActuelle.joueurs.length < 2) {
        console.log(
          withGame(
            `⚠️  Partie UNO annulée ([${colors.orange}${pseudo}${colors.violet}] déconnecté)`,
            colors.violet,
          ),
        );
        io.emit("uno:gameEnd", {
          winner: "Partie annulée !",
          reason: `${pseudo} s'est déconnecté`,
        });
        uno_clearTurnTimer();
        setUnoGame(new UnoGame());
      } else if (gameActuelle.gameStarted) {
        // Reset timer seulement si le joueur courant a quitté
        uno_broadcast(`${pseudo} s'est déconnecté`, wasCurrent);
      }
      uno_broadcastLobby();
    } else {
      gameActuelle.removeSpectator(pseudo);
    }
  }

  return { onDisconnect };
}

module.exports = { registerUnoHandlers };
