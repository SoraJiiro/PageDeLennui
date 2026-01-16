document.addEventListener("DOMContentLoaded", () => {
  if (typeof io !== "undefined") {
    let socketInstance = null;

    if (typeof socket !== "undefined" && socket && socket.on) {
      socketInstance = socket;
    } else if (window.socket && window.socket.on) {
      socketInstance = window.socket;
    } else {
      socketInstance = io();
    }

    if (socketInstance) {
      socketInstance.on("system:redirect", (payload) => {
        const url = typeof payload === "string" ? payload : payload?.url;
        if (!url) return;
        if (window.location.pathname === url) return;
        window.location.href = url;
      });

      socketInstance.on("reload", (data) => {
        const file = data?.file || "";
        // Recharger seulement les CSS/JS sans reset de socket
        if (file.match(/\.css$/i)) {
          // Recharger les CSS
          document
            .querySelectorAll('link[rel="stylesheet"]')
            .forEach((link) => {
              const href = link.href.split("?")[0];
              link.href = href + "?v=" + Date.now();
            });
        } else if (file.match(/\.js$/i)) {
          // Pour les JS, reload complet nécessaire
          window.location.reload();
        } else if (file.match(/\.html$/i)) {
          // Pour les HTML, reload complet
          window.location.reload();
        } else {
          // Fallback
          window.location.reload();
        }
      });
    }
  }
});
