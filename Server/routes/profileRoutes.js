const express = require("express");
const { FileService } = require("../util");
const dbUsers = require("../db/dbUsers");

const router = express.Router();

function normalizePseudo(pseudo) {
  const p = String(pseudo || "").trim();
  return p || null;
}

function isValidHttpUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function getTagFor(pseudo) {
  const tagData = FileService.data.tags ? FileService.data.tags[pseudo] : null;
  if (!tagData) return null;
  if (typeof tagData === "string") return { text: tagData, color: null };
  if (typeof tagData === "object" && tagData.text) return tagData;
  return null;
}

function getStatsFor(pseudo) {
  return {
    clicks: (FileService.data.clicks && FileService.data.clicks[pseudo]) || 0,
    dinoScore:
      (FileService.data.dinoScores && FileService.data.dinoScores[pseudo]) || 0,
    flappyScore:
      (FileService.data.flappyScores &&
        FileService.data.flappyScores[pseudo]) ||
      0,
    snakeScore:
      (FileService.data.snakeScores && FileService.data.snakeScores[pseudo]) ||
      0,
    unoWins:
      (FileService.data.unoWins && FileService.data.unoWins[pseudo]) || 0,
    p4Wins: (FileService.data.p4Wins && FileService.data.p4Wins[pseudo]) || 0,
    blockblastScore:
      (FileService.data.blockblastScores &&
        FileService.data.blockblastScores[pseudo]) ||
      0,
    score2048:
      (FileService.data.scores2048 && FileService.data.scores2048[pseudo]) || 0,
    mashWins:
      (FileService.data.mashWins && FileService.data.mashWins[pseudo]) || 0,
    motus:
      (FileService.data.motusScores && FileService.data.motusScores[pseudo]) ||
      null,
  };
}

function getChatProfile(pseudo) {
  const pfpUrl = FileService.data.pfps ? FileService.data.pfps[pseudo] : null;

  const badgesData = FileService.data.chatBadges || { catalog: {}, users: {} };
  const bucket = (badgesData.users && badgesData.users[pseudo]) || {
    assigned: [],
    selected: [],
  };

  const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];
  const selected = Array.isArray(bucket.selected) ? bucket.selected : [];

  const resolve = (id) => {
    const def = badgesData.catalog ? badgesData.catalog[id] : null;
    if (!def) return null;
    return {
      id,
      emoji: String(def.emoji || "🏷️"),
      name: String(def.name || id),
    };
  };

  const assignedResolved = assigned.map(resolve).filter(Boolean);
  const selectedResolved = selected.slice(0, 3).map(resolve).filter(Boolean);

  return {
    pfpUrl: typeof pfpUrl === "string" && pfpUrl ? pfpUrl : null,
    badges: {
      assigned: assignedResolved,
      selected: selectedResolved,
      assignedIds: assigned,
      selectedIds: selected,
    },
  };
}

function getPfpRequestStatus(pseudo) {
  const reqs = Array.isArray(FileService.data.pfpRequests)
    ? FileService.data.pfpRequests
    : [];
  const pending = reqs
    .slice()
    .reverse()
    .find((r) => r && r.pseudo === pseudo && r.status === "pending");
  return pending ? { pending: true, request: pending } : { pending: false };
}

function parseBirthDateInput(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parts = trimmed.split("-").map((v) => parseInt(v, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  const [year, month, day] = parts;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  if (candidate > todayUtc) return null;
  return trimmed;
}

// --- Public profile (auth) ---
router.get("/user/:pseudo", (req, res) => {
  const pseudo = normalizePseudo(req.params && req.params.pseudo);
  if (!pseudo) return res.status(400).json({ message: "Pseudo manquant" });

  const exists = dbUsers.findBypseudo(pseudo);
  if (!exists)
    return res.status(404).json({ message: "Utilisateur introuvable" });

  const chatProfile = getChatProfile(exists.pseudo);

  res.json({
    pseudo: exists.pseudo,
    tag: getTagFor(exists.pseudo),
    pfpUrl: chatProfile.pfpUrl,
    birthDate: exists.birthDate || null,
    badges: {
      assigned: chatProfile.badges.assigned,
      selected: chatProfile.badges.selected,
    },
    medals:
      (FileService.data.medals && FileService.data.medals[exists.pseudo]) || [],
    stats: getStatsFor(exists.pseudo),
  });
});

// --- My profile (auth) ---
router.get("/me", (req, res) => {
  const pseudo = req.session && req.session.user && req.session.user.pseudo;
  if (!pseudo) return res.status(401).json({ message: "Non connecté" });

  const exists = dbUsers.findBypseudo(pseudo);
  if (!exists)
    return res.status(404).json({ message: "Utilisateur introuvable" });

  const chatProfile = getChatProfile(exists.pseudo);
  const pfpStatus = getPfpRequestStatus(exists.pseudo);

  res.json({
    pseudo: exists.pseudo,
    tag: getTagFor(exists.pseudo),
    pfpUrl: chatProfile.pfpUrl,
    birthDate: exists.birthDate || null,
    pfpRequest: pfpStatus,
    badges: {
      assigned: chatProfile.badges.assigned,
      selected: chatProfile.badges.selected,
      assignedIds: chatProfile.badges.assignedIds,
      selectedIds: chatProfile.badges.selectedIds,
    },
    medals:
      (FileService.data.medals && FileService.data.medals[exists.pseudo]) || [],
    stats: getStatsFor(exists.pseudo),
  });
});

// --- Select badges (auth) ---
router.post("/badges/select", express.json(), (req, res) => {
  const pseudo = req.session && req.session.user && req.session.user.pseudo;
  if (!pseudo) return res.status(401).json({ message: "Non connecté" });

  const selectedIds = (req.body && req.body.selectedIds) || [];
  if (!Array.isArray(selectedIds)) {
    return res.status(400).json({ message: "selectedIds invalide" });
  }

  const unique = Array.from(
    new Set(selectedIds.map((x) => String(x || "").trim()).filter(Boolean)),
  );
  if (unique.length > 3) {
    return res.status(400).json({ message: "Maximum 3 badges" });
  }

  const badgesData = FileService.data.chatBadges || { catalog: {}, users: {} };
  if (!badgesData.users) badgesData.users = {};

  const bucket = badgesData.users[pseudo] || { assigned: [], selected: [] };
  const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];

  const isAssigned = (id) => assigned.includes(id);
  const finalSelected = unique.filter(isAssigned);

  badgesData.users[pseudo] = {
    assigned,
    selected: finalSelected,
  };

  FileService.save("chatBadges", badgesData);
  res.json({ success: true, selectedIds: finalSelected });
});

// --- Request PFP (auth) ---
router.post("/pfp/request", express.json(), (req, res) => {
  const pseudo = req.session && req.session.user && req.session.user.pseudo;
  if (!pseudo) return res.status(401).json({ message: "Non connecté" });

  const url = String((req.body && req.body.url) || "").trim();
  if (!url || url.length > 500 || !isValidHttpUrl(url)) {
    return res
      .status(400)
      .json({ message: "URL invalide (http/https requis)" });
  }

  if (!Array.isArray(FileService.data.pfpRequests)) {
    FileService.data.pfpRequests = [];
  }

  const now = new Date().toISOString();
  const existingPending = FileService.data.pfpRequests.find(
    (r) => r && r.pseudo === pseudo && r.status === "pending",
  );

  if (existingPending) {
    existingPending.url = url;
    existingPending.updatedAt = now;
  } else {
    FileService.data.pfpRequests.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      pseudo,
      url,
      status: "pending",
      createdAt: now,
    });
  }

  FileService.save("pfpRequests", FileService.data.pfpRequests);
  res.json({ success: true });
});

router.post("/birthdate", express.json(), (req, res) => {
  const pseudo = req.session && req.session.user && req.session.user.pseudo;
  if (!pseudo) return res.status(401).json({ message: "Non connecté" });

  const body = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(body, "birthDate")) {
    return res.status(400).json({ message: "Date manquante" });
  }

  const exists = dbUsers.findBypseudo(pseudo);
  if (!exists)
    return res.status(404).json({ message: "Utilisateur introuvable" });

  const hasBirthDate =
    typeof exists.birthDate === "string" && exists.birthDate.trim();
  if (hasBirthDate) {
    return res.status(403).json({ message: "Date déjà enregistrée" });
  }

  const rawValue = body.birthDate;
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return res.status(400).json({ message: "Date invalide" });
  }

  const parsedDate = parseBirthDateInput(rawValue);
  if (!parsedDate) {
    return res.status(400).json({ message: "Date invalide" });
  }

  const updated = dbUsers.updateUserFields(pseudo, { birthDate: parsedDate });
  if (!updated)
    return res.status(500).json({ message: "Impossible de mettre à jour" });
  res.json({ success: true, birthDate: updated.birthDate || null });
});

module.exports = router;
