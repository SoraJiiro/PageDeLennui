import {
  adjustPdeHeroStagePresence,
  getPdeHeroMultiplier,
  getPdeHeroScoreMultiplier,
  getPdeHeroSustainBonus,
  groupPdeHeroLyrics,
  parsePdeHeroChart,
  parsePdeHeroMidi,
  schedulePdeHeroLongPauses,
  schedulePdeHeroLyrics,
  schedulePdeHeroTrack,
} from "./pde_hero_chart.mjs";

const DEFAULT_KEYS = ["d", "f", "j", "k", "l"];
const SETTINGS_KEY = "pde-hero-settings";
const CUSTOM_CHART_ID = "__custom__";
const COLORS = ["#ff4f64", "#ffb347", "#ffe14a", "#63e6be", "#74a7ff"];
const DIFFICULTIES = {
  easy: { label: "Facile", travelTime: 3200 },
  medium: { label: "Moyen", travelTime: 2400 },
  hard: { label: "Difficile", travelTime: 1450 },
  expert: { label: "Expert", travelTime: 1100 },
};
const DIFFICULTY_ORDER = Object.keys(DIFFICULTIES);

function encodeMidi(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeMidi(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

export function initPdeHero(socket) {
  const stage = document.getElementById("stage22");
  const canvas = document.getElementById("pde-hero-canvas");
  const startButton = document.getElementById("pde-hero-start");
  const stopButton = document.getElementById("pde-hero-stop");
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
    !stopButton ||
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
  const statusEl = document.getElementById("pde-hero-status");
  const gameOverEl = document.getElementById("pde-hero-game-over");
  const restartButton = document.getElementById("pde-hero-restart");
  const finalScoreEl = document.getElementById("pde-hero-final-score");
  const finalTimeEl = document.getElementById("pde-hero-final-time");
  const finalAccuracyEl = document.getElementById("pde-hero-final-accuracy");
  const finalNotesEl = document.getElementById("pde-hero-final-notes");
  const finalHitsEl = document.getElementById("pde-hero-final-hits");
  const finalStreakEl = document.getElementById("pde-hero-final-streak");
  const gameOverTitleEl = document.getElementById("pde-hero-result-title");
  const lyricsEl = document.getElementById("pde-hero-lyrics");
  let lyricSpans = [];
  const state = {
    running: false,
    score: 0,
    combo: 0,
    multiplier: 1,
    maxCombo: 0,
    misses: 0,
    hits: 0,
    overHits: 0,
    sustainSeconds: 0,
    longest: 0,
    stagePresence: 80,
    totalNotes: 0,
    startedAt: 0,
    notes: [],
    pendingNotes: [],
    longPauses: [],
    lyrics: [],
    lyricPhrases: [],
    lyricIndex: -1,
    lyricPhraseIndex: -1,
    lyricActiveIndex: -1,
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
  let savedSettings = {};
  let importedChartSource = null;

  try {
    const parsedSettings = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}",
    );
    if (
      parsedSettings &&
      typeof parsedSettings === "object" &&
      !Array.isArray(parsedSettings)
    )
      savedSettings = parsedSettings;
  } catch (error) {
    console.error("Impossible de lire les paramètres PDE Hero.", error);
    statusEl.textContent = "Paramètres PDE Hero locaux illisibles.";
  }
  if (DIFFICULTIES[savedSettings.difficulty]) {
    difficultySelect.value = savedSettings.difficulty;
    state.difficulty = savedSettings.difficulty;
  }
  for (const [input, value] of [
    [chartSpeedInput, savedSettings.chartSpeed],
    [hyperspeedInput, savedSettings.hyperspeed],
  ]) {
    if (Number.isFinite(value)) {
      input.value = String(
        Math.max(Number(input.min), Math.min(Number(input.max), value)),
      );
    }
  }
  chartSpeedValue.value = `${Math.round(Number(chartSpeedInput.value) * 100)} %`;
  hyperspeedValue.value = `${Number(hyperspeedInput.value).toFixed(1)}×`;
  if (
    typeof savedSettings.importedChart?.name === "string" &&
    typeof savedSettings.importedChart?.content === "string"
  ) {
    try {
      state.chart = savedSettings.importedChart.format === "midi"
        ? parsePdeHeroMidi(decodeMidi(savedSettings.importedChart.content))
        : parsePdeHeroChart(savedSettings.importedChart.content);
      importedChartSource = savedSettings.importedChart;
      selectCustomChart();
      statusEl.textContent = `${importedChartSource.name} chargé depuis les paramètres locaux.`;
    } catch (error) {
      console.error("La dernière chart PDE Hero sauvegardée est invalide.", error);
      statusEl.textContent = "La dernière chart PDE Hero sauvegardée est invalide.";
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          difficulty: difficultySelect.value,
          chartSpeed: Number(chartSpeedInput.value),
          hyperspeed: Number(hyperspeedInput.value),
          chartId: importedChartSource
            ? ""
            : libraryChartSelect.value || savedSettings.chartId || "",
          importedChart: importedChartSource,
        }),
      );
    } catch (error) {
      console.error("Impossible de sauvegarder les paramètres PDE Hero.", error);
      if (!state.running)
        statusEl.textContent = "Impossible de sauvegarder les paramètres PDE Hero localement.";
    }
  }

  function selectCustomChart() {
    let option = [...libraryChartSelect.options].find(
      ({ value }) => value === CUSTOM_CHART_ID,
    );
    if (!option) {
      option = document.createElement("option");
      option.value = CUSTOM_CHART_ID;
      option.textContent = "Charte Custom";
      libraryChartSelect.appendChild(option);
    }
    libraryChartSelect.value = CUSTOM_CHART_ID;
  }

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
      canvas.getBoundingClientRect().width - 4,
    );
    const availableHeight = Math.max(
      160,
      canvas.parentElement.clientHeight - 4,
    );
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

  function getTrackBounds() {
    const center = state.viewWidth / 2;
    const width = state.viewWidth * 0.68;
    return {
      center,
      x: center - width / 2,
      width,
      laneWidth: width / 5,
    };
  }

  function getLaneBounds(lane) {
    const track = getTrackBounds();
    return {
      center: track.x + (lane + 0.5) * track.laneWidth,
      width: track.laneWidth,
    };
  }

  function formatChartDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
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
    const { x: trackX, width: trackWidth, laneWidth } = getTrackBounds();
    const hitY = height - 48;
    const topY = Math.max(0, height * 0.05);

    ctx.fillStyle = "#000";
    ctx.fillRect(trackX, topY, trackWidth, height - topY);
    for (let lane = 0; lane < 5; lane++) {
      const laneX = trackX + lane * laneWidth;
      ctx.fillStyle =
        lane % 2 ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.07)";
      ctx.fillRect(laneX, topY, laneWidth, height - topY);
      ctx.strokeStyle = "rgba(255,255,255,.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(laneX, topY);
      ctx.lineTo(laneX, height);
      ctx.stroke();
      ctx.fillStyle = COLORS[lane];
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        keys[lane].toUpperCase(),
        laneX + laneWidth / 2,
        height - 14,
      );
    }
    ctx.strokeStyle = "rgba(210,220,235,.48)";
    ctx.lineWidth = 3;
    ctx.strokeRect(trackX, topY, trackWidth, height - topY);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(trackX, hitY);
    ctx.lineTo(trackX + trackWidth, hitY);
    ctx.stroke();

    const { width: hitLaneWidth } = getLaneBounds(0);
    const targetRadius = Math.max(0, Math.min(24, hitLaneWidth / 2 - 5));
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(
      trackX,
      hitY - targetRadius - 4,
      trackWidth,
      (targetRadius + 4) * 2,
    );

    for (let lane = 0; lane < 5; lane++) {
      const { center: cx } = getLaneBounds(lane);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, hitY, targetRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    state.notes.forEach((note) => {
      const progress = Math.max(0, (now - note.spawnAt) / note.travelTime);
      const y = note.hitRegistered ? hitY : progress * hitY;
      const { center: x, width: noteLaneWidth } = getLaneBounds(note.lane);
      const radius = Math.max(0, Math.min(20, noteLaneWidth / 2 - 6));
      if (note.sustain > 0) {
        const sustainHeadY = Math.max(topY, y);
        const tailY = Math.max(
          topY,
          Math.min(
            sustainHeadY,
            note.hitRegistered
              ? hitY - ((note.sustainEndAt - now) / note.travelTime) * hitY
              : y - (note.sustain / (note.travelTime / 1000)) * hitY,
          ),
        );
        const { center: tailX } = getLaneBounds(note.lane);
        const tailHalfWidth = Math.max(2, radius * 0.28);
        const noteHalfWidth = Math.max(2, radius * 0.28);
        ctx.globalAlpha = note.releasedAt ? 0.22 : 0.55;
        ctx.fillStyle = COLORS[note.lane];
        ctx.beginPath();
        ctx.moveTo(tailX - tailHalfWidth, tailY);
        ctx.lineTo(tailX + tailHalfWidth, tailY);
        ctx.lineTo(x + noteHalfWidth, sustainHeadY);
        ctx.lineTo(x - noteHalfWidth, sustainHeadY);
        ctx.closePath();
        ctx.fill();
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
    if (state.running) {
      const hudX = trackX + trackWidth + width * 0.012;
      const hudWidth = Math.max(1, width - hudX - width * 0.05);
      const songProgress = Math.min(
        1,
        Math.max(0, (now - state.startedAt) / (state.chartDuration * 1000)),
      );
      const barY = height * 0.1;
      const barHeight = Math.max(6, height * 0.016);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fillRect(hudX, barY, hudWidth, barHeight);
      ctx.fillStyle = "#168cff";
      ctx.fillRect(hudX, barY, hudWidth * songProgress, barHeight);
      const presenceY = barY + barHeight + 5;
      const presenceHeight = Math.max(4, barHeight * 0.65);
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fillRect(hudX, presenceY, hudWidth, presenceHeight);
      ctx.fillStyle = "#63e6be";
      ctx.fillRect(
        hudX,
        presenceY,
        hudWidth * Math.max(0, Math.min(100, state.stagePresence)) / 100,
        presenceHeight,
      );

      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${Math.max(14, Math.min(34, width * 0.035))}px sans-serif`;
      ctx.fillText(state.score.toLocaleString(), hudX + hudWidth, height * 0.19);

      const multiplierProgress = state.multiplier === 4 ? 10 : state.combo % 10;
      const segmentGap = 2;
      const orbRadius = Math.min(24, width * 0.045, height * 0.07);
      const orbX = trackX + trackWidth;
      const orbY = (topY + height - 48) / 2;
      const segmentWidth = Math.min(8, Math.max(4, width * 0.012));
      const segmentHeight = Math.max(3, Math.min(7, height * 0.012));
      const segmentsHeight = segmentHeight * 10 + segmentGap * 9;
      const segmentsX = orbX - segmentWidth / 2;
      const segmentsY = orbY - orbRadius - 5 - segmentsHeight;
      ctx.fillStyle = "#000";
      for (let i = 0; i < 10; i++) {
        ctx.fillRect(
          segmentsX,
          segmentsY + (9 - i) * (segmentHeight + segmentGap),
          segmentWidth,
          segmentHeight,
        );
      }
      ctx.fillStyle = "#d38aff";
      for (let i = 0; i < multiplierProgress; i++) {
        ctx.fillRect(
          segmentsX,
          segmentsY + (9 - i) * (segmentHeight + segmentGap),
          segmentWidth,
          segmentHeight,
        );
      }
      ctx.beginPath();
      ctx.arc(orbX, orbY, orbRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(12,8,20,.9)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#bf4dff";
      ctx.stroke();
      ctx.fillStyle = "#d38aff";
      ctx.textAlign = "center";
      ctx.font = `bold ${Math.max(10, orbRadius * 1.05)}px sans-serif`;
      ctx.fillText(`x${state.multiplier}`, orbX, orbY);
      canvas.setAttribute(
        "aria-label",
        `PDE Hero. Score ${state.score}. Série ${state.combo}. Multiplicateur x${state.multiplier}. Progression ${Math.floor(songProgress * 100)}%. Stage presence ${state.stagePresence}%.`,
      );
    }
    const flashRemaining = Math.max(0, state.missFlashUntil - now);
    if (flashRemaining > 0) {
      ctx.fillStyle = `rgba(220, 25, 35, ${0.3 * (flashRemaining / 180)})`;
      ctx.fillRect(0, 0, width, height);
    }
    state.particles = state.particles.filter(
      (particle) => now - particle.createdAt < particle.duration,
    );
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    state.particles.forEach((particle) => {
      const progress = Math.max(0, (now - particle.createdAt) / particle.duration);
      const x = particle.x + particle.vx * progress;
      const y = particle.y + particle.vy * progress + progress * progress * 35;
      const radius = Math.max(2.5, particle.size * (1 - progress * 0.35));
      ctx.globalAlpha = Math.max(0.35, 1 - progress);
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = Math.max(12, radius * 3);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    const activePause = state.longPauses.find(
      (pause) => now >= pause.startAt && now < pause.endAt,
    );
    if (activePause) {
      const secondsUntilNextNote = Math.ceil(
        (activePause.nextNoteAt - now) / 1000,
      );
      const centerX = trackX + trackWidth / 2;
      const centerY = (topY + hitY) / 2;
      const panelWidth = Math.min(trackWidth * 0.72, 300);
      const panelHeight = Math.max(76, height * 0.19);
      ctx.fillStyle = "rgba(0,0,0,.82)";
      ctx.fillRect(
        centerX - panelWidth / 2,
        centerY - panelHeight / 2,
        panelWidth,
        panelHeight,
      );
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(12, Math.min(18, width * 0.022))}px sans-serif`;
      ctx.fillText("PROCHAINE NOTE", centerX, centerY - panelHeight * 0.22);
      ctx.fillStyle = "#ff9d32";
      ctx.font = `800 ${Math.max(24, Math.min(48, width * 0.06))}px sans-serif`;
      ctx.fillText(`${secondsUntilNextNote}`, centerX, centerY + panelHeight * 0.2);
    }
  }

  function updateLyrics() {
    const lyric = state.lyrics[state.lyricIndex];
    if (!lyric) return;
    const phraseIndex = state.lyricPhrases.findIndex(
      (phrase) =>
        state.lyricIndex >= phrase.startIndex &&
        state.lyricIndex < phrase.endIndex,
    );
    if (phraseIndex !== state.lyricPhraseIndex) {
      const phrase = state.lyricPhrases[phraseIndex];
      lyricsEl.replaceChildren();
      lyricSpans = phrase.syllables.map((syllable) => {
        if (syllable.separatorBefore)
          lyricsEl.append(document.createTextNode(syllable.separatorBefore));
        const span = document.createElement("span");
        span.textContent = syllable.text;
        lyricsEl.append(span);
        return span;
      });
      state.lyricPhraseIndex = phraseIndex;
      state.lyricActiveIndex = -1;
    }
    const activeIndex = state.lyricIndex - state.lyricPhrases[phraseIndex].startIndex;
    if (activeIndex !== state.lyricActiveIndex) {
      lyricSpans.forEach((span, index) =>
        span.classList.toggle("is-active", index <= activeIndex),
      );
      state.lyricActiveIndex = activeIndex;
    }
  }

  function frame(now) {
    if (!state.running) return;
    state.lastFrame = now;
    const travelTime = state.travelTime;
    const hitY = state.viewHeight - 48;
    const { laneWidth } = getTrackBounds();
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
        hitRegistered: false,
      });
    }
    const completedHolds = state.notes.filter(
      (note) => note.holding && now >= note.sustainEndAt,
    );
    state.notes
      .filter((note) => note.holding)
      .forEach((note) => creditSustain(note, now));
    for (const note of completedHolds) {
      endSustain(note, note.sustainEndAt);
    }
    const expired = state.notes.filter(
      (note) => !note.hitRegistered && note.missAt < now,
    );
    expired.forEach(() => registerMiss());
    state.notes
      .filter((note) => note.holding && now - (note.lastParticleAt || 0) >= 65)
      .forEach((note) => {
        note.lastParticleAt = now;
        const { center: x } = getLaneBounds(note.lane);
        const y = hitY - 8;
        state.particles.push(
          ...Array.from({ length: 3 }, () => ({
            x,
            y,
            vx: (Math.random() - 0.5) * 90,
            vy: -(18 + Math.random() * 50),
            size: 3 + Math.random() * 3,
            color: COLORS[note.lane],
            createdAt: now,
            duration: 350 + Math.random() * 250,
          })),
        );
      });
    state.notes = state.notes.filter((note) =>
      note.hitRegistered
        ? note.holding || now < note.sustainEndAt
        : note.missAt >= now,
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
    while (
      state.lyricIndex + 1 < state.lyrics.length &&
      state.lyrics[state.lyricIndex + 1].at <= now
    ) {
      state.lyricIndex += 1;
    }
    updateLyrics();
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
    state.missFlashUntil = performance.now() + 180;
    draw(performance.now());
    window.setTimeout(() => draw(performance.now()), 190);
    if (state.stagePresence <= 0) {
      finish("Stage presence épuisée");
    }
  }

  function registerOverHit() {
    if (!state.running) return;
    state.overHits += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.combo = 0;
    state.multiplier = 1;
    state.missFlashUntil = performance.now() + 180;
    draw(performance.now());
    window.setTimeout(() => draw(performance.now()), 190);
  }

  function finish(
    message = "Partie terminee",
    { completed = false, stopped = false } = {},
  ) {
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
    stopButton.hidden = true;
    statusEl.textContent = `${message} - ${state.score} points`;
    const finalDuration = Math.floor(duration);
    const accuracy = state.hits + state.misses
      ? Math.round((state.hits / (state.hits + state.misses)) * 100)
      : 0;
    gameOverTitleEl.textContent = completed
      ? "CHART TERMINÉE"
      : stopped
        ? "PARTIE ARRÊTÉE"
        : "GAME OVER";
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
        sustainSeconds: state.sustainSeconds,
        completed,
      });
    }
    lyricsEl.hidden = true;
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
    state.longPauses = schedulePdeHeroLongPauses(
      chartTrack,
      schedule.startAt,
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
    state.sustainSeconds = 0;
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
    state.lyrics = schedulePdeHeroLyrics(
      state.chart.lyrics || [],
      schedule.startAt,
      chartSpeed,
    );
    state.lyricPhrases = groupPdeHeroLyrics(state.lyrics);
    state.lyricIndex = -1;
    state.lyricPhraseIndex = -1;
    state.lyricActiveIndex = -1;
    lyricsEl.replaceChildren();
    lyricsEl.hidden = state.lyrics.length === 0;
    state.particles = [];
    state.chartDuration = schedule.duration;
    state.lastFrame = state.startedAt;
    startButton.disabled = true;
    stopButton.hidden = false;
    chartImportButton.disabled = true;
    libraryChartSelect.disabled = true;
    chartSpeedInput.disabled = true;
    hyperspeedInput.disabled = true;
    statusEl.textContent = `En jeu — ${DIFFICULTIES[chartDifficulty].label} (${chartTrack.name})`;
    state.animation = requestAnimationFrame(frame);
  }

  function registerHit(hitNote, lane, now) {
    const hitY = state.viewHeight - 48;
    const noteProgress = Math.min(
      1,
      (now - hitNote.spawnAt) / hitNote.travelTime,
    );
    const noteY = Math.min(hitY, noteProgress * hitY);
    state.hits += 1;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.multiplier = getPdeHeroMultiplier(state.combo);
    state.stagePresence = adjustPdeHeroStagePresence(state.stagePresence, true);
    state.score += Math.round(100 * state.multiplier * state.scoreMultiplier);
    const { laneWidth, center: laneCenter } = getLaneBounds(lane);
    state.particles.push(
      ...Array.from({ length: 16 }, () => ({
        x: laneCenter,
        y: noteY,
        vx: (Math.random() - 0.5) * laneWidth * 3.2,
        vy: -(40 + Math.random() * 80),
        size: 5 + Math.random() * 5,
        color: COLORS[lane],
        createdAt: now,
        duration: 650 + Math.random() * 300,
      })),
    );
  }

  function creditSustain(note, at) {
    const heldSeconds = Math.min(
      note.sustain,
      Math.max(0, (at - note.sustainStartedAt) / 1000),
    );
    const scoredSeconds = note.sustainScoredSeconds || 0;
    state.score +=
      getPdeHeroSustainBonus(
        heldSeconds,
        note.holdMultiplier,
        state.scoreMultiplier,
      ) -
      getPdeHeroSustainBonus(
        scoredSeconds,
        note.holdMultiplier,
        state.scoreMultiplier,
      );
    note.sustainScoredSeconds = heldSeconds;
    return heldSeconds;
  }

  function endSustain(note, endedAt) {
    const heldSeconds = creditSustain(note, endedAt);
    state.sustainSeconds += heldSeconds;
    note.holding = false;
    note.releasedAt = endedAt;
  }

  function hit(key) {
    if (!state.running) return;
    const now = performance.now();
    if (state.longPauses.some((pause) => now >= pause.startAt && now < pause.endAt))
      return;
    const lane = keys.indexOf(key.toLowerCase());
    if (lane < 0) {
      registerMiss();
      return;
    }
    const laneNote = state.notes.find(
      (note) => note.lane === lane && !note.hitRegistered,
    );
    if (laneNote && !laneNote.holding && now > laneNote.missAt) {
      state.notes.splice(state.notes.indexOf(laneNote), 1);
      registerMiss();
      return;
    }
    const index = state.notes.findIndex(
      (note) => !note.hitRegistered &&
        note.lane === lane && now >= note.hitAt - 280 && now <= note.missAt,
    );
    if (index < 0) {
      registerOverHit();
      return;
    }
    const hitNote = state.notes[index];
    if (hitNote.sustain > 0) {
      hitNote.holding = true;
      hitNote.hitRegistered = true;
      hitNote.holdMultiplier = state.multiplier;
      hitNote.sustainStartedAt = now;
      hitNote.sustainScoredSeconds = 0;
      hitNote.sustainEndAt = hitNote.hitAt + hitNote.sustain * 1000;
      registerHit(hitNote, lane, now);
      return;
    }
    state.notes.splice(index, 1);
    registerHit(hitNote, lane, now);
  }

  function release(key) {
    if (!state.running) return;
    const lane = keys.indexOf(key.toLowerCase());
    const index = state.notes.findIndex(
      (note) => note.lane === lane && note.holding,
    );
    if (index < 0) return;
    const note = state.notes[index];
    endSustain(note, Math.min(performance.now(), note.sustainEndAt));
  }

  startButton.addEventListener("click", start);
  stopButton.addEventListener("click", () =>
    finish("Partie arrêtée — score non enregistré", { stopped: true }),
  );
  restartButton.addEventListener("click", start);
  chartImportButton.addEventListener("click", () => chartFileInput.click());
  chartSpeedInput.addEventListener("input", () => {
    chartSpeedValue.value = `${Math.round(Number(chartSpeedInput.value) * 100)} %`;
    saveSettings();
  });
  hyperspeedInput.addEventListener("input", () => {
    hyperspeedValue.value = `${Number(hyperspeedInput.value).toFixed(1)}×`;
    saveSettings();
  });
  chartFileInput.addEventListener("change", async () => {
    const file = chartFileInput.files[0];
    if (!file) return;
    try {
      if (state.running) throw new Error("Terminez la partie avant d’importer.");
      const extension = file.name.split(".").pop().toLowerCase();
      if (!["chart", "mid", "midi"].includes(extension))
        throw new Error("Sélectionnez un fichier .chart ou .mid.");
      if (extension === "chart") {
        const content = await file.text();
        state.chart = parsePdeHeroChart(content);
        importedChartSource = { name: file.name, content, format: "chart" };
      } else {
        const content = await file.arrayBuffer();
        state.chart = parsePdeHeroMidi(content);
        importedChartSource = {
          name: file.name,
          content: encodeMidi(content),
          format: "midi",
        };
      }
      selectCustomChart();
      saveSettings();
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
    if (!chartId || chartId === CUSTOM_CHART_ID) return;
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
      const chart = result.format === "midi"
        ? parsePdeHeroMidi(decodeMidi(result.content))
        : parsePdeHeroChart(result.content);
      const selectedTrack = selectChartTrack(chart, difficultySelect.value);
      state.chart = chart;
      importedChartSource = null;
      libraryChartSelect.querySelector(
        `option[value="${CUSTOM_CHART_ID}"]`,
      )?.remove();
      saveSettings();
      statusEl.textContent = `${libraryChartSelect.selectedOptions[0].textContent} chargé — ${selectedTrack.track.notes.length} notes (${selectedTrack.track.name}).`;
    } catch (error) {
      statusEl.textContent = `Import impossible : ${error.message}`;
      libraryChartSelect.value = "";
    } finally {
      libraryChartSelect.disabled = state.running;
    }
  });
  difficultySelect.addEventListener("change", () => {
    const newDifficulty = difficultySelect.value;
    state.difficulty = newDifficulty;
    saveSettings();
    if (!state.running) return;
    finish("Partie abandonnée : difficulté modifiée", { save: false });
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
      charts.forEach(({ id, title, duration }) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = Number.isFinite(duration)
          ? `${title} (${formatChartDuration(duration)})`
          : title;
        libraryChartSelect.appendChild(option);
      });
      if (!state.chart && savedSettings.chartId) {
        libraryChartSelect.value = savedSettings.chartId;
        if (libraryChartSelect.value) {
          libraryChartSelect.dispatchEvent(new Event("change"));
        }
      }
      if (charts.length === 0 && !state.chart) {
        statusEl.textContent =
          "Aucune chart disponible — importez un fichier .chart.";
      }
    })
    .catch((error) => {
      statusEl.textContent = `Bibliothèque indisponible : ${error.message}`;
    });
}
