export function initClickerLeaderboard(socket) {
  const leaderboardBody = document.querySelector("#clicker-leaderboard tbody");

  socket.on("clicker:leaderboard", (items) => {
    if (!leaderboardBody) return;
    leaderboardBody.innerHTML = "";

    items.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${row.pseudo}</td>
      <td>${Number(row.score)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")}</td>
    `;
      leaderboardBody.appendChild(tr);
    });
  });
}
