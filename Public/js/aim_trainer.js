export function initAimTrainer(socket) {
  const stage = document.getElementById("stage21");
  const arena = document.getElementById("aim-arena");
  const shapeSelect = document.getElementById("aim-shape-select");
  const durationSelect = document.getElementById("aim-duration-select");
  const startBtn = document.getElementById("aim-start-btn");
  const resetBtn = document.getElementById("aim-reset-btn");
  const timeEl = document.getElementById("aim-time");
  const scoreEl = document.getElementById("aim-score");
  const missesEl = document.getElementById("aim-misses");
  const accuracyEl = document.getElementById("aim-accuracy");
  const ratioEl = document.getElementById("aim-ratio");

  if (
    !stage ||
    !arena ||
    !shapeSelect ||
    !durationSelect ||
    !startBtn ||
    !resetBtn ||
    !timeEl ||
    !scoreEl ||
    !missesEl ||
    !accuracyEl ||
    !ratioEl
  ) {
    return;
  }

  const TARGET_SIZE = 58;

  const state = {
    running: false,
    paused: false,
    pauseSource: null,
    score: 0,
    misses: 0,
    durationSec: 30,
    remainingMs: 30000,
    endAt: 0,
    timerId: null,
    currentTarget: null,
  };

  function randInt(min, max) {
    const mi = Math.floor(min);
    const ma = Math.floor(max);
    if (ma <= mi) return mi;
    return Math.floor(Math.random() * (ma - mi + 1)) + mi;
  }

  function selectedShape() {
    const v = String(shapeSelect.value || "").trim();
    if (v === "square" || v === "circle") return v;
    return "square";
  }

  function selectedDurationSec() {
    const v = Number.parseInt(String(durationSelect.value || "30"), 10);
    if (v === 15 || v === 30 || v === 60) return v;
    return 30;
  }

  function durationLabel(sec) {
    if (sec === 60) return "1mn";
    return `${sec}s`;
  }

  function getShots() {
    return Math.max(0, state.score + state.misses);
  }

  function getAccuracyPercent() {
    const shots = getShots();
    if (shots <= 0) return 0;
    return (state.score / shots) * 100;
  }

  function getRatioText() {
    return `${state.score}:${state.misses}`;
  }

  function clearTarget() {
    if (state.currentTarget && state.currentTarget.parentNode) {
      state.currentTarget.parentNode.removeChild(state.currentTarget);
    }
    state.currentTarget = null;
  }

  function syncHud() {
    timeEl.textContent = `Temps: ${Math.max(0, Math.ceil(state.remainingMs / 1000))}s`;
    scoreEl.textContent = `Touches: ${state.score}`;
    missesEl.textContent = `Rates: ${state.misses}`;
    accuracyEl.textContent = `Precision: ${getAccuracyPercent().toFixed(1)}%`;
    ratioEl.textContent = `Ratio: ${getRatioText()}`;
  }

  function ensureArenaBounds() {
    const rect = arena.getBoundingClientRect();
    const minW = Math.max(240, Math.floor(rect.width));
    const minH = Math.max(300, Math.floor(rect.height));
    if (arena.clientWidth < minW || arena.clientHeight < minH) {
      arena.style.minHeight = "360px";
    }
  }

  function placeTargetRandomly(target, previousPos = null) {
    if (!target) return;
    const arenaRect = arena.getBoundingClientRect();
    const targetSize = TARGET_SIZE;
    const maxX = Math.max(8, Math.floor(arenaRect.width - targetSize - 8));
    const maxY = Math.max(8, Math.floor(arenaRect.height - targetSize - 8));

    let x = 8;
    let y = 8;
    for (let i = 0; i < 12; i += 1) {
      x = randInt(8, maxX);
      y = randInt(8, maxY);
      if (!previousPos) break;
      const dx = Math.abs(x - previousPos.x);
      const dy = Math.abs(y - previousPos.y);
      if (dx > 18 || dy > 18) break;
    }

    target.style.width = `${targetSize}px`;
    target.style.height = `${targetSize}px`;
    target.style.left = `${x}px`;
    target.style.top = `${y}px`;
  }

  function spawnTarget() {
    if (!state.running || state.paused) return;

    clearTarget();

    const target = document.createElement("button");
    target.type = "button";
    target.className = "aim-target";

    const shape = selectedShape();
    target.dataset.shape = shape;

    placeTargetRandomly(target);

    target.addEventListener("click", (e) => {
      e.preventDefault();
      if (!state.running || state.paused) return;
      state.score += 1;
      syncHud();
      const prev = {
        x: Math.floor(Number.parseInt(target.style.left, 10) || 0),
        y: Math.floor(Number.parseInt(target.style.top, 10) || 0),
      };
      placeTargetRandomly(target, prev);
    });

    arena.appendChild(target);
    state.currentTarget = target;
  }

  function stopTimers() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function finishRun() {
    if (!state.running) return;
    state.running = false;
    state.paused = false;
    state.pauseSource = null;
    stopTimers();
    shapeSelect.disabled = false;
    durationSelect.disabled = false;
    clearTarget();

    const empty = document.createElement("div");
    empty.className = "aim-arena-empty";
    const accuracy = getAccuracyPercent();
    const ratio = getRatioText();
    empty.innerHTML = `Partie terminee<br>${state.score} touches, ${state.misses} rates<br>Precision: ${accuracy.toFixed(1)}%<br>Ratio: ${ratio}`;
    arena.innerHTML = "";
    arena.appendChild(empty);

    try {
      socket.emit("aim:submit", {
        score: state.score,
        hits: state.score,
        misses: state.misses,
        duration: state.durationSec,
      });
    } catch {}

    startBtn.textContent = `Rejouer (${durationLabel(state.durationSec)})`;
  }

  function tickTimer() {
    if (!state.running || state.paused) return;
    state.remainingMs = Math.max(0, state.endAt - Date.now());
    syncHud();
    if (state.remainingMs <= 0) {
      finishRun();
    }
  }

  function startRun() {
    stopTimers();
    clearTarget();

    state.running = true;
    state.paused = false;
    state.pauseSource = null;
    state.score = 0;
    state.misses = 0;
    state.durationSec = selectedDurationSec();
    state.remainingMs = state.durationSec * 1000;
    state.endAt = Date.now() + state.remainingMs;
    shapeSelect.disabled = true;
    durationSelect.disabled = true;

    arena.innerHTML = "";
    syncHud();
    spawnTarget();

    state.timerId = setInterval(tickTimer, 100);
    return true;
  }

  function pauseRun(source = "manual") {
    if (!state.running || state.paused) return false;
    state.paused = true;
    state.pauseSource = source;
    state.remainingMs = Math.max(0, state.endAt - Date.now());
    stopTimers();
    syncHud();
    return true;
  }

  function resumeRun() {
    if (!state.running || !state.paused) return false;
    state.paused = false;
    state.pauseSource = null;
    state.endAt = Date.now() + state.remainingMs;
    state.timerId = setInterval(tickTimer, 100);
    if (!state.currentTarget) spawnTarget();
    return true;
  }

  function resetRun() {
    stopTimers();
    state.running = false;
    state.paused = false;
    state.pauseSource = null;
    state.score = 0;
    state.misses = 0;
    state.durationSec = selectedDurationSec();
    state.remainingMs = state.durationSec * 1000;
    shapeSelect.disabled = false;
    durationSelect.disabled = false;
    clearTarget();
    arena.innerHTML =
      '<div class="aim-arena-empty">Choisis une forme puis lance la partie.</div>';
    syncHud();
  }

  arena.addEventListener("click", (e) => {
    if (!state.running || state.paused) return;
    if (e.target === state.currentTarget) return;
    state.misses += 1;
    syncHud();
  });

  startBtn.addEventListener("click", () => {
    if (state.running) {
      if (state.paused) resumeRun();
      else pauseRun("manual");
      startBtn.textContent = state.paused ? "Reprendre" : "Pause";
      return;
    }
    if (startRun()) {
      startBtn.textContent = "Pause";
    }
  });

  resetBtn.addEventListener("click", () => {
    resetRun();
    startBtn.textContent = `Lancer (${durationLabel(state.durationSec)})`;
  });

  durationSelect.addEventListener("change", () => {
    if (state.running) return;
    state.durationSec = selectedDurationSec();
    state.remainingMs = state.durationSec * 1000;
    syncHud();
    startBtn.textContent = `Lancer (${durationLabel(state.durationSec)})`;
  });

  window.addEventListener("pde:stage-nav-guard", (e) => {
    const detail = e?.detail;
    if (!detail || detail.stageId !== "stage21") return;

    if (detail.action === "pause") {
      const runningNow = state.running && !state.paused;
      detail.running = !!runningNow;
      detail.pausedNow = false;
      if (!runningNow) return;
      detail.pausedNow = pauseRun("navigation");
      if (detail.pausedNow) startBtn.textContent = "Reprendre";
      return;
    }

    if (detail.action === "resume") {
      if (state.paused && state.pauseSource === "navigation") {
        resumeRun();
        startBtn.textContent = "Pause";
      }
    }
  });

  window.addEventListener("pde:section-activated", (event) => {
    const sectionId = event?.detail?.sectionId;
    if (sectionId === "stage21") {
      ensureArenaBounds();
      return;
    }

    if (sectionId !== "stage21" && state.running && !state.paused) {
      pauseRun("section-switch");
      startBtn.textContent = "Reprendre";
    }
  });

  state.durationSec = selectedDurationSec();
  state.remainingMs = state.durationSec * 1000;
  syncHud();
  startBtn.textContent = `Lancer (${durationLabel(state.durationSec)})`;
}
