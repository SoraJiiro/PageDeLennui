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

// -----------------------------
// Config
// -----------------------------
const PORT = process.env.PORT || 7550;
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
  medals: path.join(dataDir, "medals.json"),
};

let scores = readJSON(files.leaderboard, {});
let historique = readJSON(files.historique, []);
let dinoScores = readJSON(files.dinoScores, {});
let medals = readJSON(files.medals, {});

// -----------------------------
// Logique principale
// -----------------------------
let users = new Map();
let userSockets = new Map(); // pseudo -> Set de socket.id
let unoGames = new Map();
let gameActuelle = new UnoGame();

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
      `🎮 Partie UNO démarrée avec ${gameActuelle.joueurs.length} joueurs  (${joueursActu})`
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

      io.emit("uno:gameEnd", { winner: res.winner });

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
  });
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
