import { showNotif } from "./util.js";

export function initMotus(socket) {
  const grid = document.querySelector(".motus-grid");
  const keyboard = document.querySelector(".motus-keyboard");
  const message = document.querySelector(".motus-message");
  const skipBtn = document.querySelector(".motus-skip");
  const continueBtn = document.querySelector(".motus-continue");
  const avancement = document.querySelector("p.avancement");

  if (!grid || !keyboard) return;

  let currentGuess = "";
  let currentRow = 0;
  let wordLength = 5; // Par défaut, sera mis à jour
  let gameActive = true;
  let maxRows = 6;
  let hyphenIndices = [];
  let totalWords = null;
  let foundWordsCount = 0;
  const gridGap = 5;

  function updateAvancement() {
    if (avancement) {
      const total = totalWords === null ? "?" : totalWords;
      avancement.textContent = `${foundWordsCount} / ${total}`;
    }
  }

  updateAvancement();

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      socket.emit("motus:skip");
      skipBtn.style.display = "none";
      // Réinitialiser l'état local immédiatement pour une meilleure UX
      gameActive = true;
      currentGuess = "";
      currentRow = 0;
      // La grille sera reconstruite par l'événement init
    });
  }

  if (continueBtn) {
    continueBtn.addEventListener("click", () => {
      socket.emit("motus:continue");
      continueBtn.style.display = "none";
      // Réinitialiser l'état local immédiatement pour une meilleure UX
      gameActive = true;
      currentGuess = "";
      currentRow = 0;
      // La grille sera reconstruite par l'événement init
    });
  }

  // Initialiser la grille
  function computeTileSize(length) {
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;
    const containerRect =
      grid.parentElement &&
      typeof grid.parentElement.getBoundingClientRect === "function"
        ? grid.parentElement.getBoundingClientRect()
        : null;

    const keyboardHeight = keyboard
      ? keyboard.getBoundingClientRect().height || 210
      : 210;

    const availableWidth = Math.max(
      180,
      Math.min(
        (containerRect?.width || viewportWidth) - 24,
        viewportWidth - 28,
      ),
    );

    const availableHeight = Math.max(
      150,
      Math.min(
        (containerRect?.height || viewportHeight) - keyboardHeight - 130,
        viewportHeight - keyboardHeight - 170,
      ),
    );

    const sizeFromWidth = (availableWidth - (length - 1) * gridGap) / length;
    const sizeFromHeight =
      (availableHeight - (maxRows - 1) * gridGap) / maxRows;
    const baseTileSize = Math.floor(Math.min(sizeFromWidth, sizeFromHeight));
    const minTileSize = 22;
    const maxTileSize = 70;
    return Math.max(minTileSize, Math.min(maxTileSize, baseTileSize));
  }

  function applyResponsiveGridSizing(length) {
    const tileSize = computeTileSize(length);
    grid.style.setProperty("--motus-tile-size", `${tileSize}px`);
    grid.style.width = "100%";
    grid.style.height = "fit-content";
    grid.style.gridTemplateRows = `repeat(${maxRows}, ${tileSize}px)`;
    grid.style.gap = `${gridGap}px`;

    Array.from(grid.children).forEach((row) => {
      row.style.gridTemplateColumns = `repeat(${length}, ${tileSize}px)`;
      row.style.gap = `${gridGap}px`;
      Array.from(row.children).forEach((tile) => {
        tile.style.fontSize = `${Math.max(12, Math.floor(tileSize * 0.58))}px`;
        tile.style.lineHeight = `${tileSize}px`;
      });
    });
  }

  function scheduleMotusResize() {
    const runResize = () => {
      if (wordLength > 0) {
        applyResponsiveGridSizing(wordLength);
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(runResize);
    });
  }

  function createGrid(length) {
    grid.innerHTML = "";
    wordLength = length;

    for (let i = 0; i < maxRows; i++) {
      const row = document.createElement("div");
      row.className = "motus-row";

      for (let j = 0; j < length; j++) {
        const tile = document.createElement("div");
        tile.className = "motus-tile";

        if (hyphenIndices.includes(j)) {
          tile.textContent = "-";
          tile.classList.add("fixed-hyphen");
        }
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }

    applyResponsiveGridSizing(length);
  }

  // Initialiser le clavier
  const accentRows = ["ÀÁÂÈÉÊÎÏÔ"];
  const alphabetRows = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];

  function createKeyboard() {
    keyboard.innerHTML = "";

    const renderRow = (rowKeys, options = {}) => {
      const row = document.createElement("div");
      row.className = "motus-key-row";
      if (options.accent) {
        row.classList.add("motus-accent-row");
      }
      rowKeys.split("").forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "motus-key";
        btn.textContent = key;
        btn.dataset.key = key;
        btn.onclick = () => handleKey(key);
        row.appendChild(btn);
      });
      keyboard.appendChild(row);
      return row;
    };

    accentRows.forEach((rowKeys) => renderRow(rowKeys, { accent: true }));
    alphabetRows.forEach((rowKeys, index) => {
      const row = renderRow(rowKeys);
      if (index === alphabetRows.length - 1) {
        const back = document.createElement("button");
        back.className = "motus-key big";
        back.innerHTML = '<i class="fa-solid fa-delete-left"></i>';
        back.dataset.key = "Backspace";
        back.onclick = handleBackspace;
        row.appendChild(back);
      }
    });

    const spaceRow = document.createElement("div");
    spaceRow.className = "motus-key-row motus-space-row";

    const spaceBtn = document.createElement("button");
    spaceBtn.className = "motus-key motus-key-space";
    spaceBtn.textContent = "Espace";
    spaceBtn.dataset.key = " ";
    spaceBtn.onclick = () => handleKey(" ");

    spaceRow.appendChild(spaceBtn);
    keyboard.appendChild(spaceRow);

    applyResponsiveGridSizing(wordLength);
  }

  function updateKeyCorrectIndices(letter, tileIndex, keyElement) {
    const key =
      keyElement || document.querySelector(`.motus-key[data-key="${letter}"]`);
    if (!key) return;
    const humanIndex = tileIndex + 1;
    const existing = key.dataset.correctIndices
      ? key.dataset.correctIndices
          .split(",")
          .map((value) => parseInt(value, 10))
      : [];
    if (existing.includes(humanIndex)) return;
    existing.push(humanIndex);
    existing.sort((a, b) => a - b);
    key.dataset.correctIndices = existing.join(",");
  }

  function updateGrid() {
    const row = grid.children[currentRow];
    if (!row) return;
    const tiles = row.children;
    for (let i = 0; i < wordLength; i++) {
      if (currentGuess[i]) {
        tiles[i].textContent = currentGuess[i];
        tiles[i].dataset.state = "active";
      } else if (hyphenIndices.includes(i)) {
        tiles[i].textContent = "-";
        tiles[i].dataset.state = "empty";
      } else {
        tiles[i].textContent = "";
        tiles[i].dataset.state = "empty";
      }
    }
  }

  function handleKey(key) {
    if (!gameActive) return;

    // Sauter automatiquement les traits d'union si nous sommes actuellement sur l'un d'eux
    while (
      hyphenIndices.includes(currentGuess.length) &&
      currentGuess.length < wordLength
    ) {
      currentGuess += "-";
    }

    // Si l'utilisateur tape "-" mais que nous venons de le remplir automatiquement (ou sommes sur un trait d'union fixe), l'ignorer
    if (
      key === "-" &&
      currentGuess.length > 0 &&
      currentGuess[currentGuess.length - 1] === "-" &&
      hyphenIndices.includes(currentGuess.length - 1)
    ) {
      return;
    }

    if (currentGuess.length < wordLength) {
      currentGuess += key;

      // Vérifier si le SUIVANT est un trait d'union
      while (
        hyphenIndices.includes(currentGuess.length) &&
        currentGuess.length < wordLength
      ) {
        currentGuess += "-";
      }

      updateGrid();

      if (currentGuess.length === wordLength) {
        handleEnter();
      }
    }
  }

  function handleBackspace() {
    if (!gameActive) return;
    if (currentGuess.length === 0) return;

    currentGuess = currentGuess.slice(0, -1);

    // Si nous atterrissons sur un trait d'union (en reculant), le supprimer aussi
    while (
      currentGuess.length > 0 &&
      hyphenIndices.includes(currentGuess.length - 1)
    ) {
      currentGuess = currentGuess.slice(0, -1);
    }

    updateGrid();
  }

  function handleEnter() {
    if (!gameActive) return;
    if (currentGuess.length !== wordLength) {
      showMessage("Pas assez de lettres");
      return;
    }
    socket.emit("motus:guess", { guess: currentGuess });
  }

  function showMessage(msg) {
    message.textContent = msg;
    message.style.display = "block";
    setTimeout(() => {
      message.style.display = "none";
    }, 2000);
  }

  function revealRow(result, guess) {
    gameActive = false;
    const row = grid.children[currentRow];
    const tiles = row.children;

    result.forEach((status, i) => {
      setTimeout(() => {
        const tile = tiles[i];
        const letter = guess[i];
        const key = document.querySelector(`.motus-key[data-key="${letter}"]`);

        if (status === 2) {
          tile.dataset.state = "correct";
          if (key) {
            key.dataset.state = "correct";
            updateKeyCorrectIndices(letter, i, key);
          } else {
            updateKeyCorrectIndices(letter, i);
          }
        } else if (status === 1) {
          tile.dataset.state = "present";
          if (key && key.dataset.state !== "correct")
            key.dataset.state = "present";
        } else {
          tile.dataset.state = "absent";
          if (
            key &&
            key.dataset.state !== "correct" &&
            key.dataset.state !== "present"
          )
            key.dataset.state = "absent";
        }
      }, i * 100);
    });

    currentRow++;
    currentGuess = "";

    if (result.every((s) => s === 2)) {
      // gameActive est déjà faux
      setTimeout(
        () => {
          showNotif("🎉 Bravo !");
          if (continueBtn) continueBtn.style.display = "block";
          if (skipBtn) skipBtn.style.display = "none";
        },
        wordLength * 100 + 100,
      );
    } else if (currentRow >= maxRows) {
      // Réinitialiser la grille si pleine et non gagnée
      // gameActive est déjà faux
      setTimeout(
        () => {
          Array.from(grid.children).forEach((row) => {
            Array.from(row.children).forEach((tile, index) => {
              if (hyphenIndices.includes(index)) {
                tile.textContent = "-";
                tile.classList.add("fixed-hyphen");
                delete tile.dataset.state;
              } else {
                tile.textContent = "";
                delete tile.dataset.state;
              }
            });
          });
          currentRow = 0;
          gameActive = true;
          showNotif("Grille réinitialisée !");
        },
        wordLength * 100 + 100,
      );
    } else {
      setTimeout(() => {
        gameActive = true;
      }, wordLength * 100);
    }
  }

  // Écouteurs Socket
  socket.on("motus:wordListLength", ({ length }) => {
    //console.log("Reçu longueur mots motus:", length);
    totalWords = length;
    updateAvancement();
  });

  socket.on("motus:foundWords", ({ foundWords }) => {
    //console.log("Reçu mots trouvés motus:", foundWords);
    foundWordsCount = foundWords;
    updateAvancement();
  });

  socket.on("motus:init", ({ length, hyphens, history, won }) => {
    currentRow = 0;
    currentGuess = ""; // Réinitialiser la supposition actuelle pour éviter le report
    gameActive = true; // Réinitialiser l'état du jeu
    hyphenIndices = hyphens || [];
    createGrid(length);
    createKeyboard(); // Reconstruit le clavier (réinitialise les couleurs)

    if (hyphenIndices.length > 0) {
      const key = document.querySelector('.motus-key[data-key="-"]');
      if (key) key.dataset.state = "correct";
    }

    // Logique de visibilité des boutons
    if (won) {
      if (continueBtn) continueBtn.style.display = "block";
      if (skipBtn) skipBtn.style.display = "none";
      gameActive = false;
    } else {
      if (continueBtn) continueBtn.style.display = "none";
      if (skipBtn) skipBtn.style.display = "block";
      gameActive = true;
    }

    // Restaurer l'historique
    if (history && Array.isArray(history)) {
      // Mettre à jour le clavier basé sur l'historique COMPLET
      history.forEach((entry) => {
        entry.result.forEach((status, i) => {
          const letter = entry.guess[i];
          const key = document.querySelector(
            `.motus-key[data-key="${letter}"]`,
          );
          if (status === 2) {
            if (key) {
              key.dataset.state = "correct";
              updateKeyCorrectIndices(letter, i, key);
            } else {
              updateKeyCorrectIndices(letter, i);
            }
          } else if (status === 1) {
            if (key && key.dataset.state !== "correct")
              key.dataset.state = "present";
          } else {
            if (
              key &&
              key.dataset.state !== "correct" &&
              key.dataset.state !== "present"
            )
              key.dataset.state = "absent";
          }
        });
      });

      // Déterminer l'historique visible pour la grille
      const last = history[history.length - 1];
      const won = last && last.result.every((s) => s === 2);
      let visibleHistory = [];

      if (won) {
        const pageStart = Math.floor((history.length - 1) / maxRows) * maxRows;
        visibleHistory = history.slice(pageStart);
      } else {
        const pageStart = Math.floor(history.length / maxRows) * maxRows;
        visibleHistory = history.slice(pageStart);
      }

      visibleHistory.forEach((entry) => {
        // Remplir la grille visuellement
        const row = grid.children[currentRow];
        for (let i = 0; i < length; i++) {
          row.children[i].textContent = entry.guess[i];
        }
        // Révéler les couleurs immédiatement (pas d'animation)
        entry.result.forEach((status, i) => {
          const tile = row.children[i];
          if (status === 2) tile.dataset.state = "correct";
          else if (status === 1) tile.dataset.state = "present";
          else tile.dataset.state = "absent";
        });
        currentRow++;
      });

      if (won) {
        gameActive = false;
        // Boutons gérés dans init
      }
    }

    scheduleMotusResize();
  });

  socket.on("motus:result", ({ result, guess, won }) => {
    revealRow(result, guess);
    if (won) {
      socket.emit("motus:getFoundWords");
    }
  });

  socket.on("motus:end", ({ message: msg }) => {
    showMessage(msg);
    if (skipBtn) skipBtn.style.display = "none";
    if (continueBtn) continueBtn.style.display = "none";
    gameActive = false;
  });

  socket.on("motus:error", ({ message }) => {
    showMessage(message);
  });

  // Support du clavier physique
  document.addEventListener("keydown", (e) => {
    // Vérifier si stage11 est visible
    const stage = document.getElementById("stage11");
    if (!stage || !stage.classList.contains("is-active")) return;

    // Autoriser les raccourcis navigateur (Ctrl+R, Ctrl+Shift+I, etc.)
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === "Enter") handleEnter();
    else if (e.key === "Backspace") {
      e.preventDefault(); // Empecher le retour en arriere de la page sur Firefox
      handleBackspace();
    } else {
      // Supporter les lettres accentuées et autres caractères présents
      // sur le clavier virtuel (ex: 'é'). On tente d'abord la version
      // normalisée en MAJUSCULE, puis la valeur brute.
      const raw = e.key;
      if (raw && raw.length === 1) {
        const norm = raw.toUpperCase();

        // Accepter explicitement '-' également
        if (raw === "-") {
          e.preventDefault();
          handleKey("-");
          return;
        }

        // Chercher un bouton correspondant dans le clavier virtuel
        const matchNorm = document.querySelector(
          `.motus-key[data-key="${norm}"]`,
        );
        const matchRaw = document.querySelector(
          `.motus-key[data-key="${raw}"]`,
        );

        if (matchNorm || matchRaw) {
          e.preventDefault(); // Empecher le retour en arriere de la page sur Firefox
          // Utiliser la forme MAJUSCULE pour rester cohérent avec handleKey
          handleKey(norm);
        }
      }
    }
  });

  // Demander les stats initiales
  socket.emit("motus:requestWordListLength");
  socket.emit("motus:getFoundWords");

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      scheduleMotusResize();
    }, 80);
  });

  window.addEventListener("pde:section-activated", (e) => {
    const sectionId = e && e.detail ? e.detail.sectionId : null;
    if (sectionId !== "stage11") return;
    scheduleMotusResize();
  });
}
