const { exec } = require("child_process");

function registerAdminHandlers({
  io,
  socket,
  pseudo,
  FileService,
  config,
  getIpFromSocket,
  broadcastSystemMessage,
  leaderboardManager,
  gameState,
}) {
  // ------- Admin Events -------
  // Admin: blacklist management via socket (Admin only)
  socket.on("admin:blacklist:get", () => {
    if (pseudo !== "Admin") return;
    try {
      // Return the runtime blacklist and the forced list. Do not expose or rely on file writes here.
      const data = {
        alwaysBlocked: Array.isArray(config.BLACKLIST)
          ? config.BLACKLIST.slice()
          : [],
      };
      const forced = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      socket.emit("admin:blacklist:result", { success: true, data, forced });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur lecture blacklist",
      });
    }
  });

  socket.on("admin:blacklist:add", ({ ip }) => {
    if (pseudo !== "Admin") return;
    if (!ip)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "IP manquante",
      });
    try {
      // Do not persist admin-added IPs to disk. Keep them runtime-only in config.BLACKLIST.
      if (!Array.isArray(config.BLACKLIST)) config.BLACKLIST = [];
      if (!config.BLACKLIST.includes(ip)) config.BLACKLIST.push(ip);
      const data = { alwaysBlocked: config.BLACKLIST.slice() };

      // disconnect any currently connected sockets from that IP
      try {
        io.sockets.sockets.forEach((s) => {
          try {
            const sIp = getIpFromSocket(s);
            if (sIp === ip) {
              try {
                s.emit("system:notification", {
                  message: "🚫 Votre IP a été bannie",
                  duration: 8000,
                });
              } catch (e) {}
              try {
                setTimeout(() => s.disconnect(true), 2500);
              } catch (e) {}
            }
          } catch (e) {}
        });
      } catch (e) {}

      // notify all admins of updated runtime list
      io.to("admins").emit("admin:blacklist:updated", data.alwaysBlocked);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur ajout blacklist",
      });
    }
  });

  socket.on("admin:blacklist:remove", ({ ip }) => {
    if (pseudo !== "Admin") return;
    if (!ip)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "IP manquante",
      });
    try {
      // Prevent removing forced IPs
      const forcedList = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      if (forcedList.includes(ip)) {
        return socket.emit("admin:blacklist:result", {
          success: false,
          message: "Impossible de retirer une IP forcée",
        });
      }

      // Remove from runtime-only blacklist (do not touch blacklist.json)
      if (!Array.isArray(config.BLACKLIST)) config.BLACKLIST = [];
      config.BLACKLIST = config.BLACKLIST.filter((v) => v !== ip);
      const data = { alwaysBlocked: config.BLACKLIST.slice() };

      // notify admins
      io.to("admins").emit("admin:blacklist:updated", data.alwaysBlocked);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur suppression blacklist",
      });
    }
  });

  socket.on("admin:blacklist:set", ({ alwaysBlocked }) => {
    if (pseudo !== "Admin") return;
    try {
      // Replace the runtime blacklist only. Forced IPs are merged but we DO NOT persist admin changes to disk.
      const forcedList = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      const provided = Array.isArray(alwaysBlocked) ? alwaysBlocked : [];
      const merged = Array.from(new Set([...forcedList, ...provided]));
      const data = { alwaysBlocked: merged };
      config.BLACKLIST = data.alwaysBlocked.slice();

      // disconnect any currently connected sockets that are now blacklisted
      try {
        io.sockets.sockets.forEach((s) => {
          try {
            const sIp = getIpFromSocket(s);
            if (config.BLACKLIST.includes(sIp)) {
              try {
                s.emit("system:notification", {
                  message: "🚫 Votre IP a été bannie",
                  duration: 8000,
                });
              } catch (e) {}
              try {
                s.disconnect(true);
              } catch (e) {}
            }
          } catch (e) {}
        });
      } catch (e) {}

      io.to("admins").emit("admin:blacklist:updated", data.alwaysBlocked);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur écriture blacklist",
      });
    }
  });

  socket.on("admin:refresh", () => {
    if (pseudo !== "Admin") return;
    leaderboardManager.broadcastClickerLB(io);
    leaderboardManager.broadcastDinoLB(io);
    leaderboardManager.broadcastFlappyLB(io);
    leaderboardManager.broadcastUnoLB(io);
    leaderboardManager.broadcastP4LB(io);
    leaderboardManager.broadcastBlockBlastLB(io);
    leaderboardManager.broadcastSnakeLB(io);
  });

  socket.on("admin:chat:clear", () => {
    if (pseudo !== "Admin") return;
    FileService.data.historique = [];
    FileService.save("historique", FileService.data.historique);
    io.emit("chat:history", []);
    broadcastSystemMessage(
      io,
      "🔙 L'historique du chat a été effacé par l'Admin.",
      true
    );
  });

  socket.on("admin:global-notification", ({ message, withCountdown }) => {
    if (pseudo !== "Admin" || !message) return;

    const duration = 8000;
    const notificationText = `📢 [ADMIN] ${message}`;
    io.emit("system:notification", {
      message: notificationText,
      duration: duration,
      withCountdown: withCountdown || false,
    });

    try {
      if (!Array.isArray(FileService.data.annonces))
        FileService.data.annonces = [];
      FileService.data.annonces.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        at: new Date().toISOString(),
        author: pseudo,
        message: notificationText,
        rawMessage: message,
        withCountdown: !!withCountdown,
        duration,
      });
      if (FileService.data.annonces.length > 200) {
        FileService.data.annonces = FileService.data.annonces.slice(-200);
      }
      FileService.save("annonces", FileService.data.annonces);
    } catch (e) {
      // ne pas bloquer l'envoi si la sauvegarde échoue
    }

    console.log({
      level: "action",
      message: `Notification globale envoyée: ${message} -- withCountdown?: ${withCountdown}`,
    });

    if (withCountdown) {
      setTimeout(() => {
        io.emit("system:redirect", "/ferme.html");

        // On éteint le serveur peu après pour laisser le temps de charger la page
        setTimeout(() => {
          console.log({
            level: "warn",
            message: "Arrêt du serveur suite au countdown...",
          });
          if (process.platform === "win32") {
            exec("taskkill /IM node.exe /F /T");
          } else {
            exec("pkill node");
          }
          // Fallback
          setTimeout(() => process.exit(0), 500);
        }, 2000);
      }, duration + 4000);
    }
  });

  socket.on("admin:disconnect-others", () => {
    if (pseudo !== "Admin") return;
    try {
      const adminSockets = gameState.userSockets.get("Admin");
      if (adminSockets) {
        let count = 0;
        adminSockets.forEach((sId) => {
          if (sId !== socket.id) {
            const s = io.sockets.sockets.get(sId);
            if (s) {
              s.emit("system:redirect", "/login");
              setTimeout(() => s.disconnect(true), 500);
              count++;
            }
          }
        });
        socket.emit("system:notification", {
          message: `✅ ${count} autre(s) session(s) Admin déconnectée(s)`,
          duration: 4000,
        });
      }
    } catch (e) {
      console.error("Erreur disconnect-others:", e);
    }
  });
}

module.exports = { registerAdminHandlers };
