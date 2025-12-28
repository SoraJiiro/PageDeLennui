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

  // Close sidebar with Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSidebar();
    }
  });

  // Navigation Logic
  function goTo(section) {
    const el = document.querySelector("#" + section);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      closeSidebar(); // Close sidebar after navigation on mobile
    }
  }

  // Attach event listeners to buttons
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
  };

  for (const [selector, target] of Object.entries(navButtons)) {
    const btn = document.querySelector(selector);
    if (btn) {
      btn.addEventListener("click", () => goTo(target));
    }
  }

  // Mario link
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
