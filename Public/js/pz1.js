(function () {
  const path = (location.pathname || "").toLowerCase();
  const page = path.endsWith("/") ? "" : path.split("/").pop();
  const el = document.getElementById("x");
  if (!el) return;

  const stepConfig = {
    login: { endpoint: "/api/x9/prelogin", code: "l1" },
    "login.html": { endpoint: "/api/x9/prelogin", code: "l1" },
    "": { endpoint: "/api/x9/step", code: "i1" },
    "index.html": { endpoint: "/api/x9/step", code: "i1" },
    "search.html": { endpoint: "/api/x9/step", code: "s1" },
  };

  let cfg = stepConfig[page];
  if (!cfg) {
    const dataCode = String(el.getAttribute("data-ee-code") || "").trim();
    if (dataCode) {
      cfg = { endpoint: "/api/x9/step", code: dataCode };
    }
  }
  if (!cfg) return;

  let pending = false;
  let cachedPseudo = null;
  let pseudoPromise = null;

  async function getPseudo() {
    const fromWindow = String(window.username || "").trim();
    if (fromWindow) return fromWindow;
    if (cachedPseudo) return cachedPseudo;
    if (pseudoPromise) return pseudoPromise;

    pseudoPromise = fetch("/api/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const p = data && data.pseudo ? String(data.pseudo).trim() : "";
        cachedPseudo = p;
        return p;
      })
      .catch(() => "");

    return pseudoPromise;
  }

  async function getStorageKey() {
    const pseudo = await getPseudo();
    return pseudo ? `ee_step_${cfg.code}_${pseudo}` : `ee_step_${cfg.code}`;
  }

  function isElementSelected(target) {
    const sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range) return false;
    try {
      return range.intersectsNode(target);
    } catch (e) {
      return false;
    }
  }

  async function sendStep() {
    if (pending) return;
    const storageKey = await getStorageKey();
    if (storageKey && sessionStorage.getItem(storageKey) === "1") return;
    pending = true;
    try {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cfg.code }),
      });
      if (res.ok) {
        if (storageKey) sessionStorage.setItem(storageKey, "1");
      }
    } catch (e) {
      // best effort
    } finally {
      pending = false;
    }
  }

  function checkSelection() {
    if (isElementSelected(el)) {
      sendStep();
    }
  }

  document.addEventListener("mouseup", checkSelection);
  document.addEventListener("keyup", checkSelection);
  document.addEventListener("selectionchange", checkSelection);
})();
