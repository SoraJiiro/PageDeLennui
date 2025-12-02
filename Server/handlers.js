const { FileService } = require("./util");
const UnoGame = require("./unoGame");
const PictionaryGame = require("./pictionaryGame");
const Puissance4Game = require("./puissance4Game");
const fs = require("fs");
const path = require("path");
const config = require("./config");

// ------- Games -------
let gameActuelle = new UnoGame();
let pictionaryGame = new PictionaryGame();
let pictionaryTimer = null;
let p4Game = new Puissance4Game();

// ------- Colors -------
const orange = "\x1b[38;5;208m"; // pseudos
const reset = "\x1b[0m";
const blue = "\x1b[38;5;33m"; // Dino
const green = "\x1b[38;5;46m"; // Clicker
const pink = "\x1b[38;5;205m"; // Flappy
const violet = "\x1b[38;5;141m"; // UNO
const red = "\x1b[38;5;167m"; // P4
const grey = "\x1b[38;5;246m"; // Pictionary
const colorize = (s, color) => `${color}${s}${reset}`;
const withGame = (s, color) => `${color}${s}${reset}`;

// --- CPS / Anti-cheat tracker ---
const cpsTracker = new Map();
const CPS_THRESHOLD = Number(process.env.CPS_THRESHOLD) || 50; // clicks/sec
const CPS_DURATION_MS = Number(process.env.CPS_DURATION_MS) || 3000; // ms
const CPS_PENALTY = Number(process.env.CPS_PENALTY) || 1000; // clicks to remove
const BLACKLIST_PATH = path.join(__dirname, "..", "blacklist.json");

function getIpFromSocket(s) {
  try {
    const ipHeader = s.handshake.headers["x-forwarded-for"];
    const ip = (
      ipHeader ||
      s.request.socket.remoteAddress ||
      s.handshake.address ||
      ""
    ).replace("::ffff:", "");
    return ip || "";
  } catch (e) {
    return "";
  }
}

function persistBanIp(ip) {
  try {
    if (!fs.existsSync(BLACKLIST_PATH)) {
      const defaultData = { alwaysBlocked: [] };
      fs.writeFileSync(
        BLACKLIST_PATH,
        JSON.stringify(defaultData, null, 2),
        "utf8"
      );
    }
    const raw = fs.readFileSync(BLACKLIST_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    data.alwaysBlocked = Array.isArray(data.alwaysBlocked)
      ? data.alwaysBlocked
      : [];
    if (!data.alwaysBlocked.includes(ip)) {
      data.alwaysBlocked.push(ip);
      fs.writeFileSync(BLACKLIST_PATH, JSON.stringify(data, null, 2), "utf8");
    }
    // Update runtime config blacklist too
    if (!config.BLACKLIST.includes(ip)) config.BLACKLIST.push(ip);
    return true;
  } catch (e) {
    console.error("Erreur persistance blacklist:", e);
    return false;
  }
}

let isAlreadyLogged_bb = false;

// ------- LB manager -------
const leaderboardManager = {
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
  broadcastBlockBlastLB(io) {
    const arr = Object.entries(FileService.data.blockblastScores)
      .map(([u, s]) => ({
        pseudo: u,
        score: s,
        timeMs: FileService.data.blockblastBestTimes
          ? FileService.data.blockblastBestTimes[u] || null
          : null,
      }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("blockblast:leaderboard", arr);
  },
  broadcastSnakeLB(io) {
    const arr = Object.entries(FileService.data.snakeScores)
      .map(([u, s]) => ({
        pseudo: u,
        score: s,
        timeMs: FileService.data.snakeBestTimes
          ? FileService.data.snakeBestTimes[u] || null
          : null,
      }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("snake:leaderboard", arr);
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
  // Joindre la room admin si Admin
  if (pseudo === "Admin") {
    try {
      socket.join("admins");
      // Envoyer l'historique récent des logs au nouvel admin connecté
      if (io._serverLogBuffer && Array.isArray(io._serverLogBuffer)) {
        socket.emit("server:log:init", io._serverLogBuffer);
      }
    } catch {}
  }
  gameState.addUser(socket.id, pseudo, io);
  if (pseudo !== "Admin") {
    console.log(`>> [${colorize(pseudo, orange)}] connecté`);
  }

  // Envoi dada initiales
  socket.emit("you:name", pseudo);
  socket.emit("chat:history", FileService.data.historique);
  socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] || 0 });

  const rawUserMedalsInit = FileService.data.medals[pseudo] || [];
  const normalizedInit = rawUserMedalsInit.map((m) =>
    typeof m === "string"
      ? { name: m, colors: [] }
      : { name: m.name, colors: Array.isArray(m.colors) ? m.colors : [] }
  );

  // Si le joueur est dans la liste des tricheurs, on force l'ajout de la médaille Tricheur
  if (
    FileService.data.cheaters &&
    FileService.data.cheaters.includes(pseudo) &&
    !normalizedInit.find((m) => m.name === "Tricheur")
  ) {
    normalizedInit.unshift({
      name: "Tricheur",
      colors: ["#dcdcdc", "#ffffff", "#222", "#dcdcdc", "#ffffff", "#222"],
    });
  }

  socket.emit("clicker:medals", normalizedInit);
  leaderboardManager.broadcastClickerLB(io);
  leaderboardManager.broadcastDinoLB(io);
  leaderboardManager.broadcastFlappyLB(io);
  leaderboardManager.broadcastUnoLB(io);
  leaderboardManager.broadcastPictionaryLB(io);
  leaderboardManager.broadcastP4LB(io);
  leaderboardManager.broadcastBlockBlastLB(io);
  leaderboardManager.broadcastSnakeLB(io);

  io.emit("users:list", gameState.getUniqueUsers());
  if (pseudo !== "Admin") {
    io.emit("system:info", `${pseudo} a rejoint le chat`);
  }

  // ------- Chat -------
  socket.on("chat:message", ({ text }) => {
    const msg = String(text || "").trim();
    if (!msg) return;

    const tagData = FileService.data.tags
      ? FileService.data.tags[pseudo]
      : null;
    let tagPayload = null;
    if (tagData) {
      if (typeof tagData === "string") {
        tagPayload = { text: tagData, color: null };
      } else if (typeof tagData === "object") {
        tagPayload = tagData;
      }
    }

    const payload = {
      name: pseudo,
      text: msg,
      at: new Date().toISOString(),
      tag: tagPayload,
    };

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
    try {
      const ip = getIpFromSocket(socket);
      const now = Date.now();

      // Tracker per-IP timestamps (sliding window)
      let track = cpsTracker.get(ip);
      if (!track) {
        track = { timestamps: [], violationStart: null, banned: false };
        cpsTracker.set(ip, track);
      }

      // push and prune older than 2s
      track.timestamps.push(now);
      const cutoff = now - 2000;
      while (track.timestamps.length && track.timestamps[0] < cutoff)
        track.timestamps.shift();

      // compute cps over last 1s
      const oneSecCut = now - 1000;
      const cps = track.timestamps.filter((t) => t >= oneSecCut).length;

      // Normal click increment
      FileService.data.clicks[pseudo] =
        (FileService.data.clicks[pseudo] || 0) + 1;
      FileService.save("clicks", FileService.data.clicks);
      socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });
      leaderboardManager.broadcastClickerLB(io);

      // If already banned earlier in this runtime, ignore
      if (track.banned) return;

      if (cps > CPS_THRESHOLD) {
        if (!track.violationStart) track.violationStart = now;
        // If sustained over duration -> Ban
        if (now - track.violationStart >= CPS_DURATION_MS) {
          track.banned = true;
          // Penalize: remove clicks
          const current = FileService.data.clicks[pseudo] || 0;
          // Autoriser score négatif pour marquer le tricheur
          const penalized = current - CPS_PENALTY;
          FileService.data.clicks[pseudo] = penalized;
          FileService.save("clicks", FileService.data.clicks);

          // Si score négatif, ajouter aux tricheurs
          if (penalized < 0) {
            if (!FileService.data.cheaters) FileService.data.cheaters = [];
            if (!FileService.data.cheaters.includes(pseudo)) {
              FileService.data.cheaters.push(pseudo);
              FileService.save("cheaters", FileService.data.cheaters);
            }
          }

          // Recalculate medals (local simplified version)
          try {
            // Recompute medals similarly to adminRoutes
            const medalsList = [
              { nom: "Bronze", pallier: 2500 },
              { nom: "Argent", pallier: 5000 },
              { nom: "Or", pallier: 10000 },
              { nom: "Diamant", pallier: 20000 },
              { nom: "Rubis", pallier: 40000 },
              { nom: "Saphir", pallier: 80000 },
              { nom: "Légendaire", pallier: 160000 },
            ];
            function generatePrestigeMedals() {
              const prestige = [];
              let precedente = medalsList[medalsList.length - 1];
              for (let idx = 8; idx <= 21; idx++) {
                let pallierTemp = precedente.pallier * 2;
                let pallier = Math.ceil(pallierTemp * 0.85 - 6500);
                prestige.push({ nom: `Médaille Prestige - ${idx}`, pallier });
                precedente = { pallier };
              }
              return prestige;
            }
            const allMedals = [...medalsList, ...generatePrestigeMedals()];
            if (!FileService.data.medals) FileService.data.medals = {};
            const existingMedals = FileService.data.medals[pseudo] || [];
            const existingColors = {};
            existingMedals.forEach((m) => {
              if (m && m.colors && m.colors.length > 0)
                existingColors[m.name] = m.colors;
            });
            const userMedals = [];
            for (const medal of allMedals) {
              if (penalized >= medal.pallier) {
                userMedals.push({
                  name: medal.nom,
                  colors: existingColors[medal.nom] || [],
                });
              }
            }
            FileService.data.medals[pseudo] = userMedals;
            FileService.save("medals", FileService.data.medals);
          } catch (e) {
            console.warn("Erreur recalcul médailles après pénalité", e);
          }

          // Persist ban in blacklist.json (alwaysBlocked)
          persistBanIp(ip);

          console.log({
            level: "action",
            message: `IP ${ip} bannie automatiquement pour CPS élevé. ${CPS_PENALTY} clicks retirés à ${pseudo}`,
          });

          // Notify and disconnect sockets from that IP
          io.sockets.sockets.forEach((s) => {
            const sIp = getIpFromSocket(s);
            if (sIp === ip) {
              try {
                s.emit("system:notification", {
                  message: "🚫 Your IP has been banned for abnormal CPS",
                  duration: 8000,
                });
              } catch (e) {}
              try {
                s.disconnect(true);
              } catch (e) {}
            }
          });

          // Broadcast updated leaderboard
          leaderboardManager.broadcastClickerLB(io);
        }
      } else {
        // reset violationStart when under threshold
        track.violationStart = null;
      }
    } catch (e) {
      console.error("Erreur lors du traitement clicker:click:", e);
    }
  });

  socket.on("clicker:penalty", () => {
    try {
      const userMedals = FileService.data.medals[pseudo] || [];
      const hasTricheurMedal = userMedals.some((m) =>
        typeof m === "string" ? m === "Tricheur" : m.name === "Tricheur"
      );
      const isInCheatersList =
        FileService.data.cheaters && FileService.data.cheaters.includes(pseudo);

      // Vérifier si le joueur est bien un tricheur (soit dans la liste, soit a la médaille)
      if (isInCheatersList || hasTricheurMedal) {
        const current = FileService.data.clicks[pseudo] || 0;
        FileService.data.clicks[pseudo] = current - 2;
        FileService.save("clicks", FileService.data.clicks);
        socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });
        leaderboardManager.broadcastClickerLB(io);

        // Sync cheaters list if needed
        if (!isInCheatersList) {
          if (!FileService.data.cheaters) FileService.data.cheaters = [];
          FileService.data.cheaters.push(pseudo);
          FileService.save("cheaters", FileService.data.cheaters);
        }

        // Log optionnel pour debug
        // console.log(`Pénalité appliquée à ${pseudo}`);
      }
    } catch (e) {
      console.error("Erreur lors du traitement clicker:penalty:", e);
    }
  });

  socket.on("clicker:reset", () => {
    FileService.data.clicks[pseudo] = 0;
    FileService.save("clicks", FileService.data.clicks);

    FileService.data.medals[pseudo] = [];
    FileService.save("medals", FileService.data.medals);
    socket.emit("clicker:you", { score: 0 });

    // Si le joueur est un tricheur, on lui renvoie la médaille Tricheur même après reset
    const medalsToSend = [];
    if (
      FileService.data.cheaters &&
      FileService.data.cheaters.includes(pseudo)
    ) {
      medalsToSend.push({
        name: "Tricheur",
        colors: ["#dcdcdc", "#ffffff", "#222", "#dcdcdc", "#ffffff", "#222"],
      });
    }
    socket.emit("clicker:medals", medalsToSend);

    leaderboardManager.broadcastClickerLB(io);

    console.log(
      withGame(
        `\n🔄 Reset Clicker complet pour [${orange}${pseudo}${green}]\n`,
        green
      )
    );
  });

  socket.on("clicker:medalUnlock", ({ medalName, colors }) => {
    if (typeof medalName !== "string" || medalName.trim() === "") return;

    const allMedals = FileService.data.medals;
    const userMedals = allMedals[pseudo] || [];

    const already = userMedals.find((m) =>
      typeof m === "string" ? m === medalName : m.name === medalName
    );
    if (already) return; // rien à faire

    const entry = {
      name: medalName,
      colors:
        Array.isArray(colors) && colors.length >= 3
          ? colors.slice(0, 24) // limiter pour éviter surcharge
          : [],
    };
    userMedals.push(entry);
    allMedals[pseudo] = userMedals;
    FileService.save("medals", allMedals);

    console.log(
      withGame(`🏅 [${orange}${pseudo}${green}] a débloqué ${medalName}`, green)
    );

    // Ré-émission normalisée (objets complets)
    const normalized = userMedals.map((m) =>
      typeof m === "string"
        ? { name: m, colors: [] }
        : { name: m.name, colors: Array.isArray(m.colors) ? m.colors : [] }
    );
    socket.emit("clicker:medals", normalized);
  });

  // ------- Dino -------
  socket.on("dino:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = FileService.data.dinoScores[pseudo] || 0;
    if (s > current) {
      FileService.data.dinoScores[pseudo] = s;
      FileService.save("dinoScores", FileService.data.dinoScores);
      console.log(
        withGame(
          `\n🦖 Nouveau score Dino pour [${orange}${pseudo}${blue}] -> ${s}\n`,
          blue
        )
      );
    }
    leaderboardManager.broadcastDinoLB(io);
  });

  socket.on("dino:reset", () => {
    FileService.data.dinoScores[pseudo] = 0;
    FileService.save("dinoScores", FileService.data.dinoScores);
    console.log(
      withGame(`\n🔄 Reset Dino pour [${orange}${pseudo}${blue}]\n`, blue)
    );
    leaderboardManager.broadcastDinoLB(io);
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
      console.log(
        withGame(
          `\n🐤 Nouveau score Flappy pour [${orange}${pseudo}${pink}] -> ${s}\n`,
          pink
        )
      );
    }
    leaderboardManager.broadcastFlappyLB(io);
  });

  socket.on("flappy:reset", () => {
    FileService.data.flappyScores[pseudo] = 0;
    FileService.save("flappyScores", FileService.data.flappyScores);
    console.log(
      withGame(`\n🔄 Reset Flappy pour [${orange}${pseudo}${pink}]\n`, pink)
    );
    leaderboardManager.broadcastFlappyLB(io);
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

  function uno_broadcast(message = "", resetTimer = false) {
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
    if (gameActuelle && gameActuelle.turnTimer) {
      clearTimeout(gameActuelle.turnTimer);
      gameActuelle.turnTimer = null;
    }
    if (gameActuelle) gameActuelle.turnDeadlineAt = null;
  }

  function uno_startTurnTimer() {
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
        console.log(
          withGame(
            `⚠️  [${orange}${pseudo}${violet}] est déjà dans le lobby UNO`,
            violet
          )
        );
      uno_broadcastLobby();
      return;
    }

    console.log(
      withGame(
        `\n➡️ [${orange}${pseudo}${violet}] a rejoint le lobby UNO (${gameActuelle.joueurs.length}/4)`,
        violet
      )
    );
    uno_broadcastLobby();
  });

  socket.on("uno:leave", () => {
    if (!gameActuelle) return;
    const wasCurrent =
      gameActuelle.getCurrentPlayer() &&
      gameActuelle.getCurrentPlayer().pseudo === pseudo;
    const etaitJoueur = gameActuelle.removePlayer(pseudo);

    if (etaitJoueur) {
      console.log(
        withGame(
          `⬅️ [${orange}${pseudo}${violet}] a quitté le lobby UNO`,
          violet
        )
      );
      if (gameActuelle.gameStarted) {
        if (gameActuelle.joueurs.length < 2) {
          console.log(
            withGame(`⚠️  Partie UNO annulée (pas assez de joueurs)`, violet)
          );
          uno_clearTurnTimer();
          gameActuelle = new UnoGame();
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
    if (!gameActuelle) return;
    const isPlayer = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) return socket.emit("uno:error", "Tu n'es pas dans le lobby");
    if (!gameActuelle.canStart())
      return socket.emit(
        "uno:error",
        "Impossible de démarrer (2-4 joueurs requis)"
      );

    gameActuelle.startGame();

    const joueursActu = gameActuelle.joueurs.map(
      (j) => `${orange}${j.pseudo}${violet}`
    );
    console.log(
      withGame(
        `\n🎮 Partie UNO démarrée avec ${
          gameActuelle.joueurs.length
        } joueurs (${joueursActu.join(", ")})`,
        violet
      )
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
      console.log(
        withGame(
          `\n🏆 [${orange}${res.winner}${violet}] a gagné la partie de UNO !\n`,
          violet
        )
      );
      uno_clearTurnTimer();
      FileService.data.unoWins[res.winner] =
        (FileService.data.unoWins[res.winner] || 0) + 1;
      FileService.save("unoWins", FileService.data.unoWins);
      io.emit("uno:gameEnd", { winner: res.winner });
      leaderboardManager.broadcastUnoLB(io);
      gameActuelle = new UnoGame();
      uno_broadcastLobby();
      return;
    }

    // Après un play, le tour change -> resetTimer = true
    uno_broadcast(res.message, true);
  });

  socket.on("uno:draw", () => {
    if (!gameActuelle || !gameActuelle.gameStarted) return;
    const joueur = gameActuelle.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("uno:error", "Tu n'es pas dans la partie");
    const res = gameActuelle.drawCard(joueur);
    if (!res.success) return socket.emit("uno:error", res.message);
    // Après une pioche volontaire, le tour passe -> resetTimer = true
    uno_broadcast(res.message, true);
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
          leaderboardManager.broadcastPictionaryLB(io);
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
        console.log(
          withGame(
            `⚠️  [${orange}${pseudo}${grey}] est déjà dans le lobby PICTIONARY`,
            grey
          )
        );
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
      withGame(
        `\n➡️ [${orange}${pseudo}${grey}] a rejoint le lobby PICTIONARY (${pictionaryGame.joueurs.length}/6)`,
        grey
      )
    );
    pictionary_broadcastLobby();
  });

  socket.on("pictionary:leave", () => {
    if (!pictionaryGame) return;
    const etaitJoueur = pictionaryGame.removePlayer(pseudo);
    if (etaitJoueur) {
      console.log(
        withGame(
          `⬅️ [${orange}${pseudo}${grey}] a quitté le lobby PICTIONARY`,
          grey
        )
      );

      if (pictionaryGame.gameStarted) {
        if (pictionaryGame.joueurs.length < 2) {
          console.log(
            withGame(
              `⚠️  Partie PICTIONARY annulée (pas assez de joueurs)`,
              grey
            )
          );
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

    const joueursActu = gameActuelle.joueurs.map(
      (j) => `${orange}${j.pseudo}${violet}`
    );

    console.log(
      withGame(
        `\n🎨 Partie PICTIONARY démarrée avec ${
          pictionaryGame.joueurs.length
        } joueurs (${joueursActu.join(", ")})`,
        grey
      )
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
            leaderboardManager.broadcastPictionaryLB(io);
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
        console.log(
          withGame(
            `⚠️  [${orange}${pseudo}${red}] est déjà dans le lobby PUISSANCE 4`,
            red
          )
        );
      } else if (res.reason === "full") {
        socket.emit("p4:error", "Le lobby est plein (2/2)");
      }
      p4_broadcastLobby();
      return;
    }
    console.log(
      withGame(
        `\n➡️ [${orange}${pseudo}${red}] a rejoint le lobby PUISSANCE 4 (${p4Game.joueurs.length}/2)`,
        red
      )
    );
    p4_broadcastLobby();
  });

  socket.on("p4:leave", () => {
    if (!p4Game) return;
    const etaitJoueur = p4Game.removePlayer(pseudo);
    if (etaitJoueur) {
      console.log(
        withGame(
          `⬅️ [${orange}${pseudo}${red}] a quitté le lobby PUISSANCE 4`,
          red
        )
      );
      if (p4Game.gameStarted) {
        console.log(
          withGame(`⚠️  Partie Puissance4 annulée (joueur parti)`, red)
        );
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
    console.log(
      withGame(
        `\n🎮 Partie Puissance4 démarrée avec ${p4Game.joueurs.length} joueurs`,
        red
      )
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
    if (!p4Game || !p4Game.gameStarted) return;
    const joueur = p4Game.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return socket.emit("p4:error", "Tu n'es pas dans la partie");

    const res = p4Game.playMove(joueur, col);
    if (!res.success) return socket.emit("p4:error", res.message);

    if (res.winner) {
      console.log(
        withGame(
          `\n🏆 [${orange}${res.winner}${red}] a gagné la partie de Puissance4 !\n`,
          red
        )
      );
      FileService.data.p4Wins[res.winner] =
        (FileService.data.p4Wins[res.winner] || 0) + 1;
      FileService.save("p4Wins", FileService.data.p4Wins);
      leaderboardManager.broadcastP4LB(io);

      p4_broadcastGame();
      setTimeout(() => {
        io.emit("p4:gameEnd", { winner: res.winner });
        p4Game = new Puissance4Game();
        p4_broadcastLobby();
      }, 100);
      return;
    }

    if (res.draw) {
      console.log(withGame(`\n🤝 Match nul Puissance4 !\n`, red));
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

  // ------- Block Blast -------
  socket.on("blockblast:score", ({ score, elapsedMs, final }) => {
    const s = Number(score);

    if (isNaN(s) || s < 0) return;

    const current = FileService.data.blockblastScores[pseudo] || 0;

    if (s > current) {
      FileService.data.blockblastScores[pseudo] = s;
      FileService.save("blockblastScores", FileService.data.blockblastScores);
      // Si score meilleur et indication finale, enregistrer le temps de run
      if (final === true && typeof elapsedMs === "number") {
        if (!FileService.data.blockblastBestTimes)
          FileService.data.blockblastBestTimes = {};
        FileService.data.blockblastBestTimes[pseudo] = Math.max(0, elapsedMs);
        FileService.save(
          "blockblastBestTimes",
          FileService.data.blockblastBestTimes
        );
      }
      if (isAlreadyLogged_bb === false) {
        console.log(
          withGame(
            `\n🧱 Nouveau score Block Blast pour [${orange}${pseudo}${green}] -> ${s}\n`,
            green
          )
        );
        isAlreadyLogged_bb = true;
      }
    } else if (
      final === true &&
      s === current &&
      typeof elapsedMs === "number"
    ) {
      // Si la partie se termine avec un score égal au record actuel, mettre à jour le temps du meilleur run
      if (!FileService.data.blockblastBestTimes)
        FileService.data.blockblastBestTimes = {};
      FileService.data.blockblastBestTimes[pseudo] = Math.max(0, elapsedMs);
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes
      );
    }

    leaderboardManager.broadcastBlockBlastLB(io);
  });

  socket.on("blockblast:saveMove", (moveData) => {
    try {
      // If saving blockblast history is disabled in config, skip
      if (!config.SAVE_BLOCKBLAST_HISTORY) return;
      // Créer le dossier d'historique si nécessaire
      const historyDir = path.join(config.DATA, "blockblast_history");
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      // Nom du fichier basé sur le pseudo et la date
      const date = new Date().toISOString().split("T")[0];
      // Sanitize pseudo pour un nom de fichier Windows-safe
      const safePseudo = String(pseudo).replace(/[^a-z0-9_-]/gi, "_");
      const filename = path.join(historyDir, `${safePseudo}_${date}.jsonl`);

      // Ajouter le pseudo et la date aux données
      const dataToSave = {
        ...moveData,
        pseudo,
        date: new Date().toISOString(),
      };

      fs.appendFileSync(filename, JSON.stringify(dataToSave) + "\n");
    } catch (err) {
      console.error(
        "Erreur lors de la sauvegarde du mouvement Block Blast:",
        err
      );
    }
  });

  socket.on("blockblast:reset", () => {
    // Réinitialiser le meilleur score à 0
    FileService.data.blockblastScores[pseudo] = 0;
    FileService.save("blockblastScores", FileService.data.blockblastScores);

    // Réinitialiser le temps du meilleur run
    if (FileService.data.blockblastBestTimes) {
      delete FileService.data.blockblastBestTimes[pseudo];
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes
      );
    }

    // Effacer toute sauvegarde de grille associée à ce joueur
    if (
      FileService.data.blockblastSaves &&
      FileService.data.blockblastSaves[pseudo]
    ) {
      delete FileService.data.blockblastSaves[pseudo];
      FileService.save("blockblastSaves", FileService.data.blockblastSaves);
    }
    console.log(
      withGame(
        `\n🔄 Reset Block Blast pour [${orange}${pseudo}${green}]\n`,
        green
      )
    );
    leaderboardManager.broadcastBlockBlastLB(io);
    socket.emit("blockblast:resetConfirm", { success: true });
  });

  // Sauvegarde/restauration de l'état courant de Block Blast
  socket.on(
    "blockblast:saveState",
    ({ grid, score, pieces, elapsedMs, gameOver }) => {
      try {
        // Validation simple
        if (
          !Array.isArray(grid) ||
          typeof score !== "number" ||
          !Array.isArray(pieces)
        )
          return;
        // Ne pas enregistrer les états finaux
        if (gameOver === true) return;
        if (!FileService.data.blockblastSaves)
          FileService.data.blockblastSaves = {};
        // Inclure elapsedMs si fourni (nombre de ms depuis le début de la partie)
        FileService.data.blockblastSaves[pseudo] = {
          grid,
          score,
          pieces,
          elapsedMs: typeof elapsedMs === "number" ? elapsedMs : 0,
        };
        FileService.save("blockblastSaves", FileService.data.blockblastSaves);
      } catch (e) {
        console.error("Erreur saveState Block Blast:", e);
      }
    }
  );

  socket.on("blockblast:loadState", () => {
    try {
      const save = FileService.data.blockblastSaves?.[pseudo] || null;
      if (save) {
        socket.emit("blockblast:state", { found: true, state: save });
      } else {
        socket.emit("blockblast:state", { found: false });
      }
    } catch (e) {
      socket.emit("blockblast:state", { found: false });
    }
  });

  socket.on("blockblast:clearState", () => {
    if (
      FileService.data.blockblastSaves &&
      FileService.data.blockblastSaves[pseudo]
    ) {
      delete FileService.data.blockblastSaves[pseudo];
      FileService.save("blockblastSaves", FileService.data.blockblastSaves);
    }
  });

  // ------- Snake -------
  let isAlreadyLogged_snake = false;

  socket.on("snake:score", ({ score, elapsedMs, final }) => {
    const s = Number(score);

    if (isNaN(s) || s < 0) return;

    const current = FileService.data.snakeScores[pseudo] || 0;

    if (s > current) {
      FileService.data.snakeScores[pseudo] = s;
      FileService.save("snakeScores", FileService.data.snakeScores);
      // Si score meilleur et indication finale, enregistrer le temps de run
      if (final === true && typeof elapsedMs === "number") {
        if (!FileService.data.snakeBestTimes)
          FileService.data.snakeBestTimes = {};
        FileService.data.snakeBestTimes[pseudo] = Math.max(0, elapsedMs);
        FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
      }
      if (isAlreadyLogged_snake === false) {
        console.log(
          withGame(
            `\n🐍 Nouveau score Snake pour [${orange}${pseudo}${green}] -> ${s}\n`,
            green
          )
        );
        isAlreadyLogged_snake = true;
      }
    } else if (
      final === true &&
      s === current &&
      typeof elapsedMs === "number"
    ) {
      // Si la partie se termine avec un score égal au record actuel, mettre à jour le temps du meilleur run
      if (!FileService.data.snakeBestTimes)
        FileService.data.snakeBestTimes = {};
      FileService.data.snakeBestTimes[pseudo] = Math.max(0, elapsedMs);
      FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
    }

    leaderboardManager.broadcastSnakeLB(io);
  });

  socket.on("snake:reset", () => {
    console.log(
      withGame(`\n🔄 Reset Snake pour [${orange}${pseudo}${green}]\n`, green)
    );
    leaderboardManager.broadcastSnakeLB(io);
    socket.emit("snake:resetConfirm", { success: true });
  });

  socket.on("snake:getBest", () => {
    const bestScore = FileService.data.snakeScores[pseudo] || 0;
    const bestTime = FileService.data.snakeBestTimes?.[pseudo] || 0;
    socket.emit("snake:best", { score: bestScore, timeMs: bestTime });
  });

  socket.on("snake:requestLeaderboard", () => {
    leaderboardManager.broadcastSnakeLB(io);
  });

  // ------- Admin Events -------
  // Admin: blacklist management via socket (Admin only)
  socket.on("admin:blacklist:get", () => {
    if (pseudo !== "Admin") return;
    try {
      // Return the runtime blacklist and the forced list. Do not expose or rely on file writes here.
      const data = {
        alwaysBlocked: Array.isArray(config.BLACKLIST)
          ? config.BLACKLIST.slice()
          : [],
      };
      const forced = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      socket.emit("admin:blacklist:result", { success: true, data, forced });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur lecture blacklist",
      });
    }
  });

  socket.on("admin:blacklist:add", ({ ip }) => {
    if (pseudo !== "Admin") return;
    if (!ip)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "IP manquante",
      });
    try {
      // Do not persist admin-added IPs to disk. Keep them runtime-only in config.BLACKLIST.
      if (!Array.isArray(config.BLACKLIST)) config.BLACKLIST = [];
      if (!config.BLACKLIST.includes(ip)) config.BLACKLIST.push(ip);
      const data = { alwaysBlocked: config.BLACKLIST.slice() };
      // disconnect any currently connected sockets from that IP
      try {
        io.sockets.sockets.forEach((s) => {
          try {
            const sIp = getIpFromSocket(s);
            if (sIp === ip) {
              try {
                s.emit("system:notification", {
                  message: "🚫 Votre IP a été bannie",
                  duration: 8000,
                });
              } catch (e) {}
              try {
                setTimeout(() => s.disconnect(true), 2500);
              } catch (e) {}
            }
          } catch (e) {}
        });
      } catch (e) {}
      // notify all admins of updated runtime list
      io.to("admins").emit("admin:blacklist:updated", data.alwaysBlocked);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur ajout blacklist",
      });
    }
  });

  socket.on("admin:blacklist:remove", ({ ip }) => {
    if (pseudo !== "Admin") return;
    if (!ip)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "IP manquante",
      });
    try {
      // Prevent removing forced IPs
      const forcedList = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      if (forcedList.includes(ip)) {
        return socket.emit("admin:blacklist:result", {
          success: false,
          message: "Impossible de retirer une IP forcée",
        });
      }
      // Remove from runtime-only blacklist (do not touch blacklist.json)
      if (!Array.isArray(config.BLACKLIST)) config.BLACKLIST = [];
      config.BLACKLIST = config.BLACKLIST.filter((v) => v !== ip);
      const data = { alwaysBlocked: config.BLACKLIST.slice() };
      // notify admins
      io.to("admins").emit("admin:blacklist:updated", data.alwaysBlocked);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur suppression blacklist",
      });
    }
  });

  socket.on("admin:blacklist:set", ({ alwaysBlocked }) => {
    if (pseudo !== "Admin") return;
    try {
      // Replace the runtime blacklist only. Forced IPs are merged but we DO NOT persist admin changes to disk.
      const forcedList = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      const provided = Array.isArray(alwaysBlocked) ? alwaysBlocked : [];
      const merged = Array.from(new Set([...forcedList, ...provided]));
      const data = { alwaysBlocked: merged };
      config.BLACKLIST = data.alwaysBlocked.slice();
      // disconnect any currently connected sockets that are now blacklisted
      try {
        io.sockets.sockets.forEach((s) => {
          try {
            const sIp = getIpFromSocket(s);
            if (config.BLACKLIST.includes(sIp)) {
              try {
                s.emit("system:notification", {
                  message: "🚫 Votre IP a été bannie",
                  duration: 8000,
                });
              } catch (e) {}
              try {
                s.disconnect(true);
              } catch (e) {}
            }
          } catch (e) {}
        });
      } catch (e) {}
      io.to("admins").emit("admin:blacklist:updated", data.alwaysBlocked);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur écriture blacklist",
      });
    }
  });
  socket.on("admin:refresh", () => {
    if (pseudo === "Admin") {
      leaderboardManager.broadcastClickerLB(io);
      leaderboardManager.broadcastDinoLB(io);
      leaderboardManager.broadcastFlappyLB(io);
      leaderboardManager.broadcastUnoLB(io);
      leaderboardManager.broadcastPictionaryLB(io);
      leaderboardManager.broadcastP4LB(io);
      leaderboardManager.broadcastBlockBlastLB(io);
      leaderboardManager.broadcastSnakeLB(io);
    }
  });

  socket.on("admin:global-notification", ({ message, withCountdown }) => {
    if (pseudo === "Admin" && message) {
      const duration = 8000;
      io.emit("system:notification", {
        message: `📢 [ADMIN] ${message}`,
        duration: duration,
        withCountdown: withCountdown || false,
      });
      console.log({
        level: "action",
        message: `Notification globale envoyée: ${message} -- withCountdown?: ${withCountdown}`,
      });

      if (withCountdown) {
        setTimeout(() => {
          io.emit("system:redirect", "/ferme.html");
        }, duration + 4000);
      }
    }
  });

  // ------- Log off -------
  socket.on("disconnect", () => {
    const fullyDisconnected = gameState.removeUser(socket.id, pseudo);

    if (fullyDisconnected && pseudo !== "Admin") {
      io.emit("system:info", `${pseudo} a quitté le chat`);
      console.log(`>> [${colorize(pseudo, orange)}] déconnecté`);
    }

    io.emit("users:list", gameState.getUniqueUsers());

    // UNO
    if (gameActuelle) {
      const wasCurrent =
        gameActuelle.getCurrentPlayer() &&
        gameActuelle.getCurrentPlayer().pseudo === pseudo;
      const etaitJoueur = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
      if (etaitJoueur) {
        gameActuelle.removePlayer(pseudo);
        if (gameActuelle.gameStarted && gameActuelle.joueurs.length < 2) {
          console.log(
            withGame(
              `⚠️  Partie UNO annulée ([${orange}${pseudo}${violet}] déconnecté)`,
              violet
            )
          );
          io.emit("uno:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} s'est déconnecté`,
          });
          uno_clearTurnTimer();
          gameActuelle = new UnoGame();
        } else if (gameActuelle.gameStarted) {
          // Reset timer seulement si le joueur courant a quitté
          uno_broadcast(`${pseudo} s'est déconnecté`, wasCurrent);
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
          console.log(
            withGame(
              `⚠️  Partie PICTIONARY annulée ([${orange}${pseudo}${grey}] déconnecté)`,
              grey
            )
          );
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

    // PUISSANCE 4
    if (p4Game) {
      const etaitJoueurP4 = p4Game.joueurs.some((p) => p.pseudo === pseudo);
      if (etaitJoueurP4) {
        if (p4Game.gameStarted) {
          console.log(
            withGame(
              `⚠️  Partie Puissance4 annulée ([${orange}${pseudo}${red}] déconnecté)`,
              red
            )
          );
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

module.exports = { initSocketHandlers, leaderboardManager };
