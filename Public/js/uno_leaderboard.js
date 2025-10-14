export function initUnoLeaderboard(socket) {
  const leaderboard = document.querySelector("#uno-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("uno:leaderboard", (items) => {
    leaderboard.innerHTML = "";
    items.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${row.pseudo}</td>
        <td>${row.wins}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}
