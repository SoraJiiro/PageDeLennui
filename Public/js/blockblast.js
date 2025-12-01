import { showNotif } from "./util.js";

export function initBlockBlast(socket) {
  const GRID_SIZE = 8; // Le jeu original utilise 8x8

  // ---------- Cache UI ----------
  const ui = {
    grid: document.querySelector(".blockblast-grid"),
    pieces: document.querySelector(".blockblast-pieces"),
    scoreEl: document.querySelector(".blockblast-score"),
    timeEl: document.querySelector(".blockblast-time"),
    resetBtn: document.querySelector(".blockblast-reset"),
    resetGridBtn: document.querySelector(".blockblast-reset-grid"),
    gameoverEl: document.querySelector(".blockblast-gameover"),
    gameoverScore: document.querySelector(".blockblast-gameover-score"),
    gameoverTime: document.querySelector(".blockblast-gameover-time"),
    restartBtn: document.querySelector(".blockblast-restart"),
  };

  if (!ui.grid) return;

  // ---------- État du jeu ----------
  const state = {
    grid: Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(false)),
    score: 0,
    currentPieces: [],
    gameOver: false,
    selectedPiece: null,
    draggedPiece: null,
    dragPreview: null,
    moveHistory: [],
    previewCells: new Set(),
    combo: 0, // Compteur de combo
    totalLinesCleared: 0, // Total de lignes effacées dans la session
    consecutivePlacements: 0, // Placements consécutifs sans clear
    // Temps écoulé en millisecondes (persisté avec la sauvegarde)
    elapsedMs: 0,
  };

  // Timer interne
  let timerId = null;
  let lastTick = null;
  let lastLocalSave = 0;
  const INACTIVITY_MS = 5000; // 5s d'inactivité -> figer le timer
  let inactivityTimeoutId = null;
  let isInViewport = true; // maintenu par IntersectionObserver

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0)
      return `${String(h).padStart(2, "0")}:${String(m).padStart(
        2,
        "0"
      )}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateTimerDisplay() {
    if (!ui.timeEl) return;
    ui.timeEl.textContent = formatTime(state.elapsedMs);
    // Sauvegarde locale périodique (throttled)
    try {
      const now = Date.now();
      if (now - lastLocalSave > 1000) {
        lastLocalSave = now;
        saveLocalState();
      }
    } catch (e) {}
  }

  // Sauvegarde locale (fallback quand socket ne peut pas transmettre lors du beforeunload)
  const LOCAL_SAVE_KEY = "blockblast_local_save_v1";

  function saveLocalState() {
    try {
      const small = {
        grid: state.grid,
        score: state.score,
        pieces: state.currentPieces.map((p) => ({
          shape: p.shape,
          used: p.used,
          color: p.color,
        })),
        elapsedMs: state.elapsedMs,
        gameOver: !!state.gameOver,
        at: Date.now(),
      };
      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(small));
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

  function startTimer() {
    if (state.gameOver) return;
    if (timerId) return;
    lastTick = Date.now();
    timerId = setInterval(() => {
      const now = Date.now();
      state.elapsedMs += now - lastTick;
      lastTick = now;
      updateTimerDisplay();
    }, 250);
    updateTimerDisplay();
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
      lastTick = null;
    }
    updateTimerDisplay();
  }

  function clearInactivityTimeout() {
    if (inactivityTimeoutId) {
      clearTimeout(inactivityTimeoutId);
      inactivityTimeoutId = null;
    }
  }

  function scheduleInactivityStop() {
    clearInactivityTimeout();
    inactivityTimeoutId = setTimeout(() => stopTimer(), INACTIVITY_MS);
  }

  function activityDetected(evt) {
    // evt can be undefined for programmatic calls
    if (state.gameOver) return;
    // If blockblast area isn't visible or tab hidden, don't start
    if (!document || document.visibilityState === "hidden") return;
    if (!isInViewport) return;

    // Ne pas démarrer automatiquement ; si le timer tourne, renouveler le timeout
    if (timerId) scheduleInactivityStop();
  }

  // ---------- Pseudo + meilleur score ----------
  let myName = null;
  let myBest = 0;
  let scoreAttente = null;
  let lastBestReported = 0;

  socket.on("you:name", (name) => {
    myName = name;
  });

  socket.on("blockblast:leaderboard", (arr) => {
    if (!Array.isArray(arr) || !myName) return;
    const me = arr.find((e) => e.pseudo === myName);
    const prevBest = myBest;
    myBest = me ? Number(me.score) || 0 : 0;
    if (myBest > lastBestReported) lastBestReported = myBest;
    if (scoreAttente != null && myBest >= scoreAttente && myBest > prevBest) {
      showNotif(`Nouveau record Block Blast ! Score: ${myBest}`);
      scoreAttente = null;
    }
  });

  // Chargement de la sauvegarde au connect (si présente) - permet restore au reload
  socket.on("connect", () => {
    try {
      socket.emit("blockblast:loadState");
    } catch (e) {
      console.warn("Erreur en demandant le loadState BlockBlast:", e);
    }
  });

  socket.on("blockblast:resetConfirm", ({ success }) => {
    if (success) {
      // Le reset a été confirmé côté serveur
      console.log("Reset Block Blast confirmé");
    }
  });

  socket.on("blockblast:state", (payload) => {
    try {
      if (payload && payload.found && payload.state) {
        const save = payload.state;
        // Restaurer grille
        if (Array.isArray(save.grid)) state.grid = save.grid.map((r) => [...r]);
        if (typeof save.score === "number") state.score = save.score;

        // Restaurer timer si présent côté serveur
        if (typeof save.elapsedMs === "number") {
          state.elapsedMs = save.elapsedMs;
        } else {
          // fallback : tenter de charger depuis localStorage
          const local = loadLocalState();
          if (local && typeof local.elapsedMs === "number") {
            state.elapsedMs = local.elapsedMs;
          }
        }

        // Restaurer pièces (reconstituer currentPieces)
        if (Array.isArray(save.pieces)) {
          state.currentPieces = save.pieces.map((p, i) => ({
            shape: p.shape,
            used: !!p.used,
            id: Date.now() + i,
            color: p.color || randomPieceColor(),
          }));
        }

        renderGrid();
        renderPieces();
        updateScore();
        updateTimerDisplay();
      } else {
        // Pas de sauvegarde trouvée côté serveur -> tenter restauration locale
        const local = loadLocalState();
        if (local && Array.isArray(local.grid) && Array.isArray(local.pieces)) {
          try {
            state.grid = local.grid.map((r) => [...r]);
            state.score = typeof local.score === "number" ? local.score : 0;
            state.elapsedMs =
              typeof local.elapsedMs === "number" ? local.elapsedMs : 0;
            if (Array.isArray(local.pieces)) {
              state.currentPieces = local.pieces.map((p, i) => ({
                shape: p.shape,
                used: !!p.used,
                id: Date.now() + i,
                color: p.color || randomPieceColor(),
              }));
            }
            renderGrid();
            renderPieces();
            updateScore();
            updateTimerDisplay();
          } catch (e) {
            generateNewPieces();
          }
        } else {
          // Aucune sauvegarde locale non plus -> nouvelle partie
          generateNewPieces();
        }
      }
    } catch (e) {
      console.error("Erreur lors du traitement de blockblast:state", e);
      generateNewPieces();
    }
  });

  function reportBestIfImproved() {
    const currentBest = Math.max(myBest, lastBestReported);
    if (state.score > currentBest) {
      socket.emit("blockblast:score", {
        score: state.score,
        elapsedMs: state.elapsedMs,
        final: false,
      });
      lastBestReported = state.score;
    }
  }

  // ---------- Formes de pièces (style original) ----------
  const PIECE_SHAPES = [
    // 1x1 - Très commun
    [[1]],

    // 2 blocs
    [[1, 1]], // Horizontal
    [[1], [1]], // Vertical

    // 3 blocs - Lignes
    [[1, 1, 1]], // Horizontal
    [[1], [1], [1]], // Vertical

    // 3 blocs - L shapes
    [
      [1, 0],
      [1, 1],
    ], // L petit
    [
      [0, 1],
      [1, 1],
    ], // L inversé
    [
      [1, 1],
      [1, 0],
    ], // L bas gauche
    [
      [1, 1],
      [0, 1],
    ], // L bas droit

    // 4 blocs - Lignes
    [[1, 1, 1, 1]], // Horizontal
    [[1], [1], [1], [1]], // Vertical

    // 4 blocs - Carrés
    [
      [1, 1],
      [1, 1],
    ], // 2x2

    // 4 blocs - L shapes
    [
      [1, 0],
      [1, 0],
      [1, 1],
    ], // L
    [
      [0, 1],
      [0, 1],
      [1, 1],
    ], // L inversé
    [
      [1, 1, 1],
      [1, 0, 0],
    ], // L couché
    [
      [1, 1, 1],
      [0, 0, 1],
    ], // L couché inversé

    // 4 blocs - T shapes
    [
      [1, 1, 1],
      [0, 1, 0],
    ], // T
    [
      [0, 1],
      [1, 1],
      [0, 1],
    ], // T vertical

    // 4 blocs - Z/S shapes
    [
      [1, 1, 0],
      [0, 1, 1],
    ], // Z
    [
      [0, 1, 1],
      [1, 1, 0],
    ], // S

    // 5 blocs - Lignes
    [[1, 1, 1, 1, 1]], // Horizontal
    [[1], [1], [1], [1], [1]], // Vertical

    // 5 blocs - Plus
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ], // +

    // 5 blocs - L grand
    [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 1],
    ], // L long
    [
      [0, 1],
      [0, 1],
      [0, 1],
      [1, 1],
    ], // L inversé long

    // 5 blocs - L 2x2 branche haut droit
    [
      [1, 1, 1],
      [0, 0, 1],
      [0, 0, 1],
    ],
    // 5 blocs - L 2x2 branche haut gauche
    [
      [1, 1, 1],
      [1, 0, 0],
      [1, 0, 0],
    ],
    // 5 blocs - L 2x2 branche bas droit
    [
      [0, 0, 1],
      [0, 0, 1],
      [1, 1, 1],
    ],
    // 5 blocs - L 2x2 branche bas gauche
    [
      [1, 0, 0],
      [1, 0, 0],
      [1, 1, 1],
    ],

    // 5 blocs - T grand
    [
      [1, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ], // T long

    // 5 blocs - "M"
    [
      [0, 1, 1],
      [1, 1, 0],
      [1, 0, 0],
    ],
    // 5 blocs - "W"
    [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
    ],
    // 5 blocs - pont horizontal haut
    [
      [1, 1, 1],
      [1, 0, 1],
    ],
    // 5 blocs - pont vertical droit
    [
      [1, 1],
      [0, 1],
      [1, 1],
    ],
    // 5 blocs - pont horizontal bas
    [
      [1, 0, 1],
      [1, 1, 1],
    ],
    // 5 blocs - pont vertical gauche
    [
      [1, 1],
      [1, 0],
      [1, 1],
    ],

    // 6 blocs
    [
      [1, 1, 1],
      [1, 1, 1],
    ], // Rectangle 2x3

    // 9 blocs - Carré 3x3 (rare)
    [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
  ];

  // Distribution pondérée des pièces (plus réaliste)
  const PIECE_WEIGHTS = {
    small: 0.35, // 1-2 blocs
    medium: 0.45, // 3-4 blocs
    large: 0.15, // 5-6 blocs
    huge: 0.05, // 7+ blocs
  };

  // ---------- Couleurs de pièces (palette du jeu original) ----------
  const colors = [
    "#1653e0ff",
    "#09cd5bff",
    "#ff21daff",
    "#ecf1f5ff",
    "#5a5757ff",
    "#f3fe20ff",
    "#c800ffff",
    "#ff9500ff",
  ];

  function randomPieceColor() {
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function getPieceSize(shape) {
    return shape.flat().filter((cell) => cell === 1).length;
  }

  function selectWeightedPiece() {
    const rand = Math.random();
    let category;

    if (rand < PIECE_WEIGHTS.small) category = "small";
    else if (rand < PIECE_WEIGHTS.small + PIECE_WEIGHTS.medium)
      category = "medium";
    else if (
      rand <
      PIECE_WEIGHTS.small + PIECE_WEIGHTS.medium + PIECE_WEIGHTS.large
    )
      category = "large";
    else category = "huge";

    const validShapes = PIECE_SHAPES.filter((shape) => {
      const size = getPieceSize(shape);
      switch (category) {
        case "small":
          return size <= 2;
        case "medium":
          return size >= 3 && size <= 4;
        case "large":
          return size >= 5 && size <= 6;
        case "huge":
          return size >= 7;
        default:
          return true;
      }
    });

    return validShapes[Math.floor(Math.random() * validShapes.length)];
  }

  // ---------- Système de scoring amélioré ----------
  function calculatePlacementScore(piece) {
    const blockCount = getPieceSize(piece.shape);
    // Score de base : 10 points par bloc
    return blockCount * 10;
  }

  function calculateClearScore(linesCleared) {
    // Système de score du jeu original
    const baseScore = linesCleared * 20;

    // Bonus combo (exponentiel)
    const comboBonus = state.combo > 0 ? Math.pow(2, state.combo) * 10 : 0;

    // Bonus pour clear multiple
    const multiClearBonus = linesCleared > 1 ? (linesCleared - 1) * 50 : 0;

    return baseScore + comboBonus + multiClearBonus;
  }

  function calculatePerfectClearBonus() {
    // Bonus si la grille est complètement vide après un clear
    const isEmpty = state.grid.every((row) => row.every((cell) => !cell));
    return isEmpty ? 500 : 0;
  }

  // ---------- Initialisation ----------
  function initGrid() {
    ui.grid.innerHTML = "";
    ui.grid.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    ui.grid.style.gridTemplateRows = `repeat(${GRID_SIZE}, 1fr)`;

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = document.createElement("div");
        cell.className = "blockblast-cell";
        cell.dataset.row = row;
        cell.dataset.col = col;
        ui.grid.appendChild(cell);
      }
    }
  }

  function canPlacePieceOn(grid, piece, startRow, startCol) {
    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] === 1) {
          const gr = startRow + r;
          const gc = startCol + c;
          if (
            gr < 0 ||
            gr >= GRID_SIZE ||
            gc < 0 ||
            gc >= GRID_SIZE ||
            grid[gr][gc]
          )
            return false;
        }
      }
    }
    return true;
  }

  function hasValidPlacement(piece) {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (canPlacePieceOn(state.grid, piece, row, col)) return true;
      }
    }
    return false;
  }

  function generateNewPieces() {
    // Vérifier d'abord si le jeu est vraiment terminé
    if (!PIECE_SHAPES.some((shape) => hasValidPlacement({ shape }))) {
      endGame();
      return;
    }

    const pieces = [];
    const now = Date.now();

    // Générer 3 pièces avec distribution pondérée
    for (let i = 0; i < 3; i++) {
      let shape = selectWeightedPiece();
      let attempts = 0;

      // S'assurer qu'au moins une pièce est plaçable
      while (i === 0 && attempts < 25 && !hasValidPlacement({ shape })) {
        shape = selectWeightedPiece();
        attempts++;
      }

      pieces.push({
        shape,
        used: false,
        id: now + i,
        color: randomPieceColor(),
      });
    }

    // Si aucune pièce n'est plaçable, forcer une petite pièce
    if (!pieces.some((p) => hasValidPlacement(p))) {
      pieces[0] = {
        shape: [[1]],
        used: false,
        id: now,
        color: randomPieceColor(),
      };
    }

    state.currentPieces = pieces;
    renderPieces();

    // Sauvegarder l'état incluant le timer
    socket.emit("blockblast:saveState", {
      score: state.score,
      grid: state.grid,
      pieces: state.currentPieces.map((p) => ({
        shape: p.shape,
        used: p.used,
        color: p.color,
      })),
      elapsedMs: state.elapsedMs,
      gameOver: false,
    });

    // Ne pas démarrer automatiquement le timer lors de génération de nouvelles pièces.
    // Le timer doit démarrer uniquement lorsque le joueur clique sur une pièce ou commence un drag.
  }

  function renderPieces() {
    ui.pieces.innerHTML = "";
    state.currentPieces.forEach((piece, index) => {
      if (piece.used) return;

      const pieceEl = document.createElement("div");
      pieceEl.className = "blockblast-piece";
      pieceEl.dataset.index = index;

      const rows = piece.shape.length;
      const cols = piece.shape[0].length;
      pieceEl.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
      pieceEl.style.gridTemplateRows = `repeat(${rows}, 30px)`;

      piece.shape.forEach((row) => {
        row.forEach((cell) => {
          const block = document.createElement("div");
          if (cell === 1) {
            block.className = "blockblast-piece-block";
            if (piece.color) block.style.backgroundColor = piece.color;
          }
          pieceEl.appendChild(block);
        });
      });

      pieceEl.addEventListener("click", () => selectPiece(index));
      // activité sur les pièces
      pieceEl.addEventListener("mousemove", activityDetected);
      pieceEl.addEventListener("dragstart", (e) => handleDragStart(e, index));
      pieceEl.setAttribute("draggable", "true");

      ui.pieces.appendChild(pieceEl);
    });
  }

  function selectPiece(index) {
    if (state.currentPieces[index].used) return;
    state.selectedPiece = index;

    document.querySelectorAll(".blockblast-piece").forEach((el, i) => {
      if (i === index) {
        el.style.border = "3px solid #4ECDC4";
        el.style.transform = "scale(1.05)";
      } else {
        el.style.border = "2px solid transparent";
        el.style.transform = "scale(1)";
      }
    });
  }

  // Démarrer le timer aussi quand le joueur sélectionne une pièce (click)
  const origSelectPiece = selectPiece;
  // note: we override by reassigning the function name used by event listeners above
  // but since selectPiece is used internally we keep same identifier
  selectPiece = function (index) {
    origSelectPiece(index);
    startTimer();
  };

  function handleDragStart(e, index) {
    if (state.currentPieces[index].used) {
      e.preventDefault();
      return;
    }
    state.draggedPiece = index;
    e.dataTransfer.effectAllowed = "move";

    const img = document.createElement("div");
    img.style.opacity = "0";
    document.body.appendChild(img);
    e.dataTransfer.setDragImage(img, 0, 0);
    setTimeout(() => img.remove(), 0);

    createDragPreview(state.currentPieces[index]);
    // Considérer le joueur actif
    startTimer();
  }

  function createDragPreview(piece) {
    removeDragPreview();

    const preview = document.createElement("div");
    preview.className = "blockblast-drag-preview";
    preview.style.position = "fixed";
    preview.style.pointerEvents = "none";
    preview.style.zIndex = "10000";
    preview.style.display = "grid";
    preview.style.gap = "2px";
    preview.style.transform = "translate(-50%, -50%)";

    const rows = piece.shape.length;
    const cols = piece.shape[0].length;
    preview.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
    preview.style.gridTemplateRows = `repeat(${rows}, 30px)`;

    piece.shape.forEach((row) => {
      row.forEach((cell) => {
        const block = document.createElement("div");
        if (cell === 1) {
          block.className = "blockblast-piece-block";
          if (piece.color) block.style.backgroundColor = piece.color;
        } else {
          block.style.width = "30px";
          block.style.height = "30px";
        }
        preview.appendChild(block);
      });
    });

    document.body.appendChild(preview);
    state.dragPreview = preview;
  }

  function removeDragPreview() {
    if (state.dragPreview) {
      state.dragPreview.remove();
      state.dragPreview = null;
    }
  }

  function updateDragPreviewPosition(e) {
    if (state.dragPreview) {
      state.dragPreview.style.left = e.clientX + "px";
      state.dragPreview.style.top = e.clientY + "px";
    }
  }

  function clampGridCoord(v) {
    return Math.max(0, Math.min(GRID_SIZE - 1, v));
  }

  // ---------- Preview des pièces ----------
  function cellKey(r, c) {
    return `${r}|${c}`;
  }

  function computePieceCells(piece, anchor) {
    const cells = [];
    piece.shape.forEach((shapeRow, r) => {
      shapeRow.forEach((shapeCell, c) => {
        if (shapeCell === 1) {
          cells.push({ row: anchor.row + r, col: anchor.col + c });
        }
      });
    });
    return cells;
  }

  function updatePreviewCells(cells, valid = true) {
    if (!cells || cells.length === 0) {
      if (state.previewCells.size) {
        state.previewCells.forEach((k) => {
          const [r, c] = k.split("|").map((n) => parseInt(n, 10));
          const el = ui.grid.querySelector(
            `[data-row="${r}"][data-col="${c}"]`
          );
          if (el) el.classList.remove("preview", "valid", "invalid");
        });
        state.previewCells.clear();
      }
      return;
    }

    const next = new Set(cells.map((p) => cellKey(p.row, p.col)));

    state.previewCells.forEach((k) => {
      if (!next.has(k)) {
        const [r, c] = k.split("|").map((n) => parseInt(n, 10));
        const el = ui.grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (el) el.classList.remove("preview", "valid", "invalid");
      }
    });

    next.forEach((k) => {
      if (!state.previewCells.has(k)) {
        const [r, c] = k.split("|").map((n) => parseInt(n, 10));
        const el = ui.grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (el) {
          el.classList.add("preview");
          if (valid) el.classList.add("valid");
          else el.classList.add("invalid");
        }
      }
    });

    state.previewCells = next;
  }

  function getAnchorForHover(piece, hoverRow, hoverCol) {
    const shape = piece.shape;
    const rows = shape.length;
    const cols = shape[0].length;

    for (let r0 = 0; r0 < rows; r0++) {
      for (let c0 = 0; c0 < cols; c0++) {
        if (shape[r0][c0] !== 1) continue;
        const startRow = hoverRow - r0;
        const startCol = hoverCol - c0;

        if (
          startRow < 0 ||
          startCol < 0 ||
          startRow + rows > GRID_SIZE ||
          startCol + cols > GRID_SIZE
        ) {
          continue;
        }

        if (canPlacePiece(piece, startRow, startCol)) {
          return { row: startRow, col: startCol };
        }
      }
    }
    return null;
  }

  // Variante sans vérification de collision - renvoie l'ancre logique si la
  // pièce était alignée sur la cellule hover (utile pour preview invalide)
  function getCandidateAnchor(piece, hoverRow, hoverCol) {
    const shape = piece.shape;
    const rows = shape.length;
    const cols = shape[0].length;

    for (let r0 = 0; r0 < rows; r0++) {
      for (let c0 = 0; c0 < cols; c0++) {
        if (shape[r0][c0] !== 1) continue;
        const startRow = hoverRow - r0;
        const startCol = hoverCol - c0;

        if (
          startRow < 0 ||
          startCol < 0 ||
          startRow + rows > GRID_SIZE ||
          startCol + cols > GRID_SIZE
        ) {
          continue;
        }

        return { row: startRow, col: startCol };
      }
    }
    return null;
  }

  function canPlacePiece(piece, startRow, startCol) {
    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] === 1) {
          const gridRow = startRow + r;
          const gridCol = startCol + c;
          if (
            gridRow < 0 ||
            gridRow >= GRID_SIZE ||
            gridCol < 0 ||
            gridCol >= GRID_SIZE ||
            state.grid[gridRow][gridCol]
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // ---------- Placement des pièces ----------
  function placePiece(pieceIndex, startRow, startCol) {
    const piece = state.currentPieces[pieceIndex];
    if (!canPlacePiece(piece, startRow, startCol)) return false;

    const moveData = {
      timestamp: Date.now(),
      score: state.score,
      gridBefore: state.grid.map((row) => [...row]),
      pieceUsed: {
        shape: piece.shape,
        position: { row: startRow, col: startCol },
      },
    };

    // Placer la pièce avec animation
    const shape = piece.shape;
    const placedCells = [];

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] === 1) {
          const gridRow = startRow + r;
          const gridCol = startCol + c;
          state.grid[gridRow][gridCol] = piece.color || true;
          placedCells.push({ row: gridRow, col: gridCol });
        }
      }
    }

    // Animation de placement
    placedCells.forEach(({ row, col }, i) => {
      const cell = ui.grid.querySelector(
        `[data-row="${row}"][data-col="${col}"]`
      );
      if (cell) {
        setTimeout(() => {
          cell.classList.add("block-placed");
          setTimeout(() => cell.classList.remove("block-placed"), 200);
        }, i * 20);
      }
    });

    piece.used = true;
    state.selectedPiece = null;
    state.consecutivePlacements++;

    // Score de placement
    const placementScore = calculatePlacementScore(piece);
    state.score += placementScore + 75;

    moveData.gridAfter = state.grid.map((row) => [...row]);
    moveData.scoreAfter = state.score;

    updateScore();
    renderGrid();
    reportBestIfImproved();

    // Vérifier et effacer les lignes
    setTimeout(() => {
      const clearResult = checkAndClearLines();
      moveData.linesCleared = clearResult;

      state.moveHistory.push(moveData);
      renderPieces();

      setTimeout(() => {
        if (state.currentPieces.every((p) => p.used)) {
          moveData.newPiecesGenerated = true;
          state.consecutivePlacements = 0;
          generateNewPieces();
        }

        if (checkGameOver()) {
          endGame();
          return;
        }

        if (!state.gameOver) {
          socket.emit("blockblast:saveState", {
            score: state.score,
            grid: state.grid,
            pieces: state.currentPieces.map((p) => ({
              shape: p.shape,
              used: p.used,
              color: p.color,
            })),
            elapsedMs: state.elapsedMs,
            gameOver: false,
          });
          try {
            saveLocalState();
          } catch (e) {}
        }
      }, 650);
    }, 100);

    return true;
  }

  function checkAndClearLines() {
    const rowsToClear = [];
    const colsToClear = [];

    // Vérifier les lignes
    for (let row = 0; row < GRID_SIZE; row++) {
      if (state.grid[row].every((cell) => cell)) {
        rowsToClear.push(row);
      }
    }

    // Vérifier les colonnes
    for (let col = 0; col < GRID_SIZE; col++) {
      if (state.grid.every((row) => row[col])) {
        colsToClear.push(col);
      }
    }

    if (rowsToClear.length === 0 && colsToClear.length === 0) {
      // Pas de clear = reset du combo
      state.combo = 0;
      return { rows: [], cols: [] };
    }

    // Incrémenter le combo
    state.combo++;
    const totalCleared = rowsToClear.length + colsToClear.length;
    state.totalLinesCleared += totalCleared;

    // Animation de suppression améliorée
    const cellsToAnimate = new Set();

    rowsToClear.forEach((row) => {
      for (let col = 0; col < GRID_SIZE; col++) {
        cellsToAnimate.add(`${row},${col}`);
      }
    });

    colsToClear.forEach((col) => {
      for (let row = 0; row < GRID_SIZE; row++) {
        cellsToAnimate.add(`${row},${col}`);
      }
    });

    // Animation en cascade
    const cellsArray = Array.from(cellsToAnimate);
    cellsArray.forEach((key, i) => {
      const [row, col] = key.split(",").map(Number);
      const cell = ui.grid.querySelector(
        `[data-row="${row}"][data-col="${col}"]`
      );
      if (cell) {
        setTimeout(() => {
          cell.classList.add("clearing");
        }, i * 15);
      }
    });

    setTimeout(() => {
      // Supprimer les lignes et colonnes
      rowsToClear.forEach((row) => {
        state.grid[row] = Array(GRID_SIZE).fill(false);
      });

      colsToClear.forEach((col) => {
        for (let row = 0; row < GRID_SIZE; row++) {
          state.grid[row][col] = false;
        }
      });

      const clearScore = calculateClearScore(totalCleared);
      const perfectBonus = calculatePerfectClearBonus();

      state.score +=
        clearScore + perfectBonus + state.consecutivePlacements + 35;

      updateScore();
      renderGrid();
      reportBestIfImproved();
    }, cellsArray.length * 15 + 300);

    return { rows: rowsToClear, cols: colsToClear, total: totalCleared };
  }

  function checkGameOver() {
    for (let i = 0; i < state.currentPieces.length; i++) {
      if (state.currentPieces[i].used) continue;

      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (canPlacePiece(state.currentPieces[i], row, col)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  function endGame() {
    state.gameOver = true;
    ui.gameoverScore.textContent = state.score;
    ui.gameoverEl.classList.add("active");
    if (ui.gameoverTime)
      ui.gameoverTime.textContent = ` ${formatTime(state.elapsedMs)}`;

    reportBestIfImproved();
    // Émettre le score final avec la durée de la partie pour enregistrer le temps du meilleur run
    try {
      socket.emit("blockblast:score", {
        score: state.score,
        elapsedMs: state.elapsedMs,
        final: true,
      });
    } catch (e) {}
    socket.emit("blockblast:clearState");
    try {
      localStorage.removeItem(LOCAL_SAVE_KEY);
    } catch (e) {}
    scoreAttente = state.score;
    // Stop timer on game over
    stopTimer();
  }

  function renderGrid() {
    const cells = ui.grid.querySelectorAll(".blockblast-cell");
    cells.forEach((cell) => {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);
      cell.classList.remove("clearing");

      if (state.grid[row][col]) {
        cell.classList.add("filled");
        if (typeof state.grid[row][col] === "string") {
          cell.style.backgroundColor = state.grid[row][col];
        } else {
          cell.style.backgroundColor = "";
        }
      } else {
        cell.classList.remove("filled");
        cell.style.backgroundColor = "";
      }
    });
  }

  function updateScore() {
    ui.scoreEl.textContent = `Score: ${state.score}`;
  }

  function resetGame(fromGameOver = false) {
    state.grid = Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(false));
    state.score = 0;
    state.gameOver = false;
    state.selectedPiece = null;
    state.draggedPiece = null;
    state.moveHistory = [];
    state.combo = 0;
    state.totalLinesCleared = 0;
    state.consecutivePlacements = 0;
    // Reset timer only if called from game over (rejouer)
    if (fromGameOver) {
      state.elapsedMs = 0;
      updateTimerDisplay();
    }

    ui.gameoverEl.classList.remove("active");
    updateScore();
    renderGrid();
    generateNewPieces();
    socket.emit("blockblast:clearState");
    try {
      localStorage.removeItem(LOCAL_SAVE_KEY);
    } catch (e) {}
  }

  // ---------- Événements de la grille ----------
  ui.grid.addEventListener("mousemove", (e) => {
    // activité utilisateur -> éviter arrêt pour inactivité
    try {
      activityDetected(e);
    } catch (err) {}
    updateDragPreviewPosition(e);

    const cell = e.target.closest(".blockblast-cell");
    if (!cell) {
      updatePreviewCells([]);
      return;
    }

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    // Priorité au drag (draggedPiece non null)
    if (state.draggedPiece != null) {
      const piece = state.currentPieces[state.draggedPiece];
      if (!piece) return;
      const anchor = getAnchorForHover(piece, row, col);
      if (anchor) {
        updatePreviewCells(computePieceCells(piece, anchor), true);
        if (state.dragPreview) {
          state.dragPreview.classList.remove("invalid");
          state.dragPreview.classList.add("valid");
        }
      } else {
        const candidate = getCandidateAnchor(piece, row, col);
        if (candidate) {
          updatePreviewCells(computePieceCells(piece, candidate), false);
          if (state.dragPreview) {
            state.dragPreview.classList.remove("valid");
            state.dragPreview.classList.add("invalid");
          }
        } else {
          updatePreviewCells([]);
          if (state.dragPreview) {
            state.dragPreview.classList.remove("valid", "invalid");
          }
        }
      }
      return;
    }

    // Si on a sélection via click (selectedPiece), afficher preview aussi
    if (state.selectedPiece != null) {
      const piece = state.currentPieces[state.selectedPiece];
      if (!piece) return;
      const anchor = getAnchorForHover(piece, row, col);
      if (anchor) updatePreviewCells(computePieceCells(piece, anchor), true);
      else {
        const candidate = getCandidateAnchor(piece, row, col);
        if (candidate)
          updatePreviewCells(computePieceCells(piece, candidate), false);
        else updatePreviewCells([]);
      }
      return;
    }

    updatePreviewCells([]);
  });

  // Click-to-place : si une pièce est sélectionnée (par clic), un click sur la grille place la pièce
  ui.grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".blockblast-cell");
    if (!cell) return;
    if (state.selectedPiece == null) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const piece = state.currentPieces[state.selectedPiece];
    if (!piece) return;

    const anchor = getAnchorForHover(piece, row, col);
    if (anchor && placePiece(state.selectedPiece, anchor.row, anchor.col)) {
      updatePreviewCells([]);
    }
  });

  ui.grid.addEventListener("dragleave", () => {
    updatePreviewCells([]);
  });

  ui.grid.addEventListener("drop", (e) => {
    e.preventDefault();
    if (state.draggedPiece == null) return;

    const cell = e.target.closest(".blockblast-cell");
    if (!cell) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const piece = state.currentPieces[state.draggedPiece];
    if (!piece) return;

    const anchor = getAnchorForHover(piece, row, col);
    if (anchor && placePiece(state.draggedPiece, anchor.row, anchor.col)) {
      updatePreviewCells([]);
    }

    state.draggedPiece = null;
    removeDragPreview();
  });

  ui.grid.addEventListener("dragover", (e) => {
    // Empêcher le comportement par défaut pour autoriser le drop
    e.preventDefault();

    // Démarrer le timer si pas déjà lancé (pour les cas où dragstart ne l'a pas fait)
    if (!timerId && !state.gameOver) {
      startTimer();
    }

    // Mettre à jour la position de la preview flottante
    updateDragPreviewPosition(e);

    // Déterminer la cellule sous la souris (elementFromPoint est plus fiable
    // pendant drag que e.target)
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(".blockblast-cell");
    if (!el) {
      updatePreviewCells([]);
      return;
    }

    const row = parseInt(el.dataset.row);
    const col = parseInt(el.dataset.col);

    if (state.draggedPiece != null) {
      const piece = state.currentPieces[state.draggedPiece];
      if (!piece) return;
      const anchor = getAnchorForHover(piece, row, col);
      if (anchor) {
        updatePreviewCells(computePieceCells(piece, anchor), true);
        if (state.dragPreview) {
          state.dragPreview.classList.remove("invalid");
          state.dragPreview.classList.add("valid");
        }
      } else {
        const candidate = getCandidateAnchor(piece, row, col);
        if (candidate) {
          updatePreviewCells(computePieceCells(piece, candidate), false);
          if (state.dragPreview) {
            state.dragPreview.classList.remove("valid");
            state.dragPreview.classList.add("invalid");
          }
        } else {
          updatePreviewCells([]);
          if (state.dragPreview) {
            state.dragPreview.classList.remove("valid", "invalid");
          }
        }
      }
    } else {
      updatePreviewCells([]);
    }
  });

  // Si le drag est annulé (touche echap ou sortie de la fenêtre), nettoyer
  // l'état et enlever la preview flottante.
  document.addEventListener("dragend", (e) => {
    state.draggedPiece = null;
    removeDragPreview();
    updatePreviewCells([]);
  });

  // ---------- Boutons ----------
  // Reset button: réinitialise la partie actuelle + le meilleur score (avec mot de passe)
  ui.resetBtn?.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir réinitialiser ton score Block Blast ?\nTon meilleur score et ton temps seront définitivement perdus !"
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
      socket.emit("blockblast:reset");
      showNotif("🔄 Score Block Blast réinitialisé avec succès !");
      myBest = 0;
      scoreAttente = null;
      lastBestReported = 0;
      // Réinitialiser aussi la partie actuelle
      resetGame(false);
    } catch (err) {
      showNotif("⚠️ Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  });

  // Nouveau bouton : reset de la grille / nouvelle partie sans toucher au meilleur score
  ui.resetGridBtn?.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Réinitialiser la grille actuelle pour commencer une nouvelle partie ?\nLe meilleur score ne sera PAS supprimé."
    );
    if (!confirmReset) return;

    try {
      // Générer une nouvelle partie localement sans toucher à myBest
      resetGame(false);
      showNotif("🔄 Grille réinitialisée — meilleur score conservé.");
    } catch (e) {
      console.error("Erreur lors du reset grille:", e);
      showNotif("⚠️ Impossible de réinitialiser la grille");
    }
  });

  ui.restartBtn?.addEventListener("click", () => resetGame(true));

  // ---------- Initialisation ----------
  initGrid();

  // Demander au serveur la sauvegarde existante (le serveur répondra par 'blockblast:state')
  try {
    socket.emit("blockblast:loadState");
  } catch (e) {
    // Si pas de socket disponible (au cas où), on démarre une nouvelle partie
    console.warn(
      "Pas de socket disponible pour charger l'état BlockBlast, génération locale de pièces.",
      e
    );
    generateNewPieces();
  }
  updateScore();

  // Gestion focus/visibilité pour mettre en pause le timer lorsque l'utilisateur ne joue pas
  function onVisibilityChange() {
    if (document.visibilityState === "hidden") {
      stopTimer();
      // sauvegarder l'état courant
      try {
        socket.emit("blockblast:saveState", {
          score: state.score,
          grid: state.grid,
          pieces: state.currentPieces.map((p) => ({
            shape: p.shape,
            used: p.used,
            color: p.color,
          })),
          elapsedMs: state.elapsedMs,
          gameOver: false,
        });
        try {
          saveLocalState();
        } catch (e) {}
      } catch (e) {}
    } else if (document.visibilityState === "visible") {
      // ne pas démarrer automatiquement si gameOver
      if (!state.gameOver) {
        // On démarre seulement si l'utilisateur interagit; garder startTimer ici
        // si vous préférez auto-start, décommentez la ligne suivante:
        // startTimer();
      }
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", () => stopTimer());
  window.addEventListener("focus", () => {
    // Ne pas démarrer automatiquement à la focus, attendre interaction
  });

  // IntersectionObserver pour détecter si la zone BlockBlast est visible dans le viewport
  try {
    const wrap = document.querySelector(".blockblast-wrap") || ui.grid;
    if (wrap && "IntersectionObserver" in window) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio > 0) {
              isInViewport = true;
              clearInactivityTimeout();
            } else {
              isInViewport = false;
              stopTimer();
            }
          });
        },
        { threshold: [0, 0.1, 0.5] }
      );
      obs.observe(wrap);
    }
  } catch (e) {}

  // Avant déchargement, sauvegarder l'état courant
  window.addEventListener("beforeunload", () => {
    try {
      socket.emit("blockblast:saveState", {
        score: state.score,
        grid: state.grid,
        pieces: state.currentPieces.map((p) => ({
          shape: p.shape,
          used: p.used,
          color: p.color,
        })),
        elapsedMs: state.elapsedMs,
        gameOver: !!state.gameOver,
      });
      try {
        saveLocalState();
      } catch (e) {}
    } catch (e) {}
  });
}
