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
        <td>${Number(row.wins)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}
