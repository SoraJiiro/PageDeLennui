// UI pour modification des multiplicateurs de guerre de clans (admin)
// À inclure dans index_admin.html

import { notify } from "./notifications.js";

const MULTIPLIERS_CONTAINER_ID = "admin-clanwar-multipliers";

function createMultipliersUI() {
  const container = document.createElement("section");
  container.className = "admin-section";
  container.style.order = 99;
  container.innerHTML = `
    <h2><i class="fa-solid fa-bolt"></i> Multiplicateurs Guerre de Clans</h2>
    <div id="clanwar-multipliers-list">Chargement...</div>
  `;
  container.id = MULTIPLIERS_CONTAINER_ID;
  return container;
}

function renderMultipliers(multipliers) {
  const listDiv = document.getElementById("clanwar-multipliers-list");
  if (!listDiv) return;
  listDiv.innerHTML = "";
  Object.entries(multipliers).forEach(([game, value]) => {
    const row = document.createElement("div");
    row.className = "clanwar-mult-row";
    row.innerHTML = `
      <span class="clanwar-mult-game">${game}</span>
      <input type="number" min="0.01" step="0.01" value="${value}" data-game="${game}" class="clanwar-mult-input" style="width:80px;" />
      <button class="clanwar-mult-save" data-game="${game}"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
    `;
    listDiv.appendChild(row);
  });
}

function setupMultipliersEvents(socket) {
  document
    .getElementById("clanwar-multipliers-list")
    .addEventListener("click", function (e) {
      if (e.target.classList.contains("clanwar-mult-save")) {
        const game = e.target.getAttribute("data-game");
        const input = document.querySelector(
          `input.clanwar-mult-input[data-game="${game}"]`,
        );
        if (!input) return;
        const value = parseFloat(input.value);
        if (!game || isNaN(value) || value <= 0) {
          notify("Valeur invalide", 3000, "error");
          return;
        }
        socket.emit("admin:clanwar:set_multiplier", { game, value });
      }
    });
}

export function initClanwarMultipliersUI(socket) {
  // Ajouter la section à la page admin
  const adminSections = document.querySelector(".admin-sections");
  if (!adminSections || document.getElementById(MULTIPLIERS_CONTAINER_ID))
    return;
  const section = createMultipliersUI();
  adminSections.appendChild(section);

  // Récupérer la liste initiale
  socket.emit("clanwar:multipliers:get");

  // Réception des maj
  socket.on("clanwar:multipliers:update", renderMultipliers);
  socket.on("admin:clanwar:set_multiplier:result", (res) => {
    if (res.success) {
      notify(res.message || "Multiplicateur modifié", 2000, "success");
    } else {
      notify(res.message || "Erreur", 3000, "error");
    }
  });

  setupMultipliersEvents(socket);
}
