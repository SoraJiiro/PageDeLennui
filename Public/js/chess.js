export function initChess(socket) {
  const root = document.querySelector("#stage23");
  if (!root) return;
  const lobby = root.querySelector(".chess-lobby");
  const game = root.querySelector(".chess-game");
  const board = root.querySelector(".chess-board");
  const status = root.querySelector(".chess-status");
  const whiteClock = root.querySelector(".chess-clock-white time");
  const blackClock = root.querySelector(".chess-clock-black time");
  const whiteClockBox = root.querySelector(".chess-clock-white");
  const blackClockBox = root.querySelector(".chess-clock-black");
  const players = root.querySelector(".chess-players");
  const spectators = root.querySelector(".chess-spectators");
  const join = root.querySelector(".chess-join");
  const leave = root.querySelector(".chess-leave");
  const start = root.querySelector(".chess-start");
  const spec = root.querySelector(".chess-spectator");
  const resultScreen = root.querySelector(".chess-result");
  const resultMessage = root.querySelector(".chess-result-message");
  const resultReward = root.querySelector(".chess-result-reward");
  const resultBack = root.querySelector(".chess-result-back");
  let state = null;
  let selected = null;
  let renderedFen = null;

  socket.emit("chess:getState");
  root
    .querySelector(".chess-join")
    ?.addEventListener("click", () => socket.emit("chess:join"));
  leave?.addEventListener("click", () => socket.emit("chess:leave"));
  start?.addEventListener("click", () => socket.emit("chess:start"));
  resultBack?.addEventListener("click", showLobby);

  socket.on("chess:lobby", (data) => {
    players.innerHTML = `<p>Joueurs (${data.joueurs.length}/2)</p>${data.joueurs.map((name) => `<div>${name}</div>`).join("") || "<div>Aucun joueur</div>"}`;
    spectators.textContent = data.spectators?.length
      ? `Spectateurs : ${data.spectators.join(", ")}`
      : "";
    join.style.display = data.estAuLobby ? "none" : "inline-block";
    leave.style.display = data.estAuLobby ? "inline-block" : "none";
    start.style.display = data.estAuLobby ? "inline-block" : "none";
    start.disabled = !data.canStart;
    start.textContent = data.canStart
      ? "Démarrer la partie"
      : `En attente (${data.joueurs.length}/2)`;
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
    if (boardChanged) selected = null;
    lobby.style.display = "none";
    game.classList.add("active");
    resultScreen.hidden = true;
    root.querySelector(".chess-clocks").style.display = "flex";
    status.style.display = "block";
    spec.style.display = nextState.estSpec ? "block" : "none";
    status.textContent = nextState.winner
      ? `${nextState.winner} a gagné`
      : nextState.draw
        ? "Match nul"
        : nextState.estMonTour
          ? "À toi de jouer"
          : `Tour de ${nextState.currentPlayer}`;
    whiteClock.textContent = formatClock(nextState.clocks?.w);
    blackClock.textContent = formatClock(nextState.clocks?.b);
    whiteClockBox.classList.toggle(
      "active",
      nextState.turn === "w" && !nextState.winner && !nextState.draw,
    );
    blackClockBox.classList.toggle(
      "active",
      nextState.turn === "b" && !nextState.winner && !nextState.draw,
    );

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
            socket.emit("chess:play", {
              from,
              to: cell.dataset.square,
              promotion: "q",
            });
            clearSelection();
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
      socket.emit("chess:play", { from: selected, to: square, promotion: "q" });
      selected = null;
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

  function formatClock(milliseconds = 0) {
    const totalSeconds = Math.max(0, Math.ceil(Number(milliseconds) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
}
