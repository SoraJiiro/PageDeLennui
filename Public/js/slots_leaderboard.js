export function initSlotsLeaderboard(socket) {
  const tbody = document.querySelector("#slots-leaderboard tbody");
  if (!tbody) return;

  socket.on("slots:leaderboard", (data) => {
    if (!Array.isArray(data)) return;
    tbody.innerHTML = "";

    data.forEach((entry, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${entry.pseudo || ""}</td>
        <td>${Number(entry.gamesPlayed || 0)}</td>
        <td>${Number(entry.wins || 0)} / ${Number(entry.losses || 0)}</td>
        <td>${Number(entry.biggestBet || 0)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
        <td>${Number(entry.biggestWin || 0)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
      `;
      tbody.appendChild(tr);
    });
  });
}
