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

  const READ_TIMER_SECONDS = 30; // 30 secondes
  let countdownInterval = null;

  function formatCountdown(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function clearCountdown() {
    try {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    } catch {}
  }

  function startReadTimer() {
    clearCountdown();

    let remaining = READ_TIMER_SECONDS;
    acceptBtn.disabled = true;
    acceptBtn.innerHTML =
      `<i class="fa-solid fa-hourglass-half"></i> ` +
      `Lecture obligatoire (${formatCountdown(remaining)})`;

    countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        acceptBtn.disabled = false;
        acceptBtn.innerHTML =
          "<i class=\"fa-solid fa-check\"></i> J'ai lu et j'accepte le règlement";
        return;
      }
      acceptBtn.innerHTML =
        `<i class="fa-solid fa-hourglass-half"></i> ` +
        `Lecture obligatoire (${formatCountdown(remaining)})`;
    }, 1000);
  }

  // Synchroniser localStorage avec l'état du serveur
  if (rulesAccepted) {
    localStorage.setItem("rulesAccepted", "true");
  } else {
    localStorage.removeItem("rulesAccepted");
  }

  if (rulesAccepted) {
    rulesOverlay.style.display = "none";
    acceptBtn.disabled = false;
    acceptBtn.innerHTML =
      "<i class=\"fa-solid fa-check\"></i> J'ai lu et j'accepte le règlement";
    clearCountdown();
  } else {
    rulesOverlay.style.display = "flex";
    // Désactiver le basculement de la barre latérale pendant que les règles sont affichées
    if (sidebarToggle) sidebarToggle.style.pointerEvents = "none";
    document.body.style.overflow = "hidden"; // Empêcher le défilement

    // Lecture obligatoire
    startReadTimer();
  }

  acceptBtn.addEventListener("click", () => {
    if (acceptBtn.disabled) return;
    socket.emit("system:acceptRules");
    localStorage.setItem("rulesAccepted", "true");
    rulesOverlay.style.display = "none";
    if (sidebarToggle) sidebarToggle.style.pointerEvents = "auto";
    document.body.style.overflow = ""; // Restaurer le défilement
    clearCountdown();
    showNotif("Règlement accepté. Bon jeu !", 3000);
  });
}
