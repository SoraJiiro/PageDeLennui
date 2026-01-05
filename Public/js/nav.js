document.addEventListener("DOMContentLoaded", () => {
  let showNotification = null;

  function showNavNotification(text, duration = 4000) {
    const notif = document.createElement("div");
    notif.textContent = text;
    Object.assign(notif.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      background: "var(--primary-color, #0f0)",
      opacity: "0.95",
      color: "#000",
      padding: "12px 18px",
      fontWeight: "700",
      zIndex: "9999",
      border: "2px solid var(--primary-color, #0f0)",
      boxShadow: "0 0 0 2px #000 inset",
      animation: "slideIn 0.25s ease-out",
      minWidth: "200px",
      textAlign: "center",
    });
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), duration);
  }

  const surveysLink = document.querySelector('a[href="sondages.html"]');

  let socket = window.socket; // Si défini globalement
  if (!socket && typeof io !== "undefined") {
    socket = io();
    window.socket = socket; // Partager
  }

  if (socket) {
    async function checkSurveys() {
      if (!surveysLink) return;
      try {
        const res = await fetch("/api/surveys/list");
        if (res.ok) {
          const surveys = await res.json();
          const seenIds = JSON.parse(
            localStorage.getItem("seenSurveys") || "[]"
          );
          const count = surveys.filter(
            (s) => s.status === "active" && !seenIds.includes(s.id)
          ).length;

          let badge = surveysLink.querySelector(".notification-badge");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "notification-badge";
            surveysLink.appendChild(badge);
          }

          if (count > 0) {
            badge.textContent = count;
            badge.style.display = "inline-block";
          } else {
            badge.style.display = "none";
          }
        }
      } catch (e) {
        console.error("Badge check error", e);
      }
    }

    checkSurveys();

    socket.on("survey:new", () => {
      console.log("Event survey:new reçu !");
      showNavNotification("Nouveau sondage disponible !");
      checkSurveys();
    });

    socket.on("survey:closed", () => {
      showNavNotification("Un sondage est terminé !");
      checkSurveys();
    });
  }

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
