const path = require("path");
const chokidar = require("chokidar");

function setupAutoReload(io, config) {
  let reloadTimer = null;

  const watcher = chokidar.watch(config.PUBLIC, {
    ignoreInitial: true,
    ignored: null,
  });

  watcher.on("all", (_, filePath) => {
    const relativePath = path.relative(config.PUBLIC, filePath);
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      console.log({
        level: "action",
        message: `[!] Fichier modifié - Public\\${relativePath}`,
      });
      io.emit("reload", { file: relativePath });
    }, 500);
  });

  console.log("\n[AUTO RELOAD : OK]\n");
}

module.exports = { setupAutoReload };
