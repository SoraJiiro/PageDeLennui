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
      if (!user || !user.createdAt) return false;
      const createdAt = Date.parse(user.createdAt);
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
    isEligible: ({ coinflipGames }) => coinflipGames >= 50,
  },
  {
    id: "BlackjackTag",
    emoji: "🃏",
    name: "Blackjack Grinder",
    isEligible: ({ blackjackHands }) => blackjackHands >= 50,
  },
  {
    id: "RouletteTag",
    emoji: "🎯",
    name: "Roulette Veteran",
    isEligible: ({ rouletteGames }) => rouletteGames >= 40,
  },
  {
    id: "SlotsTag",
    emoji: "🎰",
    name: "Slots Spinner",
    isEligible: ({ slotsGames }) => slotsGames >= 40,
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
  const coinBet = coinflip[pseudo] && coinflip[pseudo].totalBet;
  const blackjackBet = blackjack[pseudo] && blackjack[pseudo].totalBet;
  return (Number(coinBet) || 0) + (Number(blackjackBet) || 0);
}

function applyAutoBadges({ pseudo, FileService }) {
  const p = String(pseudo || "").trim();
  if (!p) return { changed: false, assigned: [] };

  const badgesData = ensureBadgesData(FileService);
  const { assigned, selected } = ensureUserBucket(badgesData, p);
  const assignedSet = new Set(assigned);

  const user = dbUsers.findBypseudo(p);
  const motus = FileService.data.motusScores
    ? FileService.data.motusScores[p]
    : null;
  const unoGames = readNum(FileService.data.unoStats, p);
  const score2048 = readNum(FileService.data.scores2048, p);
  const maxTile2048 = readNum(FileService.data.scores2048MaxTile, p);
  const dinoBest = readNum(FileService.data.dinoScores, p);
  const flappyBest = readNum(FileService.data.flappyScores, p);
  const snakeBest = readNum(FileService.data.snakeScores, p);
  const blockblastBest = readNum(FileService.data.blockblastScores, p);
  const sudokuCompleted = readNum(FileService.data.sudokuScores, p);
  const p4Wins = readNum(FileService.data.p4Wins, p);
  const mashWins = readNum(FileService.data.mashWins, p);
  const coinflipGames = readNum(
    FileService.data.coinflipStats,
    p,
    "gamesPlayed",
  );
  const blackjackHands = readNum(
    FileService.data.blackjackStats,
    p,
    "handsPlayed",
  );
  const rouletteGames = readNum(
    FileService.data.rouletteStats,
    p,
    "gamesPlayed",
  );
  const slotsGames = readNum(FileService.data.slotsStats, p, "gamesPlayed");
  const casinoTotal = getCasinoTotalFor(p, FileService);
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

    const eligible = badge.isEligible({
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
      blackjackHands,
      rouletteGames,
      slotsGames,
      casinoTotal,
      clickerFouDone,
    });
    if (eligible && !assignedSet.has(badge.id)) {
      assignedSet.add(badge.id);
      changed = true;
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

module.exports = { applyAutoBadges };
