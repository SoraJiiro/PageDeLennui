const pixelWarGame = require("../../games/pixelWarGame");
const { getWallet } = require("../../services/wallet");
const { applyAutoBadges } = require("../../services/badgesAuto");

const DAILY_REWARD_TYPES = ["clicks", "pixels", "tokens"];

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function randomInt(min, max) {
  const a = Math.floor(Number(min) || 0);
  const b = Math.floor(Number(max) || 0);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function ensureDailyRewardsStore(FileService) {
  if (
    !FileService.data.dailyRewards ||
    typeof FileService.data.dailyRewards !== "object"
  ) {
    FileService.data.dailyRewards = {};
  }
  return FileService.data.dailyRewards;
}

function ensureUserDailyRewardsBucket(FileService, pseudo) {
  const store = ensureDailyRewardsStore(FileService);
  const today = getTodayKey();
  const bucket =
    store[pseudo] && typeof store[pseudo] === "object" ? store[pseudo] : null;

  if (!bucket || bucket.date !== today) {
    store[pseudo] = {
      date: today,
      claims: {
        clicks: false,
        pixels: false,
        tokens: false,
      },
    };
    FileService.save("dailyRewards", store);
  }

  const claims = store[pseudo].claims || {};
  for (const rewardType of DAILY_REWARD_TYPES) {
    if (typeof claims[rewardType] !== "boolean") {
      claims[rewardType] = false;
    }
  }
  store[pseudo].claims = claims;
  return store[pseudo];
}

function getDailyRewardsState(FileService, pseudo) {
  const bucket = ensureUserDailyRewardsBucket(FileService, pseudo);
  return {
    date: bucket.date,
    claims: { ...bucket.claims },
  };
}

function registerPixelWarHandlers({
  io,
  socket,
  pseudo,
  FileService,
  pixelWarGame,
  leaderboardManager,
}) {
  if (!pseudo) return;

  if (FileService && FileService.data) {
    FileService.data.pixelwarUsers = pixelWarGame.users;
  }

  const buildStatsPayload = (userState) => {
    const user = userState || pixelWarGame.getUserState(pseudo);
    return {
      pixels: user.pixels,
      maxPixels: user.maxPixels,
      nextPixelIn: pixelWarGame.getNextPixelIn(pseudo),
      doublePixelBoostMs:
        typeof pixelWarGame.getDoublePixelBoostRemainingMs === "function"
          ? pixelWarGame.getDoublePixelBoostRemainingMs(pseudo)
          : Math.max(0, Number(user.pixelDoubleUntil || 0) - Date.now()),
      dailyRewards: getDailyRewardsState(FileService, pseudo),
    };
  };

  socket.on("pixelwar:join", () => {
    const user = pixelWarGame.getUserState(pseudo);
    const boardArray = Array.from(pixelWarGame.board);

    socket.emit("pixelwar:init", {
      board: boardArray,
      ...buildStatsPayload(user),
      colors: pixelWarGame.COLORS,
      unlockedColorIndices: Array.from(
        pixelWarGame.getUnlockedColorIndicesForUser(pseudo),
      ),
    });

    socket.emit("pixelwar:stats", buildStatsPayload(user));
  });

  socket.on("pixelwar:place", ({ x, y, colorIndex }) => {
    const res = pixelWarGame.placePixel(pseudo, x, y, colorIndex);
    if (res.success) {
      try {
        applyAutoBadges({ pseudo, FileService });
      } catch {}

      io.emit("pixelwar:update_pixel", { x, y, colorIndex, owner: pseudo });

      const user = pixelWarGame.getUserState(pseudo);
      socket.emit("pixelwar:stats", buildStatsPayload(user));
    } else {
      socket.emit("pixelwar:error", res.reason || "Erreur placement");
    }
  });

  // Après validation d'un dessin (mode batch côté client), on persiste
  // immédiatement le compteur de pixels dans pixelwar_users.json.
  socket.on("pixelwar:batch_done", () => {
    try {
      pixelWarGame.getUserState(pseudo);
      pixelWarGame.saveUsers();
    } catch (e) {
      console.error("pixelwar:batch_done save error:", e);
    }
  });

  socket.on("pixelwar:erase", ({ x, y }) => {
    const res = pixelWarGame.erasePixel(pseudo, x, y);
    if (res.success) {
      io.emit("pixelwar:update_pixel", {
        x: res.x,
        y: res.y,
        colorIndex: res.colorIndex,
        owner: res.owner,
      });

      const user = pixelWarGame.getUserState(pseudo);
      socket.emit("pixelwar:stats", buildStatsPayload(user));
    } else {
      socket.emit("pixelwar:error", res.reason || "Impossible d'effacer");
    }
  });

  socket.on("pixelwar:buy", (type) => {
    const res = pixelWarGame.buyUpgrade(pseudo, type);
    if (res.success) {
      socket.emit("pixelwar:stats", buildStatsPayload(res.userState));
      socket.emit("session:update_money", {
        money: getWallet(
          FileService,
          pseudo,
          FileService.data.clicks[pseudo] || 0,
        ).money,
      });
      socket.emit(
        "economy:wallet",
        getWallet(FileService, pseudo, FileService.data.clicks[pseudo] || 0),
      );

      // Envoyer une notification de succès
      let message = "";
      if (type === "storage_10") {
        message = "Stockage +10 acheté avec succès !";
      } else if (type === "pixel_1") {
        message = "1 Pixel acheté avec succès !";
      } else if (type === "pixel_15") {
        message = "15 Pixels achetés avec succès !";
      } else if (type === "pixel_double_1m") {
        message = "Boost x2 Pixel War (2 min) acheté avec succès !";
      }
      if (message) {
        socket.emit("pixelwar:success", message);
      }
    } else {
      socket.emit("pixelwar:error", res.reason || "Achat impossible");
    }
  });

  socket.on("pixelwar:get_info", ({ x, y }) => {
    const info = pixelWarGame.getPixelInfo(x, y);
    if (info && info.owner) {
      let pfp = "/Public/imgs/defaultProfile.png";
      if (FileService.data.pfps && FileService.data.pfps[info.owner]) {
        pfp = FileService.data.pfps[info.owner];
      }
      socket.emit("pixelwar:pixel_info", {
        x,
        y,
        owner: info.owner,
        pseudo: info.owner,
        pfp,
      });
    } else {
      // Pixel vide - envoyer quand même l'info
      socket.emit("pixelwar:pixel_info", {
        x,
        y,
        owner: null,
        pseudo: "Pixel vide",
        pfp: null,
      });
    }
  });

  socket.on("pixelwar:get_leaderboard", () => {
    socket.emit("pixelwar:leaderboard", pixelWarGame.getLeaderboard());
  });
  socket.on("pixelwar:request_stats", () => {
    const user = pixelWarGame.getUserState(pseudo);
    socket.emit("pixelwar:stats", buildStatsPayload(user));
  });

  socket.on("pixelwar:daily_claim", (rewardTypeRaw) => {
    const rewardType = String(rewardTypeRaw || "")
      .trim()
      .toLowerCase();
    if (!DAILY_REWARD_TYPES.includes(rewardType)) {
      socket.emit("pixelwar:error", "Récompense invalide.");
      return;
    }

    const store = ensureDailyRewardsStore(FileService);
    const bucket = ensureUserDailyRewardsBucket(FileService, pseudo);
    if (bucket.claims[rewardType]) {
      socket.emit("pixelwar:error", "Déjà récupéré aujourd'hui.");
      socket.emit("pixelwar:stats", {
        dailyRewards: getDailyRewardsState(FileService, pseudo),
      });
      return;
    }

    let granted = 0;
    if (rewardType === "clicks") {
      granted = randomInt(200, 15000);
      const current = Math.max(
        0,
        Math.floor(Number(FileService.data.clicks?.[pseudo]) || 0),
      );
      FileService.data.clicks[pseudo] = current + granted;
      FileService.save("clicks", FileService.data.clicks);
      socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });
      if (leaderboardManager?.broadcastClickerLBThrottled) {
        leaderboardManager.broadcastClickerLBThrottled(io, 120);
      }
    } else if (rewardType === "pixels") {
      granted = randomInt(2, 15);
      const user = pixelWarGame.getUserState(pseudo);
      user.pixels = Math.max(0, Math.floor(Number(user.pixels) || 0)) + granted;
      pixelWarGame.usersDirty = true;
      pixelWarGame.saveUsers();
    } else if (rewardType === "tokens") {
      granted = randomInt(2, 25);
      const wallets = FileService.data.wallets || {};
      const existing =
        wallets[pseudo] && typeof wallets[pseudo] === "object"
          ? wallets[pseudo]
          : null;
      const tokensNow = Math.max(0, Math.floor(Number(existing?.tokens) || 0));
      const moneyNow = Math.max(0, Math.floor(Number(existing?.money) || 0));
      const tokenDaily =
        existing && typeof existing.tokenDaily === "object"
          ? existing.tokenDaily
          : null;
      wallets[pseudo] = {
        money: moneyNow,
        tokens: tokensNow + granted,
        tokenDaily: {
          date:
            typeof tokenDaily?.date === "string"
              ? tokenDaily.date
              : getTodayKey(),
          spentMoney: Math.max(
            0,
            Math.floor(Number(tokenDaily?.spentMoney) || 0),
          ),
        },
      };
      FileService.data.wallets = wallets;
      FileService.save("wallets", wallets);
    }

    bucket.claims[rewardType] = true;
    store[pseudo] = bucket;
    FileService.save("dailyRewards", store);

    const user = pixelWarGame.getUserState(pseudo);
    socket.emit("pixelwar:stats", buildStatsPayload(user));
    socket.emit(
      "economy:wallet",
      getWallet(FileService, pseudo, FileService.data.clicks[pseudo] || 0),
    );

    const labelMap = {
      clicks: "Clicks",
      pixels: "Pixels",
      tokens: "Token",
    };
    socket.emit("pixelwar:success", `+${granted} ${labelMap[rewardType]} !`);
  });
}

module.exports = { registerPixelWarHandlers };
