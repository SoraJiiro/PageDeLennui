export function initFlappy(socket) {
  // ---------- Cache UI ----------
  const ui = {
    canvas: document.getElementById("flappyCanvas"),
    ctx: null,
    startBtn: document.getElementsByClassName("flappyStartBtn")[0],
    resetBtn: document.querySelector(".flappyResetBtn"),
    scoreEl: document.getElementById("flappyScore"),
  };
  if (!ui.canvas) return;
  ui.ctx = ui.canvas.getContext("2d");

  function resizeCanvas() {
    ui.canvas.width = ui.canvas.clientWidth;
    ui.canvas.height = ui.canvas.clientHeight * 0.88;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // ---------- Variables de jeu (échelle dynamique) ----------
  let gravity, jump, pipeGap, pipeWidth, pipeSpeed;
  let birdY, birdVel, pipes, score, gameRunning;

  function updateScales() {
    gravity = ui.canvas.height * 0.00035;
    jump = -ui.canvas.height * 0.009;
    pipeGap = ui.canvas.height * 0.25;
    pipeWidth = ui.canvas.width * 0.08;
    pipeSpeed = ui.canvas.width * 0.0035;
  }

  const bird = {
    xRatio: 0.17, // position horizontale relative
    radiusRatio: 0.02, // taille relative
    get x() {
      return this.xRatio * ui.canvas.width;
    },
    get radius() {
      return this.radiusRatio * ui.canvas.height;
    },
    draw() {
      ui.ctx.fillStyle = "#0f0";
      ui.ctx.beginPath();
      ui.ctx.arc(this.x, birdY, this.radius, 0, Math.PI * 2);
      ui.ctx.fill();
    },
  };

  function resetGame() {
    updateScales();
    birdY = ui.canvas.height / 3.55;
    birdVel = 0;
    pipes = [];
    score = 0;
    gameRunning = true;
    ui.startBtn.style.display = "none";
    if (ui.scoreEl) ui.scoreEl.textContent = "Score : 0";
  }

  function drawPipes() {
    ui.ctx.fillStyle = "#0f0";
    pipes.forEach((p) => {
      // Tuyau haut
      ui.ctx.fillRect(p.x, 0, pipeWidth, p.top);
      // Tuyau bas
      ui.ctx.fillRect(
        p.x,
        p.top + pipeGap,
        pipeWidth,
        ui.canvas.height - (p.top + pipeGap)
      );
    });
  }

  function update() {
    if (!gameRunning) return;

    ui.ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
    ui.ctx.fillStyle = "#000";
    ui.ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    birdVel += gravity;
    birdY += birdVel;

    if (
      pipes.length === 0 ||
      pipes[pipes.length - 1].x < ui.canvas.width * 0.65
    ) {
      const topHeight = Math.random() * (ui.canvas.height - pipeGap - 100) + 40;
      pipes.push({ x: ui.canvas.width, top: topHeight, passed: false });
    }

    pipes.forEach((p) => {
      // Pipe passé
      p.x -= pipeSpeed;
      if (!p.passed && p.x + pipeWidth < bird.x - bird.radius) {
        score++;
        p.passed = true;
        ui.scoreEl.textContent = `Score : ${score}`;
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

    if (birdY + bird.radius >= ui.canvas.height || birdY - bird.radius <= 0) {
      gameOver();
    }

    requestAnimationFrame(update);
  }

  function gameOver() {
    gameRunning = false;
    ui.startBtn.style.display = "block";
    ui.startBtn.textContent = "Rejouer";
    showGameOver();
    if (socket) socket.emit("flappy:score", { score });
  }

  function showGameOver() {
    // Overlay sombre
    ui.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ui.ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    // Texte
    ui.ctx.fillStyle = "#0f0";
    ui.ctx.font = "bold 40px monospace";
    ui.ctx.textAlign = "center";
    ui.ctx.fillText(
      "GAME OVER",
      ui.canvas.width / 2,
      ui.canvas.height / 2 - 20
    );

    ui.ctx.font = "20px monospace";
    ui.ctx.fillText(
      `Score: ${score}`,
      ui.canvas.width / 2,
      ui.canvas.height / 2 + 20
    );

    ui.ctx.font = "18px monospace";
    ui.ctx.fillText(
      "Appuie sur ESPACE pour rejouer",
      ui.canvas.width / 2,
      ui.canvas.height / 2 + 60
    );
  }

  // ---------- Eventlisteners ----------
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const tag = active && active.tagName;
    const isTyping =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (active && active.isContentEditable);
    if (isTyping) return;

    if (e.code === "Space") {
      e.preventDefault();
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

  // ---------- Reset (confirm + password) ----------
  ui.resetBtn?.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir réinitialiser ton score Flappy ?\nTon meilleur score sera définitivement perdu !"
    );
    if (!confirmReset) return;

    const password = prompt("🔒 Entre ton mot de passe pour confirmer :");
    if (!password) return;

    try {
      const res = await fetch("/api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert("❌ Mot de passe incorrect !");
        return;
      }
      socket.emit("flappy:reset");
      alert("✅ Score Flappy réinitialisé avec succès !");
    } catch (err) {
      alert("🚨 Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  });

  // ---------- Init UI ----------
  ui.startBtn.style.display = "block";
  ui.scoreEl.textContent = "Score : 0";
}
