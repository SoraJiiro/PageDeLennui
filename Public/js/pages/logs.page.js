(async function () {
  try {
    const r = await fetch("/api/session");
    if (!r.ok) {
      window.location.href = "/login";
      return;
    }
    const { pseudo } = await r.json();
    const allowed = new Set(["Admin", "Moderateur1", "Moderateur2"]);
    if (!allowed.has(pseudo)) {
      window.location.href = "/";
      return;
    }
  } catch {
    window.location.href = "/login";
    return;
  }

  const el = {
    logs: document.getElementById("logs"),
    clear: document.getElementById("clear"),
    auto: document.getElementById("autoscroll"),
    wrap: document.getElementById("wrap"),
  };

  let autoScroll = true;
  updateAutoLabel();
  el.auto.addEventListener("click", () => {
    autoScroll = !autoScroll;
    el.auto.classList.toggle("active", autoScroll);
    if (autoScroll) scrollToBottom("auto");
    updateAutoLabel();
  });

  const activeLevels = new Set(["action", "log", "warn", "error"]);
  document.querySelectorAll(".filter").forEach((pill) => {
    pill.classList.add("active");
    pill.addEventListener("click", () => {
      const lvl = pill.dataset.lvl;
      if (activeLevels.has(lvl)) {
        activeLevels.delete(lvl);
        pill.classList.remove("active");
      } else {
        activeLevels.add(lvl);
        pill.classList.add("active");
      }
      // Filtrer l'affichage existant
      Array.from(el.logs.children).forEach((node) => {
        const l = node.getAttribute("data-lvl");
        node.style.display = activeLevels.has(l) ? "" : "none";
      });
    });
  });

  const socket = io({ autoConnect: true });

  if (window.initNavSocket) {
    window.initNavSocket(socket);
  }

  // Auto-reload sur modification de fichiers
  socket.on("reload", (data) => {
    const file = data?.file || "";
    // Recharger seulement les CSS sans reset de socket
    if (file.match(/\.css$/i)) {
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        const href = link.href.split("?")[0];
        link.href = href + "?v=" + Date.now();
      });
    } else if (file.match(/\.js$/i) || file.match(/\.html$/i)) {
      window.location.reload();
    }
  });

  // Recevoir l'historique complet au chargement
  socket.on("server:log:init", (arr) => {
    try {
      if (!Array.isArray(arr)) return;
      el.logs.innerHTML = "";
      arr.forEach((p) => appendEntry(p));
      if (autoScroll) scrollToBottom("auto");
    } catch {}
  });
  socket.on("server:log", (payload) => {
    appendEntry(payload);
  });

  function appendEntry(payload) {
    const { level, message, at } = payload || {};
    const lvl = level || "log";
    const show = activeLevels.has(lvl);
    const line = document.createElement("div");
    line.className = "entry";
    line.setAttribute("data-lvl", lvl);
    line.style.display = show ? "" : "none";
    line.innerHTML = `
                                <span class="t">${at ? new Date(at).toLocaleTimeString() : "-"}</span>
                                <span class="lvl-${lvl}">[${lvl.toUpperCase()}]</span>
                                <span class="msg">${escapeHtml(String(message || ""))}</span>
                            `;
    el.logs.appendChild(line);
    if (autoScroll && show) scrollToBottom("smooth");
  }

  function escapeHtml(s) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function scrollToBottom(behavior = "auto") {
    const doc = document.documentElement;
    window.scrollTo({
      top: doc.scrollHeight,
      behavior: behavior === "smooth" ? "smooth" : "auto",
    });
  }

  function isNearBottom(threshold = 80) {
    const doc = document.documentElement;
    const distance = doc.scrollHeight - (doc.scrollTop + window.innerHeight);
    return distance <= threshold;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (autoScroll && !isNearBottom()) {
        autoScroll = false;
        el.auto.classList.remove("active");
        updateAutoLabel();
      } else if (!autoScroll && isNearBottom()) {
        autoScroll = true;
        el.auto.classList.add("active");
        updateAutoLabel();
        scrollToBottom("smooth");
      }
    },
    { passive: true },
  );

  function updateAutoLabel() {
    el.auto.textContent = `Auto-scroll: ${autoScroll ? "On" : "Off"}`;
  }
})();
