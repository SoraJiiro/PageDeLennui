// --- CPS / Anti-cheat tracker (shared across all sockets) ---
const cpsTracker = new Map();
const CPS_THRESHOLD = Number(process.env.CPS_THRESHOLD) || 50; // clicks/sec
const CPS_DURATION_MS = Number(process.env.CPS_DURATION_MS) || 3000; // ms
const CPS_PENALTY = Number(process.env.CPS_PENALTY) || 1000; // clicks to remove

function registerClickerHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  getIpFromSocket,
  persistBanIp,
  recalculateMedals,
  broadcastSystemMessage,
  withGame,
  colors,
}) {
  socket.on("clicker:click", () => {
    try {
      const ip = getIpFromSocket(socket);
      const now = Date.now();

      let track = cpsTracker.get(ip);
      if (!track) {
        track = { timestamps: [], violationStart: null, banned: false };
        cpsTracker.set(ip, track);
      }

      track.timestamps.push(now);
      const cutoff = now - 2000;
      while (track.timestamps.length && track.timestamps[0] < cutoff)
        track.timestamps.shift();

      const oneSecCut = now - 1000;
      const cps = track.timestamps.filter((t) => t >= oneSecCut).length;

      FileService.data.clicks[pseudo] =
        (FileService.data.clicks[pseudo] || 0) + 1;
      FileService.save("clicks", FileService.data.clicks);
      io.to("user:" + pseudo).emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      if (track.banned) return;

      if (cps > CPS_THRESHOLD) {
        if (!track.violationStart) track.violationStart = now;
        if (now - track.violationStart >= CPS_DURATION_MS) {
          track.banned = true;
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
                // Même calcul que le client : multiplier par 1.8 puis soustraire 50
                let pallierTemp = precedente.pallier * 1.8;
                let pallier = Math.ceil(pallierTemp - 50);
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
            `${pseudo} a été banni pour triche (CPS trop élevé) !`,
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
        typeof m === "string" ? m === "Tricheur" : m.name === "Tricheur",
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

        if (!isInCheatersList) {
          if (!FileService.data.cheaters) FileService.data.cheaters = [];
          FileService.data.cheaters.push(pseudo);
          FileService.save("cheaters", FileService.data.cheaters);
        }
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
        `\n🔄 Reset Clicker complet pour [${colors.orange}${pseudo}${colors.green}]\n`,
        colors.green,
      ),
    );
  });

  socket.on("clicker:medalUnlock", ({ medalName, colors: newColors }) => {
    if (typeof medalName !== "string" || medalName.trim() === "") return;

    const allMedals = FileService.data.medals;
    const userMedals = allMedals[pseudo] || [];

    const already = userMedals.find((m) =>
      typeof m === "string" ? m === medalName : m.name === medalName,
    );
    if (already) return; // rien à faire

    const entry = {
      name: medalName,
      colors:
        Array.isArray(newColors) && newColors.length >= 3
          ? newColors.slice(0, 24) // limiter pour éviter surcharge
          : [],
    };
    userMedals.push(entry);
    allMedals[pseudo] = userMedals;
    FileService.save("medals", allMedals);

    console.log(
      withGame(
        `🏅 [${colors.orange}${pseudo}${colors.green}] a débloqué ${medalName}`,
        colors.green,
      ),
    );
    broadcastSystemMessage(
      io,
      `${pseudo} a débloqué la médaille ${medalName} !`,
      true,
    );

    // Ré-émission normalisée (objets complets)
    const normalized = userMedals.map((m) =>
      typeof m === "string"
        ? { name: m, colors: [] }
        : { name: m.name, colors: Array.isArray(m.colors) ? m.colors : [] },
    );
    socket.emit("clicker:medals", normalized);
  });

  socket.on("clicker:buyColorRegen", ({ newColors }) => {
    if (!newColors || typeof newColors !== "object") return;

    const currentScore = FileService.data.clicks[pseudo] || 0;
    const COST = 1000000;

    if (currentScore < COST) return;

    // Deduct cost
    FileService.data.clicks[pseudo] = currentScore - COST;
    FileService.save("clicks", FileService.data.clicks);

    // Update medals (apply new colors)
    const userMedals = FileService.data.medals[pseudo] || [];
    let updated = false;

    for (let i = 0; i < userMedals.length; i++) {
      let m = userMedals[i];
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

    recalculateMedals(pseudo, FileService.data.clicks[pseudo], io, false, true);

    leaderboardManager.broadcastClickerLB(io);

    broadcastSystemMessage(
      io,
      `${pseudo} a régénéré ses Médailles ! (pigeon)`,
      true,
    );
    socket.emit("system:info", "✅ Couleurs régénérées avec succès !");
  });
}

module.exports = { registerClickerHandlers };
