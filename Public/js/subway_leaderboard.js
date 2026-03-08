export function initSubwayLeaderboard(socket) {
  const tbody = document.querySelector("#subway-leaderboard tbody");
  if (!tbody) return;

  socket.on("subway:leaderboard", (data) => {
    if (!Array.isArray(data)) return;
    tbody.innerHTML = "";

    data.forEach((entry, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${entry.pseudo || ""}</td>
        <td>${Number(entry.score || 0)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
      `;
      tbody.appendChild(tr);
    });
  });
}
