export function initEconomieLeaderboard(socket) {
  const leaderboardBody = document.querySelector("#economie-leaderboard tbody");
  const clicksCpsBody = document.querySelector("#clicks-cps-leaderboard tbody");

  socket.on("economie:leaderboard", (items) => {
    if (!leaderboardBody) return;
    leaderboardBody.innerHTML = "";
    if (clicksCpsBody) clicksCpsBody.innerHTML = "";

    items.forEach((row, i) => {
      const tr = document.createElement("tr");
      const trClicksCps = document.createElement("tr");
      const clicks = Number(row.score || 0)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0");
      const peakCps = Number(row.peakHumanCps || 0)
        .toLocaleString("fr-FR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 1,
        })
        .replace(/\s/g, "\u00a0");
      const money = Number(row.money || 0)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0");
      const tokens = Number(row.tokens || 0)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0");

      tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${row.pseudo}</td>
      <td>${clicks}</td>
      <td>${money}</td>
      <td>${tokens}</td>
    `;
      leaderboardBody.appendChild(tr);

      if (clicksCpsBody) {
        trClicksCps.innerHTML = `
      <td>${i + 1}</td>
      <td>${row.pseudo}</td>
      <td>${clicks}</td>
      <td>${peakCps}</td>
    `;
        clicksCpsBody.appendChild(trClicksCps);
      }
    });
  });
}
