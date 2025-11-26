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
  // IPs qui doivent TOUJOURS être bloquées (forcées)
  FORCED_ALWAYS_BLOCKED: [
    "192.168.197.197",
    "192.168.197.1",
    "192.168.193.193",
    "192.168.193.1",
  ],

  // Save blockblast move history to disk (set env SAVE_BLOCKBLAST_HISTORY=true to enable)
  SAVE_BLOCKBLAST_HISTORY:
    (process.env.SAVE_BLOCKBLAST_HISTORY || "false") === "true",

  // Charger la blacklist selon la config (R, K ou S)
  loadBlacklist(config) {
    // Simplified: only keep the alwaysBlocked list (merged with forced IPs).
    const blacklistPath = path.join(__dirname, "..", "blacklist.json");
    try {
      if (!fs.existsSync(blacklistPath)) {
        const defaultData = { alwaysBlocked: [] };
        fs.writeFileSync(
          blacklistPath,
          JSON.stringify(defaultData, null, 2),
          "utf8"
        );
      }

      const content = fs.readFileSync(blacklistPath, "utf8") || "{}";
      const data = JSON.parse(content);

      const fileAlways = Array.isArray(data.alwaysBlocked)
        ? data.alwaysBlocked
        : [];
      const forced = Array.isArray(this.FORCED_ALWAYS_BLOCKED)
        ? this.FORCED_ALWAYS_BLOCKED
        : [];
      const alwaysBlocked = [...new Set([...forced, ...fileAlways])];

      // Persist forced IPs to file if missing (only forced IPs are written)
      try {
        const missing = forced.filter((ip) => !fileAlways.includes(ip));
        if (missing.length > 0) {
          data.alwaysBlocked = alwaysBlocked;
          fs.writeFileSync(
            blacklistPath,
            JSON.stringify(data, null, 2),
            "utf8"
          );
        }
      } catch (e) {
        // ignore persistence errors silently
      }

      // Set runtime blacklist to the merged alwaysBlocked (forced + file)
      this.BLACKLIST = [...new Set(alwaysBlocked)];
    } catch (err) {
      this.BLACKLIST = [];
    }
  },
};
