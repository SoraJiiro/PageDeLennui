import { showNotif } from "./util.js";

export function initMotus(socket) {
  const grid = document.querySelector(".motus-grid");
  const keyboard = document.querySelector(".motus-keyboard");
  const message = document.querySelector(".motus-message");
  const resetBtn = document.querySelector(".motus-reset");
  const alreadyFoundMsg = document.querySelector(".motus-already-found");

  if (!grid || !keyboard) return;

  let currentGuess = "";
  let currentRow = 0;
  let wordLength = 5; // Default, will be updated
  let gameActive = true;
  let maxRows = 6;
  let hyphenIndices = [];

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      socket.emit("motus:reset");
      resetBtn.style.display = "none";
      // Reset local state immediately for better UX
      gameActive = true;
      currentGuess = "";
      currentRow = 0;
      // Grid will be rebuilt by init event
    });
  }

  // Initialize grid
  function createGrid(length) {
    grid.innerHTML = "";
    wordLength = length;

    // Calculate optimal tile size to fit in 350x300px container
    const maxWidth = 350;
    const maxHeight = 300;
    const gap = 5;
    const rows = 6;

    // Calculate max possible size based on width and height constraints
    const sizeFromWidth = (maxWidth - (length - 1) * gap) / length;
    const sizeFromHeight = (maxHeight - (rows - 1) * gap) / rows;

    const tileSize = Math.floor(Math.min(sizeFromWidth, sizeFromHeight));

    // Update grid styles
    grid.style.width = "fit-content";
    grid.style.height = "fit-content";
    grid.style.gridTemplateRows = `repeat(${rows}, ${tileSize}px)`;
    grid.style.gap = `${gap}px`;

    for (let i = 0; i < maxRows; i++) {
      const row = document.createElement("div");
      row.className = "motus-row";
      row.style.gridTemplateColumns = `repeat(${length}, ${tileSize}px)`;
      row.style.gap = `${gap}px`;

      for (let j = 0; j < length; j++) {
        const tile = document.createElement("div");
        tile.className = "motus-tile";
        tile.style.fontSize = `${tileSize * 0.6}px`; // Dynamic font size
        tile.style.lineHeight = `${tileSize}px`;

        if (hyphenIndices.includes(j)) {
          tile.textContent = "-";
          tile.classList.add("fixed-hyphen");
        }
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }
  }

  // Initialize keyboard
  const keys = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];

  function createKeyboard() {
    keyboard.innerHTML = "";
    keys.forEach((rowKeys, i) => {
      const row = document.createElement("div");
      row.className = "motus-key-row";

      rowKeys.split("").forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "motus-key";
        btn.textContent = key;
        btn.dataset.key = key;
        btn.onclick = () => handleKey(key);
        row.appendChild(btn);
      });

      if (i === 2) {
        // Backspace key
        const back = document.createElement("button");
        back.className = "motus-key big";
        back.innerHTML = '<i class="fa-solid fa-delete-left"></i>';
        back.dataset.key = "Backspace";
        back.onclick = handleBackspace;
        row.appendChild(back);
      }

      keyboard.appendChild(row);
    });
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

    // Auto-skip hyphens if we are currently on one
    while (
      hyphenIndices.includes(currentGuess.length) &&
      currentGuess.length < wordLength
    ) {
      currentGuess += "-";
    }

    // If user types "-" but we just auto-filled it (or are on a fixed hyphen), ignore it
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

      // Check if NEXT is hyphen
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

    // If we landed on a hyphen (going backwards), remove it too
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
          if (key) key.dataset.state = "correct";
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
      // gameActive is already false
      setTimeout(() => {
        showNotif("🎉 Bravo !");
        if (resetBtn) resetBtn.style.display = "block";
        if (alreadyFoundMsg) alreadyFoundMsg.style.display = "block";
      }, wordLength * 100 + 100);
    } else if (currentRow >= maxRows) {
      // Reset grid if full and not won
      // gameActive is already false
      setTimeout(() => {
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
      }, wordLength * 100 + 100);
    } else {
      setTimeout(() => {
        gameActive = true;
      }, wordLength * 100);
    }
  }

  // Socket listeners
  socket.on("motus:init", ({ length, hyphens, history, wonToday }) => {
    currentRow = 0;
    gameActive = true; // Reset game state
    hyphenIndices = hyphens || [];
    createGrid(length);
    createKeyboard();

    if (hyphenIndices.length > 0) {
      const key = document.querySelector('.motus-key[data-key="-"]');
      if (key) key.dataset.state = "correct";
    }

    if (wonToday) {
      if (alreadyFoundMsg) alreadyFoundMsg.style.display = "block";
    } else {
      if (alreadyFoundMsg) alreadyFoundMsg.style.display = "none";
    }

    if (resetBtn) resetBtn.style.display = "none";

    // Restore history
    if (history && Array.isArray(history)) {
      // Update keyboard based on FULL history
      history.forEach((entry) => {
        entry.result.forEach((status, i) => {
          const letter = entry.guess[i];
          const key = document.querySelector(
            `.motus-key[data-key="${letter}"]`
          );
          if (status === 2) {
            if (key) key.dataset.state = "correct";
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

      // Determine visible history for the grid
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
        // Fill grid visually
        const row = grid.children[currentRow];
        for (let i = 0; i < length; i++) {
          row.children[i].textContent = entry.guess[i];
        }
        // Reveal colors immediately (no animation)
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
        if (resetBtn) resetBtn.style.display = "block";
      }
    }
  });

  socket.on("motus:result", ({ result, guess, wonToday }) => {
    revealRow(result, guess);
    if (wonToday && alreadyFoundMsg) alreadyFoundMsg.style.display = "block";
  });

  socket.on("motus:error", ({ message }) => {
    showMessage(message);
  });

  // Physical keyboard support
  document.addEventListener("keydown", (e) => {
    // Check if stage11 is visible
    const stage = document.getElementById("stage11");
    if (!stage || stage.getBoundingClientRect().top > window.innerHeight)
      return;

    if (e.key === "Enter") handleEnter();
    else if (e.key === "Backspace") handleBackspace();
    else if (/^[a-zA-Z-]$/.test(e.key)) handleKey(e.key.toUpperCase());
  });
}
