// Fonctions guerre des clans supprimées

function registerAdminHandlers({
  io,
  socket,
  pseudo,
  FileService,
  dbUsers,
  config,
  getIpFromSocket,
  broadcastSystemMessage,
  leaderboardManager,
  gameState,
  pixelWarGame,
}) {
  const isAdmin = pseudo === "Admin";
  const canModerate =
    pseudo === "Admin" || pseudo === "Moderateur1" || pseudo === "Moderateur2";
  const normalizePseudoValue = (p) => {
    const raw = String(p || "").trim();
    return raw ? raw.toLowerCase() : "";
  };

  const listHasPseudo = (list, p) => {
    const key = normalizePseudoValue(p);
    if (!key) return false;
    return list.some((entry) => normalizePseudoValue(entry) === key);
  };

  const getSocketPseudo = (s) => {
    return s?.data?.pseudo || s?.handshake?.session?.user?.pseudo || null;
  };

  const resolveExistingPseudo = (raw) => {
    const target = String(raw || "").trim();
    if (!target) return null;
    const rec =
      dbUsers && typeof dbUsers.findBypseudo === "function"
        ? dbUsers.findBypseudo(target)
        : null;
    return rec && rec.pseudo ? rec.pseudo : null;
  };

  // ensureTicker supprimé (guerre des clans)

  // Handlers guerre des clans supprimés

  // ------- Admin Events -------
  // Permettre à tous de récupérer la liste des multiplicateurs actuels
  // Handler guerre des clans supprimé
  // Handler clanwar supprimé
  // Permettre à tous de récupérer l'état des boosts de clan
  // Handler guerre des clans supprimé
  // Admin: modification des multiplicateurs de guerre de clans en temps réel
  // Handler guerre des clans supprimé

  // Admin: set multiple multipliers at once
  // Handler guerre des clans supprimé

  // Admin: set a temporary boost for a clan
  // Handler guerre des clans supprimé

  // Handler guerre des clans supprimé
  // ------- Reset complet -------
  socket.on("admin:server:softReset", async () => {
    if (!isAdmin) return;
    const fs = require("fs");
    const path = require("path");
    const dataDir = path.join(__dirname, "../../../data");
    // Fichiers à ne PAS toucher
    const exclude = [
      "motus_scores.json",
      "motus_state.json",
      "pixelwar_users.json",
      "pixelwar_custom_colors.json",
      "tags.json",
      "tag_requests.json",
      "shop_catalog.json",
      "surveys.json",
      "annonces.json",
      "password_requests.json",
      "pfps.json",
      "pfp_requests.json",
      "easter_egg_tracking.json", // NE PAS TOUCHER Easter Eggs
    ];
    // Fichiers à reset partiel (ex: badges, medals)
    const partialReset = {
      "chat_badges.json": (data) => ({ ...data, users: {} }),
    };
    try {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (exclude.includes(file) || file.startsWith("pixelwar_")) continue;
        const filePath = path.join(dataDir, file);
        if (!file.endsWith(".json")) continue;
        // Reset partiel pour certains fichiers
        if (partialReset[file]) {
          let raw;
          try {
            raw = fs.readFileSync(filePath, "utf-8");
          } catch {
            continue;
          }
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            continue;
          }
          data = partialReset[file](data);
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } else if (file === "users.json") {
          let raw;
          try {
            raw = fs.readFileSync(filePath, "utf-8");
          } catch {
            continue;
          }
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            continue;
          }
          data.users = data.users.map((u) => ({
            id: u.id,
            pseudo: u.pseudo,
            password: u.password,
            passwordHashé: u.passwordHashé,
            creeDepuis: u.creeDepuis,
            creeAt: u.creeAt,
            tag: u.tag,
            birthDate: u.birthDate,
          }));
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } else if (file === "clicks.json" || file === "medals.json") {
          // Supprimer complètement clicks.json et medals.json
          try {
            fs.unlinkSync(filePath);
          } catch {}
        } else {
          // Pour tous les autres fichiers, on les supprime complètement
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      }
      // Vider aussi l'état en mémoire afin d'éviter une recréation immédiate
      try {
        if (!FileService.data) FileService.data = {};
        FileService.data.clicks = {};
        FileService.save("clicks", FileService.data.clicks);

        FileService.data.clickerHumanPeakCps = {};
        FileService.save(
          "clickerHumanPeakCps",
          FileService.data.clickerHumanPeakCps,
        );

        // Vider les wallets (monnaie + tokens)
        FileService.data.wallets = {};
        FileService.save("wallets", FileService.data.wallets);

        FileService.data.medals = {};
        FileService.save("medals", FileService.data.medals);
      } catch (e) {
        // ne pas bloquer le reset si la sauvegarde mémoire échoue
      }

      // Rebroadcast des leaderboards vides pour que les clients rafraîchissent immédiatement
      try {
        leaderboardManager.broadcastClickerLB(io);
        leaderboardManager.broadcastDinoLB(io);
        leaderboardManager.broadcastFlappyLB(io);
        leaderboardManager.broadcastUnoLB(io);
        leaderboardManager.broadcastP4LB(io);
        leaderboardManager.broadcastBlockBlastLB(io);
        leaderboardManager.broadcastSnakeLB(io);
        leaderboardManager.broadcastMotusLB(io);
        leaderboardManager.broadcast2048LB(io);
        leaderboardManager.broadcastMashLB(io);
        leaderboardManager.broadcastBlackjackLB(io);
        leaderboardManager.broadcastCoinflipLB(io);
        leaderboardManager.broadcastAimTrainerLB(io);
      } catch (e) {
        // noop
      }

      socket.emit("admin:server:softReset:result", { success: true });
      // Rafraîchir tous les clients (admin et users)
      io.emit("reload", { file: "index.html" });
    } catch (e) {
      socket.emit("admin:server:softReset:result", {
        success: false,
        error: e.message,
      });
    }
  });
  socket.on("admin:rules:resetAll", () => {
    if (!isAdmin) return;
    if (!dbUsers || typeof dbUsers.readAll !== "function") {
      socket.emit("admin:rules:resetAll:result", {
        success: false,
        message: "dbUsers indisponible",
      });
      return;
    }
    try {
      const db = dbUsers.readAll();
      const users = Array.isArray(db?.users) ? db.users : [];

      let changed = 0;
      for (const u of users) {
        if (!u || typeof u !== "object") continue;
        if (u.rulesAccepted === false) continue;
        u.rulesAccepted = false;
        changed++;
      }

      dbUsers.writeAll({ ...db, users });

      socket.emit("admin:rules:resetAll:result", {
        success: true,
        changed,
        total: users.length,
      });

      // Refresh tous les clients (sauf admins) pour forcer la relecture
      try {
        io.except("admins").emit("reload", { file: "index.html" });
      } catch (e) {
        // Fallback si except() n'est pas dispo
        io.emit("reload", { file: "index.html" });
      }
    } catch (e) {
      socket.emit("admin:rules:resetAll:result", {
        success: false,
        message: "Erreur reset rulesAccepted",
      });
    }
  });

  // Admin: blacklist management via socket (Admin only)
  socket.on("admin:blacklist:get", () => {
    if (!canModerate) return;
    try {
      const data = {
        alwaysBlocked: Array.isArray(config.BLACKLIST)
          ? config.BLACKLIST.slice()
          : [],
        alwaysBlockedPseudos: Array.isArray(config.BLACKLIST_PSEUDOS)
          ? config.BLACKLIST_PSEUDOS.slice()
          : [],
      };
      const forced = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      const forcedPseudos = Array.isArray(config.FORCED_ALWAYS_BLOCKED_PSEUDOS)
        ? config.FORCED_ALWAYS_BLOCKED_PSEUDOS
        : [];
      socket.emit("admin:blacklist:result", {
        success: true,
        data,
        forced,
        forcedPseudos,
      });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur lecture blacklist",
      });
    }
  });

  socket.on("admin:blacklist:add", ({ ip }) => {
    if (!canModerate) return;
    if (!ip)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "IP manquante",
      });
    // Protection : un modérateur ne peut pas blacklister l'admin ou un autre modérateur par IP
    if (!isAdmin) {
      // On cherche si l'IP correspond à un modérateur ou à l'admin
      let isProtected = false;
      io.sockets.sockets.forEach((s) => {
        try {
          const sIp = getIpFromSocket(s);
          const sPseudo = getSocketPseudo(s);
          const lower = (sPseudo || "").trim().toLowerCase();
          if (
            sIp === ip &&
            (lower === "admin" ||
              lower === "moderateur1" ||
              lower === "moderateur2")
          ) {
            isProtected = true;
          }
        } catch (e) {}
      });
      if (isProtected) {
        return socket.emit("admin:blacklist:result", {
          success: false,
          message: "Impossible de blacklister un modérateur ou l'admin par IP.",
        });
      }
    }
    try {
      if (!Array.isArray(config.BLACKLIST)) config.BLACKLIST = [];
      if (!config.BLACKLIST.includes(ip)) config.BLACKLIST.push(ip);
      const data = {
        alwaysBlocked: config.BLACKLIST.slice(),
        alwaysBlockedPseudos: Array.isArray(config.BLACKLIST_PSEUDOS)
          ? config.BLACKLIST_PSEUDOS.slice()
          : [],
      };

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

      io.to("admins").emit("admin:blacklist:updated", data);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur ajout blacklist",
      });
    }
  });

  socket.on("admin:blacklist:pseudo:add", ({ pseudo: target }) => {
    if (!canModerate) return;
    const targetPseudo = String(target || "").trim();
    if (!targetPseudo)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "Pseudo manquant",
      });
    const canonicalPseudo = resolveExistingPseudo(targetPseudo);
    if (!canonicalPseudo) {
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "Utilisateur introuvable",
      });
    }
    // Protection : un modérateur ne peut pas blacklister un autre modérateur ni l'admin
    const lowerTarget = canonicalPseudo.trim().toLowerCase();
    const isTargetAdmin = lowerTarget === "admin";
    const isTargetMod = ["moderateur1", "moderateur2"].includes(lowerTarget);
    if (!isAdmin && (isTargetAdmin || isTargetMod)) {
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "Impossible de blacklister un modérateur ou l'admin.",
      });
    }
    // Protection supplémentaire : empêcher toute action de ban sur l'admin ou un modérateur (si d'autres handlers similaires existent)
    // (à dupliquer dans d'autres handlers si besoin)
    try {
      if (!Array.isArray(config.BLACKLIST_PSEUDOS))
        config.BLACKLIST_PSEUDOS = [];
      if (!listHasPseudo(config.BLACKLIST_PSEUDOS, canonicalPseudo)) {
        config.BLACKLIST_PSEUDOS.push(canonicalPseudo);
      }
      const data = {
        alwaysBlocked: Array.isArray(config.BLACKLIST)
          ? config.BLACKLIST.slice()
          : [],
        alwaysBlockedPseudos: config.BLACKLIST_PSEUDOS.slice(),
      };

      try {
        io.sockets.sockets.forEach((s) => {
          try {
            const sPseudo = getSocketPseudo(s);
            if (
              sPseudo &&
              normalizePseudoValue(sPseudo) ===
                normalizePseudoValue(canonicalPseudo)
            ) {
              try {
                s.emit("system:notification", {
                  message: "🚫 Votre pseudo a été banni",
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

      io.to("admins").emit("admin:blacklist:updated", data);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur ajout blacklist pseudo",
      });
    }
  });

  socket.on("admin:blacklist:remove", ({ ip }) => {
    if (!canModerate) return;
    if (!ip)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "IP manquante",
      });
    try {
      const forcedList = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      if (forcedList.includes(ip)) {
        return socket.emit("admin:blacklist:result", {
          success: false,
          message: "Impossible de retirer une IP forcée",
        });
      }

      if (!Array.isArray(config.BLACKLIST)) config.BLACKLIST = [];
      config.BLACKLIST = config.BLACKLIST.filter((v) => v !== ip);
      const data = {
        alwaysBlocked: config.BLACKLIST.slice(),
        alwaysBlockedPseudos: Array.isArray(config.BLACKLIST_PSEUDOS)
          ? config.BLACKLIST_PSEUDOS.slice()
          : [],
      };

      io.to("admins").emit("admin:blacklist:updated", data);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur suppression blacklist",
      });
    }
  });

  socket.on("admin:blacklist:set", ({ alwaysBlocked }) => {
    if (!canModerate) return;
    try {
      const forcedList = Array.isArray(config.FORCED_ALWAYS_BLOCKED)
        ? config.FORCED_ALWAYS_BLOCKED
        : [];
      const provided = Array.isArray(alwaysBlocked) ? alwaysBlocked : [];
      const merged = Array.from(new Set([...forcedList, ...provided]));
      const data = {
        alwaysBlocked: merged,
        alwaysBlockedPseudos: Array.isArray(config.BLACKLIST_PSEUDOS)
          ? config.BLACKLIST_PSEUDOS.slice()
          : [],
      };
      config.BLACKLIST = data.alwaysBlocked.slice();

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

      io.to("admins").emit("admin:blacklist:updated", data);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur écriture blacklist",
      });
    }
  });

  socket.on("admin:blacklist:pseudo:remove", ({ pseudo: target }) => {
    if (!canModerate) return;
    const targetPseudo = String(target || "").trim();
    if (!targetPseudo)
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "Pseudo manquant",
      });
    const canonicalPseudo = resolveExistingPseudo(targetPseudo);
    if (!canonicalPseudo) {
      return socket.emit("admin:blacklist:result", {
        success: false,
        message: "Utilisateur introuvable",
      });
    }

    try {
      const forcedList = Array.isArray(config.FORCED_ALWAYS_BLOCKED_PSEUDOS)
        ? config.FORCED_ALWAYS_BLOCKED_PSEUDOS
        : [];
      if (listHasPseudo(forcedList, targetPseudo)) {
        return socket.emit("admin:blacklist:result", {
          success: false,
          message: "Impossible de retirer un pseudo forcé",
        });
      }

      if (!Array.isArray(config.BLACKLIST_PSEUDOS))
        config.BLACKLIST_PSEUDOS = [];
      config.BLACKLIST_PSEUDOS = config.BLACKLIST_PSEUDOS.filter(
        (v) =>
          normalizePseudoValue(v) !== normalizePseudoValue(canonicalPseudo),
      );

      const data = {
        alwaysBlocked: Array.isArray(config.BLACKLIST)
          ? config.BLACKLIST.slice()
          : [],
        alwaysBlockedPseudos: config.BLACKLIST_PSEUDOS.slice(),
      };

      io.to("admins").emit("admin:blacklist:updated", data);
      socket.emit("admin:blacklist:result", { success: true, data });
    } catch (e) {
      socket.emit("admin:blacklist:result", {
        success: false,
        message: "Erreur suppression blacklist pseudo",
      });
    }
  });

  socket.on("admin:refresh", () => {
    if (!canModerate) return;
    leaderboardManager.broadcastClickerLB(io);
    leaderboardManager.broadcastDinoLB(io);
    leaderboardManager.broadcastFlappyLB(io);
    leaderboardManager.broadcastUnoLB(io);
    leaderboardManager.broadcastP4LB(io);
    leaderboardManager.broadcastBlockBlastLB(io);
    leaderboardManager.broadcastSnakeLB(io);
    leaderboardManager.broadcastMotusLB(io);
    leaderboardManager.broadcast2048LB(io);
    leaderboardManager.broadcastMashLB(io);
    leaderboardManager.broadcastBlackjackLB(io);
    leaderboardManager.broadcastCoinflipLB(io);
  });

  socket.on("admin:chat:clear", () => {
    if (!canModerate) return;
    FileService.data.historique = [];
    FileService.save("historique", FileService.data.historique);
    io.emit("chat:history", []);
    broadcastSystemMessage(
      io,
      "🔙 L'historique du chat a été effacé par l'Admin.",
      true,
    );
  });

  // Mute / Unmute utilisateurs (Admin)
  socket.on("admin:chat:mute", ({ target, durationMs }) => {
    if (!canModerate) return;
    if (!target) return;
    const canonicalTarget = resolveExistingPseudo(target);
    if (!canonicalTarget) {
      socket.emit("system:notification", {
        message: "❌ Utilisateur introuvable",
        duration: 4000,
      });
      return;
    }
    try {
      FileService.data.chatMuted = FileService.data.chatMuted || {};
      const dur = Number(durationMs) || 0;
      const until = dur > 0 ? new Date(Date.now() + dur).toISOString() : null;
      FileService.data.chatMuted[canonicalTarget] = { until, by: pseudo };
      FileService.save("chatMuted", FileService.data.chatMuted);
      io.emit("chat:muted:update", FileService.data.chatMuted);

      const text = until
        ? `${canonicalTarget} a été mis en sourdine par l'Admin pendant ${Math.round(dur / 1000)}s.`
        : `${canonicalTarget} a été mis en sourdine indéfiniment par l'Admin.`;
      broadcastSystemMessage(io, text, true);
    } catch (e) {
      // ignore
    }
  });

  socket.on("admin:chat:unmute", ({ target }) => {
    if (!canModerate) return;
    if (!target) return;
    const canonicalTarget = resolveExistingPseudo(target);
    if (!canonicalTarget) {
      socket.emit("system:notification", {
        message: "❌ Utilisateur introuvable",
        duration: 4000,
      });
      return;
    }
    try {
      FileService.data.chatMuted = FileService.data.chatMuted || {};
      if (FileService.data.chatMuted[canonicalTarget]) {
        delete FileService.data.chatMuted[canonicalTarget];
        FileService.save("chatMuted", FileService.data.chatMuted);
        io.emit("chat:muted:update", FileService.data.chatMuted);
        broadcastSystemMessage(
          io,
          `${canonicalTarget} a été rétabli du mute par l'Admin.`,
          true,
        );
      }
    } catch (e) {
      // ignore
    }
  });

  socket.on("admin:global-notification", ({ message, withCountdown }) => {
    if (!canModerate || !message) return;
    const allowCountdown = isAdmin && !!withCountdown;

    const duration = 8000;
    const notificationText = `📢 [ADMIN] ${message}`;
    io.emit("system:notification", {
      message: notificationText,
      duration: duration,
      withCountdown: allowCountdown,
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
        withCountdown: allowCountdown,
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

    if (allowCountdown) {
      setTimeout(() => {
        io.emit("system:redirect", "/ferme.html");

        // On éteint le serveur peu après pour laisser le temps de charger la page
        setTimeout(() => {
          console.log({
            level: "warn",
            message: "Arrêt du serveur suite au countdown...",
          });
          try {
            const {
              requestShutdown,
            } = require("../../bootstrap/shutdownManager");
            requestShutdown("admin_countdown");
          } catch (e) {
            // Fallback minimal
            setTimeout(() => process.exit(0), 500);
          }
        }, 2000);
      }, duration + 4000);
    }
  });

  socket.on("admin:disconnect-others", () => {
    if (!isAdmin) return;
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

  socket.on("admin:pixelwar:reset_board", () => {
    if (!isAdmin) return;
    if (pixelWarGame) {
      pixelWarGame.resetBoard();
      io.emit("pixelwar:init", { board: Array.from(pixelWarGame.board) });
      io.emit("pixelwar:leaderboard", pixelWarGame.getLeaderboard());
    }
  });

  socket.on("admin:pixelwar:reset_board_and_users", () => {
    if (!isAdmin) return;
    if (pixelWarGame) {
      pixelWarGame.resetBoardAndUsers();
      io.emit("pixelwar:init", { board: Array.from(pixelWarGame.board) });
      io.emit("pixelwar:leaderboard", pixelWarGame.getLeaderboard());
    }
  });

  socket.on("admin:pixelwar:reset_area", ({ x1, y1, x2, y2 }) => {
    if (!isAdmin) return;
    if (pixelWarGame) {
      pixelWarGame.resetArea(x1, y1, x2, y2);
      io.emit("pixelwar:init", { board: Array.from(pixelWarGame.board) });
    }
  });

  socket.on("admin:pixelwar:clear_polygon", ({ points }) => {
    if (!isAdmin) return;
    if (!pixelWarGame) return;

    try {
      pixelWarGame.clearPolygon(points);
      io.emit("pixelwar:init", { board: Array.from(pixelWarGame.board) });
    } catch (e) {
      console.error("admin:pixelwar:clear_polygon error:", e);
    }
  });

  socket.on("admin:pixelwar:clear_square", ({ points }) => {
    if (!isAdmin) return;
    if (!pixelWarGame) return;

    try {
      pixelWarGame.clearSquare(points);
      io.emit("pixelwar:init", { board: Array.from(pixelWarGame.board) });
    } catch (e) {
      console.error("admin:pixelwar:clear_square error:", e);
    }
  });

  socket.on("admin:clanwar:start", ({ winnerBadgeName } = {}) => {
    if (!isAdmin) return;
    try {
      const out = startWar({
        FileService,
        io,
        startedBy: pseudo,
        winnerBadgeName,
        broadcastSystemMessage,
      });
      socket.emit("admin:clanwar:result", out);
    } catch (e) {
      socket.emit("admin:clanwar:result", {
        ok: false,
        message: "Erreur au demarrage de la guerre.",
      });
    }
  });

  socket.on("admin:clanwar:finish", () => {
    if (!isAdmin) return;
    try {
      const out = finishWar({
        FileService,
        io,
        endedBy: pseudo,
        reason: "manual",
        broadcastSystemMessage,
      });
      socket.emit("admin:clanwar:result", out);
    } catch (e) {
      socket.emit("admin:clanwar:result", {
        ok: false,
        message: "Erreur lors de la cloture de la guerre.",
      });
    }
  });
}

module.exports = { registerAdminHandlers };
