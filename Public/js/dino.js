import { showNotif } from "./util.js";

export function initDino(socket) {
  // ---------- Cache UI ----------
  const ui = {
    canvas: document.querySelector(".game"),
    startBtn: document.querySelector(".dino-start"),
    resetBtn: document.querySelector(".dino-reset"),
    yourScoreEl: document.getElementById("your-score"),
  };
  if (!ui.canvas) return;
  const c = ui.canvas.getContext("2d");
  if (ui.yourScoreEl) ui.yourScoreEl.textContent = "0";

  // ---------- Constantes Gameplay ----------
  const GRAVITY = 1.1;
  const MIN_JUMP_VELOCITY = 19;
  const MAX_JUMP_VELOCITY = 21;
  const INITIAL_SPEED = 6;
  const SPEED_INCREMENT = 0.3;
  const MAX_SPEED = 14;
  const MIN_OBSTACLE_DISTANCE = 300;
  const MAX_OBSTACLE_DISTANCE = 600;
  const OBSTACLES_BETWEEN_SPEED_UP = 2;
  const CACTUS_SPACING = 32;

  // ---------- Etat local ----------
  const state = {
    gameSpeed: INITIAL_SPEED,
    score: 0,
    gameOver: false,
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

  // ---------- Pseudo + meilleur score ----------
  let myName = null;
  let myBest = 0;
  let scoreAttente = null;
  socket.on("you:name", (name) => {
    myName = name;
  });
  socket.on("dino:leaderboard", (arr) => {
    if (!Array.isArray(arr) || !myName) return;
    const me = arr.find((e) => e.pseudo === myName);
    const prevBest = myBest;
    myBest = me ? Number(me.score) || 0 : 0;
    if (scoreAttente != null && myBest >= scoreAttente && myBest > prevBest) {
      showNotif(`🦖 Nouveau record ! Score: ${myBest}`);
      scoreAttente = null;
    }
  });

  // ---------- Canvas sizing ----------
  function resizeCanvas() {
    ui.canvas.width = ui.canvas.clientWidth;
    ui.canvas.height = ui.canvas.clientHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // ---------- Entités ----------
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
        ui.canvas.height - this.y - this.height,
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
      this.x = ui.canvas.width;
      this.y = Math.random() * (ui.canvas.height * 0.4);
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
      const baseX = ui.canvas.width + minDistance + distance;

      const count = Math.floor(Math.random() * 3) + 1;
      this.cacti = [];

      for (let i = 0; i < count; i++) {
        const type = Math.floor(Math.random() * 3);
        let width, height;
        switch (type) {
          case 0:
            width = 19;
            height = 45;
            break;
          case 1:
            width = 20;
            height = 57;
            break;
          case 2:
            width = 22;
            height = 66;
            break;
        }
        this.cacti.push({ x: baseX + i * CACTUS_SPACING, width, height, type });
      }
      this.passed = false;
    }

    draw() {
      c.fillStyle = "#0f0";
      this.cacti.forEach((cactus) => {
        const groundY = ui.canvas.height - 10;
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
        cactus.x -= state.gameSpeed;
      });
      this.draw();
    }

    collides() {
      const dinoLeft = dino.x + 5;
      const dinoRight = dino.x + dino.width - 5;
      const dinoTop = ui.canvas.height - dino.y - dino.height;
      const dinoBottom = ui.canvas.height - dino.y - 5;

      for (let cactus of this.cacti) {
        const cactusLeft = cactus.x;
        const cactusRight = cactus.x + cactus.width;
        const cactusTop = ui.canvas.height - 10 - cactus.height;
        const cactusBottom = ui.canvas.height - 10;
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
      if (lastGroup.getRightmostX() < ui.canvas.width - MIN_OBSTACLE_DISTANCE) {
        state.cactusGroups.push(new CactusGroup(0));
      }
    }
  }

  function showPaused() {
    c.fillStyle = "rgba(0, 0, 0, 0.7)";
    c.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    c.fillStyle = "#0f0";
    c.font = "bold 40px monospace";
    c.textAlign = "center";

    if (state.countdown > 0) {
      c.fillText(
        state.countdown.toString(),
        ui.canvas.width / 2,
        ui.canvas.height / 2
      );
    } else {
      c.fillText("PAUSE", ui.canvas.width / 2, ui.canvas.height / 2);
      c.font = "18px monospace";
      c.fillText(
        "Appuie sur P pour reprendre",
        ui.canvas.width / 2,
        ui.canvas.height / 2 + 40
      );
    }
  }

  function loop() {
    if (state.gameOver) return;

    // Gestion du compte à rebours
    if (state.countdown > 0) {
      state.frameCount++;

      // Dessiner le jeu en arrière-plan
      c.fillStyle = "#000";
      c.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

      c.fillStyle = "#0f0";
      const groundY = ui.canvas.height - 10;
      c.fillRect(0, groundY, ui.canvas.width, 10);

      state.clouds.forEach((cl) => cl.draw());
      dino.draw();
      state.cactusGroups.forEach((group) => group.draw());

      // Afficher le compte à rebours
      showPaused();

      // Décrémenter toutes les 60 frames (environ 1 seconde)
      if (state.frameCount % 60 === 0) {
        state.countdown--;
        if (state.countdown === 0) {
          state.paused = false;
        }
      }

      requestAnimationFrame(loop);
      return;
    }

    // Si en pause (sans compte à rebours)
    if (state.paused) {
      showPaused();
      requestAnimationFrame(loop);
      return;
    }

    state.frameCount++;

    // Fond noir
    c.fillStyle = "#000";
    c.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    // Sol
    c.fillStyle = "#0f0";
    const groundY = ui.canvas.height - 10;
    c.fillRect(0, groundY, ui.canvas.width, 10);

    // Nuages
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

    // Update + collision des groupes
    state.cactusGroups = state.cactusGroups.filter((group) => {
      group.update();

      // Vérif si le groupe est passé
      if (!group.passed && group.getRightmostX() < dino.x) {
        group.passed = true;
        state.obstaclesPassed++;
        // Vitesse ++ si 2 obstacles passés
        if (
          state.obstaclesPassed % OBSTACLES_BETWEEN_SPEED_UP === 0 &&
          state.gameSpeed < MAX_SPEED
        ) {
          state.gameSpeed = Math.min(
            state.gameSpeed + SPEED_INCREMENT,
            MAX_SPEED
          );
        }
      }

      // Collision
      if (group.collides()) {
        state.gameOver = true;
        const finalScore = Math.floor(state.score);
        socket.emit("dino:score", { score: finalScore });
        // Attendre la confirmation via le leaderboard serveur
        scoreAttente = finalScore;
        showGameOver();
        return false;
      }

      // Garder seulement les groupes visibles
      return group.getRightmostX() > 0;
    });

    state.score += Math.floor(state.gameSpeed * 0.2); // Score comme le dino chrome

    // Affichage du score
    c.fillStyle = "#0f0";
    c.font = "bold 24px monospace";
    c.textAlign = "right";
    c.fillText(
      `${String(Math.floor(state.score)).padStart(8, "0")}`,
      ui.canvas.width - 20,
      30
    );

    // Affichage de la vitesse
    c.font = "14px monospace";
    c.fillText(
      `Vitesse : ${state.gameSpeed.toFixed(1)}`,
      ui.canvas.width - 20,
      50
    );

    requestAnimationFrame(loop);
  }

  function showGameOver() {
    c.fillStyle = "rgba(0, 0, 0, 0.8)";
    c.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

    c.fillStyle = "#0f0";
    c.font = "bold 40px monospace";
    c.textAlign = "center";
    c.fillText("GAME OVER", ui.canvas.width / 2, ui.canvas.height / 2 - 20);

    c.font = "20px monospace";
    c.fillText(
      `Score: ${Math.floor(state.score)}`,
      ui.canvas.width / 2,
      ui.canvas.height / 2 + 20
    );

    c.font = "18px monospace";
    c.fillText(
      "Appuie sur ESPACE pour rejouer",
      ui.canvas.width / 2,
      ui.canvas.height / 2 + 60
    );
  }

  function startGame() {
    state.gameOver = false;
    state.isFirstStart = false;
    state.score = 0;
    state.obstaclesPassed = 0;
    state.gameSpeed = INITIAL_SPEED;
    state.frameCount = 0;
    state.cactusGroups = [];
    state.clouds = [];
    dino.reset();
    loop();
  }

  // ---------- Ecouteurs UI ----------
  ui.startBtn?.addEventListener("click", () => {
    if (state.isFirstStart || state.gameOver) startGame();
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

    // Vérifier que la section Dino (stage2) est visible
    const dinoSection = document.getElementById("stage2");
    if (!dinoSection) return;
    const rect = dinoSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (!isVisible) return;

    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      // Ne pas permettre la pause si le jeu n'a pas démarré ou est terminé
      if (state.isFirstStart || state.gameOver) return;

      if (state.paused && state.countdown === 0) {
        // Reprendre avec compte à rebours
        state.countdown = 3;
        state.frameCount = 0;
      } else if (!state.paused && state.countdown === 0) {
        // Mettre en pause
        state.paused = true;
        try {
          window.open("../fake.html", "_blank");
          console.log("Chrome save");
        } catch {
          window.open("about:newtab", "_blank");
          console.log("Firefox save");
        }
      }
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      if (state.isFirstStart || state.gameOver) {
        startGame();
        return;
      }
      // Empêcher le saut pendant la pause
      if (state.paused || state.countdown > 0) return;

      if (!dino.jumping && dino.y === 0) {
        state.jumpStartTime = Date.now();
        dino.jump(MAX_JUMP_VELOCITY);
      }
    }
  });

  document.addEventListener("keyup", (e) => {
    // Vérifier que la section Dino (stage2) est visible
    const dinoSection = document.getElementById("stage2");
    if (!dinoSection) return;
    const rect = dinoSection.getBoundingClientRect();
    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (!isVisible) return;

    if (e.code === "Space") {
      e.preventDefault();
      // Empêcher les actions pendant la pause
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
      "⚠️ Es-tu sûr de vouloir réinitialiser ton score Dino ?\nTon meilleur score sera définitivement perdu !"
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
