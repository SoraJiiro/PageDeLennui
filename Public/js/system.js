import { showNotif } from "./util.js";

export function initSystem(socket, rulesAccepted) {
  socket.on("system:notification", (data) => {
    showNotif(data.message, data.duration || 8000, data.withCountdown || false);
  });

  socket.on("system:redirect", (url) => {
    window.location.href = url;
  });

  initRules(socket, rulesAccepted);
}

function initRules(socket, rulesAccepted) {
  const rulesOverlay = document.getElementById("ruleStage");
  const acceptBtn = document.getElementById("acceptRulesBtn");
  const sidebarToggle = document.getElementById("sidebar-toggle");

  if (!rulesOverlay || !acceptBtn) return;

  // Sync localStorage with server state
  if (rulesAccepted) {
    localStorage.setItem("rulesAccepted", "true");
  } else {
    localStorage.removeItem("rulesAccepted");
  }

  if (rulesAccepted) {
    rulesOverlay.style.display = "none";
  } else {
    rulesOverlay.style.display = "flex";
    // Disable sidebar toggle while rules are shown
    if (sidebarToggle) sidebarToggle.style.pointerEvents = "none";
    document.body.style.overflow = "hidden"; // Prevent scrolling
  }

  acceptBtn.addEventListener("click", () => {
    socket.emit("system:acceptRules");
    localStorage.setItem("rulesAccepted", "true");
    rulesOverlay.style.display = "none";
    if (sidebarToggle) sidebarToggle.style.pointerEvents = "auto";
    document.body.style.overflow = ""; // Restore scrolling
    showNotif("Règlement accepté. Bon jeu !", 3000);
  });
}
