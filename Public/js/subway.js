import { keys, openSearchNoSocket } from "./util.js";

export function initSubway(socket) {
  const DPI_BOOST = 1.25;
  const MAX_RENDER_DPR = 2;

  function getRenderRatio() {
    const base = window.devicePixelRatio || 1;
    return Math.min(MAX_RENDER_DPR, base * DPI_BOOST);
  }

  const stage = document.getElementById("stage20");
  const canvas = document.getElementById("subway-canvas");
  const scoreEl = document.getElementById("subway-score");
  const speedEl = document.getElementById("subway-speed");
  const coinsEl = document.getElementById("subway-coins");
  const gainEl = document.getElementById("subway-gain");
  const pauseBtn = document.getElementById("subway-pause-btn");
  const reviveOverlay = document.getElementById("subway-revive-overlay");
  const reviveBtn = document.getElementById("subway-revive-btn");
  const reviveCountEl = document.getElementById("subway-revive-count");
  const cancelBtn = document.getElementById("subway-cancel-btn");

  if (
    !stage ||
    !canvas ||
    !scoreEl ||
    !speedEl ||
    !coinsEl ||
    !gainEl ||
    !pauseBtn ||
    !reviveOverlay ||
    !reviveBtn ||
    !reviveCountEl ||
    !cancelBtn
  )
    return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let uiColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--primary-color")
      .trim() || "#00ff66";
  let bgColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-color")
      .trim() || "#000000";

  const state = {
    running: false,
    paused: false,
    pauseSource: null,
    resumeCountdown: 0,
    resumeCountdownTickAtMs: 0,
    gameOver: false,
    score: 0,
    speed: 1,
    lane: 1,
    playerX: 0,
    playerTargetX: 0,
    coins: 0,
    obstacles: [],
    pickups: [],
    powerups: [],
    obstacleTimer: 0,
    coinTimer: 0,
    obstaclesPassed: 0,
    lastObstacleLane: null,
    lastTs: 0,
    rewarded: false,
    revivesUsed: 0,
    awaitingRevive: false,
    struggleTime: 0,
    struggleDir: 0,
    invincibleUntilMs: 0,
    nextInvincibilityRollScore: 3250,
  };
  let availableReviveLives = 0;
  let resumeScore = null;
  let resumeConsumed = false;
  let pauseKeyText = (keys && keys.default && keys.default[0]) || "P";

  const world = {
    laneCount: 3,
    playerSize: 34,
    baseSpeedPx: 380,
    speedGrowthPerSec: 0.006,
    speedStepEveryObstacles: 3,
    speedStepAmount: 0.05,
    maxSpeed: 3.5,
    minObstacleSpawn: 0.26,
    maxObstacleSpawn: 0.74,
    struggleDuration: 0.16,
    struggleAmplitude: 7,
    invincibilityUnlockSpeed: 2.75,
    invincibilityDurationMs: 5000,
    invincibilitySpawnChance: 0.33,
    invincibilityScoreStep: 3250,
  };

  function coinPickUpAnim(bool = true) {
    function popEase(v) {
      const p = 0.6;
      if (v < p) {
        return (v / p) * (v / p) - Math.PI * v + p - 1;
      }
      return 1 - ((Math.min(v, p) + 3 * Math.PI) * p - v * 2);
    }

    popEase(world.spawnChance);

    if (bool) {
      world.playerSize = 39;
    } else {
      world.playerSize = 29;
    }
  }

  function isStageActive() {
    return stage.classList.contains("is-active");
  }

  function laneX(idx) {
    const laneGap = canvas.width * 0.22;
    const start = canvas.width * 0.5 - laneGap;
    return start + laneGap * idx;
  }

  function playerY() {
    return canvas.height - canvas.height * 0.14;
  }

  function initPlayerLanePosition() {
    const x = laneX(state.lane);
    state.playerX = x;
    state.playerTargetX = x;
  }

  function computeBaseGain() {
    return Math.floor(Math.max(0, state.score) / 750) * 2;
  }

  function computeFinalGain() {
    return computeBaseGain() + Math.max(0, state.coins);
  }

  function computeRevivePrice() {
    const s = Math.max(0, Math.floor(Number(state.score) || 0));
    const escalation = 1 + Math.max(0, state.revivesUsed) * 0.75;
    let price = Math.floor(s * 75 * escalation);
    if (!Number.isFinite(price) || price < 0) price = 5000;
    price = Math.max(5000, Math.min(5_000_000, price));
    return price;
  }

  function requestReviveLives() {
    try {
      socket.emit("revive:getLives");
    } catch {}
  }

  function refreshThemeColors() {
    try {
      const styles = getComputedStyle(document.documentElement);
      uiColor = styles.getPropertyValue("--primary-color").trim() || uiColor;
      bgColor = styles.getPropertyValue("--bg-color").trim() || bgColor;
    } catch {}
  }

  function clearDangerAroundPlayer() {
    const py = playerY();
    const playerHalf = world.playerSize * 0.5;
    state.obstacles = state.obstacles.filter(
      (o) =>
        !(
          o.lane === state.lane &&
          Math.abs(o.y - py) < o.h * 0.6 + playerHalf * 1.2
        ),
    );
    state.pickups = state.pickups.filter((c) => Math.abs(c.y - py) > c.r * 1.2);
  }

  function isInvincible() {
    return Date.now() < state.invincibleUntilMs;
  }

  function syncInvincibilityMilestoneFromScore() {
    const s = Math.max(0, Math.floor(Number(state.score) || 0));
    state.nextInvincibilityRollScore =
      (Math.floor(s / world.invincibilityScoreStep) + 1) *
      world.invincibilityScoreStep;
  }

  function pushProgress() {
    try {
      if (!socket) return;
      if (state.gameOver || state.awaitingRevive || !state.running) return;
      const s = Math.max(0, Math.floor(Number(state.score) || 0));
      if (s <= 0) return;
      socket.emit("subway:progress", { score: s });
    } catch {}
  }

  function updateReviveOverlayContent() {
    if (!reviveOverlay || reviveOverlay.style.display !== "flex") return;
    const remainingRevives = Math.max(0, 3 - state.revivesUsed);
    if (reviveCountEl) reviveCountEl.textContent = String(remainingRevives);

    const hasShopLife = availableReviveLives > 0;
    const price = computeRevivePrice();

    let modeEl = reviveOverlay.querySelector(".subway-revive-mode");
    if (!modeEl) {
      modeEl = document.createElement("p");
      modeEl.className = "subway-revive-mode";
      modeEl.style.color = "#fff";
      modeEl.style.marginBottom = "10px";
      modeEl.style.fontSize = "0.95rem";
      reviveOverlay.insertBefore(modeEl, reviveBtn);
    }

    modeEl.textContent = hasShopLife
      ? "Choix: vie du shop ou paiement en monnaie"
      : "Choix: paiement en monnaie";

    let payBtnEl = reviveOverlay.querySelector(".dino-revive-pay-btn");
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
      if (cancelBtn && cancelBtn.parentNode) {
        cancelBtn.parentNode.insertBefore(payBtnEl, cancelBtn);
      }
    }

    reviveBtn.innerHTML = hasShopLife
      ? `Utiliser 1 vie (<span id=\"subway-revive-count\">${remainingRevives}</span> restants)`
      : `Payer ${price.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")} monnaie (<span id=\"subway-revive-count\">${remainingRevives}</span> restants)`;

    reviveBtn.onclick = () => {
      socket.emit("subway:payToContinue", {
        mode: hasShopLife ? "life" : "pay",
      });
    };

    if (payBtnEl) {
      if (hasShopLife) {
        payBtnEl.style.display = "block";
        payBtnEl.disabled = false;
        payBtnEl.style.opacity = "1";
        payBtnEl.style.cursor = "pointer";
        payBtnEl.textContent = `Payer ${price.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")} monnaie (${remainingRevives} restants)`;
        payBtnEl.onclick = () => {
          socket.emit("subway:payToContinue", { mode: "pay" });
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

  function refreshHud() {
    scoreEl.textContent = `Score: ${Math.floor(state.score)}`;
    speedEl.textContent = `Vitesse: ${state.speed.toFixed(2)}x`;
    coinsEl.textContent = `Pieces: ${state.coins}`;
    gainEl.textContent = `Gain final: ${computeFinalGain()}`;
  }

  function updatePauseButton() {
    if (!pauseBtn) return;
    if (state.running && state.paused) {
      pauseBtn.textContent = `Reprendre (${pauseKeyText})`;
      return;
    }
    pauseBtn.textContent = `Pause (${pauseKeyText})`;
  }

  function pauseRun(source = "manual") {
    if (
      !state.running ||
      state.gameOver ||
      state.awaitingRevive ||
      state.paused
    ) {
      return false;
    }
    state.paused = true;
    state.pauseSource = source;
    state.resumeCountdown = 0;
    state.resumeCountdownTickAtMs = 0;
    updatePauseButton();
    try {
      socket.emit("subway:score", { score: Math.floor(state.score) });
    } catch {}
    if (source === "manual") {
      try {
        openSearchNoSocket();
      } catch {}
    }
    return true;
  }

  function resumeRun() {
    if (!state.running || !state.paused) return false;
    // Reprise plus douce apres pause: on baisse legerement la vitesse courante.
    state.speed = Math.max(1, state.speed * 0.92);
    state.paused = false;
    state.pauseSource = null;
    state.resumeCountdown = 0;
    state.resumeCountdownTickAtMs = 0;
    updatePauseButton();
    return true;
  }

  function startResumeCountdown() {
    if (!state.running || !state.paused) return false;
    state.resumeCountdown = 3;
    state.resumeCountdownTickAtMs = Date.now() + 1000;
    updatePauseButton();
    return true;
  }

  function showReviveOverlay() {
    reviveOverlay.style.display = "flex";
    updateReviveOverlayContent();
  }

  function hideReviveOverlay() {
    reviveOverlay.style.display = "none";
  }

  function resizeCanvas() {
    const wrap = canvas.parentElement;
    if (!wrap) return;

    const cssW = Math.max(380, Math.min(wrap.clientWidth - 4, 1020));
    const cssH = Math.round((cssW * 9) / 16);
    const ratio = getRenderRatio();

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const nextW = Math.floor(cssW * ratio);
    const nextH = Math.floor(cssH * ratio);

    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }

    if (ctx && typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    initPlayerLanePosition();
  }

  function resetRunState() {
    state.running = true;
    state.paused = false;
    state.pauseSource = null;
    state.resumeCountdown = 0;
    state.resumeCountdownTickAtMs = 0;
    state.gameOver = false;
    state.awaitingRevive = false;
    state.score = 0;
    state.speed = 1;
    state.lane = 1;
    initPlayerLanePosition();
    state.coins = 0;
    state.obstacles.length = 0;
    state.pickups.length = 0;
    state.powerups.length = 0;
    state.obstacleTimer = 0;
    state.coinTimer = 0;
    state.obstaclesPassed = 0;
    state.lastObstacleLane = null;
    state.lastTs = 0;
    state.rewarded = false;
    state.revivesUsed = 0;
    state.struggleTime = 0;
    state.struggleDir = 0;
    state.invincibleUntilMs = 0;
    state.nextInvincibilityRollScore = world.invincibilityScoreStep;

    if (!resumeConsumed && resumeScore != null) {
      state.score = Math.max(0, Math.floor(Number(resumeScore) || 0));
      resumeScore = null;
      resumeConsumed = true;
      syncInvincibilityMilestoneFromScore();
      try {
        socket.emit("subway:resumeConsumed");
      } catch {}
    }

    hideReviveOverlay();
    requestReviveLives();
    refreshHud();
    updatePauseButton();
  }

  function triggerEdgeStruggle(dir) {
    state.struggleDir = dir < 0 ? -1 : 1;
    state.struggleTime = world.struggleDuration;
  }

  function spawnObstacle() {
    const tiers = Math.max(0, Math.floor((state.speed - 1) / 0.5));
    const alternationChance = Math.min(0.2 + tiers * 0.1, 0.9);

    let lane = Math.floor(Math.random() * world.laneCount);
    const lastLane = state.lastObstacleLane;

    // Tous les +0.50 de vitesse augmentent la chance d'alterner de lane.
    if (
      Number.isInteger(lastLane) &&
      lastLane >= 0 &&
      lastLane < world.laneCount &&
      Math.random() < alternationChance
    ) {
      if (lastLane === 0) {
        lane = Math.random() < 0.75 ? 2 : 1;
      } else if (lastLane === 2) {
        lane = Math.random() < 0.75 ? 0 : 1;
      } else {
        lane = Math.random() < 0.5 ? 0 : 2;
      }
    }

    state.lastObstacleLane = lane;

    state.obstacles.push({
      lane,
      x: 0,
      y: -canvas.height * 0.08,
      w: Math.max(28, canvas.width * 0.05),
      h: Math.max(52, canvas.height * 0.12),
      counted: false,
    });
  }

  function spawnCoin() {
    const coinY = -canvas.height * 0.04;
    const coinR = Math.max(8, canvas.width * 0.011);

    let chosenLane = -1;
    for (let tries = 0; tries < 8; tries += 1) {
      const lane = Math.floor(Math.random() * world.laneCount);
      const collidesWithObstacle = state.obstacles.some(
        (o) =>
          o.lane === lane &&
          Math.abs(o.y - coinY) < o.h * 0.5 + coinR + canvas.height * 0.03,
      );
      if (!collidesWithObstacle) {
        chosenLane = lane;
        break;
      }
    }

    if (chosenLane < 0) return;

    state.pickups.push({
      lane: chosenLane,
      x: 0,
      y: coinY,
      r: coinR,
    });
  }

  function spawnInvincibilityPowerup() {
    if (state.powerups.length > 0) return;

    const spawnY = -canvas.height * 0.05;
    const size = Math.max(12, canvas.width * 0.016);

    let chosenLane = -1;
    for (let tries = 0; tries < 8; tries += 1) {
      const lane = Math.floor(Math.random() * world.laneCount);
      const blocked = state.obstacles.some(
        (o) =>
          o.lane === lane &&
          Math.abs(o.y - spawnY) < o.h * 0.5 + size + canvas.height * 0.03,
      );
      if (!blocked) {
        chosenLane = lane;
        break;
      }
    }

    if (chosenLane < 0) return;

    state.powerups.push({
      lane: chosenLane,
      x: 0,
      y: spawnY,
      size,
    });
  }

  function rewardFinalMoney() {
    if (!socket || state.rewarded) return;
    state.rewarded = true;

    socket.emit("subway:final", {
      score: Math.floor(state.score),
      coins: Math.floor(state.coins),
    });
  }

  function finalizeRun() {
    state.gameOver = true;
    state.awaitingRevive = false;
    state.running = false;
    state.paused = false;
    state.pauseSource = null;
    state.resumeCountdown = 0;
    state.resumeCountdownTickAtMs = 0;
    rewardFinalMoney();
    hideReviveOverlay();
    refreshHud();
    updatePauseButton();
  }

  function onCrash() {
    state.running = false;
    state.paused = false;
    state.pauseSource = null;
    state.resumeCountdown = 0;
    state.resumeCountdownTickAtMs = 0;
    state.awaitingRevive = true;
    try {
      socket.emit("subway:score", {
        score: Math.floor(state.score),
        revivePending: true,
      });
    } catch {}

    if (state.revivesUsed < 3) {
      requestReviveLives();
      showReviveOverlay();
      return;
    }

    finalizeRun();
  }

  function update(dt) {
    const runSpeedPx = world.baseSpeedPx * state.speed;

    state.speed = Math.min(
      world.maxSpeed,
      state.speed + world.speedGrowthPerSec * dt,
    );
    state.score += dt * 120 * state.speed;

    while (state.score >= state.nextInvincibilityRollScore) {
      if (
        state.speed >= world.invincibilityUnlockSpeed &&
        Math.random() < world.invincibilitySpawnChance
      ) {
        spawnInvincibilityPowerup();
      }
      state.nextInvincibilityRollScore += world.invincibilityScoreStep;
    }

    state.obstacleTimer += dt;
    const obstacleEvery = Math.max(
      world.minObstacleSpawn,
      world.maxObstacleSpawn - state.speed * 0.045,
    );
    if (state.obstacleTimer >= obstacleEvery) {
      state.obstacleTimer = 0;
      spawnObstacle();
    }

    state.coinTimer += dt;
    const coinEvery = Math.max(0.22, 0.58 - state.speed * 0.03);
    if (state.coinTimer >= coinEvery) {
      state.coinTimer = 0;
      if (Math.random() < 0.75) spawnCoin();
    }

    const pX = laneX(state.lane);
    const pY = playerY();
    const pHalf = world.playerSize * 0.5;

    // Changement de voie adouci (petit ease) pour eviter l'effet instantane.
    state.playerX +=
      (state.playerTargetX - state.playerX) * Math.min(1, dt * 14);

    if (state.struggleTime > 0) {
      state.struggleTime = Math.max(0, state.struggleTime - dt);
      if (state.struggleTime === 0) {
        state.struggleDir = 0;
      }
    }

    for (const o of state.obstacles) {
      o.x = laneX(o.lane);
      o.y += runSpeedPx * dt;

      if (!o.counted && o.y > pY + world.playerSize * 0.5) {
        o.counted = true;
        state.obstaclesPassed += 1;
        if (state.obstaclesPassed % world.speedStepEveryObstacles === 0) {
          state.speed = Math.min(
            world.maxSpeed,
            state.speed + world.speedStepAmount,
          );
        }
      }

      const ox = Math.abs(o.x - state.playerX) < (o.w * 0.5 + pHalf) * 0.78;
      const oy = Math.abs(o.y - pY) < (o.h * 0.5 + pHalf) * 0.78;
      if (ox && oy) {
        if (isInvincible()) {
          o.y = canvas.height + 999;
        } else {
          onCrash();
          break;
        }
      }
    }

    for (const c of state.pickups) {
      c.x = laneX(c.lane);
      c.y += runSpeedPx * dt;

      const cx = Math.abs(c.x - state.playerX) < c.r + pHalf * 0.6;
      const cy = Math.abs(c.y - pY) < c.r + pHalf * 0.6;
      if (cx && cy) {
        coinPickUpAnim(true);
        setTimeout(() => coinPickUpAnim(false), 150);
        state.coins += 1;
        c.y = canvas.height + 999;
      }
    }

    for (const p of state.powerups) {
      p.x = laneX(p.lane);
      p.y += runSpeedPx * dt;

      const hitX = Math.abs(p.x - state.playerX) < p.size + pHalf * 0.55;
      const hitY = Math.abs(p.y - pY) < p.size + pHalf * 0.55;
      if (hitX && hitY) {
        state.invincibleUntilMs = Date.now() + world.invincibilityDurationMs;
        p.y = canvas.height + 999;
      }
    }

    state.obstacles = state.obstacles.filter((o) => o.y < canvas.height + o.h);
    state.pickups = state.pickups.filter((c) => c.y < canvas.height + c.r * 2);
    state.powerups = state.powerups.filter(
      (p) => p.y < canvas.height + p.size * 2,
    );

    refreshHud();
  }

  function drawLaneLines() {
    ctx.save();
    ctx.strokeStyle = uiColor;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = Math.max(2, canvas.width * 0.003);

    for (let i = 0; i < world.laneCount; i += 1) {
      const x = laneX(i);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawLaneLines();

    const strugglePhase =
      state.struggleTime > 0
        ? Math.sin(
            (1 - state.struggleTime / world.struggleDuration) * Math.PI * 4,
          )
        : 0;
    const struggleOffset =
      state.struggleTime > 0
        ? strugglePhase * world.struggleAmplitude * state.struggleDir
        : 0;

    const pX = state.playerX + struggleOffset;
    const pY = playerY();

    for (const o of state.obstacles) {
      ctx.save();
      ctx.fillStyle = "#ff3b30";
      ctx.globalAlpha = 0.95;
      ctx.fillRect(o.x - o.w * 0.5, o.y - o.h * 0.5, o.w, o.h);
      ctx.restore();
    }

    for (const c of state.pickups) {
      ctx.save();
      ctx.fillStyle = "#ffd60a";
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const p of state.powerups) {
      const half = p.size;
      ctx.save();
      ctx.fillStyle = "#1d4ed8";
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - half);
      ctx.lineTo(p.x - half, p.y + half);
      ctx.lineTo(p.x + half, p.y + half);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = isInvincible() ? "#60a5fa" : uiColor;
    ctx.fillRect(
      pX - world.playerSize * 0.5,
      pY - world.playerSize * 0.5,
      world.playerSize,
      world.playerSize,
    );

    ctx.fillStyle = uiColor;
    ctx.textAlign = "center";

    if (!state.running && !state.gameOver && !state.awaitingRevive) {
      ctx.font = `${Math.max(16, Math.floor(canvas.width * 0.026))}px monospace`;
      ctx.fillText(
        "ESPACE POUR COMMENCER",
        canvas.width * 0.5,
        canvas.height * 0.48,
      );
    }

    if (state.gameOver) {
      ctx.font = `${Math.max(18, Math.floor(canvas.width * 0.032))}px monospace`;
      ctx.fillText("GAME OVER", canvas.width * 0.5, canvas.height * 0.44);
      ctx.font = `${Math.max(14, Math.floor(canvas.width * 0.02))}px monospace`;
      ctx.fillText(
        `Gain: ${computeFinalGain()} monnaie`,
        canvas.width * 0.5,
        canvas.height * 0.5,
      );
      ctx.fillText(
        "ESPACE POUR REJOUER",
        canvas.width * 0.5,
        canvas.height * 0.56,
      );
    }

    if (
      state.running &&
      state.paused &&
      !state.gameOver &&
      !state.awaitingRevive
    ) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = uiColor;
      ctx.textAlign = "center";
      ctx.font = `${Math.max(18, Math.floor(canvas.width * 0.03))}px monospace`;
      if (state.resumeCountdown > 0) {
        ctx.fillText(
          String(state.resumeCountdown),
          canvas.width * 0.5,
          canvas.height * 0.47,
        );
      } else {
        ctx.fillText("PAUSE", canvas.width * 0.5, canvas.height * 0.47);
      }
      ctx.font = `${Math.max(13, Math.floor(canvas.width * 0.018))}px monospace`;
      if (state.resumeCountdown > 0) {
        ctx.fillText("Reprise...", canvas.width * 0.5, canvas.height * 0.54);
      } else {
        ctx.fillText(
          `Appuie sur ${pauseKeyText} pour reprendre`,
          canvas.width * 0.5,
          canvas.height * 0.54,
        );
      }
      ctx.restore();
    }
  }

  function loop(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.04, Math.max(0, (ts - state.lastTs) / 1000));
    state.lastTs = ts;

    if (state.running && state.paused && state.resumeCountdown > 0) {
      const now = Date.now();
      if (!state.resumeCountdownTickAtMs) {
        state.resumeCountdownTickAtMs = now + 1000;
      }
      if (now >= state.resumeCountdownTickAtMs) {
        state.resumeCountdown = Math.max(0, state.resumeCountdown - 1);
        state.resumeCountdownTickAtMs = now + 1000;
        if (state.resumeCountdown === 0) {
          resumeRun();
        }
      }
    }

    if (state.running && !state.gameOver && !state.paused && isStageActive()) {
      update(dt);
    }

    draw();
    requestAnimationFrame(loop);
  }

  function handleKeyDown(e) {
    if (!isStageActive()) return;

    const key = typeof e.key === "string" ? e.key : "";
    const lower = key.toLowerCase();
    const isSpace = key === " " || lower === "spacebar";
    const isLeft = key === "ArrowLeft" || lower === "a";
    const isRight = key === "ArrowRight" || lower === "d";
    const isPause = keys.default.includes(key);

    if (state.awaitingRevive) {
      if (e.key === "Escape") {
        finalizeRun();
        e.preventDefault();
      }
      return;
    }

    if (state.gameOver) {
      if (isSpace) {
        resetRunState();
        e.preventDefault();
      }
      return;
    }

    if (isPause) {
      if (!state.running) return;
      if (state.paused) {
        if (!state.resumeCountdown) startResumeCountdown();
      } else {
        pauseRun("manual");
      }
      e.preventDefault();
      return;
    }

    if (!state.running) {
      if (isSpace) {
        resetRunState();
        e.preventDefault();
      }
      return;
    }

    if (state.paused) {
      e.preventDefault();
      return;
    }

    if (isLeft) {
      if (state.lane === 0) {
        triggerEdgeStruggle(-1);
      } else {
        state.lane = Math.max(0, state.lane - 1);
        state.playerTargetX = laneX(state.lane);
      }
      e.preventDefault();
      return;
    }

    if (isRight) {
      if (state.lane === world.laneCount - 1) {
        triggerEdgeStruggle(1);
      } else {
        state.lane = Math.min(world.laneCount - 1, state.lane + 1);
        state.playerTargetX = laneX(state.lane);
      }
      e.preventDefault();
      return;
    }
  }

  socket.on("revive:lives", ({ lives } = {}) => {
    const parsed = Math.floor(Number(lives) || 0);
    availableReviveLives = Math.max(0, parsed);
    if (state.awaitingRevive) {
      updateReviveOverlayContent();
    }
  });

  socket.on("subway:reviveSuccess", ({ usedLife, remainingLives } = {}) => {
    state.revivesUsed += 1;
    state.awaitingRevive = false;
    state.gameOver = false;
    state.running = true;
    state.paused = false;
    state.pauseSource = null;
    state.resumeCountdown = 0;
    state.resumeCountdownTickAtMs = 0;
    if (usedLife === true && Number.isFinite(Number(remainingLives))) {
      availableReviveLives = Math.max(0, Math.floor(Number(remainingLives)));
    }
    // Protection revive: retirer tous les obstacles à l'écran.
    state.obstacles = [];
    state.pickups = [];
    state.powerups = [];
    clearDangerAroundPlayer();
    hideReviveOverlay();
    refreshHud();
    updatePauseButton();
  });

  socket.on("subway:reviveError", () => {
    finalizeRun();
  });

  socket.on("subway:resume", ({ score } = {}) => {
    const s = Math.floor(Number(score) || 0);
    if (!Number.isFinite(s) || s <= 0) return;
    resumeScore = s;
  });

  socket.on("system:shutdown:collectProgress", () => {
    pushProgress();
  });

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("pauseKey:changed", (e) => {
    const k = e?.detail?.key;
    if (typeof k === "string" && k.length === 1) {
      pauseKeyText = k.toUpperCase();
      updatePauseButton();
    }
  });
  window.addEventListener("uiColor:changed", (e) => {
    if (e?.detail?.color) uiColor = String(e.detail.color);
    refreshThemeColors();
    draw();
  });
  cancelBtn.addEventListener("click", () => {
    if (!state.awaitingRevive) return;
    finalizeRun();
  });
  pauseBtn.addEventListener("click", () => {
    if (
      !isStageActive() ||
      !state.running ||
      state.awaitingRevive ||
      state.gameOver
    )
      return;
    if (state.paused) {
      if (!state.resumeCountdown) startResumeCountdown();
    } else pauseRun("manual");
  });

  window.addEventListener("pde:stage-nav-guard", (e) => {
    const detail = e?.detail;
    if (!detail || detail.stageId !== "stage20") return;

    if (detail.action === "pause") {
      const runningNow =
        state.running && !state.gameOver && !state.awaitingRevive;
      detail.running = !!runningNow;
      detail.pausedNow = false;
      if (!runningNow) return;
      if (!state.paused) {
        detail.pausedNow = pauseRun("navigation");
      }
      return;
    }

    if (detail.action === "resume") {
      if (state.paused && state.pauseSource === "navigation") {
        startResumeCountdown();
      }
    }
  });
  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });

  try {
    window.addEventListener("pagehide", pushProgress);
    window.addEventListener("beforeunload", pushProgress);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") pushProgress();
    });
  } catch {}

  window.addEventListener("pde:section-activated", (event) => {
    const sectionId = event?.detail?.sectionId;
    if (sectionId === "stage20") {
      resizeCanvas();
      draw();
      return;
    }
    if (sectionId !== "stage20") {
      if (
        state.running &&
        !state.paused &&
        !state.awaitingRevive &&
        !state.gameOver
      ) {
        pauseRun("section-switch");
      }
      hideReviveOverlay();
    }
  });

  resizeCanvas();
  refreshThemeColors();
  requestReviveLives();
  hideReviveOverlay();
  refreshHud();
  updatePauseButton();
  draw();
  requestAnimationFrame(loop);
}
