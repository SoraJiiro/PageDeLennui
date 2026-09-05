export function initPdeHeroLeaderboard(socket) {
  const tbody = document.querySelector("#pde-hero-leaderboard tbody");
  if (!tbody) return;

  socket.on("pdehero:leaderboard", (entries) => {
    if (!Array.isArray(entries)) return;
    tbody.innerHTML = "";
    entries.forEach((entry, index) => {
      const tr = document.createElement("tr");
      [
        index + 1,
        entry.pseudo || "",
        Number(entry.bestScore || 0).toLocaleString("fr-FR"),
        `${Number(entry.longestGame || 0)}s`,
      ].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
}
