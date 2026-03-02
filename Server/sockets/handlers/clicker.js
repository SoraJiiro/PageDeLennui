// --- CPS / Anti-cheat tracker (shared across all sockets) ---
const cpsTracker = new Map();
const CPS_THRESHOLD = Number(process.env.CPS_THRESHOLD) || 50; // clicks/sec
const CPS_DURATION_MS = Number(process.env.CPS_DURATION_MS) || 3000; // ms
const CPS_PENALTY = Number(process.env.CPS_PENALTY) || 1000; // clicks to remove
const CLICKER_UPGRADE_GROWTH = 1.8;

const CLICKER_UPGRADES = {
  per_click_1: {
    id: "per_click_1",
    name: "Click Booster",
    cost: 210,
    maxLevel: 20,
    type: "perClick",
    valuePerLevel: 1,
  },
  per_click_2: {
    id: "per_click_2",
    name: "Le Flo",
    cost: 1000,
    maxLevel: 15,
    type: "perClick",
    valuePerLevel: 5,
  },
  auto_click_1: {
    id: "auto_click_1",
    name: "CPS Booster",
    cost: 400,
    maxLevel: 20,
    type: "autoCps",
    valuePerLevel: 1,
  },
  auto_click_2: {
    id: "auto_click_2",
    name: "L'Ultime",
    cost: 12500,
    maxLevel: 10,
    type: "autoCps",
    valuePerLevel: 7,
  },
};

function getUserUpgrades(FileService, pseudo) {
  if (
    !FileService.data.clickerUpgrades ||
    typeof FileService.data.clickerUpgrades !== "object"
  ) {
    FileService.data.clickerUpgrades = {};
  }
  if (!FileService.data.clickerUpgrades[pseudo]) {
    FileService.data.clickerUpgrades[pseudo] = {};
  }
  return FileService.data.clickerUpgrades[pseudo];
}

function getUpgradeEffects(FileService, pseudo) {
  const upgrades = getUserUpgrades(FileService, pseudo);
  let perClickBonus = 0;
  let autoCpsBonus = 0;
  for (const def of Object.values(CLICKER_UPGRADES)) {
    const level = Math.max(0, Math.floor(Number(upgrades[def.id] || 0)));
    if (def.type === "perClick") perClickBonus += level * def.valuePerLevel;
    if (def.type === "autoCps") autoCpsBonus += level * def.valuePerLevel;
  }
  return { perClickBonus, autoCpsBonus };
}

function getUpgradePayload(FileService, pseudo) {
  const upgrades = getUserUpgrades(FileService, pseudo);
  const effects = getUpgradeEffects(FileService, pseudo);
  return {
    upgrades,
    catalog: Object.values(CLICKER_UPGRADES),
    effects,
  };
}

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
  applyAutoBadges,
  withGame,
  colors,
}) {
  const { getWallet } = require("../../services/wallet");

  function emitWalletForUser() {
    io.to("user:" + pseudo).emit(
      "economy:wallet",
      getWallet(FileService, pseudo, FileService.data.clicks[pseudo] || 0),
    );
  }

  socket.on("clicker:getUpgrades", () => {
    socket.emit("clicker:upgrades", getUpgradePayload(FileService, pseudo));
  });

  socket.on("clicker:buyUpgrade", ({ id }) => {
    const def = CLICKER_UPGRADES[id];
    if (!def) return socket.emit("clicker:upgradeError", "Upgrade introuvable");

    const userUpgrades = getUserUpgrades(FileService, pseudo);
    const level = Math.max(0, Math.floor(Number(userUpgrades[id] || 0)));
    if (level >= def.maxLevel) {
      return socket.emit("clicker:upgradeError", "Niveau max atteint");
    }

    const dynamicCost = Math.floor(
      def.cost * Math.pow(CLICKER_UPGRADE_GROWTH, level),
    );
    const currentClicks = Math.max(
      0,
      Math.floor(Number(FileService.data.clicks[pseudo] || 0)),
    );
    if (currentClicks < dynamicCost) {
      return socket.emit("clicker:upgradeError", "Pas assez de clicks");
    }

    FileService.data.clicks[pseudo] = currentClicks - dynamicCost;
    userUpgrades[id] = level + 1;

    FileService.save("clicks", FileService.data.clicks);
    FileService.save("clickerUpgrades", FileService.data.clickerUpgrades);

    io.to("user:" + pseudo).emit("clicker:you", {
      score: FileService.data.clicks[pseudo],
    });
    leaderboardManager.broadcastClickerLB(io);
    emitWalletForUser();
    socket.emit("clicker:upgrades", getUpgradePayload(FileService, pseudo));
  });

  socket.on("clicker:humanPeakUpdate", ({ peakCps } = {}) => {
    try {
      const nextPeak = Number(peakCps);
      if (!Number.isFinite(nextPeak)) return;
      const safePeak = Math.max(0, Math.min(100, nextPeak));

      if (
        !FileService.data.clickerHumanPeakCps ||
        typeof FileService.data.clickerHumanPeakCps !== "object"
      ) {
        FileService.data.clickerHumanPeakCps = {};
      }

      const currentPeak =
        Number(FileService.data.clickerHumanPeakCps[pseudo]) || 0;
      if (safePeak <= currentPeak) return;

      FileService.data.clickerHumanPeakCps[pseudo] = safePeak;
      FileService.save(
        "clickerHumanPeakCps",
        FileService.data.clickerHumanPeakCps,
      );
      leaderboardManager.broadcastClickerLB(io);
    } catch (e) {
      console.error("Erreur clicker:humanPeakUpdate:", e);
    }
  });

  socket.on("clicker:humanCpsChallengeComplete", ({ peakCps } = {}) => {
    try {
      if (
        !FileService.data.clickerFouChallenges ||
        typeof FileService.data.clickerFouChallenges !== "object"
      ) {
        FileService.data.clickerFouChallenges = {};
      }

      if (!FileService.data.clickerFouChallenges[pseudo]) {
        FileService.data.clickerFouChallenges[pseudo] = {
          completedAt: new Date().toISOString(),
          requirement: "14cps_6.7s",
        };
        FileService.save(
          "clickerFouChallenges",
          FileService.data.clickerFouChallenges,
        );
      }

      const reportedPeak = Number(peakCps);
      if (Number.isFinite(reportedPeak)) {
        if (
          !FileService.data.clickerHumanPeakCps ||
          typeof FileService.data.clickerHumanPeakCps !== "object"
        ) {
          FileService.data.clickerHumanPeakCps = {};
        }
        const safePeak = Math.max(0, Math.min(100, reportedPeak));
        const currentPeak =
          Number(FileService.data.clickerHumanPeakCps[pseudo]) || 0;
        if (safePeak > currentPeak) {
          FileService.data.clickerHumanPeakCps[pseudo] = safePeak;
          FileService.save(
            "clickerHumanPeakCps",
            FileService.data.clickerHumanPeakCps,
          );
          leaderboardManager.broadcastClickerLB(io);
        }
      }

      if (typeof applyAutoBadges === "function") {
        applyAutoBadges({ pseudo, FileService });
      }
    } catch (e) {
      console.error("Erreur clicker:humanCpsChallengeComplete:", e);
    }
  });

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

      const effects = getUpgradeEffects(FileService, pseudo);
      const perClickGain =
        1 + Math.max(0, Math.floor(Number(effects.perClickBonus) || 0));
      FileService.data.clicks[pseudo] =
        (FileService.data.clicks[pseudo] || 0) + perClickGain;
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

          try {
            recalculateMedals(pseudo, penalized, io, false, true);
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

  // Evenement pour les auto-clicks (émis par le client). Ces clicks doivent
  // ajouter des clicks de base sans appliquer les bonuses "perClick".
  socket.on("clicker:autoClick", () => {
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

      // NE PAS appliquer le perClickBonus aux auto-clicks
      const perClickGain = 1;
      FileService.data.clicks[pseudo] =
        (FileService.data.clicks[pseudo] || 0) + perClickGain;
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
          const penalized = current - CPS_PENALTY;
          FileService.data.clicks[pseudo] = penalized;
          FileService.save("clicks", FileService.data.clicks);

          if (penalized < 0) {
            if (!FileService.data.cheaters) FileService.data.cheaters = [];
            if (!FileService.data.cheaters.includes(pseudo)) {
              FileService.data.cheaters.push(pseudo);
              FileService.save("cheaters", FileService.data.cheaters);
            }
          }

          try {
            recalculateMedals(pseudo, penalized, io, false, true);
          } catch (e) {
            console.warn("Erreur recalcul médailles après pénalité", e);
          }

          persistBanIp(ip);

          console.log({
            level: "action",
            message: `IP ${ip} bannie automatiquement pour CPS élevé. ${CPS_PENALTY} clicks retirés à ${pseudo}`,
          });

          io.emit(
            "system:info",
            `${pseudo} a été banni pour triche (CPS trop élevé) !`,
          );

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

          leaderboardManager.broadcastClickerLB(io);
        }
      } else {
        track.violationStart = null;
      }
    } catch (e) {
      console.error("Erreur lors du traitement clicker:autoClick:", e);
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
    if (
      FileService.data.clickerUpgrades &&
      FileService.data.clickerUpgrades[pseudo]
    ) {
      FileService.data.clickerUpgrades[pseudo] = {};
      FileService.save("clickerUpgrades", FileService.data.clickerUpgrades);
      socket.emit("clicker:upgrades", getUpgradePayload(FileService, pseudo));
    }
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

    recalculateMedals(
      pseudo,
      FileService.data.clicks[pseudo],
      io,
      false,
      false,
    );

    leaderboardManager.broadcastClickerLB(io);

    broadcastSystemMessage(
      io,
      `${pseudo} a régénéré ses Médailles ! (pigeon)`,
      true,
    );
    socket.emit("system:info", "✅ Couleurs régénérées avec succès !");
  });
}

module.exports = {
  registerClickerHandlers,
  getUserUpgrades,
  getUpgradePayload,
};
