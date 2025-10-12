export function initDinoLeaderboard(socket) {
  const leaderboard = document.querySelector("#dino-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("dino:leaderboard", (items) => {
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
