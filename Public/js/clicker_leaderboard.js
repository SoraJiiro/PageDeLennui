// ==================== CLICKER LEADERBOARD ====================
export function initClickerLeaderboard(socket) {
  const leaderboardBody = document.querySelector("#clicker-leaderboard tbody");

  socket.on("clicker:leaderboard", (items) => {
    if (!leaderboardBody) return;
    leaderboardBody.innerHTML = "";

    items.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${row.username}</td>
      <td>${row.score}</td>
    `;
      leaderboardBody.appendChild(tr);
    });
  });
}
