export function initSudokuLeaderboard(socket) {
  const tbody = document.querySelector("#sudoku-leaderboard tbody");
  if (!tbody) return;

  socket.on("sudoku:leaderboard", (data) => {
    if (!Array.isArray(data)) return;
    tbody.innerHTML = "";

    data.forEach((entry, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${entry.pseudo || ""}</td>
        <td>${Number(entry.completed || 0)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  socket.emit("sudoku:requestLeaderboard");
}
