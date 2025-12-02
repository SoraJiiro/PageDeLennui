export function initP4Leaderboard(socket) {
  const leaderboard = document.querySelector("#p4-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("p4:leaderboard", (items) => {
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
