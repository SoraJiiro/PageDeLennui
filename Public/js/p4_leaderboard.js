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
        <td>${row.wins}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}
