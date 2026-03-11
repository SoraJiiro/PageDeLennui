(function () {
  const DATA_URL = "persistant_data/faq.json";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHref(href) {
    const raw = String(href || "").trim();
    if (!raw) return "#";
    if (/^(https?:|javascript:|data:)/i.test(raw)) return "#";
    if (!/^[a-zA-Z0-9_\-./]+$/.test(raw)) return "#";
    return raw;
  }

  function sectionHtml(section) {
    const icon = escapeHtml(section.icon || "fa-circle-question");
    const title = escapeHtml(section.title || "Section");
    const items = Array.isArray(section.items) ? section.items : [];

    const details = items
      .map((item) => {
        const q = escapeHtml(item.q || "Question");
        const a = item.a || "";
        const isOpen = item.open ? " open" : "";
        return `<details class="faq-item"${isOpen}><summary>${q}</summary><p>${a}</p></details>`;
      })
      .join("");

    return `
      <section class="faq-block">
        <h2><i class="fa-solid ${icon}"></i> ${title}</h2>
        ${details}
      </section>
    `;
  }

  function linksBlockHtml(block) {
    const icon = escapeHtml(block.icon || "fa-link");
    const title = escapeHtml(block.title || "Liens utiles");
    const links = Array.isArray(block.links) ? block.links : [];

    const items = links
      .map((link) => {
        const href = safeHref(link.href);
        const label = escapeHtml(link.label || href);
        return `<li><a href="${href}">${label}</a></li>`;
      })
      .join("");

    return `
      <section class="faq-block faq-block--links">
        <h2><i class="fa-solid ${icon}"></i> ${title}</h2>
        <ul>${items}</ul>
      </section>
    `;
  }

  async function loadFaqData() {
    const root = document.getElementById("faq-root");
    if (!root) return;

    try {
      const res = await fetch(`${DATA_URL}?v=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const title = escapeHtml(data.title || "FAQ");
      const subtitle = escapeHtml(data.subtitle || "");
      const sections = Array.isArray(data.sections) ? data.sections : [];
      const content = sections.map(sectionHtml).join("");
      const linksBlock = data.linksBlock ? linksBlockHtml(data.linksBlock) : "";

      root.innerHTML = `
        <header class="faq-header">
          <h1><i class="fa-solid fa-circle-question"></i> ${title}</h1>
          <p>${subtitle}</p>
        </header>
        ${content}
        ${linksBlock}
      `;
    } catch (error) {
      root.innerHTML = `
        <header class="faq-header">
          <h1><i class="fa-solid fa-circle-question"></i> FAQ</h1>
          <p>Impossible de charger le contenu pour le moment.</p>
        </header>
        <section class="faq-block">
          <p class="faq-empty">Erreur de chargement des donnees FAQ.</p>
        </section>
      `;
    }
  }

  document.addEventListener("DOMContentLoaded", loadFaqData);
})();
