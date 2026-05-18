import { showNotif } from "./util.js";

function qs(id) {
  return document.getElementById(id);
}

function getQueryPseudo() {
  const url = new URL(window.location.href);
  const p = (url.searchParams.get("pseudo") || "").trim();
  return p || null;
}

const htmlEscapes = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

function sanitizeCssColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return raw;
  return "";
}

function renderTag(tag) {
  if (!tag) return "";
  if (typeof tag === "string") return escapeHtml(tag);
  if (typeof tag === "object" && tag.text) {
    if (Array.isArray(tag.colors) && tag.colors.length) {
      const words = tag.text.split(/\s+/);
      return words
        .map((w, i) => {
          const rawColor = tag.colors[i] || tag.colors[0] || "";
          const c = sanitizeCssColor(rawColor);
          const style = c ? ` style="color:${c}"` : "";
          return `<span${style}>${escapeHtml(w)}</span>`;
        })
        .join(" ");
    }
    const c = sanitizeCssColor(tag.color);
    const style = c ? `style="color:${c}"` : "";
    return `<span${style}>${escapeHtml(tag.text)}</span>`;
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
    const emoji = document.createElement("span");
    emoji.className = "badge-emoji";
    emoji.textContent = b.emoji || "🏷️";
    const label = document.createElement("span");
    label.textContent = b.name || b.id || "";
    el.appendChild(emoji);
    el.appendChild(label);
    container.appendChild(el);
  });
}

function renderStats(stats) {
  const container = qs("stats");
  if (!container) return;
  const s = stats || {};
  const upgrades =
    s.clickerUpgrades && typeof s.clickerUpgrades === "object"
      ? s.clickerUpgrades
      : {};

  const rows = [
    ["Clicks", s.clicks],
    ["Money", s.money],
    ["Tokens", s.tokens],
    ["CLKR Upgrade (Click Booster)", Number(upgrades.per_click_1 || 0)],
    ["CLKR Upgrade (Le Flo)", Number(upgrades.per_click_2 || 0)],
    ["CLKR Upgrade (AD Laurent)", Number(upgrades.per_click_3 || 0)],
    ["CLKR Upgrade (CPS Booster)", Number(upgrades.auto_click_1 || 0)],
    ["CLKR Upgrade (L'Ultime)", Number(upgrades.auto_click_2 || 0)],
    ["CLKR Upgrade (X-Clicker)", Number(upgrades.auto_click_3 || 0)],
    ["Peak CPS", s.peakHumanCps ? Number(s.peakHumanCps).toFixed(1) : 0],
    ["Stockage max PXL", Number(s.pixelwarMaxPixels || 0)],
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
    ["Aim Trainer (best)", s.aimTrainerBest || 0],
    ["Aim Trainer (best 15s)", Number(s.aimTrainerBestByDuration?.["15"] || 0)],
    ["Aim Trainer (best 30s)", Number(s.aimTrainerBestByDuration?.["30"] || 0)],
    ["Aim Trainer (best 1mn)", Number(s.aimTrainerBestByDuration?.["60"] || 0)],
    [
      "Aim Trainer (precision moyenne)",
      s.aimTrainerStats &&
      Number.isFinite(Number(s.aimTrainerStats.avgAccuracy))
        ? `${Number(s.aimTrainerStats.avgAccuracy).toFixed(1)}%`
        : "0.0%",
    ],
    [
      "Aim Trainer (precision best)",
      s.aimTrainerStats &&
      Number.isFinite(
        Number(
          s.aimTrainerStats.bestAccuracy ?? s.aimTrainerStats.lastAccuracy,
        ),
      )
        ? `${Number(
            s.aimTrainerStats.bestAccuracy ?? s.aimTrainerStats.lastAccuracy,
          ).toFixed(1)}%`
        : "0.0%",
    ],
    [
      "Aim Trainer (ratio moyen)",
      s.aimTrainerStats && s.aimTrainerStats.avgRatio
        ? s.aimTrainerStats.avgRatio
        : s.aimTrainerStats &&
            Number.isFinite(Number(s.aimTrainerStats.totalHits)) &&
            Number.isFinite(Number(s.aimTrainerStats.totalMisses))
          ? `${Math.max(0, Math.floor(Number(s.aimTrainerStats.totalHits) || 0))}:${Math.max(0, Math.floor(Number(s.aimTrainerStats.totalMisses) || 0))}`
          : "0:0",
    ],
  ];

  container.innerHTML = "";
  rows.forEach(([label, value]) => {
    const el = document.createElement("div");
    el.className = "stat";
    const labelEl = document.createElement("div");
    labelEl.className = "label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value ?? 0;
    el.appendChild(labelEl);
    el.appendChild(valueEl);
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
    const safeHex = sanitizeCssColor(hex);
    if (!safeHex) return;
    const chip = document.createElement("div");
    chip.className = "custom-color-chip";
    const swatch = document.createElement("span");
    swatch.className = "custom-color-swatch";
    swatch.style.background = safeHex;
    const label = document.createElement("span");
    label.textContent = safeHex;
    chip.appendChild(swatch);
    chip.appendChild(label);
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
      const rawName = String(m && m.name ? m.name : "");
      const safeName = escapeHtml(rawName);
      const safeColors = Array.isArray(m && m.colors)
        ? m.colors.map(sanitizeCssColor).filter(Boolean)
        : [];
      let styleStr = "";
      let innerContent = "";
      const isSpecial = [
        "Bronze",
        "Argent",
        "Or",
        "Diamant",
        "Rubis",
        "Saphir",
      ].includes(rawName);

      if (safeColors.length) {
        if (
          rawName &&
          (rawName.startsWith("Médaille") || rawName === "Tricheur")
        ) {
          safeColors.forEach((c, i) => (styleStr += `--grad${i + 1}: ${c}; `));
        } else if (
          !isSpecial &&
          rawName !== "Légendaire" &&
          rawName !== "Rainbow"
        ) {
          const bg =
            safeColors.length > 1
              ? `linear-gradient(120deg, ${safeColors[0]} 30%, ${safeColors[1]} 60%)`
              : safeColors[0];
          styleStr = `background: ${bg} !important; border: 5px solid #fff;`;
        }
      }

      if (rawName === "Légendaire") {
        innerContent = '<div class="medal-index">7</div>';
      } else if (rawName && /^Médaille\s+Prestige/i.test(rawName)) {
        const match = rawName.match(/Médaille\s+Prestige\s*[-–:]?\s*(\d+)/i);
        const num = match
          ? match[1]
          : rawName
              .replace(/Médaille\s+Prestige/i, "")
              .replace(/[^0-9]/g, "")
              .trim() || "";
        innerContent = `<div class="medal-index">${num}</div>`;
      } else if (rawName && rawName.startsWith("Médaille")) {
        const num = rawName.replace("Médaille ", "");
        innerContent = `<div class="medal-index">${num}</div>`;
      } else if (rawName === "Tricheur") {
        innerContent =
          '<div class="medal-index"><i class="fa-solid fa-ban"></i></div>';
      }

      const titleContent =
        safeColors.length > 0
          ? `${rawName}\n${safeColors.join("\n")}`
          : rawName;
      const nameAttr = rawName ? `data-name="${safeName}"` : "";
      const shownClass = "shown";

      return `<div class="medal ${shownClass}" ${nameAttr} style="${styleStr}" title="${escapeHtml(
        titleContent,
      )}">${innerContent}</div>`;
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
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = b.id || "";
    if (selected.has(b.id)) input.checked = true;
    const emoji = document.createElement("span");
    emoji.className = "badge-emoji";
    emoji.textContent = b.emoji || "🏷️";
    const label = document.createElement("span");
    label.textContent = b.name || b.id || "";
    row.appendChild(input);
    row.appendChild(emoji);
    row.appendChild(label);
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
