require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sharedSession = require("express-socket.io-session");
const chokidar = require("chokidar");
const path = require("path");
const exec = require("child_process").execSync;

// ------- Imports -------
const config = require("./config");
const {
  expressSession,
  blacklistMiddleware,
  GameStateManager,
} = require("./util");
const authRoutes = require("./authRoutes");
const requireAuth = require("./requireAuth");
const createAdminRouter = require("./adminRoutes");
const { initSocketHandlers } = require("./handlers");
const { checkReconnect } = require("./reconnectHandler");
const fileLogger = require("./logger");

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
app.use("/api/admin", createAdminRouter(io));
app.use("/api/tag", require("./tagRoutes"));
app.get("/login", (_, res) =>
  res.sendFile(path.join(config.PUBLIC, "login.html"))
);
app.get("/register", (_, res) =>
  res.sendFile(path.join(config.PUBLIC, "register.html"))
);
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

app.use(requireAuth);
app.use(express.static(config.PUBLIC));

io.on("connection", (socket) => {
  checkReconnect(io, socket);
  initSocketHandlers(io, socket, gameState);
});

// --- Diffusion des logs serveur vers les admins ---
// Patch léger de console pour ré-émettre les logs côté clients admin
const util = require("util");
function stripAnsi(input) {
  try {
    return String(input).replace(/\x1b\[[0-9;]*m/gu, "");
  } catch {
    return String(input);
  }
}
(() => {
  const levels = ["log", "warn", "error"];
  // Buffer circulaire des derniers logs pour affichage à l'ouverture de la page Admin
  if (!io._serverLogBuffer) io._serverLogBuffer = [];
  const MAX_LOGS = 500;
  levels.forEach((lvl) => {
    const original = console[lvl].bind(console);
    console[lvl] = (...args) => {
      // Détecter si le premier arg est un objet avec { level, message }
      let logLevel = lvl;
      let logMessage = "";
      let displayInConsole = true;

      if (
        args.length === 1 &&
        typeof args[0] === "object" &&
        args[0] !== null &&
        "level" in args[0] &&
        "message" in args[0]
      ) {
        // Format { level: 'action', message: '...' }
        logLevel = args[0].level;
        logMessage = String(args[0].message);
        displayInConsole = false; // On affichera proprement après
      } else {
        // Format classique console.log('...')
        const formatted = util.format(
          ...args.map((a) =>
            typeof a === "string" ? a : util.inspect(a, { colors: false })
          )
        );
        logMessage = stripAnsi(formatted);
      }

      // Afficher dans la console serveur
      if (displayInConsole) {
        original(...args);
      } else {
        // Pour les actions, afficher le message proprement
        original(logMessage);
      }

      try {
        const payload = {
          level: logLevel,
          message: logMessage,
          at: new Date().toISOString(),
        };
        // Enregistrer en mémoire
        io._serverLogBuffer.push(payload);
        if (io._serverLogBuffer.length > MAX_LOGS) {
          io._serverLogBuffer.splice(0, io._serverLogBuffer.length - MAX_LOGS);
        }
        // Diffuser aux admins connectés
        io.to("admins").emit("server:log", payload);

        // Écrire dans le fichier de log
        fileLogger.write(logLevel, logMessage);
      } catch (_) {
        // en cas d'erreur dans l'émission, ne pas bloquer les logs
      }
    };
  });
})();

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
    console.log({
      level: "action",
      message: `[!] Fichier modifié - Public\\${relativePath}`,
    });
    io.emit("reload", { file: relativePath });
  }, 500);
});

console.log("\n[AUTO RELOAD : OK]\n");

// ------- Gestion propre de l'arrêt (CTRL+C) -------
process.on("SIGINT", () => {
  console.log("\n\n>> Arrêt du serveur...");
  process.exit(0);
});

// ------- Start Serveur -------
config.loadBlacklist("S");

serveur.listen(config.PORT, config.HOST, () => {
  console.log(
    `>> ✅ Serveur en ligne : http://${config.HOST || "localhost"}:${
      config.PORT
    }\n`
  );
});
