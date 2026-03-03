export function initSudoku(socket) {
  const gridEl = document.getElementById("sudoku-grid");
  const padEl = document.getElementById("sudoku-pad");
  const timerEl = document.getElementById("sudoku-timer");
  const msgEl = document.getElementById("sudoku-msg");
  const newBtn = document.getElementById("sudoku-new");
  const clearBtn = document.getElementById("sudoku-clear");

  if (!gridEl || !padEl || !timerEl || !msgEl || !newBtn || !clearBtn) return;

  const puzzles = [
    {
      puzzle:
        "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
      solution:
        "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
    },
    {
      puzzle:
        "003020600900305001001806400008102900700000008006708200002609500800203009005010300",
      solution:
        "483921657967345821251876493548132976729564138136798245372689514814253769695417382",
    },
    {
      puzzle:
        "200080300060070084030500209000105408000000000402706000301007040720040060004010003",
      solution:
        "245981376169273584837564219976125438513498627482736951391657842728349165654812793",
    },
  ];

  let current = null;
  let board = [];
  let selectedIndex = -1;
  let accumulatedMs = 0;
  let runningSince = 0;
  let timerInterval = null;
  let completed = false;
  let hasPlayerStarted = false;
  let lastServerSaveAt = 0;

  const SERVER_SAVE_THROTTLE_MS = 1200;
  const LOCAL_SAVE_KEY = "sudoku_local_save_v1";

  function isSudokuStageActive() {
    const stage = document.getElementById("stage19");
    return !!stage && stage.classList.contains("is-active");
  }

  function setPlayUiVisible(visible) {
    gridEl.style.display = visible ? "" : "none";
    padEl.style.display = visible ? "" : "none";
    clearBtn.style.display = visible ? "" : "none";
  }

  function fmtTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function buildSavePayload() {
    if (!current || !Array.isArray(board) || board.length !== 81) return null;

    return {
      puzzle: String(current.puzzle || ""),
      solution: String(current.solution || ""),
      board: board.slice(0, 81).map((v) => String(v || "0")),
      selectedIndex,
      accumulatedMs: getElapsedMs(),
      hasPlayerStarted,
      completed,
    };
  }

  function saveLocalState() {
    try {
      const payload = buildSavePayload();
      if (!payload || payload.completed) return;
      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearSavedState() {
    try {
      socket.emit("sudoku:clearState");
    } catch (e) {}
    try {
      localStorage.removeItem(LOCAL_SAVE_KEY);
    } catch (e) {}
  }

  function saveStateToServer(force = false) {
    const payload = buildSavePayload();
    if (!payload || payload.completed) return;

    const now = Date.now();
    if (!force && now - lastServerSaveAt < SERVER_SAVE_THROTTLE_MS) {
      return;
    }
    lastServerSaveAt = now;

    try {
      socket.emit("sudoku:saveState", payload);
    } catch (e) {}

    saveLocalState();
  }

  function restoreFromState(save) {
    if (!save || typeof save !== "object") return false;

    const puzzle = String(save.puzzle || "");
    const solution = String(save.solution || "");
    const savedBoard = Array.isArray(save.board) ? save.board : [];

    if (
      puzzle.length !== 81 ||
      solution.length !== 81 ||
      savedBoard.length !== 81
    ) {
      return false;
    }

    current = { puzzle, solution };
    board = savedBoard.map((v) => {
      const s = String(v || "0");
      return /^[0-9]$/.test(s) ? s : "0";
    });
    selectedIndex = Number.isInteger(save.selectedIndex)
      ? Math.max(-1, Math.min(80, save.selectedIndex))
      : -1;
    accumulatedMs = Math.max(0, Number(save.accumulatedMs) || 0);
    runningSince = 0;
    completed = false;
    hasPlayerStarted = !!save.hasPlayerStarted;
    setPlayUiVisible(true);

    setMessage("");
    stopTimerLoop();
    tickTimer();
    renderGrid();
    resumeTimer();
    return true;
  }

  function tickTimer() {
    timerEl.textContent = fmtTime(getElapsedMs());
    if (!completed && hasPlayerStarted) {
      saveStateToServer(false);
    }
  }

  function getElapsedMs() {
    if (!runningSince) return accumulatedMs;
    return accumulatedMs + (Date.now() - runningSince);
  }

  function startTimerLoop() {
    if (completed || timerInterval) return;
    timerInterval = setInterval(tickTimer, 500);
  }

  function stopTimerLoop() {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function resumeTimer() {
    if (
      completed ||
      runningSince ||
      !isSudokuStageActive() ||
      !hasPlayerStarted
    )
      return;
    runningSince = Date.now();
    startTimerLoop();
    tickTimer();
  }

  function startOnPlayerAction() {
    if (completed || hasPlayerStarted) return;
    hasPlayerStarted = true;
    resumeTimer();
  }

  function pauseTimer() {
    if (!runningSince) {
      stopTimerLoop();
      return;
    }
    accumulatedMs = getElapsedMs();
    runningSince = 0;
    stopTimerLoop();
    tickTimer();
  }

  function setMessage(text, ok = false) {
    msgEl.textContent = text || "";
    msgEl.style.color = ok ? "var(--primary-color)" : "var(--red-color)";
    if (!text) msgEl.style.color = "var(--primary-color)";
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sudoku-cell";
      const row = Math.floor(i / 9);
      const col = i % 9;

      if (col === 2 || col === 5) cell.classList.add("block-r");
      if (row === 2 || row === 5) cell.classList.add("block-b");

      const given = current.puzzle[i] !== "0";
      if (given) cell.classList.add("fixed");
      if (i === selectedIndex) cell.classList.add("active");

      const value = Number(board[i]) || 0;
      cell.textContent = value ? String(value) : "";

      cell.addEventListener("click", () => {
        if (given || completed) return;
        startOnPlayerAction();
        selectedIndex = i;
        renderGrid();
        saveStateToServer(false);
      });

      gridEl.appendChild(cell);
    }
  }

  function isSolved() {
    const cur = board.join("");
    return cur === current.solution;
  }

  function applyValue(value) {
    if (completed || selectedIndex < 0) return;
    if (current.puzzle[selectedIndex] !== "0") return;
    startOnPlayerAction();
    board[selectedIndex] = value;
    renderGrid();

    if (!board.includes("0") && isSolved()) {
      completed = true;
      const elapsed = getElapsedMs();
      pauseTimer();
      setPlayUiVisible(false);
      setMessage(
        `Grille complétée ! (${fmtTime(elapsed)}) • Clique sur "Nouvelle grille" pour continuer.`,
        true,
      );
      clearSavedState();
      socket.emit("sudoku:completed", {
        difficulty: "normal",
        timeMs: elapsed,
      });
      return;
    }

    saveStateToServer(false);
  }

  function renderPad() {
    padEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sudoku-pad-btn";
      btn.textContent = String(n);
      btn.addEventListener("click", () => applyValue(String(n)));
      padEl.appendChild(btn);
    }
  }

  function newGame() {
    current = puzzles[Math.floor(Math.random() * puzzles.length)];
    board = current.puzzle.split("");
    selectedIndex = -1;
    completed = false;
    hasPlayerStarted = false;
    accumulatedMs = 0;
    runningSince = 0;
    setPlayUiVisible(true);
    setMessage("");

    stopTimerLoop();
    tickTimer();

    renderGrid();
    saveStateToServer(true);
  }

  clearBtn.addEventListener("click", () => applyValue("0"));
  newBtn.addEventListener("click", newGame);

  function onSudokuKeydown(event) {
    const stage = document.getElementById("stage19");
    if (!stage || !stage.classList.contains("is-active")) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const targetTag = String(event.target?.tagName || "").toLowerCase();
    if (targetTag === "input" || targetTag === "textarea") return;

    const key = String(event.key || "");

    if (/^[1-9]$/.test(key)) {
      event.preventDefault();
      applyValue(key);
      return;
    }

    if (key === "Backspace" || key === "Delete" || key === "0") {
      event.preventDefault();
      applyValue("0");
    }
  }

  document.addEventListener("keydown", onSudokuKeydown);

  window.addEventListener("pde:section-activated", (e) => {
    const sectionId = e && e.detail ? e.detail.sectionId : null;
    if (sectionId === "stage19") {
      resumeTimer();
      return;
    }
    pauseTimer();
  });

  socket.on("sudoku:ack", (payload) => {
    if (!payload) return;
    const total = Number(payload.completed || 0);
    const moneyGained = Number(payload.moneyGained || 0);
    const moneyTotal = Number(payload.moneyTotal || 0);
    if (total > 0) {
      setMessage(
        `Bravo ! Total grilles complétées: ${total} • +${moneyGained.toLocaleString(
          "fr-FR",
        )} monnaie (total gagné: ${moneyTotal.toLocaleString("fr-FR")}) • Clique sur "Nouvelle grille" pour continuer.`,
        true,
      );
      clearSavedState();
      socket.emit("sudoku:requestLeaderboard");
    }
  });

  socket.on("connect", () => {
    try {
      socket.emit("sudoku:loadState");
    } catch (e) {}
  });

  socket.on("sudoku:state", (payload) => {
    if (payload && payload.found && payload.state) {
      const restored = restoreFromState(payload.state);
      if (!restored) newGame();
      return;
    }

    const local = loadLocalState();
    if (!restoreFromState(local)) {
      newGame();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      pauseTimer();
      saveStateToServer(true);
    }
  });

  window.addEventListener("beforeunload", () => {
    pauseTimer();
    saveStateToServer(true);
  });

  renderPad();
  try {
    socket.emit("sudoku:loadState");
  } catch (e) {
    const local = loadLocalState();
    if (!restoreFromState(local)) newGame();
  }
  if (!isSudokuStageActive()) {
    pauseTimer();
  }
}
