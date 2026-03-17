export function initAimTrainerLeaderboard(socket) {
  const tbody = document.querySelector("#aim-trainer-leaderboard tbody");
  const durationSelect = document.getElementById("aim-lb-duration-select");
  if (!tbody || !durationSelect) return;

  let latestBoards = { 15: [], 30: [], 60: [] };

  function selectedDuration() {
    const raw = String(durationSelect.value || "30");
    if (raw === "15" || raw === "30" || raw === "60") return raw;
    return "30";
  }

  function render(items) {
    const rows = Array.isArray(items) ? items : [];
    tbody.innerHTML = "";
    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${row.pseudo || ""}</td>
        <td>${Number(row.score || 0)
          .toLocaleString("fr-FR")
          .replace(/\s/g, "\u00a0")}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function requestCurrentDuration() {
    socket.emit("aim:requestLeaderboard", { duration: selectedDuration() });
  }

  socket.on("aim:leaderboard", (payload) => {
    if (Array.isArray(payload)) {
      latestBoards = { ...latestBoards, 30: payload };
      render(
        selectedDuration() === "30"
          ? payload
          : latestBoards[selectedDuration()],
      );
      return;
    }

    const boards =
      payload && typeof payload === "object" && payload.leaderboards
        ? payload.leaderboards
        : null;
    if (!boards || typeof boards !== "object") return;

    latestBoards = {
      15: Array.isArray(boards["15"]) ? boards["15"] : [],
      30: Array.isArray(boards["30"]) ? boards["30"] : [],
      60: Array.isArray(boards["60"]) ? boards["60"] : [],
    };

    render(latestBoards[selectedDuration()]);
  });

  durationSelect.addEventListener("change", () => {
    render(latestBoards[selectedDuration()]);
    requestCurrentDuration();
  });

  requestCurrentDuration();
}
