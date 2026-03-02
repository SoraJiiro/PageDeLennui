const DEFAULT_DURATION = 4000;
const NOTIFICATION_GAP_MS = 350;

const notificationQueue = [];
let isQueueProcessing = false;

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

function getDisplayDuration(options = {}) {
  const duration = Number(options.duration) || DEFAULT_DURATION;
  return options.withCountdown ? duration + 4800 : duration;
}

async function processNotificationQueue() {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  while (notificationQueue.length > 0) {
    const { text, options, resolve } = notificationQueue.shift();
    const notif = displayNotification(text, options);
    resolve(notif);

    const totalDuration = getDisplayDuration(options);
    await new Promise((done) =>
      setTimeout(done, totalDuration + NOTIFICATION_GAP_MS),
    );
  }

  isQueueProcessing = false;
}

function enqueueNotification(text, options = {}) {
  return new Promise((resolve) => {
    notificationQueue.push({ text, options, resolve });
    processNotificationQueue();
  });
}

export function showNotif(
  text,
  duration = DEFAULT_DURATION,
  withCountdown = false,
) {
  return enqueueNotification(text, {
    duration,
    withCountdown,
    variant: "info",
  });
}

export function showStatusNotification(
  text,
  type = "info",
  duration = DEFAULT_DURATION,
) {
  const variant =
    type === "error" ? "error" : type === "success" ? "success" : "info";
  return enqueueNotification(text, { duration, variant });
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
