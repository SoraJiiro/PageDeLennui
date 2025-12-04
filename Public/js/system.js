import { showNotif } from "./util.js";

export function initSystem(socket) {
  socket.on("system:notification", (data) => {
    showNotif(data.message, data.duration || 8000, data.withCountdown || false);
  });

  socket.on("system:redirect", (url) => {
    window.location.href = url;
  });
}
