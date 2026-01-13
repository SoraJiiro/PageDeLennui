const { FileService, getIpFromSocket, persistBanIp } = require("./util");
const { recalculateMedals } = require("./medals");
const dbUsers = require("./dbUsers");
const UnoGame = require("./unoGame");
const Puissance4Game = require("./puissance4Game");
const MotusGame = require("./motusGame");
const BlackjackGame = require("./blackjackGame");
const MashGame = require("./mashGame");
const fs = require("fs");
const path = require("path");
const config = require("./config");

function broadcastSystemMessage(io, text, persist = false) {
  io.emit("system:info", text);
  if (persist) {
    const payload = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: "Système",
      text: text,
      at: new Date().toISOString(),
      tag: null,
    };
    FileService.data.historique.push(payload);
    if (FileService.data.historique.length > 200) {
      FileService.data.historique = FileService.data.historique.slice(-200);
    }
    FileService.save("historique", FileService.data.historique);
    FileService.appendLog(payload);
  }
}

// ------- Games -------
let gameActuelle = new UnoGame();
let p4Game = new Puissance4Game();
let motusGame = new MotusGame();
let blackjackGame = new BlackjackGame();
let mashGame = null; // Will be initialized with broadcastSystemMessage wrapper

// ------- Colors -------
const orange = "\x1b[38;5;208m"; // pseudos
const reset = "\x1b[0m";
const blue = "\x1b[38;5;33m"; // Dino
const green = "\x1b[38;5;46m"; // Clicker
const pink = "\x1b[38;5;205m"; // Flappy
const violet = "\x1b[38;5;141m"; // UNO
const red = "\x1b[38;5;167m"; // P4
const colorize = (s, color) => `${color}${s}${reset}`;
const withGame = (s, color) => `${color}${s}${reset}`;

// --- CPS / Anti-cheat tracker ---
const cpsTracker = new Map();
const CPS_THRESHOLD = Number(process.env.CPS_THRESHOLD) || 50; // clicks/sec
const CPS_DURATION_MS = Number(process.env.CPS_DURATION_MS) || 3000; // ms
const CPS_PENALTY = Number(process.env.CPS_PENALTY) || 1000; // clicks to remove

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
  broadcastP4LB(io) {
    const arr = Object.entries(FileService.data.p4Wins)
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
    io.emit("p4:leaderboard", arr);
  },
  broadcastMotusLB(io) {
    const arr = Object.entries(FileService.data.motusScores || {})
      .map(([u, s]) => ({
        pseudo: u,
        words: s.words || 0,
        tries: s.tries || 0,
      }))
      .sort(
        (a, b) =>
          b.words - a.words ||
          a.tries - b.tries ||
          a.pseudo.localeCompare(b.pseudo)
      );
    io.emit("motus:leaderboard", arr);
  },
  broadcastMashLB(io) {
    const arr = Object.entries(FileService.data.mashWins || {})
      .map(([u, w]) => ({ pseudo: u, wins: w }))
      .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
    io.emit("mash:leaderboard", arr);
  },
  broadcast2048LB(io) {
    const arr = Object.entries(FileService.data.scores2048 || {})
      .map(([u, s]) => ({ pseudo: u, score: s }))
      .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
    io.emit("2048:leaderboard", arr);
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
  // Init émetteur blackjack si non défini
  if (blackjackGame && !blackjackGame.emitState) {
    blackjackGame.setEmitter((state) => io.emit("blackjack:state", state));

    blackjackGame.setRoundEndCallback(() => {
      blackjackGame.joueurs.forEach((p) => {
        const amountToAdd = p.bet + p.winnings;

        if (amountToAdd > 0) {
          if (!FileService.data.clicks[p.pseudo])
            FileService.data.clicks[p.pseudo] = 0;

          FileService.data.clicks[p.pseudo] += amountToAdd;
          recalculateMedals(p.pseudo, FileService.data.clicks[p.pseudo], io);
        }
      });

      FileService.save("clicks", FileService.data.clicks);

      // Update all players with new scores
      blackjackGame.joueurs.forEach((p) => {
        const socketId = p.socketId;
        if (io.sockets.sockets.get(socketId)) {
          io.sockets.sockets
            .get(socketId)
            .emit("clicker:you", { score: FileService.data.clicks[p.pseudo] });
        }
      });

      leaderboardManager.broadcastClickerLB(io);
      io.emit("blackjack:state", blackjackGame.getState());
    });
  }

  const user = socket.handshake.session?.user;
  if (!user || !user.pseudo) {
    // Allow connection for auto-reload (public pages), but do not init game handlers
    return;
  }

  const pseudo = user.pseudo;
  socket.join("user:" + pseudo);
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

  // Envoyer couleur tag actuelle
  const currentTagData = FileService.data.tags
    ? FileService.data.tags[pseudo]
    : null;
  let currentTagColor = "#ff0000";
  if (
    currentTagData &&
    typeof currentTagData === "object" &&
    currentTagData.color
  ) {
    currentTagColor = currentTagData.color;
  }
  socket.emit("user:tagColor", { color: currentTagColor });

  // Envoyer couleur UI sauvegardée
  const savedUiColor =
    FileService.data.uis && FileService.data.uis[pseudo]
      ? FileService.data.uis[pseudo]
      : null;
  if (savedUiColor) {
    socket.emit("ui:color", { color: savedUiColor });
  }

  // --- Coin Flip ---
  socket.on("coinflip:bet", (data) => {
    const { amount, side } = data;
    const bet = parseInt(amount);

    if (isNaN(bet) || bet <= 0) {
      socket.emit("coinflip:error", "Mise invalide");
      return;
    }

    if (side !== "heads" && side !== "tails") {
      socket.emit("coinflip:error", "Choix invalide");
      return;
    }

    const currentClicks = FileService.data.clicks[pseudo] || 0;
    if (currentClicks < bet) {
      socket.emit("coinflip:error", "Pas assez de clicks !");
      return;
    }

    // Déduire mise immédiatement
    FileService.data.clicks[pseudo] = currentClicks - bet;

    // Logique pile ou face (50/50)
    const isHeads = Math.random() < 0.5;
    const resultSide = isHeads ? "heads" : "tails";
    const won = side === resultSide;
    const winnings = won ? bet * 2 : 0;

    if (won) {
      // Ajouter gains (mise * 2)
      FileService.data.clicks[pseudo] += winnings;
    }

    // Log transaction with IP
    const ip = getIpFromSocket(socket);
    const logDetails = {
      type: "BET_COINFLIP",
      pseudo: `${pseudo} (${ip})`,
      bet: bet,
      result: won ? "WIN" : "LOSS",
      netChange: won ? bet : -bet,
      timestamp: new Date().toISOString(),
    };
    console.log(
      `[PILE_OU_FACE] ${logDetails.pseudo} a parié ${bet} sur ${
        side === "heads" ? "PILE" : "FACE"
      } -> ${won ? "GAGNÉ" : "PERDU"} (${logDetails.netChange})`
    );
    FileService.appendLog(logDetails); // Ensure appendLog handles objects or stringify it

    FileService.save("clicks", FileService.data.clicks);
    recalculateMedals(pseudo, FileService.data.clicks[pseudo], io, true); // Silent recalc

    // Emettre résultat
    socket.emit("coinflip:result", {
      won: won,
      side: resultSide,
      newScore: FileService.data.clicks[pseudo],
      amount: bet,
    });

    // Mettre à jour affichage score client
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });

    // Diffuser mise à jour classement
    leaderboardManager.broadcastClickerLB(io);
  });

  socket.on("system:acceptRules", () => {
    const db = dbUsers.readAll();
    const u = db.users.find((u) => u.pseudo === pseudo);
    if (u) {
      u.rulesAccepted = true;
      dbUsers.writeAll(db);
      socket.emit("system:rulesAccepted");
    }
  });

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
  leaderboardManager.broadcastP4LB(io);
  leaderboardManager.broadcastBlockBlastLB(io);
  leaderboardManager.broadcastSnakeLB(io);
  leaderboardManager.broadcastMotusLB(io);
  leaderboardManager.broadcast2048LB(io);

  io.emit("users:list", gameState.getUniqueUsers());
  if (pseudo !== "Admin") {
    io.emit("system:info", `${pseudo} a rejoint le chat`);
  }

  // ------- UI Color -------
  socket.on("ui:saveColor", ({ color }) => {
    if (!color || typeof color !== "string") return;
    if (!FileService.data.uis) FileService.data.uis = {};
    FileService.data.uis[pseudo] = color;
    FileService.save("uis", FileService.data.uis);
  });

  // ------- Chat -------
  socket.on("chat:message", ({ text }) => {
    let msg = String(text || "").trim();
    if (!msg) return;

    // Censure du mot du jour (Motus)
    // On doit vérifier le mot actuel de l'utilisateur car chacun a son propre mot
    const userMotusState = getMotusState(pseudo);
    if (userMotusState && userMotusState.currentWord) {
      const word = userMotusState.currentWord.toUpperCase();
      const leetMap = {
        A: "[A4@àâä]",
        B: "[B8&]",
        E: "[E3éèêë£€]",
        G: "[G69]",
        I: "[I1!|lìíîï]",
        L: "[L1|]",
        O: "[O0°òóôõö¤]",
        S: "[S5$š§]",
        T: "[T17]",
        Z: "[Z2²ž]",
        U: "[Uùúûüµ]",
        C: "[Cç]",
      };

      // Construction du pattern regex pour le mot
      // On autorise la répétition des caractères (ex: R+E+I+M+S+) pour attraper RREEIIMMSS
      let regexPattern = "";
      for (const char of word) {
        const mapped = leetMap[char] || char;
        // On ajoute + pour dire "1 ou plusieurs fois ce caractère"
        // On ajoute aussi des séparateurs optionnels (espaces, tirets, points) entre les lettres
        regexPattern += mapped + "+[\\s\\-_.]*";
      }

      // On retire le dernier séparateur optionnel inutile
      if (regexPattern.endsWith("[\\s\\-_.]*")) {
        regexPattern = regexPattern.slice(0, -10);
      }

      const regex = new RegExp(regexPattern, "gi");
      msg = msg.replace(regex, (match) => "*".repeat(match.length));
    }

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
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
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

  socket.on("chat:delete", ({ id }) => {
    if (pseudo !== "Admin") return;
    const idx = FileService.data.historique.findIndex((m) => m.id === id);
    if (idx !== -1) {
      FileService.data.historique.splice(idx, 1);
      FileService.save("historique", FileService.data.historique);
      io.emit("chat:delete", { id });
    }
  });

  socket.on("user:setTagColor", ({ color }) => {
    if (!color || typeof color !== "string") return;

    // Check tricheur
    const userMedals = FileService.data.medals[pseudo] || [];
    const hasTricheurMedal = userMedals.some((m) =>
      typeof m === "string" ? m === "Tricheur" : m.name === "Tricheur"
    );
    const isInCheatersList =
      FileService.data.cheaters && FileService.data.cheaters.includes(pseudo);

    if (hasTricheurMedal || isInCheatersList) {
      return socket.emit("system:notification", {
        message:
          "🚫 Les tricheurs ne peuvent pas changer la couleur de leur tag",
        duration: 4000,
      });
    }

    if (!FileService.data.tags) FileService.data.tags = {};
    let currentTag = FileService.data.tags[pseudo];

    if (!currentTag) {
      // Pas de tag, on ne fait rien
      return;
    }

    if (typeof currentTag === "string") {
      currentTag = { text: currentTag, color: color };
    } else if (typeof currentTag === "object") {
      currentTag.color = color;
      // If multi-colored, update all colors to the new single color
      if (currentTag.colors && Array.isArray(currentTag.colors)) {
        currentTag.colors = currentTag.colors.map(() => color);
      }
    }

    FileService.data.tags[pseudo] = currentTag;
    FileService.save("tags", FileService.data.tags);

    socket.emit("user:tagColor", { color });
    socket.emit("system:notification", {
      message: "✅ Couleur du tag mise à jour",
      duration: 3000,
    });
  });

  // ------- Donation System -------
  socket.on("user:donate", ({ recipient, amount }) => {
    const val = parseInt(amount);
    if (isNaN(val) || val <= 0) {
      socket.emit("system:info", "Montant invalide.");
      return;
    }

    if (recipient === pseudo) {
      socket.emit("system:info", "Vous ne pouvez pas vous donner des clicks.");
      return;
    }

    const senderClicks = FileService.data.clicks[pseudo] || 0;
    if (senderClicks < val) {
      socket.emit("system:info", "Fonds insuffisants.");
      return;
    }

    // Vérifier si le destinataire existe
    const recipientExists = dbUsers.findByPseudoExact
      ? dbUsers.findByPseudoExact(recipient)
      : dbUsers.findBypseudo(recipient);

    if (!recipientExists) {
      socket.emit("system:info", "Utilisateur introuvable.");
      return;
    }

    // Déduire immédiatement du sender
    FileService.data.clicks[pseudo] -= val;
    FileService.save("clicks", FileService.data.clicks);
    recalculateMedals(pseudo, FileService.data.clicks[pseudo], io, true); // Silent recalc
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });

    const senderIp = getIpFromSocket(socket);

    if (val > 250000) {
      // Transaction en attente
      if (!FileService.data.transactions) FileService.data.transactions = [];
      const transaction = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        from: `${pseudo} (${senderIp})`,
        to: recipient,
        amount: val,
        date: new Date().toISOString(),
        status: "pending",
      };
      FileService.data.transactions.push(transaction);
      FileService.save("transactions", FileService.data.transactions);

      console.log(
        `[DON_EN_ATTENTE] De ${pseudo} (${senderIp}) à ${recipient} : ${val}`
      );
      FileService.appendLog({
        type: "DONATION_PENDING",
        from: `${pseudo} (${senderIp})`,
        to: recipient,
        amount: val,
      });

      socket.emit(
        "system:info",
        `Don de ${val} clicks à ${recipient} en attente de validation (montant > 250k).`
      );

      // Notifier les admins connectés
      io.to("admins").emit("admin:new_transaction", transaction);
    } else {
      // Transfert direct
      if (!FileService.data.clicks[recipient])
        FileService.data.clicks[recipient] = 0;
      FileService.data.clicks[recipient] += val;
      FileService.save("clicks", FileService.data.clicks);

      console.log(`[DON] De ${pseudo} (${senderIp}) à ${recipient} : ${val}`);
      FileService.appendLog({
        type: "DONATION",
        from: `${pseudo} (${senderIp})`,
        to: recipient,
        amount: val,
      });

      recalculateMedals(
        recipient,
        FileService.data.clicks[recipient],
        io,
        true
      ); // Silent recalc

      socket.emit(
        "system:info",
        `Vous avez donné ${val} clicks à ${recipient}.`
      );

      // Notifier le destinataire s'il est en ligne
      const recipientSocketId = gameState.userSockets.get(recipient); // Set of socketIds
      if (recipientSocketId) {
        recipientSocketId.forEach((sid) => {
          io.to(sid).emit(
            "system:info",
            `${pseudo} vous a donné ${val} clicks !`
          );
          io.to(sid).emit("clicker:you", {
            score: FileService.data.clicks[recipient],
          });
        });
      }
    }
    leaderboardManager.broadcastClickerLB(io);
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
      io.to("user:" + pseudo).emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
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

          // Recalculer médailles (version locale simplifiée)
          try {
            // Recalculer médailles comme dans adminRoutes
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

          // Persister ban dans blacklist.json
          persistBanIp(ip);

          console.log({
            level: "action",
            message: `IP ${ip} bannie automatiquement pour CPS élevé. ${CPS_PENALTY} clicks retirés à ${pseudo}`,
          });

          io.emit(
            "system:info",
            `${pseudo} a été banni pour triche (CPS trop élevé) !`
          );

          // Notifier et déconnecter sockets de cette IP
          io.sockets.sockets.forEach((s) => {
            const sIp = getIpFromSocket(s);
            if (sIp === ip) {
              try {
                s.emit("system:notification", {
                  message: "🚫 Votre IP a été bannie pour CPS anormal",
                  duration: 8000,
                });
              } catch (e) {}
              try {
                s.disconnect(true);
              } catch (e) {}
            }
          });

          // Diffuser mise à jour classement
          leaderboardManager.broadcastClickerLB(io);
        }
      } else {
        // reset violationStart si sous seuil
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
    broadcastSystemMessage(
      io,
      `${pseudo} a débloqué la médaille ${medalName} !`,
      true
    );

    // Ré-émission normalisée (objets complets)
    const normalized = userMedals.map((m) =>
      typeof m === "string"
        ? { name: m, colors: [] }
        : { name: m.name, colors: Array.isArray(m.colors) ? m.colors : [] }
    );
    socket.emit("clicker:medals", normalized);
  });

  socket.on("clicker:buyColorRegen", ({ newColors }) => {
    if (!newColors || typeof newColors !== "object") return;

    const currentScore = FileService.data.clicks[pseudo] || 0;
    const COST = 375000;

    if (currentScore < COST) return;

    // Deduct cost
    FileService.data.clicks[pseudo] = currentScore - COST;
    FileService.save("clicks", FileService.data.clicks);

    // Update medals
    const userMedals = FileService.data.medals[pseudo] || [];
    let updated = false;

    for (let i = 0; i < userMedals.length; i++) {
      let m = userMedals[i];
      // Normalize to object if string
      if (typeof m === "string") {
        m = { name: m, colors: [] };
        userMedals[i] = m;
      }

      if (newColors[m.name] && Array.isArray(newColors[m.name])) {
        m.colors = newColors[m.name].slice(0, 24);
        updated = true;
      }
    }

    if (updated) {
      FileService.save("medals", FileService.data.medals);
    }

    // Emit updates
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });
    leaderboardManager.broadcastClickerLB(io);

    const normalized = userMedals.map((m) =>
      typeof m === "string"
        ? { name: m, colors: [] }
        : { name: m.name, colors: Array.isArray(m.colors) ? m.colors : [] }
    );
    socket.emit("clicker:medals", normalized);

    broadcastSystemMessage(
      io,
      `${pseudo} a régénéré ses Médailles ! (pigeon)`,
      true
    );
    socket.emit("system:info", "✅ Couleurs régénérées avec succès !");
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
      broadcastSystemMessage(
        io,
        `${pseudo} a fait un nouveau score de ${s} à Dino !`,
        true
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
      broadcastSystemMessage(
        io,
        `${pseudo} a fait un nouveau score de ${s} à Flappy !`,
        true
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
        broadcastSystemMessage(
          io,
          `${pseudo} a fait un nouveau score de ${s} à Block Blast !`,
          true
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

  socket.on("blockblast:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("blockblast:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      // Notifier le nouveau solde de clicks
      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("blockblast:reviveSuccess");

      console.log(
        withGame(
          `[BlockBlast] ${pseudo} a payé ${cost} clicks pour continuer.`,
          green
        )
      );
    } else {
      socket.emit("blockblast:reviveError", "Pas assez de clicks !");
    }
  });

  // ------- Dino Revive -------
  socket.on("dino:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("dino:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("dino:reviveSuccess");
      console.log(
        withGame(`[Dino] ${pseudo} a payé ${cost} clicks pour continuer.`, blue)
      );
    } else {
      socket.emit("dino:reviveError", "Pas assez de clicks !");
    }
  });

  // ------- Flappy Revive -------
  socket.on("flappy:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("flappy:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("flappy:reviveSuccess");
      console.log(
        withGame(
          `[Flappy] ${pseudo} a payé ${cost} clicks pour continuer.`,
          pink
        )
      );
    } else {
      socket.emit("flappy:reviveError", "Pas assez de clicks !");
    }
  });

  // ------- Snake Revive -------
  socket.on("snake:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("snake:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("snake:reviveSuccess");
      console.log(
        withGame(
          `[Snake] ${pseudo} a payé ${cost} clicks pour continuer.`,
          green
        )
      );
    } else {
      socket.emit("snake:reviveError", "Pas assez de clicks !");
    }
  });

  // ------- 2048 Revive -------
  socket.on("2048:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("2048:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("2048:reviveSuccess");
      console.log(
        withGame(
          `[2048] ${pseudo} a payé ${cost} clicks pour continuer.`,
          green
        )
      );
    } else {
      socket.emit("2048:reviveError", "Pas assez de clicks !");
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
        broadcastSystemMessage(
          io,
          `${pseudo} a fait un nouveau score de ${s} à Snake !`,
          true
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
      leaderboardManager.broadcastP4LB(io);
      leaderboardManager.broadcastBlockBlastLB(io);
      leaderboardManager.broadcastSnakeLB(io);
    }
  });

  socket.on("admin:chat:clear", () => {
    if (pseudo === "Admin") {
      FileService.data.historique = [];
      FileService.save("historique", FileService.data.historique);
      io.emit("chat:history", []);
      broadcastSystemMessage(
        io,
        "🔙 L'historique du chat a été effacé par l'Admin.",
        true
      );
    }
  });

  const { exec } = require("child_process");

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

          // On éteint le serveur peu après pour laisser le temps de charger la page
          setTimeout(() => {
            console.log({
              level: "warn",
              message: "Arrêt du serveur suite au countdown...",
            });
            if (process.platform === "win32") {
              exec("taskkill /IM node.exe /F /T");
            } else {
              exec("pkill node");
            }
            // Fallback
            setTimeout(() => process.exit(0), 500);
          }, 2000);
        }, duration + 4000);
      }
    }
  });

  socket.on("admin:disconnect-others", () => {
    if (pseudo !== "Admin") return;
    try {
      const adminSockets = gameState.userSockets.get("Admin");
      if (adminSockets) {
        let count = 0;
        adminSockets.forEach((sId) => {
          if (sId !== socket.id) {
            const s = io.sockets.sockets.get(sId);
            if (s) {
              s.emit("system:redirect", "/login");
              setTimeout(() => s.disconnect(true), 500);
              count++;
            }
          }
        });
        socket.emit("system:notification", {
          message: `✅ ${count} autre(s) session(s) Admin déconnectée(s)`,
          duration: 4000,
        });
      }
    } catch (e) {
      console.error("Erreur disconnect-others:", e);
    }
  });

  // ------- Motus -------
  function getMotusState(pseudo) {
    if (!FileService.data.motusState) FileService.data.motusState = {};
    if (!FileService.data.motusState[pseudo]) {
      FileService.data.motusState[pseudo] = {
        currentWord: null,
        history: [],
        foundWords: [],
      };
    }
    // Migration
    if (!FileService.data.motusState[pseudo].foundWords) {
      FileService.data.motusState[pseudo].foundWords = [];
      FileService.data.motusState[pseudo].currentWord = null;
      FileService.data.motusState[pseudo].history = [];
    }
    return FileService.data.motusState[pseudo];
  }

  function assignNewWord(pseudo) {
    const state = getMotusState(pseudo);
    const newWord = motusGame.getRandomWord(state.foundWords);
    if (newWord) {
      state.currentWord = newWord;
      state.history = [];
      FileService.save("motusState", FileService.data.motusState);
    }
    return newWord;
  }

  socket.on("motus:guess", ({ guess }) => {
    if (!guess || typeof guess !== "string") return;

    const state = getMotusState(pseudo);
    if (!state.currentWord) {
      assignNewWord(pseudo);
      if (!state.currentWord) return;
    }

    // Check if already won
    const last = state.history[state.history.length - 1];
    if (last && last.result.every((s) => s === 2)) return;

    const { result, error } = motusGame.checkGuess(state.currentWord, guess);

    if (error) {
      socket.emit("motus:error", { message: error });
      return;
    }

    state.history.push({ guess: guess.toUpperCase(), result });

    // Update tries immediately (increment by 1 for every guess)
    if (!FileService.data.motusScores) FileService.data.motusScores = {};
    if (!FileService.data.motusScores[pseudo]) {
      FileService.data.motusScores[pseudo] = { words: 0, tries: 0 };
    }
    FileService.data.motusScores[pseudo].tries++;

    // Check win
    let won = false;
    if (result.every((s) => s === 2)) {
      won = true;
      state.foundWords.push(state.currentWord);
      FileService.data.motusScores[pseudo].words++;
    }

    FileService.save("motusScores", FileService.data.motusScores);
    leaderboardManager.broadcastMotusLB(io);

    FileService.save("motusState", FileService.data.motusState);

    socket.emit("motus:result", {
      result,
      guess: guess.toUpperCase(),
      won: won,
    });
  });

  socket.on("motus:skip", () => {
    assignNewWord(pseudo);
    const state = getMotusState(pseudo);
    const word = state.currentWord;

    if (!word) {
      socket.emit("motus:end", {
        message: "Toutes les communes ont été trouvées !",
      });
      return;
    }

    const hyphens = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === "-") hyphens.push(i);
    }

    socket.emit("motus:init", {
      length: word.length,
      hyphens: hyphens,
      history: [],
      won: false,
    });
  });

  socket.on("motus:continue", () => {
    assignNewWord(pseudo);
    const state = getMotusState(pseudo);
    const word = state.currentWord;

    if (!word) {
      socket.emit("motus:end", {
        message: "Toutes les communes ont été trouvées !",
      });
      return;
    }

    const hyphens = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === "-") hyphens.push(i);
    }

    socket.emit("motus:init", {
      length: word.length,
      hyphens: hyphens,
      history: [],
      won: false,
    });
  });

  // Send initial state on connect
  const state = getMotusState(pseudo);
  if (!state.currentWord) {
    assignNewWord(pseudo);
  }

  if (state.currentWord) {
    const word = state.currentWord;
    const hyphens = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === "-") hyphens.push(i);
    }

    const last = state.history[state.history.length - 1];
    const won = last && last.result.every((s) => s === 2);

    socket.emit("motus:init", {
      length: word.length,
      hyphens: hyphens,
      history: state.history,
      won: won,
    });
  } else {
    socket.emit("motus:end", {
      message: "Toutes les communes ont été trouvées !",
    });
  }

  // Send LB on connect
  const lb = Object.entries(FileService.data.motusScores || {})
    .map(([u, s]) => ({
      pseudo: u,
      words: s.words || 0,
      tries: s.tries || 0,
    }))
    .sort(
      (a, b) =>
        b.words - a.words ||
        a.tries - b.tries ||
        a.pseudo.localeCompare(b.pseudo)
    );
  socket.emit("motus:leaderboard", lb);

  // ------- Blackjack -------
  socket.on("blackjack:join", () => {
    const res = blackjackGame.addPlayer(pseudo, socket.id);
    if (!res.success) {
      if (res.reason === "full") {
        blackjackGame.addSpectator(pseudo, socket.id);
        socket.emit("blackjack:error", "Table pleine, mode spectateur");
      } else if (res.reason === "gameStarted") {
        blackjackGame.addSpectator(pseudo, socket.id);
        socket.emit("blackjack:error", "Partie en cours, mode spectateur");
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
    const bet = parseInt(amount);
    if (isNaN(bet) || bet <= 0) return;

    const currentClicks = FileService.data.clicks[pseudo] || 0;

    if (currentClicks < bet) {
      socket.emit("blackjack:error", "Pas assez de clicks !");
      return;
    }

    if (blackjackGame.placeBet(pseudo, bet)) {
      // Deduct bet immediately
      FileService.data.clicks[pseudo] = currentClicks - bet;
      FileService.save("clicks", FileService.data.clicks);
      recalculateMedals(pseudo, FileService.data.clicks[pseudo], io);
      io.to("user:" + pseudo).emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });

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

  // ------- 2048 -------
  socket.on("2048:submit_score", (score) => {
    const s = Number(score);
    if (isNaN(s)) return;

    if (!FileService.data.scores2048) FileService.data.scores2048 = {};
    const currentBest = FileService.data.scores2048[pseudo] || 0;

    if (s > currentBest) {
      FileService.data.scores2048[pseudo] = s;
      FileService.save("scores2048", FileService.data.scores2048);

      console.log(
        withGame(`[2048] Nouveau record pour ${pseudo} : ${s}`, green)
      );

      socket.emit("2048:best_score", s);
    }

    leaderboardManager.broadcast2048LB(io);
  });

  socket.on("2048:get_best_score", () => {
    const best =
      (FileService.data.scores2048 && FileService.data.scores2048[pseudo]) || 0;
    socket.emit("2048:best_score", best);
  });

  socket.on("2048:get_leaderboard", () => {
    leaderboardManager.broadcast2048LB(io);
  });

  // Send LB on connect
  leaderboardManager.broadcast2048LB(io);

  // ------- Log off -------
  // ------- Mash Game -------
  if (!mashGame) {
    mashGame = new MashGame((msg) => broadcastSystemMessage(io, msg));
  }
  if (mashGame && !mashGame.emitState) {
    mashGame.setEmitter((state) => io.emit("mash:state", state));
    mashGame.setPayoutCallback((pseudo, score) => {
      io.to("user:" + pseudo).emit("clicker:you", { score });
    });
  }

  socket.on("mash:join", () => {
    mashGame.join(socket, pseudo);
  });

  socket.on("mash:leave", () => {
    mashGame.leave(socket, pseudo);
  });

  socket.on("mash:bet", (data) => {
    mashGame.placeBet(pseudo, data.betOn, Number(data.amount));
    const clicks = FileService.data.clicks[pseudo] || 0;
    socket.emit("clicker:you", { score: clicks });
  });

  socket.on("mash:key", (key) => {
    if (typeof key === "string" && key.length === 1) {
      mashGame.setMashKey(pseudo, key);
    }
  });

  socket.on("mash:mash", (key) => {
    mashGame.handleMash(pseudo, key);
  });

  // State & LB
  if (mashGame) socket.emit("mash:state", mashGame.getState());

  const mashLB = Object.entries(FileService.data.mashWins || {})
    .map(([u, w]) => ({ pseudo: u, wins: w }))
    .sort((a, b) => b.wins - a.wins || a.pseudo.localeCompare(b.pseudo));
  socket.emit("mash:leaderboard", mashLB);

  socket.on("disconnect", () => {
    const fullyDisconnected = gameState.removeUser(socket.id, pseudo);

    if (fullyDisconnected && pseudo !== "Admin") {
      // io.emit("system:info", `${pseudo} a quitté le chat`);
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
    // BLACKJACK
    if (blackjackGame) {
      const wasPlayer = blackjackGame.removePlayer(pseudo);
      const wasSpectator = blackjackGame.removeSpectator(pseudo);

      if (wasPlayer || wasSpectator) {
        io.emit("blackjack:state", blackjackGame.getState());
      }
    }

    // MASH
    if (mashGame) {
      mashGame.leave(socket, pseudo);
    }
  });
}

module.exports = { initSocketHandlers, leaderboardManager, motusGame };
