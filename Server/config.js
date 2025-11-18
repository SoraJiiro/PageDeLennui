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

  // Charger la blacklist selon la config (R = 193, K = 197)
  loadBlacklist(config) {
    const blacklistPath = path.join(__dirname, "..", "ips_blacklist.txt");

    try {
      const content = fs.readFileSync(blacklistPath, "utf8");
      const allIPs = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // IPs toujours bannies (2 premières de chaque groupe)
      const alwaysBanned = [
        "192.168.197.197",
        "192.168.197.1",
        "192.168.193.193",
        "192.168.193.1",
      ];

      if (config === "R") {
        // Config R : IPs contenant "193"
        const r193IPs = allIPs.filter((ip) => ip.includes(".193."));
        this.BLACKLIST = [...new Set([...alwaysBanned, ...r193IPs])];
      } else if (config === "K") {
        // Config K : IPs contenant "197" (41 et 61 uniquement, 42 et 63 retirées)
        const k197IPs = allIPs.filter((ip) => ip.includes(".197."));
        this.BLACKLIST = [...new Set([...alwaysBanned, ...k197IPs])];
      } else {
        throw new Error("Configuration invalide. Utilisez 'R' ou 'K'.");
      }

      console.log(
        `\n>> Configuration ${config} chargée : ${this.BLACKLIST.length} IP(s) blacklistées`
      );
      console.log(`>> IPs bloquées : ${this.BLACKLIST.join(", ")}\n`);
    } catch (err) {
      console.error(
        `Erreur lors du chargement de la blacklist : ${err.message}`
      );
      this.BLACKLIST = [];
    }
  },
};
