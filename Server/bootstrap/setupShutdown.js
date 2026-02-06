function setupShutdown() {
  const { requestShutdown } = require("./shutdownManager");

  const handler = (sig) => {
    try {
      console.log(`\n\n>> Arrêt du serveur (${sig})...`);
    } catch (e) {}
    requestShutdown(sig);
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
}

module.exports = { setupShutdown };
