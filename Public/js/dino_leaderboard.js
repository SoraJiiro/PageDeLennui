export function initDinoLeaderboard() {
  const socket = window.socket || io({ query: { username: window.username } });
  const leaderboard = document.querySelector("#dino-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("dino:leaderboard", (entries) => {
    leaderboard.innerHTML = "";
    entries.forEach((entry, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${entry.username}</td>
        <td>${entry.score}</td>
      `;
      leaderboard.appendChild(tr);
    });
  });
}
