import { showNotif } from "./util.js";

function qs(id) {
  return document.getElementById(id);
}

function getQueryPseudo() {
  const url = new URL(window.location.href);
  const p = (url.searchParams.get("pseudo") || "").trim();
  return p || null;
}

function renderTag(tag) {
  if (!tag) return "";
  if (typeof tag === "string") return tag;
  if (typeof tag === "object" && tag.text) {
    if (Array.isArray(tag.colors) && tag.colors.length) {
      const words = tag.text.split(/\s+/);
      return words
        .map((w, i) => {
          const c = tag.colors[i] || tag.colors[0] || "#ffffff";
          return `<span style="color:${c}">${w}</span>`;
        })
        .join(" ");
    }
    const style = tag.color ? `style="color:${tag.color}"` : "";
    return `<span ${style}>${tag.text}</span>`;
  }
  return "";
}

function setPfp(url) {
  const img = qs("pfpImg");
  const fallback = qs("pfpFallback");
  if (!img || !fallback) return;

  if (!url) {
    img.style.display = "none";
    fallback.style.display = "flex";
    return;
  }

  img.src = url;
  img.onload = () => {
    img.style.display = "block";
    fallback.style.display = "none";
  };
  img.onerror = () => {
    img.style.display = "none";
    fallback.style.display = "flex";
  };
}

function renderBadgesRow(container, badges) {
  if (!container) return;
  container.innerHTML = "";
  const list = Array.isArray(badges) ? badges : [];
  if (list.length === 0) {
    container.innerHTML = '<span style="opacity:.75;">Aucun</span>';
    return;
  }
  list.slice(0, 3).forEach((b) => {
    const el = document.createElement("span");
    el.className = "badge-chip";
    el.innerHTML = `<span class="badge-emoji">${b.emoji || "🏷️"}</span><span>${b.name || b.id}</span>`;
    container.appendChild(el);
  });
}

function renderStats(stats) {
  const container = qs("stats");
  if (!container) return;
  const s = stats || {};

  const rows = [
    ["Clicks", s.clicks],
    ["Dino", s.dinoScore],
    ["Flappy", s.flappyScore],
    ["Snake", s.snakeScore],
    ["UNO (victoires)", s.unoWins],
    ["P4 (victoires)", s.p4Wins],
    ["BlockBlast", s.blockblastScore],
    ["2048", s.score2048],
    ["Mash (victoires)", s.mashWins],
    [
      "Motus (mots)",
      s.motus && typeof s.motus.words === "number" ? s.motus.words : "—",
    ],
  ];

  container.innerHTML = "";
  rows.forEach(([label, value]) => {
    const el = document.createElement("div");
    el.className = "stat";
    el.innerHTML = `<div class="label">${label}</div><div class="value">${
      value ?? 0
    }</div>`;
    container.appendChild(el);
  });
}

function renderBadgesPicker(assigned, selectedIds) {
  const picker = qs("badgesPicker");
  if (!picker) return;
  picker.innerHTML = "";

  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const list = Array.isArray(assigned) ? assigned : [];

  if (list.length === 0) {
    picker.innerHTML =
      '<div style="opacity:.75;">Aucun badge attribué par l\'admin.</div>';
    return;
  }

  list.forEach((b) => {
    const row = document.createElement("label");
    row.className = "badge-pick";
    row.innerHTML = `
      <input type="checkbox" value="${b.id}" ${selected.has(b.id) ? "checked" : ""} />
      <span class="badge-emoji">${b.emoji || "🏷️"}</span>
      <span>${b.name || b.id}</span>
    `;
    picker.appendChild(row);
  });
}

function getPickerSelectedIds() {
  const picker = qs("badgesPicker");
  if (!picker) return [];
  const boxes = Array.from(picker.querySelectorAll('input[type="checkbox"]'));
  return boxes.filter((b) => b.checked).map((b) => b.value);
}

async function loadMyPseudo() {
  const res = await fetch("/api/session");
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.pseudo ? data.pseudo : null;
}

async function loadProfile(targetPseudo) {
  if (targetPseudo) {
    const res = await fetch(
      `/api/profile/user/${encodeURIComponent(targetPseudo)}`,
    );
    if (!res.ok) throw new Error("Profil introuvable");
    return await res.json();
  }

  const res = await fetch("/api/profile/me");
  if (!res.ok) throw new Error("Non connecté");
  return await res.json();
}

async function main() {
  const targetPseudo = getQueryPseudo();
  const myPseudo = await loadMyPseudo().catch(() => null);

  const isMe = !targetPseudo || (myPseudo && targetPseudo === myPseudo);

  const data = await loadProfile(isMe ? null : targetPseudo);

  qs("pseudo").textContent = data.pseudo;
  qs("tag").innerHTML = data.tag ? `[ ${renderTag(data.tag)} ]` : "";

  setPfp(data.pfpUrl);
  renderBadgesRow(qs("badgesSelected"), data.badges && data.badges.selected);
  renderBadgesRow(qs("badgesAll"), data.badges && data.badges.assigned);
  renderStats(data.stats);

  const meSection = qs("meSection");
  if (meSection) meSection.hidden = !isMe;

  if (isMe) {
    // PFP request
    const statusEl = qs("pfpStatus");
    const req = data.pfpRequest;
    if (statusEl) {
      if (req && req.pending) {
        statusEl.textContent = "⏳ Demande en attente d'approbation Admin.";
      } else {
        statusEl.textContent = data.pfpUrl ? "✅ PFP active" : "Aucune PFP";
      }
    }

    const submitBtn = qs("pfpSubmit");
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const url = (qs("pfpUrl").value || "").trim();
        if (!url) {
          showNotif("URL manquante");
          return;
        }
        const res = await fetch("/api/profile/pfp/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (res.ok) {
          showNotif("✅ Demande envoyée");
          window.location.reload();
        } else {
          const msg = await res.json().catch(() => ({}));
          showNotif(`❌ ${msg.message || "Erreur"}`);
        }
      };
    }

    // Badges picker
    renderBadgesPicker(
      (data.badges && data.badges.assigned) || [],
      (data.badges && data.badges.selectedIds) || [],
    );

    const saveBtn = qs("saveBadges");
    const saveStatus = qs("badgesSaveStatus");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const ids = getPickerSelectedIds();
        if (ids.length > 3) {
          if (saveStatus) saveStatus.textContent = "Maximum 3 badges.";
          return;
        }
        const res = await fetch("/api/profile/badges/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedIds: ids }),
        });
        if (res.ok) {
          if (saveStatus) saveStatus.textContent = "✅ Enregistré";
          window.location.reload();
        } else {
          const msg = await res.json().catch(() => ({}));
          if (saveStatus)
            saveStatus.textContent = `❌ ${msg.message || "Erreur"}`;
        }
      };
    }

    // Live limit to 3
    const picker = qs("badgesPicker");
    if (picker) {
      picker.addEventListener("change", () => {
        const ids = getPickerSelectedIds();
        if (ids.length > 3) {
          // undo last change by unchecking the last checked
          const boxes = Array.from(
            picker.querySelectorAll('input[type="checkbox"]'),
          );
          const checked = boxes.filter((b) => b.checked);
          if (checked.length) checked[checked.length - 1].checked = false;
          if (saveStatus) saveStatus.textContent = "Maximum 3 badges.";
        } else if (saveStatus) {
          saveStatus.textContent = "";
        }
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  showNotif("❌ Impossible de charger le profil");
});
