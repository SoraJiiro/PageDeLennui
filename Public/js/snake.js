import { showNotif, keys } from "./util.js";

export function initSnake(socket) {
  // ---------- Cache UI ----------
  const ui = {
    canvas: document.getElementById("snake-canvas"),
    startBtn: document.querySelector(".snake-start"),
    stopBtn: document.querySelector(".snake-stop"),
    resetBtn: document.querySelector(".snake-reset"),
  };
  if (!ui.canvas) return;
  const ctx = ui.canvas.getContext("2d");

  // ---------- Constantes ----------
  const GRID_SIZE = 23;
  const CELL_SIZE = 23;
  const MAX_LENGTH = 52;
  // ms per logical tick (lower = faster). Tunable for smoothness.
  const GAME_SPEED = 100;

  // ---------- État local ----------
  const state = {
    snake: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: null,
    score: 0,
    gameLoop: null,
    rafId: null,
    tickAccumulator: 0,
    prevSnake: [],
    lastFrameTime: 0,
    gameActive: false,
    gameStarted: false,
    startTime: null,
    elapsedMs: 0,
    pausedTime: 0,
    timerInterval: null,
    paused: false,
    countdown: 0,
    frameCount: 0,
  };

  // Texte de touche pause dynamique
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
  let scoreAttente = null;
  socket.on("you:name", (name) => {
    myName = name;
  });
  socket.on("snake:leaderboard", (arr) => {
    if (!Array.isArray(arr) || !myName) return;
    const me = arr.find((e) => e.pseudo === myName);
    const prevBest = myBest;
    myBest = me ? Number(me.score) || 0 : 0;
    if (scoreAttente != null && myBest >= scoreAttente && myBest > prevBest) {
      showNotif(
        `🐍 Nouveau record ! Score: ${myBest
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}`
      );
      scoreAttente = null;
    }
  });

  // ---------- Canvas sizing ----------
  // ---------- Canvas sizing (responsive) ----------
  let CELL_SIZE_DYNAMIC = CELL_SIZE;

  function resizeCanvas() {
    try {
      const rect = ui.canvas.getBoundingClientRect();
      const clientW = Math.max(1, Math.round(rect.width));
      const clientH = Math.max(1, Math.round(rect.height));
      // compute cell size in CSS pixels so GRID fits inside the canvas
      CELL_SIZE_DYNAMIC =
        Math.floor(Math.min(clientW, clientH) / GRID_SIZE) || 1;
      const desiredW = CELL_SIZE_DYNAMIC * GRID_SIZE;
      // keep canvas CSS size aligned with grid so layout doesn't jump
      try {
        ui.canvas.style.width = `${desiredW}px`;
        ui.canvas.style.height = `${desiredW}px`;
      } catch (e) {}
    } catch (e) {}
  }

  // Ensure the canvas backing buffer and transform match the CSS size + DPR
  function ensureBackingBuffer() {
    try {
      const ratio = window.devicePixelRatio || 1;
      const rect = ui.canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width));
      const cssHeight = Math.max(1, Math.round(rect.height));
      const displayWidth = Math.floor(cssWidth * ratio);
      const displayHeight = Math.floor(cssHeight * ratio);

      if (
        ui.canvas.width !== displayWidth ||
        ui.canvas.height !== displayHeight
      ) {
        ui.canvas.width = displayWidth;
        ui.canvas.height = displayHeight;
        try {
          ui.canvas.style.width = `${cssWidth}px`;
          ui.canvas.style.height = `${cssHeight}px`;
        } catch (e) {}
        try {
          if (ctx && typeof ctx.setTransform === "function")
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        } catch (e) {}
      }
    } catch (e) {}
  }

  // initial scale computation and debounced resize updates
  resizeCanvas();
  let _snakeResizeTO = null;
  window.addEventListener("resize", () => {
    try {
      clearTimeout(_snakeResizeTO);
      _snakeResizeTO = setTimeout(() => resizeCanvas(), 120);
    } catch (e) {}
  });

  // ---------- Fonctions de jeu ----------
  function initGame() {
    state.snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    state.direction = { x: 1, y: 0 };
    state.nextDirection = { x: 1, y: 0 };
    state.score = 0;
    state.gameActive = true;
    state.gameStarted = true;
    state.startTime = Date.now();
    state.elapsedMs = 0;
    state.pausedTime = 0;
    spawnFood();
    startTimer();
    if (state.rafId) cancelAnimationFrame(state.rafId);
    // ensure backing buffer & transform are correctly set before first frame
    ensureBackingBuffer();
    // reset rAF timing state
    state.tickAccumulator = 0;
    state.lastFrameTime = 0;
    // copy initial positions so we can interpolate on first frame
    state.prevSnake = state.snake.map((s) => ({ x: s.x, y: s.y }));
    state.rafId = requestAnimationFrame(loop);
  }

  // perform one logical tick (grid-step)
  function performTick() {
    if (!state.gameActive) return;

    state.direction = state.nextDirection;
    // store previous positions for interpolation
    state.prevSnake = state.snake.map((s) => ({ x: s.x, y: s.y }));

    const head = {
      x: state.snake[0].x + state.direction.x,
      y: state.snake[0].y + state.direction.y,
    };

    // Vérifier collision avec les murs
    if (
      head.x < 0 ||
      head.x >= GRID_SIZE ||
      head.y < 0 ||
      head.y >= GRID_SIZE
    ) {
      gameOver();
      return;
    }

    // Vérifier collision avec soi-même
    if (state.snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
      gameOver();
      return;
    }

    state.snake.unshift(head);

    // Vérifier si on mange la nourriture
    if (head.x === state.food.x && head.y === state.food.y) {
      state.score++;

      // Ne pas grandir si on atteint la taille max
      if (state.snake.length >= MAX_LENGTH) {
        state.snake.pop();
      }

      spawnFood();
    } else {
      state.snake.pop();
    }
  }

  // main loop using requestAnimationFrame: accumulates dt and ticks at GAME_SPEED
  function loop(ts) {
    if (!state.lastFrameTime) state.lastFrameTime = ts;
    const delta = ts - state.lastFrameTime;
    state.lastFrameTime = ts;

    // handle countdown using frame-based approach (approx 60fps)
    if (state.countdown > 0) {
      state.frameCount++;
      // render pause/countdown
      draw(0);
      if (state.frameCount % 60 === 0) {
        state.countdown--;
        if (state.countdown === 0) {
          state.paused = false;
          state.pausedTime = Date.now() - state.startTime - state.elapsedMs;
        }
      }
      state.rafId = requestAnimationFrame(loop);
      return;
    }

    if (state.paused) {
      draw(0);
      state.rafId = requestAnimationFrame(loop);
      return;
    }

    // accumulate and perform ticks
    state.tickAccumulator += delta;
    let ticked = false;
    while (state.tickAccumulator >= GAME_SPEED) {
      performTick();
      state.tickAccumulator -= GAME_SPEED;
      ticked = true;
    }

    // progress between ticks (0..1)
    const progress = Math.min(1, state.tickAccumulator / GAME_SPEED);

    // update elapsed time periodically
    state.frameCount++;
    if (ticked) {
      // if we ticked at least once, update elapsedMs reference
      if (
        state.gameActive &&
        state.startTime &&
        !state.paused &&
        state.countdown === 0
      ) {
        state.elapsedMs = Date.now() - state.startTime - state.pausedTime;
      }
    }

    draw(progress);
    state.rafId = requestAnimationFrame(loop);
  }

  function spawnFood() {
    let validPosition = false;
    while (!validPosition) {
      state.food = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      };
      validPosition = !state.snake.some(
        (seg) => seg.x === state.food.x && seg.y === state.food.y
      );
    }
  }

  function showPaused() {
    const cssSize = CELL_SIZE_DYNAMIC * GRID_SIZE;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, cssSize, cssSize);

    ctx.fillStyle = uiColor;
    ctx.font = "bold 40px monospace";
    ctx.textAlign = "center";

    if (state.countdown > 0) {
      ctx.fillText(state.countdown.toString(), cssSize / 2, cssSize / 2);
    } else {
      ctx.fillText("PAUSE", cssSize / 2, cssSize / 2);
      ctx.font = "18px monospace";
      ctx.fillText(
        `Appuie sur ${pauseKeyText} pour reprendre`,
        cssSize / 2,
        cssSize / 2 + 40
      );
    }
  }

  // draw interpolated frame; progress between 0..1
  function draw(progress = 1) {
    // Recompute cell size from actual CSS pixel size each frame to avoid zoom issues
    try {
      const rect = ui.canvas.getBoundingClientRect();
      const clientW = Math.max(1, Math.round(rect.width));
      const clientH = Math.max(1, Math.round(rect.height));
      CELL_SIZE_DYNAMIC =
        Math.floor(Math.min(clientW, clientH) / GRID_SIZE) || 1;
    } catch (e) {}

    ctx.fillStyle = "#000";
    // ctx coordinates are in CSS pixels thanks to setTransform
    const cssSize = CELL_SIZE_DYNAMIC * GRID_SIZE;
    ctx.fillRect(0, 0, cssSize, cssSize);

    // Dessiner la grille
    ctx.strokeStyle = "#4e3e5e";
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE_DYNAMIC, 0);
      ctx.lineTo(i * CELL_SIZE_DYNAMIC, CELL_SIZE_DYNAMIC * GRID_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE_DYNAMIC);
      ctx.lineTo(CELL_SIZE_DYNAMIC * GRID_SIZE, i * CELL_SIZE_DYNAMIC);
      ctx.stroke();
    }

    // Dessiner le serpent (interpolé)
    for (let index = 0; index < state.snake.length; index++) {
      const seg = state.snake[index];
      const prev = state.prevSnake[index] || seg;
      const lerpX = prev.x + (seg.x - prev.x) * progress;
      const lerpY = prev.y + (seg.y - prev.y) * progress;

      ctx.fillStyle = uiColor;
      if (index !== 0) {
        ctx.globalAlpha = 0.8;
      }

      ctx.fillRect(
        lerpX * CELL_SIZE_DYNAMIC + 1,
        lerpY * CELL_SIZE_DYNAMIC + 1,
        CELL_SIZE_DYNAMIC - 2,
        CELL_SIZE_DYNAMIC - 2
      );
      ctx.globalAlpha = 1.0;
    }

    // Dessiner la nourriture
    if (state.food) {
      // interpolate food too if desired (food doesn't move so just draw at exact)
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(
        state.food.x * CELL_SIZE_DYNAMIC + 1,
        state.food.y * CELL_SIZE_DYNAMIC + 1,
        CELL_SIZE_DYNAMIC - 2,
        CELL_SIZE_DYNAMIC - 2
      );
    }

    // Afficher le score
    ctx.fillStyle = "#0f0";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `${state.score.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")}`,
      cssSize - 10,
      30
    );
  }

  function draw() {
    ctx.fillStyle = "#000";
    // ctx coordinates are in CSS pixels thanks to setTransform
    const cssSize = CELL_SIZE_DYNAMIC * GRID_SIZE;
    ctx.fillRect(0, 0, cssSize, cssSize);

    // Dessiner la grille
    ctx.strokeStyle = "#4e3e5e";
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE_DYNAMIC, 0);
      ctx.lineTo(i * CELL_SIZE_DYNAMIC, CELL_SIZE_DYNAMIC * GRID_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE_DYNAMIC);
      ctx.lineTo(CELL_SIZE_DYNAMIC * GRID_SIZE, i * CELL_SIZE_DYNAMIC);
      ctx.stroke();
    }

    // Dessiner le serpent
    state.snake.forEach((seg, index) => {
      if (index === 0) {
        ctx.fillStyle = "#00ff00";
      } else {
        ctx.fillStyle = "#00cc00";
      }
      ctx.fillRect(
        seg.x * CELL_SIZE_DYNAMIC + 1,
        seg.y * CELL_SIZE_DYNAMIC + 1,
        CELL_SIZE_DYNAMIC - 2,
        CELL_SIZE_DYNAMIC - 2
      );
    });

    // Dessiner la nourriture
    if (state.food) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(
        state.food.x * CELL_SIZE_DYNAMIC + 1,
        state.food.y * CELL_SIZE_DYNAMIC + 1,
        CELL_SIZE_DYNAMIC - 2,
        CELL_SIZE_DYNAMIC - 2
      );
    }

    // Afficher le score
    ctx.fillStyle = "#0f0";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `${state.score.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")}`,
      cssSize - 10,
      30
    );
  }

  function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      if (
        state.gameActive &&
        state.startTime &&
        !state.paused &&
        state.countdown === 0
      ) {
        state.elapsedMs = Date.now() - state.startTime - state.pausedTime;
      }
    }, 100);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function clearToBlack() {
    try {
      const cssSize = CELL_SIZE_DYNAMIC * GRID_SIZE;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cssSize, cssSize);
    } catch {}
  }

  function gameOver() {
    state.gameActive = false;
    stopTimer();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    // ensure backing buffer is correct before drawing Game Over (fixes invisible overlay issue)
    ensureBackingBuffer();

    const finalScore = state.score;
    socket.emit("snake:score", {
      score: finalScore,
      elapsedMs: state.elapsedMs,
      final: true,
    });
    scoreAttente = finalScore;
    // draw on canvas
    showGameOver();
    // fallback: also show a DOM overlay in case canvas overlay is not visible
    try {
      showDOMGameOverOverlay();
    } catch (e) {
      console.log("snake: failed to show DOM overlay", e);
    }
  }

  function showGameOver() {
    // Recompute cell size from actual CSS pixel size to ensure overlay covers canvas
    try {
      const rect = ui.canvas.getBoundingClientRect();
      const clientW = Math.max(1, Math.round(rect.width));
      const clientH = Math.max(1, Math.round(rect.height));
      CELL_SIZE_DYNAMIC =
        Math.floor(Math.min(clientW, clientH) / GRID_SIZE) || 1;
    } catch (e) {}

    const cssSize = CELL_SIZE_DYNAMIC * GRID_SIZE;
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, cssSize, cssSize);

    ctx.fillStyle = "#0f0";
    ctx.font = "bold 40px monospace";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", cssSize / 2, cssSize / 2 - 20);

    ctx.font = "20px monospace";
    ctx.fillText(
      `Score: ${state.score.toLocaleString("fr-FR").replace(/\s/g, "\u00a0")}`,
      cssSize / 2,
      cssSize / 2 + 20
    );

    const totalSeconds = Math.floor(state.elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;

    ctx.fillText(`Temps: ${timeStr}`, cssSize / 2, cssSize / 2 + 50);

    ctx.font = "18px monospace";
    ctx.fillText(
      "Appuie sur ESPACE pour rejouer",
      cssSize / 2,
      cssSize / 2 + 90
    );
  }

  // DOM fallback overlay for Game Over (in case canvas overlay doesn't appear)
  function showDOMGameOverOverlay() {
    const parent = ui.canvas.parentElement || document.body;
    // ensure parent is positioned so absolute overlay aligns
    try {
      const computed = window.getComputedStyle(parent);
      if (computed.position === "static") parent.style.position = "relative";
    } catch (e) {}

    // remove existing overlay if any
    removeDOMGameOverOverlay();

    const rect = ui.canvas.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "snake-dom-gameover-overlay";
    overlay.style.position = "absolute";
    overlay.style.left = `${rect.left - parentRect.left}px`;
    overlay.style.top = `${rect.top - parentRect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.pointerEvents = "none";
    overlay.style.background = "rgba(0,0,0,0.8)";
    overlay.style.color = "#0f0";
    overlay.style.zIndex = "9999";
    overlay.innerHTML = `<div style="text-align:center;font-family:monospace"><div style="font-weight:700;font-size:32px;margin-bottom:8px">GAME OVER</div><div style="font-size:18px">Score: ${state.score
      .toLocaleString("fr-FR")
      .replace(/\s/g, "\u00a0")}</div></div>`;
    parent.appendChild(overlay);
  }

  function removeDOMGameOverOverlay() {
    const parent = ui.canvas.parentElement || document.body;
    const existing = parent.querySelector(".snake-dom-gameover-overlay");
    if (existing) existing.remove();
  }

  function startGame() {
    state.gameStarted = false;
    state.gameActive = false;
    state.paused = false;
    state.countdown = 0;
    initGame();
    if (ui.stopBtn) ui.stopBtn.style.display = "inline-block";
    // remove any DOM overlay left from previous run
    try {
      removeDOMGameOverOverlay();
    } catch (e) {}
  }

  function stopCurrentRun() {
    if (!state.gameStarted || !state.gameActive) return;
    const finalScore = state.score;
    socket.emit("snake:score", {
      score: finalScore,
      elapsedMs: state.elapsedMs,
      final: true,
    });
    state.gameActive = false;
    state.gameStarted = false;
    state.score = 0;
    state.elapsedMs = 0;
    state.paused = false;
    state.countdown = 0;
    stopTimer();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (ui.stopBtn) ui.stopBtn.style.display = "none";
    clearToBlack();
    try {
      removeDOMGameOverOverlay();
    } catch (e) {}
    showNotif(`# Partie stoppée.`);
  }

  // ---------- Écouteurs UI ----------
  ui.startBtn?.addEventListener("click", () => {
    if (!state.gameStarted || !state.gameActive) {
      startGame();
    }
  });

  ui.stopBtn?.addEventListener("click", stopCurrentRun);

  // ---------- Écouteurs clavier ----------
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const tag = active && active.tagName;
    const isTyping =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (active && active.isContentEditable);
    if (isTyping) return;

    // Vérifier que la section Snake (stage10) est visible
    const snakeSection = document.getElementById("stage10");
    if (!snakeSection) return;
    const rect = snakeSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (!isVisible) return;

    // Touche pause
    if (keys.default.includes(e.key)) {
      e.preventDefault();
      if (!state.gameStarted || !state.gameActive) return;

      if (state.paused && state.countdown === 0) {
        state.countdown = 3;
        state.frameCount = 0;
      } else if (!state.paused && state.countdown === 0) {
        state.paused = true;
        try {
          window.open("../search.html", "_blank");
          console.log("Chrome save");
        } catch {
          window.open("about:newtab", "_blank");
          console.log("Firefox save");
        }
      }
      return;
    }

    // Espace pour redémarrer après game over
    if (e.code === "Space") {
      e.preventDefault();
      if (state.paused || state.countdown > 0) return;

      if (!state.gameActive) {
        startGame();
        return;
      }
    }

    // Contrôles directionnels
    if (state.paused || state.countdown > 0 || !state.gameActive) return;

    switch (e.key) {
      case "ArrowUp":
        if (state.direction.y === 0) state.nextDirection = { x: 0, y: -1 };
        e.preventDefault();
        break;
      case "ArrowDown":
        if (state.direction.y === 0) state.nextDirection = { x: 0, y: 1 };
        e.preventDefault();
        break;
      case "ArrowLeft":
        if (state.direction.x === 0) state.nextDirection = { x: -1, y: 0 };
        e.preventDefault();
        break;
      case "ArrowRight":
        if (state.direction.x === 0) state.nextDirection = { x: 1, y: 0 };
        e.preventDefault();
        break;
    }
  });

  // ---------- Reset (confirm + password) ----------
  ui.resetBtn?.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir réinitialiser ton score Snake ?\nTon meilleur score sera définitivement perdu !"
    );
    if (!confirmReset) return;

    const password = prompt("🔒 Entre ton mot de passe pour confirmer :");
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
      socket.emit("snake:reset");
      showNotif("🔄 Score Snake réinitialisé avec succès !");
      myBest = 0;
      scoreAttente = null;
    } catch (err) {
      showNotif("⚠️ Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  });

  // ---------- Init UI ----------
  clearToBlack();
  if (ui.stopBtn) ui.stopBtn.style.display = "none";
}
