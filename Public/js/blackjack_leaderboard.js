export function initBlackjackLeaderboard(socket) {
  const table = document.querySelector("#blackjack-leaderboard tbody");

  socket.on("blackjack:leaderboard", (data) => {
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

      // Mains
      const tdHands = document.createElement("td");
      tdHands.textContent = entry.handsPlayed;

      // W/L
      const tdWL = document.createElement("td");
      tdWL.textContent = `${entry.handsWon} / ${entry.handsLost}`;

      // Max Bet
      const tdMax = document.createElement("td");
      tdMax.textContent = Number(entry.biggestBet || 0)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0");

      // Double / BJ
      const tdDb = document.createElement("td");
      tdDb.textContent = entry.doubles;

      const tdBj = document.createElement("td");
      tdBj.textContent = entry.bjs;

      tr.appendChild(tdRank);
      tr.appendChild(tdPseudo);
      tr.appendChild(tdHands);
      tr.appendChild(tdWL);
      tr.appendChild(tdMax);
      tr.appendChild(tdDb);
      tr.appendChild(tdBj);

      table.appendChild(tr);
    });
  });
}
