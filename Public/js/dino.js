export function initDino(socket) {
  const canvas = document.querySelector(".game");
  if (!canvas) return;
  const c = canvas.getContext("2d");

  function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const GRAVITY = 0.8;
  const INITIAL_SPEED = 8;
  let gameSpeed = INITIAL_SPEED;
  let score = 0;
  let gameOver = false;
  let isFirstStart = true;

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

  class Cloud {
    constructor() {
      this.x = canvas.width;
      this.y = Math.random() * (canvas.height / 2);
      this.width = 40 + Math.random() * 60;
      this.height = 10 + Math.random() * 10;
      this.speed = 1 + Math.random() * 2;
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

  class Cactus {
    constructor() {
      this.x = canvas.width;
      this.width = 20 + Math.random() * 15;
      this.height = 50 + Math.random() * 40;
    }

    draw() {
      c.fillStyle = "#00FF00";
      c.fillRect(this.x, canvas.height - this.height, this.width, this.height);
    }

    update() {
      this.x -= gameSpeed;
      this.draw();
    }

    collides() {
      const dinoBottom = canvas.height - dino.y;
      const dinoRight = dino.x + dino.width;
      const cactusTop = canvas.height - this.height;
      return (
        dinoRight > this.x &&
        dino.x < this.x + this.width &&
        dinoBottom > cactusTop
      );
    }
  }

  let cacti = [];
  let clouds = [];
  let spawnTimer = 0;
  let cloudTimer = 0;

  function loop() {
    if (gameOver) return;
    c.fillStyle = "#000";
    c.fillRect(0, 0, canvas.width, canvas.height);

    // Nuages
    cloudTimer++;
    if (cloudTimer > 70) {
      clouds.push(new Cloud());
      cloudTimer = 0;
    }
    clouds = clouds.filter((cl) => {
      cl.update();
      return cl.x + cl.width > 0;
    });

    // Sol
    c.fillStyle = "#00FF00";
    c.fillRect(0, canvas.height - 10, canvas.width, 10);

    // Dino
    dino.update();

    // Cactus
    spawnTimer++;
    if (spawnTimer > 90) {
      cacti.push(new Cactus());
      spawnTimer = 0;
    }
    cacti = cacti.filter((cx) => {
      cx.update();
      if (cx.collides()) {
        gameOver = true;
        socket.emit("dino:score", { score });
        showGameOver();
        return false;
      }
      if (cx.x + cx.width < 0) {
        score++;
        gameSpeed += 0.0025;
      }
      return true;
    });

    // Score
    c.fillStyle = "#00FF00";
    c.font = "20px Arial";
    c.textAlign = "left";
    c.fillText(`Score: ${score}`, 20, 20);

    requestAnimationFrame(loop);
  }

  function showGameOver() {
    c.fillStyle = "#000";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = "#00FF00";
    c.font = "30px Arial";
    c.textAlign = "center";
    c.fillText("Game Over", canvas.width / 2, canvas.height / 2);
    c.font = "20px Arial";
    c.fillText(
      "Appuie sur Z pour rejouer",
      canvas.width / 2,
      canvas.height / 2 + 30
    );
  }

  function startGame() {
    gameOver = false;
    isFirstStart = false;
    score = 0;
    gameSpeed = INITIAL_SPEED;
    cacti = [];
    clouds = [];
    dino.reset();
    loop();
  }

  document.querySelector(".dino-start")?.addEventListener("click", () => {
    if (isFirstStart || gameOver) startGame();
    else dino.jump();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "z") {
      if (isFirstStart || gameOver) startGame();
      else dino.jump();
    }
  });
}
