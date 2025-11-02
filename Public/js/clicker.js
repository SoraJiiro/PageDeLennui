export function initClicker(socket) {
  const zone = document.querySelector(".zone");
  const acpsEl = document.querySelector(".acps");
  const resetBtn = document.querySelector(".reset");
  const medalsWrap = document.querySelector(".medals-wrap");
  const yourScoreEl = document.getElementById("your-score");
  const cpsHumainEl = document.querySelector(".cps-humain");

  let scoreActuel = 0;
  let cpsActuel = 0;
  let timeAutoClicks = null;
  let medalsDebloquees = new Set();
  let clicksManuels = [];
  let cpsHumain = 0;
  let timerHumain = null;

  // ---------- Storage helpers ----------
  const STORAGE_KEY = "autoCPS";
  function getSavedCPS() {
    const v = parseInt(localStorage.getItem(STORAGE_KEY));
    return isNaN(v) ? 0 : v;
  }
  function saveCPS(cps) {
    if (typeof cps === "number" && cps > 0) {
      localStorage.setItem(STORAGE_KEY, String(cps));
    }
  }
  function clearSavedCPS() {
    localStorage.removeItem(STORAGE_KEY);
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

  medalsWrap.querySelectorAll(".medal").forEach((el) => {
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

  // ---------- Médailles random (visuel seulement) ----------
  function randomColor() {
    const rare = Math.random();
    if (rare <= 0.08) {
      const specialColors = ["hsl(0, 0%, 100%)", "hsl(0, 0%, 0%)"];
      return specialColors[Math.floor(Math.random() * specialColors.length)];
    }

    let h = Math.floor(Math.random() * 360);
    let s = Math.floor(Math.random() * 40) + 71;
    let l = Math.floor(Math.random() * 30) + 31;

    if (s < 45) s = 45 + Math.random() * 20;
    if (l < 25) l = 25 + Math.random() * 16;

    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  function genererMedailleAuto(index, precedente) {
    const colors = [];

    while (colors.length < 12) {
      colors.push(randomColor());
    }

    if (Math.random() < 0.125) {
      const greyLightness = Math.floor(Math.random() * 15) + 60;
      const greyIndex = Math.floor(Math.random() * colors.length);
      colors[greyIndex] = `hsl(0, 0%, ${greyLightness}%)`;
    }

    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }

    let pallierTemp = precedente.pallier * 2;
    let pallier = Math.ceil(pallierTemp * 0.85 - 6500);
    let cps = precedente.cps + 3;

    return {
      nom: `Médaille ${index}`,
      icon: "⭐",
      pallier,
      cps,
      couleurs: colors,
    };
  }

  const nbExtra = 14;
  for (let i = 8; i <= nbExtra + 7; i++) {
    medalsList.push(genererMedailleAuto(i, medalsList[medalsList.length - 1]));
  }

  // ---------- Visu ----------
  medalsList.forEach((m, i) => {
    if (!medalsWrap.querySelector(`[data-name="${m.nom}"]`)) {
      const el = document.createElement("div");
      el.classList.add("medal", "hidden");
      el.dataset.name = m.nom;
      el.dataset.index = (i + 1).toString();
      el.setAttribute(
        "title",
        `${m.nom} ${
          m.icon
        }\nPalier : ${m.pallier.toLocaleString()} clics\nCPS auto : ${m.cps}`
      );

      if (i >= 7) {
        m.couleurs.forEach((c, idx) => {
          el.style.setProperty(`--grad${idx + 1}`, c);
        });
      }

      setTimeout(() => {
        medalsWrap.appendChild(el);
        if (i >= 6) {
          const delay = (i - 6) * 0.55;
          el.style.animationDelay = `${delay}s`;
          el.style.setProperty("--rainbow-delay", `${delay}s`);
        }
      }, 125);
    }
  });

  // ---------- Auto click ----------
  function setAutoClick(cps) {
    if (timeAutoClicks) clearInterval(timeAutoClicks);
    cpsActuel = cps;

    if (acpsEl) acpsEl.textContent = cps > 0 ? `+ ${cps} cps` : "";
    if (cps > 0) {
      timeAutoClicks = setInterval(() => {
        for (let i = 0; i < cps; i++) socket.emit("clicker:click");
      }, 1000);
    }
  }

  function stopAutoClicks() {
    if (timeAutoClicks) clearInterval(timeAutoClicks);
    timeAutoClicks = null;
    cpsActuel = 0;
    if (acpsEl) acpsEl.textContent = "";
  }

  // ---------- Animations et notifications ----------
  function bumpZone() {
    zone?.classList.add("temp");
    setTimeout(() => zone?.classList.remove("temp"), 120);
  }

  function showNotif(text, duration = 4000) {
    const notif = document.createElement("div");
    notif.className = "notif";
    notif.textContent = text;
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0f0;
      opacity: 0.8;
      color: #000;
      padding: 15px 25px;
      font-weight: bold;
      z-index: 9999;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), duration);
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
        const medalEl = medalsWrap?.querySelector(
          `.medal[data-name="${m.nom}"]`
        );
        if (!medalEl) return;

        if (m.pallier <= medalCible.pallier) {
          medalEl.classList.add("shown");
          medalEl.classList.remove("hidden");

          if (!medalsDebloquees.has(m.nom)) {
            medalsDebloquees.add(m.nom);
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
      if (cpsToUse !== cpsActuel) setAutoClick(cpsToUse);
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
      scoreActuel = 0;
      medalsDebloquees.clear();

      if (yourScoreEl) yourScoreEl.textContent = "0";
      if (acpsEl) acpsEl.textContent = "";
      medalsWrap?.querySelectorAll(".medal").forEach((m) => {
        m.classList.remove("shown");
        m.classList.add("hidden");
      });

      showNotif("✅ Progression réinitialisée avec succès !");
    } catch (err) {
      showNotif("🚨 Erreur lors de la vérification du mot de passe");
      console.error(err);
    }
  }

  resetBtn?.addEventListener("click", resetProgress);

  // ---------- Gestion du clic manuel ----------
  if (zone) {
    zone.addEventListener("click", () => {
      socket.emit("clicker:click");
      bumpZone();

      const mtn = Date.now();
      clicksManuels.push(mtn);
      clicksManuels = clicksManuels.filter((t) => mtn - t < 1000);
      cpsHumain = clicksManuels.length;
      clearTimeout(timerHumain);
      timerHumain = setTimeout(() => (cpsHumain = 0), 1100);
    });
  }

  // ---------- Events socket ----------
  socket.on("clicker:you", ({ score }) => {
    scoreActuel = score;
    bumpZone();
    if (zone) zone.innerHTML = `<i>${score.toLocaleString()}</i>`;
    if (yourScoreEl) yourScoreEl.textContent = score;
    verifMedals(score);
  });

  socket.on("clicker:medals", (userMedals) => {
    medalsDebloquees = new Set(userMedals);
    medalsList.forEach((m) => {
      const el = medalsWrap?.querySelector(`.medal[data-name="${m.nom}"]`);
      if (!el) return;
      if (userMedals.includes(m.nom)) {
        el.classList.add("shown");
        el.classList.remove("hidden");
      } else {
        el.classList.remove("shown");
        el.classList.add("hidden");
      }
    });

    const medaillePlusHaute = medalsList
      .filter((m) => userMedals.includes(m.nom))
      .sort((a, b) => b.pallier - a.pallier)[0];

    const saved = getSavedCPS();
    if (saved > 0) {
      setAutoClick(saved);
    } else if (medaillePlusHaute) {
      setAutoClick(medaillePlusHaute.cps);
    }
  });

  // ---------- Affichage CPS humain ----------
  setInterval(() => {
    if (cpsHumainEl)
      cpsHumainEl.textContent =
        cpsHumain >= 0 ? `${cpsHumain.toFixed(1)} CPS` : "0.0 CPS";
  }, 750);

  // ---------- Restauration du CPS auto au chargement ----------
  const restored = getSavedCPS();
  if (restored > 0) {
    setAutoClick(restored);
    console.log(`Clicker: CPS auto restauré à ${restored}`);
  }
}
