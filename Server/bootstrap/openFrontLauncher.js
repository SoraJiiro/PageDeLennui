const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

let openFrontChild = null;
let shutdownInProgress = false;

function getOpenFrontRoot() {
  return path.resolve(__dirname, "../../..", "OpenFront");
}

function getOpenFrontEnv() {
  return {
    ...process.env,
    VITE_HOST: "lan",
    SKIP_BROWSER_OPEN: "true",
    GAME_ENV: "dev",
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    API_KEY: "WARNING_DEV_API_KEY_DO_NOT_USE_IN_PRODUCTION",
    ADMIN_BOT_API_KEY: "WARNING_DEV_ADMIN_BOT_KEY_DO_NOT_USE_IN_PRODUCTION",
    DOMAIN: "localhost",
    GIT_COMMIT: "DEV",
    PDE_BRIDGE_URL:
      process.env.PDE_BRIDGE_URL ||
      "http://192.168.197.13:7750/api/integrations/openfront/events",
    OPENFRONT_BRIDGE_SECRET:
      process.env.OPENFRONT_BRIDGE_SECRET ||
      "change-this-openfront-bridge-secret",
  };
}

function startOpenFront() {
  if (shutdownInProgress || openFrontChild) return openFrontChild;

  const openFrontRoot = getOpenFrontRoot();
  const packageJsonPath = path.join(openFrontRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.warn(
      `[OpenFront] dossier introuvable à ${openFrontRoot}. Lancement automatique ignoré.`,
    );
    return null;
  }

  const runOptions = {
    cwd: openFrontRoot,
    env: getOpenFrontEnv(),
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  };

  if (process.platform === "win32") {
    openFrontChild = spawn(
      "cmd.exe",
      ["/c", "npm.cmd", "run", "dev:host"],
      runOptions,
    );
  } else {
    openFrontChild = spawn("npm", ["run", "dev:host"], runOptions);
  }

  if (openFrontChild && typeof openFrontChild.unref === "function") {
    openFrontChild.unref();
  }

  openFrontChild.on("error", (err) => {
    console.error("[OpenFront] échec du lancement:", err);
    openFrontChild = null;
  });

  openFrontChild.on("exit", (code, signal) => {
    console.log(
      `[OpenFront] terminé (code=${code}, signal=${signal || "none"})`,
    );
    openFrontChild = null;
  });

  console.log(`[OpenFront] lancé depuis ${openFrontRoot}`);
  return openFrontChild;
}

function shutdownOpenFront() {
  if (!openFrontChild || shutdownInProgress) return;
  shutdownInProgress = true;

  try {
    const pid = openFrontChild.pid;
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.unref();
    } else if (pid) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        openFrontChild.kill("SIGTERM");
      }
    }
  } catch (err) {
    try {
      openFrontChild.kill("SIGTERM");
    } catch {}
  }

  openFrontChild = null;
}

process.on("exit", () => {
  if (openFrontChild) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(openFrontChild.pid), "/T", "/F"], {
          stdio: "ignore",
        }).unref();
      } else if (openFrontChild.pid) {
        try {
          process.kill(-openFrontChild.pid, "SIGTERM");
        } catch {}
      }
    } catch {}
  }
});

module.exports = {
  startOpenFront,
  shutdownOpenFront,
};
