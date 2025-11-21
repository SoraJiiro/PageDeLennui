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

  // Charger la blacklist selon la config (R, K ou S)
  loadBlacklist(config) {
    if (config !== "R" && config !== "K" && config !== "S") {
      throw new Error("Configuration invalide. Utilisez 'R', 'K' ou 'S'.");
    }

    const blacklistPath = path.join(__dirname, "..", "blacklist.json");

    try {
      if (!fs.existsSync(blacklistPath)) {
        console.warn(
          `⚠️ Fichier blacklist.json introuvable, création d'un fichier vide...`
        );
        const defaultData = {
          alwaysBlocked: [],
          configR: [],
          configK: [],
        };
        fs.writeFileSync(
          blacklistPath,
          JSON.stringify(defaultData, null, 2),
          "utf8"
        );
      }

      const content = fs.readFileSync(blacklistPath, "utf8");
      const data = JSON.parse(content);

      const alwaysBlocked = Array.isArray(data.alwaysBlocked)
        ? data.alwaysBlocked
        : [];

      if (config === "S") {
        this.BLACKLIST = [...new Set(alwaysBlocked)];
        console.log(
          `\n>> Configuration [ ${config} ] chargée : ${this.BLACKLIST.length} IP(s) blacklistées`
        );
        console.log(`   - Toujours bloquées : ${alwaysBlocked.length}`);
        console.log(`>> IPs bloquées : ${this.BLACKLIST.join(", ")}\n`);
        return;
      }

      const configIPs =
        config === "R"
          ? Array.isArray(data.configR)
            ? data.configR
            : []
          : Array.isArray(data.configK)
          ? data.configK
          : [];

      this.BLACKLIST = [...new Set([...alwaysBlocked, ...configIPs])];

      console.log(
        `\n>> Configuration [ ${config} ] chargée : ${this.BLACKLIST.length} IP(s) blacklistées`
      );
      console.log(`   - Toujours bloquées : ${alwaysBlocked.length}`);
      console.log(`   - Config ${config} : ${configIPs.length}`);
      console.log(`>> IPs bloquées : ${this.BLACKLIST.join(", ")}\n`);
    } catch (err) {
      console.error(
        `Erreur lors du chargement de la blacklist : ${err.message}`
      );
      this.BLACKLIST = [];
    }
  },
};
