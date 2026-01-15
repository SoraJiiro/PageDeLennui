function setupShutdown() {
  process.on("SIGINT", () => {
    console.log("\n\n>> Arrêt du serveur...");
    process.exit(0);
  });
}

module.exports = { setupShutdown };
