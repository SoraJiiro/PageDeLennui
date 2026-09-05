const DEFAULT_KEYS = ["d", "f", "j", "k", "l"];
const COLORS = ["#ff4f64", "#ffb347", "#ffe14a", "#63e6be", "#74a7ff"];

export function initPdeHero(socket) {
  const stage = document.getElementById("stage22");
  const canvas = document.getElementById("pde-hero-canvas");
  const startButton = document.getElementById("pde-hero-start");
  const keyInputs = [...document.querySelectorAll(".pde-hero-key")];
  if (!stage || !canvas || !startButton || keyInputs.length !== 5) return;

  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("pde-hero-score");
  const comboEl = document.getElementById("pde-hero-combo");
  const missesEl = document.getElementById("pde-hero-misses");
  const overHitsEl = document.getElementById("pde-hero-overhits");
  const statusEl = document.getElementById("pde-hero-status");
  const timeEl = document.getElementById("pde-hero-time");
  const gameOverEl = document.getElementById("pde-hero-game-over");
  const restartButton = document.getElementById("pde-hero-restart");
  const finalScoreEl = document.getElementById("pde-hero-final-score");
  const finalTimeEl = document.getElementById("pde-hero-final-time");
  const finalMissesEl = document.getElementById("pde-hero-final-misses");
  const state = {
    running: false,
    score: 0,
    combo: 0,
    misses: 0,
    overHits: 0,
    longest: 0,
    startedAt: 0,
    notes: [],
    particles: [],
    lastSpawn: 0,
    animation: 0,
    lastFrame: 0,
    missFlashUntil: 0,
    viewWidth: 0,
    viewHeight: 0,
  };

  let keys = loadKeys();
  keyInputs.forEach((input, index) => {
    input.value = keys[index].toUpperCase();
    input.addEventListener("change", () => {
      const value = input.value.trim().toLowerCase().slice(0, 1);
      if (!value || keys.includes(value)) {
        input.value = keys[index].toUpperCase();
        return;
      }
      keys[index] = value;
      input.value = value.toUpperCase();
      localStorage.setItem("pde-hero-keys", JSON.stringify(keys));
    });
  });

  function loadKeys() {
    try {
      const saved = JSON.parse(localStorage.getItem("pde-hero-keys"));
      if (
        Array.isArray(saved) &&
        saved.length === 5 &&
        new Set(saved).size === 5
      ) {
        return saved;
      }
    } catch {}
    return DEFAULT_KEYS.slice();
  }

  function resize() {
    const width = Math.max(320, canvas.parentElement.clientWidth - 4);
    const availableHeight = Math.max(240, window.innerHeight - 270);
    const height = Math.min(Math.round(width * 0.65), availableHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = "100%";
    canvas.style.height = `${height + 4}px`;
    state.viewWidth = width;
    state.viewHeight = height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(now) {
    const width = state.viewWidth;
    const height = state.viewHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-color")
        .trim() || "#111";
    ctx.fillRect(0, 0, width, height);
    const laneWidth = width / 5;
    const hitY = height - 48;
    const noteHeight = 28;
    for (let lane = 0; lane < 5; lane++) {
      ctx.fillStyle =
        lane % 2 ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.07)";
      ctx.fillRect(lane * laneWidth, 0, laneWidth, height);
      ctx.strokeStyle = "rgba(255,255,255,.2)";
      ctx.strokeRect(lane * laneWidth, 0, laneWidth, height);
      ctx.fillStyle = COLORS[lane];
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        keys[lane].toUpperCase(),
        lane * laneWidth + laneWidth / 2,
        height - 14,
      );
    }
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(width, hitY);
    ctx.stroke();
    state.notes.forEach((note) => {
      const progress = Math.max(
        0,
        (now - note.spawnAt) / (note.missAt - note.spawnAt),
      );
      const x = note.lane * laneWidth + 6;
      const y = progress * hitY;
      ctx.fillStyle = COLORS[note.lane];
      ctx.shadowColor = COLORS[note.lane];
      ctx.shadowBlur = 12;
      ctx.fillRect(x, y, laneWidth - 12, 28);
      ctx.shadowBlur = 0;
    });
    state.particles = state.particles.filter(
      (particle) => now - particle.createdAt < particle.duration,
    );
    state.particles.forEach((particle) => {
      const progress = (now - particle.createdAt) / particle.duration;
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(
        particle.x + particle.vx * progress,
        particle.y + particle.vy * progress + progress * progress * 35,
        particle.size * (1 - progress * 0.45),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    const flashRemaining = Math.max(0, state.missFlashUntil - now);
    if (flashRemaining > 0) {
      ctx.fillStyle = `rgba(220, 25, 35, ${0.3 * (flashRemaining / 180)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function frame(now) {
    if (!state.running) return;
    state.lastFrame = now;
    const elapsed = (now - state.startedAt) / 1000;
    const spawnInterval = Math.max(170, 520 - elapsed * 12);
    const travelTime = Math.max(680, 1550 - elapsed * 18);
    const hitY = state.viewHeight - 48;
    const noteHeight = 28;
    const timePastHitZone =
      travelTime * (noteHeight / Math.max(1, hitY - noteHeight / 2));
    if (now - state.lastSpawn >= spawnInterval) {
      const hitAt = now + travelTime;
      state.notes.push({
        lane: Math.floor(Math.random() * 5),
        spawnAt: now,
        hitAt,
        missAt: hitAt + timePastHitZone,
      });
      state.lastSpawn = now;
      if (elapsed > 12 && Math.random() < Math.min(0.42, elapsed / 120)) {
        const hitAt = now + travelTime + 70;
        state.notes.push({
          lane: Math.floor(Math.random() * 5),
          spawnAt: now,
          hitAt,
          missAt: hitAt + timePastHitZone,
        });
      }
    }
    const expired = state.notes.filter((note) => note.missAt < now);
    expired.forEach(() => registerMiss());
    state.notes = state.notes.filter((note) => note.missAt >= now);
    if (!state.running) return;
    const liveElapsed = (now - state.startedAt) / 1000;
    state.longest = Math.max(state.longest, liveElapsed);
    scoreEl.textContent = `Score: ${state.score}`;
    comboEl.textContent = `Combo: ${state.combo}`;
    missesEl.textContent = `Misses: ${state.misses}/5`;
    overHitsEl.textContent = `Over hit: ${state.overHits}/5`;
    timeEl.textContent = `Temps: ${Math.floor(liveElapsed)}s`;
    draw(now);
    state.animation = requestAnimationFrame(frame);
  }

  function registerMiss() {
    if (!state.running) return;
    state.misses += 1;
    state.combo = 0;
    state.missFlashUntil = performance.now() + 180;
    missesEl.textContent = `Misses: ${state.misses}/5`;
    draw(performance.now());
    window.setTimeout(() => draw(performance.now()), 190);
    if (state.misses >= 5) {
      finish("5 misses");
    }
  }

  function registerOverHit() {
    if (!state.running) return;
    state.overHits += 1;
    state.combo = 0;
    state.missFlashUntil = performance.now() + 180;
    overHitsEl.textContent = `Over hit: ${state.overHits}/5`;
    draw(performance.now());
    window.setTimeout(() => draw(performance.now()), 190);
    if (state.overHits >= 5) {
      finish("5 over hits");
    }
  }

  function finish(message = "Partie terminee") {
    if (!state.running) return;
    state.running = false;
    cancelAnimationFrame(state.animation);
    const duration = Math.max(
      0,
      Math.floor((performance.now() - state.startedAt) / 1000),
    );
    state.longest = Math.max(state.longest, duration);
    startButton.disabled = false;
    statusEl.textContent = `${message} - ${state.score} points`;
    const finalDuration = Math.floor(duration);
    finalScoreEl.textContent = `Score : ${state.score}`;
    finalTimeEl.textContent = `Duree : ${finalDuration}s`;
    finalMissesEl.textContent = `Misses : ${state.misses} | Over hit : ${state.overHits}`;
    gameOverEl.hidden = false;
    socket.emit("pdehero:final", { score: state.score, duration });
  }

  function start() {
    if (state.running) return;
    state.running = true;
    gameOverEl.hidden = true;
    state.score = 0;
    state.combo = 0;
    state.misses = 0;
    state.overHits = 0;
    state.longest = 0;
    state.notes = [];
    state.particles = [];
    state.startedAt = performance.now();
    state.lastSpawn = state.startedAt;
    state.lastFrame = state.startedAt;
    startButton.disabled = true;
    statusEl.textContent = "En jeu";
    missesEl.textContent = "Misses: 0/5";
    overHitsEl.textContent = "Over hit: 0/5";
    state.animation = requestAnimationFrame(frame);
  }

  function hit(key) {
    if (!state.running) return;
    const lane = keys.indexOf(key.toLowerCase());
    if (lane < 0) return;
    const now = performance.now();
    const laneNote = state.notes.find((note) => note.lane === lane);
    if (laneNote && now > laneNote.missAt) {
      state.notes.splice(state.notes.indexOf(laneNote), 1);
      registerMiss();
      return;
    }
    const index = state.notes.findIndex(
      (note) =>
        note.lane === lane && now >= note.hitAt - 230 && now <= note.missAt,
    );
    if (index < 0) {
      registerOverHit();
      return;
    }
    state.notes.splice(index, 1);
    state.combo += 1;
    state.score += 100 + Math.min(400, state.combo * 10);
    const laneWidth = state.viewWidth / 5;
    state.particles.push(
      ...Array.from({ length: 12 }, () => ({
        x: lane * laneWidth + laneWidth / 2,
        y: state.viewHeight - 62,
        vx: (Math.random() - 0.5) * laneWidth * 0.8,
        vy: -(20 + Math.random() * 35),
        size: 2 + Math.random() * 3,
        color: COLORS[lane],
        createdAt: now,
        duration: 380 + Math.random() * 220,
      })),
    );
  }

  startButton.addEventListener("click", start);
  restartButton.addEventListener("click", start);
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.target.matches("input, textarea, select")) return;
    hit(event.key);
  });
  window.addEventListener("resize", resize);
  resize();
  draw(0);
}
