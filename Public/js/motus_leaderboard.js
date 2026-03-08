export function initMotusLeaderboard(socket) {
  let cachedTotalWords = null;
  let cachedLeaderboard = [];

  function resolveTotalWords(entry) {
    const fromEntry = Number(entry && entry.totalWords);
    if (Number.isFinite(fromEntry) && fromEntry > 0) return fromEntry;
    if (Number.isFinite(cachedTotalWords) && cachedTotalWords > 0)
      return cachedTotalWords;
    return "?";
  }

  function renderLeaderboard(data) {
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

      const tries = document.createElement("td");
      tries.textContent = Number(entry.tries || 0);

      const words = document.createElement("td");
      words.textContent = Number(entry.words || 0);

      const totalWords = document.createElement("td");
      totalWords.textContent = resolveTotalWords(entry);

      row.appendChild(rank);
      row.appendChild(pseudo);
      row.appendChild(tries);
      row.appendChild(words);
      row.appendChild(totalWords);

      lbTable.appendChild(row);
    });
  }

  socket.on("motus:wordListLength", ({ length }) => {
    const n = Number(length);
    if (Number.isFinite(n) && n > 0) {
      cachedTotalWords = n;
      if (cachedLeaderboard.length > 0) {
        renderLeaderboard(cachedLeaderboard);
      }
    }
  });

  socket.on("motus:leaderboard", (data) => {
    cachedLeaderboard = Array.isArray(data) ? data : [];
    renderLeaderboard(cachedLeaderboard);
  });
}
