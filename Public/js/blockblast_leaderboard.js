export function initBlockBlastLeaderboard(socket) {
  const leaderboard = document.querySelector("#blockblast-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("blockblast:leaderboard", (items) => {
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
