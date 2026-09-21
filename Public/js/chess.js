export function initChess(socket) {
  const root = document.querySelector("#stage23");
  if (!root) return;
  const lobby = root.querySelector(".chess-lobby");
  const game = root.querySelector(".chess-game");
  const board = root.querySelector(".chess-board");
  const lastMove = root.querySelector(".chess-last-move");
  const capturedWhite = root.querySelector(".chess-captured-white");
  const capturedBlack = root.querySelector(".chess-captured-black");
  const status = root.querySelector(".chess-status");
  const whiteClock = root.querySelector(".chess-clock-white time");
  const blackClock = root.querySelector(".chess-clock-black time");
  const whiteClockBox = root.querySelector(".chess-clock-white");
  const blackClockBox = root.querySelector(".chess-clock-black");
  const players = root.querySelector(".chess-players");
  const spectators = root.querySelector(".chess-spectators");
  const games = root.querySelector(".chess-games");
  const create = root.querySelector(".chess-create");
  const createTimer = root.querySelector("#chess-timer-select");
  const createVsBot = root.querySelector("#chess-vs-bot-toggle");
  const join = root.querySelector(".chess-join");
  const leave = root.querySelector(".chess-leave");
  const start = root.querySelector(".chess-start");
  const spec = root.querySelector(".chess-spectator");
  const quit = root.querySelector(".chess-quit");
  const backToLobby = root.querySelector(".chess-back-to-lobby");
  const resultScreen = root.querySelector(".chess-result");
  const resultMessage = root.querySelector(".chess-result-message");
  const resultReward = root.querySelector(".chess-result-reward");
  const resultBack = root.querySelector(".chess-result-back");
  const promotionDialog = root.querySelector(".chess-promotion");
  let state = null;
  let selected = null;
  let renderedFen = null;
  let pendingPromotion = null;

  socket.emit("chess:getState");
  create?.addEventListener("click", () => {
    const timeMinutes = Number(createTimer?.value || 10);
    const clamped = Math.min(
      30,
      Math.max(1, Number.isFinite(timeMinutes) ? timeMinutes : 10),
    );
    socket.emit("chess:create", {
      timeMinutes: clamped,
      vsBot: Boolean(createVsBot?.checked),
    });
  });
  leave?.addEventListener("click", () => socket.emit("chess:leave"));
  quit?.addEventListener("click", () => {
    socket.emit("chess:leave");
    showLobby();
  });
  start?.addEventListener("click", () => socket.emit("chess:start"));
  backToLobby?.addEventListener("click", () => {
    socket.emit("chess:leave");
    showLobby();
  });
  resultBack?.addEventListener("click", showLobby);
  root.querySelectorAll(".chess-promotion-options button").forEach((button) => {
    button.addEventListener("click", () => {
      if (!pendingPromotion) return;
      const promotion = button.dataset.piece;
      if (!pendingPromotion.options.has(promotion)) return;
      socket.emit("chess:play", {
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion,
      });
      pendingPromotion = null;
      promotionDialog.hidden = true;
      clearSelection();
    });
  });

  socket.on("chess:lobby", (data) => {
    const entries = data.games || [];
    games.innerHTML = entries.length
      ? entries
          .map(
            (entry) =>
              `<div class="chess-game-row"><div><strong>${entry.gameStarted ? "Partie en cours" : "Table en attente"}</strong><p>${entry.joueurs.join(" vs ") || "En attente d'un joueur"}${entry.gameStarted ? ` · ${entry.spectators} spectateur${entry.spectators > 1 ? "s" : ""}` : ` · ${entry.joueurs.length}/2 joueurs`}</p></div>${entry.id === data.playerGameId ? "<span>Votre table</span>" : data.playerGameId && !entry.gameStarted ? "" : `<button data-game-id="${entry.id}" data-action="${entry.gameStarted ? "spectate" : "join"}">${entry.gameStarted ? "Regarder" : "Rejoindre"}</button>`}</div>`,
          )
          .join("")
      : "<p>Aucune partie pour le moment. Créez-en une !</p>";
    games
      .querySelectorAll("button[data-game-id]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          socket.emit(
            button.dataset.action === "spectate"
              ? "chess:spectate"
              : "chess:join",
            { gameId: button.dataset.gameId },
          ),
        ),
      );
    const myGame = entries.find((entry) => entry.id === data.playerGameId);
    create.style.display = data.playerGameId ? "none" : "inline-block";
    leave.style.display =
      myGame && !myGame.gameStarted ? "inline-block" : "none";
    start.style.display =
      myGame && !myGame.gameStarted ? "inline-block" : "none";
    const readyPlayers = myGame?.vsBot
      ? Math.max(2, myGame.joueurs.length)
      : myGame?.joueurs.length || 0;
    start.disabled =
      !myGame || (myGame.vsBot ? readyPlayers < 2 : readyPlayers !== 2);
    start.textContent = myGame
      ? myGame.vsBot
        ? readyPlayers >= 2
          ? "Démarrer la partie"
          : "En attente (1/2)"
        : readyPlayers === 2
          ? "Démarrer la partie"
          : `En attente (${readyPlayers || 0}/2)`
      : "En attente...";
  });

  socket.on("chess:gameStart", update);
  socket.on("chess:update", update);
  socket.on("chess:error", (message) => alert(message));
  socket.on("chess:gameEnd", (result) => {
    game.classList.remove("active");
    showResult(result);
  });

  function showResult(result) {
    resultScreen.hidden = false;
    const cancelled = result.winner === "Partie annulée !";
    resultMessage.textContent = cancelled
      ? `${result.winner} ${result.reason || ""}`
      : result.draw
        ? "Match nul !"
        : `${result.winner} a gagné !${result.reason ? ` (${result.reason})` : ""}`;
    resultReward.textContent = result.gained
      ? `Gain : +${Number(result.gained).toLocaleString("fr-FR")} FCO`
      : "Aucun gain pour cette partie.";
    whiteClock.textContent = "10:00";
    blackClock.textContent = "10:00";
    whiteClockBox.classList.remove("active");
    blackClockBox.classList.remove("active");
    root.querySelector(".chess-clocks").style.display = "none";
    status.textContent = "";
    status.style.display = "none";
  }

  function showLobby() {
    resultScreen.hidden = true;
    game.classList.remove("active");
    lobby.style.display = "block";
    state = null;
    selected = null;
    renderedFen = null;
    pendingPromotion = null;
    promotionDialog.hidden = true;
    whiteClock.textContent = "10:00";
    blackClock.textContent = "10:00";
    whiteClockBox.classList.remove("active");
    blackClockBox.classList.remove("active");
    root.querySelector(".chess-clocks").style.display = "none";
    status.textContent = "";
    status.style.display = "none";
    socket.emit("chess:getState");
  }

  function update(nextState) {
    const boardChanged = renderedFen !== nextState.fen;
    state = nextState;
    if (boardChanged) {
      selected = null;
      pendingPromotion = null;
      promotionDialog.hidden = true;
    }
    lobby.style.display = "none";
    game.classList.add("active");
    resultScreen.hidden = true;
    const isBotGame = Boolean(nextState.vsBot);
    root.querySelector(".chess-clocks").style.display = isBotGame
      ? "none"
      : "flex";
    quit.style.display =
      isBotGame && !nextState.winner && !nextState.draw ? "block" : "none";
    status.style.display = "block";
    spec.style.display = nextState.estSpec ? "block" : "none";
    status.textContent = nextState.pausedBy
      ? `Partie en pause : reconnexion de ${nextState.pausedBy} (15 s)`
      : nextState.winner
        ? `${nextState.winner} a gagné`
        : nextState.draw
          ? "Match nul"
          : isBotGame
            ? nextState.estSpec
              ? "Homme contre machine."
              : nextState.estMonTour
                ? "À toi de jouer"
                : "Le bot réfléchit..."
            : nextState.estMonTour
              ? "À toi de jouer"
              : `Tour de ${nextState.currentPlayer}`;
    whiteClock.textContent = isBotGame ? "∞" : formatClock(nextState.clocks?.w);
    blackClock.textContent = isBotGame ? "∞" : formatClock(nextState.clocks?.b);
    whiteClockBox.classList.toggle(
      "active",
      nextState.turn === "w" &&
        !nextState.winner &&
        !nextState.draw &&
        !nextState.pausedBy,
    );
    blackClockBox.classList.toggle(
      "active",
      nextState.turn === "b" &&
        !nextState.winner &&
        !nextState.draw &&
        !nextState.pausedBy,
    );
    renderCaptured(capturedWhite, nextState.captured?.w, "white");
    renderCaptured(capturedBlack, nextState.captured?.b, "black");
    lastMove.textContent = nextState.lastMove
      ? `Dernier coup : ${nextState.lastMove.san} (${nextState.lastMove.from} → ${nextState.lastMove.to})`
      : "Aucun coup joué";

    const isBlack = nextState.myColor === "b";
    const rowIndices = isBlack
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];
    const colIndices = isBlack
      ? [7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 5, 6, 7];

    if (boardChanged) {
      board.innerHTML = "";
      rowIndices.forEach((rowIndex) => {
        colIndices.forEach((colIndex) => {
          const piece = nextState.board[rowIndex][colIndex];
          const cell = document.createElement("button");
          cell.className = `chess-cell ${(rowIndex + colIndex) % 2 ? "dark" : "light"}`;
          cell.dataset.square = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;
          if (cell.dataset.square === nextState.lastMove?.from) {
            cell.classList.add("last-move-from");
          }
          if (cell.dataset.square === nextState.lastMove?.to) {
            cell.classList.add("last-move-to");
          }
          if (piece) {
            const sprite = document.createElement("span");
            sprite.className = `chess-piece ${piece.color === "b" ? "black" : "white"} piece-${piece.type}`;
            const canDrag = Boolean(
              nextState.estMonTour &&
              piece.color === nextState.myColor &&
              nextState.legalMoves?.[cell.dataset.square]?.length,
            );
            sprite.draggable = canDrag;
            if (canDrag) {
              sprite.addEventListener("dragstart", (event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", cell.dataset.square);
                selectCell(cell.dataset.square);
                cell.classList.add("dragging");
              });
              sprite.addEventListener("dragend", () => {
                cell.classList.remove("dragging");
              });
            }
            cell.appendChild(sprite);
          }
          cell.addEventListener("dragover", (event) => {
            if (
              selected &&
              state.legalMoves?.[selected]?.some(
                (move) => move.to === cell.dataset.square,
              )
            ) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          });
          cell.addEventListener("drop", (event) => {
            event.preventDefault();
            const from = event.dataTransfer.getData("text/plain") || selected;
            const move = state.legalMoves?.[from]?.find(
              (candidate) => candidate.to === cell.dataset.square,
            );
            if (!move) return;
            submitMove(from, cell.dataset.square);
          });
          cell.addEventListener("click", () => selectCell(cell.dataset.square));
          board.appendChild(cell);
        });
      });
      renderedFen = nextState.fen;
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    }
  }

  function selectCell(square) {
    if (
      !state ||
      state.estSpec ||
      !state.estMonTour ||
      state.pausedBy ||
      state.winner ||
      state.draw
    )
      return;
    if (!selected) {
      if (!state.legalMoves?.[square]?.length) return;
      selected = square;
      root
        .querySelector(`[data-square="${square}"]`)
        ?.classList.add("selected");
      state.legalMoves[square].forEach((move) => {
        root
          .querySelector(`[data-square="${move.to}"]`)
          ?.classList.add(move.capture ? "preview-capture" : "preview-move");
      });
      return;
    }

    const move = state.legalMoves[selected]?.find(
      (candidate) => candidate.to === square,
    );
    if (move) {
      submitMove(selected, square);
      return;
    }

    clearSelection();
    if (state.legalMoves?.[square]?.length) selectCell(square);
  }

  function clearSelection() {
    root
      .querySelectorAll(
        ".chess-cell.selected, .chess-cell.preview-move, .chess-cell.preview-capture",
      )
      .forEach((cell) =>
        cell.classList.remove("selected", "preview-move", "preview-capture"),
      );
    selected = null;
  }

  function submitMove(from, to) {
    const moves = state?.legalMoves?.[from]?.filter(
      (candidate) => candidate.to === to,
    );
    if (!moves?.length) return;
    const promotionOptions = moves
      .map((candidate) => candidate.promotion)
      .filter(Boolean);
    if (promotionOptions.length) {
      pendingPromotion = {
        from,
        to,
        options: new Set(promotionOptions),
      };
      root
        .querySelectorAll(".chess-promotion-options button")
        .forEach((button) => {
          button.hidden = !pendingPromotion.options.has(button.dataset.piece);
        });
      promotionDialog.hidden = false;
      return;
    }
    socket.emit("chess:play", { from, to });
    clearSelection();
  }

  function formatClock(milliseconds = 0) {
    const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function renderCaptured(container, pieces = [], color) {
    container.replaceChildren();
    pieces.forEach((type) => {
      const piece = document.createElement("span");
      piece.className = `chess-captured-piece chess-piece ${color} piece-${type}`;
      piece.setAttribute("aria-label", type);
      container.appendChild(piece);
    });
  }
}
