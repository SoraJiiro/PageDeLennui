export function initMotusLeaderboard(socket) {
  socket.on("motus:leaderboard", (data) => {
    const lbTable = document.querySelector("#motus-leaderboard tbody");
    if (!lbTable) return;

    lbTable.innerHTML = "";
    if (!data || !Array.isArray(data)) return;

    data.forEach((entry, index) => {
      const row = document.createElement("tr");

      const rank = document.createElement("td");
      rank.textContent = `${index + 1}`;

      const pseudo = document.createElement("td");
      pseudo.textContent = entry.pseudo;

      const words = document.createElement("td");
      words.textContent = entry.words;

      const tries = document.createElement("td");
      tries.textContent = entry.tries;

      row.appendChild(rank);
      row.appendChild(pseudo);
      row.appendChild(words);
      row.appendChild(tries);

      lbTable.appendChild(row);
    });
  });
}
