export function initChessLeaderboard(socket) {
  const body = document.querySelector("#chess-leaderboard tbody");
  if (!body) return;
  socket.on("chess:leaderboard", (items) => {
    body.innerHTML = items
      .map(
        (row, index) =>
          `<tr><td>${index + 1}</td><td>${row.pseudo}</td><td>${row.elo}</td><td>${row.games}</td><td>${row.wins}</td></tr>`,
      )
      .join("");
  });
}
