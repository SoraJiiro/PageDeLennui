const dbUsers = require("../db/dbUsers");

const OG_CUTOFF = Date.UTC(2025, 11, 25, 23, 59, 59, 999);

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
    id: "CM",
    emoji: "🍀",
    name: "Casino Master",
    isEligible: ({ casinoTotal }) => {
      const total = typeof casinoTotal === "number" ? casinoTotal : 0;
      return total >= 100000;
    },
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
  const unoGames = FileService.data.unoStats ? FileService.data.unoStats[p] : 0;
  const casinoTotal = getCasinoTotalFor(p, FileService);

  let changed = false;

  AUTO_BADGES.forEach((badge) => {
    if (!badgesData.catalog[badge.id]) {
      badgesData.catalog[badge.id] = { emoji: badge.emoji, name: badge.name };
      changed = true;
    }

    const eligible = badge.isEligible({ user, motus, unoGames, casinoTotal });
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
