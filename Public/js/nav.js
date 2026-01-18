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
  const patchNotesLink = document.querySelector('a[href="patch_notes.html"]');
  const annoncesLink = document.querySelector('a[href="annonces.html"]');
  const chatBtn = document.querySelector(".sec3");

  const page = (location.pathname || "").split("/").pop();

  function ensureBadge(targetEl) {
    if (!targetEl) return null;
    let badge = targetEl.querySelector(".notification-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "notification-badge";
      targetEl.appendChild(badge);
    }
    return badge;
  }

  function setBadge(targetEl, text) {
    const badge = ensureBadge(targetEl);
    if (!badge) return;
    if (text === null || text === undefined || text === "" || text === 0) {
      badge.style.display = "none";
      return;
    }

    // Si on dépasse un certain seuil, on compacte.
    if (typeof text === "number" && text > 99) {
      badge.textContent = "99+";
    } else {
      badge.textContent = String(text);
    }
    badge.style.display = "inline-block";
  }

  function parseIsoMs(iso) {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  }

  async function getCurrentUser() {
    if (window.username) return window.username;
    try {
      const sRes = await fetch("/api/session");
      if (sRes.ok) {
        const sData = await sRes.json();
        window.username = sData.pseudo;
        return sData.pseudo;
      }
    } catch (e) {}
    return null;
  }

  async function storageKey(base) {
    const user = await getCurrentUser();
    return user ? `${base}_${user}` : base;
  }

  async function getSeenIds(base) {
    const k = await storageKey(base);
    try {
      const parsed = JSON.parse(localStorage.getItem(k) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  async function setSeenIds(base, ids) {
    const k = await storageKey(base);
    localStorage.setItem(k, JSON.stringify(Array.isArray(ids) ? ids : []));
  }

  async function getSeenMs(base) {
    const k = await storageKey(base);
    const raw = localStorage.getItem(k);
    return parseIsoMs(raw);
  }

  async function setSeenIso(base, iso) {
    const k = await storageKey(base);
    localStorage.setItem(k, iso);
  }

  async function markSeenNow(base) {
    await setSeenIso(base, new Date().toISOString());
  }

  async function getPatchNoteVersions() {
    // Sur la page patch_notes.html, on peut parser directement le DOM.
    if (page === "patch_notes.html") {
      const els = document.querySelectorAll(".patch-entry .version");
      return Array.from(els)
        .map((e) => (e && e.textContent ? e.textContent.trim() : ""))
        .filter(Boolean);
    }

    try {
      const res = await fetch("patch_notes.html", { cache: "no-store" });
      if (!res.ok) return [];
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const els = doc.querySelectorAll(".patch-entry .version");
      return Array.from(els)
        .map((e) => (e && e.textContent ? e.textContent.trim() : ""))
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  async function checkPatchNotes({ markSeen = false } = {}) {
    if (!patchNotesLink && page !== "patch_notes.html") return;
    const versions = await getPatchNoteVersions();
    if (versions.length === 0) {
      setBadge(patchNotesLink, null);
      return;
    }

    const seen = await getSeenIds("seenPatchVersions");
    const unseenVersions = versions.filter((v) => !seen.includes(v));
    const unseenCount = unseenVersions.length;

    if (markSeen || page === "patch_notes.html") {
      const merged = Array.from(new Set([...seen, ...versions]));
      await setSeenIds("seenPatchVersions", merged);
      setBadge(patchNotesLink, null);
      return;
    }

    setBadge(patchNotesLink, unseenCount > 0 ? unseenCount : null);
  }

  async function fetchAnnonces(limit = 200) {
    try {
      const res = await fetch(`/api/annonces?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.annonces) ? data.annonces : [];
    } catch (e) {
      return [];
    }
  }

  async function checkAnnonces({ markSeen = false } = {}) {
    if (!annoncesLink && page !== "annonces.html") return;
    const annonces = await fetchAnnonces(500);
    const ids = annonces
      .map((a) => (a && a.id ? String(a.id) : null))
      .filter(Boolean);

    const seen = await getSeenIds("seenAnnonces");
    const unseenIds = ids.filter((id) => !seen.includes(id));
    const unseenCount = unseenIds.length;

    if (markSeen || page === "annonces.html") {
      const merged = Array.from(new Set([...seen, ...ids]));
      await setSeenIds("seenAnnonces", merged);
      setBadge(annoncesLink, null);
      return;
    }

    setBadge(annoncesLink, unseenCount > 0 ? unseenCount : null);
  }

  async function fetchChatHistory(limit = 200) {
    try {
      const res = await fetch(`/api/chat/history?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.history) ? data.history : [];
    } catch (e) {
      return [];
    }
  }

  async function checkChat({ markSeen = false } = {}) {
    // Chat badge uniquement dans la sidebar de la home.
    if (!chatBtn) return;
    const me = await getCurrentUser();
    const history = await fetchChatHistory(200);

    const ids = history
      .map((m) => (m && m.id ? String(m.id) : null))
      .filter(Boolean);

    const seen = await getSeenIds("seenChat");
    const unseen = history.filter(
      (m) =>
        m && m.id && !seen.includes(String(m.id)) && (!me || m.name !== me),
    );
    const unseenCount = unseen.length;

    if (markSeen) {
      const merged = Array.from(new Set([...seen, ...ids]));
      await setSeenIds("seenChat", merged);
      setBadge(chatBtn, null);
      return;
    }

    setBadge(chatBtn, unseenCount > 0 ? unseenCount : null);
  }

  async function refreshAllBadges() {
    await Promise.all([checkPatchNotes(), checkAnnonces(), checkChat()]);
  }

  function setupRealtimeSocket(socket) {
    if (!socket) return;
    if (socket.__pdeNavSetup) return;
    socket.__pdeNavSetup = true;

    async function checkSurveys() {
      if (!surveysLink) return;
      try {
        const user = await getCurrentUser();

        const res = await fetch("/api/surveys/list");
        if (res.ok) {
          const surveys = await res.json();

          let seenKey = "seenSurveys";
          if (user) seenKey = "seenSurveys_" + user;

          const seenIds = JSON.parse(localStorage.getItem(seenKey) || "[]");
          const count = surveys.filter(
            (s) => s.status === "active" && !seenIds.includes(s.id),
          ).length;

          if (count > 0) {
            setBadge(surveysLink, count);
          } else {
            setBadge(surveysLink, null);
          }
        }
      } catch (e) {
        console.error("Badge check error", e);
      }
    }

    checkSurveys();

    socket.on("survey:new", () => {
      showNavNotification("Nouveau sondage disponible !");
      checkSurveys();
    });

    socket.on("survey:closed", () => {
      showNavNotification("Un sondage est terminé !");
      checkSurveys();
    });

    socket.on("chat:message", async (payload) => {
      try {
        const stage3 = document.getElementById("stage3");
        const isChatVisible =
          stage3 &&
          stage3.getBoundingClientRect().top < window.innerHeight * 0.6 &&
          stage3.getBoundingClientRect().bottom > window.innerHeight * 0.2;

        // Si on est dans le chat, on considère vu.
        if (isChatVisible) {
          await checkChat({ markSeen: true });
          return;
        }

        // Sinon, rafraîchir le compteur (simple et fiable).
        await checkChat();
      } catch (e) {}
    });

    socket.on("system:notification", async ({ message }) => {
      try {
        if (typeof message !== "string") return;
        if (!message.startsWith("📢 [ADMIN]")) return;
        // On considère ces notifications comme des annonces.
        await checkAnnonces();
      } catch (e) {}
    });

    // Si on ouvre directement des pages dédiées, marquer comme vu.
  }

  let socket = window.socket; // Si défini globalement (par main.js)
  if (socket) {
    setupRealtimeSocket(socket);
  }

  // Attendre main.js (home) pour éviter 2 sockets différents.
  // Fallback : si aucun socket n'arrive, on en crée un après un court délai.
  window.addEventListener(
    "pde:socket-ready",
    (e) => {
      try {
        const s = e && e.detail && e.detail.socket;
        if (s) {
          socket = s;
          setupRealtimeSocket(socket);
        }
      } catch {}
    },
    { once: true },
  );

  setTimeout(() => {
    if (!socket && typeof io !== "undefined") {
      socket = io();
      window.socket = socket;
      setupRealtimeSocket(socket);
    }
  }, 500);

  // Init badges
  refreshAllBadges();
  const shouldPollBadges =
    !!patchNotesLink ||
    !!annoncesLink ||
    !!chatBtn ||
    page === "patch_notes.html" ||
    page === "annonces.html";
  if (shouldPollBadges) {
    setInterval(refreshAllBadges, 60_000);
  }
  if (page === "patch_notes.html") {
    checkPatchNotes({ markSeen: true });
  }
  if (page === "annonces.html") {
    checkAnnonces({ markSeen: true });
  }

  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  function openSidebar() {
    if (sidebar) sidebar.classList.add("active");
    if (sidebarOverlay) sidebarOverlay.classList.add("active");
    if (sidebar && sidebarOverlay) document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove("active");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
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

  // Marquer comme "vu" lorsqu'on clique sur certains items
  if (patchNotesLink) {
    patchNotesLink.addEventListener("click", async () => {
      await checkPatchNotes({ markSeen: true });
    });
  }

  if (annoncesLink) {
    annoncesLink.addEventListener("click", async () => {
      await checkAnnonces({ markSeen: true });
    });
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
    ".sec15": "stage15",
  };

  for (const [selector, target] of Object.entries(navButtons)) {
    const btn = document.querySelector(selector);
    if (btn) {
      btn.addEventListener("click", () => goTo(target));
    }
  }

  // Chat: click -> vu
  if (chatBtn) {
    chatBtn.addEventListener("click", async () => {
      await checkChat({ markSeen: true });
    });
  }

  // Chat: si la section est visible, on considère lu
  const stage3 = document.getElementById("stage3");
  if (stage3 && "IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      async (entries) => {
        const entry = entries && entries[0];
        if (!entry || !entry.isIntersecting) return;
        await checkChat({ markSeen: true });
      },
      { threshold: 0.6 },
    );
    obs.observe(stage3);
  }

  // Lien Mario
  const mario = document.querySelector(".mario");
  if (mario) {
    mario.addEventListener("click", () => {
      window.open(
        "https://supermario-game.com/mario-game/mario.html",
        "_blank",
      );
      closeSidebar();
    });
  }
});
