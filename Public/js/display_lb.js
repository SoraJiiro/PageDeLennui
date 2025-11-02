function showLeaderboard(name) {
  document.querySelectorAll("#stage4 .leaderboard-card").forEach((card) => {
    card.style.display = "none";
    card.classList.remove("fade-in");
  });

  const idMap = {
    clicker: "#clicker-leaderboard",
    dino: "#dino-leaderboard",
    flappy: "#flappy-leaderboard",
    uno: "#uno-leaderboard",
    pictionary: "#pictionary-leaderboard",
    p4: "#p4-leaderboard",
  };

  const table = document.querySelector(idMap[name]);
  if (table) {
    const card = table.closest(".leaderboard-card");
    card.style.display = "block";
    card.classList.add("fade-in");
  }

  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.board === name);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.addEventListener("click", () => {
      showLeaderboard(btn.dataset.board);
    });
  });

  showLeaderboard("clicker"); // LB Clicker display par défaut
});
