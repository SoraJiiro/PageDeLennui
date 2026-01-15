const util = require("util");

function stripAnsi(input) {
  try {
    return String(input).replace(/\x1b\[[0-9;]*m/gu, "");
  } catch {
    return String(input);
  }
}

function setupAdminLogBridge(io, fileLogger) {
  const levels = ["log", "warn", "error"];

  if (!io._serverLogBuffer) io._serverLogBuffer = [];
  const MAX_LOGS = 500;

  levels.forEach((lvl) => {
    const original = console[lvl].bind(console);
    console[lvl] = (...args) => {
      let logLevel = lvl;
      let logMessage = "";
      let displayInConsole = true;

      if (
        args.length === 1 &&
        typeof args[0] === "object" &&
        args[0] !== null &&
        "level" in args[0] &&
        "message" in args[0]
      ) {
        logLevel = args[0].level;
        logMessage = String(args[0].message);
        displayInConsole = false;
      } else {
        const formatted = util.format(
          ...args.map((a) =>
            typeof a === "string" ? a : util.inspect(a, { colors: false })
          )
        );
        logMessage = stripAnsi(formatted);
      }

      if (displayInConsole) {
        original(...args);
      } else {
        original(logMessage);
      }

      try {
        const payload = {
          level: logLevel,
          message: logMessage,
          at: new Date().toISOString(),
        };

        io._serverLogBuffer.push(payload);
        if (io._serverLogBuffer.length > MAX_LOGS) {
          io._serverLogBuffer.splice(0, io._serverLogBuffer.length - MAX_LOGS);
        }

        io.to("admins").emit("server:log", payload);

        fileLogger.write(logLevel, logMessage);
      } catch (_) {
        // ne pas bloquer les logs
      }
    };
  });
}

module.exports = { setupAdminLogBridge };
