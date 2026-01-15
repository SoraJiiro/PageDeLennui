const path = require("path");
const express = require("express");

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
  }
) {
  // API
  app.use("/api", authRoutes);
  app.use("/api/admin", createAdminRouter(io, motusGame, leaderboardManager));
  app.use("/api/tag", tagRoutes);
  app.use("/api/surveys", surveyRoutesFactory(io));
  app.use("/api/suggestions", suggestionRoutes);

  // Pages (auth)
  app.get("/login", (_, res) =>
    res.sendFile(path.join(config.PUBLIC, "login.html"))
  );
  app.get("/register", (_, res) =>
    res.sendFile(path.join(config.PUBLIC, "register.html"))
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
