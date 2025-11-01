require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sharedSession = require("express-socket.io-session");
const fs = require("fs");
const path = require("path");

// Imports
const config = require("./config");
const {
  expressSession,
  blacklistMiddleware,
  GameStateManager,
} = require("./util");
const authRoutes = require("./authRoutes");
const requireAuth = require("./requireAuth");
const { initSocketHandlers } = require("./handlers");

// Initialisation
const app = express();
const serveur = http.createServer(app);
const io = new Server(serveur);
const gameState = new GameStateManager();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressSession);
app.use(blacklistMiddleware);

// Partage de session avec Socket.IO
io.use(sharedSession(expressSession, { autoSave: true }));

// Routes
app.use("/api", authRoutes);
app.get("/login", (_, res) =>
  res.sendFile(path.join(config.WEBROOT, "login.html"))
);
app.get("/register", (_, res) =>
  res.sendFile(path.join(config.WEBROOT, "register.html"))
);

// Auth obligatoire ensuite
app.use(requireAuth);
app.use(express.static(config.WEBROOT));

// Socket.IO
io.on("connection", (socket) => initSocketHandlers(io, socket, gameState));

// Auto Reload
console.log("\n[AUTO RELOAD : OK]\n");
let reloadTimer = null;

fs.watch(config.WEBROOT, { recursive: true }, (_, filename) => {
  if (!filename) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log(`\n[!]  Fichier modifié - Public\\${filename}\n`);
    io.emit("reload");
  }, 500);
});

// Démarrage du serveur
serveur.listen(config.PORT, config.HOST, () => {
  console.log(
    `>>> ✅ Serveur en ligne : http://${config.HOST || "localhost"}:${
      config.PORT
    }`
  );
});
