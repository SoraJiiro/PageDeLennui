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
  const GAME_SPEED = 135;

  // ---------- État local ----------
  const state = {
    snake: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: null,
    score: 0,
    gameLoop: null,
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
  try {
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
      showNotif(`🐍 Nouveau record ! Score: ${myBest}`);
      scoreAttente = null;
    }
  });

  // ---------- Canvas sizing ----------
  ui.canvas.width = GRID_SIZE * CELL_SIZE;
  ui.canvas.height = GRID_SIZE * CELL_SIZE;

  // ---------- Canvas sizing ----------
  ui.canvas.width = GRID_SIZE * CELL_SIZE;
  ui.canvas.height = GRID_SIZE * CELL_SIZE;

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
    if (state.gameLoop) clearInterval(state.gameLoop);
    state.gameLoop = setInterval(update, GAME_SPEED);
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
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    ctx.fillStyle = "#0f0";
    ctx.font = "bold 40px monospace";
    ctx.textAlign = "center";

    if (state.countdown > 0) {
      ctx.fillText(
        state.countdown.toString(),
        ui.canvas.width / 2,
        ui.canvas.height / 2
      );
    } else {
      ctx.fillText("PAUSE", ui.canvas.width / 2, ui.canvas.height / 2);
      ctx.font = "18px monospace";
      ctx.fillText(
        `Appuie sur ${pauseKeyText} pour reprendre`,
        ui.canvas.width / 2,
        ui.canvas.height / 2 + 40
      );
    }
  }

  function update() {
    if (!state.gameActive) return;

    // Gestion du compte à rebours
    if (state.countdown > 0) {
      state.frameCount++;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

      draw();
      showPaused();

      if (state.frameCount % 60 === 0) {
        state.countdown--;
        if (state.countdown === 0) {
          state.paused = false;
          // Ajuster le temps de pause
          state.pausedTime = Date.now() - state.startTime - state.elapsedMs;
        }
      }

      return;
    }

    if (state.paused) {
      showPaused();
      return;
    }

    state.direction = state.nextDirection;
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

    draw();
  }

  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    // Dessiner la grille
    ctx.strokeStyle = "#4e3e5e";
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, ui.canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(ui.canvas.width, i * CELL_SIZE);
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
        seg.x * CELL_SIZE + 1,
        seg.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2
      );
    });

    // Dessiner la nourriture
    if (state.food) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(
        state.food.x * CELL_SIZE + 1,
        state.food.y * CELL_SIZE + 1,
        CELL_SIZE - 2,
        CELL_SIZE - 2
      );
    }

    // Afficher le score
    ctx.fillStyle = "#0f0";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `${String(state.score).padStart(3, "0")}`,
      ui.canvas.width - 10,
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
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
    } catch {}
  }

  function gameOver() {
    state.gameActive = false;
    stopTimer();
    if (state.gameLoop) clearInterval(state.gameLoop);

    const finalScore = state.score;
    socket.emit("snake:score", {
      score: finalScore,
      elapsedMs: state.elapsedMs,
      final: true,
    });
    scoreAttente = finalScore;
    showGameOver();
  }

  function showGameOver() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    ctx.fillStyle = "#0f0";
    ctx.font = "bold 40px monospace";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", ui.canvas.width / 2, ui.canvas.height / 2 - 20);

    ctx.font = "20px monospace";
    ctx.fillText(
      `Score: ${state.score}`,
      ui.canvas.width / 2,
      ui.canvas.height / 2 + 20
    );

    const totalSeconds = Math.floor(state.elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;

    ctx.fillText(
      `Temps: ${timeStr}`,
      ui.canvas.width / 2,
      ui.canvas.height / 2 + 50
    );

    ctx.font = "18px monospace";
    ctx.fillText(
      "Appuie sur ESPACE pour rejouer",
      ui.canvas.width / 2,
      ui.canvas.height / 2 + 90
    );
  }

  function startGame() {
    state.gameStarted = false;
    state.gameActive = false;
    state.paused = false;
    state.countdown = 0;
    initGame();
    if (ui.stopBtn) ui.stopBtn.style.display = "inline-block";
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
    if (state.gameLoop) clearInterval(state.gameLoop);
    if (ui.stopBtn) ui.stopBtn.style.display = "none";
    clearToBlack();
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
