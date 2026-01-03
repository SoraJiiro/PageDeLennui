document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  function openSidebar() {
    sidebar.classList.add("active");
    sidebarOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    sidebar.classList.remove("active");
    sidebarOverlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", openSidebar);
  }

  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  // Fermer la barre latérale avec Échap
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSidebar();
    }
  });

  // Logique de navigation
  function goTo(section) {
    const el = document.querySelector("#" + section);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      closeSidebar(); // Fermer la barre latérale après la navigation sur mobile
    }
  }

  // Attacher les écouteurs d'événements aux boutons
  const navButtons = {
    ".sec1": "stage1",
    ".sec2": "stage2",
    ".sec3": "stage3",
    ".sec4": "stage4",
    ".sec5": "stage5",
    ".sec6": "stage6",
    ".sec7": "stage7",
    ".sec8": "stage8",
    ".sec9": "stage9",
    ".sec10": "stage10",
    ".sec11": "stage11",
    ".sec12": "stage12",
    ".sec13": "stage13",
    ".sec14": "stage14",
  };

  for (const [selector, target] of Object.entries(navButtons)) {
    const btn = document.querySelector(selector);
    if (btn) {
      btn.addEventListener("click", () => goTo(target));
    }
  }

  // Lien Mario
  const mario = document.querySelector(".mario");
  if (mario) {
    mario.addEventListener("click", () => {
      window.open(
        "https://supermario-game.com/mario-game/mario.html",
        "_blank"
      );
      closeSidebar();
    });
  }
});
