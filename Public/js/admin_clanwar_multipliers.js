// UI pour modification des multiplicateurs de guerre de clans (admin)
// À inclure dans index_admin.html

import { showStatusNotification } from "./notifications.js";

const MULTIPLIERS_CONTAINER_ID = "admin-clanwar-multipliers";

function createMultipliersUI() {
  const container = document.createElement("section");
  container.className = "admin-section";
  container.style.order = 99;
  container.innerHTML = `
    <h2><i class="fa-solid fa-bolt"></i> Multiplicateurs Guerre de Clans</h2>
    <div id="clanwar-multipliers-list" style="display: flex; flex-direction: column; gap: 10px;">Chargement...</div>
    <div style="margin-top:10px; display:flex; gap:8px; align-items:center; justify-content:center;">
      <button id="clanwar-save-all" class="btn">Enregistrer tout</button>
    </div>
    <div id="clanwar-boosts" style="margin-top:12px; padding:8px; border:1px solid #333; background:#0f0f0f; border-radius:6px;">
      <div style="font-weight:700; margin-bottom:6px;">Boost temporaire (Admin)</div>
      <div style="display:flex; gap:8px; align-items:center;">
        <div class="form-field" style="display:inline-block; vertical-align:middle;">
          <select id="clanwar-boost-clan">
            <option value="SLAM">SLAM</option>
            <option value="SISR">SISR</option>
          </select>
        </div>
        <div class="form-field" style="display:inline-block; vertical-align:middle; margin-left:8px;">
          <input id="clanwar-boost-mult" type="number" step="0.1" min="0.1" placeholder="x multiplier" style="width:140px;" />
        </div>
        <button id="clanwar-boost-apply" class="btn">Donner boost</button>
        <button id="clanwar-boost-clear" class="btn-red" style="margin-left:6px;">Retirer boost</button>
        <div id="clanwar-boost-status" style="margin-left:8px; opacity:.8"></div>
      </div>
    </div>
  `;
  container.id = MULTIPLIERS_CONTAINER_ID;
  return container;
}

function renderMultipliers(multipliers) {
  const listDiv = document.getElementById("clanwar-multipliers-list");
  if (!listDiv) return;
  listDiv.innerHTML = "";
  Object.entries(multipliers).forEach(([game, value]) => {
    if (game.endsWith("15") || game.endsWith("30") || game.endsWith("60"))
      game += " s";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.className = "clanwar-mult-row";
    row.innerHTML = `
      <span class="clanwar-mult-game" style="font-weight:700;text-transform:uppercase;">${game.replace("_", " ")}</span>
        <div class="form-field" style="display:inline-block; margin-left:12px; vertical-align:middle;">
        <input type="number" min="0.01" step="0.01" value="${value}" data-game="${game}" class="clanwar-mult-input" style="width:140px;" />
      </div>
    `;
    listDiv.appendChild(row);
  });
}

function setupMultipliersEvents(socket) {
  const sock = socket || window.adminSocket;
  if (!sock) {
    console.warn("admin_clanwar_multipliers: socket unavailable for events");
  }
  // Save all button
  const saveBtn = document.getElementById("clanwar-save-all");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const inputs = Array.from(
        document.querySelectorAll("input.clanwar-mult-input"),
      );
      const payload = {};
      for (const inp of inputs) {
        const g = inp.getAttribute("data-game");
        const v = Number(inp.value);
        if (!g || !Number.isFinite(v) || v <= 0) {
          showStatusNotification(
            `Valeur invalide pour ${g || "jeu"}`,
            "error",
            3000,
          );
          return;
        }
        payload[g] = v;
      }
      try {
        console.debug(
          "admin_clanwar_multipliers: emit admin:clanwar:set_multipliers",
          payload,
        );
        (sock || socket).emit("admin:clanwar:set_multipliers", {
          multipliers: payload,
        });
      } catch (e) {
        console.error("emit error", e);
      }
    });
  }

  // Boost apply
  const boostBtn = document.getElementById("clanwar-boost-apply");
  if (boostBtn) {
    boostBtn.addEventListener("click", () => {
      const clan = document.getElementById("clanwar-boost-clan")?.value;
      const mult = Number(document.getElementById("clanwar-boost-mult")?.value);
      if (!clan || !Number.isFinite(mult) || mult <= 0) {
        showStatusNotification("Paramètres de boost invalides", "error", 3000);
        return;
      }
      // Pas de durée : le boost persiste jusqu'à suppression
      try {
        console.debug(
          "admin_clanwar_multipliers: emit admin:clanwar:set_clan_boost",
          { clan, multiplier: mult },
        );
        (sock || socket).emit("admin:clanwar:set_clan_boost", {
          clan,
          multiplier: mult,
        });
      } catch (e) {
        console.error("emit error", e);
      }
    });
  }

  // Boost clear
  const boostClearBtn = document.getElementById("clanwar-boost-clear");
  if (boostClearBtn) {
    boostClearBtn.addEventListener("click", () => {
      const clan = document.getElementById("clanwar-boost-clan")?.value;
      if (!clan) {
        showStatusNotification("Choisissez un clan", "error", 2000);
        return;
      }
      try {
        console.debug(
          "admin_clanwar_multipliers: emit admin:clanwar:clear_clan_boost",
          { clan },
        );
        (sock || socket).emit("admin:clanwar:clear_clan_boost", { clan });
      } catch (e) {
        console.error("emit error", e);
      }
    });
  }
}

export function initClanwarMultipliersUI(socket) {
  // Ajouter la section à la page admin
  // Ne pas afficher pour la vue modérateur
  if (window.location.search && window.location.search.includes("view=mod"))
    return;

  // Chercher la section Guerre des Clans (celle avec l'input admin-clanwar-badge-name)
  const clanwarInput = document.getElementById("admin-clanwar-badge-name");
  if (!clanwarInput || document.getElementById(MULTIPLIERS_CONTAINER_ID))
    return;
  // Trouver le parent direct de la section (admin-section)
  let parentSection = clanwarInput.closest(".admin-section");
  if (!parentSection) {
    // fallback: insérer dans .admin-sections
    parentSection = document.querySelector(".admin-sections");
    if (!parentSection) return;
  }
  const section = createMultipliersUI();
  // Insérer juste après le bloc de contrôle (après les boutons COMMENCER/FINIR)
  // Chercher le bouton FINIR MAINTENANT
  const finishBtn = parentSection.querySelector(
    'button[onclick="clanWarFinish()"]',
  );
  if (finishBtn && finishBtn.parentElement) {
    // Insérer après le parent du bouton (div.form-field)
    finishBtn.parentElement.insertAdjacentElement("afterend", section);
  } else {
    // fallback: à la fin de la section
    parentSection.appendChild(section);
  }
  // Récupérer la liste initiale — demander après connexion si nécessaire
  let multipliersTimeout = null;
  const requestMultipliers = () => {
    try {
      if (socket && socket.connected) {
        socket.emit("clanwar:multipliers:get");
      } else if (socket) {
        socket.once("connect", () => {
          try {
            socket.emit("clanwar:multipliers:get");
          } catch (e) {}
        });
      }
    } catch (e) {
      console.warn(e);
    }
    // Timeout d'attente d'une réponse
    multipliersTimeout = setTimeout(() => {
      const listDiv = document.getElementById("clanwar-multipliers-list");
      if (
        listDiv &&
        listDiv.textContent &&
        listDiv.textContent.includes("Chargement")
      ) {
        listDiv.innerHTML =
          '<div style="opacity:.8">Impossible de charger les multiplicateurs — vérifier la console.</div>';
      }
    }, 4000);
  };

  // Réception des maj
  socket.on("clanwar:multipliers:update", (m) => {
    try {
      if (multipliersTimeout) {
        clearTimeout(multipliersTimeout);
        multipliersTimeout = null;
      }
    } catch (e) {}
    renderMultipliers(m || {});
  });
  socket.on("clanwar:boosts:update", (b) => {
    try {
      const status = document.getElementById("clanwar-boost-status");
      if (!status) return;
      if (!b || typeof b !== "object") {
        status.textContent = "";
        return;
      }
      const parts = [];
      for (const k of Object.keys(b)) {
        const v = b[k] || {};
        const mult = Number(v.multiplier) || 1;
        if (mult <= 1) continue;
        if (v.remainingMs === null) {
          parts.push(`${k}: x${mult.toFixed(2)} (persistant)`);
          continue;
        }
        const rem = Math.max(0, Number(v.remainingMs) || 0);
        if (rem > 0)
          parts.push(`${k}: x${mult.toFixed(2)} (${Math.ceil(rem / 1000)}s)`);
      }
      status.textContent = parts.length
        ? parts.join(" — ")
        : "Aucun boost actif";
    } catch (e) {
      // noop
    }
  });
  socket.on("admin:clanwar:set_multiplier:result", (res) => {
    if (res.success) {
      showStatusNotification(
        res.message || "Multiplicateur modifié",
        "success",
        2000,
      );
    } else {
      showStatusNotification(res.message || "Erreur", "error", 3000);
    }
  });
  socket.on("admin:clanwar:set_multipliers:result", (res) => {
    if (res.success) {
      showStatusNotification(
        `Multiplicateurs mis à jour (${res.changed || 0})`,
        "success",
        2000,
      );
    } else {
      showStatusNotification(
        res.message || "Erreur mise à jour",
        "error",
        3000,
      );
    }
  });
  socket.on("admin:clanwar:set_clan_boost:result", (res) => {
    if (res.success) {
      showStatusNotification(res.message || "Boost appliqué", "success", 2000);
      // refresh boosts
      try {
        socket.emit("clanwar:boosts:get");
      } catch (e) {}
    } else {
      showStatusNotification(res.message || "Erreur boost", "error", 3000);
    }
  });
  socket.on("admin:clanwar:clear_clan_boost:result", (res) => {
    if (res && res.success) {
      showStatusNotification(res.message || "Boost retiré", "success", 2000);
      try {
        socket.emit("clanwar:boosts:get");
      } catch (e) {}
    } else {
      showStatusNotification(
        (res && res.message) || "Erreur retrait boost",
        "error",
        3000,
      );
    }
  });
  setupMultipliersEvents(socket);

  // Lancer la requête initiale
  requestMultipliers();
  // demander aussi l'état des boosts
  try {
    socket.emit("clanwar:boosts:get");
  } catch (e) {}
}
