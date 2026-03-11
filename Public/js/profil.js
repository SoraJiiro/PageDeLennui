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

function formatBirthDate(value) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
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

function renderBadgesRow(container, badges, max = 5) {
  if (!container) return;
  container.innerHTML = "";
  const list = Array.isArray(badges) ? badges : [];
  if (list.length === 0) {
    container.innerHTML = '<span style="opacity:.75;">Aucun</span>';
    return;
  }
  const toRender =
    typeof max === "number" && isFinite(max) ? list.slice(0, max) : list;
  toRender.forEach((b) => {
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
    ["Money", s.money],
    ["Tokens", s.tokens],
    ["Peak CPS", s.peakHumanCps ? Number(s.peakHumanCps).toFixed(1) : 0],
    ["Dino", s.dinoScore],
    ["Flappy", s.flappyScore],
    ["Snake", s.snakeScore],
    ["UNO (victoires)", s.unoWins],
    ["P4 (victoires)", s.p4Wins],
    ["BlockBlast", s.blockblastScore],
    ["2048", s.score2048],
    ["Mash (victoires)", s.mashWins],
    ["Sudoku (grilles complétées)", s.sudokuCompleted],
    [
      "Roulette (W/L)",
      s.roulette
        ? `${Number(s.roulette.wins || 0)} / ${Number(s.roulette.losses || 0)}`
        : "0 / 0",
    ],
    [
      "Slots (W/L)",
      s.slots
        ? `${Number(s.slots.wins || 0)} / ${Number(s.slots.losses || 0)}`
        : "0 / 0",
    ],
    [
      "Motus (mots trouvés)",
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

function renderCustomColors(colors) {
  const container = qs("customColors");
  if (!container) return;

  const list = Array.isArray(colors) ? colors : [];
  if (!list.length) {
    container.innerHTML = '<span style="opacity:.75;">Aucune</span>';
    return;
  }

  container.innerHTML = "";
  list.forEach((hex) => {
    const chip = document.createElement("div");
    chip.className = "custom-color-chip";
    chip.innerHTML = `<span class="custom-color-swatch" style="background:${hex}"></span><span>${hex}</span>`;
    container.appendChild(chip);
  });
}

function renderMedals(container, medals) {
  if (!container) return;
  const list = Array.isArray(medals) ? medals : [];
  if (list.length === 0) {
    container.innerHTML =
      '<span style="opacity:.75;width:100%;text-align:center;">Aucune</span>';
    return;
  }

  const html = list
    .map((m) => {
      let styleStr = "";
      let innerContent = "";
      const isSpecial = [
        "Bronze",
        "Argent",
        "Or",
        "Diamant",
        "Rubis",
        "Saphir",
      ].includes(m.name);

      if (m.colors && m.colors.length) {
        if (
          m.name &&
          (m.name.startsWith("Médaille") || m.name === "Tricheur")
        ) {
          m.colors.forEach((c, i) => (styleStr += `--grad${i + 1}: ${c}; `));
        } else if (
          !isSpecial &&
          m.name !== "Légendaire" &&
          m.name !== "Rainbow"
        ) {
          const bg =
            m.colors.length > 1
              ? `linear-gradient(120deg, ${m.colors[0]} 30%, ${m.colors[1]} 60%)`
              : m.colors[0];
          styleStr = `background: ${bg} !important; border: 5px solid #fff;`;
        }
      }

      if (m.name === "Légendaire") {
        innerContent = '<div class="medal-index">7</div>';
      } else if (m.name && /^Médaille\s+Prestige/i.test(m.name)) {
        const match = m.name.match(/Médaille\s+Prestige\s*[-–:]?\s*(\d+)/i);
        const num = match
          ? match[1]
          : m.name
              .replace(/Médaille\s+Prestige/i, "")
              .replace(/[^0-9]/g, "")
              .trim() || "";
        innerContent = `<div class="medal-index">${num}</div>`;
      } else if (m.name && m.name.startsWith("Médaille")) {
        const num = m.name.replace("Médaille ", "");
        innerContent = `<div class="medal-index">${num}</div>`;
      } else if (m.name === "Tricheur") {
        innerContent =
          '<div class="medal-index"><i class="fa-solid fa-ban"></i></div>';
      }

      const titleContent =
        m.colors && m.colors.length > 0
          ? `${m.name}\n${m.colors.join("\n")}`
          : m.name;
      const nameAttr = m.name ? `data-name="${m.name}"` : "";
      const shownClass = "shown";

      return `<div class="medal ${shownClass}" ${nameAttr} style="${styleStr}" title="${titleContent}">${innerContent}</div>`;
    })
    .join("");

  container.innerHTML = html;
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
  renderBadgesRow(qs("badgesSelected"), data.badges && data.badges.selected, 5);
  renderBadgesRow(
    qs("badgesAll"),
    data.badges && data.badges.assigned,
    Infinity,
  );
  renderMedals(qs("medalsWrap"), data.medals || []);
  renderStats(data.stats);
  renderCustomColors(data.customPixelColors || []);
  const birthDateDisplay = qs("birthDateValue");
  if (birthDateDisplay)
    birthDateDisplay.textContent = formatBirthDate(data.birthDate);

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
        if (ids.length > 5) {
          if (saveStatus) saveStatus.textContent = "Maximum 5 badges.";
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

    // Live limit to 5
    const picker = qs("badgesPicker");
    if (picker) {
      picker.addEventListener("change", () => {
        const ids = getPickerSelectedIds();
        if (ids.length > 5) {
          const boxes = Array.from(
            picker.querySelectorAll('input[type="checkbox"]'),
          );
          const checked = boxes.filter((b) => b.checked);
          if (checked.length) checked[checked.length - 1].checked = false;
          if (saveStatus) saveStatus.textContent = "Maximum 5 badges.";
        } else if (saveStatus) {
          saveStatus.textContent = "";
        }
      });
    }

    const birthInput = qs("birthDateInput");
    const birthBtn = qs("birthDateSave");
    const birthStatus = qs("birthDateStatus");
    const today = new Date().toISOString().split("T")[0];
    const allowBirthEdit = !data.birthDate;
    if (birthInput) {
      birthInput.value = data.birthDate || "";
      birthInput.max = today;
      birthInput.disabled = !allowBirthEdit;
    }
    if (birthBtn) {
      birthBtn.disabled = !allowBirthEdit;
    }
    if (!allowBirthEdit && birthStatus) {
      birthStatus.textContent = "✅ Date enregistrée (non modifiable)";
    }
    if (allowBirthEdit && birthInput && birthBtn) {
      birthBtn.onclick = async () => {
        const payload = (birthInput.value || "").trim();
        if (!payload) {
          if (birthStatus)
            birthStatus.textContent = "❌ Veuillez choisir une date";
          return;
        }
        const body = { birthDate: payload };
        if (birthStatus) birthStatus.textContent = "";
        birthBtn.disabled = true;
        try {
          const res = await fetch("/api/profile/birthdate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const result = await res.json().catch(() => ({}));
          if (res.ok) {
            const savedDate = result.birthDate || payload;
            if (birthDateDisplay)
              birthDateDisplay.textContent = formatBirthDate(savedDate);
            if (birthInput) {
              birthInput.value = savedDate || "";
              birthInput.disabled = true;
            }
            if (birthBtn) birthBtn.disabled = true;
            if (birthStatus)
              birthStatus.textContent = "✅ Date enregistrée (non modifiable)";
            return;
          }
          if (birthStatus)
            birthStatus.textContent = `❌ ${result.message || "Erreur"}`;
          if (birthBtn) birthBtn.disabled = false;
        } catch (error) {
          if (birthStatus)
            birthStatus.textContent = "❌ Impossible de contacter le serveur";
          if (birthBtn) birthBtn.disabled = false;
        }
      };
    }
  }
}

main().catch((e) => {
  console.error(e);
  showNotif("❌ Impossible de charger le profil");
});
