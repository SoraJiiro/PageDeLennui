const fs = require("fs");
const path = require("path");

const CHAT_BADGES_PATH = path.join(__dirname, "data", "chat_badges.json");

const REQUIRED_BADGES = {
  SISR: { name: "SISR", emoji: "\uD83D\uDD10" },
  SLAM: { name: "SLAM", emoji: "\uD83D\uDCBB" },
  Lady: { name: "Lady", emoji: "\uD83D\uDC81\u200D\u2640\uFE0F" },
  BugFinder: {
    name: "Bug Finder",
    emoji: "\uD83D\uDD75\uFE0F\u200D\u2642\uFE0F",
  },
};

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Impossible de lire ${filePath}: ${err.message}`);
  }
}

function writeJson(filePath, data) {
  const text = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(filePath, text, "utf8");
}

function ensureBadges() {
  const data = readJson(CHAT_BADGES_PATH);

  if (!data || typeof data !== "object") {
    throw new Error("Le JSON chat_badges est invalide");
  }
  if (!data.catalog || typeof data.catalog !== "object") {
    data.catalog = {};
  }
  if (!data.users || typeof data.users !== "object") {
    data.users = {};
  }

  const added = [];

  for (const [id, badgeDef] of Object.entries(REQUIRED_BADGES)) {
    if (!data.catalog[id]) {
      data.catalog[id] = {
        emoji: badgeDef.emoji,
        name: badgeDef.name,
      };
      added.push(id);
    }
  }

  if (added.length > 0) {
    writeJson(CHAT_BADGES_PATH, data);
  }

  return added;
}

try {
  const added = ensureBadges();
  if (added.length === 0) {
    console.log("Aucun badge ajoute: tout est deja present.");
  } else {
    console.log(`Badges ajoutes: ${added.join(", ")}`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
