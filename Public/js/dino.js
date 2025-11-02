export function initDino(socket) {
  const canvas = document.querySelector(".game");
  if (!canvas) return;
  const c = canvas.getContext("2d");
  const yourScoreEl = document.getElementById("your-score");
  if (yourScoreEl) yourScoreEl.textContent = "0";

  function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  setupDinoReset(socket);

  // ---------- Consts ----------
  const GRAVITY = 1.2;
  const MIN_JUMP_VELOCITY = 18;
  const MAX_JUMP_VELOCITY = 20;
  const INITIAL_SPEED = 6;
  const SPEED_INCREMENT = 0.3;
  const MAX_SPEED = 14;
  const MIN_OBSTACLE_DISTANCE = 300;
  const MAX_OBSTACLE_DISTANCE = 600;
  const OBSTACLES_BETWEEN_SPEED_UP = 2;
  const CACTUS_SPACING = 32;

  let gameSpeed = INITIAL_SPEED;
  let score = 0;
  let gameOver = false;
  let isFirstStart = true;
  let obstaclesPassed = 0;
  let frameCount = 0;
  let spacePressed = false;
  let jumpStartTime = 0;

  const dino = {
    x: 80,
    y: 0,
    width: 40,
    height: 40,
    dy: 0,
    jumping: false,
    jumpVelocity: MIN_JUMP_VELOCITY,

    draw() {
      c.fillStyle = "#0f0";
      c.fillRect(
        this.x,
        canvas.height - this.y - this.height,
        this.width,
        this.height
      );
    },

    update() {
      if (this.jumping) {
        this.dy -= GRAVITY;
        this.y += this.dy;
      }

      if (this.y <= 0) {
        this.y = 0;
        this.dy = 0;
        this.jumping = false;
      }

      this.draw();
    },

    jump(velocity) {
      if (!this.jumping && this.y === 0) {
        this.jumpVelocity = velocity;
        this.dy = velocity;
        this.jumping = true;
      }
    },

    reset() {
      this.y = 0;
      this.dy = 0;
      this.jumping = false;
      this.jumpVelocity = MIN_JUMP_VELOCITY;
    },
  };

  class Cloud {
    constructor() {
      this.x = canvas.width;
      this.y = Math.random() * (canvas.height * 0.4);
      this.width = 50 + Math.random() * 40;
      this.height = 15 + Math.random() * 10;
      this.speed = 1.5 + Math.random() * 1;
    }

    draw() {
      c.fillStyle = "#0f0";
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
      const baseX = canvas.width + minDistance + distance;

      const count = Math.floor(Math.random() * 3) + 1;
      this.cacti = [];

      for (let i = 0; i < count; i++) {
        const type = Math.floor(Math.random() * 3);
        let width, height;

        switch (type) {
          case 0: // petit
            width = 19;
            height = 45;
            break;
          case 1: // moyen
            width = 20;
            height = 57;
            break;
          case 2: // grand
            width = 22;
            height = 66;
            break;
        }

        this.cacti.push({
          x: baseX + i * CACTUS_SPACING,
          width,
          height,
          type,
        });
      }

      this.passed = false;
    }

    draw() {
      c.fillStyle = "#0f0";
      this.cacti.forEach((cactus) => {
        const groundY = canvas.height - 10;
        const cactusY = groundY - cactus.height;

        // Corps principal
        c.fillRect(cactus.x, cactusY, cactus.width, cactus.height);

        // Bras
        const armHeight = Math.max(10, Math.floor(cactus.height * 0.35));
        const armY = cactusY + Math.floor(cactus.height * 0.4);

        c.fillRect(cactus.x - 6, armY, 6, armHeight);
        c.fillRect(cactus.x + cactus.width, armY + 3, 6, armHeight - 5);
      });
    }

    update() {
      this.cacti.forEach((cactus) => {
        cactus.x -= gameSpeed;
      });
      this.draw();
    }

    collides() {
      const dinoLeft = dino.x + 5;
      const dinoRight = dino.x + dino.width - 5;
      const dinoTop = canvas.height - dino.y - dino.height;
      const dinoBottom = canvas.height - dino.y - 5;

      for (let cactus of this.cacti) {
        const cactusLeft = cactus.x;
        const cactusRight = cactus.x + cactus.width;
        const cactusTop = canvas.height - 10 - cactus.height;
        const cactusBottom = canvas.height - 10;

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

    getLeftmostX() {
      return Math.min(...this.cacti.map((c) => c.x));
    }
  }

  let cactusGroups = [];
  let clouds = [];
  let cloudTimer = 0;

  function spawnCactusGroup() {
    if (cactusGroups.length === 0) {
      cactusGroups.push(new CactusGroup(0));
    } else {
      const lastGroup = cactusGroups[cactusGroups.length - 1];
      if (lastGroup.getRightmostX() < canvas.width - MIN_OBSTACLE_DISTANCE) {
        cactusGroups.push(new CactusGroup(0));
      }
    }
  }

  function loop() {
    if (gameOver) return;

    frameCount++;

    // Fond noir
    c.fillStyle = "#000";
    c.fillRect(0, 0, canvas.width, canvas.height);

    // Sol
    c.fillStyle = "#0f0";
    const groundY = canvas.height - 10;
    c.fillRect(0, groundY, canvas.width, 10);

    // Nuages
    cloudTimer++;
    if (cloudTimer > 100) {
      clouds.push(new Cloud());
      cloudTimer = 0;
    }
    clouds = clouds.filter((cl) => {
      cl.update();
      return cl.x + cl.width > 0;
    });

    dino.update(); // Init dino

    spawnCactusGroup();

    // Update + collision des groupes
    cactusGroups = cactusGroups.filter((group) => {
      group.update();

      // Vérif si le groupe est passé
      if (!group.passed && group.getRightmostX() < dino.x) {
        group.passed = true;
        obstaclesPassed++;

        // Vitess ++ si 2 obstacles passés
        if (
          obstaclesPassed % OBSTACLES_BETWEEN_SPEED_UP === 0 &&
          gameSpeed < MAX_SPEED
        ) {
          gameSpeed = Math.min(gameSpeed + SPEED_INCREMENT, MAX_SPEED);
        }
      }

      // Collision
      if (group.collides()) {
        gameOver = true;
        socket.emit("dino:score", { score });
        showGameOver();
        return false;
      }

      // Garder seulement les groupes visibles
      return group.getRightmostX() > 0;
    });

    score += Math.floor(gameSpeed * 0.2); // Score comme le dino chrome

    // Affichage du score
    c.fillStyle = "#0f0";
    c.font = "bold 24px monospace";
    c.textAlign = "right";
    c.fillText(
      `${String(Math.floor(score)).padStart(8, "0")}`,
      canvas.width - 20,
      30
    );

    // Affichage de la vitesse
    c.font = "14px monospace";
    c.fillText(`Vitesse : ${gameSpeed.toFixed(1)}`, canvas.width - 20, 50);

    requestAnimationFrame(loop);
  }

  function showGameOver() {
    c.fillStyle = "rgba(0, 0, 0, 0.8)";
    c.fillRect(0, 0, canvas.width, canvas.height);

    c.fillStyle = "#0f0";
    c.font = "bold 40px monospace";
    c.textAlign = "center";
    c.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);

    c.font = "20px monospace";
    c.fillText(
      `Score: ${Math.floor(score)}`,
      canvas.width / 2,
      canvas.height / 2 + 20
    );

    c.font = "18px monospace";
    c.fillText(
      "Appuie sur ESPACE pour rejouer",
      canvas.width / 2,
      canvas.height / 2 + 60
    );
  }

  function startGame() {
    gameOver = false;
    isFirstStart = false;
    score = 0;
    obstaclesPassed = 0;
    gameSpeed = INITIAL_SPEED;
    frameCount = 0;
    cactusGroups = [];
    clouds = [];
    dino.reset();
    loop();
  }

  // ---------- Eventlisteners ----------
  document.querySelector(".dino-start")?.addEventListener("click", () => {
    if (isFirstStart || gameOver) startGame();
    else if (!dino.jumping) dino.jump(MAX_JUMP_VELOCITY);
  });

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

      if (isFirstStart || gameOver) {
        startGame();
        return;
      }

      if (!dino.jumping && dino.y === 0) {
        jumpStartTime = Date.now();
        dino.jump(MAX_JUMP_VELOCITY);
      }
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      e.preventDefault();

      if (dino.jumping && dino.dy > 0) {
        const pressDuration = Date.now() - jumpStartTime;

        if (pressDuration < 125) {
          dino.dy *= 0.62;
        }
      }
    }
  });
}

function setupDinoReset(socket) {
  const resetBtn = document.querySelector(".dino-reset");
  if (!resetBtn) return;

  resetBtn.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir réinitialiser ton score Dino ?\nTon meilleur score sera définitivement perdu !"
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

      socket.emit("dino:reset");
      alert("✅ Score Dino réinitialisé avec succès !");
    } catch (err) {
      alert("🚨 Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  });
}
