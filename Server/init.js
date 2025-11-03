require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sharedSession = require("express-socket.io-session");
const chokidar = require("chokidar");
const path = require("path");

// ------- Imports -------
const config = require("./config");
const {
  expressSession,
  blacklistMiddleware,
  GameStateManager,
} = require("./util");
const authRoutes = require("./authRoutes");
const requireAuth = require("./requireAuth");
const { initSocketHandlers } = require("./handlers");

// ------- Init -------
const app = express();
const serveur = http.createServer(app);
const io = new Server(serveur);
const gameState = new GameStateManager();

// ------- Middleware -------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressSession);
app.use(blacklistMiddleware);

io.use(sharedSession(expressSession, { autoSave: true }));

// ------- Route -------
app.use("/api", authRoutes);
app.get("/login", (_, res) =>
  res.sendFile(path.join(config.PUBLIC, "login.html"))
);
app.get("/register", (_, res) =>
  res.sendFile(path.join(config.PUBLIC, "register.html"))
);

app.use(requireAuth);
app.use(express.static(config.PUBLIC));

io.on("connection", (socket) => initSocketHandlers(io, socket, gameState));

// ------- Auto Reload -------
let reloadTimer = null;

const watcher = chokidar.watch(config.PUBLIC, {
  ignoreInitial: true,
  ignored: null,
});

watcher.on("all", (_, filePath) => {
  var relativePath = path.relative(config.PUBLIC, filePath);
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    console.log(`\n[!]  Fichier modifié - Public\\${relativePath}\n`);
    io.emit("reload");
  }, 500);
});

console.log("\n[AUTO RELOAD : OK]\n");

// ------- Start Serveur -------
serveur.listen(config.PORT, config.HOST, () => {
  console.log(
    `>> ✅ Serveur en ligne : http://${config.HOST || "localhost"}:${
      config.PORT
    }\n`
  );
});
