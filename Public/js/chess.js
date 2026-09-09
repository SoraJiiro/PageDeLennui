export function initChess(socket) {
  const root = document.querySelector("#stage23");
  if (!root) return;
  const lobby = root.querySelector(".chess-lobby");
  const game = root.querySelector(".chess-game");
  const board = root.querySelector(".chess-board");
  const status = root.querySelector(".chess-status");
  const players = root.querySelector(".chess-players");
  const spectators = root.querySelector(".chess-spectators");
  const join = root.querySelector(".chess-join");
  const leave = root.querySelector(".chess-leave");
  const start = root.querySelector(".chess-start");
  const spec = root.querySelector(".chess-spectator");
  let state = null;
  let selected = null;

  socket.emit("chess:getState");
  root.querySelector(".chess-join")?.addEventListener("click", () => socket.emit("chess:join"));
  leave?.addEventListener("click", () => socket.emit("chess:leave"));
  start?.addEventListener("click", () => socket.emit("chess:start"));

  socket.on("chess:lobby", (data) => {
    players.innerHTML = `<p>Joueurs (${data.joueurs.length}/2)</p>${data.joueurs.map((name) => `<div>${name}</div>`).join("") || "<div>Aucun joueur</div>"}`;
    spectators.textContent = data.spectators?.length ? `Spectateurs : ${data.spectators.join(", ")}` : "";
    join.style.display = data.estAuLobby ? "none" : "inline-block";
    leave.style.display = data.estAuLobby ? "inline-block" : "none";
    start.style.display = data.estAuLobby ? "inline-block" : "none";
    start.disabled = !data.canStart;
    start.textContent = data.canStart ? "Démarrer la partie" : `En attente (${data.joueurs.length}/2)`;
  });

  socket.on("chess:gameStart", update);
  socket.on("chess:update", update);
  socket.on("chess:error", (message) => alert(message));
  socket.on("chess:gameEnd", (result) => {
    alert(result.winner === "Partie annulée !" ? `${result.winner} ${result.reason}` : result.draw ? "Match nul !" : `${result.winner} a gagné !`);
    game.classList.remove("active");
    lobby.style.display = "block";
    socket.emit("chess:getState");
  });

  function update(nextState) {
    state = nextState;
    lobby.style.display = "none";
    game.classList.add("active");
    spec.style.display = nextState.estSpec ? "block" : "none";
    status.textContent = nextState.winner ? `${nextState.winner} a gagné` : nextState.draw ? "Match nul" : nextState.estMonTour ? "À toi de jouer" : `Tour de ${nextState.currentPlayer}`;
    board.innerHTML = "";
    nextState.board.forEach((row, rowIndex) => row.forEach((piece, colIndex) => {
      const cell = document.createElement("button");
      cell.className = `chess-cell ${(rowIndex + colIndex) % 2 ? "dark" : "light"}`;
      cell.dataset.square = `${String.fromCharCode(97 + colIndex)}${8 - rowIndex}`;
      if (piece) {
        const sprite = document.createElement("span");
        sprite.className = `chess-piece ${piece.color === "b" ? "black" : "white"} piece-${piece.type}`;
        cell.appendChild(sprite);
      }
      cell.addEventListener("click", () => selectCell(cell.dataset.square));
      board.appendChild(cell);
    }));
  }

  function selectCell(square) {
    if (!state || state.estSpec || !state.estMonTour || state.winner || state.draw) return;
    if (!selected) {
      selected = square;
      root.querySelector(`[data-square="${square}"]`)?.classList.add("selected");
      return;
    }
    const promotion = "q";
    socket.emit("chess:play", { from: selected, to: square, promotion });
    selected = null;
  }
}