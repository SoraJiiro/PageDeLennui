const COLORS = [
  "#FFFFFF",
  "#000000",
  "#FF0000",
  "#0000FF",
  "#FFFF00",
  "#008000",
  "#FFA500",
  "#F5F5DC",
  "#800080",
  "#A52A2A",
  "#FFC0CB",
  "#808080",
  "#00FFFF",
  "#7FFF00",
  "#FF00FF",
  "#1E90FF",
];

export function initPixelwarLeaderboard(socket) {
  const leaderboard = document.querySelector("#pixelwar-leaderboard tbody");
  if (!leaderboard) return;

  socket.on("pixelwar:leaderboard", (items) => {
    leaderboard.innerHTML = "";

    if (!items || items.length === 0) {
      const row = leaderboard.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 5;
      cell.textContent = "Aucune donnée disponible";
      cell.style.textAlign = "center";
      return;
    }

    items.forEach((entry, index) => {
      const row = leaderboard.insertRow();
      const rankCell = row.insertCell(0);
      const pseudoCell = row.insertCell(1);
      const pixelsCell = row.insertCell(2);
      const colorCell = row.insertCell(3);
      const overriddenCell = row.insertCell(4);

      rankCell.textContent = index + 1;
      pseudoCell.textContent = entry.pseudo;
      pixelsCell.textContent = entry.pixelsPlaced || 0;

      // Afficher la couleur favorite avec un carré coloré
      if (
        entry.favColor !== undefined &&
        entry.favColor >= 0 &&
        entry.favColor < COLORS.length
      ) {
        const colorHex = COLORS[entry.favColor];
        colorCell.innerHTML = `<div style="width:20px;height:20px;background:${colorHex};border:1px solid #fff;margin:auto;"></div>`;
      } else {
        colorCell.textContent = "-";
      }

      overriddenCell.textContent = entry.pixelsOverridden || 0;
    });
  });

  // Demander le leaderboard au serveur
  socket.emit("pixelwar:get_leaderboard");
}
