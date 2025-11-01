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
    if (!medalData) return; // sécurité

    el.setAttribute(
      "title",
      `${medalData.nom} ${
        medalData.icon
      }\nPalier : ${medalData.pallier.toLocaleString()} clics\nCPS auto : ${
        medalData.cps
      }`
    );
  });

  // ---------- Médailles random ----------
  function randomColor() {
    // Rare
    const rare = Math.random();
    if (rare <= 0.08) {
      const specialColors = [
        "hsl(0, 0%, 100%)",
        "hsl(300, 100%, 50%)",
        "hsl(0, 0%, 0%)",
      ];
      return specialColors[Math.floor(Math.random() * specialColors.length)];
    }

    let h = Math.floor(Math.random() * 360);
    let s = Math.floor(Math.random() * 40) + 60;
    let l = Math.floor(Math.random() * 30) + 35;

    if (s < 45) s = 45 + Math.random() * 25;
    if (l < 25) l = 25 + Math.random() * 20;

    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  function genererMedailleAuto(index, precedente) {
    const colors = [];

    // 7 autres couleurs totalement aléatoires
    while (colors.length < 10) {
      colors.push(randomColor());
    }

    // 25% de chance de remplacer une couleur par un gris clair
    if (Math.random() < 0.25) {
      const greyLightness = Math.floor(Math.random() * 15) + 60; // 60–75%
      const greyIndex = Math.floor(Math.random() * colors.length);
      colors[greyIndex] = `hsl(0, 0%, ${greyLightness}%)`;
    }

    // Mélange pour éviter que la première soit toujours claire
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }

    const pallier = precedente.pallier * 2;
    const cps = precedente.cps + Math.floor(Math.random() * 3) + 2;

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

      // Stocke les 6 couleurs dans des variables CSS
      if (i >= 7) {
        m.couleurs.forEach((c, idx) => {
          el.style.setProperty(`--grad${idx + 1}`, c);
        });
      }

      medalsWrap.appendChild(el);
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

  // ---------- Vérif & déblocage de médailles ----------
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
          }
        }
      });

      if (medalCible.cps !== cpsActuel) {
        setAutoClick(medalCible.cps);
      }
    }
  }

  // ---------- Reset ----------
  function resetProgress() {
    const confirmReset = confirm(
      "⚠️ Es-tu sûr de vouloir tout réinitialiser ?\nTon score et tes médailles seront perdus !"
    );
    if (!confirmReset) return;

    socket.emit("clicker:reset");
    socket.emit("clicker:medalsReset");
    stopAutoClicks();
    scoreActuel = 0;
    medalsDebloquees.clear();

    if (yourScoreEl) yourScoreEl.textContent = "0";
    if (acpsEl) acpsEl.textContent = "";
    medalsWrap?.querySelectorAll(".medal").forEach((m) => {
      m.classList.remove("shown");
      m.classList.add("hidden");
    });

    showNotif("🔁 Progression réinitialisée !");
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

  // ---------- Événements socket ----------
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
    if (medaillePlusHaute) setAutoClick(medaillePlusHaute.cps);
  });

  // ---------- Affichage CPS humain ----------
  setInterval(() => {
    if (cpsHumainEl)
      cpsHumainEl.textContent =
        cpsHumain >= 0 ? `${cpsHumain.toFixed(1)} CPS` : "0.0 CPS";
  }, 750);
}
