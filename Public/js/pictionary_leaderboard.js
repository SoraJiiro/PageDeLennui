export function initPictionaryLeaderboard(socket) {
  const leaderboard = document.querySelector("#pictionary-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("pictionary:leaderboard", (items) => {
    leaderboard.innerHTML = "";
    items.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${row.pseudo}</td>
        <td>${row.points}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}
