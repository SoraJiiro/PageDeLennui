// -----------------------------
// Init
// -----------------------------
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const session = require("express-session");
const sharedSession = require("express-socket.io-session");
const { Server } = require("socket.io");

// -----------------------------
// Import
// -----------------------------
const authRoutes = require("./Server/authRoutes");
const requireAuth = require("./Server/requireAuth");
const UnoGame = require("./Server/unoGame");
const PictionaryGame = require("./Server/pictionaryGame");
const Puissance4Game = require("./Server/puissance4Game");

// -----------------------------
// Config
// -----------------------------
const PORT = process.env.PORT || 7750;
const HOTE = "";
const SESSION_SECRET = process.env.CLE_SID;

const app = express();
const serveur = http.createServer(app);
const io = new Server(serveur);

// -----------------------------
// Middleware
// -----------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const expressSession = session({
  name: "sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

app.use(expressSession);
io.use(sharedSession(expressSession, { autoSave: true }));

// -----------------------------
// Blacklist
// -----------------------------
const blacklist = [
  "192.168.197.197",
  "192.168.197.1",
  "192.168.193.193",
  "192.168.193.1",
];
app.use((req, res, next) => {
  const ip = (
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    ""
  ).replace("::ffff:", "");
  if (blacklist.includes(ip)) {
    console.log(`\n🚫 Accès refusé à ${ip} (HTTP blacklist)\n`);
    res
      .status(403)
      .send(
        `<html><body><h1>Accès refusé</h1><p>Votre IP (${ip}) n'est pas reconnue.</p></body></html>`
      );
    return;
  }
  next();
});

// -----------------------------
// Routing
// -----------------------------
const WEBROOT = path.join(__dirname, "Public");
app.use("/api", authRoutes);

app.get("/login", (req, res) => res.sendFile(path.join(WEBROOT, "login.html")));
app.get("/register", (req, res) =>
  res.sendFile(path.join(WEBROOT, "register.html"))
);

app.use(requireAuth);
app.use(express.static(WEBROOT));

// -----------------------------
// Gestion des fichiers JSON
// -----------------------------
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

function readJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8").trim();
      if (!raw) throw new Error("empty");
      return JSON.parse(raw);
    }
  } catch {
    console.warn(`⚠️ Fichier corrompu : ${file}, régénéré.`);
  }
  fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  return fallback;
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

const files = {
  leaderboard: path.join(dataDir, "leaderboard.json"),
  historique: path.join(dataDir, "chat_history.json"),
  chatLogs: path.join(dataDir, "chat_logs.jsonl"),
  dinoScores: path.join(dataDir, "dino_scores.json"),
  flappyScores: path.join(dataDir, "flappy_scores.json"),
  unoWins: path.join(dataDir, "uno_wins.json"),
  medals: path.join(dataDir, "medals.json"),
  p4Wins: path.join(dataDir, "p4_wins.json"),
};

let scores = readJSON(files.leaderboard, {});
let historique = readJSON(files.historique, []);
let dinoScores = readJSON(files.dinoScores, {});
let medals = readJSON(files.medals, {});
let flappyScores = readJSON(files.flappyScores, {});
let unoWins = readJSON(files.unoWins, {});
let p4Wins = readJSON(files.p4Wins, {});

// -----------------------------
// Logique principale
// -----------------------------
let users = new Map();
let userSockets = new Map(); // pseudo -> Set de socket.id
let unoGames = new Map();
let gameActuelle = new UnoGame();
let pictionaryGame = new PictionaryGame();
let pictionaryTimer = null; // interval id
let p4Game = new Puissance4Game();

// -----------------------------
// Helpers Pictionary
// -----------------------------
function broadcastPictionaryLobbyGlobal() {
  if (!pictionaryGame) pictionaryGame = new PictionaryGame();
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

function broadcastPictionaryGameGlobal(message = "") {
  if (!pictionaryGame || !pictionaryGame.gameStarted) return;
  [...pictionaryGame.joueurs, ...pictionaryGame.spectators].forEach((p) => {
    const pSocket = io.sockets.sockets.get(p.socketId);
    if (pSocket) {
      const state = pictionaryGame.getState(p.pseudo);
      if (message) state.message = message;
      pSocket.emit("pictionary:update", state);
    }
  });
}

function startPictionaryTimer() {
  if (!pictionaryGame || !pictionaryGame.gameStarted) return;
  stopPictionaryTimer();
  pictionaryTimer = setInterval(() => {
    tickPictionary();
  }, 1000);
}

function stopPictionaryTimer() {
  if (pictionaryTimer) {
    clearInterval(pictionaryTimer);
    pictionaryTimer = null;
  }
}

function tickPictionary() {
  if (!pictionaryGame || !pictionaryGame.gameStarted) return;
  if (typeof pictionaryGame.timeLeft !== "number")
    pictionaryGame.timeLeft = pictionaryGame.roundDuration;
  pictionaryGame.timeLeft -= 1;
  if (pictionaryGame.timeLeft < 0) pictionaryGame.timeLeft = 0;

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
      io.emit("pictionary:gameEnd", { winner });
      pictionaryGame = new PictionaryGame();
      stopPictionaryTimer();
      broadcastPictionaryLobbyGlobal();
    } else {
      broadcastPictionaryGameGlobal("Nouvelle manche : nouveau dessinateur");
      io.emit("pictionary:clear");
      startPictionaryTimer();
    }
  }
}

function clickerLeaderboardClasse() {
  return Object.entries(scores)
    .map(([pseudo, score]) => ({ pseudo, score: Number(score) || 0 }))
    .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
}
function broadcastClickerLeaderboard() {
  io.emit("clicker:leaderboard", clickerLeaderboardClasse());
}

// Anti-spam clicker
const clickWindowMs = 1200;
const clickMaxPerWindow = 25;
const clickBuckets = new Map();

function allowClick(socketId) {
  const now = Date.now();
  const bucket = clickBuckets.get(socketId) || { windowStart: now, count: 0 };
  if (now - bucket.windowStart >= clickWindowMs) {
    bucket.windowStart = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  clickBuckets.set(socketId, bucket);
  return bucket.count <= clickMaxPerWindow;
}

// -----------------------------
// SOCKET.IO : gestion des connexions
// -----------------------------
io.on("connection", (socket) => {
  const user = socket.handshake.session?.user;

  if (!user || !user.pseudo) {
    io.emit("reload");
    socket.disconnect(true);
    return;
  }

  const pseudo = user.pseudo;

  if (userSockets.has(pseudo)) {
    const oldSockets = userSockets.get(pseudo);
    oldSockets.forEach((oldSocketId) => {
      const oldSocket = io.sockets.sockets.get(oldSocketId);
      if (oldSocket && oldSocket.id !== socket.id) {
        console.log(`\n🔄 Reset socket (${oldSocketId}) ->  ${pseudo}\n`);
        oldSocket.disconnect(true);
      }
    });
    oldSockets.clear();
  }

  // Enregistrer la nouvelle socket
  if (!userSockets.has(pseudo)) {
    userSockets.set(pseudo, new Set());
  }
  userSockets.get(pseudo).add(socket.id);
  users.set(socket.id, { name: pseudo });

  console.log(`>> [${pseudo}] connecté`);

  // Envoyer infos initiales
  socket.emit("you:name", pseudo);
  socket.emit("chat:history", historique);
  socket.emit("clicker:you", { score: scores[pseudo] || 0 });
  socket.emit("clicker:leaderboard", clickerLeaderboardClasse());
  socket.emit("clicker:medals", medals[pseudo] || []);
  socket.emit(
    "dino:leaderboard",
    Object.entries(dinoScores)
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score)
  );
  socket.emit("clicker:click", () => {
    // On verra ?
    scores[pseudo] += 1;
    setTimeout(function () {
      scores[pseudo] -= 1;
    }, 100);
  });
  socket.emit(
    "p4:leaderboard",
    Object.entries(p4Wins)
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo))
  );
  socket.emit(
    "uno:leaderboard",
    Object.entries(unoWins)
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo))
  );

  // Broadcast liste (utilisateurs uniques)
  const uniqueUsers = Array.from(userSockets.keys());
  io.emit("users:list", uniqueUsers);
  io.emit("system:info", `${pseudo} a rejoint le chat`);

  // ===== Chat =====
  socket.on("chat:message", ({ text }) => {
    const msg = String(text || "").trim();
    if (!msg) return;
    const payload = { name: pseudo, text: msg, at: new Date().toISOString() };
    historique.push(payload);
    if (historique.length > 200) historique = historique.slice(-200);
    writeJSON(files.historique, historique);
    fs.appendFileSync(files.chatLogs, JSON.stringify(payload) + "\n");
    io.emit("chat:message", payload);
  });

  // ===== Clicker =====
  socket.on("clicker:click", () => {
    if (!allowClick(socket.id)) return;
    scores[pseudo] = (scores[pseudo] || 0) + 1;
    writeJSON(files.leaderboard, scores);
    socket.emit("clicker:you", { score: scores[pseudo] });
    broadcastClickerLeaderboard();
  });

  socket.on("clicker:reset", () => {
    scores[pseudo] = 0;
    medals[pseudo] = [];
    writeJSON(files.leaderboard, scores);
    writeJSON(files.medals, medals);
    socket.emit("clicker:you", { score: 0 });
    socket.emit("clicker:medals", []);
    broadcastClickerLeaderboard();
    console.log(`\n🔄 Reset Clicker pour [${pseudo}]\n`);
  });

  socket.on("clicker:medalUnlock", ({ medalName }) => {
    const validMedals = [
      "Bronze",
      "Argent",
      "Or",
      "Diamant",
      "Rubis",
      "Saphir",
      "Légendaire",
    ];
    if (!validMedals.includes(medalName)) return;
    const userMedals = medals[pseudo] || [];
    if (!userMedals.includes(medalName)) {
      userMedals.push(medalName);
      medals[pseudo] = userMedals;
      writeJSON(files.medals, medals);
      console.log(`\n🏅 ${pseudo} a débloqué ${medalName}\n`);
      socket.emit("clicker:medals", medals[pseudo]);
    }
  });

  // ===== Dino =====
  socket.on("dino:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = dinoScores[pseudo] || 0;
    if (s > current) {
      dinoScores[pseudo] = s;
      writeJSON(files.dinoScores, dinoScores);
      console.log(`\n🦖 Nouveau score Dino pour [${pseudo}] ::: ${s}\n`);
    }
    const arr = Object.entries(dinoScores)
      .map(([u, sc]) => ({ pseudo: u, score: sc }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("dino:leaderboard", arr);
  });

  // ===== FLAPPY =====
  socket.emit(
    "flappy:leaderboard",
    Object.entries(flappyScores)
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score)
  );

  socket.on("flappy:score", ({ score }) => {
    const s = Number(score);
    if (isNaN(s) || s < 0) return;
    const current = flappyScores[pseudo] || 0;
    if (s > current) {
      flappyScores[pseudo] = s;
      writeJSON(files.flappyScores, flappyScores);
      console.log(`\n🐤 Nouveau score Flappy pour [${pseudo}] ::: ${s}\n`);
    }
    const arr = Object.entries(flappyScores)
      .map(([u, sc]) => ({ pseudo: u, score: sc }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("flappy:leaderboard", arr);
  });

  // ===== UNO =====
  function majSocketIds() {
    if (!gameActuelle) return;

    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;

      const joueur = gameActuelle.joueurs.find(
        (p) => p.pseudo === clientUsername
      );
      if (joueur) {
        joueur.socketId = clientSocket.id;
      }

      const spectator = gameActuelle.spectators.find(
        (s) => s.pseudo === clientUsername
      );
      if (spectator) {
        spectator.socketId = clientSocket.id;
      }
    });
  }

  // Fonction pour broadcast le lobby au utilisateurs connectés
  function broadcastUnoLobby() {
    if (!gameActuelle) {
      gameActuelle = new UnoGame();
    }

    majSocketIds();

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

  // Fonction pour broadcast le jeu au joueurs et spectateurs
  function broadcastUno(message = "") {
    if (!gameActuelle || !gameActuelle.gameStarted) return;

    majSocketIds();

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
    if (!gameActuelle) {
      gameActuelle = new UnoGame();
    }

    majSocketIds();

    const lobbyState = gameActuelle.getLobbyState();
    const estAuLobby = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);

    socket.emit("uno:lobby", {
      ...lobbyState,
      myUsername: pseudo,
      estAuLobby,
    });

    if (gameActuelle.gameStarted) {
      const gameState = gameActuelle.getState(pseudo);
      socket.emit("uno:update", gameState);
    }
  });

  // ===== PICTIONARY =====
  function majPictionarySocketIds() {
    if (!pictionaryGame) return;
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      pictionaryGame.updateSocketId(clientUsername, clientSocket.id);
    });
  }

  function broadcastPictionaryLobby() {
    if (!pictionaryGame) pictionaryGame = new PictionaryGame();
    majPictionarySocketIds();
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

  function broadcastPictionaryGame(message = "") {
    if (!pictionaryGame || !pictionaryGame.gameStarted) return;
    majPictionarySocketIds();
    [...pictionaryGame.joueurs, ...pictionaryGame.spectators].forEach((p) => {
      const pSocket = io.sockets.sockets.get(p.socketId);
      if (pSocket) {
        const state = pictionaryGame.getState(p.pseudo);
        if (message) state.message = message;
        pSocket.emit("pictionary:update", state);
      }
    });
  }

  socket.on("pictionary:getState", () => {
    if (!pictionaryGame) pictionaryGame = new PictionaryGame();
    majPictionarySocketIds();
    const lobbyState = pictionaryGame.getLobbyState();
    const estAuLobby = pictionaryGame.joueurs.some((p) => p.pseudo === pseudo);
    socket.emit("pictionary:lobby", {
      ...lobbyState,
      myUsername: pseudo,
      estAuLobby,
    });
    if (pictionaryGame.gameStarted) {
      const gameState = pictionaryGame.getState(pseudo);
      socket.emit("pictionary:update", gameState);
      // send replay strokes to this client so they see the current drawing
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
      broadcastPictionaryLobby();
      return;
    }
    pictionaryGame.removeSpectator(pseudo);
    const res = pictionaryGame.addPlayer(pseudo, socket.id);
    if (!res.success) {
      if (res.reason === "alreadyIn") {
        console.log(`\n⚠️  ${pseudo} est déjà dans le lobby PICTIONARY\n`);
      } else if (res.reason === "full") {
        socket.emit(
          "pictionary:error",
          `Le lobby est plein (${pictionaryGame.maxPlayers}/6)`
        );
      }
      broadcastPictionaryLobby();
      return;
    }
    console.log(
      `\n✅ ${pseudo} a rejoint le lobby PICTIONARY (${pictionaryGame.joueurs.length})\n`
    );
    broadcastPictionaryLobby();
  });

  socket.on("pictionary:leave", () => {
    if (!pictionaryGame) return;
    const etaitJoueur = pictionaryGame.removePlayer(pseudo);
    if (etaitJoueur) {
      console.log(`\n🚪 ${pseudo} a quitté le lobby PICTIONARY\n`);
      if (pictionaryGame.gameStarted) {
        if (pictionaryGame.joueurs.length < 2) {
          console.log(
            `\n⚠️  Partie PICTIONARY annulée (pas assez de joueurs)\n`
          );
          io.emit("pictionary:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} est parti`,
          });
          pictionaryGame = new PictionaryGame();
          broadcastPictionaryLobby();
          return;
        }
        broadcastPictionaryGame(`${pseudo} a quitté la partie`);
      }
      pictionaryGame.addSpectator(pseudo, socket.id);
      broadcastPictionaryLobby();
    } else {
      pictionaryGame.removeSpectator(pseudo);
    }
  });

  socket.on("pictionary:start", () => {
    if (!pictionaryGame) pictionaryGame = new PictionaryGame();
    const isPlayer = pictionaryGame.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) {
      socket.emit("pictionary:error", "Tu n'es pas dans le lobby");
      return;
    }
    if (!pictionaryGame.canStart()) {
      socket.emit(
        "pictionary:error",
        "Impossible de démarrer (3 joueurs minimum)"
      );
      return;
    }
    pictionaryGame.startGame();
    console.log(
      `🎨 Partie PICTIONARY démarrée avec ${pictionaryGame.joueurs.length} joueurs`
    );

    startPictionaryTimer();
    majPictionarySocketIds();
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
        // send strokes for replay so spectators see the current drawing
        try {
          clientSocket.emit("pictionary:replay", pictionaryGame.getStrokes());
        } catch (e) {}
      }
    });
    broadcastPictionaryLobby();
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
        broadcastPictionaryGame(`${pseudo} a deviné le mot`);
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
          io.emit("pictionary:gameEnd", { winner });
          pictionaryGame = new PictionaryGame();
          stopPictionaryTimer();
          broadcastPictionaryLobby();
          return;
        } else {
          broadcastPictionaryGame("Nouvelle manche : nouveau dessinateur");
          io.emit("pictionary:clear");
          startPictionaryTimer();
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
    stopPictionaryTimer();
    broadcastPictionaryLobbyGlobal();
  });

  socket.on("uno:join", () => {
    if (!gameActuelle) {
      gameActuelle = new UnoGame();
    }

    if (gameActuelle.gameStarted) {
      socket.emit("uno:error", "La partie a déjà commencé");
      gameActuelle.addSpectator(pseudo, socket.id);
      broadcastUnoLobby();
      return;
    }

    // Retirer des spectateurs si présent
    gameActuelle.removeSpectator(pseudo);

    const res = gameActuelle.addPlayer(pseudo, socket.id);

    if (!res.success) {
      if (res.reason === "full") {
        socket.emit("uno:error", "Le lobby est plein (4/4)");
      } else if (res.reason === "gameStarted") {
        socket.emit("uno:error", "La partie a déjà commencé");
      } else if (res.reason === "alreadyIn") {
        console.log(`\n⚠️  ${pseudo} est déjà dans le lobby UNO\n`);
      }
      broadcastUnoLobby();
      return;
    }

    console.log(
      `\n✅ ${pseudo} a rejoint le lobby UNO (${gameActuelle.joueurs.length}/4)\n`
    );

    broadcastUnoLobby();
  });

  socket.on("uno:leave", () => {
    if (!gameActuelle) return;

    const etaitJoueur = gameActuelle.removePlayer(pseudo);

    if (etaitJoueur) {
      console.log(`\n🚪 ${pseudo} a quitté le lobby UNO\n`);

      // Si partie en cours et joueur quitte
      if (gameActuelle.gameStarted) {
        // Vérifier s'il reste assez de joueurs
        if (gameActuelle.joueurs.length < 2) {
          console.log(`\n⚠️  Partie UNO annulée (pas assez de joueurs)\n`);

          gameActuelle = new UnoGame();
          broadcastUnoLobby();
          return;
        }

        // Continuer la partie
        broadcastUno(`${pseudo} a quitté la partie`);
      }

      // Ajouter comme spectateur
      gameActuelle.addSpectator(pseudo, socket.id);

      // Broadcast à tout le monde
      broadcastUnoLobby();
    }
  });

  socket.on("uno:start", () => {
    if (!gameActuelle) return;

    const isPlayer = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) {
      socket.emit("uno:error", "Tu n'es pas dans le lobby");
      return;
    }

    if (!gameActuelle.canStart()) {
      socket.emit("uno:error", "Impossible de démarrer (2-4 joueurs requis)");
      return;
    }

    gameActuelle.startGame();

    let joueursActu = [];
    gameActuelle.joueurs.forEach((j) => {
      joueursActu.push(j.pseudo);
    });
    console.log(
      `🎮 Partie UNO démarrée avec ${
        gameActuelle.joueurs.length
      } joueurs  (${joueursActu.join(", ")})`
    );

    majSocketIds();

    // Envoyer l'état à tous les joueurs
    gameActuelle.joueurs.forEach((p) => {
      const joueurSocket = io.sockets.sockets.get(p.socketId);
      if (joueurSocket) {
        const state = gameActuelle.getState(p.pseudo);
        joueurSocket.emit("uno:gameStart", state);
      }
    });

    // Les autres deviennent spectateurs automatiquement
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;

      const clientUsername = clientUser.pseudo;
      const isPlayer = gameActuelle.joueurs.some(
        (p) => p.pseudo === clientUsername
      );

      if (!isPlayer) {
        gameActuelle.addSpectator(clientUsername, clientSocket.id);
        const state = gameActuelle.getState(clientUsername);
        clientSocket.emit("uno:gameStart", state);
      }
    });

    // Broadcast le nouveau lobby state
    broadcastUnoLobby();
  });

  socket.on("uno:play", ({ cardIndex, color }) => {
    if (!gameActuelle || !gameActuelle.gameStarted) {
      socket.emit("uno:error", "Aucune partie en cours");
      return;
    }

    const joueur = gameActuelle.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) {
      socket.emit("uno:error", "Tu n'es pas dans la partie");
      return;
    }

    const res = gameActuelle.jouerCarte(joueur, cardIndex, color);

    if (!res.success) {
      socket.emit("uno:error", res.message);
      return;
    }

    if (res.winner) {
      console.log(`\n🏆 ${res.winner} a gagné la partie de UNO !\n`);

      unoWins[res.winner] = (unoWins[res.winner] || 0) + 1;
      writeJSON(files.unoWins, unoWins);

      io.emit("uno:gameEnd", { winner: res.winner });

      const arr = Object.entries(unoWins)
        .map(([u, w]) => ({ pseudo: u, wins: w }))
        .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
      io.emit("uno:leaderboard", arr);

      gameActuelle = new UnoGame();
      broadcastUnoLobby();
      return;
    }

    // Broadcast à tous
    broadcastUno(res.message);
  });

  socket.on("uno:draw", () => {
    if (!gameActuelle || !gameActuelle.gameStarted) return;

    const joueur = gameActuelle.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) {
      socket.emit("uno:error", "Tu n'es pas dans la partie");
      return;
    }

    const res = gameActuelle.drawCard(joueur);

    if (!res.success) {
      socket.emit("uno:error", res.message);
      return;
    }

    // Broadcast à tous
    broadcastUno(res.message);
  });

  // ===== PUISSANCE 4 =====
  function majP4SocketIds() {
    if (!p4Game) return;
    io.sockets.sockets.forEach((clientSocket) => {
      const clientUser = clientSocket.handshake.session?.user;
      if (!clientUser || !clientUser.pseudo) return;
      const clientUsername = clientUser.pseudo;
      p4Game.updateSocketId(clientUsername, clientSocket.id);
    });
  }

  function broadcastP4Lobby() {
    if (!p4Game) p4Game = new Puissance4Game();
    majP4SocketIds();
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

  function broadcastP4Game(message = "") {
    if (!p4Game || !p4Game.gameStarted) return;
    majP4SocketIds();
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
    majP4SocketIds();
    const lobbyState = p4Game.getLobbyState();
    const estAuLobby = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    socket.emit("p4:lobby", {
      ...lobbyState,
      myUsername: pseudo,
      estAuLobby,
    });
    if (p4Game.gameStarted) {
      const gameState = p4Game.getState(pseudo);
      socket.emit("p4:update", gameState);
    }
  });

  socket.on("p4:join", () => {
    if (!p4Game) p4Game = new Puissance4Game();
    if (p4Game.gameStarted) {
      socket.emit("p4:error", "La partie a déjà commencé");
      p4Game.addSpectator(pseudo, socket.id);
      broadcastP4Lobby();
      return;
    }
    p4Game.removeSpectator(pseudo);
    const res = p4Game.addPlayer(pseudo, socket.id);
    if (!res.success) {
      if (res.reason === "alreadyIn") {
        console.log(`\n⚠️  ${pseudo} est déjà dans le lobby P4\n`);
      } else if (res.reason === "full") {
        socket.emit("p4:error", "Le lobby est plein (2/2)");
      }
      broadcastP4Lobby();
      return;
    }
    console.log(
      `\n✅ ${pseudo} a rejoint le lobby P4 (${p4Game.joueurs.length}/2)\n`
    );
    broadcastP4Lobby();
  });

  socket.on("p4:leave", () => {
    if (!p4Game) return;
    const etaitJoueur = p4Game.removePlayer(pseudo);
    if (etaitJoueur) {
      console.log(`\n🚪 ${pseudo} a quitté le lobby P4\n`);
      if (p4Game.gameStarted) {
        console.log(`\n⚠️  Partie P4 annulée (joueur parti)\n`);
        io.emit("p4:gameEnd", {
          winner: "Partie annulée !",
          reason: `${pseudo} est parti`,
        });
        p4Game = new Puissance4Game();
        broadcastP4Lobby();
        return;
      }
      p4Game.addSpectator(pseudo, socket.id);
      broadcastP4Lobby();
    } else {
      p4Game.removeSpectator(pseudo);
    }
  });

  socket.on("p4:start", () => {
    if (!p4Game) p4Game = new Puissance4Game();
    const isPlayer = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    if (!isPlayer) {
      socket.emit("p4:error", "Tu n'es pas dans le lobby");
      return;
    }
    if (!p4Game.canStart()) {
      socket.emit("p4:error", "Impossible de démarrer (2 joueurs requis)");
      return;
    }
    p4Game.startGame();
    console.log(`🎮 Partie P4 démarrée avec ${p4Game.joueurs.length} joueurs`);
    majP4SocketIds();
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
    broadcastP4Lobby();
  });

  socket.on("p4:play", ({ col }) => {
    if (!p4Game || !p4Game.gameStarted) return;
    const joueur = p4Game.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) {
      socket.emit("p4:error", "Tu n'es pas dans la partie");
      return;
    }
    const res = p4Game.playMove(joueur, col);
    if (!res.success) {
      socket.emit("p4:error", res.message);
      return;
    }
    if (res.winner) {
      console.log(`\n🏆 ${res.winner} a gagné la partie de P4 !\n`);

      p4Wins[res.winner] = (p4Wins[res.winner] || 0) + 1;
      writeJSON(files.p4Wins, p4Wins);

      // Broadcast leaderboard P4
      const arr = Object.entries(p4Wins)
        .map(([u, w]) => ({ pseudo: u, wins: w }))
        .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
      io.emit("p4:leaderboard", arr);

      broadcastP4Game();
      // Délai de 3s pour voir le message avant alert et retour lobby
      setTimeout(() => {
        io.emit("p4:gameEnd", { winner: res.winner });
        p4Game = new Puissance4Game();
        broadcastP4Lobby();
      }, 100);
      return;
    }
    if (res.draw) {
      console.log(`\n🤝 Match nul P4 !\n`);
      broadcastP4Game();
      // Délai de 3s pour voir le message avant alert et retour lobby
      setTimeout(() => {
        io.emit("p4:gameEnd", { draw: true });
        p4Game = new Puissance4Game();
        broadcastP4Lobby();
      }, 100);
      return;
    }
    broadcastP4Game();
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    clickBuckets.delete(socket.id);

    if (userSockets.has(pseudo)) {
      userSockets.get(pseudo).delete(socket.id);
      if (userSockets.get(pseudo).size === 0) {
        userSockets.delete(pseudo);
        io.emit("system:info", `${pseudo} a quitté le chat`);
        console.log(`>> [${pseudo}] déconnecté`);
      }
    }

    // Mise à jour liste utilisateurs
    const uniqueUsers = Array.from(userSockets.keys());
    io.emit("users:list", uniqueUsers);

    // Gestion UNO
    if (gameActuelle) {
      const etaitJoueur = gameActuelle.joueurs.some((p) => p.pseudo === pseudo);

      if (etaitJoueur) {
        gameActuelle.removePlayer(pseudo);

        if (gameActuelle.gameStarted && gameActuelle.joueurs.length < 2) {
          console.log(`\n⚠️  Partie UNO annulée (${pseudo} déconnecté)\n`);

          io.emit("uno:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} s'est déconnecté`,
          });

          gameActuelle = new UnoGame();
        } else if (gameActuelle.gameStarted) {
          broadcastUno(`${pseudo} s'est déconnecté`);
        }

        broadcastUnoLobby();
      } else {
        gameActuelle.removeSpectator(pseudo);
      }
    }

    // --- Gestion PICTIONARY ---
    if (pictionaryGame) {
      const etaitJoueurPic = pictionaryGame.joueurs.some(
        (p) => p.pseudo === pseudo
      );
      if (etaitJoueurPic) {
        pictionaryGame.removePlayer(pseudo);
        if (pictionaryGame.gameStarted && pictionaryGame.joueurs.length < 2) {
          console.log(
            `\n⚠️  Partie PICTIONARY annulée (${pseudo} déconnecté)\n`
          );
          io.emit("pictionary:gameEnd", {
            winner: "Partie annulée !",
            reason: `${pseudo} s'est déconnecté`,
          });
          stopPictionaryTimer();
          pictionaryGame = new PictionaryGame();
          broadcastPictionaryLobbyGlobal();
        } else if (pictionaryGame.gameStarted) {
          broadcastPictionaryGameGlobal(`${pseudo} s'est déconnecté`);
        }
        broadcastPictionaryLobbyGlobal();
      } else {
        pictionaryGame.removeSpectator(pseudo);
      }
    }
  });
  // Gestion p4
  if (p4Game) {
    const etaitJoueurP4 = p4Game.joueurs.some((p) => p.pseudo === pseudo);
    if (etaitJoueurP4) {
      console.log(`\n⚠️  Partie P4 annulée (${pseudo} déconnecté)\n`);
      if (p4Game.gameStarted) {
        io.emit("p4:gameEnd", {
          winner: "Partie annulée !",
          reason: `${pseudo} s'est déconnecté`,
        });
      }
      p4Game = new Puissance4Game();
      broadcastP4Lobby();
    } else {
      p4Game.removeSpectator(pseudo);
    }
  }
});

// -----------------------------
// Auto reload
// -----------------------------
const watchDir = path.join(__dirname, "Public");
console.log("\n[AUTO RELOAD : OK]\n");
let reloadTimer = null;

fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log(`\n♻️  Modification détectée : ${filename}\n`);
    io.emit("reload");
    reloadTimer = null;
  }, 500);
});

// -----------------------------
// Lancement du serveur
// -----------------------------
serveur.listen(PORT, HOTE, () => {
  console.log(
    `>>> ✅ Serveur lancé sur http://${HOTE || "localhost"}:${PORT}\n`
  );
});
