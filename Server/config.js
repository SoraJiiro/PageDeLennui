require("dotenv").config();
const path = require("path");

module.exports = {
  // Serveur
  PORT: process.env.PORT || 7750,
  HOST: "",
  SESSION_SECRET: process.env.CLE_SID || "pDeS3CR3Ts1dKeY@523!",

  // Chemins
  DATA_DIR: path.join(__dirname, "..", "data"),
  WEBROOT: path.join(__dirname, "..", "Public"),

  // Blacklist
  BLACKLIST: [
    "192.168.197.197",
    "192.168.197.1",
    "192.168.193.193",
    "192.168.193.1",
  ],

  // Anti-spam
  CLICK_WINDOW_MS: 1200,
  CLICK_MAX_PER_WINDOW: 25,
};
