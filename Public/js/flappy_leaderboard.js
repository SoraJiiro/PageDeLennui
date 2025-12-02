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
        <td>${Number(row.score)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}
