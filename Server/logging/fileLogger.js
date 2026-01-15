const fs = require("fs");
const path = require("path");
const config = require("../config");

class FileLogger {
  constructor(logDir = config.DATA) {
    this.logDir = logDir;
    this.logFile = path.join(logDir, "server.txt");

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

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
