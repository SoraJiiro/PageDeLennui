const express = require("express");
const { FileService } = require("../util");
const dbUsers = require("../db/dbUsers");
const { applyAutoBadges } = require("../services/badgesAuto");
const { getShopItem } = require("../services/shopCatalog");
const { canPurchaseLives, addLives } = require("../services/reviveLives");

const router = express.Router();
const CUSTOM_BADGE_PRICE = 200000;

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
  const pfpUrl =
    FileService && typeof FileService.getPfpUrl === "function"
      ? FileService.getPfpUrl(pseudo)
      : FileService.data.pfps
        ? FileService.data.pfps[pseudo]
        : null;

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
    pfpUrl:
      typeof pfpUrl === "string" && pfpUrl
        ? pfpUrl
        : "/Public/imgs/defaultProfile.png",
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

function ensureCustomBadgeRequests() {
  if (!Array.isArray(FileService.data.customBadgeRequests)) {
    FileService.data.customBadgeRequests = [];
  }
  return FileService.data.customBadgeRequests;
}

function getPendingCustomBadgeRequest(pseudo) {
  const requests = ensureCustomBadgeRequests();
  return requests
    .slice()
    .reverse()
    .find((r) => r && r.pseudo === pseudo && r.status === "pending");
}

function getLastCustomBadgeDecision(pseudo) {
  const requests = ensureCustomBadgeRequests();
  return requests
    .slice()
    .reverse()
    .find(
      (r) =>
        r &&
        r.pseudo === pseudo &&
        (r.status === "approved" || r.status === "rejected"),
    );
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

  try {
    applyAutoBadges({ pseudo: exists.pseudo, FileService });
  } catch {}

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
  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (io) {
    io.to("admins").emit("admin:data:refresh", { type: "pfp-requests" });
  }
  res.json({ success: true });
});

// --- Custom badge requests (auth) ---
router.get("/badges/custom/status", (req, res) => {
  const pseudo = req.session && req.session.user && req.session.user.pseudo;
  if (!pseudo) return res.status(401).json({ message: "Non connecté" });

  const pending = getPendingCustomBadgeRequest(pseudo);
  const lastDecision = getLastCustomBadgeDecision(pseudo);
  if (pending) {
    return res.json({
      hasPending: true,
      request: pending,
      lastDecision: lastDecision || null,
      price: CUSTOM_BADGE_PRICE,
    });
  }
  res.json({
    hasPending: false,
    lastDecision: lastDecision || null,
    price: CUSTOM_BADGE_PRICE,
  });
});

router.post("/badges/custom/request", express.json(), (req, res) => {
  const pseudo = req.session && req.session.user && req.session.user.pseudo;
  if (!pseudo) return res.status(401).json({ message: "Non connecté" });

  const name = String((req.body && req.body.name) || "").trim();
  const emoji = String((req.body && req.body.emoji) || "").trim();

  if (!name || name.length > 32) {
    return res.status(400).json({ message: "Nom invalide (1-32 caractères)" });
  }
  if (!emoji || emoji.length > 10) {
    return res.status(400).json({ message: "Emoji invalide" });
  }

  const requests = ensureCustomBadgeRequests();
  const pending = requests.find(
    (r) => r && r.pseudo === pseudo && r.status === "pending",
  );
  if (pending) {
    return res.status(400).json({ message: "Une demande est déjà en cours" });
  }

  const currentClicks = FileService.data.clicks[pseudo] || 0;
  if (currentClicks < CUSTOM_BADGE_PRICE) {
    return res.status(400).json({
      message: "Pas assez de clicks",
      balance: currentClicks,
    });
  }

  const now = new Date().toISOString();
  const request = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    pseudo,
    name,
    emoji,
    status: "pending",
    createdAt: now,
    price: CUSTOM_BADGE_PRICE,
  };

  requests.push(request);
  FileService.save("customBadgeRequests", requests);

  FileService.data.clicks[pseudo] = currentClicks - CUSTOM_BADGE_PRICE;
  FileService.save("clicks", FileService.data.clicks);

  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (io) {
    io.to("user:" + pseudo).emit("clicker:you", {
      score: FileService.data.clicks[pseudo],
    });
    io.to("admins").emit("admin:data:refresh", {
      type: "custom-badge-requests",
    });
  }

  try {
    FileService.appendLog({
      type: "CUSTOM_BADGE_REQUEST",
      from: pseudo,
      amount: CUSTOM_BADGE_PRICE,
      at: new Date().toISOString(),
    });
  } catch {}

  res.json({
    success: true,
    request,
    price: CUSTOM_BADGE_PRICE,
    balance: FileService.data.clicks[pseudo],
  });
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

// --- Shop: purchase badges (auth) ---
router.post("/shop/purchase", express.json(), (req, res) => {
  const pseudo = req.session && req.session.user && req.session.user.pseudo;
  if (!pseudo) return res.status(401).json({ message: "Non connecté" });

  const rawItems = Array.isArray(req.body && req.body.items)
    ? req.body.items
    : [];
  if (!rawItems.length) {
    return res.status(400).json({ message: "Aucun badge sélectionné" });
  }

  const lineItems = new Map();
  for (const raw of rawItems) {
    const id = String(raw && raw.id ? raw.id : raw).trim();
    if (!id || id.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ message: "Article invalide" });
    }

    let qty = 1;
    if (raw && typeof raw === "object" && raw.id) {
      qty = Math.floor(Number(raw.qty) || 1);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: "Quantite invalide" });
    }

    const item = getShopItem(id);
    if (!item) {
      return res.status(404).json({ message: "Article introuvable" });
    }
    if (!item.available) {
      return res.status(400).json({ message: "Article indisponible" });
    }

    const isRepeatable =
      item.type === "revive_life" || item.type === "pixelwar";
    if (!isRepeatable && qty !== 1) {
      return res.status(400).json({ message: "Quantite invalide" });
    }

    const existing = lineItems.get(id);
    if (existing) {
      if (isRepeatable) {
        existing.qty += qty;
      }
      continue;
    }

    lineItems.set(id, { item, qty });
  }

  const normalized = Array.from(lineItems.values());
  if (!normalized.length) {
    return res.status(400).json({ message: "Aucun article valide" });
  }

  const badgesData = FileService.data.chatBadges || { catalog: {}, users: {} };
  if (!badgesData.catalog) badgesData.catalog = {};
  if (!badgesData.users) badgesData.users = {};

  const bucket = badgesData.users[pseudo] || { assigned: [], selected: [] };
  const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];
  const selected = Array.isArray(bucket.selected) ? bucket.selected : [];
  const owned = new Set(assigned);

  const badgeItems = normalized.filter((entry) => !entry.item.type);
  const lifeItems = normalized.filter(
    (entry) => entry.item.type === "revive_life",
  );
  const pixelItems = normalized.filter(
    (entry) => entry.item.type === "pixelwar",
  );

  const unsupported = normalized.filter(
    (entry) =>
      entry.item.type &&
      entry.item.type !== "revive_life" &&
      entry.item.type !== "pixelwar",
  );
  if (unsupported.length) {
    return res.status(400).json({ message: "Type d'article invalide" });
  }

  for (const entry of lifeItems) {
    const qty = Math.max(0, Math.floor(Number(entry.item.amount) || 0));
    if (!qty) {
      return res.status(400).json({ message: "Quantite de vies invalide" });
    }
  }

  for (const entry of pixelItems) {
    const upgrade = entry.item.upgrade;
    if (
      upgrade !== "storage_10" &&
      upgrade !== "pixel_1" &&
      upgrade !== "pixel_15"
    ) {
      return res.status(400).json({ message: "Upgrade Pixel War invalide" });
    }
  }

  const toBuyBadges = badgeItems.filter((entry) => !owned.has(entry.item.id));

  const livesToBuy = lifeItems.reduce((sum, entry) => {
    const qty = Math.max(0, Math.floor(Number(entry.item.amount) || 0));
    return sum + qty * Math.max(1, entry.qty || 1);
  }, 0);

  if (livesToBuy > 0) {
    const limitCheck = canPurchaseLives(FileService, pseudo, livesToBuy, 3);
    if (!limitCheck.ok) {
      return res.status(400).json({
        message: "Limite journaliere de vies atteinte",
        remaining: limitCheck.remaining,
      });
    }
  }

  const pixelWarGame = req.app?.locals?.pixelWarGame || null;
  if (pixelItems.length && !pixelWarGame) {
    return res.status(500).json({ message: "Pixel War indisponible" });
  }

  if (pixelWarGame && pixelItems.length) {
    const userState = pixelWarGame.getUserState(pseudo);
    const storageQty = pixelItems.reduce((sum, entry) => {
      if (entry.item.upgrade !== "storage_10") return sum;
      return sum + Math.max(1, entry.qty || 1);
    }, 0);
    if (
      storageQty > 0 &&
      userState.maxPixels + storageQty * 10 >
        pixelWarGame.UNIVERSAL_STORAGE_LIMIT
    ) {
      return res.status(400).json({
        message: "Limite de stockage Pixel War atteinte",
      });
    }
  }

  const itemsToCharge = [
    ...toBuyBadges.map((entry) => ({ ...entry, qty: 1 })),
    ...lifeItems,
    ...pixelItems,
  ];
  if (!itemsToCharge.length) {
    return res.status(400).json({ message: "Aucun article valide" });
  }

  const currentClicks = FileService.data.clicks[pseudo] || 0;
  const total = itemsToCharge.reduce((sum, entry) => {
    const price = Number(entry.item.price) || 0;
    const qty = Math.max(1, Math.floor(Number(entry.qty) || 1));
    return sum + price * qty;
  }, 0);
  if (total > currentClicks) {
    return res.status(400).json({
      message: "Pas assez de clicks",
      balance: currentClicks,
    });
  }

  if (toBuyBadges.length) {
    toBuyBadges.forEach((entry) => {
      const item = entry.item;
      badgesData.catalog[item.id] = {
        ...(badgesData.catalog[item.id] || {}),
        emoji: item.emoji,
        name: item.name,
        price: item.price,
        source: "shop",
      };
    });

    const nextAssigned = Array.from(
      new Set([...assigned, ...toBuyBadges.map((entry) => entry.item.id)]),
    );

    badgesData.users[pseudo] = {
      assigned: nextAssigned,
      selected,
    };
    FileService.save("chatBadges", badgesData);
  }

  if (livesToBuy > 0) {
    addLives(FileService, pseudo, livesToBuy, 3);
  }

  if (pixelWarGame && pixelItems.length) {
    const userState = pixelWarGame.getUserState(pseudo);
    pixelItems.forEach((entry) => {
      const qty = Math.max(1, Math.floor(Number(entry.qty) || 1));
      if (entry.item.upgrade === "storage_10") {
        userState.maxPixels = Math.min(
          pixelWarGame.UNIVERSAL_STORAGE_LIMIT,
          Math.max(0, Number(userState.maxPixels) || 0) + qty * 10,
        );
      } else if (entry.item.upgrade === "pixel_1") {
        userState.pixels = Math.max(0, Number(userState.pixels) || 0) + qty;
      } else if (entry.item.upgrade === "pixel_15") {
        userState.pixels =
          Math.max(0, Number(userState.pixels) || 0) + qty * 15;
      }
      if (userState.pixels > pixelWarGame.UNIVERSAL_STORAGE_LIMIT) {
        userState.pixels = pixelWarGame.UNIVERSAL_STORAGE_LIMIT;
      }
    });
    pixelWarGame.usersDirty = true;
    pixelWarGame.saveUsers();
  }

  FileService.data.clicks[pseudo] = currentClicks - total;
  FileService.save("clicks", FileService.data.clicks);

  const io = req.app && req.app.locals ? req.app.locals.io : null;
  if (io) {
    io.to("user:" + pseudo).emit("clicker:you", {
      score: FileService.data.clicks[pseudo],
    });
    io.to("user:" + pseudo).emit("system:info", "Achat confirme.");
  }

  try {
    FileService.appendLog({
      type: "SHOP_PURCHASE",
      from: pseudo,
      amount: total,
      items: itemsToCharge.map((entry) => ({
        id: entry.item.id,
        qty: Math.max(1, Math.floor(Number(entry.qty) || 1)),
      })),
      at: new Date().toISOString(),
    });
  } catch {}

  const nextAssigned = badgesData.users[pseudo]
    ? badgesData.users[pseudo].assigned
    : assigned;

  res.json({
    success: true,
    balance: FileService.data.clicks[pseudo],
    purchasedIds: toBuyBadges.map((entry) => entry.item.id),
    assignedIds: nextAssigned,
  });
});

module.exports = router;
