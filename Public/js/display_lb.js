function showLeaderboard(name) {
  document.querySelectorAll("#stage4 .leaderboard-card").forEach((card) => {
    card.style.display = "none";
  });

  const idMap = {
    clicker: "#clicker-leaderboard",
    dino: "#dino-leaderboard",
    flappy: "#flappy-leaderboard",
    uno: "#uno-leaderboard",
    p4: "#p4-leaderboard",
    blockblast: "#blockblast-leaderboard",
    snake: "#snake-leaderboard",
    motus: "#motus-leaderboard",
    2048: "#leaderboard-2048",
    mash: "#mash-leaderboard",
    blackjack: "#blackjack-leaderboard",
    coinflip: "#coinflip-leaderboard",
  };

  const table = document.querySelector(idMap[name]);
  if (table) {
    const card = table.closest(".leaderboard-card");
    card.style.display = "block";
  }

  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.classList.remove("active");
  });

  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    if (btn.dataset.board === name) {
      btn.classList.add("active");
    }
  });

  localStorage.setItem("activeLeaderboard", name);
}

document.addEventListener("DOMContentLoaded", () => {
  const savedLeaderboard =
    localStorage.getItem("activeLeaderboard") || "clicker";

  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.addEventListener("click", () => {
      showLeaderboard(btn.dataset.board);
    });
  });

  showLeaderboard(savedLeaderboard);
});
