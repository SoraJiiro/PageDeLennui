// --- CPS / Anti-cheat tracker (shared across all sockets) ---
const cpsTracker = new Map();
const CPS_THRESHOLD = Number(process.env.CPS_THRESHOLD) || 50; // clicks/sec
const CPS_DURATION_MS = Number(process.env.CPS_DURATION_MS) || 3000; // ms
const CPS_PENALTY = Number(process.env.CPS_PENALTY) || 1000; // clicks to remove
const CLICKER_FOU_CPS_THRESHOLD = 12;
const CLICKER_FOU_REQUIRED_MS = 6700;
const CLICKER_FOU_INACTIVITY_MS = 1100;
const DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS = {
  humanPatternWindowMs: Number(process.env.HUMAN_PATTERN_WINDOW_MS) || 5000,
  humanPatternMinSamples: Number(process.env.HUMAN_PATTERN_MIN_SAMPLES) || 16,
  humanFastConstAvgMs: Number(process.env.HUMAN_FAST_CONST_AVG_MS) || 125,
  humanFastConstStdMs: Number(process.env.HUMAN_FAST_CONST_STD_MS) || 14,
  humanVeryConstAvgMs: Number(process.env.HUMAN_VERY_CONST_AVG_MS) || 260,
  humanVeryConstStdMs: Number(process.env.HUMAN_VERY_CONST_STD_MS) || 5,
};
const clickerAntiCheatRuntimeSettings = {
  ...DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS,
};
let clickerAntiCheatHydrated = false;
const CLICKER_UPGRADE_GROWTH = 1.8;

function clampInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeClickerAntiCheatSettings(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  return {
    humanPatternWindowMs: clampInt(
      src.humanPatternWindowMs,
      DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS.humanPatternWindowMs,
      500,
      120000,
    ),
    humanPatternMinSamples: clampInt(
      src.humanPatternMinSamples,
      DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS.humanPatternMinSamples,
      3,
      1000,
    ),
    humanFastConstAvgMs: clampInt(
      src.humanFastConstAvgMs,
      DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS.humanFastConstAvgMs,
      10,
      5000,
    ),
    humanFastConstStdMs: clampInt(
      src.humanFastConstStdMs,
      DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS.humanFastConstStdMs,
      1,
      1000,
    ),
    humanVeryConstAvgMs: clampInt(
      src.humanVeryConstAvgMs,
      DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS.humanVeryConstAvgMs,
      10,
      10000,
    ),
    humanVeryConstStdMs: clampInt(
      src.humanVeryConstStdMs,
      DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS.humanVeryConstStdMs,
      1,
      1000,
    ),
  };
}

function getClickerAntiCheatSettings() {
  return { ...clickerAntiCheatRuntimeSettings };
}

function getDefaultClickerAntiCheatSettings() {
  return { ...DEFAULT_CLICKER_ANTI_CHEAT_SETTINGS };
}

function setClickerAntiCheatSettings(nextPartial = {}, FileService) {
  const merged = {
    ...clickerAntiCheatRuntimeSettings,
    ...(nextPartial && typeof nextPartial === "object" ? nextPartial : {}),
  };
  const normalized = normalizeClickerAntiCheatSettings(merged);
  Object.assign(clickerAntiCheatRuntimeSettings, normalized);

  if (FileService && FileService.data) {
    FileService.data.clickerAntiCheatSettings = {
      ...clickerAntiCheatRuntimeSettings,
    };
    if (typeof FileService.save === "function") {
      FileService.save(
        "clickerAntiCheatSettings",
        FileService.data.clickerAntiCheatSettings,
      );
    }
  }

  return getClickerAntiCheatSettings();
}

function resetClickerAntiCheatSettings(FileService) {
  Object.assign(
    clickerAntiCheatRuntimeSettings,
    getDefaultClickerAntiCheatSettings(),
  );

  if (FileService && FileService.data) {
    FileService.data.clickerAntiCheatSettings = {
      ...clickerAntiCheatRuntimeSettings,
    };
    if (typeof FileService.save === "function") {
      FileService.save(
        "clickerAntiCheatSettings",
        FileService.data.clickerAntiCheatSettings,
      );
    }
  }

  return getClickerAntiCheatSettings();
}

function hydrateClickerAntiCheatSettings(FileService) {
  if (clickerAntiCheatHydrated) return;
  clickerAntiCheatHydrated = true;

  const stored = FileService?.data?.clickerAntiCheatSettings;
  if (!stored || typeof stored !== "object") return;

  const normalized = normalizeClickerAntiCheatSettings(stored);
  Object.assign(clickerAntiCheatRuntimeSettings, normalized);
  if (FileService && FileService.data) {
    FileService.data.clickerAntiCheatSettings = { ...normalized };
  }
}

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
  persistBanPseudo,
  recalculateMedals,
  broadcastSystemMessage,
  applyAutoBadges,
  withGame,
  colors,
}) {
  const { getWallet } = require("../../services/wallet");
  hydrateClickerAntiCheatSettings(FileService);
  socket.emit("clicker:antiCheatSettings", getClickerAntiCheatSettings());

  function emitWalletForUser() {
    io.to("user:" + pseudo).emit(
      "economy:wallet",
      getWallet(FileService, pseudo, FileService.data.clicks[pseudo] || 0),
    );
  }

  function ensureClickerFouAwarded() {
    if (
      !FileService.data.clickerFouChallenges ||
      typeof FileService.data.clickerFouChallenges !== "object"
    ) {
      FileService.data.clickerFouChallenges = {};
    }

    if (FileService.data.clickerFouChallenges[pseudo]) {
      return false;
    }

    FileService.data.clickerFouChallenges[pseudo] = {
      completedAt: new Date().toISOString(),
      requirement: "12cps_6.7s",
    };
    FileService.save(
      "clickerFouChallenges",
      FileService.data.clickerFouChallenges,
    );

    if (typeof applyAutoBadges === "function") {
      applyAutoBadges({ pseudo, FileService });
    }

    return true;
  }

  function evaluateHumanCpsChallenge(now) {
    if (!socket.data) socket.data = {};
    if (!socket.data.clickerHumanChallenge) {
      socket.data.clickerHumanChallenge = {
        manualTimestamps: [],
        aboveThresholdStart: null,
        lastManualAt: null,
        achieved: false,
      };
    }

    const tracker = socket.data.clickerHumanChallenge;
    const lastManualAt = Number(tracker.lastManualAt || 0);
    if (lastManualAt > 0 && now - lastManualAt > CLICKER_FOU_INACTIVITY_MS) {
      tracker.manualTimestamps = [];
      tracker.aboveThresholdStart = null;
    }

    tracker.lastManualAt = now;
    tracker.manualTimestamps.push(now);
    const oneSecCut = now - 1000;
    tracker.manualTimestamps = tracker.manualTimestamps.filter(
      (t) => t >= oneSecCut,
    );

    const cpsHumain = tracker.manualTimestamps.length;

    if (
      !FileService.data.clickerHumanPeakCps ||
      typeof FileService.data.clickerHumanPeakCps !== "object"
    ) {
      FileService.data.clickerHumanPeakCps = {};
    }
    const currentPeak =
      Number(FileService.data.clickerHumanPeakCps[pseudo]) || 0;
    if (cpsHumain > currentPeak) {
      FileService.data.clickerHumanPeakCps[pseudo] = cpsHumain;
      FileService.save(
        "clickerHumanPeakCps",
        FileService.data.clickerHumanPeakCps,
      );
      leaderboardManager.broadcastClickerLB(io);
    }

    if (cpsHumain >= CLICKER_FOU_CPS_THRESHOLD) {
      if (!tracker.aboveThresholdStart) tracker.aboveThresholdStart = now;

      if (
        !tracker.achieved &&
        now - tracker.aboveThresholdStart >= CLICKER_FOU_REQUIRED_MS
      ) {
        tracker.achieved = true;
        ensureClickerFouAwarded();
      }
    } else {
      tracker.aboveThresholdStart = null;
    }
  }

  function evaluateHumanConstancySuspicion(now) {
    if (!socket.data) socket.data = {};
    if (!socket.data.clickerHumanPattern) {
      socket.data.clickerHumanPattern = {
        samples: [],
        lastClickAt: 0,
      };
    }

    const tracker = socket.data.clickerHumanPattern;
    const lastClickAt = Number(tracker.lastClickAt || 0);
    tracker.lastClickAt = now;

    if (lastClickAt > 0) {
      const delta = now - lastClickAt;
      if (delta > 0) {
        if (delta > 2000) {
          tracker.samples = [];
        } else {
          tracker.samples.push({ at: now, delta });
        }
      }
    }

    const cutoff = now - clickerAntiCheatRuntimeSettings.humanPatternWindowMs;
    tracker.samples = tracker.samples.filter((s) => Number(s.at) >= cutoff);

    if (
      tracker.samples.length <
      clickerAntiCheatRuntimeSettings.humanPatternMinSamples
    ) {
      return null;
    }

    const deltas = tracker.samples.map((s) => Number(s.delta) || 0);
    const sampleCount = deltas.length;
    if (sampleCount === 0) return null;

    const avgMs = deltas.reduce((a, b) => a + b, 0) / sampleCount;
    const variance =
      deltas.reduce((a, d) => a + Math.pow(d - avgMs, 2), 0) / sampleCount;
    const stdMs = Math.sqrt(Math.max(0, variance));
    const minMs = Math.min(...deltas);
    const maxMs = Math.max(...deltas);
    const approxCps = avgMs > 0 ? 1000 / avgMs : 0;

    if (
      avgMs <= clickerAntiCheatRuntimeSettings.humanFastConstAvgMs &&
      stdMs <= clickerAntiCheatRuntimeSettings.humanFastConstStdMs
    ) {
      return {
        reason: "FAST_CONSTANT_HUMAN_CLICKS",
        sampleCount,
        avgMs,
        stdMs,
        minMs,
        maxMs,
        approxCps,
      };
    }

    if (
      avgMs <= clickerAntiCheatRuntimeSettings.humanVeryConstAvgMs &&
      stdMs <= clickerAntiCheatRuntimeSettings.humanVeryConstStdMs
    ) {
      return {
        reason: "VERY_CONSTANT_HUMAN_CLICKS",
        sampleCount,
        avgMs,
        stdMs,
        minMs,
        maxMs,
        approxCps,
      };
    }

    return null;
  }

  function banPseudoForSuspiciousPattern(pattern) {
    try {
      const ip = getIpFromSocket(socket);

      try {
        FileService.appendLog({
          type: "CLICKER_SUSPECT_PATTERN",
          pseudo,
          ip,
          reason: pattern.reason,
          sampleCount: pattern.sampleCount,
          avgMs: Number(pattern.avgMs.toFixed(2)),
          stdMs: Number(pattern.stdMs.toFixed(2)),
          minMs: pattern.minMs,
          maxMs: pattern.maxMs,
          approxCps: Number(pattern.approxCps.toFixed(2)),
          at: new Date().toISOString(),
        });
      } catch (e) {}

      if (!FileService.data.cheaters) FileService.data.cheaters = [];
      if (!FileService.data.cheaters.includes(pseudo)) {
        FileService.data.cheaters.push(pseudo);
        FileService.save("cheaters", FileService.data.cheaters);
      }

      const current = FileService.data.clicks[pseudo] || 0;
      FileService.data.clicks[pseudo] = current - CPS_PENALTY;
      FileService.save("clicks", FileService.data.clicks);

      try {
        recalculateMedals(
          pseudo,
          FileService.data.clicks[pseudo],
          io,
          false,
          true,
        );
      } catch (e) {}

      if (typeof persistBanPseudo === "function") {
        persistBanPseudo(pseudo);
      }

      io.emit(
        "system:info",
        `${pseudo} a été banni pour triche (pattern de clics suspects) !`,
      );

      io.sockets.sockets.forEach((s) => {
        const sp =
          (s.handshake && s.handshake.session && s.handshake.session.user
            ? s.handshake.session.user.pseudo
            : null) || (s.data ? s.data.pseudo : null);

        if (String(sp || "").toLowerCase() !== String(pseudo).toLowerCase())
          return;

        try {
          s.emit("system:notification", {
            message: "🚫 Votre pseudo a été banni pour clics anormaux",
            duration: 9000,
          });
        } catch (e) {}
        try {
          s.disconnect(true);
        } catch (e) {}
      });

      leaderboardManager.broadcastClickerLB(io);

      console.log({
        level: "action",
        message: `[CLICKER_ANTICHEAT] Ban pseudo ${pseudo} (${ip}) - ${pattern.reason} - avg=${pattern.avgMs.toFixed(
          2,
        )}ms std=${pattern.stdMs.toFixed(2)}ms cps=${pattern.approxCps.toFixed(2)}`,
      });
    } catch (e) {
      console.error("Erreur banPseudoForSuspiciousPattern:", e);
    }
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

  socket.on("clicker:click", () => {
    try {
      const ip = getIpFromSocket(socket);
      const now = Date.now();

      evaluateHumanCpsChallenge(now);
      const suspiciousPattern = evaluateHumanConstancySuspicion(now);
      if (suspiciousPattern) {
        banPseudoForSuspiciousPattern(suspiciousPattern);
        return;
      }

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
  getClickerAntiCheatSettings,
  getDefaultClickerAntiCheatSettings,
  setClickerAntiCheatSettings,
  resetClickerAntiCheatSettings,
};
