export function init2048Leaderboard(socket) {
  socket.on("2048:leaderboard", (data) => {
    const lbTable = document.querySelector("#leaderboard-2048 tbody");
    if (!lbTable) return;

    lbTable.innerHTML = "";
    if (!data || !Array.isArray(data)) return;

    data.forEach((entry, index) => {
      const row = document.createElement("tr");

      const rank = document.createElement("td");
      rank.textContent = `${index + 1}`;

      const pseudo = document.createElement("td");
      pseudo.textContent = entry.pseudo;

      const score = document.createElement("td");
      score.textContent = entry.score;

      row.appendChild(rank);
      row.appendChild(pseudo);
      row.appendChild(score);

      lbTable.appendChild(row);
    });
  });

  // Demander le leaderboard au chargement
  socket.emit("2048:get_leaderboard");
}
