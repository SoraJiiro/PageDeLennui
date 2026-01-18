const path = require("path");
const fs = require("fs");
const express = require("express");
const { FileService } = require("../util");
const profileRoutes = require("./profileRoutes");

function setupRoutes(
  app,
  {
    config,
    requireAuth,
    authRoutes,
    createAdminRouter,
    io,
    motusGame,
    leaderboardManager,
    tagRoutes,
    surveyRoutesFactory,
    suggestionRoutes,
  },
) {
  // API
  app.use("/api", authRoutes);
  app.use("/api/admin", createAdminRouter(io, motusGame, leaderboardManager));
  app.use("/api/tag", tagRoutes);
  app.use("/api/surveys", surveyRoutesFactory(io));
  app.use("/api/suggestions", suggestionRoutes);
  app.use("/api/profile", requireAuth, profileRoutes);

  // Badges sidebar (auth)
  app.get("/api/nav/badges", requireAuth, (req, res) => {
    const toIso = (d) =>
      d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    const safeStatMtimeIso = (filePath) => {
      try {
        const stat = fs.statSync(filePath);
        return toIso(stat.mtime);
      } catch (e) {
        return null;
      }
    };
    const maxIsoFromList = (list, field) => {
      if (!Array.isArray(list) || list.length === 0) return null;
      let max = null;
      for (const item of list) {
        const raw = item && item[field];
        if (!raw) continue;
        const ms = Date.parse(raw);
        if (!Number.isFinite(ms)) continue;
        if (max === null || ms > max) max = ms;
      }
      return max === null ? null : new Date(max).toISOString();
    };

    const patchNotesPath = path.join(config.PUBLIC, "patch_notes.html");
    const patchNotesUpdatedAt = safeStatMtimeIso(patchNotesPath);

    const annoncesLatestAt =
      maxIsoFromList(FileService.data.annonces, "at") ||
      safeStatMtimeIso(path.join(config.DATA, "annonces.json"));

    const chatLatestAt =
      maxIsoFromList(FileService.data.historique, "at") ||
      safeStatMtimeIso(path.join(config.DATA, "chat_history.json"));

    res.json({
      patchNotesUpdatedAt,
      annoncesLatestAt,
      chatLatestAt,
    });
  });

  // Historique des annonces (auth)
  app.get("/api/annonces", requireAuth, (req, res) => {
    const limitRaw = req.query && req.query.limit;
    const requested = Number.parseInt(limitRaw, 10);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), 500)
      : 200;

    const annonces = Array.isArray(FileService.data.annonces)
      ? FileService.data.annonces
      : [];

    // renvoyer les plus récentes d'abord
    const out = annonces.slice(-limit).reverse();
    res.json({ annonces: out });
  });

  // Historique chat (auth)
  app.get("/api/chat/history", requireAuth, (req, res) => {
    const limitRaw = req.query && req.query.limit;
    const requested = Number.parseInt(limitRaw, 10);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), 500)
      : 200;

    const history = Array.isArray(FileService.data.historique)
      ? FileService.data.historique
      : [];

    // renvoyer les plus récents d'abord
    const out = history.slice(-limit).reverse();
    res.json({ history: out });
  });

  // Pages (auth)
  app.get("/login", (_, res) =>
    res.sendFile(path.join(config.PUBLIC, "login.html")),
  );
  app.get("/register", (_, res) =>
    res.sendFile(path.join(config.PUBLIC, "register.html")),
  );

  // Admin
  app.get("/admin", requireAuth, (req, res) => {
    if (req.session.user.pseudo !== "Admin") {
      return res.redirect("/");
    }
    res.sendFile(path.join(config.PUBLIC, "index_admin.html"));
  });

  // Page des logs - réservée à l'Admin
  app.get("/admin/logs", requireAuth, (req, res) => {
    if (req.session.user.pseudo !== "Admin") {
      return res.redirect("/");
    }
    res.sendFile(path.join(config.PUBLIC, "logs.html"));
  });

  // Ancienne route -> redirection vers /admin/logs
  app.get("/logs.html", (req, res) => res.redirect("/admin/logs"));

  // Autoriser les ressources statiques pour les pages de connexion/inscription
  app.use("/css", express.static(path.join(config.PUBLIC, "css")));
  app.use("/js", express.static(path.join(config.PUBLIC, "js")));
  app.use("/imgs", express.static(path.join(config.PUBLIC, "imgs")));

  // Le reste du site est protégé
  app.use(requireAuth);
  app.use(express.static(config.PUBLIC));
}

module.exports = { setupRoutes };
