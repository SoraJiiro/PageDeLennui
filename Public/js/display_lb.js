function showLeaderboard(name) {
  document.querySelectorAll("#stage4 .leaderboard-card").forEach((card) => {
    card.style.display = "none";
  });

  const idMap = {
    economie: "#economie-leaderboard",
    dino: "#dino-leaderboard",
    flappy: "#flappy-leaderboard",
    uno: "#uno-leaderboard",
    p4: "#p4-leaderboard",
    blockblast: "#blockblast-leaderboard",
    snake: "#snake-leaderboard",
    2048: "#leaderboard-2048",
    mash: "#mash-leaderboard",
    blackjack: "#blackjack-leaderboard",
    coinflip: "#coinflip-leaderboard",
    roulette: "#roulette-leaderboard",
    slots: "#slots-leaderboard",
    sudoku: "#sudoku-leaderboard",
    pixelwar: "#pixelwar-leaderboard",
    "clicks-cps": "#clicks-cps-leaderboard",
  };

  const key = idMap[name] ? name : "economie";
  const table = document.querySelector(idMap[key]);
  if (table) {
    const card = table.closest(".leaderboard-card");
    card.style.display = "block";
  }

  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.classList.remove("active");
  });

  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    if (btn.dataset.board === key) {
      btn.classList.add("active");
    }
  });

  localStorage.setItem("activeLeaderboard", key);
}

document.addEventListener("DOMContentLoaded", () => {
  const savedLeaderboard =
    localStorage.getItem("activeLeaderboard") || "economie";

  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.addEventListener("click", () => {
      showLeaderboard(btn.dataset.board);
    });
  });

  showLeaderboard(savedLeaderboard);
});
