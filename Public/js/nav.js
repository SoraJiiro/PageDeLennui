document.addEventListener("DOMContentLoaded", () => {
  function showNavNotification(text, duration = 4000) {
    if (
      typeof window !== "undefined" &&
      typeof window.showNotif === "function"
    ) {
      window.showNotif(text, duration);
      return;
    }
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

  const surveysLinks = Array.from(
    document.querySelectorAll(
      '[data-external-url="sondages.html"], a[href="sondages.html"]',
    ),
  );
  const patchNotesLinks = Array.from(
    document.querySelectorAll(
      '[data-external-url="patch_notes.html"], a[href="patch_notes.html"]',
    ),
  );
  const annoncesLinks = Array.from(
    document.querySelectorAll(
      '[data-external-url="annonces.html"], a[href="annonces.html"]',
    ),
  );
  const reglementLinks = Array.from(
    document.querySelectorAll(
      '[data-external-url="reglement.html"], a[href="reglement.html"]',
    ),
  );
  const chatBtn = document.querySelector(".sec3");
  const stageNavUp = document.getElementById("stage-nav-up");
  const stageNavDown = document.getElementById("stage-nav-down");

  const sectionIds = [
    "hubStage",
    "stage1",
    "stage2",
    "stage3",
    "stage4",
    "stage5",
    "stage6",
    "stage8",
    "stage9",
    "stage10",
    "stage11",
    "stage12",
    "stage13",
    "stage14",
    "stage15",
    "stage16",
    "stage17",
    "stage18",
    "stage19",
    "stage20",
  ];
  const stageSections = sectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const quickNavStageIds = [
    "hubStage",
    "stage1",
    "stage2",
    "stage3",
    "stage4",
    "stage5",
    "stage6",
    "stage8",
    "stage9",
    "stage10",
    "stage11",
    "stage12",
    "stage13",
    "stage14",
    "stage15",
    "stage16",
    "stage17",
    "stage18",
    "stage19",
    "stage20",
  ];

  let lastSurveyActiveIds = [];

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
      badge.innerHTML = "<b>99+</b>";
    } else {
      badge.innerHTML = `<b>${String(text)}</b>`;
    }
    badge.style.display = "flex";
  }

  function setBadgeAll(targetEls, text) {
    if (!Array.isArray(targetEls) || targetEls.length === 0) return;
    targetEls.forEach((el) => setBadge(el, text));
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

  // Sauvegarde / restauration du dernier stage actif (par utilisateur si connecté)
  async function getLastActiveStage() {
    const k = await storageKey("lastActiveStage");
    try {
      const v = localStorage.getItem(k);
      return v && typeof v === "string" ? v : null;
    } catch (e) {
      return null;
    }
  }

  async function setLastActiveStage(stageId) {
    const k = await storageKey("lastActiveStage");
    try {
      if (!stageId) {
        localStorage.removeItem(k);
        return;
      }
      localStorage.setItem(k, String(stageId));
    } catch (e) {}
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
    if (patchNotesLinks.length === 0 && page !== "patch_notes.html") return;
    const versions = await getPatchNoteVersions();
    if (versions.length === 0) {
      setBadgeAll(patchNotesLinks, null);
      return;
    }

    const seen = await getSeenIds("seenPatchVersions");
    const unseenVersions = versions.filter((v) => !seen.includes(v));
    const unseenCount = unseenVersions.length;

    if (markSeen || page === "patch_notes.html") {
      const merged = Array.from(new Set([...seen, ...versions]));
      await setSeenIds("seenPatchVersions", merged);
      setBadgeAll(patchNotesLinks, null);
      return;
    }

    setBadgeAll(patchNotesLinks, unseenCount > 0 ? unseenCount : null);
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
    if (annoncesLinks.length === 0 && page !== "annonces.html") return;
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
      setBadgeAll(annoncesLinks, null);
      return;
    }

    setBadgeAll(annoncesLinks, unseenCount > 0 ? unseenCount : null);
  }

  async function getReglementFingerprint() {
    try {
      let doc = null;

      if (page === "reglement.html") {
        doc = document;
      } else {
        const res = await fetch("reglement.html", { cache: "no-store" });
        if (!res.ok) return null;
        const html = await res.text();
        doc = new DOMParser().parseFromString(html, "text/html");
      }

      const root =
        doc.querySelector(".rules-wrap") ||
        doc.querySelector("main") ||
        doc.body ||
        doc.documentElement;

      const text = String(root?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);

      if (!text) return null;

      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }

      return `reg_${Math.abs(hash)}_${text.length}`;
    } catch (e) {
      return null;
    }
  }

  async function checkReglement({ markSeen = false } = {}) {
    if (reglementLinks.length === 0 && page !== "reglement.html") return;

    const fingerprint = await getReglementFingerprint();
    if (!fingerprint) {
      setBadgeAll(reglementLinks, null);
      return;
    }

    const key = await storageKey("seenReglementFingerprint");
    const seen = localStorage.getItem(key) || "";

    if (markSeen || page === "reglement.html") {
      localStorage.setItem(key, fingerprint);
      setBadgeAll(reglementLinks, null);
      return;
    }

    setBadgeAll(reglementLinks, seen === fingerprint ? null : 1);
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
    await Promise.all([
      checkPatchNotes(),
      checkReglement(),
      checkAnnonces(),
      checkChat(),
      checkSurveys(),
    ]);
  }

  async function fetchSurveys(limit = 300) {
    try {
      const res = await fetch(`/api/surveys/list?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.surveys)) return data.surveys;
      return [];
    } catch (e) {
      return [];
    }
  }

  async function checkSurveys({ markSeen = false } = {}) {
    if (surveysLinks.length === 0 && page !== "sondages.html") return;
    const surveys = await fetchSurveys(300);

    const activeIds = surveys
      .filter((s) => s && s.status === "active")
      .map((s) => (s && s.id ? String(s.id) : null))
      .filter(Boolean);

    lastSurveyActiveIds = activeIds;

    const seen = await getSeenIds("seenSurveys");
    const unseenIds = activeIds.filter((id) => !seen.includes(id));
    const unseenCount = unseenIds.length;

    if (markSeen || page === "sondages.html") {
      const merged = Array.from(new Set([...seen, ...activeIds]));
      await setSeenIds("seenSurveys", merged);
      setBadgeAll(surveysLinks, null);
      return;
    }

    setBadgeAll(surveysLinks, unseenCount > 0 ? unseenCount : null);
  }

  async function markSurveysSeen() {
    if (surveysLinks.length === 0) return;
    if (lastSurveyActiveIds.length === 0) {
      await checkSurveys({ markSeen: true });
      return;
    }

    const seen = await getSeenIds("seenSurveys");
    const merged = Array.from(new Set([...seen, ...lastSurveyActiveIds]));
    await setSeenIds("seenSurveys", merged);
    setBadgeAll(surveysLinks, null);
  }

  function setupRealtimeSocket(socket) {
    if (!socket) return;
    if (socket.__pdeNavSetup) return;
    socket.__pdeNavSetup = true;

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
    patchNotesLinks.length > 0 ||
    annoncesLinks.length > 0 ||
    surveysLinks.length > 0 ||
    reglementLinks.length > 0 ||
    !!chatBtn ||
    page === "patch_notes.html" ||
    page === "annonces.html" ||
    page === "reglement.html";
  if (shouldPollBadges) {
    setInterval(refreshAllBadges, 60_000);
  }
  if (page === "patch_notes.html") {
    checkPatchNotes({ markSeen: true });
  }
  if (page === "annonces.html") {
    checkAnnonces({ markSeen: true });
  }
  if (page === "sondages.html") {
    checkSurveys({ markSeen: true });
  }
  if (page === "reglement.html") {
    checkReglement({ markSeen: true });
  }

  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarClose = document.getElementById("sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  function activateSection(sectionId) {
    const found = stageSections.find((el) => el.id === sectionId);
    if (!found) return;

    if (!canLeaveCurrentStage(sectionId)) return;

    stageSections.forEach((el) => {
      el.classList.toggle("is-active", el.id === sectionId);
    });
    try {
      window.dispatchEvent(
        new CustomEvent("pde:section-activated", {
          detail: { sectionId },
        }),
      );
    } catch {}
    // Sauvegarder le dernier stage actif pour restauration après refresh
    try {
      // Ne pas await pour ne pas bloquer l'UI
      setLastActiveStage(sectionId);
    } catch (e) {}
    requestAnimationFrame(() => {
      fitActiveSectionToViewport();
      updateArrowButtonsState();
    });
    closeSidebar();
  }

  function canLeaveCurrentStage(nextSectionId) {
    const active = document.querySelector("section.is-active");
    const currentSectionId = active && active.id ? active.id : "hubStage";
    if (!currentSectionId || currentSectionId === nextSectionId) return true;

    const guardedStages = ["stage2", "stage6", "stage10", "stage20"];
    if (!guardedStages.includes(currentSectionId)) return true;

    const guardDetail = {
      action: "pause",
      stageId: currentSectionId,
      running: false,
      pausedNow: false,
    };

    try {
      window.dispatchEvent(
        new CustomEvent("pde:stage-nav-guard", { detail: guardDetail }),
      );
    } catch {}

    if (!guardDetail.running) return true;

    const ok = window.confirm(
      "Une partie est en cours. Le jeu a été mis en pause.\nVeux-tu vraiment changer de stage ?",
    );

    if (ok) return true;

    if (guardDetail.pausedNow) {
      try {
        window.dispatchEvent(
          new CustomEvent("pde:stage-nav-guard", {
            detail: {
              action: "resume",
              stageId: currentSectionId,
            },
          }),
        );
      } catch {}
    }

    return false;
  }

  function getCurrentQuickStageIndex() {
    const active = document.querySelector("section.is-active");
    if (!active || !active.id) return 0;
    const idx = quickNavStageIds.indexOf(active.id);
    return idx >= 0 ? idx : 0;
  }

  function updateArrowButtonsState() {
    const idx = getCurrentQuickStageIndex();
    if (stageNavUp) stageNavUp.disabled = idx <= 0;
    if (stageNavDown)
      stageNavDown.disabled = idx >= quickNavStageIds.length - 1;
  }

  function goToAdjacentStage(direction) {
    const idx = getCurrentQuickStageIndex();
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= quickNavStageIds.length) return;
    activateSection(quickNavStageIds[nextIdx]);
  }

  function ensureViewportWrapper(section) {
    if (!section) return null;
    if (section.id === "hubStage" || section.id === "stage1") return null;

    let wrapper = section.querySelector(":scope > .vp-fit-inner");
    if (wrapper) return wrapper;

    wrapper = document.createElement("div");
    wrapper.className = "vp-fit-inner";
    while (section.firstChild) {
      wrapper.appendChild(section.firstChild);
    }
    section.appendChild(wrapper);
    return wrapper;
  }

  function fitSectionToViewport(section) {
    if (!section || !section.classList.contains("is-active")) return;
    const wrapper = ensureViewportWrapper(section);
    if (!wrapper) return;

    wrapper.style.transform = "scale(1)";

    const viewportW = Math.max(320, window.innerWidth - 24);
    const viewportH = Math.max(320, window.innerHeight - 24);
    const contentW = Math.max(1, wrapper.scrollWidth);
    const contentH = Math.max(1, wrapper.scrollHeight);

    const scale = Math.min(viewportW / contentW, viewportH / contentH, 1);
    wrapper.style.transform = `scale(${scale})`;
  }

  function fitActiveSectionToViewport() {
    const active = document.querySelector("section.is-active");
    if (!active) return;
    fitSectionToViewport(active);
  }

  function openExternalStage(url, title) {
    if (!url) return;
    window.location.href = url;
  }

  function openSidebar() {
    if (sidebar) sidebar.classList.add("active");
    if (sidebarOverlay) sidebarOverlay.classList.add("active");
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove("active");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
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
    activateSection(section);
  }

  // Marquer comme "vu" lorsqu'on clique sur certains items
  patchNotesLinks.forEach((link) => {
    link.addEventListener("click", async () => {
      await checkPatchNotes({ markSeen: true });
    });
  });

  annoncesLinks.forEach((link) => {
    link.addEventListener("click", async () => {
      await checkAnnonces({ markSeen: true });
    });
  });

  surveysLinks.forEach((link) => {
    link.addEventListener("click", async () => {
      await markSurveysSeen();
    });
  });

  reglementLinks.forEach((link) => {
    link.addEventListener("click", async () => {
      await checkReglement({ markSeen: true });
    });
  });

  // Attacher les écouteurs d'événements aux boutons
  const navButtons = {
    ".secHub": "hubStage",
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
    ".sec16": "stage16",
    ".sec17": "stage17",
    ".sec18": "stage18",
    ".sec19": "stage19",
    ".sec20": "stage20",
  };

  for (const [selector, target] of Object.entries(navButtons)) {
    document.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener("click", () => goTo(target));
    });
  }

  document.querySelectorAll(".ext-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = String(btn.dataset.externalUrl || "").trim();
      const title = String(btn.dataset.externalTitle || "").trim();
      if (!url) return;

      if (url.includes("patch_notes.html")) {
        await checkPatchNotes({ markSeen: true });
      }
      if (url.includes("annonces.html")) {
        await checkAnnonces({ markSeen: true });
      }
      if (url.includes("sondages.html")) {
        await markSurveysSeen();
      }
      if (url.includes("reglement.html")) {
        await checkReglement({ markSeen: true });
      }

      openExternalStage(url, title);
    });
  });

  if (stageNavUp) {
    stageNavUp.addEventListener("click", () => goToAdjacentStage(-1));
  }
  if (stageNavDown) {
    stageNavDown.addEventListener("click", () => goToAdjacentStage(1));
  }

  (async () => {
    try {
      const saved = await getLastActiveStage();
      if (saved && document.getElementById(saved)) {
        activateSection(saved);
      } else {
        activateSection("hubStage");
      }
    } catch (e) {
      activateSection("hubStage");
    }
  })();

  window.addEventListener("resize", () => {
    fitActiveSectionToViewport();
  });

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
});
