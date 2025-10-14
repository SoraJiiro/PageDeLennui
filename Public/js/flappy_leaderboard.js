export function initFlappyLeaderboard(socket) {
  const leaderboard = document.querySelector("#flappy-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("flappy:leaderboard", (items) => {
    leaderboard.innerHTML = "";
    items.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${row.pseudo}</td>
        <td>${row.score}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}
