export function initSnakeLeaderboard(socket) {
  const tbody = document.querySelector("#snake-leaderboard tbody");
  if (!tbody) return;

  socket.on("snake:leaderboard", (data) => {
    if (!Array.isArray(data)) return;

    tbody.innerHTML = "";
    data.forEach((item, index) => {
      const tr = document.createElement("tr");

      const tdRank = document.createElement("td");
      tdRank.textContent = index + 1;

      const tdPseudo = document.createElement("td");
      tdPseudo.textContent = item.pseudo;

      const tdScore = document.createElement("td");
      tdScore.textContent = item.score;

      const tdTime = document.createElement("td");
      if (item.timeMs) {
        const totalSeconds = Math.floor(item.timeMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
          tdTime.textContent = `${hours}:${String(minutes).padStart(
            2,
            "0"
          )}:${String(seconds).padStart(2, "0")}`;
        } else {
          tdTime.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
        }
      } else {
        tdTime.textContent = "-";
      }

      tr.appendChild(tdRank);
      tr.appendChild(tdPseudo);
      tr.appendChild(tdScore);
      tr.appendChild(tdTime);
      tbody.appendChild(tr);
    });
  });

  socket.emit("snake:requestLeaderboard");
}
