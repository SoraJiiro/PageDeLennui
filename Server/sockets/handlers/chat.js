// Server/sockets/handlers/chat.js - Version avec partage de fichiers

const path = require("path");
const fs = require("fs");
const config = require("../../config");
const { markStepByCode } = require("../../services/easterEggs");

// Global in-memory recent messages map used for basic anti-spam
const recentMessages = new Map(); // pseudo -> [timestamps]
const SPAM_WINDOW_MS = 10 * 1000; // 10s window
const SPAM_MAX_MESSAGES = 5; // max messages in window before auto-mute
const SPAM_AUTO_MUTE_MS = 30 * 1000; // auto-mute duration (30s)

function registerChatHandlers({
  io,
  socket,
  pseudo,
  FileService,
  dbUsers,
  getMotusState,
}) {
  const getPfpFor = (p) => {
    if (FileService && typeof FileService.getPfpUrl === "function") {
      return FileService.getPfpUrl(p);
    }
    // Fallback de sécurité si getPfpUrl n'existe pas
    const url =
      FileService && FileService.data && FileService.data.pfps
        ? FileService.data.pfps[p]
        : null;
    return typeof url === "string" && url
      ? url
      : "/Public/imgs/defaultProfile.png";
  };

  const getSelectedBadgesFor = (p) => {
    const badgesData = FileService.data.chatBadges || {
      catalog: {},
      users: {},
    };
    const userBucket = (badgesData.users && badgesData.users[p]) || null;
    const selectedIds = Array.isArray(userBucket && userBucket.selected)
      ? userBucket.selected.slice(0, 3)
      : [];
    const out = [];
    for (const id of selectedIds) {
      const def = badgesData.catalog ? badgesData.catalog[id] : null;
      if (!def) continue;
      out.push({
        id,
        emoji: String(def.emoji || "🏷️"),
        name: String(def.name || id),
      });
    }
    return out;
  };

  // --- MPs ---
  function normalizePseudoLikeRoom(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    if (dbUsers && typeof dbUsers.findBypseudo === "function") {
      const u = dbUsers.findBypseudo(raw);
      return u && u.pseudo ? u.pseudo : null;
    }
    return raw;
  }

  // Envoyer la liste des mutes actuels au client connecté
  try {
    socket.emit("chat:muted:update", FileService.data.chatMuted || {});
  } catch (e) {
    // ignore
  }

  function isUserOnline(targetPseudo) {
    try {
      const room = io.sockets.adapter.rooms.get("user:" + targetPseudo);
      return !!(room && room.size > 0);
    } catch {
      return false;
    }
  }

  function safeTrimMessage(text) {
    const msg = String(text || "").trim();
    // garde-fou anti-spam / payload trop gros
    return msg.length > 2000 ? msg.slice(0, 2000) : msg;
  }

  function flushPendingDms() {
    try {
      const list = Array.isArray(FileService.data.dms)
        ? FileService.data.dms
        : [];
      if (!list.length) return;

      let changed = false;
      const now = new Date().toISOString();

      for (const dm of list) {
        if (!dm || typeof dm !== "object") continue;
        if (dm.to !== pseudo) continue;
        if (dm.delivered) continue;

        socket.emit("chat:dm", {
          id: dm.id,
          from: dm.from,
          to: dm.to,
          text: dm.text,
          at: dm.at,
          pfp: getPfpFor(dm.from),
          tag: FileService.data.tags ? FileService.data.tags[dm.from] : null,
          badges: getSelectedBadgesFor(dm.from),
        });

        dm.delivered = true;
        dm.deliveredAt = now;
        changed = true;
      }

      if (changed) {
        FileService.save("dms", list);
      }
    } catch (e) {
      console.error("[DM] flush error", e);
    }
  }

  // Flush dès l'arrivée dans le chat
  flushPendingDms();

  socket.on("chat:dm:send", ({ to, text }) => {
    const resolvedTo = normalizePseudoLikeRoom(to);
    const msg = safeTrimMessage(text);

    if (!resolvedTo) {
      socket.emit("chat:dm:error", "Pseudo destinataire invalide");
      return;
    }
    if (!msg) {
      socket.emit("chat:dm:error", "Message vide");
      return;
    }
    if (resolvedTo === pseudo) {
      socket.emit("chat:dm:error", "Vous ne pouvez pas vous envoyer un MP");
      return;
    }
    // Si dbUsers est dispo, on refuse les pseudos inconnus
    if (dbUsers && typeof dbUsers.findBypseudo === "function") {
      const exists = dbUsers.findBypseudo(resolvedTo);
      if (!exists) {
        socket.emit("chat:dm:error", `Utilisateur introuvable: ${resolvedTo}`);
        return;
      }
    }

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const at = new Date().toISOString();

    const tagData = FileService.data.tags
      ? FileService.data.tags[pseudo]
      : null;
    let tagPayload = null;
    if (tagData) {
      if (typeof tagData === "string")
        tagPayload = { text: tagData, color: null };
      else if (typeof tagData === "object") tagPayload = tagData;
    }

    const dmPayload = {
      id,
      from: pseudo,
      to: resolvedTo,
      text: msg,
      at,
      tag: tagPayload,
      pfp: getPfpFor(pseudo),
      badges: getSelectedBadgesFor(pseudo),
    };

    // Persist (avec état de livraison)
    const dms = Array.isArray(FileService.data.dms) ? FileService.data.dms : [];
    const online = isUserOnline(resolvedTo);
    const record = {
      id,
      from: pseudo,
      to: resolvedTo,
      text: msg,
      at,
      delivered: online,
      deliveredAt: online ? at : null,
    };
    dms.push(record);
    // Cap simple pour éviter croissance infinie
    if (dms.length > 5000) dms.splice(0, dms.length - 5000);
    FileService.save("dms", dms);

    // Echo à l'expéditeur + livraison au destinataire si en ligne
    socket.emit("chat:dm", dmPayload);
    io.to("user:" + resolvedTo).emit("chat:dm", {
      ...dmPayload,
      pfp: getPfpFor(pseudo),
      tag: tagPayload,
      badges: getSelectedBadgesFor(pseudo),
    });
  });

  socket.on("chat:message", ({ text }) => {
    let msg = String(text || "").trim();
    if (!msg) return;

    // Vérifier mute côté serveur (persisté)
    try {
      FileService.data.chatMuted = FileService.data.chatMuted || {};
      const muteEntry = FileService.data.chatMuted[pseudo];
      if (muteEntry) {
        const now = Date.now();
        if (muteEntry.until) {
          const untilTs = new Date(muteEntry.until).getTime();
          if (untilTs > now && pseudo !== "Admin") {
            socket.emit("chat:muted", {
              until: muteEntry.until,
              by: muteEntry.by || "Admin",
            });
            return;
          }
          // expired => cleanup
          delete FileService.data.chatMuted[pseudo];
          FileService.save("chatMuted", FileService.data.chatMuted);
          io.emit("chat:muted:update", FileService.data.chatMuted);
        } else {
          // indefinite mute
          if (pseudo !== "Admin") {
            socket.emit("chat:muted", {
              until: null,
              by: muteEntry.by || "Admin",
            });
            return;
          }
        }
      }
    } catch (e) {
      // ignore
    }

    // Anti-spam simple: window-based counting
    try {
      const now = Date.now();
      const arr = Array.isArray(recentMessages.get(pseudo))
        ? recentMessages.get(pseudo)
        : [];
      const filtered = arr.filter((t) => now - t < SPAM_WINDOW_MS);
      filtered.push(now);
      recentMessages.set(pseudo, filtered);
      if (filtered.length > SPAM_MAX_MESSAGES && pseudo !== "Admin") {
        // auto-mute
        FileService.data.chatMuted = FileService.data.chatMuted || {};
        const until = new Date(now + SPAM_AUTO_MUTE_MS).toISOString();
        FileService.data.chatMuted[pseudo] = { until, by: "AutoSpam" };
        FileService.save("chatMuted", FileService.data.chatMuted);
        io.emit("chat:muted:update", FileService.data.chatMuted);
        // Supprimer les 4 derniers messages de l'utilisateur pour atténuer le spam
        try {
          FileService.data.historique = Array.isArray(
            FileService.data.historique,
          )
            ? FileService.data.historique
            : [];
          // Trouver indices des messages de l'utilisateur (par ordre chronologique)
          const userMsgIndices = [];
          for (let i = FileService.data.historique.length - 1; i >= 0; i--) {
            const m = FileService.data.historique[i];
            if (m && m.name === pseudo && typeof m.id === "string") {
              userMsgIndices.push(i);
            }
            if (userMsgIndices.length >= 4) break;
          }

          const removedIds = [];
          if (userMsgIndices.length) {
            // Supprimer du tableau en partant des indices les plus élevés
            userMsgIndices.sort((a, b) => b - a);
            for (const idx of userMsgIndices) {
              const removed = FileService.data.historique.splice(idx, 1);
              if (removed && removed[0] && removed[0].id)
                removedIds.push(removed[0].id);
            }
            // Sauvegarde
            if (FileService.data.historique.length > 200)
              FileService.data.historique =
                FileService.data.historique.slice(-200);
            FileService.save("historique", FileService.data.historique);
          }

          // Emettre événements de suppression pour que les clients retirent les messages
          for (const id of removedIds) {
            try {
              io.emit("chat:delete", { id });
            } catch (e) {}
          }

          // Envoi message système indiquant l'action
          const sysPayload = {
            id:
              "sys-" +
              Date.now().toString(36) +
              Math.random().toString(36).substr(2),
            name: "Système",
            text: `${pseudo} a été mis en sourdine automatiquement pour spam (${SPAM_AUTO_MUTE_MS / 1000}s). ${removedIds.length ? `${removedIds.length} message(s) supprimé(s).` : ""}`,
            at: new Date().toISOString(),
            tag: null,
            pfp: null,
            badges: [],
          };
          FileService.data.historique.push(sysPayload);
          if (FileService.data.historique.length > 200)
            FileService.data.historique =
              FileService.data.historique.slice(-200);
          FileService.save("historique", FileService.data.historique);
          FileService.appendLog(sysPayload);
          io.emit("chat:message", sysPayload);
        } catch (e) {
          // Si erreur, on continue quand même
          try {
            const sysPayload = {
              id:
                "sys-" +
                Date.now().toString(36) +
                Math.random().toString(36).substr(2),
              name: "Système",
              text: `${pseudo} a été mis en sourdine automatiquement pour spam (${SPAM_AUTO_MUTE_MS / 1000}s).`,
              at: new Date().toISOString(),
              tag: null,
              pfp: null,
              badges: [],
            };
            FileService.data.historique = Array.isArray(
              FileService.data.historique,
            )
              ? FileService.data.historique
              : [];
            FileService.data.historique.push(sysPayload);
            if (FileService.data.historique.length > 200)
              FileService.data.historique =
                FileService.data.historique.slice(-200);
            FileService.save("historique", FileService.data.historique);
            FileService.appendLog(sysPayload);
            io.emit("chat:message", sysPayload);
          } catch (e2) {}
        }
        return;
      }
    } catch (e) {
      // ignore spam check on error
    }

    if (msg.toLowerCase() === "/rainbow") {
      markStepByCode(pseudo, "r1", FileService);
    }

    // Censure du mot du jour (Motus)
    const userMotusState = getMotusState ? getMotusState(pseudo) : null;
    if (userMotusState && userMotusState.currentWord) {
      const word = userMotusState.currentWord.toUpperCase();
      const leetMap = {
        A: "[A4@àâä]",
        B: "[B8&]",
        E: "[E3éèêë£€]",
        G: "[G69]",
        I: "[I1!|lìíîï]",
        L: "[L1|]",
        O: "[O0°òóôõö¤]",
        S: "[S5$š§]",
        T: "[T17]",
        Z: "[Z2²ž]",
        U: "[Uùúûüµ]",
        C: "[Cç]",
      };

      let regexPattern = "";
      for (const char of word) {
        const mapped = leetMap[char] || char;
        regexPattern += mapped + "+[\\s\\-_.]*";
      }

      if (regexPattern.endsWith("[\\s\\-_.]*")) {
        regexPattern = regexPattern.slice(0, -10);
      }

      const regex = new RegExp(regexPattern, "gi");
      msg = msg.replace(regex, (match) => "*".repeat(match.length));
    }

    const tagData = FileService.data.tags
      ? FileService.data.tags[pseudo]
      : null;
    let tagPayload = null;
    if (tagData) {
      if (typeof tagData === "string") {
        tagPayload = { text: tagData, color: null };
      } else if (typeof tagData === "object") {
        tagPayload = tagData;
      }
    }

    const payload = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: pseudo,
      text: msg,
      at: new Date().toISOString(),
      tag: tagPayload,
      pfp: getPfpFor(pseudo),
      badges: getSelectedBadgesFor(pseudo),
    };

    FileService.data.historique.push(payload);
    if (FileService.data.historique.length > 200) {
      FileService.data.historique = FileService.data.historique.slice(-200);
    }
    FileService.save("historique", FileService.data.historique);
    FileService.appendLog(payload);
    io.emit("chat:message", payload);
  });

  // NOUVEAU: Upload de fichier
  socket.on("chat:uploadFile", ({ fileName, fileData, fileType, fileSize }) => {
    try {
      // Validation
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
      if (fileSize > MAX_FILE_SIZE) {
        socket.emit(
          "chat:fileError",
          "Fichier trop volumineux (max " +
            MAX_FILE_SIZE / (1024 * 1024) +
            " Mo)",
        );
        return;
      }
      const safeNameRaw = String(fileName || "file");
      const ext = path.extname(safeNameRaw).toLowerCase();

      const allowedExtensions = new Set([
        ".php",
        ".js",
        ".html",
        ".css",
        ".txt",
        ".pdf",
        ".zip",
        ".mp4",
        ".webm",
        ".ogg",
        ".mov",
        ".jpg",
        ".jpeg",
        ".png",
        ".mp3",
        ".opus",
        ".wav",
        ".flac",
        ".gif",
        ".bmp",
        ".svg",
        ".ico",
        ".tiff",
        ".avi",
        ".mkv",
        ".7z",
        ".tar",
        ".gz",
        ".bz2",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".odt",
        ".ods",
        ".odp",
        ".rtf",
        ".csv",
        ".md",
        ".epub",
        ".mobi",
        ".azw",
        ".azw3",
        ".fb2",
        ".cbz",
        ".cbr",
        ".bin",
        ".exe",
        ".dll",
        ".iso",
        ".dmg",
        ".m4a",
        ".cpp",
        ".java",
        ".py",
        ".opus",
        ".flv",
        ".wmv",
        ".mov",
        ".webp",
        ".json",
        ".xml",
        ".yml",
        ".yaml",
        ".ini",
        ".log",
        ".rtx",
        ".sh",
        ".bat",
        ".ps1",
        ".sass",
        ".scss",
        ".cs",
        ".go",
        ".c",
        ".xhtml",
        ".tsx",
        ".jsx",
        ".pkt",
        ".sql",
        ".iso",
        ".vbs",
        ".lua",
        ".cpkt",
      ]);

      const allowedExact = new Set([
        "application/pdf",
        "text/plain",
        "application/zip",
        "text/html",
        "text/css",
        "application/javascript",
        "text/javascript",
        "application/x-httpd-php",
        "text/x-php",
        "text/php",
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
        "text/*",
        "application/*",
        "video/*",
        "image/*",
        "audio/*",
        "application/octet-stream",
        "binary/octet-stream",
      ]);

      const isAllowedMime =
        typeof fileType === "string" &&
        (fileType.startsWith("image/") ||
          fileType.startsWith("video/") ||
          fileType.startsWith("audio/") ||
          Array.from(allowedExact).some((a) =>
            a.endsWith("/*")
              ? fileType.startsWith(a.slice(0, -1))
              : fileType === a,
          ));

      const isAllowed = isAllowedMime || allowedExtensions.has(ext);

      if (!isAllowed) {
        socket.emit("chat:fileError", "Type de fichier non autorisé");
        return;
      }

      // Créer une entrée de fichier
      if (!FileService.data.sharedFiles) FileService.data.sharedFiles = {};

      const fileId =
        Date.now().toString(36) + Math.random().toString(36).substr(2);
      // Sanitize filename to avoid path traversal or weird chars
      const safeName = path
        .basename(safeNameRaw)
        .replace(/\0/g, "")
        .slice(0, 200);

      const uploadsDir = path.join(config.PUBLIC, "uploads");
      try {
        if (!fs.existsSync(uploadsDir))
          fs.mkdirSync(uploadsDir, { recursive: true });
      } catch (e) {}

      const savedName = `${fileId}${ext || ""}`;
      const savedPath = path.join(uploadsDir, savedName);
      try {
        fs.writeFileSync(
          savedPath,
          Buffer.from(String(fileData || ""), "base64"),
        );
      } catch (e) {
        console.error("Erreur écriture fichier disque:", e);
      }

      const fileEntry = {
        id: fileId,
        name: safeName,
        type: fileType,
        size: fileSize,
        // chemin relatif côté serveur (servi via express.static Public)
        diskPath: path.join("uploads", savedName),
        url: `/uploads/${savedName}`,
        uploader: pseudo,
        uploadedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      };

      FileService.data.sharedFiles[fileId] = fileEntry;
      FileService.save("sharedFiles", FileService.data.sharedFiles);
      // Log action
      try {
        FileService.appendFileAction({
          action: "upload",
          fileId,
          name: safeName,
          uploader: pseudo,
          size: fileSize,
          at: new Date().toISOString(),
        });
      } catch (e) {}

      // Créer un message de fichier partagé
      const tagData = FileService.data.tags
        ? FileService.data.tags[pseudo]
        : null;
      let tagPayload = null;
      if (tagData) {
        if (typeof tagData === "string") {
          tagPayload = { text: tagData, color: null };
        } else if (typeof tagData === "object") {
          tagPayload = tagData;
        }
      }

      const payload = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        name: pseudo,
        text: ``,
        at: new Date().toISOString(),
        tag: tagPayload,
        pfp: getPfpFor(pseudo),
        badges: getSelectedBadgesFor(pseudo),
        file: {
          id: fileId,
          name: safeName,
          type: fileType,
          size: fileSize,
          url: fileEntry.url,
        },
      };

      FileService.data.historique.push(payload);
      if (FileService.data.historique.length > 200) {
        FileService.data.historique = FileService.data.historique.slice(-200);
      }
      FileService.save("historique", FileService.data.historique);
      FileService.appendLog(payload);

      io.emit("chat:message", payload);
      socket.emit("chat:fileUploaded", { fileId });

      console.log(
        `📎 [${pseudo}] a partagé un fichier: ${fileName} (${(fileSize / 1024).toFixed(2)} KB)`,
      );
    } catch (err) {
      console.error("Erreur upload fichier:", err);
      socket.emit("chat:fileError", "Erreur lors de l'upload");
    }
  });

  // NOUVEAU: Télécharger un fichier
  socket.on("chat:downloadFile", ({ fileId }) => {
    try {
      const file = FileService.data.sharedFiles?.[fileId];

      if (!file) {
        socket.emit("chat:fileError", "Fichier introuvable ou expiré");
        return;
      }

      // Vérifier expiration
      if (new Date(file.expiresAt) < new Date()) {
        delete FileService.data.sharedFiles[fileId];
        FileService.save("sharedFiles", FileService.data.sharedFiles);
        socket.emit("chat:fileError", "Fichier expiré");
        return;
      }

      // Lire le fichier depuis le disque si présent, sinon fallback sur data
      try {
        if (file.diskPath) {
          const absolute = path.join(config.PUBLIC, file.diskPath);
          if (fs.existsSync(absolute)) {
            const buf = fs.readFileSync(absolute);
            socket.emit("chat:fileData", {
              id: file.id,
              name: file.name,
              type: file.type,
              data: buf.toString("base64"),
            });
          } else {
            // fallback
            socket.emit("chat:fileData", {
              id: file.id,
              name: file.name,
              type: file.type,
              data: file.data || null,
            });
          }
        } else {
          socket.emit("chat:fileData", {
            id: file.id,
            name: file.name,
            type: file.type,
            data: file.data || null,
          });
        }
      } catch (e) {
        socket.emit("chat:fileError", "Impossible de lire le fichier");
      }

      try {
        FileService.appendFileAction({
          action: "download",
          fileId: file.id,
          name: file.name,
          downloader: pseudo,
          at: new Date().toISOString(),
        });
      } catch (e) {}
      console.log(`📥 [${pseudo}] a téléchargé: ${file.name}`);
    } catch (err) {
      console.error("Erreur download fichier:", err);
      socket.emit("chat:fileError", "Erreur lors du téléchargement");
    }
  });

  // Admin: obtenir la liste des fichiers partagés
  socket.on("admin:getSharedFiles", () => {
    if (pseudo !== "Admin") return;
    try {
      const all = FileService.data.sharedFiles || {};
      const list = Object.values(all).map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        uploader: f.uploader,
        uploadedAt: f.uploadedAt,
        expiresAt: f.expiresAt,
        url: f.url || null,
      }));
      socket.emit("admin:sharedFiles", list);
    } catch (err) {
      console.error("Erreur admin:getSharedFiles", err);
    }
  });

  // Admin: supprimer un fichier
  socket.on("chat:deleteFile", ({ fileId }) => {
    if (pseudo !== "Admin") return;

    try {
      const target = FileService.data.sharedFiles?.[fileId];
      if (target) {
        // log deletion
        try {
          FileService.appendFileAction({
            action: "delete",
            fileId,
            name: target.name,
            deletedBy: pseudo,
            at: new Date().toISOString(),
          });
        } catch (e) {}
        // supprimer le fichier sur disque si présent
        try {
          if (target.diskPath) {
            const abs = path.join(config.PUBLIC, target.diskPath);
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
          }
        } catch (e) {}

        delete FileService.data.sharedFiles[fileId];
        FileService.save("sharedFiles", FileService.data.sharedFiles);
        io.emit("chat:fileDeleted", { fileId });
      }
    } catch (err) {
      console.error("Erreur suppression fichier:", err);
    }
  });

  // Admin: obtenir la liste des fichiers partagés (avec pagination/filtrage)
  socket.on(
    "admin:getSharedFiles",
    ({ page = 1, pageSize = 50, filter = "" } = {}) => {
      if (pseudo !== "Admin") return;
      try {
        const all = FileService.data.sharedFiles || {};
        const arr = Object.values(all).map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          size: f.size,
          uploader: f.uploader,
          uploadedAt: f.uploadedAt,
          expiresAt: f.expiresAt,
          url: f.url || null,
        }));

        const q = String(filter || "")
          .toLowerCase()
          .trim();
        const filtered = q
          ? arr.filter(
              (f) =>
                (f.name && f.name.toLowerCase().includes(q)) ||
                (f.type && f.type.toLowerCase().includes(q)) ||
                (f.uploader && f.uploader.toLowerCase().includes(q)),
            )
          : arr;

        const total = filtered.length;
        const start = (page - 1) * pageSize;
        const pageItems = filtered.slice(start, start + pageSize);

        socket.emit("admin:sharedFiles", {
          items: pageItems,
          total,
          page,
          pageSize,
        });
      } catch (err) {
        console.error("Erreur admin:getSharedFiles", err);
      }
    },
  );

  // Admin: obtenir les logs d'actions sur les fichiers (pagination)
  socket.on("admin:getFileLogs", ({ page = 1, pageSize = 100 } = {}) => {
    if (pseudo !== "Admin") return;
    try {
      const filePath = FileService.files.fileActions;
      if (!filePath)
        return socket.emit("admin:fileLogs", {
          items: [],
          total: 0,
          page,
          pageSize,
        });
      const fs = require("fs");
      if (!fs.existsSync(filePath))
        return socket.emit("admin:fileLogs", {
          items: [],
          total: 0,
          page,
          pageSize,
        });
      const raw = fs.readFileSync(filePath, "utf8").trim();
      if (!raw)
        return socket.emit("admin:fileLogs", {
          items: [],
          total: 0,
          page,
          pageSize,
        });
      const lines = raw.split(/\n+/).filter(Boolean);
      const total = lines.length;
      const start = (page - 1) * pageSize;
      const slice = lines.slice(start, start + pageSize).map((l) => {
        try {
          return JSON.parse(l);
        } catch (e) {
          return { raw: l };
        }
      });
      socket.emit("admin:fileLogs", { items: slice, total, page, pageSize });
    } catch (err) {
      console.error("Erreur admin:getFileLogs", err);
    }
  });

  socket.on("chat:delete", ({ id }) => {
    if (pseudo !== "Admin") return;
    const idx = FileService.data.historique.findIndex((m) => m.id === id);
    if (idx !== -1) {
      FileService.data.historique.splice(idx, 1);
      FileService.save("historique", FileService.data.historique);
      io.emit("chat:delete", { id });
    }
  });
}

// Nettoyage automatique des fichiers expirés (à appeler périodiquement)
function cleanExpiredFiles(FileService) {
  try {
    if (!FileService.data.sharedFiles) return;

    const now = new Date();
    let cleaned = 0;

    for (const [id, file] of Object.entries(FileService.data.sharedFiles)) {
      if (new Date(file.expiresAt) < now) {
        // supprimer le fichier sur disque si présent
        try {
          if (file.diskPath) {
            const abs = path.join(config.PUBLIC, file.diskPath);
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
          }
        } catch (e) {}

        delete FileService.data.sharedFiles[id];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      FileService.save("sharedFiles", FileService.data.sharedFiles);
      console.log(`🧹 ${cleaned} fichier(s) expiré(s) supprimé(s)`);
    }
  } catch (err) {
    console.error("Erreur nettoyage fichiers:", err);
  }
}

module.exports = { registerChatHandlers, cleanExpiredFiles };
