const canvas = document.querySelector(".game");
const c = canvas.getContext("2d");

// Adapter la taille du canvas à sa taille CSS
function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const GRAVITY = 0.8;
const INITIAL_SPEED = 8; // vitesse de départ unique
let gameSpeed = INITIAL_SPEED;
let score = 0;
let highScore = localStorage.getItem("highScore") || 0;
let gameOver = false;
let isFirstStart = true;

// =========================
// DINO
// =========================
const dino = {
  x: 50,
  y: 0,
  width: 40,
  height: 40,
  dy: 0,
  jumping: false,
  frame: 0,

  draw() {
    c.fillStyle = "#00FF00";
    c.fillRect(
      this.x,
      canvas.height - this.y - this.height,
      this.width,
      this.height
    );

    // petites jambes animées
    if (!this.jumping) {
      this.frame++;
      const legOffset = Math.sin(this.frame * 0.25) * 5;
      c.fillRect(
        this.x,
        canvas.height - this.y,
        this.width / 2,
        10 + legOffset
      );
      c.fillRect(
        this.x + this.width / 2,
        canvas.height - this.y,
        this.width / 2,
        10 - legOffset
      );
    }
  },

  update() {
    this.dy -= GRAVITY;
    this.y += this.dy;
    if (this.y <= 0) {
      this.y = 0;
      this.dy = 0;
      this.jumping = false;
    }
    this.draw();
  },

  jump() {
    if (!this.jumping) {
      this.dy = 15;
      this.jumping = true;
    }
  },

  reset() {
    this.y = 0;
    this.dy = 0;
    this.jumping = false;
    this.frame = 0;
  },
};

// =========================
// NUAGES
// =========================
class Cloud {
  constructor() {
    this.x = canvas.width;
    this.y = Math.random() * (canvas.height / 2); // moitié haute
    this.width = 40 + Math.random() * 60; // largeur aléatoire
    this.height = 10 + Math.random() * 10; // hauteur fine
    this.speed = 1 + Math.random() * 2; // vitesse lente
  }

  draw() {
    c.fillStyle = "#00FF00";
    c.fillRect(this.x, this.y, this.width, this.height);
  }

  update() {
    this.x -= this.speed;
    this.draw();
  }
}

// =========================
// CACTUS
// =========================
class Cactus {
  constructor() {
    this.count = 1 + Math.floor(Math.random() * 3);
    this.width = 17 + Math.random() * 15;
    this.spacing = 5 + Math.random() * 15;
    this.x = canvas.width;

    this.heights = Array.from(
      { length: this.count },
      () => 50 + Math.random() * 50
    );

    const totalGroupWidth =
      this.count * this.width + (this.count - 1) * this.spacing;

    const MAX_JUMPABLE_WIDTH = 150; // largeur max franchissable

    if (totalGroupWidth > MAX_JUMPABLE_WIDTH) {
      // réduire le nombre de cactus si trop large
      this.count = Math.floor(MAX_JUMPABLE_WIDTH / (this.width + this.spacing));
      this.heights = this.heights.slice(0, this.count);
    }
  }

  draw() {
    c.fillStyle = "#00FF00";
    for (let i = 0; i < this.count; i++) {
      let height = this.heights[i];
      c.fillRect(
        this.x + i * (this.width + this.spacing),
        canvas.height - height,
        this.width,
        height
      );
    }
  }

  update() {
    this.x -= gameSpeed;
    this.draw();
  }

  isColliding() {
    const dinoTop = canvas.height - dino.y - dino.height;
    const dinoBottom = canvas.height - dino.y;
    const dinoLeft = dino.x;
    const dinoRight = dino.x + dino.width;

    for (let i = 0; i < this.count; i++) {
      let height = this.heights[i];
      const cactusLeft = this.x + i * (this.width + this.spacing);
      const cactusRight = cactusLeft + this.width;
      const cactusTop = canvas.height - height;
      const cactusBottom = canvas.height;

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
}

// =========================
// VARIABLES
// =========================
let cacti = [];
let clouds = [];
let spawnTimer = 0;
let cloudTimer = 0;

// =========================
// GAME LOOP
// =========================
function loop() {
  if (gameOver) return;

  // fond noir
  c.fillStyle = "#000";
  c.fillRect(0, 0, canvas.width, canvas.height);

  // nuages
  cloudTimer++;
  if (cloudTimer > 100) {
    // spawn plus fréquent qu'avant (200 → 100)
    clouds.push(new Cloud());
    cloudTimer = 0;
  }
  for (let i = clouds.length - 1; i >= 0; i--) {
    clouds[i].update();
    if (clouds[i].x + clouds[i].width < 0) {
      clouds.splice(i, 1);
    }
  }

  // sol
  c.fillStyle = "#00FF00";
  c.fillRect(0, canvas.height - 10, canvas.width, 10);

  // dino
  dino.update();

  // cactus spawn
  spawnTimer++;
  if (spawnTimer > 90) {
    cacti.push(new Cactus());
    spawnTimer = 0;
  }

  // cactus update
  for (let i = cacti.length - 1; i >= 0; i--) {
    cacti[i].update();

    const totalGroupWidth =
      cacti[i].count * cacti[i].width + (cacti[i].count - 1) * cacti[i].spacing;

    if (cacti[i].x + totalGroupWidth < 0) {
      cacti.splice(i, 1);
      score++;
      gameSpeed += 0.05;
    } else if (cacti[i].isColliding()) {
      gameOver = true;

      if (score > highScore) {
        highScore = score;
        localStorage.setItem("highScore", highScore);
      }

      showGameOver();
      return;
    }
  }

  // score affichage
  c.fillStyle = "#00FF00";
  c.font = "20px Arial";
  c.textAlign = "left";
  c.textBaseline = "top";
  c.fillText("Score: " + score, 10, 10);
  c.fillText("Meilleur: " + highScore, 10, 35);

  requestAnimationFrame(loop);
}

// =========================
// GAME OVER
// =========================
function showGameOver() {
  c.fillStyle = "#000";
  c.fillRect(0, 0, canvas.width, canvas.height);

  c.fillStyle = "#00FF00";
  c.font = "30px Arial";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 20);

  c.font = "20px Arial";
  c.fillText(
    '"Espace" ou "Z" pour restart',
    canvas.width / 2,
    canvas.height / 2 + 20
  );
}

// =========================
// RESET
// =========================
function resetGame() {
  score = 0;
  gameSpeed = INITIAL_SPEED;
  cacti = [];
  clouds = [];
  spawnTimer = 0;
  cloudTimer = 0;
  gameOver = false;
  dino.reset();

  loop();
}

// =========================
// CONTROLES
// =========================
document.querySelector(".dino-start").addEventListener("click", () => {
  if (gameOver || isFirstStart) {
    resetGame();
    isFirstStart = false;
  } else {
    dino.jump();
  }
});

document.querySelector(".dino-reset").addEventListener("click", () => {
  resetGame();
});

document.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key.toLowerCase() === "z") {
    if (gameOver || isFirstStart) {
      resetGame();
      isFirstStart = false;
    } else {
      dino.jump();
    }
  }
});

// =========================
// DEMARRAGE AUTO
// =========================
loop();
