(function () {
  const DATA_URL = "persistant_data/patch_notes.json";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderItem(item) {
    const tagClass = escapeHtml(item.tagClass || "tag-change");
    const tag = escapeHtml(item.tag || "[CHANGE]");
    const strong = escapeHtml(item.strong || "");
    const text = escapeHtml(item.text || "");
    const textHtml =
      item && typeof item.textHtml === "string" ? item.textHtml : "";
    const body = textHtml || text;

    if (strong) {
      return `<li><span class="${tagClass}">${tag}</span> <strong>${strong}</strong> ${body}</li>`;
    }

    return `<li><span class="${tagClass}">${tag}</span> ${body}</li>`;
  }

  function renderSection(section) {
    const title = escapeHtml(section.title || "Section");
    const icon = escapeHtml(section.icon || "fa-wrench");
    const items = Array.isArray(section.items) ? section.items : [];

    return `
      <h3><i class="fa-solid ${icon}"></i> ${title} -</h3>
      <ul>
        ${items.map(renderItem).join("")}
      </ul>
    `;
  }

  function renderEntry(entry) {
    const version = escapeHtml(entry.version || "vX.X.X");
    const date = escapeHtml(entry.date || "Date");
    const sections = Array.isArray(entry.sections) ? entry.sections : [];
    const noteHtml =
      entry && typeof entry.noteHtml === "string" ? entry.noteHtml : "";

    return `
      <div class="patch-entry">
        <i class="fa-solid fa-caret-down" id="topArrow"></i>
        <div class="patch-title">
          <span class="version">${version}</span>
          <span class="date">${date}</span>
        </div>
        <div class="patch-content">
          ${sections.map(renderSection).join("")}
          ${noteHtml}
        </div>
      </div>
    `;
  }

  async function loadPatchNotes() {
    const dynamicRoot = document.getElementById("patch-dynamic-list");
    const staticRoot = document.getElementById("patch-static-list");
    if (!dynamicRoot) return;

    try {
      const res = await fetch(`${DATA_URL}?v=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const replaceStatic = Boolean(data.replaceStatic);

      if (entries.length === 0) {
        dynamicRoot.innerHTML = "";
        return;
      }

      dynamicRoot.innerHTML = entries.map(renderEntry).join("\n");

      if (replaceStatic && staticRoot) {
        staticRoot.style.display = "none";
      }
    } catch (error) {
      dynamicRoot.innerHTML = "";
    }
  }

  document.addEventListener("DOMContentLoaded", loadPatchNotes);
})();

/*
Exemple de structure JSON (Public/persistant_data/patch_notes.json)
{
  "replaceStatic": false,
  "entries": [
    {
      "version": "vX.X.X",
      "date": "JJ/MM/AAAA",
      "sections": [
        {
          "title": "Nouveautes",
          "icon": "fa-star",
          "items": [
            {
              "tagClass": "tag-new",
              "tag": "[NEW]",
              "strong": "Titre:",
              "text": "Texte simple"
            },
            {
              "tagClass": "tag-change",
              "tag": "[CHANGE]",
              "textHtml": "Texte avec <u>HTML</u> autorise"
            }
          ]
        }
      ],
      "noteHtml": "<article>Bloc optionnel en HTML</article>"
    }
  ]
}
*/
