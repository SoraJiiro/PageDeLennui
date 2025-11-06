import { showNotif } from "./util.js";

export function initBlockBlast(socket) {
  const GRID_SIZE = 9;
  // ---------- Cache UI ----------
  const ui = {
    grid: document.querySelector(".blockblast-grid"),
    pieces: document.querySelector(".blockblast-pieces"),
    scoreEl: document.querySelector(".blockblast-score"),
    resetBtn: document.querySelector(".blockblast-reset"),
    gameoverEl: document.querySelector(".blockblast-gameover"),
    gameoverScore: document.querySelector(".blockblast-gameover-score"),
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
  };

  // ---------- Pseudo + meilleur score ----------
  let myName = null;
  let myBest = 0;
  let scoreAttente = null;
  // Pour éviter d'envoyer des scores non-best à répétition
  let lastBestReported = 0;

  socket.on("you:name", (name) => {
    myName = name;
  });

  socket.on("blockblast:leaderboard", (arr) => {
    if (!Array.isArray(arr) || !myName) return;
    const me = arr.find((e) => e.pseudo === myName);
    const prevBest = myBest;
    myBest = me ? Number(me.score) || 0 : 0;
    // Synchroniser le marqueur local avec le leaderboard reçu
    if (myBest > lastBestReported) lastBestReported = myBest;
    if (scoreAttente != null && myBest >= scoreAttente && myBest > prevBest) {
      showNotif(`🧱 Nouveau record Block Blast ! Score: ${myBest}`);
      scoreAttente = null;
    }
  });

  // N'émettre le score que s'il dépasse le best of all time
  function reportBestIfImproved() {
    const currentBest = Math.max(myBest, lastBestReported);
    if (state.score > currentBest) {
      socket.emit("blockblast:score", { score: state.score });
      lastBestReported = state.score;
    }
  }

  // ---------- Formes de pièces ----------
  const PIECE_SHAPES = [
    // Ligne horizontale 3
    [[1, 1, 1]],
    // Ligne verticale 3
    [[1], [1], [1]],
    // Ligne horizontale 4
    [[1, 1, 1, 1]],
    // Ligne verticale 4
    [[1], [1], [1], [1]],
    // Ligne horizontale 5
    [[1, 1, 1, 1, 1]],
    // Ligne verticale 5
    [[1], [1], [1], [1], [1]],
    // Carré 2x2
    [
      [1, 1],
      [1, 1],
    ],
    // Carré 3x3
    [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    // L shape
    [
      [1, 0],
      [1, 0],
      [1, 1],
    ],
    // L inversé
    [
      [0, 1],
      [0, 1],
      [1, 1],
    ],
    // T shape
    [
      [1, 1, 1],
      [0, 1, 0],
    ],
    // T shape (bas)
    [
      [0, 1, 0],
      [1, 1, 1],
    ],
    // T shape (gauche)
    [
      [0, 1],
      [1, 1],
      [0, 1],
    ],
    // T shape (droite)
    [
      [1, 0],
      [1, 1],
      [1, 0],
    ],
    // Z shape
    [
      [1, 1, 0],
      [0, 1, 1],
    ],
    // Z shape (rotation)
    [
      [0, 1],
      [1, 1],
      [1, 0],
    ],
    // S shape
    [
      [0, 1, 1],
      [1, 1, 0],
    ],
    // S shape (rotation)
    [
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    // Rectangle 2x3
    [
      [1, 1, 1],
      [1, 1, 1],
    ],
    // Plus 3x3
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    // Angle haut droit
    [
      [1, 1, 1],
      [0, 0, 1],
      [0, 0, 1],
    ],
    // Angle haut gauche
    [
      [1, 1, 1],
      [1, 0, 0],
      [1, 0, 0],
    ],
    // Angle bas droit
    [
      [0, 0, 1],
      [0, 0, 1],
      [1, 1, 1],
    ],
    // Angle bas gauche
    [
      [1, 0, 0],
      [1, 0, 0],
      [1, 1, 1],
    ],
    // Ligne horizontale 6
    [[1, 1, 1, 1, 1, 1]],
    // Ligne verticale 6
    [[1], [1], [1], [1], [1], [1]],
    // Bloc seul
    [[1]],
    // Ligne horizontale 2
    [[1, 1]],
    // 2 blocks diag
    [
      [0, 1],
      [1, 0],
    ],
    // 2 blocks diag gauche
    [
      [1, 0],
      [0, 1],
    ],
    // triple diag
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    // triple diag gauche
    [
      [0, 0, 1],
      [0, 1, 0],
      [1, 0, 0],
    ],
    // U
    [
      [1, 0, 1],
      [1, 1, 1],
    ],
    // U inversé
    [
      [1, 1, 1],
      [1, 0, 1],
    ],
    // U gauche
    [
      [1, 1],
      [0, 1],
      [1, 1],
    ],
    // U droit
    [
      [1, 1],
      [1, 0],
      [1, 1],
    ],
    // Gros T
    [
      [1, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    // Gros T inversé
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 1],
    ],
    // Gros T gauche
    [
      [1, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    // Gros T droit
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 1],
    ],
    // 2 petit vertical
    [[1], [1]],
    // mini L
    [
      [1, 1],
      [1, 0],
    ],
    // mini L inversé
    [
      [0, 1],
      [1, 1],
    ],
    // mini L gauche
    [
      [1, 0],
      [1, 1],
    ],
    // mini L droit
    [
      [1, 1],
      [0, 1],
    ],
    // v
    [
      [1, 0, 1],
      [0, 1, 0],
    ],
    // v inversé
    [
      [0, 1, 0],
      [1, 0, 1],
    ],
    // rectangle vertical
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  ];
  // ---------- Couleurs de pièces ----------
  const colors = [
    "#e33724ff",
    "#1653e0ff",
    "#09cd5bff",
    "#ff21daff",
    "#d4dde3ff",
    "#5a5757ff",
    "#f3fe20ff",
  ];
  function randomPieceColor() {
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // ---------- Initialisation ----------
  function initGrid() {
    ui.grid.innerHTML = "";
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

  // Vérifie si la grille actuelle accepte au moins une forme de la liste PIECE_SHAPES
  function gridHasAnyPlacementForAnyShape() {
    for (const shape of PIECE_SHAPES) {
      const piece = { shape };
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (canPlacePiece(piece, row, col)) return true;
        }
      }
    }
    return false;
  }

  function setHasPlacablePiece(pieces) {
    for (const piece of pieces) {
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (canPlacePiece(piece, row, col)) return true;
        }
      }
    }
    return false;
  }

  // Helpers de simulation pour la génération "chaînable"
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

  function listPlacementsOnGrid(grid, piece) {
    const placements = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (canPlacePieceOn(grid, piece, row, col))
          placements.push({ row, col });
      }
    }
    return placements;
  }

  function deepCloneGrid(grid) {
    return grid.map((r) => r.slice());
  }

  function applyPlacement(grid, piece, startRow, startCol) {
    const next = deepCloneGrid(grid);
    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] === 1) {
          next[startRow + r][startCol + c] = true;
        }
      }
    }
    return next;
  }

  function clearLinesOnGrid(grid) {
    const next = deepCloneGrid(grid);
    const rowsToClear = [];
    const colsToClear = [];

    for (let row = 0; row < GRID_SIZE; row++) {
      if (next[row].every((cell) => cell)) rowsToClear.push(row);
    }
    for (let col = 0; col < GRID_SIZE; col++) {
      let full = true;
      for (let row = 0; row < GRID_SIZE; row++) {
        if (!next[row][col]) {
          full = false;
          break;
        }
      }
      if (full) colsToClear.push(col);
    }

    if (rowsToClear.length === 0 && colsToClear.length === 0) {
      return { grid: next, rowsCleared: 0, colsCleared: 0 };
    }

    rowsToClear.forEach((row) => {
      next[row] = Array(GRID_SIZE).fill(false);
    });
    colsToClear.forEach((col) => {
      for (let row = 0; row < GRID_SIZE; row++) next[row][col] = false;
    });

    return {
      grid: next,
      rowsCleared: rowsToClear.length,
      colsCleared: colsToClear.length,
    };
  }

  function generateNewPieces() {
    // Si aucune forme ne peut s'insérer dans la grille, c'est un vrai game over
    if (!gridHasAnyPlacementForAnyShape()) {
      endGame();
      return;
    }

    // 1) Essayer de générer un set chaînable (longueur 3):
    //    - une pièce avec un placement unique
    //    - ce placement déclenche un clear (ligne/col)
    //    - après ce clear, une deuxième pièce est plaçable
    //    - après pose + clear de la deuxième, la troisième est aussi plaçable
    const CHAIN_TRIES = 30;
    for (let t = 0; t < CHAIN_TRIES; t++) {
      const now = Date.now();
      const candidate = [];
      for (let i = 0; i < 3; i++) {
        const shape =
          PIECE_SHAPES[Math.floor(Math.random() * PIECE_SHAPES.length)];
        candidate.push({
          shape,
          used: false,
          id: now + i,
          color: randomPieceColor(),
        });
      }
      // D'abord s'assurer qu'au moins une pièce est jouable
      if (!setHasPlacablePiece(candidate)) continue;

      // Rechercher une pièce "starter" (placement unique + clear)
      let ok = false;
      for (let s = 0; s < 3 && !ok; s++) {
        const placements = listPlacementsOnGrid(state.grid, candidate[s]);
        if (placements.length !== 1) continue; // on veut un placement unique
        const { row, col } = placements[0];
        // Simuler placement puis clear
        const g1 = applyPlacement(state.grid, candidate[s], row, col);
        const cleared = clearLinesOnGrid(g1);
        const clearedCount = cleared.rowsCleared + cleared.colsCleared;
        if (clearedCount === 0) continue; // on veut un clear pour "débloquer"

        // On veut une chaîne complète: deuxième puis troisième pièce
        const others = [0, 1, 2].filter((i) => i !== s);
        const orders = [others, [others[1], others[0]]];
        for (const order of orders) {
          const firstIdx = order[0];
          const secondIdx = order[1];
          const pFirstPlacements = listPlacementsOnGrid(
            cleared.grid,
            candidate[firstIdx]
          );
          // Limiter le nombre de placements testés pour éviter un coût trop élevé
          const MAX_P_FIRST = 20;
          for (
            let i1 = 0;
            i1 < Math.min(MAX_P_FIRST, pFirstPlacements.length);
            i1++
          ) {
            const { row: r1, col: c1 } = pFirstPlacements[i1];
            const g2 = applyPlacement(
              cleared.grid,
              candidate[firstIdx],
              r1,
              c1
            );
            const cleared2 = clearLinesOnGrid(g2);
            const pSecondPlacements = listPlacementsOnGrid(
              cleared2.grid,
              candidate[secondIdx]
            );
            if (pSecondPlacements.length > 0) {
              ok = true;
              break;
            }
          }
          if (ok) break;
        }
        if (ok) {
          state.currentPieces = candidate;
          renderPieces();
          // Sauvegarder immédiatement le nouveau set pour résilience au reload
          socket.emit("blockblast:saveState", {
            score: state.score,
            grid: state.grid,
            pieces: state.currentPieces.map((p) => ({
              shape: p.shape,
              used: p.used,
              color: p.color,
            })),
            gameOver: false,
          });
          return;
        }
      }
    }

    // 2) Sinon, fallback: générer un set avec au moins une pièce jouable
    const MAX_TRIES = 25;
    let tries = 0;
    let pieces = [];
    while (tries < MAX_TRIES) {
      pieces = [];
      const base = Date.now();
      for (let i = 0; i < 3; i++) {
        const shape =
          PIECE_SHAPES[Math.floor(Math.random() * PIECE_SHAPES.length)];
        pieces.push({
          shape,
          used: false,
          id: base + i,
          color: randomPieceColor(),
        });
      }
      if (setHasPlacablePiece(pieces)) break;
      tries++;
    }

    // 3) Ultime secours: forcer une pièce jouable
    if (!setHasPlacablePiece(pieces)) {
      let forced = null;
      outer: for (const shape of PIECE_SHAPES) {
        const piece = { shape };
        for (let row = 0; row < GRID_SIZE; row++) {
          for (let col = 0; col < GRID_SIZE; col++) {
            if (canPlacePiece(piece, row, col)) {
              forced = shape;
              break outer;
            }
          }
        }
      }
      if (forced)
        pieces[0] = {
          shape: forced,
          used: false,
          id: Date.now(),
          color: randomPieceColor(),
        };
    }

    state.currentPieces = pieces;
    renderPieces();
    // Sauvegarder immédiatement le nouveau set pour résilience au reload
    socket.emit("blockblast:saveState", {
      score: state.score,
      grid: state.grid,
      pieces: state.currentPieces.map((p) => ({
        shape: p.shape,
        used: p.used,
        color: p.color,
      })),
      gameOver: false,
    });
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
      pieceEl.style.gridTemplateColumns = `repeat(${cols}, 25px)`;
      pieceEl.style.gridTemplateRows = `repeat(${rows}, 25px)`;

      piece.shape.forEach((row) => {
        row.forEach((cell) => {
          const block = document.createElement("div");
          if (cell === 1) {
            block.className = "blockblast-piece-block";
            if (piece.color) block.style.backgroundColor = piece.color;
          } else {
            block.style.width = "25px";
            block.style.height = "25px";
          }
          pieceEl.appendChild(block);
        });
      });

      pieceEl.addEventListener("click", () => selectPiece(index));
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
        el.style.border = "2px solid var(--primary-color)";
      } else {
        el.style.border = "2px solid transparent";
      }
    });
  }

  function handleDragStart(e, index) {
    if (state.currentPieces[index].used) {
      e.preventDefault();
      return;
    }
    state.draggedPiece = index;
    e.dataTransfer.effectAllowed = "move";

    // Créer un élément transparent pour le drag
    const img = document.createElement("div");
    img.style.opacity = "0";
    document.body.appendChild(img);
    e.dataTransfer.setDragImage(img, 0, 0);
    setTimeout(() => img.remove(), 0);

    // Créer la preview de la pièce qui suit la souris
    createDragPreview(state.currentPieces[index]);
  }

  function createDragPreview(piece) {
    removeDragPreview();

    const preview = document.createElement("div");
    preview.className = "blockblast-drag-preview";
    preview.style.position = "fixed";
    preview.style.pointerEvents = "none";
    preview.style.zIndex = "10000";
    preview.style.display = "grid";
    preview.style.gap = "3px";
    // Centrer la preview sous le curseur pour éviter tout décalage
    preview.style.transform = "translate(-50%, -50%)";

    const rows = piece.shape.length;
    const cols = piece.shape[0].length;
    preview.style.gridTemplateColumns = `repeat(${cols}, 25px)`;
    preview.style.gridTemplateRows = `repeat(${rows}, 25px)`;

    piece.shape.forEach((row) => {
      row.forEach((cell) => {
        const block = document.createElement("div");
        if (cell === 1) {
          block.className = "blockblast-piece-block";
          // Prévisualisation plus discrète
          block.style.opacity = "0.25";
          if (piece.color) block.style.backgroundColor = piece.color;
        } else {
          block.style.width = "25px";
          block.style.height = "25px";
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

  // Utilitaire pour éviter les débordements dûs aux gaps/borders CSS
  function clampGridCoord(v) {
    return Math.max(0, Math.min(GRID_SIZE - 1, v));
  }

  // ---------- Placement des pièces ----------
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

  function updatePreviewCells(cells) {
    if (!cells || cells.length === 0) {
      // Clear all
      if (state.previewCells.size) {
        state.previewCells.forEach((k) => {
          const [r, c] = k.split("|").map((n) => parseInt(n, 10));
          const el = ui.grid.querySelector(
            `[data-row="${r}"][data-col="${c}"]`
          );
          if (el) el.classList.remove("preview");
        });
        state.previewCells.clear();
      }
      return;
    }

    const next = new Set(cells.map((p) => cellKey(p.row, p.col)));
    // Remove those not in next
    state.previewCells.forEach((k) => {
      if (!next.has(k)) {
        const [r, c] = k.split("|").map((n) => parseInt(n, 10));
        const el = ui.grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (el) el.classList.remove("preview");
      }
    });
    // Add new ones
    next.forEach((k) => {
      if (!state.previewCells.has(k)) {
        const [r, c] = k.split("|").map((n) => parseInt(n, 10));
        const el = ui.grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
        if (el) el.classList.add("preview");
      }
    });
    state.previewCells = next;
  }
  // Calcule le point d'ancrage (top-left) pour placer une pièce en visant la cellule survolée
  function getAnchorForHover(piece, hoverRow, hoverCol) {
    const shape = piece.shape;
    const rows = shape.length;
    const cols = shape[0].length;
    // Essayer d'aligner chaque bloc '1' de la pièce sur la cellule visée
    for (let r0 = 0; r0 < rows; r0++) {
      for (let c0 = 0; c0 < cols; c0++) {
        if (shape[r0][c0] !== 1) continue;
        const startRow = hoverRow - r0;
        const startCol = hoverCol - c0;
        // Filtrer rapidement les placements hors grille
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

  function placePiece(pieceIndex, startRow, startCol) {
    const piece = state.currentPieces[pieceIndex];
    if (!canPlacePiece(piece, startRow, startCol)) return false;

    // Sauvegarder l'état avant le placement
    const moveData = {
      timestamp: Date.now(),
      score: state.score,
      gridBefore: state.grid.map((row) => [...row]),
      pieceUsed: {
        shape: piece.shape,
        position: { row: startRow, col: startCol },
      },
      piecesAvailable: state.currentPieces.map((p) => ({
        shape: p.shape,
        used: p.used,
      })),
    };

    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] === 1) {
          state.grid[startRow + r][startCol + c] = piece.color || true;
        }
      }
    }

    piece.used = true;
    state.selectedPiece = null;
    // Score = nombre de blocs posés (bonus des clears ajouté plus tard)
    state.score += countBlocks(shape) + 65;

    // Sauvegarder l'état après le placement
    moveData.gridAfter = state.grid.map((row) => [...row]);
    moveData.scoreAfter = state.score;

    updateScore();
    renderGrid();
    // Reporter le best si on vient de le dépasser
    reportBestIfImproved();

    const linesCleared = checkAndClearLines();
    moveData.linesCleared = linesCleared;

    // Ajouter à l'historique local
    state.moveHistory.push(moveData);

    // Mise à jour de l'UI immédiate
    renderPieces();

    // Reporter les actions dépendantes du clear après l'animation (550ms)
    setTimeout(() => {
      // Après le clear, si toutes les pièces sont utilisées, on génère le nouveau set maintenant
      if (state.currentPieces.every((p) => p.used)) {
        moveData.newPiecesGenerated = true;
        generateNewPieces();
      }

      // Vérifier game over APRÈS l'application effective des clears et éventuelle gen de pièces
      if (checkGameOver()) {
        endGame();
        return; // ne pas sauvegarder un état terminal
      }

      // Sauvegarder l'état courant (après clears et éventuelle génération)
      if (!state.gameOver) {
        socket.emit("blockblast:saveState", {
          score: state.score,
          grid: state.grid,
          pieces: state.currentPieces.map((p) => ({
            shape: p.shape,
            used: p.used,
            color: p.color,
          })),
          gameOver: false,
        });
      }
    }, 600);

    return true;
  }

  function countBlocks(shape) {
    let count = 0;
    shape.forEach((row) => {
      row.forEach((cell) => {
        if (cell === 1) count++;
      });
    });
    return count;
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

    if (rowsToClear.length === 0 && colsToClear.length === 0)
      return { rows: [], cols: [] };

    // Animation de suppression
    const cellsToAnimate = [];
    rowsToClear.forEach((row) => {
      for (let col = 0; col < GRID_SIZE; col++) {
        cellsToAnimate.push({ row, col });
      }
    });
    colsToClear.forEach((col) => {
      for (let row = 0; row < GRID_SIZE; row++) {
        if (!cellsToAnimate.some((c) => c.row === row && c.col === col)) {
          cellsToAnimate.push({ row, col });
        }
      }
    });

    cellsToAnimate.forEach(({ row, col }) => {
      const cell = ui.grid.querySelector(
        `[data-row="${row}"][data-col="${col}"]`
      );
      if (cell) {
        // Reset éventuel, puis forcer un reflow pour relancer l'animation
        cell.classList.remove("clearing");
        // eslint-disable-next-line no-unused-expressions
        void cell.offsetWidth;
        cell.classList.add("clearing");
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

      // Calculer le score bonus
      const totalCleared = rowsToClear.length + colsToClear.length;
      const bonus = totalCleared * 15;
      state.score += bonus + 50;
      updateScore();
      renderGrid();
      // Reporter le best si on vient de le dépasser avec le bonus
      reportBestIfImproved();

      if (totalCleared > 1) {
        showNotif(`🎉 Combo x${totalCleared} !`);
      }
    }, 550);

    return { rows: rowsToClear, cols: colsToClear };
  }

  function checkGameOver() {
    // Vérifier si au moins une pièce peut être placée
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
    reportBestIfImproved();
    // Effacer l'état sauvegardé côté serveur (partie terminée)
    socket.emit("blockblast:clearState");
    scoreAttente = state.score;
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

  function resetGame() {
    state.grid = Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(false));
    state.score = 0;
    state.gameOver = false;
    state.selectedPiece = null;
    state.draggedPiece = null;
    state.moveHistory = [];
    ui.gameoverEl.classList.remove("active");
    updateScore();
    renderGrid();
    generateNewPieces();
    // Clear côté serveur pour repartir proprement
    socket.emit("blockblast:clearState");
  }

  // ---------- Événements de la grille ----------
  ui.grid.addEventListener("click", (e) => {
    if (state.gameOver) return;
    const cell = e.target.closest(".blockblast-cell");
    if (!cell || state.selectedPiece === null) return;

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const piece = state.currentPieces[state.selectedPiece];
    if (!piece) return;
    const anchor = getAnchorForHover(piece, row, col);
    if (anchor) {
      placePiece(state.selectedPiece, anchor.row, anchor.col);
    }
  });

  ui.grid.addEventListener("dragover", (e) => {
    e.preventDefault();

    if (state.draggedPiece === null || state.gameOver) return;

    const rect = ui.grid.getBoundingClientRect();
    const cellSize = rect.width / GRID_SIZE;

    let col = Math.floor((e.clientX - rect.left) / cellSize);
    let row = Math.floor((e.clientY - rect.top) / cellSize);
    col = clampGridCoord(col);
    row = clampGridCoord(row);

    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
      const piece = state.currentPieces[state.draggedPiece];
      const anchor = getAnchorForHover(piece, row, col);
      if (anchor) updatePreviewCells(computePieceCells(piece, anchor));
      else updatePreviewCells(null);
    }
  });

  ui.grid.addEventListener("drop", (e) => {
    e.preventDefault();
    if (state.gameOver || state.draggedPiece === null) return;

    removeDragPreview();

    // Effacer les previews
    updatePreviewCells(null);

    const rect = ui.grid.getBoundingClientRect();
    const cellSize = rect.width / GRID_SIZE;

    let col = Math.floor((e.clientX - rect.left) / cellSize);
    let row = Math.floor((e.clientY - rect.top) / cellSize);
    col = clampGridCoord(col);
    row = clampGridCoord(row);

    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE) {
      const piece = state.currentPieces[state.draggedPiece];
      const anchor = getAnchorForHover(piece, row, col);
      if (anchor) {
        placePiece(state.draggedPiece, anchor.row, anchor.col);
      }
    }

    state.draggedPiece = null;
  });

  // ---------- Preview au survol (sans drag) ----------
  ui.grid.addEventListener("mousemove", (e) => {
    if (state.gameOver || state.selectedPiece === null) return;
    const rect = ui.grid.getBoundingClientRect();
    const cellSize = rect.width / GRID_SIZE;
    let col = Math.floor((e.clientX - rect.left) / cellSize);
    let row = Math.floor((e.clientY - rect.top) / cellSize);
    col = clampGridCoord(col);
    row = clampGridCoord(row);
    if (!(row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE)) return;
    const piece = state.currentPieces[state.selectedPiece];
    const anchor = piece ? getAnchorForHover(piece, row, col) : null;
    if (anchor && piece) updatePreviewCells(computePieceCells(piece, anchor));
    else updatePreviewCells(null);
  });
  ui.grid.addEventListener("mouseleave", () => {
    updatePreviewCells(null);
  });

  // ---------- Gestion du drag avec la souris ----------
  document.addEventListener("dragover", updateDragPreviewPosition);

  document.addEventListener("dragend", () => {
    removeDragPreview();
    state.draggedPiece = null;

    // Effacer les previews
    document
      .querySelectorAll(".blockblast-cell.preview")
      .forEach((c) => c.classList.remove("preview"));
  });

  // ---------- Boutons ----------
  ui.resetBtn?.addEventListener("click", async () => {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir réinitialiser la partie en cours Block Blast ?\nTa partie actuelle sera perdue (meilleur score conservé)."
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
      socket.once("blockblast:resetConfirm", () => {
        // Remise à zéro locale du jeu (grille, score, pièces)
        resetGame();
        socket.emit("blockblast:clearState");
        // Le meilleur score est conservé (ne pas l'écraser côté client)
        scoreAttente = null;
        showNotif("🔄 Score Block Blast réinitialisé avec succès !");
      });
      socket.emit("blockblast:reset");
    } catch (err) {
      showNotif("⚠️ Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  });

  ui.restartBtn?.addEventListener("click", resetGame);

  // ---------- Initialisation ----------
  initGrid();
  updateScore();

  let restoredOnce = false;
  let unloadHooked = false;
  socket.on("blockblast:state", (payload) => {
    restoredOnce = true;
    if (!payload || !payload.found || !payload.state) {
      generateNewPieces();
      return;
    }
    const s = payload.state;
    // Si l'état indique un game over, on n'utilise pas cette sauvegarde
    if (s.gameOver === true) {
      socket.emit("blockblast:clearState");
      generateNewPieces();
      return;
    }
    if (Array.isArray(s.grid)) {
      state.grid = s.grid.map((row) => row.slice());
    }
    state.score = Number(s.score) || 0;
    if (Array.isArray(s.pieces) && s.pieces.length) {
      state.currentPieces = s.pieces.map((p, i) => ({
        shape: p.shape,
        used: !!p.used,
        color: p.color || randomPieceColor(),
        id: Date.now() + i,
      }));
    } else {
      generateNewPieces();
    }
    renderGrid();
    updateScore();
    renderPieces();
    // Si toutes les pièces sont utilisées ou aucune pose possible, générer un nouveau set
    if (
      state.currentPieces.length === 0 ||
      state.currentPieces.every((p) => p.used) ||
      checkGameOver()
    ) {
      generateNewPieces();
    }

    if (!unloadHooked) {
      window.addEventListener("beforeunload", () => {
        if (!state.gameOver) {
          // Sauvegarde de l'état courant pour restauration post-reload
          socket.emit("blockblast:saveState", {
            score: state.score,
            grid: state.grid,
            pieces: state.currentPieces.map((p) => ({
              shape: p.shape,
              used: p.used,
              color: p.color,
            })),
            gameOver: false,
          });
        }
        // N'envoyer le score que si c'est un nouveau best
        reportBestIfImproved();
      });
      unloadHooked = true;
    }
  });
  socket.emit("blockblast:loadState");
  // Fallback si le serveur ne répond pas
  setTimeout(() => {
    if (!restoredOnce && state.currentPieces.length === 0) {
      generateNewPieces();
    }
  }, 1200);
}
