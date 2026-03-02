export function initRoulette(socket) {
  const input = document.getElementById("roulette-bet-amount");
  const result = document.getElementById("roulette-result");
  const redBtn = document.getElementById("roulette-red");
  const blackBtn = document.getElementById("roulette-black");
  const greenBtn = document.getElementById("roulette-green");
  const wheel = document.getElementById("roulette-wheel");
  const ball = document.getElementById("roulette-ball");
  const lastEl = document.getElementById("roulette-last");

  if (!input || !result || !redBtn || !blackBtn || !greenBtn || !wheel || !ball)
    return;

  const WHEEL_ORDER = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
  ];

  const REDS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
  ]);

  const TWO_PI = Math.PI * 2;
  const cx = 180;
  const cy = 180;
  const radius = 175;
  const step = TWO_PI / WHEEL_ORDER.length;

  const ctx = wheel.getContext("2d");
  const themeColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--primary-color")
      .trim() || "#0f0";
  function drawWheel() {
    if (!ctx) return;
    ctx.clearRect(0, 0, 360, 360);
    for (let i = 0; i < WHEEL_ORDER.length; i++) {
      const n = WHEEL_ORDER[i];
      const a0 = -Math.PI / 2 + i * step;
      const a1 = a0 + step;
      const color = n === 0 ? "#0a0" : REDS.has(n) ? "#a00" : "#111";

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();

      const mid = (a0 + a1) / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * 132, cy + Math.sin(mid) * 132);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Ubuntu";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, TWO_PI);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  drawWheel();

  let tokens = 0;
  let spinning = false;
  let rotationTurns = 0;
  const SPIN_DURATION_MS = 4200;
  const WHEEL_TRANSITION = `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  let spinSequence = 0;

  function normalizeAngle(rad) {
    const mod = rad % TWO_PI;
    return mod < 0 ? mod + TWO_PI : mod;
  }

  wheel.style.transition = WHEEL_TRANSITION;
  ball.style.transition = WHEEL_TRANSITION;

  socket.on("economy:wallet", (payload) => {
    tokens = Math.max(0, Number(payload?.tokens || 0));
    input.max = String(tokens);
  });

  function bet(color) {
    if (spinning) return;
    const amount = Math.max(0, Math.floor(Number(input.value) || 0));
    if (amount <= 0) {
      result.textContent = "Mise invalide";
      result.className = "roulette-result lose";
      return;
    }
    if (amount > tokens) {
      result.textContent = "Pas assez de tokens";
      result.className = "roulette-result lose";
      return;
    }
    spinning = true;
    result.textContent = "Lancement...";
    result.className = "roulette-result";
    socket.emit("roulette:bet", { amount, color });
  }

  redBtn.onclick = () => bet("red");
  blackBtn.onclick = () => bet("black");
  greenBtn.onclick = () => bet("green");

  socket.on("roulette:result", (data) => {
    if (!data) return;
    const currentSpinId = ++spinSequence;
    const roll = Number(data.roll);
    const index = WHEEL_ORDER.indexOf(roll);
    const targetAngle = index >= 0 ? index * step + step / 2 : 0;
    const targetMod = normalizeAngle(TWO_PI - targetAngle);
    const currentMod = normalizeAngle(rotationTurns);
    const deltaToTarget = normalizeAngle(targetMod - currentMod);
    const baseSpins = Math.PI * 12;
    const nextRotation = rotationTurns + baseSpins + deltaToTarget;
    rotationTurns = nextRotation;

    wheel.style.transform = `rotate(${rotationTurns}rad)`;
    ball.style.transform = `translate(-50%, -170px) rotate(${-rotationTurns * 1.12}rad)`;

    const won = !!data.won;
    const finalizeSpin = () => {
      if (currentSpinId !== spinSequence) return;
      rotationTurns = nextRotation;
      wheel.style.transition = "none";
      ball.style.transition = "none";
      wheel.style.transform = `rotate(${rotationTurns}rad)`;
      ball.style.transform = `translate(-50%, -170px) rotate(${-rotationTurns * 1.12}rad)`;

      wheel.offsetHeight;
      wheel.style.transition = WHEEL_TRANSITION;
      ball.style.transition = WHEEL_TRANSITION;

      lastEl.textContent = `Dernier: ${roll} (${String(data.landed || "-").toUpperCase()})`;
      if (won) {
        result.textContent = `Gagné ! +${Number(data.payout || 0)} tokens`;
        result.className = "roulette-result win";
      } else {
        result.textContent = `Perdu !`;
        result.className = "roulette-result lose";
      }
      spinning = false;
    };

    const onWheelTransitionEnd = (event) => {
      if (event.target !== wheel || event.propertyName !== "transform") return;
      wheel.removeEventListener("transitionend", onWheelTransitionEnd);
      finalizeSpin();
    };

    wheel.addEventListener("transitionend", onWheelTransitionEnd);
    setTimeout(() => {
      wheel.removeEventListener("transitionend", onWheelTransitionEnd);
      finalizeSpin();
    }, SPIN_DURATION_MS + 250);
  });

  socket.on("roulette:error", (msg) => {
    spinning = false;
    result.textContent = msg || "Erreur roulette";
    result.className = "roulette-result lose";
  });
}
