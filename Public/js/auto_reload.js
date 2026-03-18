document.addEventListener("DOMContentLoaded", () => {
  let reloadScheduled = false;

  if (!window.__pdeSimpleCursorBootstrapped) {
    window.__pdeSimpleCursorBootstrapped = true;

    if (typeof window.initSimpleCursor === "function") {
      window.initSimpleCursor();
    } else {
      const cursorScript = document.createElement("script");
      cursorScript.src = "/js/custom_cursor.js";
      cursorScript.defer = true;
      document.head.appendChild(cursorScript);
    }
  }

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
        if (reloadScheduled) return;
        const scope = String(data?.scope || "public").toLowerCase();
        if (scope !== "public") return;
        reloadScheduled = true;
        // Tout changement dans Public force un reload complet pour rester coherent.
        window.location.reload();
      });
    }
  }
});
