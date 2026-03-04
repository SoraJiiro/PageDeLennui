import {
  showNotif,
  keys,
  toggleScrollLock,
  requestPassword,
  openSearchNoSocket,
} from "./util.js";

export function initDino(socket) {
  // ---------- Cache UI ----------
  const ui = {
    canvas: document.querySelector(".game"),
    startBtn: document.querySelector(".dino-start"),
    stopBtn: document.querySelector(".dino-stop"),
    resetBtn: document.querySelector(".dino-reset"),
    yourScoreEl: document.getElementById("your-score"),
    reviveOverlay: document.querySelector(".dino-revive-overlay"),
    revivePrice: document.querySelector(".dino-cost"),
    reviveBtn: document.querySelector(".dino-revive-btn"),
    reviveCount: document.querySelector(".dino-revive-count"),
    cancelBtn: document.querySelector(".dino-cancel-btn"),
  };
  if (!ui.canvas) return;
  const c = ui.canvas.getContext("2d");
  if (ui.yourScoreEl) ui.yourScoreEl.textContent = "0";

  // ---------- Constantes Gameplay ----------
  const GRAVITY_ASCENT = 0.8;
  const GRAVITY_DESCENT = 1.35;
  const MIN_JUMP_VELOCITY = 19;
  const MAX_JUMP_VELOCITY = 20;
  const INITIAL_SPEED = 6;
  const SPEED_INCREMENT = 0.22;
  const MAX_SPEED = 18;
  const MIN_OBSTACLE_DISTANCE = 310;
  const MAX_OBSTACLE_DISTANCE = 610;
  const OBSTACLES_BETWEEN_SPEED_UP = 3;
  const CACTUS_SPACING = 32;

  // ---------- Etat local ----------
  const state = {
    gameSpeed: INITIAL_SPEED,
    score: 0,
    gameOver: false,
    revivesUsed: 0,
    isFirstStart: true,
    obstaclesPassed: 0,
    frameCount: 0,
    jumpStartTime: 0,
    cactusGroups: [],
    clouds: [],
    cloudTimer: 0,
    paused: false,
    countdown: 0,
  };
  let availableReviveLives = 0;

  function normalizeLives(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function requestReviveLives() {
    try {
      socket.emit("revive:getLives");
    } catch {}
  }

  function computeRevivePrice() {
    const score = Math.floor(state.score);
    const base = 3500;
    const multiplier = 28;
    const escalation = 1 + state.revivesUsed * 0.45;
    let price = Math.floor(base + score * multiplier * escalation);
    price = Math.max(3500, Math.min(1500000, price));
    return price;
  }

  function updateReviveOverlayContent() {
    if (!ui.reviveOverlay || ui.reviveOverlay.style.display !== "block") return;
    const remainingRevives = 3 - state.revivesUsed;
    if (ui.reviveCount) ui.reviveCount.textContent = remainingRevives;

    const hasShopLife = availableReviveLives > 0;
    const price = computeRevivePrice();
    let modeEl = ui.reviveOverlay.querySelector(".dino-revive-mode");
    if (!modeEl) {
      modeEl = document.createElement("p");
      modeEl.className = "dino-revive-mode";
      modeEl.style.color = "#fff";
      modeEl.style.marginBottom = "10px";
      modeEl.style.fontSize = "0.95rem";
      const priceEl = ui.reviveOverlay.querySelector(".dino-revive-price");
      if (priceEl && priceEl.parentNode) {
        priceEl.parentNode.insertBefore(modeEl, priceEl);
      }
    }
    if (modeEl) {
      modeEl.textContent = hasShopLife
        ? "Choix: vie du shop ou paiement en monnaie"
        : "Choix: paiement en monnaie";
    }

    let payBtnEl = ui.reviveOverlay.querySelector(".dino-revive-pay-btn");
    if (!payBtnEl) {
      payBtnEl = document.createElement("button");
      payBtnEl.className = "dino-revive-pay-btn";
      payBtnEl.style.display = "none";
      payBtnEl.style.marginTop = "8px";
      payBtnEl.style.padding = "8px 12px";
      payBtnEl.style.cursor = "pointer";
      payBtnEl.style.background = "transparent";
      payBtnEl.style.border = "1px solid #fff";
      payBtnEl.style.color = "#fff";
      const cancelBtn = ui.reviveOverlay.querySelector(".dino-cancel-btn");
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
        ? `Utiliser 1 vie (<span class="dino-revive-count">${remainingRevives}</span> restants)`
        : `Payer ${price
            .toLocaleString("fr-FR")
            .replace(
              /\s/g,
              "\u00a0",
            )} monnaie (<span class="dino-revive-count">${remainingRevives}</span> restants)`;
      ui.reviveBtn.onclick = () => {
        socket.emit("dino:payToContinue", {
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
          socket.emit("dino:payToContinue", { price, mode: "pay" });
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

  // Texte de touche pause dynamique (mis à jour via événement global)
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
    window.addEventListener("pauseKey:changed", (e) => {
      const k = e?.detail?.key;
      if (typeof k === "string" && k.length === 1) {
        pauseKeyText = k.toUpperCase();
      }
    });
  } catch {}

  // ---------- Pseudo + meilleur score ----------
  let myName = null;
  let myBest = 0;
  let globalBestScore = 0;
  let scoreAttente = null;
  let resumeScore = null;
  socket.on("you:name", (name) => {
    myName = name;
  });
  socket.on("dino:leaderboard", (arr) => {
    if (!Array.isArray(arr) || !myName) return;
    if (arr.length > 0) {
      globalBestScore = Number(arr[0].score) || 0;
    }
    const me = arr.find((e) => e.pseudo === myName);
    const prevBest = myBest;
    myBest = me ? Number(me.score) || 0 : 0;
    if (scoreAttente != null && myBest >= scoreAttente && myBest > prevBest) {
      showNotif(
        `🦖 Nouveau record ! Score: ${myBest
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

  // ---------- Canvas sizing (responsive) ----------
  let CLIENT_W = 800;
  let CLIENT_H = 450;

  function drawStartScreen() {
    try {
      // fond
      c.fillStyle = "#000";
      c.fillRect(0, 0, CLIENT_W, CLIENT_H);

      // sol
      c.fillStyle = uiColor;
      const groundH = 10;
      const groundY = CLIENT_H - groundH;
      c.fillRect(0, groundY, CLIENT_W, groundH);

      // petit dino (placeholder)
      const dW = Math.max(14, Math.floor(CLIENT_W * 0.055));
      const dH = Math.max(22, Math.floor(CLIENT_H * 0.12));
      const dX = Math.floor(CLIENT_W * 0.12);
      const dY = groundY - dH;
      c.fillRect(dX, dY, dW, dH);

      // texte
      c.textAlign = "center";
      c.fillStyle = uiColor;
      c.font = "bold 42px monospace";
      c.fillText("DINO", CLIENT_W / 2, Math.floor(CLIENT_H * 0.34));

      c.font = "18px monospace";
      c.fillText(
        "Clique sur Démarrer ou appuie sur ESPACE",
        CLIENT_W / 2,
        Math.floor(CLIENT_H * 0.52),
      );

      let hasResumeLine = false;
      if (resumeScore != null && Number(resumeScore) > 0) {
        const s = Math.floor(Number(resumeScore) || 0);
        if (s > 0) {
          c.font = "16px monospace";
          c.fillText(
            `Reprise au score : ${s
              .toLocaleString("fr-FR")
              .replace(/\s/g, "\u00a0")}`,
            CLIENT_W / 2,
            Math.floor(CLIENT_H * 0.58),
          );
          hasResumeLine = true;
        }
      }
      c.font = "14px monospace";
      c.fillText(
        `Pause: ${pauseKeyText}`,
        CLIENT_W / 2,
        Math.floor(CLIENT_H * (hasResumeLine ? 0.68 : 0.62)),
      );
    } catch {}
  }

  function resizeCanvas() {
    try {
      const stage = document.getElementById("stage2");
      const wrap = ui.canvas.closest(".dino-wrap");
      const wrapRect = wrap
        ? wrap.getBoundingClientRect()
        : ui.canvas.getBoundingClientRect();
      if (!wrapRect.width) return;

      const ratio = window.devicePixelRatio || 1;

      const availableW = Math.max(200, Math.round(wrapRect.width));
      const stageRect = stage ? stage.getBoundingClientRect() : null;
      const availableH = Math.max(
        160,
        Math.round(
          (stageRect && stageRect.height
            ? stageRect.height
            : window.innerHeight) - 205,
        ),
      );

      CLIENT_W = availableW;
      CLIENT_H = Math.max(
        120,
        Math.min(Math.round((availableW * 9) / 16), availableH),
      );

      ui.canvas.style.width = `${CLIENT_W}px`;
      ui.canvas.style.height = `${CLIENT_H}px`;

      const displayWidth = Math.floor(CLIENT_W * ratio);
      const displayHeight = Math.floor(CLIENT_H * ratio);

      if (
        ui.canvas.width !== displayWidth ||
        ui.canvas.height !== displayHeight
      ) {
        ui.canvas.width = displayWidth;
        ui.canvas.height = displayHeight;
      }

      if (c && typeof c.setTransform === "function") {
        c.setTransform(ratio, 0, 0, ratio, 0, 0);
      }

      // mettre à jour les tailles dynamiques utilisées par le jeu (basé sur les pixels CSS)
      dino.x = Math.floor(CLIENT_W * 0.1);
      dino.width = Math.max(8, Math.floor(CLIENT_W * 0.05));
      dino.height = Math.max(8, Math.floor(CLIENT_H * 0.09));

      // Le resize efface le canvas: redessiner l'écran d'accueil si aucune run active
      if (state.isFirstStart) {
        drawStartScreen();
      }
    } catch (e) {}
  }

  // appel initial
  resizeCanvas();
  // Écran d'accueil au chargement
  if (state.isFirstStart) {
    drawStartScreen();
  }
  let _dinoResizeTO = null;
  window.addEventListener("resize", () => {
    try {
      clearTimeout(_dinoResizeTO);
      _dinoResizeTO = setTimeout(() => resizeCanvas(), 120);
    } catch (e) {}
  });

  window.addEventListener("pde:section-activated", (e) => {
    try {
      const sectionId = e && e.detail ? e.detail.sectionId : null;
      if (sectionId !== "stage2") return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resizeCanvas();
          if (state.isFirstStart) {
            drawStartScreen();
          }
        });
      });
    } catch {}
  });

  // ---------- Entités ----------
  const dino = {
    x: Math.floor(CLIENT_W * 0.1),
    y: 0,
    width: Math.max(8, Math.floor(CLIENT_W * 0.05)),
    height: Math.max(8, Math.floor(CLIENT_H * 0.09)),
    dy: 0,
    jumping: false,
    jumpVelocity: MIN_JUMP_VELOCITY,
    bounceCount: 0,

    draw() {
      c.fillStyle = uiColor;
      c.fillRect(
        this.x,
        CLIENT_H - this.y - this.height,
        this.width,
        this.height,
      );
    },

    update() {
      if (this.jumping) {
        const gravity = this.dy > 0 ? GRAVITY_ASCENT : GRAVITY_DESCENT;
        this.dy -= gravity;
        this.y += this.dy;
      }
      if (this.y <= 0) {
        const impact = Math.abs(this.dy);
        this.y = 0;
        if (impact > 6 && this.bounceCount < 1) {
          this.dy = Math.max(2.1, impact * 0.2);
          this.jumping = true;
          this.bounceCount += 1;
        } else {
          this.dy = 0;
          this.jumping = false;
          this.bounceCount = 0;
        }
      }
      this.draw();
    },

    jump(velocity) {
      if (!this.jumping && this.y === 0) {
        this.jumpVelocity = velocity;
        this.dy = velocity;
        this.jumping = true;
        this.bounceCount = 0;
      }
    },

    reset() {
      this.y = 0;
      this.dy = 0;
      this.jumping = false;
      this.jumpVelocity = MIN_JUMP_VELOCITY;
      this.bounceCount = 0;
    },
  };

  class Cloud {
    constructor() {
      this.x = CLIENT_W;
      this.y = Math.random() * (CLIENT_H * 0.4);
      this.width =
        Math.max(20, Math.floor(CLIENT_W * 0.06)) +
        Math.random() * Math.max(10, CLIENT_W * 0.04);
      this.height =
        Math.max(8, Math.floor(CLIENT_H * 0.03)) +
        Math.random() * Math.max(6, CLIENT_H * 0.02);
      this.speed = Math.max(0.6, CLIENT_W * 0.003) + Math.random() * 1;
    }
    draw() {
      c.fillStyle = uiColor;
      c.globalAlpha = 0.3;
      c.fillRect(this.x, this.y, this.width, this.height);
      c.globalAlpha = 1.0;
    }
    update() {
      this.x -= this.speed;
      this.draw();
    }
  }

  class CactusGroup {
    constructor(minDistance = 0) {
      const distance =
        Math.random() * (MAX_OBSTACLE_DISTANCE - MIN_OBSTACLE_DISTANCE) +
        MIN_OBSTACLE_DISTANCE;
      const baseX = CLIENT_W + minDistance + distance;

      const count = Math.floor(Math.random() * 3) + 1;
      this.cacti = [];

      // tailles relatives au canvas
      for (let i = 0; i < count; i++) {
        const type = Math.floor(Math.random() * 3);
        let width, height;
        switch (type) {
          case 0:
            width = Math.max(12, Math.floor(CLIENT_W * 0.025));
            height = Math.max(28, Math.floor(CLIENT_H * 0.12));
            break;
          case 1:
            width = Math.max(14, Math.floor(CLIENT_W * 0.03));
            height = Math.max(36, Math.floor(CLIENT_H * 0.15));
            break;
          case 2:
            width = Math.max(16, Math.floor(CLIENT_W * 0.035));
            height = Math.max(42, Math.floor(CLIENT_H * 0.18));
            break;
        }
        const spacing = Math.max(8, Math.floor(CLIENT_W * 0.04));
        this.cacti.push({ x: baseX + i * spacing, width, height, type });
      }
      this.passed = false;
    }

    draw() {
      c.fillStyle = uiColor;
      this.cacti.forEach((cactus) => {
        const groundY = CLIENT_H - 10;
        const cactusY = groundY - cactus.height;
        // Corps principal
        c.fillRect(cactus.x, cactusY, cactus.width, cactus.height);
        // Bras
        const armHeight = Math.max(6, Math.floor(cactus.height * 0.35));
        const armY = cactusY + Math.floor(cactus.height * 0.4);
        c.fillRect(cactus.x - 6, armY, 6, armHeight);
        c.fillRect(cactus.x + cactus.width, armY + 3, 6, armHeight - 5);
      });
    }

    update() {
      this.cacti.forEach((cactus) => {
        cactus.x -= state.gameSpeed;
      });
      this.draw();
    }

    collides() {
      const dinoLeft = dino.x + 5;
      const dinoRight = dino.x + dino.width - 5;
      const dinoTop = CLIENT_H - dino.y - dino.height;
      const dinoBottom = CLIENT_H - dino.y - 5;

      for (let cactus of this.cacti) {
        const cactusLeft = cactus.x;
        const cactusRight = cactus.x + cactus.width;
        const cactusTop = CLIENT_H - 10 - cactus.height;
        const cactusBottom = CLIENT_H - 10;
        if (
          dinoRight > cactusLeft &&
          dinoLeft < cactusRight &&
          dinoBottom > cactusTop &&
          dinoTop < cactusBottom
        ) {
          return true;
        }
      }
      return false;
    }

    getRightmostX() {
      return Math.max(...this.cacti.map((c) => c.x + c.width));
    }
  }

  // ---------- Boucle de jeu ----------
  function spawnCactusGroup() {
    if (state.cactusGroups.length === 0) {
      state.cactusGroups.push(new CactusGroup(0));
    } else {
      const lastGroup = state.cactusGroups[state.cactusGroups.length - 1];
      if (lastGroup.getRightmostX() < CLIENT_W - MIN_OBSTACLE_DISTANCE) {
        state.cactusGroups.push(new CactusGroup(0));
      }
    }
  }

  function showPaused() {
    c.fillStyle = "rgba(0, 0, 0, 0.7)";
    c.fillRect(0, 0, CLIENT_W, CLIENT_H);

    c.fillStyle = uiColor;
    c.font = "bold 40px monospace";
    c.textAlign = "center";

    if (state.countdown > 0) {
      c.fillText(state.countdown.toString(), CLIENT_W / 2, CLIENT_H / 2);
    } else {
      c.fillText("PAUSE", CLIENT_W / 2, CLIENT_H / 2);
      c.font = "18px monospace";
      c.fillText(
        `Appuie sur ${pauseKeyText} pour reprendre`,
        CLIENT_W / 2,
        CLIENT_H / 2 + 40,
      );
    }
  }

  function loop() {
    if (state.gameOver) return;

    // Gestion du compte à rebours
    if (state.countdown > 0) {
      state.frameCount++;

      c.fillStyle = "#000";
      c.fillRect(0, 0, CLIENT_W, CLIENT_H);

      c.fillStyle = uiColor;
      const groundY = CLIENT_H - 10;
      c.fillRect(0, groundY, CLIENT_W, 10);

      state.clouds.forEach((cl) => cl.draw());
      dino.draw();
      state.cactusGroups.forEach((group) => group.draw());

      showPaused();

      if (state.frameCount % 60 === 0) {
        state.countdown--;
        if (state.countdown === 0) {
          state.paused = false;
        }
      }

      requestAnimationFrame(loop);
      return;
    }

    if (state.paused) {
      showPaused();
      requestAnimationFrame(loop);
      return;
    }

    state.frameCount++;

    c.fillStyle = "#000";
    c.fillRect(0, 0, CLIENT_W, CLIENT_H);

    c.fillStyle = uiColor;
    const groundY = CLIENT_H - 10;
    c.fillRect(0, groundY, CLIENT_W, 10);

    state.cloudTimer++;
    if (state.cloudTimer > 100) {
      state.clouds.push(new Cloud());
      state.cloudTimer = 0;
    }
    state.clouds = state.clouds.filter((cl) => {
      cl.update();
      return cl.x + cl.width > 0;
    });

    dino.update();
    spawnCactusGroup();

    // Mise à jour + collision des groupes
    state.cactusGroups = state.cactusGroups.filter((group) => {
      group.update();

      if (!group.passed && group.getRightmostX() < dino.x) {
        group.passed = true;
        state.obstaclesPassed++;
        if (
          state.obstaclesPassed % OBSTACLES_BETWEEN_SPEED_UP === 0 &&
          state.gameSpeed < MAX_SPEED
        ) {
          state.gameSpeed = Math.min(
            state.gameSpeed + SPEED_INCREMENT,
            MAX_SPEED,
          );
        }
      }

      if (group.collides()) {
        state.gameOver = true;
        const finalScore = Math.floor(state.score);
        socket.emit("dino:score", { score: finalScore, final: true });
        scoreAttente = finalScore;
        showGameOver();
        return false;
      }

      return group.getRightmostX() > 0;
    });

    state.score += state.gameSpeed * 0.2;

    c.fillStyle = uiColor;
    c.font = "bold 24px monospace";
    c.textAlign = "right";
    c.fillText(
      `${Math.floor(state.score)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")}`,
      CLIENT_W - 20,
      30,
    );

    c.font = "14px monospace";
    c.fillText(`Vitesse : ${state.gameSpeed.toFixed(1)}`, CLIENT_W - 20, 50);

    requestAnimationFrame(loop);
  }

  function showGameOver() {
    c.fillStyle = "rgba(0, 0, 0, 0.8)";
    c.fillRect(0, 0, CLIENT_W, CLIENT_H);

    c.fillStyle = uiColor;
    c.font = "bold 40px monospace";
    c.textAlign = "center";
    c.fillText("GAME OVER", CLIENT_W / 2, CLIENT_H / 2 - 20);

    c.font = "20px monospace";
    c.fillText(
      `Score: ${Math.floor(state.score)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")}`,
      CLIENT_W / 2,
      CLIENT_H / 2 + 20,
    );

    c.font = "18px monospace";
    c.fillText(
      "Appuie sur ESPACE pour rejouer",
      CLIENT_W / 2,
      CLIENT_H / 2 + 60,
    );

    // --- Logique de réanimation ---
    if (state.revivesUsed < 3) {
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

  socket.on("dino:reviveSuccess", ({ usedLife, remainingLives } = {}) => {
    state.gameOver = false;
    state.revivesUsed++;
    if (typeof remainingLives !== "undefined") {
      availableReviveLives = normalizeLives(remainingLives);
    }
    if (ui.reviveOverlay) {
      ui.reviveOverlay.style.display = "none";
      toggleScrollLock(false);
    }

    // Nettoyer les obstacles immédiats pour éviter de remourir instantanément
    state.cactusGroups = [];

    // Reprendre la boucle
    loop();
    showNotif(
      usedLife
        ? `Partie continuée ! (vie restante: ${availableReviveLives})`
        : "Partie continuée !",
    );
  });

  socket.on("dino:reviveError", (msg) => {
    showNotif(msg || "Erreur lors du paiement");
  });

  socket.on("dino:resume", ({ score }) => {
    const s = Math.floor(Number(score) || 0);
    if (!Number.isFinite(s) || s <= 0) return;
    resumeScore = s;

    // Si on est encore sur l'écran d'accueil, le mettre à jour
    if (state.isFirstStart) {
      drawStartScreen();
    }
  });

  socket.on("system:shutdown:collectProgress", () => {
    try {
      if (!socket) return;
      // Run active si pas firstStart et pas gameOver
      if (!state.isFirstStart && !state.gameOver) {
        socket.emit("dino:progress", { score: Math.floor(state.score) });
      }
    } catch (e) {}
  });

  // Même logique qu'au shutdown, mais pour un refresh/fermeture onglet (best-effort)
  function pushProgressOnLeave() {
    try {
      if (!socket) return;
      if (!state.isFirstStart && !state.gameOver) {
        socket.emit("dino:progress", { score: Math.floor(state.score) });
      }
    } catch (e) {}
  }

  try {
    window.addEventListener("pagehide", pushProgressOnLeave);
    window.addEventListener("beforeunload", pushProgressOnLeave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") pushProgressOnLeave();
    });
  } catch (e) {}

  function startGame() {
    resizeCanvas();

    state.gameOver = false;
    state.revivesUsed = 0;
    if (ui.reviveOverlay) {
      ui.reviveOverlay.style.display = "none";
      toggleScrollLock(false);
    }
    state.isFirstStart = false;
    // Reprise après shutdown: démarrer au score snapshot (1x)
    if (resumeScore != null) {
      state.score = Math.max(0, Math.floor(Number(resumeScore) || 0));
      resumeScore = null;
      try {
        socket.emit("dino:resumeConsumed");
      } catch (e) {}
    } else {
      state.score = 0;
    }
    state.obstaclesPassed = 0;
    state.gameSpeed = INITIAL_SPEED;
    state.frameCount = 0;
    state.cactusGroups = [];
    state.clouds = [];
    dino.reset();
    loop();
    if (ui.stopBtn) ui.stopBtn.style.display = "inline-block";
  }

  function pauseForStageNavigation() {
    const running = !state.isFirstStart && !state.gameOver;
    if (!running) return { running: false, pausedNow: false };
    if (state.paused || state.countdown > 0)
      return { running: true, pausedNow: false };

    state.paused = true;
    try {
      const s = Math.floor(state.score);
      if (socket) {
        socket.emit("dino:score", { score: s, final: false });
        scoreAttente = s;
      }
    } catch {}
    return { running: true, pausedNow: true };
  }

  function resumeAfterNavCancel() {
    if (state.paused && state.countdown === 0) {
      state.countdown = 3;
      state.frameCount = 0;
    }
  }

  function clearToBlack() {
    try {
      c.fillStyle = "#000";
      c.fillRect(0, 0, CLIENT_W, CLIENT_H);
    } catch {}
  }

  function stopCurrentRun() {
    // Ne rien faire si pas de partie active
    if (state.isFirstStart || state.gameOver) return;
    const finalScore = Math.floor(state.score);
    // Envoyer le score pour mise à jour conditionnelle côté serveur
    socket.emit("dino:score", { score: finalScore, final: true });
    // On n’attend pas la confirmation pour reset l’état de la partie (mais le meilleur score ne changera que si supérieur)
    state.gameOver = true;
    state.isFirstStart = true; // Permet de relancer directement
    state.score = 0;
    state.obstaclesPassed = 0;
    state.gameSpeed = INITIAL_SPEED;
    state.frameCount = 0;
    state.cactusGroups = [];
    state.clouds = [];
    dino.reset();
    if (ui.stopBtn) ui.stopBtn.style.display = "none";
    // Afficher l'écran d'accueil
    drawStartScreen();
    showNotif(`# Partie stoppée.`);
  }

  // ---------- Ecouteurs UI ----------
  ui.startBtn?.addEventListener("click", () => {
    if (state.isFirstStart || state.gameOver) startGame();
    else if (!dino.jumping) dino.jump(MAX_JUMP_VELOCITY);
  });

  ui.stopBtn?.addEventListener("click", stopCurrentRun);

  window.addEventListener("pde:stage-nav-guard", (e) => {
    const detail = e && e.detail ? e.detail : null;
    if (!detail || detail.stageId !== "stage2") return;

    if (detail.action === "pause") {
      const result = pauseForStageNavigation();
      detail.running = !!result.running;
      detail.pausedNow = !!result.pausedNow;
    }

    if (detail.action === "resume") {
      resumeAfterNavCancel();
    }
  });

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const tag = active && active.tagName;
    const isTyping =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (active && active.isContentEditable);
    if (isTyping) return;

    // Vérifier que la section Dino (stage2) est visible
    const dinoSection = document.getElementById("stage2");
    if (!dinoSection) return;
    const rect = dinoSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (!isVisible) return;

    if (keys.default.includes(e.key)) {
      e.preventDefault();
      if (state.isFirstStart || state.gameOver) return;

      if (state.paused && state.countdown === 0) {
        state.countdown = 3;
        state.frameCount = 0;
      } else if (!state.paused && state.countdown === 0) {
        state.paused = true;
        try {
          const s = Math.floor(state.score);
          if (socket) {
            socket.emit("dino:score", { score: s, final: false });
            scoreAttente = s;
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
      if (state.isFirstStart || state.gameOver) {
        startGame();
        return;
      }
      if (state.paused || state.countdown > 0) return;

      if (!dino.jumping && dino.y === 0) {
        state.jumpStartTime = Date.now();
        dino.jump(MAX_JUMP_VELOCITY);
      }
    }
  });

  document.addEventListener("keyup", (e) => {
    // Fermer l'overlay de réanimation avec Echap
    if (e.key === "Escape") {
      if (ui.reviveOverlay && ui.reviveOverlay.style.display === "block") {
        ui.reviveOverlay.style.display = "none";
        toggleScrollLock(false);
      }
    }
    // Vérifier que la section Dino (stage2) est visible
    const dinoSection = document.getElementById("stage2");
    if (!dinoSection) return;
    const rect = dinoSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (!isVisible) return;

    if (e.code === "Space") {
      e.preventDefault();
      if (state.paused || state.countdown > 0) return;

      if (dino.jumping && dino.dy > 0) {
        const pressDuration = Date.now() - state.jumpStartTime;
        if (pressDuration < 125) {
          dino.dy *= 0.62;
        }
      }
    }
  });

  // ---------- Reset (confirm + password) ----------
  ui.resetBtn?.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir réinitialiser ton score Dino ?\nTon meilleur score sera définitivement perdu !",
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
      socket.emit("dino:reset");
      showNotif("🔄 Score Dino réinitialisé avec succès !");
      myBest = 0;
      scoreAttente = null;
    } catch (err) {
      showNotif("⚠️ Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  });
}
