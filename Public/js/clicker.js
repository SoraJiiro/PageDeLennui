import { showNotif, requestPassword } from "./util.js";

export function initClicker(socket) {
  // ---------- Cache UI ----------
  const ui = {
    zone: document.querySelector(".zone"),
    acpsEl: document.querySelector(".acps"),
    resetBtn: document.querySelector(".reset"),
    medalsWrap: document.querySelector(".medals-wrap"),
    yourScoreEl: document.getElementById("your-score"),
    cpsHumainEl: document.querySelector(".cps-humain"),
    regenBtn: document.querySelector(".regen-colors-btn"),
    sidebarMoneyEl: document.querySelector("h3.money"),
  };

  // ---------- Etat local ----------
  const state = {
    scoreActuel: 0,
    cpsActuel: 0,
    timeAutoClicks: null,
    medalsDebloquees: new Set(),
    clicksManuels: [],
    cpsHumain: 0,
    timerHumain: null,
    myPseudo: null,
    medalsInitialized: false,
  };

  // ---------- Global Functions for Donation Modal ----------
  window.openDonateModal = () => {
    document.getElementById("donate-modal").style.display = "flex";
    document.getElementById("donate-recipient").focus();
  };

  window.closeDonateModal = () => {
    document.getElementById("donate-modal").style.display = "none";
    document.getElementById("donate-recipient").value = "";
    document.getElementById("donate-amount").value = "";
  };

  window.submitDonate = () => {
    const recipient = document.getElementById("donate-recipient").value.trim();
    const amount = parseInt(document.getElementById("donate-amount").value);

    if (!recipient) {
      showNotif("Veuillez entrer un pseudo.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showNotif("Montant invalide.");
      return;
    }

    socket.emit("user:donate", { recipient, amount });
    window.closeDonateModal();
  };

  // ---------- Storage manager (Désactivé / Nettoyage) ----------
  function cleanupStorage() {
    if (state.myPseudo) {
      localStorage.removeItem(`autoCPS_${state.myPseudo}`);
    }
    localStorage.removeItem("autoCPS");
  }

  // ---------- Médailles de base ----------
  let medalsList = [
    // Médaille spéciale pour scores négatifs
    {
      nom: "Tricheur",
      icon: "🚫",
      pallier: -1,
      cps: 0,
      couleurs: ["#dcdcdc", "#ffffff", "#222", "#dcdcdc", "#ffffff", "#222"],
    },
    { nom: "Bronze", icon: "🥉", pallier: 2500, cps: 1 },
    { nom: "Argent", icon: "🥈", pallier: 5000, cps: 3 },
    { nom: "Or", icon: "🥇", pallier: 10000, cps: 5 },
    { nom: "Diamant", icon: "💎", pallier: 20000, cps: 7 },
    { nom: "Rubis", icon: "❤️‍🔥", pallier: 40000, cps: 9 },
    { nom: "Saphir", icon: "💠", pallier: 80000, cps: 11 },
    { nom: "Légendaire", icon: "👑", pallier: 160000, cps: 13 },
  ];

  ui.medalsWrap.querySelectorAll(".medal").forEach((el) => {
    const medalData = medalsList.find((m) => m.nom === el.dataset.name);
    if (!medalData) return;

    el.setAttribute(
      "title",
      `${medalData.nom} ${medalData.icon}\nPalier : ${medalData.pallier
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")} clics\nCPS auto : ${medalData.cps}`,
    );
  });

  // ---------- Génération prestige différée (plus de couleurs random visibles au reload) ----------
  const TOTAL_PRESTIGE = 14; // Médaille Préstige - 8 .. -21

  function buildPrestigeListIfNeeded() {
    // Créer des entrées sans couleurs (elles seront appliquées depuis la sauvegarde)
    if (!medalsList.find((m) => m.nom.startsWith("Médaille Prestige"))) {
      let precedente = medalsList[medalsList.length - 1];
      for (let idx = 8; idx <= TOTAL_PRESTIGE + 7; idx++) {
        // Calcul pallier/cps identique à l'ancienne logique
        let pallierTemp = precedente.pallier * 2;
        let pallier = Math.ceil(pallierTemp * 0.78 - 6500);
        let cps = precedente.cps + 2;
        const entry = {
          nom: `Médaille Prestige - ${idx}`,
          icon: "[⭐]",
          pallier,
          cps,
          couleurs: [],
        };
        medalsList.push(entry);
        precedente = entry;
      }
    }
  }
  buildPrestigeListIfNeeded();

  // ---------- Helper Calcul Bonus CPS (Médailles Full Black / Full White) ----------
  function getPrestigeBonusCPS() {
    let bonus = 0;
    // On parcourt toutes les médailles prestige DÉBLOQUÉES
    state.medalsDebloquees.forEach((nom) => {
      if (!nom.startsWith("Médaille Prestige")) return;
      const m = medalsList.find((x) => x.nom === nom);
      if (!m || !m.couleurs || m.couleurs.length === 0) return;

      let isFullBlack = true;
      let isFullWhite = true;

      for (const colorStr of m.couleurs) {
        // On s'attend à du "hsl(H, S%, L%)"
        // Regex simple pour chopper le L
        const match = /hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/.exec(colorStr);
        if (match) {
          const l = parseInt(match[1], 10);
          if (l > 10) isFullBlack = false;
          if (l < 90) isFullWhite = false;
        } else {
          // Format inconnu => on invalide
          isFullBlack = false;
          isFullWhite = false;
        }
      }

      if (isFullBlack || isFullWhite) {
        bonus += 50;
      }
    });
    return bonus;
  }

  function createMedalElement(m, index, savedColors = null) {
    const existingEl = ui.medalsWrap.querySelector(`[data-name="${m.nom}"]`);
    if (existingEl) {
      if (savedColors && Array.isArray(savedColors)) {
        savedColors.forEach((c, idx) => {
          existingEl.style.setProperty(`--grad${idx + 1}`, c);
        });
        m.couleurs = savedColors.slice();
      }
      return;
    }

    const el = document.createElement("div");
    const indexSpan = document.createElement("span");
    indexSpan.className = "medal-index";
    // Afficher l'index seulement si médaille débloquée (on le mettra plus tard)
    indexSpan.textContent = "";
    indexSpan.setAttribute("aria-hidden", "true");
    el.appendChild(indexSpan);
    // Par défaut : caché pour les médailles normales. Pour 'Tricheur', on cache via display:none
    // pour qu'elle n'ait pas le style "non débloquée".
    if (m.nom === "Tricheur") {
      el.classList.add("medal");
      el.style.display = "none";
    } else {
      el.classList.add("medal", "hidden");
    }
    el.dataset.name = m.nom;
    el.dataset.index = (index + 1).toString();
    el.setAttribute(
      "title",
      `${m.nom} ${m.icon}\nPalier : ${m.pallier
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")} clics\nCPS auto : ${m.cps}`,
    );
    // Accessibilité: chaque médaille agit comme une image décorative informative.
    el.setAttribute("role", "img");

    // Appliquer couleurs sauvegardées prestige si présentes
    if (savedColors && Array.isArray(savedColors)) {
      savedColors.forEach((c, idx) => {
        el.style.setProperty(`--grad${idx + 1}`, c);
      });
      m.couleurs = savedColors.slice();
    }

    // Si la médaille a des couleurs prédéfinies (ex: Tricheur), les appliquer
    if (
      (!savedColors || savedColors.length === 0) &&
      Array.isArray(m.couleurs) &&
      m.couleurs.length > 0
    ) {
      m.couleurs.forEach((c, idx) =>
        el.style.setProperty(`--grad${idx + 1}`, c),
      );
    }

    // Si pas de couleurs (nouvelle médaille non sauvegardée), générer maintenant (évite flicker ultérieur)
    if (
      m.couleurs &&
      m.couleurs.length === 0 &&
      m.nom.startsWith("Médaille Prestige")
    ) {
      const temp = [];
      // 8.5% monochrome
      const isMonochrome = Math.random() < 0.085;
      // Chance RÉDUITE (ex: 0.2%) pour Full Black / White à la génération initiale
      const isUltraRare = Math.random() < 0.002;

      const theme = isUltraRare
        ? Math.random() < 0.5
          ? "black"
          : "white"
        : isMonochrome
          ? "mono"
          : "random";

      while (temp.length < 12) {
        let c;
        if (theme === "black") {
          c = `hsl(0, 0%, ${Math.floor(Math.random() * 10)}%)`;
        } else if (theme === "white") {
          c = `hsl(0, 0%, ${90 + Math.floor(Math.random() * 10)}%)`;
        } else if (theme === "mono") {
          c = `hsl(0, 0%, ${Math.floor(Math.random() * 100)}%)`;
        } else {
          const h = Math.floor(Math.random() * 360);
          const s = 70 + Math.floor(Math.random() * 25);
          const l = 35 + Math.floor(Math.random() * 20);
          c = `hsl(${h}, ${s}%, ${l}%)`;
        }
        temp.push(c);
      }
      temp.forEach((c, idx) => el.style.setProperty(`--grad${idx + 1}`, c));
      m.couleurs = temp;
    }

    // Définir aria-label après éventuelle génération / application des couleurs
    const couleursSlice = (m.couleurs || []).slice(0, 3).join(", ");
    const couleursPart = couleursSlice
      ? ` Couleurs: ${couleursSlice}${m.couleurs.length > 3 ? ", …" : ""}.`
      : "";
    el.setAttribute(
      "aria-label",
      `${m.nom} - Rang ${(index + 1).toString()} - Palier ${m.pallier
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")} clics - CPS auto ${m.cps}.${couleursPart}`,
    );

    // Timing animation prestige (après la 7ème base)
    if (index >= 7) {
      const delay = (index - 6) * 0.3;
      el.style.animationDelay = `${delay}s`;
      el.style.setProperty("--rainbow-delay", `${delay}s`);
    }

    // Placer la médaille en première position si c'est la première de la liste
    if (index === 0 && ui.medalsWrap.firstChild) {
      ui.medalsWrap.insertBefore(el, ui.medalsWrap.firstChild);
    } else {
      ui.medalsWrap.appendChild(el);
    }
  }

  // ---------- Auto click ----------
  function setAutoClick(cps) {
    if (state.timeAutoClicks) clearInterval(state.timeAutoClicks);
    state.cpsActuel = cps;

    if (ui.acpsEl) ui.acpsEl.textContent = cps > 0 ? `+ ${cps} cps` : "";
    if (cps > 0) {
      state.timeAutoClicks = setInterval(() => {
        for (let i = 0; i < cps; i++) socket.emit("clicker:click");
      }, 2250);
    }
  }

  function stopAutoClicks() {
    if (state.timeAutoClicks) clearInterval(state.timeAutoClicks);
    state.timeAutoClicks = null;
    state.cpsActuel = 0;
    if (ui.acpsEl) ui.acpsEl.textContent = "";
  }

  // ---------- Animations et notifications ----------
  function bumpZone() {
    ui.zone?.classList.add("temp");
    setTimeout(() => ui.zone?.classList.remove("temp"), 120);
  }

  // ---------- Vérif + déblocage de médailles ----------
  function verifMedals(score) {
    if (!state.medalsInitialized) return;

    let medalCible = null;
    // Si score négatif, cibler la médaille spéciale Tricheur
    if (typeof score === "number" && score < 0) {
      medalCible = medalsList.find((m) => m.nom === "Tricheur") || null;
    } else {
      for (let i = medalsList.length - 1; i >= 0; i--) {
        // Ignorer la médaille Tricheur lors du calcul normal
        if (medalsList[i].nom === "Tricheur") continue;
        if (score >= medalsList[i].pallier) {
          medalCible = medalsList[i];
          break;
        }
      }
    }

    if (medalCible) {
      medalsList.forEach((m) => {
        const medalEl = ui.medalsWrap?.querySelector(
          `.medal[data-name="${m.nom}"]`,
        );
        if (!medalEl) return;

        // Spécial: n'afficher "Tricheur" que pour score négatif ou si déjà débloquée
        if (m.nom === "Tricheur") {
          const isUnlocked = state.medalsDebloquees.has(m.nom);
          if (score < 0 || isUnlocked) {
            medalEl.classList.add("shown");
            medalEl.classList.remove("hidden");
            medalEl.style.display = ""; // S'assurer qu'elle est visible

            if (score < 0 && !isUnlocked) {
              state.medalsDebloquees.add(m.nom);
              socket.emit("clicker:medalUnlock", {
                medalName: m.nom,
                colors: m.couleurs || [],
              });
              showNotif(`🏅 ${m.nom} débloquée ! ${m.icon}`);
            }
            document.querySelector(
              ".medal[data-name=Tricheur] .medal-index",
            ).textContent = "T";
          } else {
            medalEl.classList.remove("shown");
            medalEl.classList.add("hidden");
            medalEl.style.display = "none"; // La cacher complètement si pas débloquée
            const idxSpan = medalEl.querySelector(".medal-index");
            if (idxSpan) idxSpan.textContent = "";
          }
          return;
        }

        if (m.pallier <= medalCible.pallier) {
          medalEl.classList.add("shown");
          medalEl.classList.remove("hidden");

          if (!state.medalsDebloquees.has(m.nom)) {
            state.medalsDebloquees.add(m.nom);
            socket.emit("clicker:medalUnlock", {
              medalName: m.nom,
              colors: m.couleurs || [],
            });
            if (m === medalCible)
              showNotif(`🏅 ${m.nom} débloquée ! ${m.icon}`);
          }
        }
      });

      // Trouver la meilleure médaille parmi celles débloquées pour déterminer le CPS
      const bestMedal = medalsList
        .filter((m) => state.medalsDebloquees.has(m.nom))
        .sort((a, b) => b.pallier - a.pallier)[0];

      let cpsToUse = bestMedal ? bestMedal.cps : 0;
      // Ajouter bonus Prestige
      cpsToUse += getPrestigeBonusCPS();

      if (cpsToUse !== state.cpsActuel) setAutoClick(cpsToUse);
    }
  }

  // ---------- Reset avec vérification mot de passe ----------
  async function resetProgress() {
    // Ne pas autoriser le reset si le score affiché est négatif
    if (state.scoreActuel < 0) {
      showNotif("⚠️ Impossible de réinitialiser : ton score est négatif");
      return;
    }
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir tout réinitialiser ?\nTon score, tes médailles et ton CPS auto seront perdus !",
    );
    if (!confirmReset) return;

    const password = await requestPassword();
    if (!password) {
      showNotif("❌ Réinitialisation annulée");
      return;
    }

    try {
      const res = await fetch("/api/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showNotif("❌ Mot de passe incorrect !");
        return;
      }

      socket.emit("clicker:reset");
      stopAutoClicks();
      state.scoreActuel = 0;
      state.medalsDebloquees.clear();

      if (ui.yourScoreEl) ui.yourScoreEl.textContent = "0";
      if (ui.acpsEl) ui.acpsEl.textContent = "";
      ui.medalsWrap?.querySelectorAll(".medal").forEach((m) => {
        m.classList.remove("shown");
        m.classList.add("hidden");
      });

      showNotif("🔄 Progression réinitialisée avec succès !");
    } catch (err) {
      showNotif("⚠️ Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  }

  // ---------- Ecouteurs UI ----------
  ui.resetBtn?.addEventListener("click", resetProgress);

  if (ui.zone) {
    ui.zone.addEventListener("click", () => {
      socket.emit("clicker:click");
      bumpZone();

      const mtn = Date.now();
      state.clicksManuels.push(mtn);
      state.clicksManuels = state.clicksManuels.filter((t) => mtn - t < 1000);
      state.cpsHumain = state.clicksManuels.length;
      clearTimeout(state.timerHumain);
      state.timerHumain = setTimeout(() => (state.cpsHumain = 0), 1100);
    });
  }

  // ---------- Regen Colors ----------
  ui.regenBtn?.addEventListener("click", () => {
    if (state.scoreActuel < 1000000) {
      showNotif("❌ Pas assez de clicks ! (1 000 000 requis)");
      return;
    }

    if (
      !confirm(
        "🎨 Veux-tu dépenser 1 000 000 clicks pour régénérer les couleurs de tes médailles Prestige ?",
      )
    )
      return;

    const newColorsMap = {};
    // Régénérer uniquement pour les médailles prestige débloquées
    state.medalsDebloquees.forEach((name) => {
      if (name.startsWith("Médaille Prestige")) {
        const colors = [];
        // 8.5% de chance pour Monochrome (Noir/Blanc/Gris)
        const isMonochrome = Math.random() < 0.085;
        // 0.2% de chance pour Noir Pur ou Blanc Pur (Ultra Rare) (Réduit de 4.5%)
        const isUltraRare = Math.random() < 0.002;

        const theme = isUltraRare
          ? Math.random() < 0.5
            ? "black"
            : "white"
          : isMonochrome
            ? "mono"
            : "random";

        while (colors.length < 12) {
          let c;
          if (theme === "black") {
            c = `hsl(0, 0%, ${Math.floor(Math.random() * 10)}%)`;
          } else if (theme === "white") {
            c = `hsl(0, 0%, ${90 + Math.floor(Math.random() * 10)}%)`;
          } else if (theme === "mono") {
            c = `hsl(0, 0%, ${Math.floor(Math.random() * 100)}%)`;
          } else {
            const h = Math.floor(Math.random() * 360);
            const s = 70 + Math.floor(Math.random() * 25);
            const l = 35 + Math.floor(Math.random() * 20);
            c = `hsl(${h}, ${s}%, ${l}%)`;
          }
          colors.push(c);
        }
        newColorsMap[name] = colors;
      }
    });

    // Si aucune médaille prestige débloquée, on prévient
    if (Object.keys(newColorsMap).length === 0) {
      showNotif("⚠️ Tu n'as aucune médaille Prestige à régénérer !");
      return;
    }

    socket.emit("clicker:buyColorRegen", { newColors: newColorsMap });
  });

  // ---------- Events socket ----------
  socket.on("you:name", (pseudo) => {
    const oldPseudo = state.myPseudo;
    state.myPseudo = pseudo;

    // Si on change de compte, réinitialiser le CPS auto
    if (oldPseudo && oldPseudo !== pseudo) {
      stopAutoClicks();
      // Le CPS sera restauré lors de la réception de clicker:medals
    }

    // Nettoyage préventif du localStorage pour éviter les conflits
    cleanupStorage();
  });

  socket.on("clicker:you", ({ score }) => {
    state.scoreActuel = score;
    bumpZone();
    if (ui.zone)
      ui.zone.innerHTML = `<i>${Number(score)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0")}</i>`;
    ui.sidebarMoneyEl.innerHTML = `<i
                            class="fa-solid fa-money-bill"></i> ${Number(score)
                              .toLocaleString("fr-FR")
                              .replace(/\s/g, "\u00a0")} C`;
    if (ui.yourScoreEl)
      ui.yourScoreEl.textContent = Number(score)
        .toLocaleString("fr-FR")
        .replace(/\s/g, "\u00a0");
    verifMedals(score);
  });

  socket.on("clicker:medals", (userMedals) => {
    // Construire la liste prestige (si non faite) AVANT mappage couleurs sauvegardées
    buildPrestigeListIfNeeded();
    // userMedals peut être un tableau de strings (noms) OU d'objets { name, colors }
    const entries = Array.isArray(userMedals) ? userMedals : [];
    const names = entries
      .map((m) => (typeof m === "string" ? m : m?.name))
      .filter(Boolean);
    const colorMap = {};
    entries.forEach((m) => {
      if (m && typeof m === "object" && Array.isArray(m.colors) && m.name) {
        colorMap[m.name] = m.colors;
      }
    });
    state.medalsInitialized = true;

    state.medalsDebloquees = new Set(names);

    // Créer / mettre à jour les éléments DOM des médailles
    medalsList.forEach((m, idx) => {
      createMedalElement(m, idx, colorMap[m.nom]);
      const el = ui.medalsWrap?.querySelector(`.medal[data-name="${m.nom}"]`);
      if (!el) return;
      if (names.includes(m.nom)) {
        el.classList.add("shown");
        el.classList.remove("hidden");
        // Force display pour Tricheur (qui est display:none par défaut)
        if (m.nom === "Tricheur") el.style.display = "";

        const idxSpan = el.querySelector(".medal-index");
        if (idxSpan) {
          if (m.nom === "Tricheur") {
            idxSpan.textContent = "T";
          } else if (!idxSpan.textContent) {
            idxSpan.textContent = idx.toString();
          }
        }
      } else {
        el.classList.remove("shown");
        el.classList.add("hidden");
        // Cacher complètement Tricheur si pas débloquée
        if (m.nom === "Tricheur") el.style.display = "none";

        const idxSpan = el.querySelector(".medal-index");
        if (idxSpan) idxSpan.textContent = "";
      }
    });

    const medaillePlusHaute = medalsList
      .filter((m) => names.includes(m.nom))
      .sort((a, b) => b.pallier - a.pallier)[0];

    // On fait confiance au serveur : le CPS est déterminé par la meilleure médaille possédée
    // Cela permet de corriger le CPS si l'admin a retiré des médailles/clicks
    let highestCps = medaillePlusHaute ? medaillePlusHaute.cps : 0;
    // Ajout du bonus prestige si full black/white
    highestCps += getPrestigeBonusCPS();

    // Vérifier si le score actuel mérite d'autres médailles (sync)
    verifMedals(state.scoreActuel);
    setAutoClick(highestCps);
  });

  // Événement forcé par l'admin pour nettoyer le localStorage
  socket.on("clicker:forceReset", () => {
    stopAutoClicks();
    state.scoreActuel = 0;
    state.medalsDebloquees.clear();
    if (ui.yourScoreEl) ui.yourScoreEl.textContent = "0";
    if (ui.acpsEl) ui.acpsEl.textContent = "";
    if (ui.zone) ui.zone.innerHTML = `<i>0</i>`;
    ui.medalsWrap?.querySelectorAll(".medal").forEach((m) => {
      m.classList.remove("shown");
      m.classList.add("hidden");
      const idxSpan = m.querySelector(".medal-index");
      if (idxSpan) idxSpan.textContent = "";
    });

    showNotif("⚠️ Tes stats Clicker ont été réinitialisées par un admin");
  });

  // ---------- Affichage CPS humain ----------
  setInterval(() => {
    if (ui.cpsHumainEl)
      ui.cpsHumainEl.textContent =
        state.cpsHumain >= 0 ? `${state.cpsHumain.toFixed(1)} CPS` : "0.0 CPS";
  }, 750);

  // ---------- Pénalité Tricheur ----------
  setInterval(() => {
    if (state.medalsDebloquees.has("Tricheur")) {
      socket.emit("clicker:penalty");
    }
  }, 15000);
}
