export function initCoinflipLeaderboard(socket) {
  const table = document.querySelector("#coinflip-leaderboard tbody");

  socket.on("coinflip:leaderboard", (data) => {
    if (!table) return;
    table.innerHTML = "";

    data.forEach((entry, index) => {
      const tr = document.createElement("tr");
      // Rang
      const tdRank = document.createElement("td");
      tdRank.textContent = index + 1;

      // Pseudo
      const tdPseudo = document.createElement("td");
      tdPseudo.textContent = entry.pseudo;

      // Parties
      const tdGames = document.createElement("td");
      tdGames.textContent = entry.gamesPlayed;

      // W/L
      const tdWL = document.createElement("td");
      tdWL.textContent = `${entry.wins} / ${entry.losses}`;

      // Max Bet
      const tdMaxBet = document.createElement("td");
      tdMaxBet.textContent = Number(entry.biggestBet || 0)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0");

      // Max Loss
      const tdMaxLoss = document.createElement("td");
      tdMaxLoss.textContent = Number(entry.biggestLoss || 0)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0");

      // All-ins
      const tdAllIns = document.createElement("td");
      tdAllIns.textContent = entry.allIns;

      tr.appendChild(tdRank);
      tr.appendChild(tdPseudo);
      tr.appendChild(tdGames);
      tr.appendChild(tdWL);
      tr.appendChild(tdMaxBet);
      tr.appendChild(tdMaxLoss);
      tr.appendChild(tdAllIns);

      if (index === 0) tr.classList.add("rank-1");
      if (index === 1) tr.classList.add("rank-2");
      if (index === 2) tr.classList.add("rank-3");

      table.appendChild(tr);
    });
  });
}
