import { showNotif, keys, darken } from "./util.js";

const CONSTANTS = {
  GRID_SIZE: 23,
  MAX_LENGTH: 52,
  GAME_SPEED: 100, // ms per tick
};

class SnakeGame {
  constructor(canvas, socket, uiElements) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.socket = socket;
    this.ui = uiElements;

    this.state = {
      snake: [],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: null,
      score: 0,
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

    this.cellSize = 23;
    this.uiColor = "#00ff00";
    this.pauseKeyText = "P";
    this.myBest = 0;
    this.scoreAttente = null;

    this.initSettings();
    this.bindEvents();
    this.resize();
    this.clearToBlack();
    if (this.ui.stopBtn) this.ui.stopBtn.style.display = "none";
  }

  initSettings() {
    // UI Color
    const computedStyle = getComputedStyle(document.documentElement);
    this.uiColor =
      computedStyle.getPropertyValue("--primary-color").trim() || "#00ff00";

    window.addEventListener("uiColor:changed", (e) => {
      if (e.detail?.color) this.uiColor = e.detail.color;
    });

    // Pause Key
    this.pauseKeyText = keys?.default?.[0] || "P";
    window.addEventListener("pauseKey:changed", (e) => {
      if (e.detail?.key?.length === 1)
        this.pauseKeyText = e.detail.key.toUpperCase();
    });

    // Socket Events
    this.socket.on("snake:leaderboard", (arr) => this.handleLeaderboard(arr));
    this.socket.on("you:name", (name) => {
      this.myName = name;
    });
  }

  handleLeaderboard(arr) {
    if (!Array.isArray(arr) || !this.myName) return;
    const me = arr.find((e) => e.pseudo === this.myName);
    const prevBest = this.myBest;
    this.myBest = me ? Number(me.score) || 0 : 0;

    if (
      this.scoreAttente != null &&
      this.myBest >= this.scoreAttente &&
      this.myBest > prevBest
    ) {
      showNotif(
        `🐍 Nouveau record ! Score: ${this.myBest.toLocaleString("fr-FR")}`
      );
      this.scoreAttente = null;
    }
  }

  resize() {
    if (!this.canvas) return;
    try {
      const rect = this.canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      const clientW = Math.max(1, Math.round(rect.width));
      const clientH = Math.max(1, Math.round(rect.height));

      this.cellSize =
        Math.floor(Math.min(clientW, clientH) / CONSTANTS.GRID_SIZE) || 1;
      const desiredSize = this.cellSize * CONSTANTS.GRID_SIZE;

      // Set display size
      this.canvas.style.width = `${desiredSize}px`;
      this.canvas.style.height = `${desiredSize}px`;

      // Set actual size
      this.canvas.width = Math.floor(desiredSize * ratio);
      this.canvas.height = Math.floor(desiredSize * ratio);

      // Normalize coordinate system
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    } catch (e) {
      console.warn("Snake resize failed", e);
    }
  }

  bindEvents() {
    window.addEventListener("resize", () => {
      clearTimeout(this._resizeTO);
      this._resizeTO = setTimeout(() => this.resize(), 100);
    });

    this.ui.startBtn?.addEventListener("click", () => {
      if (!this.state.gameStarted || !this.state.gameActive) this.start();
    });

    this.ui.stopBtn?.addEventListener("click", () => this.stop());

    this.ui.resetBtn?.addEventListener("click", () => this.handleReset());

    document.addEventListener("keydown", (e) => this.handleInput(e));
  }

  handleInput(e) {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    )
      return;

    const snakeSection = document.getElementById("stage10");
    if (!snakeSection) return;
    const rect = snakeSection.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) return;

    // Pause
    if (keys.default.includes(e.key)) {
      e.preventDefault();
      this.togglePause();
      return;
    }

    // Restart
    if (e.code === "Space") {
      e.preventDefault();
      if (
        !this.state.gameActive &&
        !this.state.paused &&
        this.state.countdown === 0
      ) {
        this.start();
      }
      return;
    }

    if (!this.state.gameActive || this.state.paused || this.state.countdown > 0)
      return;

    switch (e.key) {
      case "ArrowUp":
        if (this.state.direction.y === 0)
          this.state.nextDirection = { x: 0, y: -1 };
        e.preventDefault();
        break;
      case "ArrowDown":
        if (this.state.direction.y === 0)
          this.state.nextDirection = { x: 0, y: 1 };
        e.preventDefault();
        break;
      case "ArrowLeft":
        if (this.state.direction.x === 0)
          this.state.nextDirection = { x: -1, y: 0 };
        e.preventDefault();
        break;
      case "ArrowRight":
        if (this.state.direction.x === 0)
          this.state.nextDirection = { x: 1, y: 0 };
        e.preventDefault();
        break;
    }
  }

  togglePause() {
    if (!this.state.gameStarted || !this.state.gameActive) return;

    if (this.state.paused && this.state.countdown === 0) {
      this.state.countdown = 3;
      this.state.frameCount = 0;
    } else if (!this.state.paused && this.state.countdown === 0) {
      this.state.paused = true;
      // Anti-cheat / Boss key feature
      try {
        window.open("../search.html", "_blank");
      } catch {
        window.open("about:newtab", "_blank");
      }
    }
  }

  start() {
    this.state = {
      ...this.state,
      snake: [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 },
      ],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      score: 0,
      gameActive: true,
      gameStarted: true,
      startTime: Date.now(),
      elapsedMs: 0,
      pausedTime: 0,
      paused: false,
      countdown: 0,
      tickAccumulator: 0,
      lastFrameTime: 0,
    };

    this.state.prevSnake = this.state.snake.map((s) => ({ ...s }));

    this.spawnFood();
    this.startTimer();
    this.resize(); // Ensure correct size

    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);
    this.state.rafId = requestAnimationFrame((ts) => this.loop(ts));

    if (this.ui.stopBtn) this.ui.stopBtn.style.display = "inline-block";
    this.removeDOMGameOverOverlay();
  }

  stop() {
    if (!this.state.gameStarted) return;

    this.socket.emit("snake:score", {
      score: this.state.score,
      elapsedMs: this.state.elapsedMs,
      final: true,
    });

    this.state.gameActive = false;
    this.state.gameStarted = false;
    this.stopTimer();
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);

    if (this.ui.stopBtn) this.ui.stopBtn.style.display = "none";
    this.clearToBlack();
    this.removeDOMGameOverOverlay();
    showNotif("# Partie stoppée.");
  }

  gameOver() {
    this.state.gameActive = false;
    this.stopTimer();
    if (this.state.rafId) cancelAnimationFrame(this.state.rafId);

    this.socket.emit("snake:score", {
      score: this.state.score,
      elapsedMs: this.state.elapsedMs,
      final: true,
    });
    this.scoreAttente = this.state.score;

    this.resize(); // Ensure buffer is correct
    this.drawGameOver();
    this.showDOMGameOverOverlay();
  }

  loop(ts) {
    if (!this.state.lastFrameTime) this.state.lastFrameTime = ts;
    const delta = ts - this.state.lastFrameTime;
    this.state.lastFrameTime = ts;

    if (this.state.countdown > 0) {
      this.state.frameCount++;
      this.draw(0);
      if (this.state.frameCount % 60 === 0) {
        this.state.countdown--;
        if (this.state.countdown === 0) {
          this.state.paused = false;
          this.state.pausedTime =
            Date.now() - this.state.startTime - this.state.elapsedMs;
        }
      }
      this.state.rafId = requestAnimationFrame((t) => this.loop(t));
      return;
    }

    if (this.state.paused) {
      this.draw(0);
      this.state.rafId = requestAnimationFrame((t) => this.loop(t));
      return;
    }

    this.state.tickAccumulator += delta;
    let ticked = false;
    while (this.state.tickAccumulator >= CONSTANTS.GAME_SPEED) {
      this.tick();
      this.state.tickAccumulator -= CONSTANTS.GAME_SPEED;
      ticked = true;
    }

    if (ticked && this.state.gameActive) {
      this.state.elapsedMs =
        Date.now() - this.state.startTime - this.state.pausedTime;
    }

    const progress = Math.min(
      1,
      this.state.tickAccumulator / CONSTANTS.GAME_SPEED
    );
    this.draw(progress);

    if (this.state.gameActive) {
      this.state.rafId = requestAnimationFrame((t) => this.loop(t));
    }
  }

  tick() {
    if (!this.state.gameActive) return;

    this.state.direction = this.state.nextDirection;
    this.state.prevSnake = this.state.snake.map((s) => ({ ...s }));

    const head = {
      x: this.state.snake[0].x + this.state.direction.x,
      y: this.state.snake[0].y + this.state.direction.y,
    };

    // Collisions
    if (
      head.x < 0 ||
      head.x >= CONSTANTS.GRID_SIZE ||
      head.y < 0 ||
      head.y >= CONSTANTS.GRID_SIZE ||
      this.state.snake.some((s) => s.x === head.x && s.y === head.y)
    ) {
      this.gameOver();
      return;
    }

    this.state.snake.unshift(head);

    if (head.x === this.state.food.x && head.y === this.state.food.y) {
      this.state.score++;
      if (this.state.snake.length >= CONSTANTS.MAX_LENGTH)
        this.state.snake.pop();
      this.spawnFood();
    } else {
      this.state.snake.pop();
    }
  }

  spawnFood() {
    let valid = false;
    while (!valid) {
      this.state.food = {
        x: Math.floor(Math.random() * CONSTANTS.GRID_SIZE),
        y: Math.floor(Math.random() * CONSTANTS.GRID_SIZE),
      };
      valid = !this.state.snake.some(
        (s) => s.x === this.state.food.x && s.y === this.state.food.y
      );
    }
  }

  draw(progress = 1) {
    // Ensure size is correct
    this.resize();

    const cssSize = this.cellSize * CONSTANTS.GRID_SIZE;

    // Background
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, cssSize, cssSize);

    // Grid
    this.ctx.strokeStyle = "#4e3e5e";
    this.ctx.lineWidth = 1;
    for (let i = 0; i <= CONSTANTS.GRID_SIZE; i++) {
      const pos = i * this.cellSize;
      this.ctx.beginPath();
      this.ctx.moveTo(pos, 0);
      this.ctx.lineTo(pos, cssSize);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(0, pos);
      this.ctx.lineTo(cssSize, pos);
      this.ctx.stroke();
    }

    // Snake
    for (let i = 0; i < this.state.snake.length; i++) {
      const curr = this.state.snake[i];
      const prev = this.state.prevSnake[i] || curr;

      const x = prev.x + (curr.x - prev.x) * progress;
      const y = prev.y + (curr.y - prev.y) * progress;

      this.ctx.fillStyle = this.uiColor;
      if (i !== 0) this.ctx.globalAlpha = 0.8;

      this.ctx.fillRect(
        x * this.cellSize + 1,
        y * this.cellSize + 1,
        this.cellSize - 2,
        this.cellSize - 2
      );
      this.ctx.globalAlpha = 1.0;
    }

    // Food
    if (this.state.food) {
      this.ctx.fillStyle = "#ff0000";
      this.ctx.fillRect(
        this.state.food.x * this.cellSize + 1,
        this.state.food.y * this.cellSize + 1,
        this.cellSize - 2,
        this.cellSize - 2
      );
    }

    // Score
    this.ctx.fillStyle = this.uiColor;
    this.ctx.font = "bold 24px monospace";
    this.ctx.textAlign = "right";
    this.ctx.fillText(
      this.state.score.toLocaleString("fr-FR").replace(/\s/g, "\u00a0"),
      cssSize - 10,
      30
    );

    // Pause/Countdown Overlay
    if (this.state.paused || this.state.countdown > 0) {
      this.drawPauseOverlay(cssSize);
    }
  }

  drawPauseOverlay(cssSize) {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, cssSize, cssSize);

    this.ctx.fillStyle = this.uiColor;
    this.ctx.font = "bold 40px monospace";
    this.ctx.textAlign = "center";

    if (this.state.countdown > 0) {
      this.ctx.fillText(
        this.state.countdown.toString(),
        cssSize / 2,
        cssSize / 2
      );
    } else {
      this.ctx.fillText("PAUSE", cssSize / 2, cssSize / 2);
      this.ctx.font = "18px monospace";
      this.ctx.fillText(
        `Appuie sur ${this.pauseKeyText} pour reprendre`,
        cssSize / 2,
        cssSize / 2 + 40
      );
    }
  }

  drawGameOver() {
    const cssSize = this.cellSize * CONSTANTS.GRID_SIZE;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    this.ctx.fillRect(0, 0, cssSize, cssSize);

    this.ctx.fillStyle = this.uiColor;
    this.ctx.font = "bold 40px monospace";
    this.ctx.textAlign = "center";
    this.ctx.fillText("GAME OVER", cssSize / 2, cssSize / 2 - 20);

    this.ctx.font = "20px monospace";
    this.ctx.fillText(
      `Score: ${this.state.score
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")}`,
      cssSize / 2,
      cssSize / 2 + 20
    );

    const totalSeconds = Math.floor(this.state.elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;

    this.ctx.fillText(`Temps: ${timeStr}`, cssSize / 2, cssSize / 2 + 50);
    this.ctx.font = "18px monospace";
    this.ctx.fillText(
      "Appuie sur ESPACE pour rejouer",
      cssSize / 2,
      cssSize / 2 + 90
    );
  }

  showDOMGameOverOverlay() {
    this.removeDOMGameOverOverlay();
    const parent = this.canvas.parentElement || document.body;
    if (getComputedStyle(parent).position === "static")
      parent.style.position = "relative";

    const rect = this.canvas.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();

    const overlay = document.createElement("div");
    overlay.className = "snake-dom-gameover-overlay";
    overlay.style.cssText = `
      position: absolute;
      left: ${rect.left - parentRect.left}px;
      top: ${rect.top - parentRect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      background: rgba(0,0,0,0.8);
      color: ${this.uiColor};
      z-index: 9999;
    `;

    overlay.innerHTML = `
      <div style="text-align:center;font-family:monospace">
        <div style="font-weight:700;font-size:32px;margin-bottom:8px">GAME OVER</div>
        <div style="font-size:18px">Score: ${this.state.score
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</div>
      </div>
    `;
    parent.appendChild(overlay);
  }

  removeDOMGameOverOverlay() {
    const parent = this.canvas.parentElement || document.body;
    const existing = parent.querySelector(".snake-dom-gameover-overlay");
    if (existing) existing.remove();
  }

  clearToBlack() {
    const cssSize = this.cellSize * CONSTANTS.GRID_SIZE;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, cssSize, cssSize);
  }

  startTimer() {
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);
    this.state.timerInterval = setInterval(() => {
      if (
        this.state.gameActive &&
        !this.state.paused &&
        this.state.countdown === 0
      ) {
        this.state.elapsedMs =
          Date.now() - this.state.startTime - this.state.pausedTime;
      }
    }, 100);
  }

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  }

  async handleReset() {
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
      this.socket.emit("snake:reset");
      showNotif("🔄 Score Snake réinitialisé avec succès !");
      this.myBest = 0;
      this.scoreAttente = null;
    } catch (err) {
      showNotif("⚠️ Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  }
}

export function initSnake(socket) {
  const ui = {
    canvas: document.getElementById("snake-canvas"),
    startBtn: document.querySelector(".snake-start"),
    stopBtn: document.querySelector(".snake-stop"),
    resetBtn: document.querySelector(".snake-reset"),
  };

  if (!ui.canvas) return;

  new SnakeGame(ui.canvas, socket, ui);
}
