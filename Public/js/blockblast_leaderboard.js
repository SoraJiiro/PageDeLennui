export function initBlockBlastLeaderboard(socket) {
  const leaderboard = document.querySelector("#blockblast-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("blockblast:leaderboard", (items) => {
    leaderboard.innerHTML = "";
    items.forEach((row, i) => {
      const tr = document.createElement("tr");
      const t = typeof row.timeMs === "number" ? row.timeMs : null;
      const timeTxt = t == null ? "—" : formatTime(t);
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${row.pseudo}</td>
        <td>${Number(row.score)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
        <td>${timeTxt}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
