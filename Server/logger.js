const fs = require("fs");
const path = require("path");
const util = require("util");

class FileLogger {
  constructor(logDir = path.join(__dirname, "..", "data")) {
    this.logDir = logDir;
    this.logFile = path.join(logDir, "server.txt");

    // Créer le dossier data s'il n'existe pas
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Écrire l'en-tête de session
    const now = new Date();
    const header = `\n----- [${now.toLocaleString("fr-FR")}] -----\n`;
    fs.appendFileSync(this.logFile, header, "utf8");
  }

  write(level, message) {
    try {
      const timestamp = new Date().toLocaleTimeString("fr-FR");
      const line = `${timestamp} [${level}] ${message}\n`;
      fs.appendFileSync(this.logFile, line, "utf8");
    } catch (err) {
      // Ne pas bloquer si échec d'écriture
      console.error("Erreur écriture log fichier:", err);
    }
  }

  log(message) {
    this.write("log", message);
  }

  warn(message) {
    this.write("warn", message);
  }

  error(message) {
    this.write("error", message);
  }

  action(message) {
    this.write("action", message);
  }
}

module.exports = new FileLogger();
