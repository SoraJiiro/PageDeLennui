const dbUsers = require("../db/dbUsers");

const OG_CUTOFF = Date.UTC(2025, 11, 25, 23, 59, 59, 999);

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function readNum(map, pseudo, key = null) {
  if (!map || typeof map !== "object") return 0;
  const entry = map[pseudo];
  if (key == null) return toInt(entry);
  if (!entry || typeof entry !== "object") return 0;
  return toInt(entry[key]);
}

const AUTO_BADGES = [
  {
    id: "OgTag",
    emoji: "🤍",
    name: "OG",
    isEligible: ({ user }) => {
      if (!user || typeof user !== "object") return false;
      const createdRaw =
        user.createdAt || user.creeAt || user.created_at || user.created;
      if (!createdRaw) return false;
      const createdAt = Date.parse(String(createdRaw));
      return Number.isFinite(createdAt) && createdAt <= OG_CUTOFF;
    },
  },
  {
    id: "MotusTag",
    emoji: "📝",
    name: "Motus Fanatic",
    isEligible: ({ motus }) => {
      const words = motus && typeof motus.words === "number" ? motus.words : 0;
      return words >= 45;
    },
  },
  {
    id: "UNO",
    emoji: "1️⃣",
    name: "Uno Addict",
    isEligible: ({ unoGames }) => {
      const games = typeof unoGames === "number" ? unoGames : 0;
      return games >= 50;
    },
  },
  {
    id: "Tag2048",
    emoji: "🧩",
    name: "2048 Master",
    isEligible: ({ score2048, maxTile2048 }) => {
      return maxTile2048 >= 1024 || score2048 >= 5000;
    },
  },
  {
    id: "DinoTag",
    emoji: "🦖",
    name: "Dino Runner",
    isEligible: ({ dinoBest }) => dinoBest >= 7500,
  },
  {
    id: "FlappyTag",
    emoji: "🐤",
    name: "Flappy Pilot",
    isEligible: ({ flappyBest }) => flappyBest >= 100,
  },
  {
    id: "SnakeTag",
    emoji: "🐍",
    name: "Snake Legend",
    isEligible: ({ snakeBest }) => snakeBest >= 120,
  },
  {
    id: "BlockBlastTag",
    emoji: "🧱",
    name: "Block Blast Pro",
    isEligible: ({ blockblastBest }) => blockblastBest >= 10000,
  },
  {
    id: "SudokuTag",
    emoji: "🔢",
    name: "Sudoku Solver",
    isEligible: ({ sudokuCompleted }) => sudokuCompleted >= 20,
  },
  {
    id: "P4Tag",
    emoji: "🔴",
    name: "Puissance 4 Champion",
    isEligible: ({ p4Wins }) => p4Wins >= 15,
  },
  {
    id: "MashTag",
    emoji: "⚡",
    name: "Mash Dominator",
    isEligible: ({ mashWins }) => mashWins >= 15,
  },
  {
    id: "CoinflipTag",
    emoji: "🪙",
    name: "Coinflip Addict",
    isEligible: ({ coinflipGames, coinflipTotalBet }) =>
      coinflipGames >= 50 && coinflipTotalBet >= 5000,
  },
  {
    id: "BlackjackTag",
    emoji: "🃏",
    name: "Blackjack Grinder",
    isEligible: ({ blackjackHands, blackjackTotalBet }) =>
      blackjackHands >= 50 && blackjackTotalBet >= 5000,
  },
  {
    id: "RouletteTag",
    emoji: "🎯",
    name: "Roulette Veteran",
    isEligible: ({ rouletteGames, rouletteTotalBet }) =>
      rouletteGames >= 40 && rouletteTotalBet >= 4000,
  },
  {
    id: "SlotsTag",
    emoji: "🎰",
    name: "Slots Spinner",
    isEligible: ({ slotsGames, slotsTotalBet }) =>
      slotsGames >= 40 && slotsTotalBet >= 4000,
  },
  {
    id: "CM",
    emoji: "🍀",
    name: "Casino Master",
    isEligible: ({ casinoTotal }) => {
      const total = typeof casinoTotal === "number" ? casinoTotal : 0;
      return total >= 100000;
    },
  },
  {
    id: "ClickerFou",
    emoji: "🖱️",
    name: "Clicker Fou",
    isEligible: ({ clickerFouDone }) => Boolean(clickerFouDone),
  },
];

function ensureBadgesData(FileService) {
  if (
    !FileService.data.chatBadges ||
    typeof FileService.data.chatBadges !== "object"
  ) {
    FileService.data.chatBadges = { catalog: {}, users: {} };
  }
  if (!FileService.data.chatBadges.catalog)
    FileService.data.chatBadges.catalog = {};
  if (!FileService.data.chatBadges.users)
    FileService.data.chatBadges.users = {};
  return FileService.data.chatBadges;
}

function ensureUserBucket(badgesData, pseudo) {
  if (!badgesData.users[pseudo]) {
    badgesData.users[pseudo] = { assigned: [], selected: [] };
  }
  const bucket = badgesData.users[pseudo];
  const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];
  const selected = Array.isArray(bucket.selected) ? bucket.selected : [];
  return { bucket, assigned, selected };
}

function getCasinoTotalFor(pseudo, FileService) {
  const coinflip = FileService.data.coinflipStats || {};
  const blackjack = FileService.data.blackjackStats || {};
  const roulette = FileService.data.rouletteStats || {};
  const slots = FileService.data.slotsStats || {};
  const coinBet = coinflip[pseudo] && coinflip[pseudo].totalBet;
  const blackjackBet = blackjack[pseudo] && blackjack[pseudo].totalBet;
  const rouletteBet = roulette[pseudo] && roulette[pseudo].totalBet;
  const slotsBet = slots[pseudo] && slots[pseudo].totalBet;
  return (
    (Number(coinBet) || 0) +
    (Number(blackjackBet) || 0) +
    (Number(rouletteBet) || 0) +
    (Number(slotsBet) || 0)
  );
}

function getEligibilitySnapshot(p, FileService) {
  return {
    unoGames: readNum(FileService.data.unoStats, p),
    score2048: readNum(FileService.data.scores2048, p),
    maxTile2048: readNum(FileService.data.scores2048MaxTile, p),
    dinoBest: readNum(FileService.data.dinoScores, p),
    flappyBest: readNum(FileService.data.flappyScores, p),
    snakeBest: readNum(FileService.data.snakeScores, p),
    blockblastBest: readNum(FileService.data.blockblastScores, p),
    sudokuCompleted: readNum(FileService.data.sudokuScores, p),
    p4Wins: readNum(FileService.data.p4Wins, p),
    mashWins: readNum(FileService.data.mashWins, p),
    coinflipGames: readNum(FileService.data.coinflipStats, p, "gamesPlayed"),
    coinflipTotalBet: readNum(FileService.data.coinflipStats, p, "totalBet"),
    blackjackHands: readNum(FileService.data.blackjackStats, p, "handsPlayed"),
    blackjackTotalBet: readNum(FileService.data.blackjackStats, p, "totalBet"),
    rouletteGames: readNum(FileService.data.rouletteStats, p, "gamesPlayed"),
    rouletteTotalBet: readNum(FileService.data.rouletteStats, p, "totalBet"),
    slotsGames: readNum(FileService.data.slotsStats, p, "gamesPlayed"),
    slotsTotalBet: readNum(FileService.data.slotsStats, p, "totalBet"),
    casinoTotal: getCasinoTotalFor(p, FileService),
  };
}

function getBadgeUnlockCondition({
  badgeId,
  progress,
  user,
  motus,
  clickerFouDone,
}) {
  switch (badgeId) {
    case "OgTag": {
      const createdRaw =
        user &&
        (user.createdAt ||
          user.creeAt ||
          user.created_at ||
          user.created ||
          null);
      return `createdAt <= ${new Date(OG_CUTOFF).toISOString()} (value=${createdRaw || "unknown"})`;
    }
    case "MotusTag":
      return `motus.words >= 45 (value=${Number(motus?.words || 0)})`;
    case "UNO":
      return `unoGames >= 50 (value=${Number(progress.unoGames || 0)})`;
    case "Tag2048":
      return `maxTile2048 >= 1024 OR score2048 >= 5000 (values=${Number(progress.maxTile2048 || 0)} / ${Number(progress.score2048 || 0)})`;
    case "DinoTag":
      return `dinoBest >= 7500 (value=${Number(progress.dinoBest || 0)})`;
    case "FlappyTag":
      return `flappyBest >= 100 (value=${Number(progress.flappyBest || 0)})`;
    case "SnakeTag":
      return `snakeBest >= 120 (value=${Number(progress.snakeBest || 0)})`;
    case "BlockBlastTag":
      return `blockblastBest >= 10000 (value=${Number(progress.blockblastBest || 0)})`;
    case "SudokuTag":
      return `sudokuCompleted >= 20 (value=${Number(progress.sudokuCompleted || 0)})`;
    case "P4Tag":
      return `p4Wins >= 15 (value=${Number(progress.p4Wins || 0)})`;
    case "MashTag":
      return `mashWins >= 15 (value=${Number(progress.mashWins || 0)})`;
    case "CoinflipTag":
      return `coinflipGames >= 50 AND coinflipTotalBet >= 5000 (values=${Number(progress.coinflipGames || 0)} / ${Number(progress.coinflipTotalBet || 0)})`;
    case "BlackjackTag":
      return `blackjackHands >= 50 AND blackjackTotalBet >= 5000 (values=${Number(progress.blackjackHands || 0)} / ${Number(progress.blackjackTotalBet || 0)})`;
    case "RouletteTag":
      return `rouletteGames >= 40 AND rouletteTotalBet >= 4000 (values=${Number(progress.rouletteGames || 0)} / ${Number(progress.rouletteTotalBet || 0)})`;
    case "SlotsTag":
      return `slotsGames >= 40 AND slotsTotalBet >= 4000 (values=${Number(progress.slotsGames || 0)} / ${Number(progress.slotsTotalBet || 0)})`;
    case "CM":
      return `casinoTotal >= 100000 (value=${Number(progress.casinoTotal || 0)})`;
    case "ClickerFou":
      return `clickerFouDone === true (value=${Boolean(clickerFouDone)})`;
    default:
      return "condition unknown";
  }
}

function getProgressSinceBaseline(current, baseline = {}) {
  const keys = Object.keys(current || {});
  const out = {};
  keys.forEach((key) => {
    out[key] = Math.max(0, toInt(current[key]) - toInt(baseline[key]));
  });
  return out;
}

function resetUserBadgesProgress({ pseudo, FileService }) {
  const p = String(pseudo || "").trim();
  if (!p) return { changed: false, pseudo: p, resetAt: null };

  const badgesData = ensureBadgesData(FileService);
  const snapshot = getEligibilitySnapshot(p, FileService);
  const nowIso = new Date().toISOString();

  badgesData.users[p] = {
    assigned: [],
    selected: [],
    autoBadgeBaseline: {
      ...snapshot,
      resetAt: nowIso,
      lockOg: false,
    },
  };

  if (
    FileService.data.clickerFouChallenges &&
    FileService.data.clickerFouChallenges[p]
  ) {
    delete FileService.data.clickerFouChallenges[p];
    FileService.save(
      "clickerFouChallenges",
      FileService.data.clickerFouChallenges,
    );
  }

  FileService.save("chatBadges", badgesData);

  return { changed: true, pseudo: p, resetAt: nowIso };
}

function applyAutoBadges({ pseudo, FileService }) {
  const p = String(pseudo || "").trim();
  if (!p) return { changed: false, assigned: [] };

  const badgesData = ensureBadgesData(FileService);
  const { bucket, assigned, selected } = ensureUserBucket(badgesData, p);
  const assignedSet = new Set(assigned);

  const user = dbUsers.findBypseudo(p);
  const motus = FileService.data.motusScores
    ? FileService.data.motusScores[p]
    : null;
  const baseline =
    bucket &&
    bucket.autoBadgeBaseline &&
    typeof bucket.autoBadgeBaseline === "object"
      ? bucket.autoBadgeBaseline
      : null;
  const currentProgress = getEligibilitySnapshot(p, FileService);
  const progress = getProgressSinceBaseline(currentProgress, baseline || {});

  const unoGames = progress.unoGames;
  const score2048 = progress.score2048;
  const maxTile2048 = progress.maxTile2048;
  const dinoBest = progress.dinoBest;
  const flappyBest = progress.flappyBest;
  const snakeBest = progress.snakeBest;
  const blockblastBest = progress.blockblastBest;
  const sudokuCompleted = progress.sudokuCompleted;
  const p4Wins = progress.p4Wins;
  const mashWins = progress.mashWins;
  const coinflipGames = progress.coinflipGames;
  const coinflipTotalBet = progress.coinflipTotalBet;
  const blackjackHands = progress.blackjackHands;
  const blackjackTotalBet = progress.blackjackTotalBet;
  const rouletteGames = progress.rouletteGames;
  const rouletteTotalBet = progress.rouletteTotalBet;
  const slotsGames = progress.slotsGames;
  const slotsTotalBet = progress.slotsTotalBet;
  const casinoTotal = progress.casinoTotal;

  const isOgLocked = Boolean(baseline && baseline.lockOg);
  const clickerFouDone = Boolean(
    FileService.data.clickerFouChallenges &&
    FileService.data.clickerFouChallenges[p],
  );

  let changed = false;

  AUTO_BADGES.forEach((badge) => {
    if (!badgesData.catalog[badge.id]) {
      badgesData.catalog[badge.id] = { emoji: badge.emoji, name: badge.name };
      changed = true;
    }

    const eligible =
      badge.id === "OgTag" && isOgLocked
        ? false
        : badge.isEligible({
            user,
            motus,
            unoGames,
            score2048,
            maxTile2048,
            dinoBest,
            flappyBest,
            snakeBest,
            blockblastBest,
            sudokuCompleted,
            p4Wins,
            mashWins,
            coinflipGames,
            coinflipTotalBet,
            blackjackHands,
            blackjackTotalBet,
            rouletteGames,
            rouletteTotalBet,
            slotsGames,
            slotsTotalBet,
            casinoTotal,
            clickerFouDone,
          });
    if (eligible && !assignedSet.has(badge.id)) {
      assignedSet.add(badge.id);
      changed = true;
      try {
        FileService.appendLog({
          type: "AUTO_BADGE_UNLOCKED",
          pseudo: p,
          badgeId: badge.id,
          badgeName: badge.name,
          condition: getBadgeUnlockCondition({
            badgeId: badge.id,
            progress,
            user,
            motus,
            clickerFouDone,
          }),
          at: new Date().toISOString(),
        });
      } catch {}
    }
  });

  if (changed) {
    badgesData.users[p] = {
      assigned: Array.from(assignedSet),
      selected,
    };
    FileService.save("chatBadges", badgesData);
  }

  return { changed, assigned: Array.from(assignedSet) };
}

module.exports = { applyAutoBadges, resetUserBadgesProgress, AUTO_BADGES };
