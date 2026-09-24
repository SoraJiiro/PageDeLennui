import { showNotif } from "./util.js";

export function initMotus(socket) {
  const grid = document.querySelector(".motus-grid");
  const keyboard = document.querySelector(".motus-keyboard");
  const message = document.querySelector(".motus-message");
  const skipBtn = document.querySelector(".motus-skip");
  const continueBtn = document.querySelector(".motus-continue");
  const avancement = document.querySelector("p.avancement");

  if (!grid || !keyboard) return;

  let currentGuess = [];
  let currentRow = 0;
  let wordLength = 5; // Par défaut, sera mis à jour
  let gameActive = true;
  let maxRows = 6;
  let hyphenIndices = [];
  let fixedIndices = [];
  let fixedChars = {};
  let keyboardMode = 0;
  const keyboardHints = new Map();
  let totalWords = null;
  let foundWordsCount = 0;
  const gridGap = 5;

  function updateAvancement() {
    if (avancement) {
      const total = totalWords === null ? "?" : totalWords;
      avancement.textContent = `${foundWordsCount} / ${total}`;
    }
  }

  function resetCurrentGuess() {
    currentGuess = Array.from({ length: wordLength }, (_, index) =>
      fixedIndices.includes(index) ? fixedChars[index] || "" : "",
    );
  }

  updateAvancement();

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      socket.emit("motus:skip");
      skipBtn.style.display = "none";
      // Réinitialiser l'état local immédiatement pour une meilleure UX
      gameActive = true;
      resetCurrentGuess();
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
      resetCurrentGuess();
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

        if (fixedIndices.includes(j)) {
          tile.textContent = fixedChars[j] || "";
          tile.classList.add("fixed-hyphen");
        }
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }

    applyResponsiveGridSizing(length);
  }

  // Initialiser le clavier
  const keyboardModes = [
    { label: "Lettres", rows: ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"] },
    { label: "Nombres", rows: ["1234567890"] },
    { label: "Accents", rows: ["ÀÁÂÄ", "ÈÉÊË", "ÌÍÎÏ", "ÒÓÔÖ", "ÙÚÛÜ", "Ñ"] },
  ];

  function nextEmptyEditableIndex() {
    return Array.from({ length: wordLength }, (_, index) => index).find(
      (index) => !fixedIndices.includes(index) && !currentGuess[index],
    );
  }

  function getKeyboardHint(key) {
    return keyboardHints.get(key) || { state: "", correctIndices: [] };
  }

  function setKeyboardHint(key, state) {
    if (!key) return;
    const current = getKeyboardHint(key);
    const rank = { "": 0, absent: 1, present: 2, correct: 3 };
    const nextState = rank[state] > rank[current.state] ? state : current.state;
    keyboardHints.set(key, {
      state: nextState,
      correctIndices: current.correctIndices,
    });
  }

  function applyKeyboardHint(button) {
    const hint = getKeyboardHint(button.dataset.key);
    if (hint.state) button.dataset.state = hint.state;
    if (hint.correctIndices.length) {
      button.dataset.correctIndices = hint.correctIndices.join(",");
    }
  }

  function createKeyboard() {
    keyboard.innerHTML = "";
    const mode = keyboardModes[keyboardMode];

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "motus-keyboard-toggle";
    toggle.textContent = `${mode.label} ▾`;
    toggle.onclick = () => {
      keyboardMode = (keyboardMode + 1) % keyboardModes.length;
      createKeyboard();
    };
    keyboard.appendChild(toggle);

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
        applyKeyboardHint(btn);
        row.appendChild(btn);
      });
      keyboard.appendChild(row);
      return row;
    };

    mode.rows.forEach((rowKeys, index) => {
      const row = renderRow(rowKeys);
      if (index === mode.rows.length - 1) {
        const back = document.createElement("button");
        back.className = "motus-key big";
        back.innerHTML = '<i class="fa-solid fa-delete-left"></i>';
        back.dataset.key = "Backspace";
        back.onclick = handleBackspace;
        row.appendChild(back);
      }
    });

    applyResponsiveGridSizing(wordLength);
  }

  function updateKeyCorrectIndices(letter, tileIndex, keyElement) {
    const key =
      keyElement || document.querySelector(`.motus-key[data-key="${letter}"]`);
    const humanIndex = tileIndex + 1;
    const hint = getKeyboardHint(letter);
    const existing = hint.correctIndices;
    if (existing.includes(humanIndex)) return;
    existing.push(humanIndex);
    existing.sort((a, b) => a - b);
    keyboardHints.set(letter, { state: "correct", correctIndices: existing });
    if (key) applyKeyboardHint(key);
  }

  function updateGrid() {
    const row = grid.children[currentRow];
    if (!row) return;
    const tiles = row.children;
    for (let i = 0; i < wordLength; i++) {
      if (currentGuess[i]) {
        tiles[i].textContent = currentGuess[i];
        tiles[i].dataset.state = "active";
      } else if (fixedIndices.includes(i)) {
        tiles[i].textContent = fixedChars[i] || "";
        tiles[i].dataset.state = "empty";
      } else {
        tiles[i].textContent = "";
        tiles[i].dataset.state = "empty";
      }
    }
  }

  function handleKey(key) {
    if (!gameActive) return;

    const index = nextEmptyEditableIndex();
    if (index !== undefined) {
      currentGuess[index] = key;

      updateGrid();

      if (nextEmptyEditableIndex() === undefined) {
        handleEnter();
      }
    }
  }

  function handleBackspace() {
    if (!gameActive) return;
    let index = wordLength - 1;
    while (index >= 0 && (fixedIndices.includes(index) || !currentGuess[index]))
      index--;
    if (index < 0) return;
    currentGuess[index] = "";

    updateGrid();
  }

  function handleEnter() {
    if (!gameActive) return;
    if (nextEmptyEditableIndex() !== undefined) {
      showMessage("Pas assez de lettres");
      return;
    }
    socket.emit("motus:guess", { guess: currentGuess.join("") });
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
          setKeyboardHint(letter, "correct");
          updateKeyCorrectIndices(letter, i, key);
        } else if (status === 1) {
          tile.dataset.state = "present";
          setKeyboardHint(letter, "present");
          if (key) applyKeyboardHint(key);
        } else {
          tile.dataset.state = "absent";
          setKeyboardHint(letter, "absent");
          if (key) applyKeyboardHint(key);
        }
      }, i * 100);
    });

    currentRow++;
    resetCurrentGuess();

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
              if (fixedIndices.includes(index)) {
                tile.textContent = fixedChars[index] || "";
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

  socket.on(
    "motus:init",
    ({
      length,
      hyphens,
      fixedIndices: incomingFixedIndices,
      fixedChars: incomingFixedChars,
      history,
      won,
    }) => {
      currentRow = 0;
      wordLength = length;
      fixedIndices = incomingFixedIndices || hyphens || [];
      fixedChars = incomingFixedChars || {};
      keyboardHints.clear();
      resetCurrentGuess(); // Réinitialiser la supposition actuelle pour éviter le report
      gameActive = true; // Réinitialiser l'état du jeu
      hyphenIndices = hyphens || [];
      createGrid(length);
      createKeyboard(); // Reconstruit le clavier (réinitialise les couleurs)

      if (hyphenIndices.length > 0) {
        setKeyboardHint("-", "correct");
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
              setKeyboardHint(letter, "correct");
              updateKeyCorrectIndices(letter, i, key);
            } else if (status === 1) {
              setKeyboardHint(letter, "present");
              if (key) applyKeyboardHint(key);
            } else {
              setKeyboardHint(letter, "absent");
              if (key) applyKeyboardHint(key);
            }
          });
        });

        // Déterminer l'historique visible pour la grille
        const last = history[history.length - 1];
        const won = last && last.result.every((s) => s === 2);
        let visibleHistory = [];

        if (won) {
          const pageStart =
            Math.floor((history.length - 1) / maxRows) * maxRows;
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
    },
  );

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
