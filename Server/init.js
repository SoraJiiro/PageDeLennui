const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");

// ------- Imports (legacy modules, paths preserved) -------
const config = require("./config");
const { GameStateManager } = require("./util");
const {
  expressSession,
  blacklistMiddleware,
  requireAuth,
} = require("./middlewareGetter");
const {
  setupRoutes,
  authRoutes,
  createAdminRouter,
  tagRoutes,
  surveyRoutesFactory,
  suggestionRoutes,
} = require("./routeGetter");
const {
  initSocketHandlers,
  motusGame,
  leaderboardManager,
} = require("./handlers");
const { checkReconnect } = require("./reconnectHandler");
const fileLogger = require("./logger");

// ------- Imports (new bootstrap modules) -------
const { createHttpServer } = require("./bootstrap/createHttpServer");
const { createIo } = require("./bootstrap/createIo");
const { setupMiddleware } = require("./bootstrap/setupMiddleware");
const { setupSockets } = require("./sockets/setupSockets");
const { setupAdminLogBridge } = require("./logging/setupAdminLogBridge");
const { setupAutoReload } = require("./bootstrap/setupAutoReload");
const { setupShutdown } = require("./bootstrap/setupShutdown");

// ------- Init -------
const app = express();
const server = createHttpServer(app);
const io = createIo(server);
const gameState = new GameStateManager();

// ------- Middleware -------
setupMiddleware(app, io, { expressSession, blacklistMiddleware });

// ------- Routes -------
setupRoutes(app, {
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
});

// ------- Sockets -------
setupSockets(io, { checkReconnect, initSocketHandlers, gameState });

// --- Diffusion des logs serveur vers les admins ---
setupAdminLogBridge(io, fileLogger);

// ------- Auto Reload -------
setupAutoReload(io, config);

// ------- Gestion propre de l'arrêt (CTRL+C) -------
setupShutdown();

// ------- Start Serveur -------
config.loadBlacklist("S");

server.listen(config.PORT, config.HOST, () => {
  console.log(
    `>> ✅ Serveur en ligne : http://${config.HOST || "localhost"}:${
      config.PORT
    }\n`
  );
});
