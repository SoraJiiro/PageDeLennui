(function () {
  const listEl = document.getElementById("ann-list");
  const statusEl = document.getElementById("ann-status");
  const refreshBtn = document.getElementById("ann-refresh");
  const filterInput = document.getElementById("ann-filter");

  let socket;
  let currentUser = null;

  /** @type {Array<{id:string,at:string,author?:string,message:string,rawMessage?:string,withCountdown?:boolean,duration?:number}>} */
  let annonces = [];

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString("fr-FR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function render() {
    const q = (filterInput?.value || "").trim().toLowerCase();

    const filtered = q
      ? annonces.filter((a) => {
          const hay = `${a.message || ""}\n${a.rawMessage || ""}\n${
            a.author || ""
          }`.toLowerCase();
          return hay.includes(q);
        })
      : annonces;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="ann-empty">Aucune annonce${
        q ? " (filtre actif)" : ""
      }.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((a) => {
        const author = a.author || "Admin";
        const isAdmin = author.toLowerCase() === "admin";
        const countdown = a.withCountdown ? "Fermeture" : null;
        const duration =
          typeof a.duration === "number" ? `${a.duration}ms` : null;

        const pills = [
          `<span class="ann-pill ${
            isAdmin ? "ann-pill--admin" : ""
          }">${escapeHtml(author)}</span>`,
          countdown
            ? `<span class="ann-pill">${escapeHtml(countdown)}</span>`
            : "",
        ].filter(Boolean);

        return `
<div class="ann-item">
  <div class="ann-item__meta">
    <span>${escapeHtml(formatDate(a.at))}</span>
    ${pills.join("\n")}
  </div>
  <div class="ann-message">${escapeHtml(a.message || "")}</div>
</div>`;
      })
      .join("\n");
  }

  async function load() {
    statusEl.textContent = "Chargement…";
    try {
      const res = await fetch("/api/annonces?limit=200", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });

      if (res.status === 401) {
        statusEl.textContent = "Non connecté. Redirection…";
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        statusEl.textContent = `Erreur chargement (${res.status})`;
        listEl.innerHTML = `<div class="ann-empty">Impossible de charger l'historique.</div>`;
        return;
      }

      const data = await res.json();
      annonces = Array.isArray(data.annonces) ? data.annonces : [];
      statusEl.textContent = `${annonces.length} annonce(s)`;
      render();
    } catch (e) {
      statusEl.textContent = "Erreur réseau";
      listEl.innerHTML = `<div class="ann-empty">Erreur réseau lors du chargement.</div>`;
    }
  }

  refreshBtn?.addEventListener("click", load);
  filterInput?.addEventListener("input", render);

  async function init() {
    try {
      const sessionRes = await fetch("/api/session", {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (sessionRes.status === 401 || !sessionRes.ok) {
        window.location.href = "/login";
        return;
      }
      const sessionData = await sessionRes.json();
      currentUser = sessionData.pseudo;

      if (typeof window.io === "function") {
        socket = window.io({
          query: { username: currentUser },
        });

        if (window.initUiColor) {
          window.initUiColor(socket);
        }
      }

      load();
    } catch (e) {
      window.location.href = "/login";
    }
  }

  init();
})();
