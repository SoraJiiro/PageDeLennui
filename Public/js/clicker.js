import { showNotif } from "./util.js";

export function initClicker(socket) {
  // ---------- Cache UI ----------
  const ui = {
    zone: document.querySelector(".zone"),
    acpsEl: document.querySelector(".acps"),
    resetBtn: document.querySelector(".reset"),
    medalsWrap: document.querySelector(".medals-wrap"),
    yourScoreEl: document.getElementById("your-score"),
    cpsHumainEl: document.querySelector(".cps-humain"),
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
  };

  // ---------- Storage manager ----------
  function getStorageKey() {
    return state.myPseudo ? `autoCPS_${state.myPseudo}` : "autoCPS";
  }
  function getSavedCPS() {
    const v = parseInt(localStorage.getItem(getStorageKey()));
    return isNaN(v) ? 0 : v;
  }
  function saveCPS(cps) {
    if (typeof cps === "number" && cps > 0) {
      localStorage.setItem(getStorageKey(), String(cps));
    }
  }
  function clearSavedCPS() {
    localStorage.removeItem(getStorageKey());
  }

  // ---------- Médailles de base ----------
  let medalsList = [
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
      `${medalData.nom} ${
        medalData.icon
      }\nPalier : ${medalData.pallier.toLocaleString()} clics\nCPS auto : ${
        medalData.cps
      }`
    );
  });

  // ---------- Génération prestige différée (plus de couleurs random visibles au reload) ----------
  const TOTAL_PRESTIGE = 14; // Médaille Préstige - 8 .. -21

  function buildPrestigeListIfNeeded() {
    // Créer des entrées sans couleurs (elles seront appliquées depuis la sauvegarde)
    if (!medalsList.find((m) => m.nom.startsWith("Médaille Préstige"))) {
      let precedente = medalsList[medalsList.length - 1];
      for (let idx = 8; idx <= TOTAL_PRESTIGE + 7; idx++) {
        // Calcul pallier/cps identique à l'ancienne logique
        let pallierTemp = precedente.pallier * 2;
        let pallier = Math.ceil(pallierTemp * 0.85 - 6500);
        let cps = precedente.cps + 3;
        const entry = {
          nom: `Médaille Préstige - ${idx}`,
          icon: "[⭐]",
          pallier,
          cps,
          couleurs: [], // vide, attend couleurs sauvegardées ou génération si jamais
        };
        medalsList.push(entry);
        precedente = entry;
      }
    }
  }
  buildPrestigeListIfNeeded();

  function createMedalElement(m, index, savedColors = null) {
    if (ui.medalsWrap.querySelector(`[data-name="${m.nom}"]`)) return;
    const el = document.createElement("div");
    const indexSpan = document.createElement("span");
    indexSpan.className = "medal-index";
    // Afficher l'index seulement si médaille débloquée (on le mettra plus tard)
    indexSpan.textContent = "";
    indexSpan.setAttribute("aria-hidden", "true");
    el.appendChild(indexSpan);
    el.classList.add("medal", "hidden");
    el.dataset.name = m.nom;
    el.dataset.index = (index + 1).toString();
    el.setAttribute(
      "title",
      `${m.nom} ${
        m.icon
      }\nPalier : ${m.pallier.toLocaleString()} clics\nCPS auto : ${m.cps}`
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

    // Si pas de couleurs (nouvelle médaille non sauvegardée), générer maintenant (évite flicker ultérieur)
    if (
      m.couleurs &&
      m.couleurs.length === 0 &&
      m.nom.startsWith("Médaille Préstige")
    ) {
      const temp = [];
      while (temp.length < 12) {
        // Générateur simple – on évite la complexité rare pour stabilité
        const h = Math.floor(Math.random() * 360);
        const s = 70 + Math.floor(Math.random() * 25);
        const l = 35 + Math.floor(Math.random() * 20);
        temp.push(`hsl(${h}, ${s}%, ${l}%)`);
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
      `${m.nom} - Rang ${(
        index + 1
      ).toString()} - Palier ${m.pallier.toLocaleString()} clics - CPS auto ${
        m.cps
      }.${couleursPart}`
    );

    // Timing animation prestige (après la 7ème base)
    if (index >= 7) {
      const delay = (index - 6) * 0.3;
      el.style.animationDelay = `${delay}s`;
      el.style.setProperty("--rainbow-delay", `${delay}s`);
    }

    ui.medalsWrap.appendChild(el);
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
    let medalCible = null;
    for (let i = medalsList.length - 1; i >= 0; i--) {
      if (score >= medalsList[i].pallier) {
        medalCible = medalsList[i];
        break;
      }
    }

    if (medalCible) {
      medalsList.forEach((m) => {
        const medalEl = ui.medalsWrap?.querySelector(
          `.medal[data-name="${m.nom}"]`
        );
        if (!medalEl) return;

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

            saveCPS(medalCible.cps);
          }
        }
      });

      const saved = getSavedCPS();
      const cpsToUse = Math.max(saved, medalCible.cps);
      if (cpsToUse !== state.cpsActuel) setAutoClick(cpsToUse);
    }
  }

  // ---------- Reset avec vérification mot de passe ----------
  async function resetProgress() {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir tout réinitialiser ?\nTon score, tes médailles et ton CPS auto seront perdus !"
    );
    if (!confirmReset) return;

    const password = prompt("🔒 Entre ton mot de passe pour confirmer :");
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
      clearSavedCPS();
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

  // ---------- Events socket ----------
  socket.on("you:name", (pseudo) => {
    const oldPseudo = state.myPseudo;
    state.myPseudo = pseudo;

    // Si on change de compte, réinitialiser le CPS auto
    if (oldPseudo && oldPseudo !== pseudo) {
      stopAutoClicks();
      // Le CPS sera restauré lors de la réception de clicker:medals
    }
  });

  socket.on("clicker:you", ({ score }) => {
    state.scoreActuel = score;
    bumpZone();
    if (ui.zone) ui.zone.innerHTML = `<i>${score.toLocaleString()}</i>`;
    if (ui.yourScoreEl) ui.yourScoreEl.textContent = score;
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

    state.medalsDebloquees = new Set(names);

    // Créer / mettre à jour les éléments DOM des médailles
    medalsList.forEach((m, idx) => {
      createMedalElement(m, idx, colorMap[m.nom]);
      const el = ui.medalsWrap?.querySelector(`.medal[data-name="${m.nom}"]`);
      if (!el) return;
      if (names.includes(m.nom)) {
        el.classList.add("shown");
        el.classList.remove("hidden");
        const idxSpan = el.querySelector(".medal-index");
        if (idxSpan && !idxSpan.textContent) {
          idxSpan.textContent = (idx + 1).toString();
        }
      } else {
        el.classList.remove("shown");
        el.classList.add("hidden");
        const idxSpan = el.querySelector(".medal-index");
        if (idxSpan) idxSpan.textContent = "";
      }
    });

    const medaillePlusHaute = medalsList
      .filter((m) => names.includes(m.nom))
      .sort((a, b) => b.pallier - a.pallier)[0];

    const saved = getSavedCPS();
    const highestCps = medaillePlusHaute ? medaillePlusHaute.cps : 0;
    const cpsToUse = Math.max(saved || 0, highestCps);
    if (cpsToUse > 0) {
      setAutoClick(cpsToUse);
      saveCPS(cpsToUse);
    }
  });

  // ---------- Affichage CPS humain ----------
  setInterval(() => {
    if (ui.cpsHumainEl)
      ui.cpsHumainEl.textContent =
        state.cpsHumain >= 0 ? `${state.cpsHumain.toFixed(1)} CPS` : "0.0 CPS";
  }, 750);
}
