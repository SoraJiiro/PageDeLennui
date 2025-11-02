const { FileService, AntiSpam, GameStateManager } = require("./util");
const UnoGame = require("./unoGame");
const PictionaryGame = require("./pictionaryGame");
const Puissance4Game = require("./puissance4Game");

// ------- Games -------
let gameActuelle = new UnoGame();
let pictionaryGame = new PictionaryGame();
let pictionaryTimer = null;
let p4Game = new Puissance4Game();

// ------- Helpers -------
const helpers = {
  broadcastClickerLB(io) {
    const arr = Object.entries(FileService.data.clicks)
      .map(([pseudo, score]) => ({ pseudo, score: Number(score) || 0 }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("clicker:leaderboard", arr);
  },
  broadcastDinoLB(io) {
    const arr = Object.entries(FileService.data.dinoScores)
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("dino:leaderboard", arr);
  },
  broadcastFlappyLB(io) {
    const arr = Object.entries(FileService.data.flappyScores)
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("flappy:leaderboard", arr);
  },
  broadcastUnoLB(io) {
    const arr = Object.entries(FileService.data.unoWins)
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
    io.emit("uno:leaderboard", arr);
  },
  broadcastPictionaryLB(io) {
    const arr = Object.entries(FileService.data.pictionaryWins)
      .map(([u, p]) => ({ pseudo: u, points: p }))
      .sort((a, b) => b.points - a.points || a.pseudo.localeCompare(b.pseudo));
    io.emit("pictionary:leaderboard", arr);
  },
  broadcastP4LB(io) {
    const arr = Object.entries(FileService.data.p4Wins)
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
    io.emit("p4:leaderboard", arr);
  },
};

// ------- Handler Socket -------
function initSocketHandlers(io, socket, gameState) {
  const user = socket.handshake.session?.user;
  if (!user || !user.pseudo) {
    io.emit("reload");
    socket.disconnect(true);
    return;
  }

  const pseudo = user.pseudo;
  gameState.addUser(socket.id, pseudo, io);
  console.log(`>> [${pseudo}] connecté`);

  // Envoi dada initiales
  socket.emit("you:name", pseudo);
  socket.emit("chat:history", FileService.data.historique);
  socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] || 0 });
  socket.emit("clicker:medals", FileService.data.medals[pseudo] || []);
  helpers.broadcastClickerLB(io);
  helpers.broadcastDinoLB(io);
  helpers.broadcastFlappyLB(io);
  helpers.broadcastUnoLB(io);
  helpers.broadcastPictionaryLB(io);
  helpers.broadcastP4LB(io);

  io.emit("users:list", gameState.getUniqueUsers());
  io.emit("system:info", `${pseudo} a rejoint le chat`);

  // ------- Chat -------
  socket.on("chat:message", ({ text }) => {
    const msg = String(text || "").trim();
    if (!msg) return;

    const payload = { name: pseudo, text: msg, at: new Date().toISOString() };
    FileService.data.historique.push(payload);
    if (FileService.data.historique.length > 200) {
      FileService.data.historique = FileService.data.historique.slice(-200);
    }
    FileService.save("historique", FileService.data.historique);
    FileService.appendLog(payload);
    io.emit("chat:message", payload);
  });

  // ------- Clicker -------
  socket.on("clicker:click", () => {
    if (!AntiSpam.allow(socket.id)) return;
    FileService.data.clicks[pseudo] =
      (FileService.data.clicks[pseudo] || 0) + 1;
    FileService.save("scores", FileService.data.clicks);
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });
    helpers.broadcastClickerLB(io);
  });

  socket.on("clicker:reset", () => {
    FileService.data.clicks[pseudo] = 0;
    FileService.data.medals[pseudo] = [];
    FileService.save("scores", FileService.data.clicks);
    FileService.save("medals", FileService.data.medals);
    socket.emit("clicker:you", { score: 0 });
    socket.emit("clicker:medals", []);
    helpers.broadcastClickerLB(io);
    console.log(`🔄 Reset Clicker pour [${pseudo}]`);
  });

  socket.on("clicker:medalUnlock", ({ medalName, colors }) => {
    if (typeof medalName !== "string" || medalName.trim() === "") return;

    const allMedals = FileService.data.medals;
    const userMedals = allMedals[pseudo] || []; // Get ou créer

    if (
      !userMedals.find((m) =>
        typeof m === "string" ? m === medalName : m.name === medalName
      )
    ) {
      const newEntry =
        Array.isArray(colors) && colors.length >= 3
          ? { name: medalName, colors }
          : medalName;

      userMedals.push(newEntry);
      allMedals[pseudo] = userMedals;

      FileService.save("medals", allMedals);
      console.log(`🏅 ${pseudo} a débloqué ${medalName}`);

      socket.emit(
        "clicker:medals",
        userMedals.map((m) => (typeof m === "string" ? m : m.name))
      );
    }
  });

  // ------- Dino -------
  socket.on("dino:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = FileService.data.dinoScores[pseudo] || 0;
    if (s > current) {
      FileService.data.dinoScores[pseudo] = s;
      FileService.save("dinoScores", FileService.data.dinoScores);
      console.log(`🦖 Nouveau score Dino pour [${pseudo}] ::: ${s}`);
    }
    helpers.broadcastDinoLB(io);
  });

  socket.on("dino:reset", () => {
    FileService.data.dinoScores[pseudo] = 0;
    FileService.save("dinoScores", FileService.data.dinoScores);
    console.log(`🔄 Reset Dino pour [${pseudo}]`);
    helpers.broadcastDinoLB(io);
    socket.emit("dino:resetConfirm", { success: true });
  });

  // ------- Flappy -------
  socket.on("flappy:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = FileService.data.flappyScores[pseudo] || 0;
    if (s > current) {
      FileService.data.flappyScores[pseudo] = s;
      FileService.save("flappyScores", FileService.data.flappyScores);
      console.log(`🐤 Nouveau score Flappy pour [${pseudo}] ::: ${s}`);
    }
    helpers.broadcastFlappyLB(io);
  });

  socket.on("flappy:reset", () => {
    FileService.data.flappyScores[pseudo] = 0;
    FileService.save("flappyScores", FileService.data.flappyScores);
    console.log(`🔄 Reset Flappy pour [${pseudo}]`);
    helpers.broadcastFlappyLB(io);
    socket.emit("flappy:resetConfirm", { success: true });
  });

  // ------- Uno -------
  function uno_majSocketIds() {
    if (!gameActuelle) return;
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;

      const joueur = gameActuelle.joueurs.find(
        (p) => p.pseudo === clientUsername
      );
      if (joueur) joueur.socketId = clientSocket.id;

      const spectator = gameActuelle.spectators.find(
        (s) => s.pseudo === clientUsername
      );
      if (spectator) spectator.socketId = clientSocket.id;
    });
  }

  function uno_broadcastLobby() {
    if (!gameActuelle) gameActuelle = new UnoGame();
    uno_majSocketIds();
    const lobbyState = gameActuelle.getLobbyState();
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const estAuLobby = gameActuelle.joueurs.some(
        (p) => p.pseudo === clientUsername
      );
      clientSocket.emit("uno:lobby", {
        ...lobbyState,
        myUsername: clientUsername,
        estAuLobby,
      });
    });
  }

  function uno_broadcast(message = "") {
    if (!gameActuelle || !gameActuelle.gameStarted) return;
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

  socket.on("uno:getState", () => {
    if (!gameActuelle) gameActuelle = new UnoGame();
    uno_majSocketIds();
    const lobbyState = gameActuelle.getLobbyState();
    const estAuLobby = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
    socket.emit("uno:lobby", { ...lobbyState, myUsername: pseudo, estAuLobby });
    if (gameActuelle.gameStarted)
      socket.emit("uno:update", gameActuelle.getState(pseudo));
  });

  socket.on("uno:join", () => {
    if (!gameActuelle) gameActuelle = new UnoGame();

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
        console.log(`⚠️  ${pseudo} est déjà dans le lobby UNO`);
      uno_broadcastLobby();
      return;
    }

    console.log(
      `✅ ${pseudo} a rejoint le lobby UNO (${gameActuelle.joueurs.length}/4)`
    );
    uno_broadcastLobby();
  });

  socket.on("uno:leave", () => {
    if (!gameActuelle) return;
    const etaitJoueur = gameActuelle.removePlayer(pseudo);

    if (etaitJoueur) {
      console.log(`🚪 ${pseudo} a quitté le lobby UNO`);
      if (gameActuelle.gameStarted) {
        if (gameActuelle.joueurs.length < 2) {
          console.log(`⚠️  Partie UNO annulée (pas assez de joueurs)`);
          gameActuelle = new UnoGame();
          uno_broadcastLobby();
          return;
        }
        uno_broadcast(`${pseudo} a quitté la partie`);
      }
      gameActuelle.addSpectator(pseudo, socket.id);
      uno_broadcastLobby();
    }
  });

  socket.on("uno:start", () => {
    if (!gameActuelle) return;
    const isPlayer = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) return socket.emit("uno:error", "Tu n'es pas dans le lobby");
    if (!gameActuelle.canStart())
      return socket.emit(
        "uno:error",
        "Impossible de démarrer (2-4 joueurs requis)"
      );

    gameActuelle.startGame();

    const joueursActu = gameActuelle.joueurs.map((j) => j.pseudo);
    console.log(
      `🎮 Partie UNO démarrée avec ${
        gameActuelle.joueurs.length
      } joueurs (${joueursActu.join(", ")})`
    );

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
        (p) => p.pseudo === clientUsername
      );
      if (!isPlayer) {
        gameActuelle.addSpectator(clientUsername, clientSocket.id);
        clientSocket.emit(
          "uno:gameStart",
          gameActuelle.getState(clientUsername)
        );
      }
    });

    uno_broadcastLobby();
  });

  socket.on("uno:play", ({ cardIndex, color }) => {
    if (!gameActuelle || !gameActuelle.gameStarted)
      return socket.emit("uno:error", "Aucune partie en cours");
    const joueur = gameActuelle.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("uno:error", "Tu n'es pas dans la partie");

    const res = gameActuelle.jouerCarte(joueur, cardIndex, color);
    if (!res.success) return socket.emit("uno:error", res.message);

    if (res.winner) {
      console.log(`🏆 ${res.winner} a gagné la partie de UNO !`);
      FileService.data.unoWins[res.winner] =
        (FileService.data.unoWins[res.winner] || 0) + 1;
      FileService.save("unoWins", FileService.data.unoWins);
      io.emit("uno:gameEnd", { winner: res.winner });
      helpers.broadcastUnoLB(io);
      gameActuelle = new UnoGame();
      uno_broadcastLobby();
      return;
    }

    uno_broadcast(res.message);
  });

  socket.on("uno:draw", () => {
    if (!gameActuelle || !gameActuelle.gameStarted) return;
    const joueur = gameActuelle.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("uno:error", "Tu n'es pas dans la partie");
    const res = gameActuelle.drawCard(joueur);
    if (!res.success) return socket.emit("uno:error", res.message);
    uno_broadcast(res.message);
  });

  // ------- Pictionary -------
  function pictionary_majSocketIds() {
    if (!pictionaryGame) return;
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      pictionaryGame.updateSocketId(clientUsername, clientSocket.id);
    });
  }

  function pictionary_broadcastLobby() {
    if (!pictionaryGame) pictionaryGame = new PictionaryGame();
    pictionary_majSocketIds();
    const lobbyState = pictionaryGame.getLobbyState();
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const estAuLobby = pictionaryGame.joueurs.some(
        (p) => p.pseudo === clientUsername
      );
      clientSocket.emit("pictionary:lobby", {
        ...lobbyState,
        myUsername: clientUsername,
        estAuLobby,
      });
    });
  }

  function pictionary_broadcastGame(message = "") {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    pictionary_majSocketIds();
    [...pictionaryGame.joueurs, ...pictionaryGame.spectators].forEach((p) => {
      const pSocket = io.sockets.sockets.get(p.socketId);
      if (pSocket) {
        const state = pictionaryGame.getState(p.pseudo);
        if (message) state.message = message;
        pSocket.emit("pictionary:update", state);
      }
    });
  }

  function pictionary_startTimer() {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    pictionary_stopTimer();
    pictionaryTimer = setInterval(pictionary_tick, 1000);
  }

  function pictionary_stopTimer() {
    if (pictionaryTimer) {
      clearInterval(pictionaryTimer);
      pictionaryTimer = null;
    }
  }

  function pictionary_tick() {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    if (typeof pictionaryGame.timeLeft !== "number") {
      pictionaryGame.timeLeft = pictionaryGame.roundDuration;
    }
    pictionaryGame.timeLeft = Math.max(0, pictionaryGame.timeLeft - 1);

    [...pictionaryGame.joueurs, ...pictionaryGame.spectators].forEach((p) => {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.emit("pictionary:tick", { timeLeft: pictionaryGame.timeLeft });
    });

    if (pictionaryGame.timeLeft > 0 && pictionaryGame.timeLeft % 10 === 0) {
      pictionaryGame.revealNextLetter();
    }

    if (pictionaryGame.timeLeft <= 0) {
      pictionaryGame.revealAll();
      io.emit("pictionary:reveal", { word: pictionaryGame.currentWord });

      const res = pictionaryGame.nextRound();
      if (res.finished) {
        const sorted = [...pictionaryGame.joueurs].sort(
          (a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo)
        );
        const winner = sorted.length > 0 ? sorted[0].pseudo : null;

        if (winner) {
          FileService.data.pictionaryWins[winner] =
            (FileService.data.pictionaryWins[winner] || 0) + 1;
          FileService.save("pictionaryWins", FileService.data.pictionaryWins);
          helpers.broadcastPictionaryLB(io);
        }

        io.emit("pictionary:gameEnd", { winner });
        pictionaryGame = new PictionaryGame();
        pictionary_stopTimer();
        pictionary_broadcastLobby();
      } else {
        pictionary_broadcastGame("Nouvelle manche : nouveau dessinateur");
        io.emit("pictionary:clear");
        pictionary_startTimer();
      }
    }
  }

  socket.on("pictionary:getState", () => {
    if (!pictionaryGame) pictionaryGame = new PictionaryGame();
    pictionary_majSocketIds();
    const lobbyState = pictionaryGame.getLobbyState();
    const estAuLobby = pictionaryGame.joueurs.some((p) => p.pseudo === pseudo);
    socket.emit("pictionary:lobby", {
      ...lobbyState,
      myUsername: pseudo,
      estAuLobby,
    });
    if (pictionaryGame.gameStarted) {
      socket.emit("pictionary:update", pictionaryGame.getState(pseudo));
      try {
        socket.emit("pictionary:replay", pictionaryGame.getStrokes());
      } catch (e) {}
    }
  });

  socket.on("pictionary:join", () => {
    if (!pictionaryGame) pictionaryGame = new PictionaryGame();
    if (pictionaryGame.gameStarted) {
      socket.emit("pictionary:error", "La partie a déjà commencé");
      pictionaryGame.addSpectator(pseudo, socket.id);
      pictionary_broadcastLobby();
      return;
    }
    pictionaryGame.removeSpectator(pseudo);
    const res = pictionaryGame.addPlayer(pseudo, socket.id);
    if (!res.success) {
      if (res.reason === "alreadyIn") {
        console.log(`⚠️  ${pseudo} est déjà dans le lobby PICTIONARY`);
      } else if (res.reason === "full") {
        socket.emit(
          "pictionary:error",
          `Le lobby est plein (${pictionaryGame.maxPlayers}/6)`
        );
      }
      pictionary_broadcastLobby();
      return;
    }
    console.log(
      `✅ ${pseudo} a rejoint le lobby PICTIONARY (${pictionaryGame.joueurs.length})`
    );
    pictionary_broadcastLobby();
  });

  socket.on("pictionary:leave", () => {
    if (!pictionaryGame) return;
    const etaitJoueur = pictionaryGame.removePlayer(pseudo);
    if (etaitJoueur) {
      console.log(`🚪 ${pseudo} a quitté le lobby PICTIONARY`);

      if (pictionaryGame.gameStarted) {
        if (pictionaryGame.joueurs.length < 2) {
          console.log(`⚠️  Partie PICTIONARY annulée (pas assez de joueurs)`);
          io.emit("pictionary:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} est parti`,
          });
          pictionaryGame = new PictionaryGame();
          pictionary_broadcastLobby();
          return;
        }
        pictionary_broadcastGame(`${pseudo} a quitté la partie`);
      }

      pictionaryGame.addSpectator(pseudo, socket.id);
      pictionary_broadcastLobby();
    } else {
      pictionaryGame.removeSpectator(pseudo);
    }
  });

  socket.on("pictionary:start", () => {
    if (!pictionaryGame) pictionaryGame = new PictionaryGame();
    const isPlayer = pictionaryGame.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer)
      return socket.emit("pictionary:error", "Tu n'es pas dans le lobby");
    if (!pictionaryGame.canStart())
      return socket.emit(
        "pictionary:error",
        "Impossible de démarrer (3 joueurs minimum)"
      );

    pictionaryGame.startGame();
    console.log(
      `🎨 Partie PICTIONARY démarrée avec ${pictionaryGame.joueurs.length} joueurs`
    );

    pictionary_startTimer();
    pictionary_majSocketIds();

    pictionaryGame.joueurs.forEach((p) => {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.emit("pictionary:gameStart", pictionaryGame.getState(p.pseudo));
    });

    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const isPlayer = pictionaryGame.joueurs.some(
        (p) => p.pseudo === clientUsername
      );
      if (!isPlayer) {
        pictionaryGame.addSpectator(clientUsername, clientSocket.id);
        clientSocket.emit(
          "pictionary:gameStart",
          pictionaryGame.getState(clientUsername)
        );
        try {
          clientSocket.emit("pictionary:replay", pictionaryGame.getStrokes());
        } catch (e) {}
      }
    });

    pictionary_broadcastLobby();
  });

  socket.on("pictionary:guess", ({ text }) => {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    const guess = String(text || "")
      .trim()
      .toLowerCase();
    if (!guess) return;

    const drawer = pictionaryGame.getCurrentDrawer();
    if (drawer && drawer.pseudo === pseudo) return;

    if (guess === String(pictionaryGame.currentWord).toLowerCase()) {
      const scored = pictionaryGame.handleCorrectGuess(pseudo);
      if (scored) {
        io.emit("pictionary:chat", {
          system: true,
          text: `${pseudo} a deviné !`,
        });
        pictionary_broadcastGame(`${pseudo} a deviné le mot`);
      }

      const nonDrawers = pictionaryGame.joueurs.filter(
        (p) => p.pseudo !== drawer.pseudo
      ).length;
      if (pictionaryGame.guessedThisRound.size >= nonDrawers) {
        const res = pictionaryGame.nextRound();
        if (res.finished) {
          const sorted = [...pictionaryGame.joueurs].sort(
            (a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo)
          );
          const winner = sorted.length > 0 ? sorted[0].pseudo : null;

          if (winner) {
            const winnerData = pictionaryGame.joueurs.find(
              (p) => p.pseudo === winner
            );
            const scoreToAdd = winnerData ? winnerData.score : 0;
            FileService.data.pictionaryWins[winner] =
              (FileService.data.pictionaryWins[winner] || 0) + scoreToAdd;
            FileService.save("pictionaryWins", FileService.data.pictionaryWins);
            helpers.broadcastPictionaryLB(io);
          }

          io.emit("pictionary:gameEnd", { winner });
          pictionaryGame = new PictionaryGame();
          pictionary_stopTimer();
          pictionary_broadcastLobby();
          return;
        } else {
          pictionary_broadcastGame("Nouvelle manche : nouveau dessinateur");
          io.emit("pictionary:clear");
          pictionary_startTimer();
          return;
        }
      }
    } else {
      io.emit("pictionary:chat", {
        name: pseudo,
        text: guess,
        at: new Date().toISOString(),
      });
    }
  });

  socket.on("pictionary:draw", (data) => {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    const drawer = pictionaryGame.getCurrentDrawer();
    if (!drawer || drawer.pseudo !== pseudo) return;
    try {
      pictionaryGame.addStroke(data);
    } catch (e) {}
    [...pictionaryGame.joueurs, ...pictionaryGame.spectators].forEach((p) => {
      const pSocket = io.sockets.sockets.get(p.socketId);
      if (pSocket && p.pseudo !== pseudo)
        pSocket.emit("pictionary:stroke", data);
    });
  });

  socket.on("pictionary:fill", (data) => {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    const drawer = pictionaryGame.getCurrentDrawer();
    if (!drawer || drawer.pseudo !== pseudo) return;
    try {
      pictionaryGame.addStroke({ ...data, type: "fill" });
    } catch (e) {}
    [...pictionaryGame.joueurs, ...pictionaryGame.spectators].forEach((p) => {
      const pSocket = io.sockets.sockets.get(p.socketId);
      if (pSocket && p.pseudo !== pseudo) pSocket.emit("pictionary:fill", data);
    });
  });

  socket.on("pictionary:clear", () => {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    const drawer = pictionaryGame.getCurrentDrawer();
    if (!drawer || drawer.pseudo !== pseudo) return;
    [...pictionaryGame.joueurs, ...pictionaryGame.spectators].forEach((p) => {
      const pSocket = io.sockets.sockets.get(p.socketId);
      if (pSocket) pSocket.emit("pictionary:clear");
    });
  });

  socket.on("pictionary:backToLobby", () => {
    io.emit("pictionary:gameEnd", { winner: "Retour au lobby" });
    pictionaryGame = new PictionaryGame();
    pictionary_stopTimer();
    pictionary_broadcastLobby();
  });

  // ------- Puissance 4 -------
  function p4_majSocketIds() {
    if (!p4Game) return;
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      p4Game.updateSocketId(clientUsername, clientSocket.id);
    });
  }

  function p4_broadcastLobby() {
    if (!p4Game) p4Game = new Puissance4Game();
    p4_majSocketIds();
    const lobbyState = p4Game.getLobbyState();
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      const estAuLobby = p4Game.joueurs.some(
        (p) => p.pseudo === clientUsername
      );
      clientSocket.emit("p4:lobby", {
        ...lobbyState,
        myUsername: clientUsername,
        estAuLobby,
      });
    });
  }

  function p4_broadcastGame(message = "") {
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
    if (!p4Game) p4Game = new Puissance4Game();
    p4_majSocketIds();
    const lobbyState = p4Game.getLobbyState();
    const estAuLobby = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    socket.emit("p4:lobby", { ...lobbyState, myUsername: pseudo, estAuLobby });
    if (p4Game.gameStarted) socket.emit("p4:update", p4Game.getState(pseudo));
  });

  socket.on("p4:join", () => {
    if (!p4Game) p4Game = new Puissance4Game();
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
        console.log(`⚠️  ${pseudo} est déjà dans le lobby P4`);
      } else if (res.reason === "full") {
        socket.emit("p4:error", "Le lobby est plein (2/2)");
      }
      p4_broadcastLobby();
      return;
    }
    console.log(
      `✅ ${pseudo} a rejoint le lobby P4 (${p4Game.joueurs.length}/2)`
    );
    p4_broadcastLobby();
  });

  socket.on("p4:leave", () => {
    if (!p4Game) return;
    const etaitJoueur = p4Game.removePlayer(pseudo);
    if (etaitJoueur) {
      console.log(`🚪 ${pseudo} a quitté le lobby P4`);
      if (p4Game.gameStarted) {
        console.log(`⚠️  Partie P4 annulée (joueur parti)`);
        io.emit("p4:gameEnd", {
          winner: "Partie annulée !",
          reason: `${pseudo} est parti`,
        });
        p4Game = new Puissance4Game();
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
    if (!p4Game) p4Game = new Puissance4Game();
    const isPlayer = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) return socket.emit("p4:error", "Tu n'es pas dans le lobby");
    if (!p4Game.canStart())
      return socket.emit(
        "p4:error",
        "Impossible de démarrer (2 joueurs requis)"
      );

    p4Game.startGame();
    console.log(`🎮 Partie P4 démarrée avec ${p4Game.joueurs.length} joueurs`);
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
    if (!p4Game || !p4Game.gameStarted) return;
    const joueur = p4Game.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("p4:error", "Tu n'es pas dans la partie");

    const res = p4Game.playMove(joueur, col);
    if (!res.success) return socket.emit("p4:error", res.message);

    if (res.winner) {
      console.log(`🏆 ${res.winner} a gagné la partie de P4 !`);
      FileService.data.p4Wins[res.winner] =
        (FileService.data.p4Wins[res.winner] || 0) + 1;
      FileService.save("p4Wins", FileService.data.p4Wins);
      helpers.broadcastP4LB(io);

      p4_broadcastGame();
      setTimeout(() => {
        io.emit("p4:gameEnd", { winner: res.winner });
        p4Game = new Puissance4Game();
        p4_broadcastLobby();
      }, 100);
      return;
    }

    if (res.draw) {
      console.log(`🤝 Match nul P4 !`);
      p4_broadcastGame();
      setTimeout(() => {
        io.emit("p4:gameEnd", { draw: true });
        p4Game = new Puissance4Game();
        p4_broadcastLobby();
      }, 100);
      return;
    }

    p4_broadcastGame();
  });

  // ------- Log off -------
  socket.on("disconnect", () => {
    const fullyDisconnected = gameState.removeUser(socket.id, pseudo);
    AntiSpam.cleanup(socket.id);

    if (fullyDisconnected) {
      io.emit("system:info", `${pseudo} a quitté le chat`);
      console.log(`>> [${pseudo}] déconnecté`);
    }

    io.emit("users:list", gameState.getUniqueUsers());

    // UNO
    if (gameActuelle) {
      const etaitJoueur = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
      if (etaitJoueur) {
        gameActuelle.removePlayer(pseudo);
        if (gameActuelle.gameStarted && gameActuelle.joueurs.length < 2) {
          console.log(`⚠️  Partie UNO annulée (${pseudo} déconnecté)`);
          io.emit("uno:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} s'est déconnecté`,
          });
          gameActuelle = new UnoGame();
        } else if (gameActuelle.gameStarted) {
          uno_broadcast(`${pseudo} s'est déconnecté`);
        }
        uno_broadcastLobby();
      } else {
        gameActuelle.removeSpectator(pseudo);
      }
    }

    // PICTIONARY
    if (pictionaryGame) {
      const etaitJoueurPic = pictionaryGame.joueurs.some(
        (p) => p.pseudo === pseudo
      );
      if (etaitJoueurPic) {
        pictionaryGame.removePlayer(pseudo);
        if (pictionaryGame.gameStarted && pictionaryGame.joueurs.length < 2) {
          console.log(`⚠️  Partie PICTIONARY annulée (${pseudo} déconnecté)`);
          io.emit("pictionary:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} s'est déconnecté`,
          });
          pictionary_stopTimer();
          pictionaryGame = new PictionaryGame();
          pictionary_broadcastLobby();
        } else if (pictionaryGame.gameStarted) {
          pictionary_broadcastGame(`${pseudo} s'est déconnecté`);
        }
        pictionary_broadcastLobby();
      } else {
        pictionaryGame.removeSpectator(pseudo);
      }
    }

    // Puissance 4
    if (p4Game) {
      const etaitJoueurP4 = p4Game.joueurs.some((p) => p.pseudo === pseudo);
      if (etaitJoueurP4) {
        console.log(`⚠️  Partie P4 annulée (${pseudo} déconnecté)`);
        if (p4Game.gameStarted) {
          io.emit("p4:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} s'est déconnecté`,
          });
        }
        p4Game = new Puissance4Game();
        p4_broadcastLobby();
      } else {
        p4Game.removeSpectator(pseudo);
      }
    }
  });
}

module.exports = { initSocketHandlers, helpers };
