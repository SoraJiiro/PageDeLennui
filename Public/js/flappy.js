import { showNotif, keys, toggleScrollLock, requestPassword } from "./util.js";
import { openSearchNoSocket } from "./util.js";

export function initFlappy(socket) {
  // ---------- Cache UI ----------
  const ui = {
    canvas: document.getElementById("flappyCanvas"),
    ctx: null,
    startBtn: document.getElementsByClassName("flappyStartBtn")[0],
    stopBtn: document.getElementsByClassName("flappyStopBtn")[0],
    resetBtn: document.querySelector(".flappyResetBtn"),
    scoreEl: document.getElementById("flappyScore"),
    reviveOverlay: document.querySelector(".flappy-revive-overlay"),
    revivePrice: document.querySelector(".flappy-cost"),
    reviveBtn: document.querySelector(".flappy-revive-btn"),
    reviveCount: document.querySelector(".flappy-revive-count"),
    cancelBtn: document.querySelector(".flappy-cancel-btn"),
  };
  if (!ui.canvas) return;
  ui.ctx = ui.canvas.getContext("2d");
  if (ui.scoreEl) ui.scoreEl.style.display = "none";
  // ---------- Variables de jeu (échelle dynamique) (déclarées tôt pour éviter TDZ) ----------
  let gravity, jump, pipeGap, pipeWidth, pipeSpeed;
  let birdY, birdVel, pipes, score, gameRunning;
  let gameOverScreen = false;
  let resumeScore = null;
  let revivesUsed = 0;
  let availableReviveLives = 0;
  let paused = false;
  let countdown = 0;
  let frameCount = 0;
  let pauseKeyText = (keys && keys.default && keys.default[0]) || "P";
  let uiColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--primary-color")
      .trim() || "#00ff00";

  try {
    window.addEventListener("uiColor:changed", (e) => {
      if (e.detail && e.detail.color) {
        uiColor = e.detail.color;
      }
    });
  } catch {}

  function resizeCanvas() {
    try {
      const ratio = window.devicePixelRatio || 1;
      const stage = document.getElementById("stage6");
      const wrap = ui.canvas.closest(".flappy-wrap");
      const wrapRect = wrap
        ? wrap.getBoundingClientRect()
        : ui.canvas.getBoundingClientRect();
      if (!wrapRect.width) return;

      const availableW = Math.max(220, Math.round(wrapRect.width));
      const stageRect = stage ? stage.getBoundingClientRect() : null;
      const availableH = Math.max(
        160,
        Math.round(
          (stageRect && stageRect.height
            ? stageRect.height
            : window.innerHeight) - 215,
        ),
      );

      const cssW = availableW;
      const cssH = Math.max(
        140,
        Math.min(Math.round((cssW * 9) / 16), availableH),
      );

      ui.canvas.style.width = `${cssW}px`;
      ui.canvas.style.height = `${cssH}px`;

      const displayWidth = Math.floor(cssW * ratio);
      const displayHeight = Math.floor(cssH * ratio);

      if (
        ui.canvas.width !== displayWidth ||
        ui.canvas.height !== displayHeight
      ) {
        ui.canvas.width = displayWidth;
        ui.canvas.height = displayHeight;
      }

      if (ui.ctx && typeof ui.ctx.setTransform === "function") {
        ui.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    } catch (e) {}

    updateScales();

    // Le resize efface le canvas: redessiner l'écran d'accueil si aucune run active
    if (!gameRunning && !gameOverScreen) {
      drawStartScreen();
    }
  }

  resizeCanvas();
  let _resizeTO = null;
  window.addEventListener("resize", () => {
    try {
      clearTimeout(_resizeTO);
      _resizeTO = setTimeout(() => resizeCanvas(), 120);
    } catch (e) {}
  });
  window.addEventListener("pde:section-activated", (e) => {
    try {
      const sectionId = e && e.detail ? e.detail.sectionId : null;
      if (sectionId !== "stage6") return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resizeCanvas();
          if (!gameRunning && !gameOverScreen) {
            drawStartScreen();
          }
        });
      });
    } catch {}
  });
  try {
    window.addEventListener("pauseKey:changed", (e) => {
      const k = e?.detail?.key;
      if (typeof k === "string" && k.length === 1) {
        pauseKeyText = k.toUpperCase();
      }
    });
  } catch {}
  let myName = null;
  let myBest = 0;
  let globalBestScore = 0;
  let scoreAttente = null;

  function normalizeLives(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function requestReviveLives() {
    try {
      socket.emit("revive:getLives");
    } catch {}
  }

  function computeRevivePrice() {
    const base = 3000;
    const multiplier = 35;
    const escalation = 1 + revivesUsed * 0.5;
    let price = Math.floor(base + score * multiplier * escalation);
    price = Math.max(3000, Math.min(1800000, price));
    return price;
  }

  function updateReviveOverlayContent() {
    if (!ui.reviveOverlay || ui.reviveOverlay.style.display !== "block") return;
    const remainingRevives = 3 - revivesUsed;
    if (ui.reviveCount) ui.reviveCount.textContent = remainingRevives;

    const hasShopLife = availableReviveLives > 0;
    const price = computeRevivePrice();
    let modeEl = ui.reviveOverlay.querySelector(".flappy-revive-mode");
    if (!modeEl) {
      modeEl = document.createElement("p");
      modeEl.className = "flappy-revive-mode";
      modeEl.style.color = "#fff";
      modeEl.style.marginBottom = "10px";
      modeEl.style.fontSize = "0.95rem";
      const priceEl = ui.reviveOverlay.querySelector(".flappy-revive-price");
      if (priceEl && priceEl.parentNode) {
        priceEl.parentNode.insertBefore(modeEl, priceEl);
      }
    }
    if (modeEl) {
      modeEl.textContent = hasShopLife
        ? "Choix: vie du shop ou paiement en monnaie"
        : "Choix: paiement en monnaie";
    }

    let payBtnEl = ui.reviveOverlay.querySelector(".flappy-revive-pay-btn");
    if (!payBtnEl) {
      payBtnEl = document.createElement("button");
      payBtnEl.className = "flappy-revive-pay-btn";
      payBtnEl.style.display = "none";
      payBtnEl.style.marginTop = "8px";
      payBtnEl.style.padding = "8px 12px";
      payBtnEl.style.cursor = "pointer";
      payBtnEl.style.background = "transparent";
      payBtnEl.style.border = "1px solid #fff";
      payBtnEl.style.color = "#fff";
      const cancelBtn = ui.reviveOverlay.querySelector(".flappy-cancel-btn");
      if (cancelBtn && cancelBtn.parentNode) {
        cancelBtn.parentNode.insertBefore(payBtnEl, cancelBtn);
      }
    }

    if (ui.revivePrice) {
      ui.revivePrice.textContent = hasShopLife
        ? "0"
        : price.toLocaleString("fr-FR");
    }

    if (ui.reviveBtn) {
      ui.reviveBtn.innerHTML = hasShopLife
        ? `Utiliser 1 vie (<span class="flappy-revive-count">${remainingRevives}</span> restants)`
        : `Payer ${price
            .toLocaleString("fr-FR")
            .replace(
              /\s/g,
              "\u00a0",
            )} monnaie (<span class="flappy-revive-count">${remainingRevives}</span> restants)`;
      ui.reviveBtn.onclick = () => {
        socket.emit("flappy:payToContinue", {
          price,
          mode: hasShopLife ? "life" : "pay",
        });
        toggleScrollLock(false);
      };
    }

    if (payBtnEl) {
      if (hasShopLife) {
        payBtnEl.style.display = "block";
        payBtnEl.disabled = false;
        payBtnEl.style.opacity = "1";
        payBtnEl.style.cursor = "pointer";
        payBtnEl.textContent = `Payer ${price
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")} monnaie (${remainingRevives} restants)`;
        payBtnEl.onclick = () => {
          socket.emit("flappy:payToContinue", { price, mode: "pay" });
          toggleScrollLock(false);
        };
      } else {
        payBtnEl.style.display = "block";
        payBtnEl.disabled = true;
        payBtnEl.style.opacity = "0.6";
        payBtnEl.style.cursor = "default";
        payBtnEl.textContent = "Pas de vie disponible";
        payBtnEl.onclick = null;
      }
    }
  }

  socket.on("you:name", (name) => (myName = name));
  socket.on("flappy:leaderboard", (arr) => {
    if (!Array.isArray(arr) || !myName) return;
    if (arr.length > 0) {
      globalBestScore = Number(arr[0].score) || 0;
    }
    const me = arr.find((e) => e.pseudo === myName);
    const prev = myBest;
    myBest = me ? Number(me.score) || 0 : 0;
    if (scoreAttente != null && myBest >= scoreAttente && myBest > prev) {
      showNotif(
        `🐤 Nouveau record ! Score: ${myBest
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}`,
      );
      scoreAttente = null;
    }
  });

  socket.on("revive:lives", ({ lives } = {}) => {
    availableReviveLives = normalizeLives(lives);
    updateReviveOverlayContent();
  });

  function updateScales() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round(ui.canvas.width / dpr);
    const cssH = Math.round(ui.canvas.height / dpr);
    if (!cssW || !cssH) return;

    gravity = cssH * 0.00035;
    jump = -cssH * 0.009;
    pipeGap = cssH * 0.25;
    pipeWidth = cssW * 0.08;
    pipeSpeed = cssW * 0.0035;
  }

  const bird = {
    xRatio: 0.17, // position horizontale relative
    radiusRatio: 0.02, // taille relative
    get x() {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.round(ui.canvas.width / dpr);
      return this.xRatio * cssW;
    },
    get radius() {
      const dpr = window.devicePixelRatio || 1;
      const cssH = Math.round(ui.canvas.height / dpr);
      return this.radiusRatio * cssH;
    },
    draw() {
      ui.ctx.fillStyle = uiColor;
      ui.ctx.beginPath();
      ui.ctx.arc(this.x, birdY, this.radius, 0, Math.PI * 2);
      ui.ctx.fill();
    },
  };

  function drawStartScreen() {
    try {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.round(ui.canvas.width / dpr);
      const cssH = Math.round(ui.canvas.height / dpr);
      if (!cssW || !cssH) return;

      ui.ctx.fillStyle = "#000";
      ui.ctx.fillRect(0, 0, cssW, cssH);

      ui.ctx.fillStyle = uiColor;
      ui.ctx.textAlign = "center";
      ui.ctx.font = "bold 42px monospace";
      ui.ctx.fillText("FLAPPY", cssW / 2, Math.floor(cssH * 0.36));

      ui.ctx.font = "18px monospace";
      ui.ctx.fillText(
        "Clique sur Démarrer ou appuie sur ESPACE",
        cssW / 2,
        Math.floor(cssH * 0.54),
      );

      let hasResumeLine = false;
      if (resumeScore != null && Number(resumeScore) > 0) {
        const s = Math.floor(Number(resumeScore) || 0);
        if (s > 0) {
          ui.ctx.font = "16px monospace";
          ui.ctx.fillText(
            `Reprise au score : ${s
              .toLocaleString("fr-FR")
              .replace(/\s/g, "\u00a0")}`,
            cssW / 2,
            Math.floor(cssH * 0.6),
          );
          hasResumeLine = true;
        }
      }

      ui.ctx.font = "14px monospace";
      ui.ctx.fillText(
        `Pause: ${pauseKeyText}`,
        cssW / 2,
        Math.floor(cssH * (hasResumeLine ? 0.7 : 0.64)),
      );
    } catch {}
  }

  function resetGame() {
    resizeCanvas();

    const dpr = window.devicePixelRatio || 1;
    const cssH = Math.round(ui.canvas.height / dpr);
    birdY = cssH / 3.55;
    birdVel = 0;
    pipes = [];
    if (resumeScore != null) {
      score = Math.max(0, Math.floor(Number(resumeScore) || 0));
      resumeScore = null;
      try {
        socket.emit("flappy:resumeConsumed");
      } catch (e) {}
    } else {
      score = 0;
    }
    gameRunning = true;
    gameOverScreen = false;
    revivesUsed = 0;
    if (ui.reviveOverlay) {
      ui.reviveOverlay.style.display = "none";
      toggleScrollLock(false);
    }
    paused = false;
    countdown = 0;
    frameCount = 0;
    ui.startBtn.style.display = "none";
    if (ui.stopBtn) ui.stopBtn.style.display = "inline-block";
  }

  function pauseForStageNavigation() {
    if (!gameRunning) return { running: false, pausedNow: false };
    if (paused || countdown > 0) return { running: true, pausedNow: false };

    paused = true;
    try {
      if (socket) {
        socket.emit("flappy:score", { score, final: false });
        scoreAttente = score;
      }
    } catch {}
    return { running: true, pausedNow: true };
  }

  function resumeAfterNavCancel() {
    if (paused && countdown === 0) {
      countdown = 3;
      frameCount = 0;
    }
  }

  function clearToBlack() {
    try {
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.round(ui.canvas.width / dpr);
      const cssH = Math.round(ui.canvas.height / dpr);
      ui.ctx.fillStyle = "#000";
      ui.ctx.fillRect(0, 0, cssW, cssH);
    } catch {}
  }

  function drawPipes() {
    ui.ctx.fillStyle = uiColor;
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round(ui.canvas.width / dpr);
    const cssH = Math.round(ui.canvas.height / dpr);
    pipes.forEach((p) => {
      // Tuyau haut
      ui.ctx.fillRect(p.x, 0, pipeWidth, p.top);
      // Tuyau bas
      ui.ctx.fillRect(
        p.x,
        p.top + pipeGap,
        pipeWidth,
        cssH - (p.top + pipeGap),
      );
    });
  }

  function showPaused() {
    ui.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round(ui.canvas.width / dpr);
    const cssH = Math.round(ui.canvas.height / dpr);
    ui.ctx.fillRect(0, 0, cssW, cssH);

    ui.ctx.fillStyle = uiColor;
    ui.ctx.font = "bold 40px monospace";
    ui.ctx.textAlign = "center";

    if (countdown > 0) {
      ui.ctx.fillText(countdown.toString(), cssW / 2, cssH / 2);
    } else {
      ui.ctx.fillText("PAUSE", cssW / 2, cssH / 2);
      ui.ctx.font = "18px monospace";
      ui.ctx.fillText(
        `Appuie sur ${pauseKeyText} pour reprendre`,
        cssW / 2,
        cssH / 2 + 40,
      );
    }
  }

  function update() {
    if (!gameRunning) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round(ui.canvas.width / dpr);
    const cssH = Math.round(ui.canvas.height / dpr);

    // Gestion du compte à rebours
    if (countdown > 0) {
      frameCount++;

      drawPipes();
      bird.draw();

      showPaused();

      if (frameCount % 60 === 0) {
        countdown--;
        if (countdown === 0) {
          paused = false;
        }
      }

      requestAnimationFrame(update);
      return;
    }

    if (paused) {
      showPaused();
      requestAnimationFrame(update);
      return;
    }

    ui.ctx.clearRect(0, 0, cssW, cssH);
    ui.ctx.fillStyle = "#000";
    ui.ctx.fillRect(0, 0, cssW, cssH);

    birdVel += gravity;
    birdY += birdVel;

    if (pipes.length === 0 || pipes[pipes.length - 1].x < cssW * 0.65) {
      const topHeight = Math.random() * (cssH - pipeGap - 100) + 40;
      pipes.push({ x: cssW, top: topHeight, passed: false });
    }

    pipes.forEach((p) => {
      // Tuyau passé
      p.x -= pipeSpeed;
      if (!p.passed && p.x + pipeWidth < bird.x - bird.radius) {
        score++;
        p.passed = true;
      }
    });

    pipes = pipes.filter((p) => p.x + pipeWidth > 0);

    drawPipes();
    bird.draw();

    // ---------- Collisions ----------
    for (const p of pipes) {
      if (
        bird.x + bird.radius > p.x &&
        bird.x - bird.radius < p.x + pipeWidth &&
        (birdY - bird.radius < p.top || birdY + bird.radius > p.top + pipeGap)
      ) {
        gameOver();
      }
    }

    if (birdY + bird.radius >= cssH || birdY - bird.radius <= 0) {
      gameOver();
    }

    // ---------- Score ----------
    ui.ctx.fillStyle = uiColor;
    ui.ctx.font = "bold 24px monospace";
    ui.ctx.textAlign = "right";
    ui.ctx.fillText(
      `${score.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")}`,
      cssW - 20,
      30,
    );
    requestAnimationFrame(update);
  }

  function gameOver() {
    gameRunning = false;
    gameOverScreen = true;
    ui.startBtn.style.display = "block";
    ui.startBtn.textContent = "Rejouer";
    if (ui.stopBtn) ui.stopBtn.style.display = "none";
    showGameOver();
    if (socket) socket.emit("flappy:score", { score, final: true });
    scoreAttente = score; // attendre confirmation serveur via leaderboard
  }

  function showGameOver() {
    // Overlay sombre
    ui.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round(ui.canvas.width / dpr);
    const cssH = Math.round(ui.canvas.height / dpr);
    ui.ctx.fillRect(0, 0, cssW, cssH);

    // Texte
    ui.ctx.fillStyle = uiColor;
    ui.ctx.font = "bold 40px monospace";
    ui.ctx.textAlign = "center";
    ui.ctx.fillText("GAME OVER", cssW / 2, cssH / 2 - 20);

    ui.ctx.font = "20px monospace";
    ui.ctx.fillText(
      `Score: ${score.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")}`,
      cssW / 2,
      cssH / 2 + 20,
    );

    ui.ctx.font = "18px monospace";
    ui.ctx.fillText("Appuie sur ESPACE pour rejouer", cssW / 2, cssH / 2 + 60);

    // --- Logique de réanimation ---
    if (revivesUsed < 3) {
      if (ui.reviveOverlay) {
        ui.reviveOverlay.style.display = "block";
        toggleScrollLock(true);
        updateReviveOverlayContent();
        requestReviveLives();
        if (ui.cancelBtn) {
          ui.cancelBtn.onclick = () => {
            ui.reviveOverlay.style.display = "none";
            toggleScrollLock(false);
          };
        }
      }
    } else {
      if (ui.reviveOverlay) {
        ui.reviveOverlay.style.display = "none";
        toggleScrollLock(false);
      }
    }
  }

  socket.on("flappy:reviveSuccess", ({ usedLife, remainingLives } = {}) => {
    gameRunning = true;
    revivesUsed++;
    if (typeof remainingLives !== "undefined") {
      availableReviveLives = normalizeLives(remainingLives);
    }
    if (ui.reviveOverlay) {
      ui.reviveOverlay.style.display = "none";
      toggleScrollLock(false);
    }

    // Réinitialiser la position de l'oiseau
    birdY = ui.canvas.height / 2;
    birdVel = 0;

    // Vider les tuyaux pour un départ sûr
    pipes = [];

    // Reprendre la boucle
    update();
    showNotif(
      usedLife
        ? `Partie continuée ! (vie restante: ${availableReviveLives})`
        : "Partie continuée !",
    );
  });

  socket.on("flappy:reviveError", (msg) => {
    showNotif(msg || "Erreur lors du paiement");
  });

  // ---------- Eventlisteners ----------
  socket.on("flappy:resume", ({ score }) => {
    const s = Math.floor(Number(score) || 0);
    if (!Number.isFinite(s) || s <= 0) return;
    resumeScore = s;

    // Si on est sur l'écran d'accueil, l'actualiser
    if (!gameRunning && !gameOverScreen) {
      drawStartScreen();
    }
  });

  socket.on("system:shutdown:collectProgress", () => {
    try {
      if (!socket) return;
      // Si une run est active, pousser le score courant pour snapshot
      if (gameRunning) {
        socket.emit("flappy:progress", { score });
      }
    } catch (e) {}
  });

  // Même logique qu'au shutdown, mais pour un refresh/fermeture onglet (best-effort)
  function pushProgressOnLeave() {
    try {
      if (!socket) return;
      if (gameRunning) socket.emit("flappy:progress", { score });
    } catch (e) {}
  }

  try {
    window.addEventListener("pagehide", pushProgressOnLeave);
    window.addEventListener("beforeunload", pushProgressOnLeave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") pushProgressOnLeave();
    });
  } catch (e) {}

  document.addEventListener("keydown", (e) => {
    // Fermer l'overlay de réanimation avec Echap
    if (e.key === "Escape") {
      if (ui.reviveOverlay && ui.reviveOverlay.style.display === "block") {
        ui.reviveOverlay.style.display = "none";
        toggleScrollLock(false);
      }
    }

    const active = document.activeElement;
    const tag = active && active.tagName;
    const isTyping =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (active && active.isContentEditable);
    if (isTyping) return;

    // Vérifier que la section Flappy (stage6) est visible
    const flappySection = document.getElementById("stage6");
    if (!flappySection) return;
    const rect = flappySection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (!isVisible) return;

    if (keys.default.includes(e.key)) {
      e.preventDefault();
      // Ne pas permettre la pause si le jeu n'est pas en cours
      if (!gameRunning) return;

      if (paused && countdown === 0) {
        // Reprendre avec compte à rebours
        countdown = 3;
        frameCount = 0;
      } else if (!paused && countdown === 0) {
        // Mettre en pause
        paused = true;
        try {
          if (socket) {
            socket.emit("flappy:score", { score, final: false });
            scoreAttente = score;
          }
        } catch {}
        try {
          openSearchNoSocket();
        } catch {}
      }
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      // Empêcher les actions pendant la pause
      if (paused || countdown > 0) return;

      if (gameRunning) {
        birdVel = jump;
      } else {
        // Restart avec espace quand game over
        resetGame();
        update();
      }
    }
  });

  ui.startBtn.addEventListener("click", () => {
    resetGame();
    update();
  });

  window.addEventListener("pde:stage-nav-guard", (e) => {
    const detail = e && e.detail ? e.detail : null;
    if (!detail || detail.stageId !== "stage6") return;

    if (detail.action === "pause") {
      const result = pauseForStageNavigation();
      detail.running = !!result.running;
      detail.pausedNow = !!result.pausedNow;
    }

    if (detail.action === "resume") {
      resumeAfterNavCancel();
    }
  });

  ui.stopBtn?.addEventListener("click", () => {
    if (!gameRunning) return;
    const sent = score;
    if (socket) socket.emit("flappy:score", { score: sent, final: true });
    // Réinitialiser l'état de la run sans relancer
    gameRunning = false;
    paused = false;
    countdown = 0;
    frameCount = 0;
    pipes = [];
    if (ui.stopBtn) ui.stopBtn.style.display = "none";
    // Afficher l'écran d'accueil
    gameOverScreen = false;
    drawStartScreen();
    // Afficher le bouton pour rejouer
    ui.startBtn.style.display = "block";
    ui.startBtn.textContent = "Rejouer";
    showNotif(`# Partie stoppée.`);
  });

  // ---------- Reset (confirm + password) ----------
  ui.resetBtn?.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir réinitialiser ton score Flappy ?\nTon meilleur score sera définitivement perdu !",
    );
    if (!confirmReset) return;

    const password = await requestPassword();
    if (!password) {
      showNotif("❌ Réinitialisation annulée");
      return;
    }

    try {
      const res = await fetch("/api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotif("❌ Mot de passe incorrect !");
        return;
      }
      socket.emit("flappy:reset");
      showNotif("🔄 Score Flappy réinitialisé avec succès !");
      myBest = 0;
      scoreAttente = null;
    } catch (err) {
      showNotif("⚠️ Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  });

  // ---------- Init UI ----------
  gameRunning = false;
  gameOverScreen = false;
  ui.startBtn.style.display = "block";
  if (ui.stopBtn) ui.stopBtn.style.display = "none";

  // Écran d'accueil au chargement
  resizeCanvas();
  drawStartScreen();
}
