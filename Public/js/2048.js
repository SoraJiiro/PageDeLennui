import { showNotif, toggleScrollLock } from "./util.js";

export function init2048(socket) {
  const board = document.querySelector(".game-2048-board");
  const scoreDisplay = document.getElementById("score-2048");
  const bestDisplay = document.getElementById("best-2048");
  const restartBtn = document.getElementById("restart-2048");
  const overlay = document.querySelector(".game-over-overlay");
  const tryAgainBtn = document.getElementById("try-again-2048");
  const container = document.querySelector(".game-2048-container");

  if (!board) return;

  let grid = [];
  let score = 0;
  let bestScore = 0;
  let gameOver = false;
  const size = 4;
  let nextId = 1;
  let revivesUsed = 0;
  let uiColor = "#00ff00";

  // Init
  function init() {
    // Get initial UI color
    const computedStyle = getComputedStyle(document.documentElement);
    uiColor =
      computedStyle.getPropertyValue("--primary-color").trim() || "#00ff00";

    // Listen for changes
    window.addEventListener("uiColor:changed", (e) => {
      if (e.detail?.color) {
        uiColor = e.detail.color;
        renderBoard();
      }
    });

    createReviveOverlay();
    createGrid();
    setupInput();
    socket.emit("2048:get_best_score");
  }

  socket.on("2048:best_score", (score) => {
    bestScore = score;
    updateScoreDisplay();
  });

  socket.on("2048:reviveSuccess", () => {
    revivesUsed++;
    gameOver = false;
    const reviveOverlay = document.querySelector(".game-2048-revive-overlay");
    if (reviveOverlay) reviveOverlay.style.display = "none";
    toggleScrollLock(false);

    // Revive logic: Keep highest tile, clear rest
    let maxTile = null;
    let maxVal = -1;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] && grid[r][c].value > maxVal) {
          maxVal = grid[r][c].value;
          maxTile = grid[r][c];
        }
      }
    }

    // Reset grid
    grid = Array(size)
      .fill()
      .map(() => Array(size).fill(null));

    // Place max tile at random pos
    if (maxTile) {
      const r = Math.floor(Math.random() * size);
      const c = Math.floor(Math.random() * size);
      grid[r][c] = maxTile;
      // Reset mergedFrom to avoid animation glitches
      maxTile.mergedFrom = null;
    }

    // Add one random tile
    addRandomTile();

    renderBoard();
    showNotif("Partie continuée !");
  });

  socket.on("2048:reviveError", (msg) => {
    showNotif(msg || "Erreur lors du paiement");
  });

  function createReviveOverlay() {
    if (document.querySelector(".game-2048-revive-overlay")) return;

    const div = document.createElement("div");
    div.className = "game-2048-revive-overlay";
    div.style.cssText = `
            display: none; 
            position: absolute; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            background: rgba(0,0,0,0.9); 
            padding: 20px; 
            border: 2px solid var(--primary-color); 
            text-align: center; 
            z-index: 100;
            min-width: 250px;
        `;

    div.innerHTML = `
            <h3 style="color: var(--primary-color); margin-bottom: 10px;">GAME OVER</h3>
            <p style="color: #fff; margin-bottom: 15px;">Continuer la partie ?</p>
            <p class="revive-price" style="color: #fff; margin-bottom: 15px; font-weight: bold;">Coût: <span class="cost">0</span> clicks</p>
            <button class="revive-btn" style="padding: 8px 16px; cursor: pointer; background: var(--primary-color); border: none; font-weight: bold;">Payer & Continuer (<span class="revive-count">3</span> restants)</button>
            <button class="cancel-btn" style="display: block; margin: 10px auto 0; background: transparent; border: 1px solid #fff; color: #fff; padding: 5px 10px; cursor: pointer; ">Non merci</button>
        `;

    if (container) {
      container.style.position = "relative";
      container.appendChild(div);
    }

    const reviveBtn = div.querySelector(".revive-btn");
    const cancelBtn = div.querySelector(".cancel-btn");

    reviveBtn.onclick = () => {
      const price = parseInt(
        div.querySelector(".cost").textContent.replace(/\s/g, "")
      );
      socket.emit("2048:payToContinue", { price });
    };

    cancelBtn.onclick = () => {
      div.style.display = "none";
      toggleScrollLock(false);
      overlay.classList.add("show"); // Show standard game over
    };
  }

  function createGrid() {
    grid = Array(size)
      .fill()
      .map(() => Array(size).fill(null));
    score = 0;
    gameOver = false;
    nextId = 1;
    revivesUsed = 0;
    updateScoreDisplay();
    overlay.classList.remove("show");
    const reviveOverlay = document.querySelector(".game-2048-revive-overlay");
    if (reviveOverlay) reviveOverlay.style.display = "none";

    // Clear board DOM
    board.innerHTML = "";
    // Create background cells
    for (let i = 0; i < size * size; i++) {
      const cell = document.createElement("div");
      cell.classList.add("grid-cell");
      board.appendChild(cell);
    }

    addRandomTile();
    addRandomTile();
    renderBoard();
  }

  function addRandomTile() {
    const emptyCells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === null) emptyCells.push({ r, c });
      }
    }

    if (emptyCells.length > 0) {
      const { r, c } =
        emptyCells[Math.floor(Math.random() * emptyCells.length)];
      grid[r][c] = {
        id: nextId++,
        value: Math.random() < 0.9 ? 2 : 4,
        mergedFrom: null,
      };
    }
  }

  function getTilePos(r, c) {
    // 10px gap, 85px size
    const top = 10 + r * (85 + 10);
    const left = 10 + c * (85 + 10);
    return { top, left };
  }

  function getTileColor(value) {
    // Convert hex to rgb
    let r = 0,
      g = 255,
      b = 0;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(uiColor);
    if (result) {
      r = parseInt(result[1], 16);
      g = parseInt(result[2], 16);
      b = parseInt(result[3], 16);
    }

    // Calculate opacity based on log2 of value
    // log2(2) = 1, log2(2048) = 11
    const step = Math.log2(value);
    // Min opacity 0.25, Max 1.0
    const alpha = Math.min(1, 0.25 + (step - 1) * (0.75 / 10));

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function renderBoard() {
    // Helper to update or create a tile DOM
    const updateTileDOM = (tileObj, r, c, isMerged = false) => {
      let tileEl = document.querySelector(`.tile[data-id="${tileObj.id}"]`);
      const pos = getTilePos(r, c);
      const bgColor = getTileColor(tileObj.value);

      if (!tileEl) {
        // New tile
        tileEl = document.createElement("div");
        tileEl.classList.add("tile");
        tileEl.classList.add(
          `tile-${tileObj.value <= 2048 ? tileObj.value : "super"}`
        );
        tileEl.textContent = tileObj.value;
        tileEl.dataset.id = tileObj.id;
        tileEl.style.top = `${pos.top}px`;
        tileEl.style.left = `${pos.left}px`;
        tileEl.style.backgroundColor = bgColor;
        // Ensure text is readable
        tileEl.style.color = "#fff";
        tileEl.style.textShadow = "0 0 2px #000";
        tileEl.style.boxShadow = `0 0 5px ${bgColor}`;

        if (!isMerged && !tileObj.mergedFrom) {
          tileEl.classList.add("tile-new");
        } else if (isMerged) {
          tileEl.classList.add("tile-die");
        } else if (tileObj.mergedFrom) {
          tileEl.classList.add("tile-merged");
        }

        board.appendChild(tileEl);
      } else {
        // Existing tile, update position
        tileEl.style.top = `${pos.top}px`;
        tileEl.style.left = `${pos.left}px`;

        // Update value and class
        tileEl.className = `tile tile-${
          tileObj.value <= 2048 ? tileObj.value : "super"
        }`;
        if (tileObj.mergedFrom) tileEl.classList.add("tile-merged");
        tileEl.textContent = tileObj.value;

        // Update color
        tileEl.style.backgroundColor = bgColor;
        tileEl.style.boxShadow = `0 0 5px ${bgColor}`;
      }
      return tileEl;
    };

    // Track IDs present in the new frame
    const activeIds = new Set();

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const tile = grid[r][c];
        if (tile) {
          activeIds.add(tile.id);

          if (tile.mergedFrom) {
            // Render the two source tiles moving to this position
            tile.mergedFrom.forEach((sourceTile) => {
              activeIds.add(sourceTile.id);
              const el = updateTileDOM(sourceTile, r, c, true);
              // Schedule removal
              setTimeout(() => {
                el.remove();
              }, 100); // Match CSS transition time
            });

            // Render the new merged tile
            const el = updateTileDOM(tile, r, c);
            el.style.zIndex = 20;
          } else {
            updateTileDOM(tile, r, c);
          }
        }
      }
    }

    // Remove tiles that are no longer active
    const allTiles = document.querySelectorAll(".tile");
    allTiles.forEach((el) => {
      const id = parseInt(el.dataset.id);
      if (!activeIds.has(id)) {
        el.remove();
      }
    });
  }

  function updateScoreDisplay() {
    if (scoreDisplay) scoreDisplay.textContent = score;
    if (bestDisplay) {
      if (score > bestScore) {
        bestScore = score;
      }
      bestDisplay.textContent = bestScore;
    }
  }

  function move(direction) {
    if (gameOver) return;

    let moved = false;

    // Reset mergedFrom flags
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c]) grid[r][c].mergedFrom = null;
      }
    }

    let scoreAdd = 0;

    // Helper to process a line (array of tiles)
    const processLine = (line) => {
      let newLine = line.filter((t) => t !== null);

      for (let i = 0; i < newLine.length - 1; i++) {
        if (newLine[i].value === newLine[i + 1].value) {
          // Merge
          const mergedValue = newLine[i].value * 2;
          scoreAdd += mergedValue;

          const newTile = {
            id: nextId++,
            value: mergedValue,
            mergedFrom: [newLine[i], newLine[i + 1]],
          };

          newLine[i] = newTile;
          newLine[i + 1] = null;
          // Skip next check to avoid double merge in one move
          i++;
        }
      }

      newLine = newLine.filter((t) => t !== null);
      while (newLine.length < size) newLine.push(null);
      return newLine;
    };

    const oldGridState = grid.map((row) => row.map((t) => (t ? t.id : null)));

    if (direction === "ArrowLeft") {
      for (let r = 0; r < size; r++) {
        const row = grid[r];
        grid[r] = processLine(row);
      }
    } else if (direction === "ArrowRight") {
      for (let r = 0; r < size; r++) {
        let row = grid[r].reverse();
        row = processLine(row);
        grid[r] = row.reverse();
      }
    } else if (direction === "ArrowUp") {
      for (let c = 0; c < size; c++) {
        let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
        col = processLine(col);
        for (let r = 0; r < size; r++) grid[r][c] = col[r];
      }
    } else if (direction === "ArrowDown") {
      for (let c = 0; c < size; c++) {
        let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]].reverse();
        col = processLine(col);
        col.reverse();
        for (let r = 0; r < size; r++) grid[r][c] = col[r];
      }
    }

    // Check if changed
    const newGridState = grid.map((row) => row.map((t) => (t ? t.id : null)));
    if (JSON.stringify(oldGridState) !== JSON.stringify(newGridState)) {
      moved = true;
    }

    if (moved) {
      score += scoreAdd;
      updateScoreDisplay();
      addRandomTile();
      renderBoard();
      checkGameOver();
    }
  }

  function checkGameOver() {
    // Check if moves possible
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === null) return; // Empty cell
        if (c < size - 1 && grid[r][c].value === grid[r][c + 1].value) return; // Horizontal merge
        if (r < size - 1 && grid[r][c].value === grid[r + 1][c].value) return; // Vertical merge
      }
    }

    // No moves possible
    gameOver = true;
    socket.emit("2048:submit_score", score);

    if (revivesUsed < 3) {
      const reviveOverlay = document.querySelector(".game-2048-revive-overlay");
      if (reviveOverlay) {
        reviveOverlay.style.display = "block";
        toggleScrollLock(true);

        reviveOverlay.querySelector(".revive-count").textContent =
          3 - revivesUsed;

        let price = Math.floor(score * 1.5);
        reviveOverlay.querySelector(".cost").textContent =
          price.toLocaleString("fr-FR");
      } else {
        overlay.classList.add("show");
      }
    } else {
      overlay.classList.add("show");
    }
  }

  function setupInput() {
    window.addEventListener("keydown", (e) => {
      // Only move if stage12 is visible
      const stage12 = document.getElementById("stage12");
      if (stage12 && getComputedStyle(stage12).display !== "none") {
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
          e.preventDefault();
          move(e.key);
        }
      }
    });

    if (restartBtn) restartBtn.addEventListener("click", createGrid);
    if (tryAgainBtn) tryAgainBtn.addEventListener("click", createGrid);
  }

  init();
}
