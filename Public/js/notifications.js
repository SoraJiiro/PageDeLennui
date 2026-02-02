const DEFAULT_DURATION = 4000;

function createNotificationElement(text, variant = "info") {
  const notif = document.createElement("div");
  notif.className = "pde-notification";
  if (variant && variant !== "info") {
    notif.classList.add(`pde-notification--${variant}`);
  }
  notif.textContent = text;
  return notif;
}

function displayNotification(text, options = {}) {
  const {
    duration = DEFAULT_DURATION,
    withCountdown = false,
    variant = "info",
  } = options;

  const notif = createNotificationElement(text, variant);
  document.body.appendChild(notif);

  if (withCountdown) {
    setTimeout(() => {
      let countdown = 3;
      notif.style.fontSize = "1.9rem";
      const countdownInterval = setInterval(() => {
        if (countdown > 0) {
          notif.textContent = `[${countdown}]`;
          countdown -= 1;
          return;
        }
        notif.textContent = "Fermeture...";
        notif.classList.add("pde-notification--warning");
        clearInterval(countdownInterval);
        setTimeout(() => notif.remove(), 800);
      }, 1000);
    }, duration);
    setTimeout(() => notif.remove(), duration + 4800);
    return notif;
  }

  setTimeout(() => notif.remove(), duration);
  return notif;
}

export function showNotif(text, duration = DEFAULT_DURATION, withCountdown = false) {
  return displayNotification(text, { duration, withCountdown, variant: "info" });
}

export function showStatusNotification(text, type = "info", duration = DEFAULT_DURATION) {
  const variant = type === "error" ? "error" : type === "success" ? "success" : "info";
  return displayNotification(text, { duration, variant });
}

const exported = {
  show: displayNotification,
  showNotif,
  showStatus: showStatusNotification,
};

if (typeof window !== "undefined") {
  if (!window.PDENotifications) {
    window.PDENotifications = exported;
  }
  if (!window.showNotif) {
    window.showNotif = showNotif;
  }
  if (!window.showStatusNotification) {
    window.showStatusNotification = showStatusNotification;
  }
}

export default exported;
