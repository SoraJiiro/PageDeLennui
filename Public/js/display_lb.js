function showLeaderboard(name) {
  // Masquer tous les leaderboards
  document.querySelectorAll("#stage4 .leaderboard-card").forEach((card) => {
    card.style.display = "none";
    card.classList.remove("fade-in");
  });

  // Afficher le bon leaderboard avec une petite animation
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

  // Gérer le bouton actif
  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.board === name);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Ajoute les écouteurs de clic sur les boutons
  document.querySelectorAll(".leaderboard-buttons button").forEach((btn) => {
    btn.addEventListener("click", () => {
      showLeaderboard(btn.dataset.board);
    });
  });

  // Affiche le premier leaderboard par défaut
  showLeaderboard("clicker");
});
