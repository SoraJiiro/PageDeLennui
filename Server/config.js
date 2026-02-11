require("dotenv").config();
const path = require("path");
const fs = require("fs");

module.exports = {
  // Serveur
  PORT: process.env.PORT || 7750,
  HOST: "",
  SESSION_SECRET: process.env.CLE_SID || "pDeS3CR3Ts1dKeY@523!",

  // Route
  DATA: path.join(__dirname, "..", "data"),
  PUBLIC: path.join(__dirname, "..", "Public"),

  // Blacklist
  BLACKLIST: [],
  BLACKLIST_PSEUDOS: [],
  // IPs qui doivent TOUJOURS être bloquées (forcées)
  FORCED_ALWAYS_BLOCKED: [
    "192.168.197.197",
    "192.168.197.1",
    "192.168.193.193",
    "192.168.193.1",
  ],
  // Pseudos qui doivent TOUJOURS être bloqués (forcés)
  FORCED_ALWAYS_BLOCKED_PSEUDOS: [],

  // Sauvegarder l'historique des mouvements blockblast sur le disque (définir env SAVE_BLOCKBLAST_HISTORY=true pour activer)
  SAVE_BLOCKBLAST_HISTORY:
    (process.env.SAVE_BLOCKBLAST_HISTORY || "false") === "true",

  // Logs des connexions sockets (LOG_SOCKET_EVENTS=true pour activer)
  LOG_SOCKET_EVENTS: (process.env.LOG_SOCKET_EVENTS || "false") === "true",

  // Charger la blacklist selon la config (R, K ou S)
  loadBlacklist(config) {
    // Simplifié : ne garder que la liste alwaysBlocked (fusionnée avec les IP forcées).
    const blacklistPath = path.join(__dirname, "..", "blacklist.json");
    try {
      if (!fs.existsSync(blacklistPath)) {
        const defaultData = { alwaysBlocked: [], alwaysBlockedPseudos: [] };
        fs.writeFileSync(
          blacklistPath,
          JSON.stringify(defaultData, null, 2),
          "utf8",
        );
      }

      const content = fs.readFileSync(blacklistPath, "utf8") || "{}";
      const data = JSON.parse(content);

      const fileAlways = Array.isArray(data.alwaysBlocked)
        ? data.alwaysBlocked
        : [];
      const fileAlwaysPseudos = Array.isArray(data.alwaysBlockedPseudos)
        ? data.alwaysBlockedPseudos
        : [];
      const forced = Array.isArray(this.FORCED_ALWAYS_BLOCKED)
        ? this.FORCED_ALWAYS_BLOCKED
        : [];
      const forcedPseudos = Array.isArray(this.FORCED_ALWAYS_BLOCKED_PSEUDOS)
        ? this.FORCED_ALWAYS_BLOCKED_PSEUDOS
        : [];
      const alwaysBlocked = [...new Set([...forced, ...fileAlways])];
      const alwaysBlockedPseudos = [
        ...new Set([...forcedPseudos, ...fileAlwaysPseudos]),
      ];

      // Persister les IP forcées dans le fichier si manquantes (seules les IP forcées sont écrites)
      try {
        const missingIps = forced.filter((ip) => !fileAlways.includes(ip));
        const missingPseudos = forcedPseudos.filter(
          (p) => !fileAlwaysPseudos.includes(p),
        );
        if (missingIps.length > 0 || missingPseudos.length > 0) {
          data.alwaysBlocked = alwaysBlocked;
          data.alwaysBlockedPseudos = alwaysBlockedPseudos;
          fs.writeFileSync(
            blacklistPath,
            JSON.stringify(data, null, 2),
            "utf8",
          );
        }
      } catch (e) {
        // ignorer silencieusement les erreurs de persistance
      }

      // Définir la blacklist d'exécution sur alwaysBlocked fusionné (forcé + fichier)
      this.BLACKLIST = [...new Set(alwaysBlocked)];
      this.BLACKLIST_PSEUDOS = [...new Set(alwaysBlockedPseudos)];
    } catch (err) {
      this.BLACKLIST = [];
      this.BLACKLIST_PSEUDOS = [];
    }
  },
};
