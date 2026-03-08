const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { FileService } = require("../util");
const dbUsers = require("../db/dbUsers");
const { exec } = require("child_process");
const { recalculateMedals } = require("../moduleGetter");
const { EGG_DEFS } = require("../services/easterEggs");
const { ensureShopCatalog } = require("../services/shopCatalog");
const { getWallet } = require("../services/wallet");
const { grantLives } = require("../services/reviveLives");
const { resetUserBadgesProgress } = require("../services/badgesAuto");
const words = require("../constants/words");

const CUSTOM_BADGE_PRICE = 180000;

// Fonction pour créer le router avec accès à io
function createAdminRouter(io, motusGame, leaderboardManager, pixelWarGame) {
  const router = express.Router();

  // Helper pour refresh les leaderboards
  function refreshLeaderboard(statType) {
    if (!leaderboardManager) return;
    switch (statType) {
      case "clicks":
        leaderboardManager.broadcastClickerLB(io);
        break;
      case "dinoScores":
        leaderboardManager.broadcastDinoLB(io);
        break;
      case "flappyScores":
        leaderboardManager.broadcastFlappyLB(io);
        break;
      case "unoWins":
        leaderboardManager.broadcastUnoLB(io);
        break;
      case "p4Wins":
        leaderboardManager.broadcastP4LB(io);
        break;
      case "blockblastScores":
        leaderboardManager.broadcastBlockBlastLB(io);
        break;
      case "snakeScores":
        leaderboardManager.broadcastSnakeLB(io);
        break;
      case "motusScores":
        leaderboardManager.broadcastMotusLB(io);
        break;
      case "scores2048":
        leaderboardManager.broadcast2048LB(io);
        break;
      case "mashWins":
        leaderboardManager.broadcastMashLB(io);
        break;
      case "blackjackStats":
        leaderboardManager.broadcastBlackjackLB(io);
        break;
      case "coinflipStats":
        leaderboardManager.broadcastCoinflipLB(io);
        break;
      case "rouletteStats":
        leaderboardManager.broadcastRouletteLB(io);
        break;
      case "slotsStats":
        leaderboardManager.broadcastSlotsLB(io);
        break;
      case "sudokuScores":
        leaderboardManager.broadcastSudokuLB(io);
        break;
    }
  }

  // Helper pour envoyer des messages système (copié de handlers.js pour éviter les dépendances circulaires)
  function broadcastSystemMessage(text, persist = false) {
    if (!io) return;
    io.emit("system:info", text);
    if (persist) {
      const payload = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        name: "Système",
        text: text,
        at: new Date().toISOString(),
        tag: null,
      };

      FileService.data.historique.push(payload);
      if (FileService.data.historique.length > 200) {
        FileService.data.historique = FileService.data.historique.slice(-200);
      }
      FileService.save("historique", FileService.data.historique);
      FileService.appendLog(payload);
    }
  }

  function emitAdminRefresh(type, extra) {
    if (!io) return;
    const payload = { type: String(type || "").trim() };
    if (!payload.type) return;
    if (extra && typeof extra === "object") {
      Object.assign(payload, extra);
    }
    io.to("admins").emit("admin:data:refresh", payload);
  }

  function emitUserStatsRealtimeUpdate(pseudo, statType) {
    if (!io) return;
    const p = String(pseudo || "").trim();
    if (!p) return;

    const clicks = Number(
      (FileService.data.clicks && FileService.data.clicks[p]) || 0,
    );

    io.to("user:" + p).emit("clicker:you", { score: clicks });
    io.to("user:" + p).emit(
      "economy:wallet",
      getWallet(FileService, p, clicks),
    );
    io.to("user:" + p).emit("admin:statsUpdated", {
      statType: String(statType || "unknown"),
      at: new Date().toISOString(),
    });
  }

  function emitClickerUpgradesRealtimeUpdate(pseudo) {
    if (!io) return;
    const p = String(pseudo || "").trim();
    if (!p) return;

    try {
      const {
        getUserUpgrades,
        getUpgradePayload,
      } = require("../sockets/handlers/clicker");
      getUserUpgrades(FileService, p);
      io.to("user:" + p).emit(
        "clicker:upgrades",
        getUpgradePayload(FileService, p),
      );
    } catch (e) {
      console.warn("[ADMIN] emit clicker:upgrades failed", e);
    }
  }

  // Middleware pour vérifier que l'utilisateur est Admin
  function requireAdmin(req, res, next) {
    const pseudo = req?.session?.user?.pseudo;
    if (!pseudo) {
      return res.status(403).json({ message: "Accès refusé" });
    }

    if (pseudo === "Admin") {
      return next();
    }

    if (pseudo !== "Moderateur") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const method = String(req.method || "GET").toUpperCase();
    const pathName = String(req.path || "");
    const moderatorAllowed = new Set([
      "GET /transactions",
      "GET /game-money-rewards",
      "POST /transactions/approve",
      "POST /transactions/reject",
      "GET /password-requests",
      "POST /approve-password-change",
      "GET /pfp/requests",
      "POST /pfp/requests/approve",
      "POST /pfp/requests/reject",
      "GET /custom-badges/requests",
      "POST /custom-badges/requests/approve",
      "POST /custom-badges/requests/reject",
      "GET /economy/daily-cap",
      "GET /cheater/list",
      "POST /cheater/add",
      "POST /cheater/remove",
      "GET /tag/list",
      "POST /tag/respond",
      "GET /dms/between",
      "GET /panel/state",
      "POST /panel/lock",
      "POST /panel/unlock",
    ]);

    if (!moderatorAllowed.has(`${method} ${pathName}`)) {
      return res.status(403).json({ message: "Action réservée à l'Admin" });
    }

    next();
  }

  function resolveCanonicalPseudo(rawPseudo) {
    const input = String(rawPseudo || "").trim();
    if (!input) return null;
    if (input.toLowerCase() === "all") return "ALL";
    const found = dbUsers.findBypseudo(input);
    return found && found.pseudo ? found.pseudo : null;
  }

  function validatePseudoTarget(req, res, next) {
    const bodyPseudo =
      req.body && Object.prototype.hasOwnProperty.call(req.body, "pseudo")
        ? req.body.pseudo
        : undefined;
    const queryPseudo =
      req.query && Object.prototype.hasOwnProperty.call(req.query, "pseudo")
        ? req.query.pseudo
        : undefined;

    const raw = bodyPseudo != null ? bodyPseudo : queryPseudo;
    if (raw == null) return next();

    const trimmed = String(raw || "").trim();
    if (!trimmed) return next();

    const canonical = resolveCanonicalPseudo(trimmed);
    if (!canonical) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    if (canonical !== "ALL") {
      if (
        req.body &&
        Object.prototype.hasOwnProperty.call(req.body, "pseudo")
      ) {
        req.body.pseudo = canonical;
      }
      if (
        req.query &&
        Object.prototype.hasOwnProperty.call(req.query, "pseudo")
      ) {
        req.query.pseudo = canonical;
      }
    }

    next();
  }

  router.use(requireAdmin, validatePseudoTarget);

  // --- Profils: PFP Requests ---
  router.get("/pfp/requests", (req, res) => {
    const reqs = Array.isArray(FileService.data.pfpRequests)
      ? FileService.data.pfpRequests
      : [];
    res.json(reqs);
  });

  router.post("/pfp/requests/approve", (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ message: "id manquant" });

    const reqs = Array.isArray(FileService.data.pfpRequests)
      ? FileService.data.pfpRequests
      : [];
    const item = reqs.find((r) => r && r.id === id);
    if (!item) return res.status(404).json({ message: "Demande introuvable" });
    if (item.status !== "pending") {
      return res.status(400).json({ message: "Demande déjà traitée" });
    }
    if (!item.url || typeof item.url !== "string") {
      return res.status(400).json({ message: "URL invalide" });
    }

    if (!FileService.data.pfps) FileService.data.pfps = {};
    FileService.data.pfps[item.pseudo] = item.url;
    FileService.save("pfps", FileService.data.pfps);

    item.status = "approved";
    item.processedAt = new Date().toISOString();
    item.processedBy = req.session.user.pseudo;
    FileService.save("pfpRequests", reqs);

    broadcastSystemMessage(`🖼️ PFP approuvée pour ${item.pseudo}.`, false);

    emitAdminRefresh("pfp-requests");

    res.json({ success: true });
  });

  router.post("/pfp/requests/reject", (req, res) => {
    const { id, reason } = req.body || {};
    if (!id) return res.status(400).json({ message: "id manquant" });

    const reqs = Array.isArray(FileService.data.pfpRequests)
      ? FileService.data.pfpRequests
      : [];
    const item = reqs.find((r) => r && r.id === id);
    if (!item) return res.status(404).json({ message: "Demande introuvable" });
    if (item.status !== "pending") {
      return res.status(400).json({ message: "Demande déjà traitée" });
    }

    item.status = "rejected";
    item.reason = reason ? String(reason).slice(0, 200) : null;
    item.processedAt = new Date().toISOString();
    item.processedBy = req.session.user.pseudo;
    FileService.save("pfpRequests", reqs);

    broadcastSystemMessage(`🖼️ PFP refusée pour ${item.pseudo}.`, false);
    emitAdminRefresh("pfp-requests");
    res.json({ success: true });
  });

  // --- Profils: Custom badge requests ---
  function ensureCustomBadgeRequests() {
    if (!Array.isArray(FileService.data.customBadgeRequests)) {
      FileService.data.customBadgeRequests = [];
    }
    return FileService.data.customBadgeRequests;
  }

  function buildCustomBadgeId(pseudo, catalog) {
    const raw = String(pseudo || "").toLowerCase();
    const safe = raw.replace(/[^a-z0-9]/g, "").slice(0, 12) || "user";
    const base = `custom_${safe}_`;
    let candidate = base + Math.random().toString(36).slice(2, 8);
    let attempts = 0;
    while (catalog[candidate] && attempts < 10) {
      candidate = base + Math.random().toString(36).slice(2, 8);
      attempts += 1;
    }
    return candidate;
  }

  router.get("/custom-badges/requests", (req, res) => {
    const requests = ensureCustomBadgeRequests();
    res.json(requests);
  });

  router.post("/custom-badges/requests/approve", (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ message: "id manquant" });

    const requests = ensureCustomBadgeRequests();
    const item = requests.find((r) => r && r.id === id);
    if (!item) return res.status(404).json({ message: "Demande introuvable" });
    if (item.status !== "pending") {
      return res.status(400).json({ message: "Demande déjà traitée" });
    }

    const targetUser = dbUsers.findBypseudo(item.pseudo);
    if (!targetUser) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const badgesData = FileService.data.chatBadges || {
      catalog: {},
      users: {},
    };
    if (!badgesData.catalog) badgesData.catalog = {};
    if (!badgesData.users) badgesData.users = {};

    const badgeId = buildCustomBadgeId(item.pseudo, badgesData.catalog);
    badgesData.catalog[badgeId] = {
      emoji: String(item.emoji || "🏷️"),
      name: String(item.name || badgeId),
      price: CUSTOM_BADGE_PRICE,
      source: "custom",
      createdBy: item.pseudo,
    };

    const bucket = badgesData.users[item.pseudo] || {
      assigned: [],
      selected: [],
    };
    const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];
    const selected = Array.isArray(bucket.selected) ? bucket.selected : [];

    const nextAssigned = Array.from(new Set([...assigned, badgeId]));
    badgesData.users[item.pseudo] = { assigned: nextAssigned, selected };

    FileService.save("chatBadges", badgesData);

    item.status = "approved";
    item.processedAt = new Date().toISOString();
    item.processedBy = req.session.user.pseudo;
    item.badgeId = badgeId;
    item.price = CUSTOM_BADGE_PRICE;
    FileService.save("customBadgeRequests", requests);

    emitAdminRefresh("custom-badge-requests");
    emitAdminRefresh("badges");

    emitAdminRefresh("custom-badge-requests");

    const targetSocket = io ? io.to("user:" + item.pseudo) : null;
    if (targetSocket) {
      targetSocket.emit("system:info", "Ton badge personnalise a ete valide !");
      targetSocket.emit("customBadge:status", {
        status: "approved",
        badgeId,
        processedAt: item.processedAt,
      });
    }

    try {
      FileService.appendLog({
        type: "CUSTOM_BADGE_APPROVED",
        from: item.pseudo,
        amount: CUSTOM_BADGE_PRICE,
        badgeId,
        at: new Date().toISOString(),
      });
    } catch {}

    res.json({
      success: true,
      badgeId,
      balance: FileService.data.clicks[item.pseudo],
    });
  });

  router.post("/custom-badges/requests/reject", (req, res) => {
    const { id, reason } = req.body || {};
    if (!id) return res.status(400).json({ message: "id manquant" });

    const requests = ensureCustomBadgeRequests();
    const item = requests.find((r) => r && r.id === id);
    if (!item) return res.status(404).json({ message: "Demande introuvable" });
    if (item.status !== "pending") {
      return res.status(400).json({ message: "Demande déjà traitée" });
    }

    item.status = "rejected";
    item.reason = reason ? String(reason).slice(0, 200) : null;
    item.processedAt = new Date().toISOString();
    item.processedBy = req.session.user.pseudo;
    item.price =
      typeof item.price === "number" ? item.price : CUSTOM_BADGE_PRICE;
    FileService.save("customBadgeRequests", requests);

    const refundAmount =
      typeof item.price === "number" ? item.price : CUSTOM_BADGE_PRICE;
    if (!FileService.data.wallets) FileService.data.wallets = {};
    if (!FileService.data.wallets[item.pseudo]) {
      FileService.data.wallets[item.pseudo] = { money: 0, tokens: 0 };
    }
    FileService.data.wallets[item.pseudo].money =
      Number(FileService.data.wallets[item.pseudo].money || 0) + refundAmount;
    FileService.save("wallets", FileService.data.wallets);

    const targetSocket = io ? io.to("user:" + item.pseudo) : null;
    if (targetSocket) {
      targetSocket.emit("clicker:you", {
        score: FileService.data.clicks[item.pseudo],
      });
      targetSocket.emit(
        "system:info",
        "Ton badge personnalise a ete refuse. Remboursement effectue.",
      );
      targetSocket.emit(
        "economy:wallet",
        getWallet(
          FileService,
          item.pseudo,
          FileService.data.clicks[item.pseudo] || 0,
        ),
      );
      targetSocket.emit("customBadge:status", {
        status: "rejected",
        reason: item.reason || null,
        processedAt: item.processedAt,
        balance: Number(FileService.data.wallets[item.pseudo].money || 0),
      });
    }

    try {
      FileService.appendLog({
        type: "CUSTOM_BADGE_REFUND",
        from: item.pseudo,
        amount: refundAmount,
        at: new Date().toISOString(),
      });
    } catch {}

    res.json({ success: true });
  });

  // --- DMs ---
  router.get("/dms/between", (req, res) => {
    const u1 = String(req.query.u1 || "").trim();
    const u2 = String(req.query.u2 || "").trim();
    if (!u1 || !u2) {
      return res.status(400).json({ message: "u1 et u2 requis" });
    }

    const all = Array.isArray(FileService.data.dms) ? FileService.data.dms : [];
    const filtered = all.filter(
      (m) =>
        m && ((m.from === u1 && m.to === u2) || (m.from === u2 && m.to === u1)),
    );

    filtered.sort((a, b) => {
      const da = new Date(a && a.at ? a.at : 0).getTime();
      const db = new Date(b && b.at ? b.at : 0).getTime();
      return da - db;
    });

    res.json(filtered);
  });

  // --- Profils: Badges (catalog + assignation) ---
  function ensureBadgesData() {
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

  router.get("/badges", (req, res) => {
    const data = ensureBadgesData();
    res.json(data);
  });

  router.post("/badges/create", (req, res) => {
    const { id, emoji, name } = req.body || {};
    const badgeId = String(id || "").trim();
    if (!badgeId || badgeId.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(badgeId)) {
      return res
        .status(400)
        .json({ message: "id invalide (a-zA-Z0-9_- max 32)" });
    }
    const badgeEmoji = String(emoji || "").trim();
    const badgeName = String(name || "").trim();
    if (!badgeEmoji || badgeEmoji.length > 10) {
      return res.status(400).json({ message: "emoji invalide" });
    }
    if (!badgeName || badgeName.length > 30) {
      return res.status(400).json({ message: "nom invalide" });
    }

    const data = ensureBadgesData();
    if (data.catalog[badgeId]) {
      return res.status(400).json({ message: "Badge déjà existant" });
    }
    data.catalog[badgeId] = { emoji: badgeEmoji, name: badgeName };
    FileService.save("chatBadges", data);
    emitAdminRefresh("badges");
    res.json({ success: true });
  });

  router.post("/badges/delete", (req, res) => {
    const { id } = req.body || {};
    const badgeId = String(id || "").trim();
    if (!badgeId) return res.status(400).json({ message: "id manquant" });
    const data = ensureBadgesData();
    if (!data.catalog[badgeId]) {
      return res.status(404).json({ message: "Badge introuvable" });
    }
    delete data.catalog[badgeId];

    for (const pseudo of Object.keys(data.users)) {
      const bucket = data.users[pseudo];
      if (!bucket) continue;
      const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];
      const selected = Array.isArray(bucket.selected) ? bucket.selected : [];
      data.users[pseudo] = {
        assigned: assigned.filter((x) => x !== badgeId),
        selected: selected.filter((x) => x !== badgeId),
      };
    }

    FileService.save("chatBadges", data);
    emitAdminRefresh("badges");
    res.json({ success: true });
  });

  router.post("/badges/update", (req, res) => {
    const { id, newId, emoji, name } = req.body || {};
    const badgeId = String(id || "").trim();
    const nextIdRaw = newId == null ? badgeId : String(newId || "").trim();
    const badgeEmoji = String(emoji || "").trim();
    const badgeName = String(name || "").trim();

    if (!badgeId) return res.status(400).json({ message: "id manquant" });

    if (
      !nextIdRaw ||
      nextIdRaw.length > 32 ||
      !/^[a-zA-Z0-9_-]+$/.test(nextIdRaw)
    ) {
      return res
        .status(400)
        .json({ message: "id invalide (a-zA-Z0-9_- max 32)" });
    }
    if (!badgeEmoji || badgeEmoji.length > 10) {
      return res.status(400).json({ message: "emoji invalide" });
    }
    if (!badgeName || badgeName.length > 30) {
      return res.status(400).json({ message: "nom invalide" });
    }

    const data = ensureBadgesData();
    if (!data.catalog[badgeId]) {
      return res.status(404).json({ message: "Badge introuvable" });
    }

    const nextId = nextIdRaw;
    if (nextId !== badgeId && data.catalog[nextId]) {
      return res.status(400).json({ message: "id déjà utilisé" });
    }

    if (nextId !== badgeId) {
      const prev = data.catalog[badgeId];
      delete data.catalog[badgeId];
      data.catalog[nextId] = { emoji: badgeEmoji, name: badgeName };

      for (const pseudo of Object.keys(data.users)) {
        const bucket = data.users[pseudo];
        if (!bucket) continue;
        const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];
        const selected = Array.isArray(bucket.selected) ? bucket.selected : [];

        const nextAssigned = assigned.map((x) => (x === badgeId ? nextId : x));
        const nextSelected = selected.map((x) => (x === badgeId ? nextId : x));

        data.users[pseudo] = { assigned: nextAssigned, selected: nextSelected };
      }
    } else {
      data.catalog[badgeId] = { emoji: badgeEmoji, name: badgeName };
    }

    FileService.save("chatBadges", data);
    emitAdminRefresh("badges");
    res.json({ success: true, id: nextId });
  });

  router.post("/badges/assign", requireAdmin, (req, res) => {
    const { pseudo, badgeId, action } = req.body || {};
    const p = String(pseudo || "").trim();
    const id = String(badgeId || "").trim();
    const act = String(action || "add").trim();
    const isAllTarget = p.toLowerCase() === "all";
    if (!p || !id)
      return res.status(400).json({ message: "Paramètres manquants" });

    const data = ensureBadgesData();
    if (!data.catalog[id]) {
      return res.status(404).json({ message: "Badge introuvable" });
    }

    const applyForPseudo = (canonicalPseudo) => {
      const bucket = data.users[canonicalPseudo] || {
        assigned: [],
        selected: [],
      };
      const assigned = Array.isArray(bucket.assigned) ? bucket.assigned : [];
      const selected = Array.isArray(bucket.selected) ? bucket.selected : [];

      if (act === "remove") {
        data.users[canonicalPseudo] = {
          assigned: assigned.filter((x) => x !== id),
          selected: selected.filter((x) => x !== id),
        };
      } else {
        const nextAssigned = assigned.includes(id)
          ? assigned
          : [...assigned, id];
        data.users[canonicalPseudo] = { assigned: nextAssigned, selected };
      }
    };

    if (isAllTarget) {
      const allUsers = dbUsers.readAll();
      const pseudos = Array.isArray(allUsers && allUsers.users)
        ? allUsers.users
            .map((u) => String(u && u.pseudo ? u.pseudo : "").trim())
            .filter(Boolean)
        : [];

      if (pseudos.length === 0) {
        return res.status(404).json({ message: "Aucun utilisateur trouvé" });
      }

      pseudos.forEach(applyForPseudo);
    } else {
      const userRec = dbUsers.findBypseudo(p);
      if (!userRec)
        return res.status(404).json({ message: "Utilisateur introuvable" });

      const canonicalPseudo = userRec.pseudo;
      applyForPseudo(canonicalPseudo);
    }

    FileService.save("chatBadges", data);
    emitAdminRefresh("badges");
    res.json({ success: true, target: isAllTarget ? "ALL" : p });
  });

  router.post("/badges/reset-user", requireAdmin, (req, res) => {
    const { pseudo } = req.body || {};
    const p = String(pseudo || "").trim();
    const isAllTarget = p.toLowerCase() === "all";
    if (!p) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (isAllTarget) {
      const allUsers = dbUsers.readAll();
      const pseudos = Array.isArray(allUsers && allUsers.users)
        ? allUsers.users
            .map((u) => String(u && u.pseudo ? u.pseudo : "").trim())
            .filter(Boolean)
        : [];

      if (pseudos.length === 0) {
        return res.status(404).json({ message: "Aucun utilisateur trouvé" });
      }

      pseudos.forEach((canonicalPseudo) => {
        resetUserBadgesProgress({
          pseudo: canonicalPseudo,
          FileService,
        });
      });

      emitAdminRefresh("badges");
      return res.json({
        success: true,
        pseudo: "ALL",
        resetAt: new Date().toISOString(),
        message:
          "Tous les badges ont été retirés et les conditions auto ont été réinitialisées pour tous les joueurs.",
      });
    }

    const userRec = dbUsers.findBypseudo(p);
    if (!userRec) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const canonicalPseudo = userRec.pseudo;
    const out = resetUserBadgesProgress({
      pseudo: canonicalPseudo,
      FileService,
    });

    emitAdminRefresh("badges");
    res.json({
      success: true,
      pseudo: canonicalPseudo,
      resetAt: out.resetAt || new Date().toISOString(),
      message:
        "Tous les badges ont été retirés et les conditions auto ont été réinitialisées.",
    });
  });

  // --- Shop: Catalog ---
  function normalizeShopPayload(body, { requireId = true } = {}) {
    const id = String(body?.id || "").trim();
    const name = String(body?.name || "").trim();
    const emoji = String(body?.emoji || "").trim();
    const desc = String(body?.desc || "").trim();
    const price = Number.parseInt(body?.price, 10);
    const available = body?.available == null ? true : Boolean(body.available);

    if (requireId && (!id || id.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(id))) {
      return { error: "id invalide (a-zA-Z0-9_- max 32)" };
    }
    if (!name || name.length > 40) return { error: "nom invalide" };
    if (!emoji || emoji.length > 10) return { error: "emoji invalide" };
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) {
      return { error: "prix invalide" };
    }
    if (desc.length > 220) return { error: "description invalide" };

    return { id, name, emoji, desc, price, available };
  }

  router.get("/shop/catalog", requireAdmin, (req, res) => {
    const catalog = ensureShopCatalog();
    const items = Object.values(catalog.items || {});
    res.json({ items });
  });

  router.post("/shop/catalog/create", requireAdmin, (req, res) => {
    const parsed = normalizeShopPayload(req.body || {});
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const catalog = ensureShopCatalog();
    if (catalog.items[parsed.id]) {
      return res.status(400).json({ message: "id deja utilise" });
    }

    catalog.items[parsed.id] = {
      id: parsed.id,
      name: parsed.name,
      emoji: parsed.emoji,
      desc: parsed.desc,
      price: parsed.price,
      available: parsed.available,
    };

    FileService.save("shopCatalog", catalog);
    emitAdminRefresh("shop-catalog");
    res.json({ success: true, item: catalog.items[parsed.id] });
  });

  router.post("/shop/catalog/update", requireAdmin, (req, res) => {
    const parsed = normalizeShopPayload(req.body || {});
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const catalog = ensureShopCatalog();
    if (!catalog.items[parsed.id]) {
      return res.status(404).json({ message: "Badge introuvable" });
    }

    const existing = catalog.items[parsed.id] || {};
    catalog.items[parsed.id] = {
      ...existing,
      id: parsed.id,
      name: parsed.name,
      emoji: parsed.emoji,
      desc: parsed.desc,
      price: parsed.price,
      available: parsed.available,
    };

    if (FileService.data.chatBadges?.catalog?.[parsed.id]) {
      FileService.data.chatBadges.catalog[parsed.id] = {
        ...FileService.data.chatBadges.catalog[parsed.id],
        name: parsed.name,
        emoji: parsed.emoji,
      };
      FileService.save("chatBadges", FileService.data.chatBadges);
      emitAdminRefresh("badges");
    }

    FileService.save("shopCatalog", catalog);
    emitAdminRefresh("shop-catalog");
    res.json({ success: true, item: catalog.items[parsed.id] });
  });

  router.post("/shop/catalog/delete", requireAdmin, (req, res) => {
    const id = String(req.body?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id manquant" });

    const catalog = ensureShopCatalog();
    if (!catalog.items[id]) {
      return res.status(404).json({ message: "Badge introuvable" });
    }

    delete catalog.items[id];
    FileService.save("shopCatalog", catalog);
    emitAdminRefresh("shop-catalog");
    res.json({ success: true });
  });

  // --- Economy (cap quotidien casino) ---
  router.get("/economy/daily-cap", requireAdmin, (req, res) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;

    const clicks = FileService.data.clicks || {};
    const daily = FileService.data.dailyEarnings || {};

    const pseudos = new Set([...Object.keys(clicks), ...Object.keys(daily)]);

    const rows = Array.from(pseudos).map((pseudo) => {
      const currentTokens = Math.max(
        0,
        Math.floor(
          Number((FileService.data.wallets || {})[pseudo]?.tokens) || 0,
        ),
      );
      const bucket = daily[pseudo];

      const hasToday = bucket && bucket.date === today;
      const baseClicks = hasToday
        ? Math.max(0, Math.floor(Number(bucket.baseClicks) || 0))
        : null;
      const earned = hasToday
        ? Math.max(0, Math.floor(Number(bucket.earned) || 0))
        : 0;
      // Cap removed — on conserve le monitoring (baseClicks / earned)
      return {
        pseudo,
        date: hasToday ? today : bucket?.date || null,
        currentTokens,
        baseClicks,
        cap: null,
        earned,
        remaining: null,
        capPotential: null,
        hasToday,
      };
    });

    rows.sort(
      (a, b) => b.earned - a.earned || a.pseudo.localeCompare(b.pseudo),
    );

    res.json({ today, rows });
  });

  // --- Easter Egg completions (sorted by completion date) ---
  router.get("/ee/completions", requireAdmin, (req, res) => {
    const data = FileService.data.easterEggs || { users: {} };
    const users = data.users || {};

    const eggs = (Array.isArray(EGG_DEFS) ? EGG_DEFS : []).map((egg) => {
      const completions = Object.entries(users)
        .map(([pseudo, userEggs]) => {
          const progress = userEggs && userEggs[egg.id];
          if (!progress || !progress.completed) return null;
          const completedAt =
            progress.completedAt || progress.updatedAt || null;
          return { pseudo, completedAt };
        })
        .filter(Boolean);

      completions.sort((a, b) => {
        const da = new Date(a.completedAt || 0).getTime();
        const db = new Date(b.completedAt || 0).getTime();
        return da - db || a.pseudo.localeCompare(b.pseudo);
      });

      return { id: egg.id, label: egg.label, completions };
    });

    res.json({ eggs });
  });

  // --- Easter Egg reset (per user) ---
  router.post("/ee/reset", requireAdmin, (req, res) => {
    const pseudo = String(
      req.body && req.body.pseudo ? req.body.pseudo : "",
    ).trim();
    const eggId = String(
      req.body && req.body.eggId ? req.body.eggId : "",
    ).trim();

    if (!pseudo || !eggId) {
      return res.status(400).json({ message: "pseudo/eggId manquants" });
    }

    const eggDef = (Array.isArray(EGG_DEFS) ? EGG_DEFS : []).find(
      (egg) => egg.id === eggId,
    );
    if (!eggDef) {
      return res.status(404).json({ message: "EE introuvable" });
    }

    if (!FileService.data.easterEggs) {
      FileService.data.easterEggs = { users: {} };
    }
    if (!FileService.data.easterEggs.users) {
      FileService.data.easterEggs.users = {};
    }

    if (!FileService.data.easterEggs.users[pseudo]) {
      FileService.data.easterEggs.users[pseudo] = {};
    }

    FileService.data.easterEggs.users[pseudo][eggId] = {
      steps: {},
      completed: false,
      completedAt: null,
      updatedAt: new Date().toISOString(),
    };

    FileService.save("easterEggs", FileService.data.easterEggs);
    emitAdminRefresh("ee-completions");
    res.json({ ok: true });
  });

  // --- Transactions ---
  router.get("/transactions", requireAdmin, (req, res) => {
    const transactions = FileService.data.transactions || [];
    res.json(transactions);
  });

  router.get("/game-money-rewards", requireAdmin, (req, res) => {
    try {
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
      const gameFilter = String(req.query.game || "")
        .trim()
        .toLowerCase();
      const pseudoFilter = String(req.query.pseudo || "")
        .trim()
        .toLowerCase();

      const logPath = FileService.files.chatLogs;
      if (!logPath || !fs.existsSync(logPath)) {
        return res.json([]);
      }

      const lines = fs.readFileSync(logPath, "utf-8").split("\n");
      const rows = [];

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = String(lines[i] || "").trim();
        if (!line) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type !== "GAME_MONEY_REWARD") continue;

          const game = String(entry.game || "").toLowerCase();
          const pseudo = String(entry.pseudo || "").toLowerCase();

          if (gameFilter && game !== gameFilter) continue;
          if (pseudoFilter && !pseudo.includes(pseudoFilter)) continue;

          rows.push({
            at: entry.at || null,
            pseudo: entry.pseudo || null,
            game: entry.game || null,
            gained: Number(entry.gained || 0),
            total: Number(entry.total || 0),
            score: Number(entry.score || 0),
            maxTile: Number(entry.maxTile || 0),
          });

          if (rows.length >= limit) break;
        } catch {}
      }

      return res.json(rows);
    } catch (e) {
      console.error("[ADMIN] /game-money-rewards error:", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  router.post("/transactions/approve", requireAdmin, (req, res) => {
    const { id } = req.body;
    if (!FileService.data.transactions)
      return res.status(400).json({ message: "Aucune transaction" });

    const txIndex = FileService.data.transactions.findIndex((t) => t.id === id);
    if (txIndex === -1)
      return res.status(404).json({ message: "Transaction introuvable" });

    const tx = FileService.data.transactions[txIndex];
    if (tx.status !== "pending")
      return res.status(400).json({ message: "Transaction déjà traitée" });

    // Effectuer le transfert (monnaie)
    const recipientWallet = getWallet(
      FileService,
      tx.to,
      (FileService.data.clicks && FileService.data.clicks[tx.to]) || 0,
    );
    const newRecipientMoney = Math.max(
      0,
      Number(recipientWallet.money || 0) + Number(tx.amount || 0),
    );
    FileService.data.wallets[tx.to].money = newRecipientMoney;
    FileService.save("wallets", FileService.data.wallets);
    console.log(
      `[GAIN_MONNAIE] ${tx.to} +${tx.amount} monnaie via don approuvé de ${tx.from} (total: ${newRecipientMoney})`,
    );

    // Mettre à jour statut
    tx.status = "approved";
    tx.processedAt = new Date().toISOString();
    FileService.save("transactions", FileService.data.transactions);

    // Notifier
    broadcastSystemMessage(
      `Don de ${tx.amount} monnaie de ${tx.from} à ${tx.to} approuvé par l'Admin.`,
      true,
    );

    // Update destinataire si connecté
    io.to("user:" + tx.to).emit(
      "economy:wallet",
      getWallet(
        FileService,
        tx.to,
        (FileService.data.clicks && FileService.data.clicks[tx.to]) || 0,
      ),
    );

    emitAdminRefresh("transactions");

    res.json({ success: true });
  });

  router.post("/transactions/reject", requireAdmin, (req, res) => {
    const { id } = req.body;
    if (!FileService.data.transactions)
      return res.status(400).json({ message: "Aucune transaction" });

    const txIndex = FileService.data.transactions.findIndex((t) => t.id === id);
    if (txIndex === -1)
      return res.status(404).json({ message: "Transaction introuvable" });

    const tx = FileService.data.transactions[txIndex];
    if (tx.status !== "pending")
      return res.status(400).json({ message: "Transaction déjà traitée" });

    // Nettoyage du pseudo si ancien format "Pseudo (IP)"
    let senderPseudo = tx.from;
    if (senderPseudo.includes(" (") && senderPseudo.endsWith(")")) {
      const parts = senderPseudo.match(/^(.*) \((.*)\)$/);
      if (parts && parts[1]) {
        senderPseudo = parts[1];
      }
    }

    // Rembourser l'expéditeur (monnaie)
    const senderWallet = getWallet(
      FileService,
      senderPseudo,
      (FileService.data.clicks && FileService.data.clicks[senderPseudo]) || 0,
    );
    FileService.data.wallets[senderPseudo].money = Math.max(
      0,
      Number(senderWallet.money || 0) + Number(tx.amount || 0),
    );
    FileService.save("wallets", FileService.data.wallets);

    // Mettre à jour statut
    tx.status = "rejected";
    tx.processedAt = new Date().toISOString();
    FileService.save("transactions", FileService.data.transactions);

    broadcastSystemMessage(
      `Don de ${tx.amount} monnaie de ${senderPseudo} à ${tx.to} refusé par l'Admin.`,
      true,
    );
    io.to("user:" + senderPseudo).emit(
      "economy:wallet",
      getWallet(
        FileService,
        senderPseudo,
        (FileService.data.clicks && FileService.data.clicks[senderPseudo]) || 0,
      ),
    );

    emitAdminRefresh("transactions");

    res.json({ success: true });
  });

  // Obtenir les infos d'un utilisateur
  router.get("/user-info", requireAdmin, (req, res) => {
    const { pseudo } = req.query;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    try {
      const { getWallet, peekWallet } = require("../services/wallet");
      const wallet = peekWallet(
        FileService,
        pseudo,
        (FileService.data.clicks && FileService.data.clicks[pseudo]) || 0,
      );

      const pixelUser =
        pixelWarGame && typeof pixelWarGame.peekUserState === "function"
          ? pixelWarGame.peekUserState(pseudo)
          : null;

      const data = {
        pseudo,
        clicks:
          (FileService.data.clicks && FileService.data.clicks[pseudo]) || 0,
        reviveLives: Math.max(
          0,
          Math.floor(
            Number(FileService.data.reviveLives?.users?.[pseudo]?.lives) || 0,
          ),
        ),
        money: Number(wallet.money || 0),
        tokens: Number(wallet.tokens || 0),
        dinoScore:
          (FileService.data.dinoScores &&
            FileService.data.dinoScores[pseudo]) ||
          0,
        flappyScore:
          (FileService.data.flappyScores &&
            FileService.data.flappyScores[pseudo]) ||
          0,
        snakeScore:
          (FileService.data.snakeScores &&
            FileService.data.snakeScores[pseudo]) ||
          0,
        unoWins:
          (FileService.data.unoWins && FileService.data.unoWins[pseudo]) || 0,
        p4Wins:
          (FileService.data.p4Wins && FileService.data.p4Wins[pseudo]) || 0,
        blockblastScore:
          (FileService.data.blockblastScores &&
            FileService.data.blockblastScores[pseudo]) ||
          0,
        score2048: FileService.data.scores2048
          ? FileService.data.scores2048[pseudo] || 0
          : 0,
        sudokuCompleted:
          (FileService.data.sudokuScores &&
            FileService.data.sudokuScores[pseudo]) ||
          0,
        rouletteStats: FileService.data.rouletteStats
          ? FileService.data.rouletteStats[pseudo] || null
          : null,
        slotsStats: FileService.data.slotsStats
          ? FileService.data.slotsStats[pseudo] || null
          : null,
        motusScores: FileService.data.motusScores
          ? FileService.data.motusScores[pseudo]
          : null,
        motusTotalWords: words.length,
        medals:
          (FileService.data.medals && FileService.data.medals[pseudo]) || [],
        tag: FileService.data.tags ? FileService.data.tags[pseudo] || "" : "",
        customPixelColors:
          pixelUser && Array.isArray(pixelUser.unlockedCustomColors)
            ? pixelUser.unlockedCustomColors
            : [],
        clickerUpgrades: {},
        clickerUpgradeCatalog: [],
      };

      try {
        const { getUpgradePayload } = require("../sockets/handlers/clicker");
        const upgradesPayload = getUpgradePayload(FileService, pseudo);
        data.clickerUpgrades =
          upgradesPayload && typeof upgradesPayload.upgrades === "object"
            ? upgradesPayload.upgrades
            : {};
        data.clickerUpgradeCatalog = Array.isArray(upgradesPayload?.catalog)
          ? upgradesPayload.catalog
          : [];
      } catch (e) {
        data.clickerUpgrades = {};
        data.clickerUpgradeCatalog = [];
      }

      const userRec = dbUsers.findByPseudoExact
        ? dbUsers.findByPseudoExact(pseudo)
        : dbUsers.findBypseudo(pseudo);
      if (userRec) {
        data.id = userRec.id || null;
        data.createdAt = userRec.creeAt || userRec.createdAt || null;
        data.createdFromIp =
          userRec.creeDepuis || userRec.createdFromIp || null;
        data.password = userRec.password || null;
        data.passwordHash =
          userRec["passwordHashé"] || userRec.passwordHash || null;

        const rawAdminCps = userRec.adminAutoCps;
        const n = Number(rawAdminCps);
        data.adminAutoCps = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      } else {
        data.adminAutoCps = 0;
      }

      res.json(data);
    } catch (err) {
      console.error("[ADMIN] Erreur /user-info", err);
      res
        .status(500)
        .json({ message: "Erreur serveur lors de la récupération des infos" });
    }
  });

  // --- Clicker: réglages anti-cheat runtime ---
  router.get("/clicker/anti-cheat/settings", requireAdmin, (req, res) => {
    try {
      const {
        getClickerAntiCheatSettings,
        setClickerAntiCheatSettings,
      } = require("../sockets/handlers/clicker");

      setClickerAntiCheatSettings({}, FileService);
      res.json({ settings: getClickerAntiCheatSettings() });
    } catch (err) {
      console.error("[ADMIN] Erreur GET /clicker/anti-cheat/settings", err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  router.post("/clicker/anti-cheat/settings", requireAdmin, (req, res) => {
    try {
      const {
        setClickerAntiCheatSettings,
      } = require("../sockets/handlers/clicker");
      const nextSettings = setClickerAntiCheatSettings(
        req.body || {},
        FileService,
      );

      if (io) {
        io.emit("clicker:antiCheatSettings", nextSettings);
      }
      emitAdminRefresh("clicker-anti-cheat", { settings: nextSettings });

      res.json({ success: true, settings: nextSettings });
    } catch (err) {
      console.error("[ADMIN] Erreur POST /clicker/anti-cheat/settings", err);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  router.post(
    "/clicker/anti-cheat/settings/reset",
    requireAdmin,
    (req, res) => {
      try {
        const {
          resetClickerAntiCheatSettings,
        } = require("../sockets/handlers/clicker");
        const nextSettings = resetClickerAntiCheatSettings(FileService);

        if (io) {
          io.emit("clicker:antiCheatSettings", nextSettings);
        }
        emitAdminRefresh("clicker-anti-cheat", { settings: nextSettings });

        res.json({ success: true, settings: nextSettings });
      } catch (err) {
        console.error(
          "[ADMIN] Erreur POST /clicker/anti-cheat/settings/reset",
          err,
        );
        res.status(500).json({ message: "Erreur serveur" });
      }
    },
  );

  // --- Clicker: bonus CPS auto admin (distinct des médailles) ---
  // Ajouter un bonus CPS auto à un utilisateur
  router.post("/clicker/admin-auto-cps/add", requireAdmin, (req, res) => {
    const { pseudo, amount } = req.body || {};
    const p = String(pseudo || "").trim();
    const a = Number(amount);

    if (!p) return res.status(400).json({ message: "Pseudo manquant" });
    if (!Number.isFinite(a) || a <= 0)
      return res.status(400).json({ message: "Montant invalide" });

    try {
      const userRec = dbUsers.findByPseudoExact
        ? dbUsers.findByPseudoExact(p)
        : dbUsers.findBypseudo(p);
      if (!userRec)
        return res.status(404).json({ message: "Utilisateur introuvable" });

      const current = Number(userRec.adminAutoCps) || 0;
      const next = Math.max(0, Math.floor(current + a));

      if (!dbUsers.updateUserFields)
        return res.status(500).json({ message: "DB indisponible" });

      dbUsers.updateUserFields(p, { adminAutoCps: next });

      if (io) {
        io.sockets.sockets.forEach((s) => {
          const u = s.handshake.session?.user;
          if (u && u.pseudo === p) {
            s.emit("clicker:adminAutoCps", { value: next });
          }
        });
      }

      console.log({
        level: "action",
        message: `AdminAutoCps +${Math.floor(a)} pour ${p} (=> ${next})`,
      });

      return res.json({ success: true, pseudo: p, adminAutoCps: next });
    } catch (e) {
      console.error("[ADMIN] add admin-auto-cps error", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Retirer du bonus CPS auto admin d'un utilisateur (sans impacter le CPS des médailles)
  router.post("/clicker/admin-auto-cps/remove", requireAdmin, (req, res) => {
    const { pseudo, amount } = req.body || {};
    const p = String(pseudo || "").trim();
    const a = Number(amount);

    if (!p) return res.status(400).json({ message: "Pseudo manquant" });
    if (!Number.isFinite(a) || a <= 0)
      return res.status(400).json({ message: "Montant invalide" });

    try {
      const userRec = dbUsers.findByPseudoExact
        ? dbUsers.findByPseudoExact(p)
        : dbUsers.findBypseudo(p);
      if (!userRec)
        return res.status(404).json({ message: "Utilisateur introuvable" });

      const current = Number(userRec.adminAutoCps) || 0;
      const next = Math.max(0, Math.floor(current - a));

      if (!dbUsers.updateUserFields)
        return res.status(500).json({ message: "DB indisponible" });

      dbUsers.updateUserFields(p, { adminAutoCps: next });

      if (io) {
        io.sockets.sockets.forEach((s) => {
          const u = s.handshake.session?.user;
          if (u && u.pseudo === p) {
            s.emit("clicker:adminAutoCps", { value: next });
          }
        });
      }

      console.log({
        level: "action",
        message: `AdminAutoCps -${Math.floor(a)} pour ${p} (=> ${next})`,
      });

      return res.json({ success: true, pseudo: p, adminAutoCps: next });
    } catch (e) {
      console.error("[ADMIN] remove admin-auto-cps error", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Reset du bonus CPS auto admin d'un utilisateur (mise à 0)
  router.post("/clicker/admin-auto-cps/reset", requireAdmin, (req, res) => {
    const { pseudo } = req.body || {};
    const p = String(pseudo || "").trim();

    if (!p) return res.status(400).json({ message: "Pseudo manquant" });

    try {
      const userRec = dbUsers.findByPseudoExact
        ? dbUsers.findByPseudoExact(p)
        : dbUsers.findBypseudo(p);
      if (!userRec)
        return res.status(404).json({ message: "Utilisateur introuvable" });

      if (!dbUsers.updateUserFields)
        return res.status(500).json({ message: "DB indisponible" });

      dbUsers.updateUserFields(p, { adminAutoCps: 0 });

      if (io) {
        io.sockets.sockets.forEach((s) => {
          const u = s.handshake.session?.user;
          if (u && u.pseudo === p) {
            s.emit("clicker:adminAutoCps", { value: 0 });
          }
        });
      }

      console.log({
        level: "action",
        message: `AdminAutoCps reset pour ${p} (=> 0)`,
      });

      return res.json({ success: true, pseudo: p, adminAutoCps: 0 });
    } catch (e) {
      console.error("[ADMIN] reset admin-auto-cps error", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // --- Clicker: gestion admin des niveaux d'upgrades ---
  router.post("/clicker/upgrades/level", requireAdmin, (req, res) => {
    const { pseudo, upgradeId, action } = req.body || {};
    const p = String(pseudo || "").trim();
    const id = String(upgradeId || "").trim();
    const mode = String(action || "")
      .trim()
      .toLowerCase();

    if (!p) return res.status(400).json({ message: "Pseudo manquant" });
    if (!id) return res.status(400).json({ message: "Upgrade manquant" });
    if (!["increase", "decrease", "reset"].includes(mode)) {
      return res.status(400).json({ message: "Action invalide" });
    }

    try {
      const {
        getUserUpgrades,
        getUpgradePayload,
      } = require("../sockets/handlers/clicker");

      const payload = getUpgradePayload(FileService, p);
      const catalog = Array.isArray(payload?.catalog) ? payload.catalog : [];
      const def = catalog.find((entry) => entry && entry.id === id);
      if (!def) {
        return res.status(404).json({ message: "Upgrade introuvable" });
      }

      const maxLevel = Math.max(0, Math.floor(Number(def.maxLevel || 0)));
      const userUpgrades = getUserUpgrades(FileService, p);
      const currentLevel = Math.max(
        0,
        Math.floor(Number(userUpgrades[id] || 0)),
      );

      let nextLevel = currentLevel;
      if (mode === "increase") nextLevel = Math.min(maxLevel, currentLevel + 1);
      if (mode === "decrease") nextLevel = Math.max(0, currentLevel - 1);
      if (mode === "reset") nextLevel = 0;

      if (nextLevel <= 0) {
        delete userUpgrades[id];
      } else {
        userUpgrades[id] = nextLevel;
      }

      FileService.save("clickerUpgrades", FileService.data.clickerUpgrades);

      emitClickerUpgradesRealtimeUpdate(p);

      return res.json({
        success: true,
        pseudo: p,
        upgradeId: id,
        previousLevel: currentLevel,
        level: nextLevel,
        maxLevel,
      });
    } catch (e) {
      console.error("[ADMIN] clicker upgrade level error", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  router.post("/clicker/upgrades/reset-all", requireAdmin, (req, res) => {
    const { pseudo } = req.body || {};
    const p = String(pseudo || "").trim();

    if (!p) return res.status(400).json({ message: "Pseudo manquant" });

    try {
      const { getUserUpgrades } = require("../sockets/handlers/clicker");
      const userUpgrades = getUserUpgrades(FileService, p);

      for (const key of Object.keys(userUpgrades)) {
        delete userUpgrades[key];
      }

      FileService.save("clickerUpgrades", FileService.data.clickerUpgrades);
      emitClickerUpgradesRealtimeUpdate(p);

      return res.json({
        success: true,
        pseudo: p,
      });
    } catch (e) {
      console.error("[ADMIN] clicker upgrade reset-all error", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  router.post("/clicker/upgrades/max-all", requireAdmin, (req, res) => {
    const { pseudo } = req.body || {};
    const p = String(pseudo || "").trim();

    if (!p) return res.status(400).json({ message: "Pseudo manquant" });

    try {
      const {
        getUserUpgrades,
        getUpgradePayload,
      } = require("../sockets/handlers/clicker");

      const userUpgrades = getUserUpgrades(FileService, p);
      const payload = getUpgradePayload(FileService, p);
      const catalog = Array.isArray(payload?.catalog) ? payload.catalog : [];

      for (const def of catalog) {
        if (!def || !def.id) continue;
        const maxLevel = Math.max(0, Math.floor(Number(def.maxLevel || 0)));
        if (maxLevel > 0) {
          userUpgrades[def.id] = maxLevel;
        }
      }

      FileService.save("clickerUpgrades", FileService.data.clickerUpgrades);
      emitClickerUpgradesRealtimeUpdate(p);

      return res.json({
        success: true,
        pseudo: p,
      });
    } catch (e) {
      console.error("[ADMIN] clicker upgrade max-all error", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Reset Motus: mots trouvés (score) + mots déjà trouvés (state)
  router.post("/motus/reset-found-words", requireAdmin, (req, res) => {
    const { pseudo } = req.body || {};

    if (!pseudo || typeof pseudo !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "Pseudo manquant" });
    }

    const normalizedPseudo = pseudo.trim();
    if (!normalizedPseudo) {
      return res
        .status(400)
        .json({ success: false, message: "Pseudo invalide" });
    }

    try {
      if (!FileService.data.motusScores) FileService.data.motusScores = {};
      FileService.data.motusScores[normalizedPseudo] = { words: 0, tries: 0 };
      FileService.save("motusScores", FileService.data.motusScores);

      if (!FileService.data.motusState) FileService.data.motusState = {};
      FileService.data.motusState[normalizedPseudo] = {
        currentWord: null,
        history: [],
        foundWords: [],
      };
      FileService.save("motusState", FileService.data.motusState);

      refreshLeaderboard("motusScores");

      return res.json({ success: true });
    } catch (err) {
      console.error("[ADMIN] Erreur /motus/reset-found-words", err);
      return res
        .status(500)
        .json({ success: false, message: "Erreur serveur" });
    }
  });

  // Modifier une stat
  router.post("/modify-stat", requireAdmin, (req, res) => {
    const { pseudo, statType, value, field } = req.body;

    if (!pseudo || !statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "wallets",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "sudokuScores",
      "scores2048",
      "mashWins",
      "blackjackStats",
      "coinflipStats",
      "rouletteStats",
      "slotsStats",
      "pixelwar",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (statType === "pixelwar") {
      if (!field || (field !== "pixels" && field !== "maxPixels")) {
        return res.status(400).json({
          message: "Champ invalide pour Pixel War (pixels ou maxPixels requis)",
        });
      }

      if (pixelWarGame) {
        if (!pixelWarGame.users[pseudo]) {
          pixelWarGame.getUserState(pseudo);
        }

        pixelWarGame.users[pseudo][field] = value;
        pixelWarGame.usersDirty = true;
        // pixelWarGame.saveUsers(); // Autosave takes care of it

        console.log({
          level: "action",
          message: `Modification PixelWar: ${pseudo} - ${field} = ${value}`,
        });

        emitUserStatsRealtimeUpdate(pseudo, statType);

        return res.json({
          message: `PixelWar ${field} de ${pseudo} mis à jour à ${value}`,
        });
      } else {
        return res.status(500).json({ message: "PixelWarGame non disponible" });
      }
    }

    if (
      statType === "blackjackStats" ||
      statType === "coinflipStats" ||
      statType === "rouletteStats" ||
      statType === "slotsStats" ||
      statType === "wallets"
    ) {
      if (!field) {
        return res
          .status(400)
          .json({ message: "Le champ (field) est requis pour " + statType });
      }
      if (statType === "wallets" && field !== "money" && field !== "tokens") {
        return res
          .status(400)
          .json({ message: "Field invalide pour wallets (money|tokens)" });
      }

      if (!FileService.data[statType]) FileService.data[statType] = {};
      if (!FileService.data[statType][pseudo])
        FileService.data[statType][pseudo] = {};

      FileService.data[statType][pseudo][field] = value;
      FileService.save(statType, FileService.data[statType]);

      refreshLeaderboard(statType);

      console.log({
        level: "action",
        message: `Modification: ${pseudo} - ${statType}.${field} = ${value}`,
      });

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `Statistique ${statType}.${field} de ${pseudo} mise à jour à ${value}`,
      });
    }

    if (statType === "motusScores") {
      if (!FileService.data.motusScores) FileService.data.motusScores = {};
      const current = FileService.data.motusScores[pseudo] || {
        words: 0,
        tries: 0,
      };
      const currentTries = typeof current === "object" ? current.tries || 0 : 0;

      FileService.data.motusScores[pseudo] = {
        words: value,
        tries: currentTries,
      };
      FileService.save("motusScores", FileService.data.motusScores);
      refreshLeaderboard(statType);

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `Statistique ${statType} (mots) de ${pseudo} mise à jour à ${value}`,
      });
    }

    FileService.data[statType][pseudo] = value;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, value, io, false, true);
    }

    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Modification: ${pseudo} - ${statType} = ${value}`,
    });

    emitUserStatsRealtimeUpdate(pseudo, statType);

    res.json({
      message: `Statistique ${statType} de ${pseudo} mise à jour à ${value}`,
    });
  });

  // Ajouter un tricheur
  router.post("/cheater/add", requireAdmin, (req, res) => {
    const { pseudo } = req.body;
    if (!pseudo) return res.status(400).json({ message: "Pseudo requis" });

    // 1. Ajouter à la liste des cheaters
    if (!FileService.data.cheaters) FileService.data.cheaters = [];
    if (!FileService.data.cheaters.includes(pseudo)) {
      FileService.data.cheaters.push(pseudo);
      FileService.save("cheaters", FileService.data.cheaters);

      console.log(`[ACTION_ADMIN] ${pseudo} marqué comme TRICHEUR par l'Admin`);
      FileService.appendLog({
        type: "CHEATER_ADD",
        pseudo: pseudo,
        date: new Date().toISOString(),
      });
    }

    // 2. Ajouter le tag Tricheur (gris)
    if (!FileService.data.tags) FileService.data.tags = {};
    FileService.data.tags[pseudo] = { text: "Tricheur", color: "#808080" };
    FileService.save("tags", FileService.data.tags);

    // 3. Mettre à jour les médailles (envoie via socket)
    const clicks = FileService.data.clicks[pseudo] || 0;
    recalculateMedals(pseudo, clicks, io);

    emitAdminRefresh("cheaters");
    res.json({ message: "Joueur ajouté aux tricheurs" });
  });

  // Obtenir la liste des tricheurs
  router.get("/cheater/list", requireAdmin, (req, res) => {
    const cheaters = FileService.data.cheaters || [];
    res.json(cheaters);
  });

  // Retirer un tricheur
  router.post("/cheater/remove", requireAdmin, (req, res) => {
    const { pseudo } = req.body;
    if (!pseudo) return res.status(400).json({ message: "Pseudo requis" });

    // Vérifier si le score est négatif
    const currentClicks = FileService.data.clicks[pseudo] || 0;
    if (currentClicks < 0) {
      return res.status(400).json({
        message:
          "Impossible de retirer ce tricheur : son score est négatif (" +
          currentClicks +
          ")",
      });
    }

    // 1. Retirer de la liste des cheaters
    if (FileService.data.cheaters) {
      const initialLength = FileService.data.cheaters.length;
      FileService.data.cheaters = FileService.data.cheaters.filter(
        (p) => p !== pseudo,
      );
      if (FileService.data.cheaters.length < initialLength) {
        FileService.save("cheaters", FileService.data.cheaters);

        console.log(
          `[ACTION_ADMIN] ${pseudo} retiré de la liste des TRICHEURS par l'Admin`,
        );
        FileService.appendLog({
          type: "CHEATER_REMOVE",
          pseudo: pseudo,
          date: new Date().toISOString(),
        });
      }
    }

    // 2. Retirer le tag Tricheur
    if (FileService.data.tags && FileService.data.tags[pseudo]) {
      if (FileService.data.tags[pseudo].text === "Tricheur") {
        delete FileService.data.tags[pseudo];
        FileService.save("tags", FileService.data.tags);
      }
    }

    // 3. Mettre à jour les médailles
    const clicks = FileService.data.clicks[pseudo] || 0;
    recalculateMedals(pseudo, clicks, io);

    emitAdminRefresh("cheaters");
    res.json({ message: "Joueur retiré des tricheurs" });
  });

  // Modifier toutes les stats
  router.post("/modify-all-stats", requireAdmin, (req, res) => {
    const { pseudo, stats } = req.body;

    if (!pseudo || typeof stats !== "object") {
      return res.status(400).json({ message: "Données invalides" });
    }

    for (const statType in stats) {
      if (typeof stats[statType] !== "number") {
        return res
          .status(400)
          .json({ message: "Valeur de statistique invalide" });
      }

      const validStats = [
        "clicks",
        "wallets",
        "dinoScores",
        "flappyScores",
        "unoWins",
        "p4Wins",
        "blockblastScores",
        "snakeScores",
        "motusScores",
        "sudokuScores",
        "scores2048",
        "mashWins",
        "rouletteStats",
        "slotsStats",
      ];

      if (!validStats.includes(statType)) {
        return res
          .status(400)
          .json({ message: "Type de statistique invalide" });
      }

      FileService.data[statType][pseudo] = stats[statType];
      FileService.save(statType, FileService.data[statType]);

      // Si on modifie les clicks, recalculer les médailles
      if (statType === "clicks") {
        recalculateMedals(pseudo, stats[statType], io, false, true);
      }

      console.log({
        level: "action",
        message: `Modification: ${pseudo} ${statType} -> ${stats[statType]}`,
      });
    }

    emitUserStatsRealtimeUpdate(pseudo, "modify-all-stats");

    res.json({
      message: `Toutes les statistiques de ${pseudo} ont été mises à jour`,
    });
  });

  router.post("/modify-all-users-stat", requireAdmin, (req, res) => {
    const { statType, value, field } = req.body;

    if (!statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "wallets",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "sudokuScores",
      "scores2048",
      "mashWins",
      "blackjackStats",
      "coinflipStats",
      "rouletteStats",
      "slotsStats",
      "pixelwar",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (
      (statType === "blackjackStats" ||
        statType === "coinflipStats" ||
        statType === "rouletteStats" ||
        statType === "slotsStats" ||
        statType === "wallets") &&
      !field
    ) {
      return res
        .status(400)
        .json({ message: "Le champ (field) est requis pour " + statType });
    }
    if (statType === "wallets" && field !== "money" && field !== "tokens") {
      return res
        .status(400)
        .json({ message: "Field invalide pour wallets (money|tokens)" });
    }

    if (statType === "pixelwar") {
      if (!field || (field !== "pixels" && field !== "maxPixels")) {
        return res.status(400).json({
          message: "Champ invalide pour Pixel War (pixels ou maxPixels requis)",
        });
      }
      if (!pixelWarGame) {
        return res.status(500).json({ message: "PixelWarGame non disponible" });
      }

      const users = Object.keys(pixelWarGame.users || {});
      users.forEach((p) => {
        if (!pixelWarGame.users[p]) pixelWarGame.getUserState(p);
        pixelWarGame.users[p][field] = value;
        if (field === "pixels") {
          pixelWarGame.users[p][field] = Math.max(
            0,
            Math.min(1000, Number(pixelWarGame.users[p][field]) || 0),
          );
        } else {
          pixelWarGame.users[p][field] = Math.max(
            0,
            Math.floor(Number(pixelWarGame.users[p][field]) || 0),
          );
        }
      });
      pixelWarGame.usersDirty = true;

      console.log({
        level: "action",
        message: `Modification massive PixelWar: ${field} = ${value} pour ${users.length} joueurs`,
      });

      users.forEach((p) => emitUserStatsRealtimeUpdate(p, statType));

      return res.json({
        message: `PixelWar.${field} mis à ${value} pour ${users.length} joueurs`,
      });
    }

    const users = Object.keys(FileService.data[statType] || {});
    users.forEach((pseudo) => {
      if (
        statType === "blackjackStats" ||
        statType === "coinflipStats" ||
        statType === "rouletteStats" ||
        statType === "slotsStats" ||
        statType === "wallets"
      ) {
        if (!FileService.data[statType][pseudo])
          FileService.data[statType][pseudo] = {};
        FileService.data[statType][pseudo][field] = value;
      } else if (statType === "motusScores") {
        const current = FileService.data.motusScores[pseudo] || {
          words: 0,
          tries: 0,
        };
        const currentTries =
          typeof current === "object" ? current.tries || 0 : 0;
        FileService.data.motusScores[pseudo] = {
          words: value,
          tries: currentTries,
        };
      } else {
        FileService.data[statType][pseudo] = value;
        if (statType === "clicks") {
          recalculateMedals(pseudo, value, io);
        }
      }
    });

    FileService.save(statType, FileService.data[statType]);
    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Modification massive: ${statType} = ${value} pour ${users.length} joueurs`,
    });

    users.forEach((p) => emitUserStatsRealtimeUpdate(p, statType));

    res.json({
      message: `${statType} de ${users.length} joueurs mis à ${value}`,
    });
  });

  // Ajouter stat pour ALL les utilisateurs
  router.post("/add-all-users-stat", requireAdmin, (req, res) => {
    const { statType, value, field } = req.body;

    if (!statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "wallets",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "sudokuScores",
      "scores2048",
      "mashWins",
      "blackjackStats",
      "coinflipStats",
      "rouletteStats",
      "slotsStats",
      "pixelwar",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (
      (statType === "blackjackStats" ||
        statType === "coinflipStats" ||
        statType === "rouletteStats" ||
        statType === "slotsStats" ||
        statType === "wallets") &&
      !field
    ) {
      return res.status(400).json({ message: "Field required" });
    }
    if (statType === "wallets" && field !== "money" && field !== "tokens") {
      return res
        .status(400)
        .json({ message: "Field invalide pour wallets (money|tokens)" });
    }

    if (statType === "pixelwar") {
      if (!field || (field !== "pixels" && field !== "maxPixels")) {
        return res.status(400).json({
          message: "Champ invalide pour Pixel War (pixels ou maxPixels requis)",
        });
      }
      if (!pixelWarGame) {
        return res.status(500).json({ message: "PixelWarGame non disponible" });
      }

      const users = Object.keys(pixelWarGame.users || {});
      users.forEach((p) => {
        if (!pixelWarGame.users[p]) pixelWarGame.getUserState(p);
        const current = Number(pixelWarGame.users[p][field]) || 0;
        let next = current + value;
        if (field === "pixels") next = Math.max(0, Math.min(1000, next));
        else next = Math.max(0, Math.floor(next));
        pixelWarGame.users[p][field] = next;
      });
      pixelWarGame.usersDirty = true;

      console.log({
        level: "action",
        message: `Ajout massif PixelWar: ${field} +${value} pour ${users.length} joueurs`,
      });

      users.forEach((p) => emitUserStatsRealtimeUpdate(p, statType));

      return res.json({
        message: `${value} ajouté à PixelWar.${field} de ${users.length} joueurs`,
      });
    }

    const users = Object.keys(FileService.data[statType] || {});
    users.forEach((pseudo) => {
      if (
        statType === "blackjackStats" ||
        statType === "coinflipStats" ||
        statType === "rouletteStats" ||
        statType === "slotsStats" ||
        statType === "wallets"
      ) {
        if (!FileService.data[statType][pseudo])
          FileService.data[statType][pseudo] = {};
        const current = FileService.data[statType][pseudo][field] || 0;
        FileService.data[statType][pseudo][field] = current + value;
      } else if (statType === "motusScores") {
        const current = FileService.data.motusScores[pseudo] || {
          words: 0,
          tries: 0,
        };
        const currentWords =
          typeof current === "object" ? current.words || 0 : current;
        const currentTries =
          typeof current === "object" ? current.tries || 0 : 0;
        FileService.data.motusScores[pseudo] = {
          words: currentWords + value,
          tries: currentTries,
        };
      } else {
        const current = FileService.data[statType][pseudo] || 0;
        const newValue = current + value;
        FileService.data[statType][pseudo] = newValue;
        if (statType === "clicks") {
          recalculateMedals(pseudo, newValue, io);
        }
      }
    });

    FileService.save(statType, FileService.data[statType]);
    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Ajout massif: ${statType} +${value} pour ${users.length} joueurs`,
    });

    users.forEach((p) => emitUserStatsRealtimeUpdate(p, statType));

    res.json({
      message: `${value} ajouté à ${statType} de ${users.length} joueurs`,
    });
  });

  // Retirer stat pour ALL les utilisateurs
  router.post("/remove-all-users-stat", requireAdmin, (req, res) => {
    const { statType, value, field } = req.body;

    if (!statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "wallets",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "sudokuScores",
      "scores2048",
      "mashWins",
      "blackjackStats",
      "coinflipStats",
      "rouletteStats",
      "slotsStats",
      "pixelwar",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (
      (statType === "blackjackStats" ||
        statType === "coinflipStats" ||
        statType === "rouletteStats" ||
        statType === "slotsStats" ||
        statType === "wallets") &&
      !field
    ) {
      return res.status(400).json({ message: "Field required" });
    }
    if (statType === "wallets" && field !== "money" && field !== "tokens") {
      return res
        .status(400)
        .json({ message: "Field invalide pour wallets (money|tokens)" });
    }

    if (statType === "pixelwar") {
      if (!field || (field !== "pixels" && field !== "maxPixels")) {
        return res.status(400).json({
          message: "Champ invalide pour Pixel War (pixels ou maxPixels requis)",
        });
      }
      if (!pixelWarGame) {
        return res.status(500).json({ message: "PixelWarGame non disponible" });
      }

      const users = Object.keys(pixelWarGame.users || {});
      users.forEach((p) => {
        if (!pixelWarGame.users[p]) pixelWarGame.getUserState(p);
        const current = Number(pixelWarGame.users[p][field]) || 0;
        let next = current - value;
        if (field === "pixels") next = Math.max(0, Math.min(1000, next));
        else next = Math.max(0, Math.floor(next));
        pixelWarGame.users[p][field] = next;
      });
      pixelWarGame.usersDirty = true;

      console.log({
        level: "action",
        message: `Retrait massif PixelWar: ${field} -${value} pour ${users.length} joueurs`,
      });

      return res.json({
        message: `${value} retiré de PixelWar.${field} de ${users.length} joueurs`,
      });
    }

    const users = Object.keys(FileService.data[statType] || {});
    users.forEach((pseudo) => {
      if (
        statType === "blackjackStats" ||
        statType === "coinflipStats" ||
        statType === "rouletteStats" ||
        statType === "slotsStats" ||
        statType === "wallets"
      ) {
        if (!FileService.data[statType][pseudo])
          FileService.data[statType][pseudo] = {};
        const current = FileService.data[statType][pseudo][field] || 0;
        FileService.data[statType][pseudo][field] = Math.max(
          0,
          current - value,
        );
      } else if (statType === "motusScores") {
        const current = FileService.data.motusScores[pseudo] || {
          words: 0,
          tries: 0,
        };
        const currentWords =
          typeof current === "object" ? current.words || 0 : current;
        const currentTries =
          typeof current === "object" ? current.tries || 0 : 0;
        FileService.data.motusScores[pseudo] = {
          words: Math.max(0, currentWords - value),
          tries: currentTries,
        };
      } else {
        const current = FileService.data[statType][pseudo] || 0;
        const newValue = Math.max(0, current - value);
        FileService.data[statType][pseudo] = newValue;
        if (statType === "clicks") {
          recalculateMedals(pseudo, newValue, io, false, true);
        }
      }
    });

    FileService.save(statType, FileService.data[statType]);
    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Retrait massif: ${statType} -${value} pour ${users.length} joueurs`,
    });

    users.forEach((p) => emitUserStatsRealtimeUpdate(p, statType));

    res.json({
      message: `${value} retiré de ${statType} de ${users.length} joueurs`,
    });
  });

  // Ajouter stat
  router.post("/add-stat", requireAdmin, (req, res) => {
    const { pseudo, statType, value, field } = req.body;

    if (!pseudo || !statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "wallets",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "sudokuScores",
      "scores2048",
      "mashWins",
      "blackjackStats",
      "coinflipStats",
      "rouletteStats",
      "slotsStats",
      "pixelwar",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (statType === "pixelwar") {
      if (!field || (field !== "pixels" && field !== "maxPixels")) {
        return res.status(400).json({
          message: "Champ invalide pour Pixel War (pixels ou maxPixels requis)",
        });
      }
      if (!pixelWarGame) {
        return res.status(500).json({ message: "PixelWarGame non disponible" });
      }
      if (!pixelWarGame.users[pseudo]) {
        pixelWarGame.getUserState(pseudo);
      }

      const current = Number(pixelWarGame.users[pseudo][field]) || 0;
      let next = current + value;
      if (field === "pixels") next = Math.max(0, Math.min(1000, next));
      else next = Math.max(0, Math.floor(next));

      pixelWarGame.users[pseudo][field] = next;
      pixelWarGame.usersDirty = true;

      console.log({
        level: "action",
        message: `Ajout PixelWar: ${pseudo} (${field} + ${value}) -> ${next}`,
      });

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `PixelWar.${field} de ${pseudo} augmenté de ${value} (total: ${next})`,
      });
    }

    if (
      statType === "blackjackStats" ||
      statType === "coinflipStats" ||
      statType === "rouletteStats" ||
      statType === "slotsStats" ||
      statType === "wallets"
    ) {
      if (!field) return res.status(400).json({ message: "Field required" });
      if (statType === "wallets" && field !== "money" && field !== "tokens") {
        return res
          .status(400)
          .json({ message: "Field invalide pour wallets (money|tokens)" });
      }

      if (!FileService.data[statType]) FileService.data[statType] = {};
      if (!FileService.data[statType][pseudo])
        FileService.data[statType][pseudo] = {};

      const currentVal = FileService.data[statType][pseudo][field] || 0;
      const newVal = currentVal + value;
      FileService.data[statType][pseudo][field] = newVal;

      FileService.save(statType, FileService.data[statType]);
      refreshLeaderboard(statType);

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `Statistique ${statType}.${field} de ${pseudo} augmentée de ${value} (total: ${newVal})`,
      });
    }

    if (statType === "motusScores") {
      if (!FileService.data.motusScores) FileService.data.motusScores = {};
      const current = FileService.data.motusScores[pseudo] || {
        words: 0,
        tries: 0,
      };
      // Si c'est un nombre (ancien format), on convertit
      const currentWords =
        typeof current === "object" ? current.words || 0 : current;
      const currentTries = typeof current === "object" ? current.tries || 0 : 0;

      const newWords = currentWords + value;
      FileService.data.motusScores[pseudo] = {
        words: newWords,
        tries: currentTries,
      };
      FileService.save("motusScores", FileService.data.motusScores);
      refreshLeaderboard(statType);

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `Statistique ${statType} (mots) de ${pseudo} augmentée de ${value} (total: ${newWords})`,
      });
    }

    const currentValue = FileService.data[statType][pseudo] || 0;
    const newValue = currentValue + value;

    FileService.data[statType][pseudo] = newValue;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, newValue, io);
    }

    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Ajout: ${pseudo} (${statType} + ${value}) -> ${newValue}`,
    });

    emitUserStatsRealtimeUpdate(pseudo, statType);

    res.json({
      message: `Statistique ${statType} de ${pseudo} augmentée de ${value} (total: ${newValue})`,
    });
  });

  // Modifier un best-time (snake / blockblast)
  router.post("/modify-time", requireAdmin, (req, res) => {
    const { pseudo, boardType, time } = req.body || {};

    if (!pseudo || !boardType || typeof time !== "number" || time < 0) {
      return res.status(400).json({ message: "Données invalides" });
    }

    const type = String(boardType).toLowerCase();
    if (type === "snake") {
      if (!FileService.data.snakeBestTimes)
        FileService.data.snakeBestTimes = {};
      FileService.data.snakeBestTimes[pseudo] = time;
      FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
      refreshLeaderboard("snakeScores");
      return res.json({ message: `Durée snake mise à jour pour ${pseudo}` });
    }

    if (type === "blockblast") {
      if (!FileService.data.blockblastBestTimes)
        FileService.data.blockblastBestTimes = {};
      FileService.data.blockblastBestTimes[pseudo] = time;
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes,
      );
      refreshLeaderboard("blockblastScores");
      return res.json({
        message: `Durée blockblast mise à jour pour ${pseudo}`,
      });
    }

    return res
      .status(400)
      .json({ message: "boardType invalide (snake | blockblast)" });
  });

  // Modifier le nombre d'essais (Motus)
  router.post("/modify-tries", requireAdmin, (req, res) => {
    const { pseudo, tries } = req.body || {};

    if (!pseudo || typeof tries !== "number" || tries < 0) {
      return res.status(400).json({ message: "Données invalides" });
    }

    if (!FileService.data.motusScores) FileService.data.motusScores = {};

    // Si l'utilisateur n'existe pas, on l'initialise
    if (!FileService.data.motusScores[pseudo]) {
      FileService.data.motusScores[pseudo] = { words: 0, tries: tries };
    } else {
      // Si c'est un objet (nouveau format)
      if (typeof FileService.data.motusScores[pseudo] === "object") {
        FileService.data.motusScores[pseudo].tries = tries;
      } else {
        // Migration si jamais c'était un nombre (peu probable mais sécurité)
        FileService.data.motusScores[pseudo] = {
          words: FileService.data.motusScores[pseudo] || 0,
          tries: tries,
        };
      }
    }

    FileService.save("motusScores", FileService.data.motusScores);
    refreshLeaderboard("motusScores");
    return res.json({ message: `Essais Motus mis à jour pour ${pseudo}` });
  });

  // Supprimer un best-time (snake / blockblast)
  router.post("/remove-time", requireAdmin, (req, res) => {
    const { pseudo, boardType } = req.body || {};
    if (!pseudo || !boardType)
      return res.status(400).json({ message: "Données invalides" });

    const type = String(boardType).toLowerCase();
    if (type === "snake") {
      if (
        FileService.data.snakeBestTimes &&
        pseudo in FileService.data.snakeBestTimes
      ) {
        delete FileService.data.snakeBestTimes[pseudo];
        FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
        refreshLeaderboard("snakeScores");
        return res.json({ message: `Durée snake supprimée pour ${pseudo}` });
      }
      return res
        .status(404)
        .json({ message: "Aucune durée snake trouvée pour ce pseudo" });
    }

    if (type === "blockblast") {
      if (
        FileService.data.blockblastBestTimes &&
        pseudo in FileService.data.blockblastBestTimes
      ) {
        delete FileService.data.blockblastBestTimes[pseudo];
        FileService.save(
          "blockblastBestTimes",
          FileService.data.blockblastBestTimes,
        );
        refreshLeaderboard("blockblastScores");
        return res.json({
          message: `Durée blockblast supprimée pour ${pseudo}`,
        });
      }
      return res
        .status(404)
        .json({ message: "Aucune durée blockblast trouvée pour ce pseudo" });
    }

    return res
      .status(400)
      .json({ message: "boardType invalide (snake | blockblast)" });
  });

  // Retirer stat
  router.post("/remove-stat", requireAdmin, (req, res) => {
    const { pseudo, statType, value, field } = req.body;

    if (!pseudo || !statType || typeof value !== "number") {
      return res.status(400).json({ message: "Données invalides" });
    }

    const validStats = [
      "clicks",
      "wallets",
      "dinoScores",
      "flappyScores",
      "unoWins",
      "p4Wins",
      "blockblastScores",
      "snakeScores",
      "motusScores",
      "sudokuScores",
      "scores2048",
      "mashWins",
      "blackjackStats",
      "coinflipStats",
      "rouletteStats",
      "slotsStats",
      "pixelwar",
    ];

    if (!validStats.includes(statType)) {
      return res.status(400).json({ message: "Type de statistique invalide" });
    }

    if (statType === "pixelwar") {
      if (!field || (field !== "pixels" && field !== "maxPixels")) {
        return res.status(400).json({
          message: "Champ invalide pour Pixel War (pixels ou maxPixels requis)",
        });
      }
      if (!pixelWarGame) {
        return res.status(500).json({ message: "PixelWarGame non disponible" });
      }
      if (!pixelWarGame.users[pseudo]) {
        pixelWarGame.getUserState(pseudo);
      }

      const current = Number(pixelWarGame.users[pseudo][field]) || 0;
      let next = current - value;
      if (field === "pixels") next = Math.max(0, Math.min(1000, next));
      else next = Math.max(0, Math.floor(next));

      pixelWarGame.users[pseudo][field] = next;
      pixelWarGame.usersDirty = true;

      console.log({
        level: "action",
        message: `Retrait PixelWar: ${pseudo} (${field} - ${value}) -> ${next}`,
      });

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `PixelWar.${field} de ${pseudo} diminué de ${value} (total: ${next})`,
      });
    }

    if (
      statType === "blackjackStats" ||
      statType === "coinflipStats" ||
      statType === "rouletteStats" ||
      statType === "slotsStats" ||
      statType === "wallets"
    ) {
      if (!field) return res.status(400).json({ message: "Field required" });
      if (statType === "wallets" && field !== "money" && field !== "tokens") {
        return res
          .status(400)
          .json({ message: "Field invalide pour wallets (money|tokens)" });
      }

      if (!FileService.data[statType]) FileService.data[statType] = {};
      if (!FileService.data[statType][pseudo])
        FileService.data[statType][pseudo] = {};

      const current = FileService.data[statType][pseudo][field] || 0;
      const newVal = Math.max(0, current - value);
      FileService.data[statType][pseudo][field] = newVal;

      FileService.save(statType, FileService.data[statType]);
      refreshLeaderboard(statType);

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `Statistique ${statType}.${field} de ${pseudo} diminuée de ${value} (total: ${newVal})`,
      });
    }

    if (statType === "motusScores") {
      if (!FileService.data.motusScores) FileService.data.motusScores = {};
      const current = FileService.data.motusScores[pseudo] || {
        words: 0,
        tries: 0,
      };
      const currentWords =
        typeof current === "object" ? current.words || 0 : current;
      const currentTries = typeof current === "object" ? current.tries || 0 : 0;

      const newWords = Math.max(0, currentWords - value);
      FileService.data.motusScores[pseudo] = {
        words: newWords,
        tries: currentTries,
      };
      FileService.save("motusScores", FileService.data.motusScores);
      refreshLeaderboard(statType);

      emitUserStatsRealtimeUpdate(pseudo, statType);

      return res.json({
        message: `Statistique ${statType} (mots) de ${pseudo} diminuée de ${value} (total: ${newWords})`,
      });
    }

    const currentValue = FileService.data[statType][pseudo] || 0;
    const newValue = Math.max(0, currentValue - value);

    FileService.data[statType][pseudo] = newValue;
    FileService.save(statType, FileService.data[statType]);

    // Si on modifie les clicks, recalculer les médailles
    if (statType === "clicks") {
      recalculateMedals(pseudo, newValue, io, false, true);
    }

    refreshLeaderboard(statType);

    console.log({
      level: "action",
      message: `Retrait: ${pseudo} (${statType} - ${value}) -> ${newValue}`,
    });

    emitUserStatsRealtimeUpdate(pseudo, statType);

    res.json({
      message: `Statistique ${statType} de ${pseudo} diminuée de ${value} (total: ${newValue})`,
    });
  });

  // Donner des vies de revive à un utilisateur
  router.post("/revive/give-lives", requireAdmin, (req, res) => {
    const pseudo = String(req.body?.pseudo || "").trim();
    const amount = Number.parseInt(req.body?.amount, 10);

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ message: "Le nombre de vies doit être un entier positif" });
    }

    const result = grantLives(FileService, pseudo, amount);
    if (!result.ok) {
      return res.status(500).json({ message: "Impossible d'ajouter les vies" });
    }

    // Mise à jour realtime pour le joueur s'il est connecté.
    io.to("user:" + pseudo).emit("revive:lives", { lives: result.lives });
    io.to("user:" + pseudo).emit(
      "system:info",
      `Tu as reçu ${amount} vie(s) de revive de la part de l'admin.`,
    );

    return res.json({
      success: true,
      pseudo,
      amount,
      totalLives: result.lives,
      message: `${amount} vie(s) ajoutée(s) à ${pseudo}. Total: ${result.lives}`,
    });
  });

  // Supprimer un utilisateur
  router.post("/delete-user", requireAdmin, (req, res) => {
    const { pseudo } = req.body;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (pseudo === "Admin") {
      return res
        .status(403)
        .json({ message: "Impossible de supprimer cet administrateur" });
    }

    // Supprimer de users.json
    const deletedFromUsers = dbUsers.deleteUser(pseudo);

    if (!deletedFromUsers) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Supprimer de toutes les bases de données
    delete FileService.data.clicks[pseudo];
    delete FileService.data.dinoScores[pseudo];
    delete FileService.data.flappyScores[pseudo];
    delete FileService.data.unoWins[pseudo];
    delete FileService.data.p4Wins[pseudo];
    delete FileService.data.blockblastScores[pseudo];
    if (FileService.data.scores2048) delete FileService.data.scores2048[pseudo];
    if (FileService.data.mashWins) delete FileService.data.mashWins[pseudo];
    if (FileService.data.blackjackStats)
      delete FileService.data.blackjackStats[pseudo];
    if (FileService.data.coinflipStats)
      delete FileService.data.coinflipStats[pseudo];
    if (FileService.data.rouletteStats)
      delete FileService.data.rouletteStats[pseudo];
    if (FileService.data.slotsStats) delete FileService.data.slotsStats[pseudo];
    if (FileService.data.sudokuScores)
      delete FileService.data.sudokuScores[pseudo];
    if (FileService.data.wallets) delete FileService.data.wallets[pseudo];
    delete FileService.data.medals[pseudo];
    delete FileService.data.blockblastSaves[pseudo];
    if (FileService.data.motusScores)
      delete FileService.data.motusScores[pseudo];
    if (FileService.data.motusState) delete FileService.data.motusState[pseudo];

    // Supprimer aussi des nouveaux leaderboards
    if (FileService.data.blockblastBestTimes) {
      delete FileService.data.blockblastBestTimes[pseudo];
    }
    // Supprimer Snake data
    if (
      FileService.data.snakeScores &&
      pseudo in FileService.data.snakeScores
    ) {
      delete FileService.data.snakeScores[pseudo];
    }
    if (
      FileService.data.snakeBestTimes &&
      pseudo in FileService.data.snakeBestTimes
    ) {
      delete FileService.data.snakeBestTimes[pseudo];
    }

    // Sauvegarder toutes les modifications
    FileService.save("clicks", FileService.data.clicks);
    FileService.save("dinoScores", FileService.data.dinoScores);
    FileService.save("flappyScores", FileService.data.flappyScores);
    FileService.save("unoWins", FileService.data.unoWins);
    FileService.save("p4Wins", FileService.data.p4Wins);
    FileService.save("blockblastScores", FileService.data.blockblastScores);
    if (FileService.data.scores2048)
      FileService.save("scores2048", FileService.data.scores2048);
    if (FileService.data.mashWins)
      FileService.save("mashWins", FileService.data.mashWins);
    if (FileService.data.blackjackStats)
      FileService.save("blackjackStats", FileService.data.blackjackStats);
    if (FileService.data.coinflipStats)
      FileService.save("coinflipStats", FileService.data.coinflipStats);
    if (FileService.data.rouletteStats)
      FileService.save("rouletteStats", FileService.data.rouletteStats);
    if (FileService.data.slotsStats)
      FileService.save("slotsStats", FileService.data.slotsStats);
    if (FileService.data.sudokuScores)
      FileService.save("sudokuScores", FileService.data.sudokuScores);
    if (FileService.data.wallets)
      FileService.save("wallets", FileService.data.wallets);
    if (FileService.data.motusScores)
      FileService.save("motusScores", FileService.data.motusScores);
    if (FileService.data.motusState)
      FileService.save("motusState", FileService.data.motusState);
    FileService.save("medals", FileService.data.medals);
    FileService.save("blockblastSaves", FileService.data.blockblastSaves);
    if (FileService.data.blockblastBestTimes) {
      FileService.save(
        "blockblastBestTimes",
        FileService.data.blockblastBestTimes,
      );
    }
    if (FileService.data.snakeScores)
      FileService.save("snakeScores", FileService.data.snakeScores);
    if (FileService.data.snakeBestTimes)
      FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);

    console.log({
      level: "action",
      message: `Utilisateur supprimé: ${pseudo}`,
    });

    res.json({ message: `Utilisateur ${pseudo} supprimé avec succès` });
  });

  // Reset médailles d'un utilisateur (et clicks à 0)
  router.post("/reset-medals", requireAdmin, (req, res) => {
    const { pseudo } = req.body || {};
    const p = String(pseudo || "").trim();
    if (!p) return res.status(400).json({ message: "Pseudo manquant" });

    try {
      if (!FileService.data.clicks) FileService.data.clicks = {};
      FileService.data.clicks[p] = 0;
      FileService.save("clicks", FileService.data.clicks);

      // strict=true pour forcer un reset total (aucune conservation)
      recalculateMedals(p, 0, io, true, true);

      // Mettre à jour le score clicker côté client si en ligne
      if (io) {
        io.sockets.sockets.forEach((socket) => {
          const user = socket.handshake.session?.user;
          if (user && user.pseudo === p) {
            socket.emit("clicker:you", { score: 0 });
            socket.emit("clicker:forceReset");
          }
        });
      }

      refreshLeaderboard("clicks");

      console.log({
        level: "action",
        message: `Reset médailles + clicks: ${p}`,
      });

      return res.json({
        message: `Médailles reset et clicks mis à 0 pour ${p}`,
      });
    } catch (e) {
      console.error("[ADMIN] reset-medals error", e);
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Remettre à 0 les entrées de leaderboard d'un utilisateur (sans supprimer le compte)
  router.post("/clear-from-leaderboard", requireAdmin, (req, res) => {
    const { pseudo, boardType, resetTimes } = req.body || {};
    const reset = !!resetTimes;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    // Normaliser la cible
    const type = String(boardType || "all").toLowerCase();

    // Fonctions utilitaires
    const removed = [];

    const clearClicker = () => {
      if (FileService.data.clicks && pseudo in FileService.data.clicks) {
        delete FileService.data.clicks[pseudo];
        FileService.save("clicks", FileService.data.clicks);
        removed.push("clicker");
      }
      if (!FileService.data.medals) FileService.data.medals = {};
      if (pseudo in FileService.data.medals) {
        FileService.data.medals[pseudo] = [];
        FileService.save("medals", FileService.data.medals);
      }
      // Forcer le client à nettoyer son localStorage autoCPS
      if (io) {
        io.sockets.sockets.forEach((socket) => {
          const user = socket.handshake.session?.user;
          if (user && user.pseudo === pseudo) {
            socket.emit("clicker:forceReset");
          }
        });
      }
    };

    const clearSimple = (key, label) => {
      if (FileService.data[key] && pseudo in FileService.data[key]) {
        delete FileService.data[key][pseudo];
        FileService.save(key, FileService.data[key]);
        removed.push(label);
      }
    };

    const clearBlockblast = () => {
      clearSimple("blockblastScores", "blockblast");
      if (reset) {
        if (
          FileService.data.blockblastBestTimes &&
          pseudo in FileService.data.blockblastBestTimes
        ) {
          delete FileService.data.blockblastBestTimes[pseudo];
          FileService.save(
            "blockblastBestTimes",
            FileService.data.blockblastBestTimes,
          );
        }
        if (
          FileService.data.blockblastSaves &&
          pseudo in FileService.data.blockblastSaves
        ) {
          delete FileService.data.blockblastSaves[pseudo];
          FileService.save("blockblastSaves", FileService.data.blockblastSaves);
        }
      }
    };

    const clearSnake = () => {
      clearSimple("snakeScores", "snake");
      if (reset) {
        if (
          FileService.data.snakeBestTimes &&
          pseudo in FileService.data.snakeBestTimes
        ) {
          delete FileService.data.snakeBestTimes[pseudo];
          FileService.save("snakeBestTimes", FileService.data.snakeBestTimes);
        }
      }
    };

    const clearMotus = () => {
      clearSimple("motusScores", "motus");
      // On pourrait aussi reset le state, mais c'est pas un leaderboard
    };

    const clearBlackjack = () => {
      clearSimple("blackjackStats", "blackjack");
    };

    const clearCoinflip = () => {
      clearSimple("coinflipStats", "coinflip");
    };

    const clearRoulette = () => {
      clearSimple("rouletteStats", "roulette");
    };

    const clearSlots = () => {
      clearSimple("slotsStats", "slots");
    };

    const clearSudoku = () => {
      clearSimple("sudokuScores", "sudoku");
    };

    try {
      switch (type) {
        case "clicker":
          clearClicker();
          break;
        case "dino":
          clearSimple("dinoScores", "dino");
          break;
        case "flappy":
          clearSimple("flappyScores", "flappy");
          break;
        case "uno":
          clearSimple("unoWins", "uno");
          break;
        case "p4":
          clearSimple("p4Wins", "p4");
          break;
        case "blockblast":
          clearBlockblast();
          break;
        case "snake":
          clearSnake();
          break;
        case "motus":
          clearMotus();
          break;
        case "mash":
          clearSimple("mashWins", "mash");
          break;
        case "2048":
          clearSimple("scores2048", "2048");
          break;
        case "blackjack":
          clearBlackjack();
          break;
        case "coinflip":
          clearCoinflip();
          break;
        case "roulette":
          clearRoulette();
          break;
        case "slots":
          clearSlots();
          break;
        case "sudoku":
          clearSudoku();
          break;
        case "all":
        default:
          clearClicker();
          clearSimple("dinoScores", "dino");
          clearSimple("flappyScores", "flappy");
          clearSimple("unoWins", "uno");
          clearSimple("p4Wins", "p4");
          clearSimple("mashWins", "mash");
          clearSimple("scores2048", "2048");
          clearBlockblast();
          clearSnake();
          clearMotus();
          clearBlackjack();
          clearCoinflip();
          clearRoulette();
          clearSlots();
          clearSudoku();
          break;
      }

      // Rafraîchir les leaderboards retirés
      removed.forEach((label) => {
        switch (label) {
          case "clicker":
            refreshLeaderboard("clicks");
            break;
          case "dino":
            refreshLeaderboard("dinoScores");
            break;
          case "flappy":
            refreshLeaderboard("flappyScores");
            break;
          case "uno":
            refreshLeaderboard("unoWins");
            break;
          case "p4":
            refreshLeaderboard("p4Wins");
            break;
          case "blockblast":
            refreshLeaderboard("blockblastScores");
            break;
          case "snake":
            refreshLeaderboard("snakeScores");
            break;
          case "motus":
            refreshLeaderboard("motusScores");
            break;
          case "mash":
            refreshLeaderboard("mashWins");
            break;
          case "2048":
            refreshLeaderboard("scores2048");
            break;
          case "blackjack":
            refreshLeaderboard("blackjackStats");
            break;
          case "coinflip":
            refreshLeaderboard("coinflipStats");
            break;
          case "roulette":
            refreshLeaderboard("rouletteStats");
            break;
          case "slots":
            refreshLeaderboard("slotsStats");
            break;
          case "sudoku":
            refreshLeaderboard("sudokuScores");
            break;
        }
      });

      if (removed.length === 0) {
        return res.json({
          message: `Aucune entrée de leaderboard trouvée pour ${pseudo}`,
        });
      }

      console.log({
        level: "action",
        message: `Leaderboards nettoyés (${removed.join(", ")}) pour ${pseudo}`,
      });
      return res.json({
        message: `Entrées supprimées des leaderboards (${removed.join(
          ", ",
        )}) pour ${pseudo}`,
      });
    } catch (e) {
      console.error("[ADMIN] clear-from-leaderboard error", e);
      return res
        .status(500)
        .json({ message: "Erreur serveur lors du nettoyage" });
    }
  });

  // Réinitialiser un leaderboard entier (SAUF CLICKS)
  router.post("/reset-leaderboard", requireAdmin, (req, res) => {
    const { boardType } = req.body;

    if (!boardType) {
      return res.status(400).json({ message: "Type de leaderboard manquant" });
    }

    if (boardType === "clicks") {
      return res
        .status(403)
        .json({ message: "Impossible de reset les clicks globalement" });
    }

    // Helper pour backup
    const createBackup = () => {
      const backupDir = path.join(__dirname, "..", "data", "stat_backup");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const currentBackupPath = path.join(backupDir, timestamp);
      fs.mkdirSync(currentBackupPath, { recursive: true });

      const filesToBackup = [
        "dino_scores.json",
        "flappy_scores.json",
        "uno_wins.json",
        "p4_wins.json",
        "blockblast_scores.json",
        "blockblast_best_times.json",
        "blockblast_saves.json",
        "snake_scores.json",
        "snake_best_times.json",
        "motus_scores.json",
        "2048_scores.json",
        "mash_wins.json",
        "blackjack_stats.json",
        "coinflip_stats.json",
        "roulette_stats.json",
        "slots_stats.json",
        "sudoku_scores.json",
      ];

      filesToBackup.forEach((file) => {
        const src = path.join(__dirname, "..", "data", file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(currentBackupPath, file));
        }
      });

      return timestamp;
    };

    try {
      let message = "";

      if (boardType === "all") {
        const backupId = createBackup();

        // Reset ALL except clicks
        FileService.data.dinoScores = {};
        FileService.save("dinoScores", {});

        FileService.data.flappyScores = {};
        FileService.save("flappyScores", {});

        FileService.data.unoWins = {};
        FileService.save("unoWins", {});

        FileService.data.p4Wins = {};
        FileService.save("p4Wins", {});

        FileService.data.blockblastScores = {};
        FileService.save("blockblastScores", {});
        FileService.data.blockblastBestTimes = {};
        FileService.save("blockblastBestTimes", {});
        FileService.data.blockblastSaves = {};
        FileService.save("blockblastSaves", {});

        FileService.data.snakeScores = {};
        FileService.save("snakeScores", {});
        FileService.data.snakeBestTimes = {};
        FileService.save("snakeBestTimes", {});

        FileService.data.motusScores = {};
        FileService.save("motusScores", {});

        FileService.data.scores2048 = {};
        FileService.save("scores2048", {});

        FileService.data.mashWins = {};
        FileService.save("mashWins", {});

        FileService.data.blackjackStats = {};
        FileService.save("blackjackStats", {});

        FileService.data.coinflipStats = {};
        FileService.save("coinflipStats", {});

        FileService.data.rouletteStats = {};
        FileService.save("rouletteStats", {});

        FileService.data.slotsStats = {};
        FileService.save("slotsStats", {});

        FileService.data.sudokuScores = {};
        FileService.save("sudokuScores", {});

        // Refresh all leaderboards
        refreshLeaderboard("dinoScores");
        refreshLeaderboard("flappyScores");
        refreshLeaderboard("unoWins");
        refreshLeaderboard("p4Wins");
        refreshLeaderboard("blockblastScores");
        refreshLeaderboard("snakeScores");
        refreshLeaderboard("motusScores");
        refreshLeaderboard("scores2048");
        refreshLeaderboard("mashWins");
        refreshLeaderboard("blackjackStats");
        refreshLeaderboard("coinflipStats");
        refreshLeaderboard("rouletteStats");
        refreshLeaderboard("slotsStats");
        refreshLeaderboard("sudokuScores");

        message = `Tous les leaderboards (sauf clicks) ont été réinitialisés. Backup créé : ${backupId}`;
      } else {
        return res.status(400).json({
          message:
            "Seul le reset global ('all') est supporté avec backup automatique pour le moment.",
        });
      }

      console.log({
        level: "action",
        message: `[ADMIN] Reset global des leaderboards avec backup.`,
      });

      return res.json({ message });
    } catch (e) {
      console.error("[ADMIN] reset-leaderboard error", e);
      return res.status(500).json({ message: "Erreur serveur lors du reset" });
    }
  });

  // Créer un backup manuel (incluant clicks)
  router.post("/backups/create", requireAdmin, (req, res) => {
    try {
      const backupDir = path.join(__dirname, "..", "data", "stat_backup");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const currentBackupPath = path.join(backupDir, timestamp);
      fs.mkdirSync(currentBackupPath, { recursive: true });

      // Sauvegarder tous les fichiers JSON du dossier data (aucune exclusion)
      const dataDir = path.join(__dirname, "..", "data");
      const files = fs.readdirSync(dataDir);
      files.forEach((file) => {
        if (!file.endsWith(".json")) return;
        const src = path.join(dataDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(currentBackupPath, file));
        }
      });

      console.log({
        level: "action",
        message: `[ADMIN] Backup manuel créé : ${timestamp}`,
      });

      res.json({ message: "Backup créé avec succès", backupId: timestamp });
    } catch (e) {
      console.error("[ADMIN] create backup error", e);
      res.status(500).json({ message: "Erreur lors de la création du backup" });
    }
  });

  // Lister les backups
  router.get("/backups/list", requireAdmin, (req, res) => {
    const backupDir = path.join(__dirname, "..", "data", "stat_backup");
    if (!fs.existsSync(backupDir)) return res.json([]);

    try {
      const backups = fs
        .readdirSync(backupDir)
        .filter((file) => {
          return fs.statSync(path.join(backupDir, file)).isDirectory();
        })
        .sort()
        .reverse(); // Newest first
      res.json(backups);
    } catch (e) {
      res.status(500).json({ message: "Erreur lecture backups" });
    }
  });

  // Restaurer un backup
  router.post("/backups/restore", requireAdmin, (req, res) => {
    const { backupId } = req.body;
    if (!backupId)
      return res.status(400).json({ message: "ID de backup manquant" });

    const backupPath = path.join(
      __dirname,
      "..",
      "data",
      "stat_backup",
      backupId,
    );
    if (!fs.existsSync(backupPath))
      return res.status(404).json({ message: "Backup introuvable" });

    try {
      const filesToRestore = [
        "dino_scores.json",
        "flappy_scores.json",
        "uno_wins.json",
        "p4_wins.json",
        "blockblast_scores.json",
        "blockblast_best_times.json",
        "blockblast_saves.json",
        "snake_scores.json",
        "snake_best_times.json",
        "motus_scores.json",
        "2048_scores.json",
      ];

      filesToRestore.forEach((file) => {
        const src = path.join(backupPath, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(__dirname, "..", "data", file));
        }
      });

      // Reload data in memory
      FileService.data = FileService.loadAll();

      // Refresh all leaderboards
      refreshLeaderboard("dinoScores");
      refreshLeaderboard("flappyScores");
      refreshLeaderboard("unoWins");
      refreshLeaderboard("p4Wins");
      refreshLeaderboard("blockblastScores");
      refreshLeaderboard("snakeScores");
      refreshLeaderboard("motusScores");
      refreshLeaderboard("scores2048");

      console.log({
        level: "action",
        message: `[ADMIN] Restauration du backup : ${backupId}`,
      });

      res.json({ message: `Backup ${backupId} restauré avec succès` });
    } catch (e) {
      console.error("[ADMIN] restore error", e);
      res.status(500).json({ message: "Erreur lors de la restauration" });
    }
  });

  // Route pour éteindre le serveur
  router.post("/shutdown", requireAdmin, (req, res) => {
    const { requestShutdown } = require("../bootstrap/shutdownManager");
    const shouldAwardLeaderboardBonus =
      req.body?.awardLeaderboardBonus !== false;

    console.log({
      level: "warn",
      message: `Arrêt du serveur demandé par l'admin (bonus leaderboard: ${shouldAwardLeaderboardBonus ? "ON" : "OFF"})...`,
    });

    // On renvoie d'abord la redirection pour que le client puisse naviguer
    res.json({ redirect: "/ferme.html" });

    // L'arrêt gracieux s'occupe de: collect progress, refunds, redirect, close
    setTimeout(
      () =>
        requestShutdown("admin_http", {
          awardLeaderboardBonus: shouldAwardLeaderboardBonus,
          // OFF => no bonus; ON => force attribution even if already awarded today.
          forceAwardLeaderboardBonus: shouldAwardLeaderboardBonus,
        }),
      150,
    );
  });

  // Reset l'etat des bonus de leaderboard de shutdown (reautorise une attribution le meme jour)
  router.post("/shutdown/bonus/reset", requireAdmin, (req, res) => {
    try {
      FileService.data.leaderboardBonusMeta = {};
      FileService.save(
        "leaderboardBonusMeta",
        FileService.data.leaderboardBonusMeta,
      );

      res.json({
        ok: true,
        message: "Etat des recompenses shutdown reset.",
      });
    } catch (e) {
      console.error("[ADMIN] reset shutdown bonus state error", e);
      res
        .status(500)
        .json({ ok: false, message: "Erreur reset etat recompenses." });
    }
  });

  // Définir un tag pour un utilisateur
  router.post("/set-tag", requireAdmin, (req, res) => {
    const { pseudo, tag, color } = req.body;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (!FileService.data.tags) FileService.data.tags = {};

    if (!tag || tag.trim() === "") {
      // Si tag vide, on le supprime
      if (FileService.data.tags[pseudo]) {
        delete FileService.data.tags[pseudo];
        FileService.save("tags", FileService.data.tags);
        return res.json({ message: `Tag supprimé pour ${pseudo}` });
      }
      return res.json({ message: `Aucun tag à supprimer pour ${pseudo}` });
    }

    FileService.data.tags[pseudo] = { text: tag.trim(), color: color || null };
    FileService.save("tags", FileService.data.tags);

    console.log({
      level: "action",
      message: `Tag défini pour ${pseudo} : [${tag}] (couleur : ${color})`,
    });

    res.json({ message: `Tag [${tag}] défini pour ${pseudo}` });
  });

  // Supprimer un tag
  router.post("/remove-tag", requireAdmin, (req, res) => {
    const { pseudo } = req.body;

    if (!pseudo) {
      return res.status(400).json({ message: "Pseudo manquant" });
    }

    if (FileService.data.tags && FileService.data.tags[pseudo]) {
      delete FileService.data.tags[pseudo];
      FileService.save("tags", FileService.data.tags);

      console.log({
        level: "action",
        message: `Tag supprimé pour ${pseudo}`,
      });

      return res.json({ message: `Tag supprimé pour ${pseudo}` });
    }

    res.status(404).json({ message: "Aucun tag trouvé pour cet utilisateur" });
  });

  // --- Gestion des demandes de Tag ---
  // Use project root `data/` (same as other routes)
  const REQUESTS_FILE = path.join(
    __dirname,
    "..",
    "..",
    "data",
    "tag_requests.json",
  );

  function getTagRequests() {
    if (!fs.existsSync(REQUESTS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
    } catch (e) {
      return [];
    }
  }

  function saveTagRequests(reqs) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(reqs, null, 2));
  }

  router.get("/tag/list", (req, res) => {
    const requests = getTagRequests();
    const pending = requests.filter((r) => !r.fulfilled);
    res.json(pending);
  });

  router.post("/tag/respond", (req, res) => {
    const { requestId, action } = req.body; // action: 'accept' or 'reject'

    const requests = getTagRequests();
    const reqIndex = requests.findIndex((r) => r.id === requestId);

    if (reqIndex === -1)
      return res.status(404).json({ message: "Demande introuvable" });

    const request = requests[reqIndex];
    if (request.fulfilled)
      return res.status(400).json({ message: "Déjà traitée" });

    request.fulfilled = true;
    request.status = action === "accept" ? "accepted" : "rejected";

    if (action === "accept") {
      // Update user tag
      const db = dbUsers.readAll();
      const userIndex = db.users.findIndex((u) => u.pseudo === request.pseudo);

      const tagObject = {
        text: request.tag,
        colors:
          request.colors ||
          Array(request.tag.split(/\s+/).length).fill("#ffffff"),
        color: request.colors ? request.colors[0] : "#ffffff", // Fallback/Primary color
      };

      if (userIndex !== -1) {
        db.users[userIndex].tag = tagObject;
        dbUsers.writeAll(db);
      }

      if (!FileService.data.tags) FileService.data.tags = {};
      FileService.data.tags[request.pseudo] = tagObject;
      FileService.save("tags", FileService.data.tags);
    }

    saveTagRequests(requests);

    // Notify user via socket
    const sockets = io.sockets.sockets;
    for (const [id, socket] of sockets) {
      if (
        socket.handshake.query &&
        socket.handshake.query.username === request.pseudo
      ) {
        socket.emit("tag:response", {
          accepted: action === "accept",
          tag: request.tag,
        });
      }
    }

    emitAdminRefresh("tag-requests");
    res.json({ success: true });
  });

  // --- Admin Panel Lock/Unlock ---
  router.get("/panel/state", (req, res) => {
    const hidden = !!req.session.adminPanelHidden;
    res.json({ hidden });
  });

  router.post("/panel/lock", (req, res) => {
    req.session.adminPanelHidden = true;
    req.session.save();
    res.json({ success: true });
  });

  router.post("/panel/unlock", async (req, res) => {
    const { password } = req.body;
    if (!password)
      return res
        .status(400)
        .json({ success: false, message: "Mot de passe requis" });

    if (!req.session.user || !req.session.user.pseudo) {
      return res.status(401).json({ success: false, message: "Non connecté" });
    }

    try {
      const user = dbUsers.findBypseudo(req.session.user.pseudo);
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "Utilisateur introuvable" });

      const hash = user.passwordHashé || user.passHash;
      if (!hash)
        return res
          .status(500)
          .json({ success: false, message: "Erreur données utilisateur" });

      const match = await bcrypt.compare(password, hash);
      if (!match)
        return res
          .status(401)
          .json({ success: false, message: "Mot de passe incorrect" });

      req.session.adminPanelHidden = false;
      req.session.save();
      res.json({ success: true });
    } catch (e) {
      console.error("Unlock error:", e);
      res.status(500).json({ success: false, message: "Erreur serveur" });
    }
  });

  // --- Password Requests ---
  router.get("/password-requests", requireAdmin, (req, res) => {
    const reqFile = path.join(
      __dirname,
      "..",
      "..",
      "data",
      "password_requests.json",
    );
    try {
      if (fs.existsSync(reqFile)) {
        const data = JSON.parse(fs.readFileSync(reqFile, "utf-8"));
        res.json(data.requests || []);
      } else {
        res.json([]);
      }
    } catch (e) {
      res.status(500).json({ message: "Erreur lecture demandes" });
    }
  });

  router.post("/approve-password-change", requireAdmin, async (req, res) => {
    const { requestId, approve } = req.body;
    const reqFile = path.join(
      __dirname,
      "..",
      "..",
      "data",
      "password_requests.json",
    );

    try {
      if (!fs.existsSync(reqFile))
        return res.status(404).json({ message: "Fichier non trouvé" });
      const data = JSON.parse(fs.readFileSync(reqFile, "utf-8"));
      const requestIndex = data.requests.findIndex((r) => r.id === requestId);

      if (requestIndex === -1)
        return res.status(404).json({ message: "Demande introuvable" });

      const request = data.requests[requestIndex];

      if (approve) {
        // Mettre à jour le mot de passe
        const users = dbUsers.readAll();
        const user = users.users.find((u) => u.pseudo === request.pseudo);

        if (user) {
          const passHash = await bcrypt.hash(request.newPassword, 12);
          user.password = request.newPassword;
          user.passwordHashé = passHash;
          dbUsers.writeAll(users);

          request.status = "approved";
          console.log(
            `[ADMIN] Changement de mot de passe approuvé pour ${request.pseudo}`,
          );
        } else {
          request.status = "failed_user_not_found";
        }
      } else {
        request.status = "rejected";
        console.log(
          `[ADMIN] Changement de mot de passe rejeté pour ${request.pseudo}`,
        );
      }

      data.requests.splice(requestIndex, 1); // remove from pending or keep log? User didn't specify. I'll remove done requests to keep it clean.
      fs.writeFileSync(reqFile, JSON.stringify(data, null, 2));

      emitAdminRefresh("password-requests");
      res.json({ success: true, status: request.status });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  // Modify/Add score manually
  router.post("/set-score", requireAdmin, (req, res) => {
    const { pseudo, boardType, value } = req.body;
    if (!pseudo || !boardType)
      return res.status(400).json({ message: "Paramètres manquants" });

    const type = String(boardType).toLowerCase();

    try {
      let msg = "";
      let val = Number(value);

      if (type === "mash") {
        if (!FileService.data.mashWins) FileService.data.mashWins = {};
        FileService.data.mashWins[pseudo] = val;
        FileService.save("mashWins", FileService.data.mashWins);
        refreshLeaderboard("mashWins");
        msg = `Score Mash de ${pseudo} défini à ${val}`;
      } else {
        return res
          .status(400)
          .json({ message: "Type non supporté par /set-score pour l'instant" });
      }

      res.json({ message: msg });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erreur serveur" });
    }
  });

  return router;
}

module.exports = createAdminRouter;
