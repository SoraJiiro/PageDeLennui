export function initMashLeaderboard(socket) {
  const leaderboardBody = document.querySelector("#mash-leaderboard tbody");
  if (!leaderboardBody) return;

  socket.on("mash:leaderboard", (data) => {
    leaderboardBody.innerHTML = "";
    if (!data || !Array.isArray(data)) return;

    data.forEach((entry, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${entry.pseudo}</td>
        <td>${Number(entry.wins)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
      `;
      leaderboardBody.appendChild(tr);
    });
  });
}
