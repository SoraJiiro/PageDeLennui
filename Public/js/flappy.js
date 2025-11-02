export function initFlappy(socket) {
  const canvas = document.getElementById("flappyCanvas");
  const ctx = canvas.getContext("2d");
  const startBtn = document.getElementsByClassName("flappyStartBtn")[0];
  const scoreEl = document.getElementById("flappyScore");

  function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // ---------- Vars ----------
  let gravity, jump, pipeGap, pipeWidth, pipeSpeed;
  let birdY, birdVel, pipes, score, gameRunning;

  function updateScales() {
    // mise à l'échelle avec vp du user
    gravity = canvas.height * 0.00035;
    jump = -canvas.height * 0.009;
    pipeGap = canvas.height * 0.25;
    pipeWidth = canvas.width * 0.08;
    pipeSpeed = canvas.width * 0.0035;
  }

  const bird = {
    xRatio: 0.17, // position horizontale relative
    radiusRatio: 0.02, // taille relative
    get x() {
      return this.xRatio * canvas.width;
    },
    get radius() {
      return this.radiusRatio * canvas.height;
    },
    draw() {
      ctx.fillStyle = "#0f0";
      ctx.beginPath();
      ctx.arc(this.x, birdY, this.radius, 0, Math.PI * 2);
      ctx.fill();
    },
  };

  function resetGame() {
    updateScales();
    birdY = canvas.height / 3.55;
    birdVel = 0;
    pipes = [];
    score = 0;
    gameRunning = true;
    startBtn.style.display = "none";
  }

  function drawPipes() {
    ctx.fillStyle = "#0f0";
    pipes.forEach((p) => {
      // Tuyau haut
      ctx.fillRect(p.x, 0, pipeWidth, p.top);
      // Tuyau bas
      ctx.fillRect(
        p.x,
        p.top + pipeGap,
        pipeWidth,
        canvas.height - (p.top + pipeGap)
      );
    });
  }

  function update() {
    if (!gameRunning) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    birdVel += gravity;
    birdY += birdVel;

    if (pipes.length === 0 || pipes[pipes.length - 1].x < canvas.width * 0.65) {
      const topHeight = Math.random() * (canvas.height - pipeGap - 100) + 40;
      pipes.push({ x: canvas.width, top: topHeight, passed: false });
    }

    pipes.forEach((p) => {
      // Pipe passé
      p.x -= pipeSpeed;
      if (!p.passed && p.x + pipeWidth < bird.x - bird.radius) {
        score++;
        p.passed = true;
        flappyScore.textContent = `Score : ${score}`;
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

    if (birdY + bird.radius >= canvas.height || birdY - bird.radius <= 0) {
      gameOver();
    }

    requestAnimationFrame(update);
  }

  function gameOver() {
    gameRunning = false;
    startBtn.style.display = "block";
    startBtn.textContent = "Rejouer";
    if (socket) socket.emit("flappy:score", { score });
    score = 0;
    flappyScore.textContent = `Score : ${score}`;
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

    if (e.code === "Space" && gameRunning) {
      e.preventDefault();
      birdVel = jump;
    }
  });

  startBtn.addEventListener("click", () => {
    resetGame();
    update();
  });

  startBtn.style.display = "block";
  scoreEl.textContent = "Score : 0";
}
