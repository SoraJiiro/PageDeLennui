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

  // --- Shutdown resume glue (score-only) ---
  let resumeScore2048 = null;
  let resumeConsumed2048 = false;

  socket.on("2048:resume", ({ score }) => {
    const s = Math.floor(Number(score) || 0);
    if (Number.isFinite(s) && s > 0) {
      resumeScore2048 = s;
      // Appliquer immédiatement si une partie est déjà initialisée
      try {
        if (typeof window !== "undefined") {
          // no-op
        }
      } catch (e) {}
      if (!gameOver) {
        if (typeof scoreDisplay !== "undefined") {
          score = Math.max(score, resumeScore2048);
          updateScoreDisplay();
        }
      }
    }
  });

  socket.on("system:shutdown:collectProgress", () => {
    try {
      socket.emit("2048:progress", { score: score || 0 });
    } catch (e) {}
  });

  // Initialisation
  function init() {
    // Obtenir la couleur UI initiale
    const computedStyle = getComputedStyle(document.documentElement);
    uiColor =
      computedStyle.getPropertyValue("--primary-color").trim() || "#00ff00";

    // Écouter les changements
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

    // Logique de réanimation : Garder la tuile la plus haute, effacer le reste
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

    // Réinitialiser la grille
    grid = Array(size)
      .fill()
      .map(() => Array(size).fill(null));

    // Placer la tuile max à une position aléatoire
    if (maxTile) {
      const r = Math.floor(Math.random() * size);
      const c = Math.floor(Math.random() * size);
      grid[r][c] = maxTile;
      // Réinitialiser mergedFrom pour éviter les bugs d'animation
      maxTile.mergedFrom = null;
    }

    // Ajouter une tuile aléatoire
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
        div.querySelector(".cost").textContent.replace(/\s/g, ""),
      );
      socket.emit("2048:payToContinue", { price });
    };

    cancelBtn.onclick = () => {
      div.style.display = "none";
      toggleScrollLock(false);
      overlay.classList.add("show"); // Afficher le game over standard
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

    // Effacer le DOM du plateau
    board.innerHTML = "";
    // Créer les cellules d'arrière-plan
    for (let i = 0; i < size * size; i++) {
      const cell = document.createElement("div");
      cell.classList.add("grid-cell");
      board.appendChild(cell);
    }

    addRandomTile();
    addRandomTile();
    renderBoard();

    // Si on a une reprise (score-only), l'appliquer après création
    if (!resumeConsumed2048 && resumeScore2048 != null) {
      score = Math.max(score, resumeScore2048);
      updateScoreDisplay();
    }
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
    // Espace de 10px, taille de 85px
    const top = 10 + r * (85 + 10);
    const left = 10 + c * (85 + 10);
    return { top, left };
  }

  function getTileColor(value) {
    // Convertir hex en rgb
    let r = 0,
      g = 255,
      b = 0;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(uiColor);
    if (result) {
      r = parseInt(result[1], 16);
      g = parseInt(result[2], 16);
      b = parseInt(result[3], 16);
    }

    // Calculer l'opacité basée sur le log2 de la valeur
    // log2(2) = 1, log2(2048) = 11
    const step = Math.log2(value);
    // Opacité min 0.25, Max 1.0
    const alpha = Math.min(1, 0.25 + (step - 1) * (0.75 / 10));

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function renderBoard() {
    // Aide pour mettre à jour ou créer une tuile DOM
    const updateTileDOM = (tileObj, r, c, isMerged = false) => {
      let tileEl = document.querySelector(`.tile[data-id="${tileObj.id}"]`);
      const pos = getTilePos(r, c);
      const bgColor = getTileColor(tileObj.value);

      if (!tileEl) {
        // Nouvelle tuile
        tileEl = document.createElement("div");
        tileEl.classList.add("tile");
        tileEl.classList.add(
          `tile-${tileObj.value <= 2048 ? tileObj.value : "super"}`,
        );
        tileEl.textContent = tileObj.value;
        tileEl.dataset.id = tileObj.id;
        tileEl.style.top = `${pos.top}px`;
        tileEl.style.left = `${pos.left}px`;
        tileEl.style.backgroundColor = bgColor;
        // Assurer que le texte est lisible
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
        // Tuile existante, mettre à jour la position
        tileEl.style.top = `${pos.top}px`;
        tileEl.style.left = `${pos.left}px`;

        // Mettre à jour la valeur et la classe
        tileEl.className = `tile tile-${
          tileObj.value <= 2048 ? tileObj.value : "super"
        }`;
        if (tileObj.mergedFrom) tileEl.classList.add("tile-merged");
        tileEl.textContent = tileObj.value;

        // Mettre à jour la couleur
        tileEl.style.backgroundColor = bgColor;
        tileEl.style.boxShadow = `0 0 5px ${bgColor}`;
      }
      return tileEl;
    };

    // Suivre les IDs présents dans la nouvelle frame
    const activeIds = new Set();

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const tile = grid[r][c];
        if (tile) {
          activeIds.add(tile.id);

          if (tile.mergedFrom) {
            // Rendre les deux tuiles sources se déplaçant vers cette position
            tile.mergedFrom.forEach((sourceTile) => {
              activeIds.add(sourceTile.id);
              const el = updateTileDOM(sourceTile, r, c, true);
              // Planifier la suppression
              setTimeout(() => {
                el.remove();
              }, 100); // Correspond au temps de transition CSS
            });

            // Rendre la nouvelle tuile fusionnée
            const el = updateTileDOM(tile, r, c);
            el.style.zIndex = 20;
          } else {
            updateTileDOM(tile, r, c);
          }
        }
      }
    }

    // Supprimer les tuiles qui ne sont plus actives
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

    // Consommer la reprise au premier mouvement utilisateur
    if (!resumeConsumed2048 && resumeScore2048 != null) {
      try {
        socket.emit("2048:resumeConsumed");
      } catch (e) {}
      resumeConsumed2048 = true;
      resumeScore2048 = null;
    }

    let moved = false;

    // Réinitialiser les drapeaux mergedFrom
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c]) grid[r][c].mergedFrom = null;
      }
    }

    let scoreAdd = 0;

    // Aide pour traiter une ligne (tableau de tuiles)
    const processLine = (line) => {
      let newLine = line.filter((t) => t !== null);

      for (let i = 0; i < newLine.length - 1; i++) {
        if (newLine[i].value === newLine[i + 1].value) {
          // Fusionner
          const mergedValue = newLine[i].value * 2;
          scoreAdd += mergedValue;

          const newTile = {
            id: nextId++,
            value: mergedValue,
            mergedFrom: [newLine[i], newLine[i + 1]],
          };

          newLine[i] = newTile;
          newLine[i + 1] = null;
          // Sauter la prochaine vérification pour éviter une double fusion en un seul mouvement
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

    // Vérifier si changé
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
    // Vérifier si des mouvements sont possibles
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === null) return; // Cellule vide
        if (c < size - 1 && grid[r][c].value === grid[r][c + 1].value) return; // Fusion horizontale
        if (r < size - 1 && grid[r][c].value === grid[r + 1][c].value) return; // Fusion verticale
      }
    }

    // Aucun mouvement possible
    gameOver = true;
    socket.emit("2048:submit_score", score);

    if (revivesUsed < 3) {
      const reviveOverlay = document.querySelector(".game-2048-revive-overlay");
      if (reviveOverlay) {
        reviveOverlay.style.display = "block";
        toggleScrollLock(true);

        reviveOverlay.querySelector(".revive-count").textContent =
          3 - revivesUsed;

        const multiplier = 10;
        const escalation = 1 + revivesUsed * 0.75;
        let price = Math.floor(score * multiplier * escalation);
        price = Math.max(5000, Math.min(5000000, price));
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
      // Déplacer uniquement si stage12 est visible
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
