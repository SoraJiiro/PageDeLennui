let ctx = null;
let shutdownStarted = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function registerShutdownContext(nextCtx) {
  ctx = nextCtx;
}

function isReady() {
  return !!(ctx && ctx.io && ctx.server && ctx.FileService);
}

function safeNumber(n) {
  const v = Math.floor(Number(n) || 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function mergeProgressIntoResume(resume, pseudo, game, score) {
  const s = safeNumber(score);
  if (!pseudo || !game || s <= 0) return;

  if (!resume[pseudo]) resume[pseudo] = { at: new Date().toISOString() };
  if (!resume[pseudo].at) resume[pseudo].at = new Date().toISOString();

  // On garde le max au cas où plusieurs updates arrivent
  const prev = safeNumber(resume[pseudo][game]);
  if (s > prev) resume[pseudo][game] = s;
}

function collectRunnerProgressFromSockets(io) {
  const resume = {};
  try {
    io.sockets.sockets.forEach((s) => {
      const pseudo = s?.data?.pseudo;
      if (!pseudo) return;

      // Score runtime explicit (envoyé par le client)
      const rp = s.data.runnerProgress || {};
      if (rp && typeof rp === "object") {
        mergeProgressIntoResume(resume, pseudo, "dino", rp.dino);
        mergeProgressIntoResume(resume, pseudo, "flappy", rp.flappy);
        mergeProgressIntoResume(resume, pseudo, "snake", rp.snake);
        mergeProgressIntoResume(resume, pseudo, "2048", rp["2048"]);
        mergeProgressIntoResume(resume, pseudo, "blockblast", rp.blockblast);
      }

      // Fallback: reviveContext contient au moins le dernier score envoyé
      const rc = s.data.reviveContext || {};
      if (rc && typeof rc === "object") {
        mergeProgressIntoResume(resume, pseudo, "dino", rc?.dino?.lastScore);
        mergeProgressIntoResume(
          resume,
          pseudo,
          "flappy",
          rc?.flappy?.lastScore,
        );
        mergeProgressIntoResume(resume, pseudo, "snake", rc?.snake?.lastScore);
        mergeProgressIntoResume(
          resume,
          pseudo,
          "2048",
          rc?.["2048"]?.lastScore,
        );
        mergeProgressIntoResume(
          resume,
          pseudo,
          "blockblast",
          rc?.blockblast?.lastScore,
        );
      }
    });
  } catch (e) {
    // best-effort
  }
  return resume;
}

function cleanupResumeExpired(existing, maxAgeMs) {
  const now = Date.now();
  const out = {};
  for (const [pseudo, entry] of Object.entries(existing || {})) {
    const at = Date.parse(entry?.at || "");
    if (!Number.isFinite(at)) continue;
    if (now - at > maxAgeMs) continue;
    out[pseudo] = entry;
  }
  return out;
}

function refundBlackjackIfNeeded({ blackjackGame, FileService, io }) {
  if (!blackjackGame || !blackjackGame.gameStarted) return 0;

  // En phase payout, les gains (stake + profit cap) sont déjà crédités via onRoundEnd.
  if (blackjackGame.phase === "payout") return 0;
  if (blackjackGame.phase === "lobby") return 0;

  let refunded = 0;
  try {
    blackjackGame.joueurs.forEach((p) => {
      const stake = safeNumber(p?.bet);
      if (stake <= 0) return;
      const pseudo = p.pseudo;
      FileService.data.clicks[pseudo] = safeNumber(
        FileService.data.clicks[pseudo],
      );
      FileService.data.clicks[pseudo] += stake;
      refunded += stake;

      try {
        io.to("user:" + pseudo).emit("clicker:you", {
          score: FileService.data.clicks[pseudo],
        });
      } catch (e) {}

      try {
        const sock = io.sockets.sockets.get(p.socketId);
        if (sock) {
          sock.emit("system:notification", {
            message: `🧾 Remboursement Blackjack: +${stake.toLocaleString("fr-FR")} clicks (shutdown)`,
            duration: 8000,
          });
        }
      } catch (e) {}
    });

    if (refunded > 0) {
      FileService.save("clicks", FileService.data.clicks);
    }
  } catch (e) {
    // best-effort
  }

  try {
    blackjackGame.resetGame();
    io.emit("blackjack:state", blackjackGame.getState());
  } catch (e) {}

  return refunded;
}

function refundMashIfNeeded({ mashGame }) {
  if (!mashGame) return false;
  try {
    if (mashGame.gameState && mashGame.gameState !== "waiting") {
      mashGame.terminateGame("shutdown");
      return true;
    }
    // Si gameState absent, on tente quand même d'annuler si des paris existent
    if (Array.isArray(mashGame.bets) && mashGame.bets.length > 0) {
      mashGame.terminateGame("shutdown");
      return true;
    }
  } catch (e) {
    // best-effort
  }
  return false;
}

async function requestShutdown(reason = "unknown") {
  if (shutdownStarted) return;
  shutdownStarted = true;

  if (!isReady()) {
    console.error("[Shutdown] contexte non initialisé, exit direct");
    process.exit(0);
    return;
  }

  const { io, server, FileService, getRuntimeGames } = ctx;

  console.log({
    level: "warn",
    message: `[Shutdown] démarrage arrêt gracieux (reason=${reason})`,
  });

  // 1) Demander aux clients de pousser leur score en cours (Flappy/Dino)
  try {
    io.emit("system:shutdown:collectProgress");
  } catch (e) {}

  // 2) Laisser un court délai pour récolter les events
  await sleep(1000);

  // 3) Snapshot runner progress -> fichier
  try {
    const existing = cleanupResumeExpired(
      FileService.data.runnerResume || {},
      60 * 60 * 1000,
    );
    const collected = collectRunnerProgressFromSockets(io);

    const merged = { ...existing };
    for (const [pseudo, entry] of Object.entries(collected)) {
      if (!merged[pseudo]) merged[pseudo] = entry;
      else {
        // merge max scores
        merged[pseudo].at = merged[pseudo].at || entry.at;
        if (entry.dino)
          merged[pseudo].dino = Math.max(
            safeNumber(merged[pseudo].dino),
            safeNumber(entry.dino),
          );
        if (entry.flappy)
          merged[pseudo].flappy = Math.max(
            safeNumber(merged[pseudo].flappy),
            safeNumber(entry.flappy),
          );
        if (entry.snake)
          merged[pseudo].snake = Math.max(
            safeNumber(merged[pseudo].snake),
            safeNumber(entry.snake),
          );
        if (entry["2048"])
          merged[pseudo]["2048"] = Math.max(
            safeNumber(merged[pseudo]["2048"]),
            safeNumber(entry["2048"]),
          );
        if (entry.blockblast)
          merged[pseudo].blockblast = Math.max(
            safeNumber(merged[pseudo].blockblast),
            safeNumber(entry.blockblast),
          );
      }
    }

    FileService.save("runnerResume", merged);
  } catch (e) {
    console.error("[Shutdown] snapshot runnerResume error", e);
  }

  // 4) Rembourser les jeux d'argent en cours
  try {
    const games =
      (typeof getRuntimeGames === "function" && getRuntimeGames()) || {};
    refundBlackjackIfNeeded({
      blackjackGame: games.blackjackGame,
      FileService,
      io,
    });
    refundMashIfNeeded({ mashGame: games.mashGame });
  } catch (e) {
    console.error("[Shutdown] refund error", e);
  }

  // 5) Rediriger tout le monde vers la page fermée
  try {
    io.emit("system:redirect", "/ferme.html");
  } catch (e) {}

  // 6) Stopper sockets + serveur HTTP proprement
  try {
    await sleep(250);
    try {
      io.close();
    } catch (e) {}

    await new Promise((resolve) => {
      server.close(() => resolve());
      // fallback timeout
      setTimeout(resolve, 1500);
    });
  } catch (e) {
    // ignore
  }

  // 7) Exit
  process.exit(0);
}

module.exports = {
  registerShutdownContext,
  requestShutdown,
};
