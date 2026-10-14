import {
  adjustPdeHeroStagePresence,
  getPdeHeroMultiplier,
  getPdeHeroScoreMultiplier,
  parsePdeHeroChart,
  schedulePdeHeroTrack,
} from "./pde_hero_chart.mjs";

const DEFAULT_KEYS = ["d", "f", "j", "k", "l"];
const COLORS = ["#ff4f64", "#ffb347", "#ffe14a", "#63e6be", "#74a7ff"];
const DIFFICULTIES = {
  easy: { label: "Facile", travelTime: 3200 },
  medium: { label: "Moyen", travelTime: 2400 },
  hard: { label: "Difficile", travelTime: 1450 },
  expert: { label: "Expert", travelTime: 1100 },
};
const DIFFICULTY_ORDER = Object.keys(DIFFICULTIES);

export function initPdeHero(socket) {
  const stage = document.getElementById("stage22");
  const canvas = document.getElementById("pde-hero-canvas");
  const startButton = document.getElementById("pde-hero-start");
  const chartImportButton = document.getElementById("pde-hero-chart-import");
  const chartFileInput = document.getElementById("pde-hero-chart-file");
  const libraryChartSelect = document.getElementById(
    "pde-hero-library-chart",
  );
  const difficultySelect = document.getElementById("pde-hero-difficulty");
  const chartSpeedInput = document.getElementById("pde-hero-chart-speed");
  const chartSpeedValue = document.getElementById("pde-hero-chart-speed-value");
  const hyperspeedInput = document.getElementById("pde-hero-hyperspeed");
  const hyperspeedValue = document.getElementById("pde-hero-hyperspeed-value");
  const keyInputs = [...document.querySelectorAll(".pde-hero-key")];
  if (
    !stage ||
    !canvas ||
    !startButton ||
    !chartImportButton ||
    !chartFileInput ||
    !libraryChartSelect ||
    !difficultySelect ||
    !chartSpeedInput ||
    !chartSpeedValue ||
    !hyperspeedInput ||
    !hyperspeedValue ||
    keyInputs.length !== 5
  )
    return;

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
  const finalAccuracyEl = document.getElementById("pde-hero-final-accuracy");
  const finalNotesEl = document.getElementById("pde-hero-final-notes");
  const finalHitsEl = document.getElementById("pde-hero-final-hits");
  const finalStreakEl = document.getElementById("pde-hero-final-streak");
  const gameOverTitleEl = document.getElementById("pde-hero-result-title");
  const stagePresenceEl = document.getElementById("pde-hero-stage-presence");
  const stagePresenceValueEl = document.getElementById(
    "pde-hero-stage-presence-value",
  );
  const state = {
    running: false,
    score: 0,
    combo: 0,
    multiplier: 1,
    maxCombo: 0,
    misses: 0,
    hits: 0,
    overHits: 0,
    longest: 0,
    stagePresence: 80,
    totalNotes: 0,
    startedAt: 0,
    notes: [],
    pendingNotes: [],
    particles: [],
    chart: null,
    chartDuration: 0,
    travelTime: 0,
    animation: 0,
    lastFrame: 0,
    missFlashUntil: 0,
    viewWidth: 0,
    viewHeight: 0,
    difficulty: difficultySelect.value,
    chartDifficulty: difficultySelect.value,
    scoreMultiplier: 1,
  };

  let keys = loadKeys();

  function selectChartTrack(chart, difficulty) {
    const wanted = DIFFICULTY_ORDER.indexOf(difficulty);
    const [trackDifficulty, track] = Object.entries(chart.tracks)
      .sort(
        ([a], [b]) =>
          Math.abs(DIFFICULTY_ORDER.indexOf(a) - wanted) -
          Math.abs(DIFFICULTY_ORDER.indexOf(b) - wanted),
      )[0];
    return { difficulty: trackDifficulty, track };
  }

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
    const width = Math.max(
      1,
      canvas.parentElement.getBoundingClientRect().width - 4,
    );
    const availableHeight = Math.max(200, window.innerHeight - 270);
    const height = Math.min(Math.round(width * 0.65), availableHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.style.width = "100%";
    canvas.style.height = `${height + 4}px`;
    state.viewWidth = width;
    state.viewHeight = height;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(width, hitY);
    ctx.stroke();

    const targetRadius = Math.min(24, laneWidth / 2 - 5);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(0, hitY - targetRadius - 4, width, (targetRadius + 4) * 2);

    for (let lane = 0; lane < 5; lane++) {
      const cx = lane * laneWidth + laneWidth / 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, hitY, targetRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    state.notes.forEach((note) => {
      const progress = Math.max(0, (now - note.spawnAt) / note.travelTime);
      const radius = Math.min(20, laneWidth / 2 - 6);
      const x = note.lane * laneWidth + laneWidth / 2;
      const y = note.holding ? hitY : progress * hitY;
      if (note.sustain > 0) {
        const tailY = note.holding
          ? hitY -
            ((note.sustainEndAt - now) / note.travelTime) * hitY
          : y - (note.sustain / (note.travelTime / 1000)) * hitY;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = COLORS[note.lane];
        ctx.fillRect(
          x - Math.max(5, radius * 0.55),
          Math.max(0, tailY),
          Math.max(10, radius * 1.1),
          Math.max(0, y - Math.max(0, tailY)),
        );
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = COLORS[note.lane];
      ctx.shadowColor = COLORS[note.lane];
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
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
    const travelTime = state.travelTime;
    const hitY = state.viewHeight - 48;
    const laneWidth = state.viewWidth / 5;
    const noteDiameter = Math.min(42, laneWidth - 16);
    const distanceAfterHitZone = state.viewHeight - hitY + noteDiameter / 2;
    const timePastHitZone =
      travelTime * (distanceAfterHitZone / Math.max(1, hitY));
    while (
      state.pendingNotes.length > 0 &&
      state.pendingNotes[0].spawnAt <= now
    ) {
      const pendingNote = state.pendingNotes.shift();
      const hitAt = pendingNote.spawnAt + pendingNote.travelTime;
      state.notes.push({
        lane: pendingNote.lane,
        spawnAt: pendingNote.spawnAt,
        travelTime: pendingNote.travelTime,
        hitAt,
        missAt: hitAt + timePastHitZone,
        sustain: pendingNote.sustain,
        sustainEndAt: hitAt + pendingNote.sustain * 1000,
        holding: false,
      });
    }
    const completedHolds = state.notes.filter(
      (note) => note.holding && now >= note.sustainEndAt,
    );
    for (const note of completedHolds) {
      state.notes.splice(state.notes.indexOf(note), 1);
      registerHit(note, note.lane, note.sustainEndAt);
    }
    const expired = state.notes.filter(
      (note) => !note.holding && note.missAt < now,
    );
    expired.forEach(() => registerMiss());
    state.notes
      .filter((note) => note.holding && now - (note.lastParticleAt || 0) >= 90)
      .forEach((note) => {
        note.lastParticleAt = now;
        const x = note.lane * laneWidth + laneWidth / 2;
        const y = hitY - 8;
        state.particles.push(
          ...Array.from({ length: 2 }, () => ({
            x,
            y,
            vx: (Math.random() - 0.5) * 16,
            vy: -(8 + Math.random() * 18),
            size: 1 + Math.random() * 1.5,
            color: COLORS[note.lane],
            createdAt: now,
            duration: 280 + Math.random() * 170,
          })),
        );
      });
    state.notes = state.notes.filter(
      (note) => note.holding || note.missAt >= now,
    );
    if (!state.running) return;
    if (
      state.pendingNotes.length === 0 &&
      state.notes.length === 0 &&
      now >=
        state.startedAt + state.chartDuration * 1000 + timePastHitZone
    ) {
      finish("Chart terminée", { completed: true });
      return;
    }
    const liveElapsed = Math.max(0, (now - state.startedAt) / 1000);
    state.longest = Math.max(state.longest, liveElapsed);
    scoreEl.textContent = `Score: ${state.score}`;
    comboEl.textContent = `Combo: ${state.combo} | x${state.multiplier}`;
    missesEl.textContent = `Misses: ${state.misses}`;
    overHitsEl.textContent = `Over hit: ${state.overHits}`;
    timeEl.textContent = `Temps: ${Math.floor(liveElapsed)}s`;
    draw(now);
    state.animation = requestAnimationFrame(frame);
  }

  function registerMiss() {
    if (!state.running) return;
    state.misses += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.combo = 0;
    state.multiplier = 1;
    state.stagePresence = adjustPdeHeroStagePresence(state.stagePresence, false);
    updateStagePresence();
    state.missFlashUntil = performance.now() + 180;
    missesEl.textContent = `Misses: ${state.misses}`;
    draw(performance.now());
    window.setTimeout(() => draw(performance.now()), 190);
    if (state.stagePresence <= 0) {
      finish("Stage presence épuisée");
    }
  }

  function updateStagePresence() {
    stagePresenceEl.value = state.stagePresence;
    stagePresenceEl.setAttribute(
      "aria-valuetext",
      `${state.stagePresence}%`,
    );
    stagePresenceValueEl.textContent = `${state.stagePresence}%`;
  }

  function registerOverHit() {
    if (!state.running) return;
    state.overHits += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.combo = 0;
    state.multiplier = 1;
    state.missFlashUntil = performance.now() + 180;
    overHitsEl.textContent = `Over hit: ${state.overHits}`;
    draw(performance.now());
    window.setTimeout(() => draw(performance.now()), 190);
  }

  function finish(message = "Partie terminee", { completed = false } = {}) {
    if (!state.running) return;
    state.running = false;
    cancelAnimationFrame(state.animation);
    const duration = Math.max(
      0,
      Math.floor((performance.now() - state.startedAt) / 1000),
    );
    state.longest = Math.max(state.longest, duration);
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    startButton.disabled = false;
    statusEl.textContent = `${message} - ${state.score} points`;
    const finalDuration = Math.floor(duration);
    const accuracy = state.hits + state.misses
      ? Math.round((state.hits / (state.hits + state.misses)) * 100)
      : 0;
    gameOverTitleEl.textContent = completed ? "CHART TERMINÉE" : "GAME OVER";
    finalScoreEl.textContent = `Score : ${state.score}`;
    finalTimeEl.textContent = `Duree : ${finalDuration}s`;
    finalAccuracyEl.textContent = `Pourcentage hit : ${accuracy}%`;
    finalNotesEl.textContent = `Notes totales : ${state.totalNotes}`;
    finalHitsEl.textContent = `Hits : ${state.hits} | Misses : ${state.misses} | Over hit : ${state.overHits}`;
    finalStreakEl.textContent = `Plus longue série : ${state.maxCombo}`;
    gameOverEl.hidden = false;
    chartImportButton.disabled = false;
    libraryChartSelect.disabled = false;
    chartSpeedInput.disabled = false;
    hyperspeedInput.disabled = false;
    if (completed) {
      socket.emit("pdehero:final", {
        score: state.score,
        duration,
        difficulty: state.chartDifficulty,
        chartSpeed: Number(chartSpeedInput.value),
        hyperspeed: Number(hyperspeedInput.value),
        totalNotes: state.totalNotes,
        hits: state.hits,
        misses: state.misses,
        completed,
      });
    }
  }

  function start() {
    if (state.running) return;
    if (!state.chart) {
      statusEl.textContent =
        "Choisissez une chart disponible ou importez un fichier .chart.";
      return;
    }
    state.difficulty = difficultySelect.value;
    const { difficulty: chartDifficulty, track: chartTrack } = selectChartTrack(
      state.chart,
      state.difficulty,
    );
    const chartSpeed = Number(chartSpeedInput.value);
    const hyperspeed = Number(hyperspeedInput.value);
    const travelTime =
      DIFFICULTIES[state.difficulty].travelTime /
      hyperspeed;
    const startAt = performance.now() + travelTime;
    const schedule = schedulePdeHeroTrack(
      chartTrack,
      startAt,
      travelTime,
      chartSpeed,
    );
    state.running = true;
    gameOverEl.hidden = true;
    state.score = 0;
    state.combo = 0;
    state.multiplier = 1;
    state.maxCombo = 0;
    state.misses = 0;
    state.hits = 0;
    state.overHits = 0;
    state.stagePresence = 80;
    state.totalNotes = schedule.notes.length;
    state.chartDifficulty = chartDifficulty;
    state.scoreMultiplier = getPdeHeroScoreMultiplier(
      chartDifficulty,
      chartSpeed,
      hyperspeed,
    );
    state.longest = 0;
    state.notes = [];
    state.travelTime = travelTime;
    state.startedAt = schedule.startAt;
    state.pendingNotes = schedule.notes;
    state.particles = [];
    state.chartDuration = schedule.duration;
    state.lastFrame = state.startedAt;
    startButton.disabled = true;
    chartImportButton.disabled = true;
    libraryChartSelect.disabled = true;
    chartSpeedInput.disabled = true;
    hyperspeedInput.disabled = true;
    statusEl.textContent = `En jeu — ${DIFFICULTIES[chartDifficulty].label} (${chartTrack.name})`;
    missesEl.textContent = "Misses: 0";
    overHitsEl.textContent = "Over hit: 0";
    updateStagePresence();
    state.animation = requestAnimationFrame(frame);
  }

  function registerHit(hitNote, lane, now) {
    const hitY = state.viewHeight - 48;
    const noteProgress = Math.min(
      1,
      (now - hitNote.spawnAt) / hitNote.travelTime,
    );
    const noteY = noteProgress * hitY;
    state.hits += 1;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.multiplier = getPdeHeroMultiplier(state.combo);
    state.stagePresence = adjustPdeHeroStagePresence(state.stagePresence, true);
    updateStagePresence();
    state.score += Math.round(100 * state.multiplier * state.scoreMultiplier);
    const laneWidth = state.viewWidth / 5;
    state.particles.push(
      ...Array.from({ length: 12 }, () => ({
        x: lane * laneWidth + laneWidth / 2,
        y: noteY,
        vx: (Math.random() - 0.5) * laneWidth * 0.8,
        vy: -(20 + Math.random() * 35),
        size: 2 + Math.random() * 3,
        color: COLORS[lane],
        createdAt: now,
        duration: 380 + Math.random() * 220,
      })),
    );
  }

  function hit(key) {
    if (!state.running) return;
    const lane = keys.indexOf(key.toLowerCase());
    if (lane < 0) return;
    const now = performance.now();
    const laneNote = state.notes.find((note) => note.lane === lane);
    if (laneNote && !laneNote.holding && now > laneNote.missAt) {
      state.notes.splice(state.notes.indexOf(laneNote), 1);
      registerMiss();
      return;
    }
    const index = state.notes.findIndex(
      (note) => !note.holding &&
        note.lane === lane && now >= note.hitAt - 280 && now <= note.missAt,
    );
    if (index < 0) {
      registerOverHit();
      return;
    }
    const hitNote = state.notes[index];
    if (hitNote.sustain > 0) {
      hitNote.holding = true;
      hitNote.sustainEndAt = hitNote.hitAt + hitNote.sustain * 1000;
      return;
    }
    state.notes.splice(index, 1);
    registerHit(hitNote, lane, now);
  }

  function release(key) {
    const lane = keys.indexOf(key.toLowerCase());
    const index = state.notes.findIndex(
      (note) => note.lane === lane && note.holding,
    );
    if (index < 0) return;
    const [note] = state.notes.splice(index, 1);
    if (performance.now() >= note.sustainEndAt) {
      registerHit(note, lane, note.sustainEndAt);
    } else {
      registerMiss();
    }
  }

  startButton.addEventListener("click", start);
  restartButton.addEventListener("click", start);
  chartImportButton.addEventListener("click", () => chartFileInput.click());
  chartSpeedInput.addEventListener("input", () => {
    chartSpeedValue.value = `${Math.round(Number(chartSpeedInput.value) * 100)} %`;
  });
  hyperspeedInput.addEventListener("input", () => {
    hyperspeedValue.value = `${Number(hyperspeedInput.value).toFixed(1)}×`;
  });
  chartFileInput.addEventListener("change", async () => {
    const file = chartFileInput.files[0];
    if (!file) return;
    try {
      if (state.running) throw new Error("Terminez la partie avant d’importer.");
      if (!file.name.toLowerCase().endsWith(".chart"))
        throw new Error("Sélectionnez un fichier .chart.");
      state.chart = parsePdeHeroChart(await file.text());
      libraryChartSelect.value = "";
      const selectedTrack = selectChartTrack(
        state.chart,
        difficultySelect.value,
      );
      statusEl.textContent = `${file.name} chargé — ${selectedTrack.track.notes.length} notes (${selectedTrack.track.name}).`;
    } catch (error) {
      statusEl.textContent = `Import impossible : ${error.message}`;
    } finally {
      chartFileInput.value = "";
    }
  });
  libraryChartSelect.addEventListener("change", async () => {
    const chartId = libraryChartSelect.value;
    if (!chartId) return;
    libraryChartSelect.disabled = true;
    try {
      if (state.running)
        throw new Error("Terminez la partie avant de changer de chart.");
      const response = await fetch(
        `/api/pdehero/charts/${encodeURIComponent(chartId)}`,
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Chargement de la chart impossible.");
      }
      const chart = parsePdeHeroChart(result.content);
      const selectedTrack = selectChartTrack(chart, difficultySelect.value);
      state.chart = chart;
      statusEl.textContent = `${libraryChartSelect.selectedOptions[0].textContent} chargé — ${selectedTrack.track.notes.length} notes (${selectedTrack.track.name}).`;
    } catch (error) {
      statusEl.textContent = `Import impossible : ${error.message}`;
      libraryChartSelect.value = "";
    } finally {
      libraryChartSelect.disabled = state.running;
    }
  });
  difficultySelect.addEventListener("change", () => {
    if (!state.running) return;
    const newDifficulty = difficultySelect.value;
    finish("Partie abandonnée : difficulté modifiée", { save: false });
    state.difficulty = newDifficulty;
  });
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.target.matches("input, textarea, select")) return;
    hit(event.key);
  });
  window.addEventListener("keyup", (event) => release(event.key));
  window.addEventListener("resize", resize);
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();
  draw(0);
  fetch("/api/pdehero/charts")
    .then(async (response) => {
      const charts = await response.json();
      if (!response.ok) {
        throw new Error(charts.message || "Bibliothèque indisponible.");
      }
      charts.forEach(({ id, title }) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = title;
        libraryChartSelect.appendChild(option);
      });
      if (charts.length === 0) {
        statusEl.textContent =
          "Aucune chart disponible — importez un fichier .chart.";
      }
    })
    .catch((error) => {
      statusEl.textContent = `Bibliothèque indisponible : ${error.message}`;
    });
}
