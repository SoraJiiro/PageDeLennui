// ==================== CLICKER LOGIQUE ====================
export function initClicker(socket) {
  const zone = document.querySelector(".zone");
  const acpsEl = document.querySelector(".acps");
  const resetBtn = document.querySelector(".reset");
  const medalsWrap = document.querySelector(".medals-wrap");
  const yourScoreEl = document.getElementById("your-score");
  const cpsHumainEl = document.querySelector(".cps-humain");

  let scoreActuel = 0;
  let cpsActuel = 0;
  let autoClickTimer = null;
  let medalsDebloquees = new Set();
  let clicksManuels = [];
  let cpsHumain = 0;
  let timerHumain = null;

  // Liste officielle des médailles
  const medalsList = [
    { nom: "Bronze", icon: "🥉", pallier: 2500, cps: 1 },
    { nom: "Argent", icon: "🥈", pallier: 5000, cps: 3 },
    { nom: "Or", icon: "🥇", pallier: 10000, cps: 5 },
    { nom: "Diamant", icon: "💎", pallier: 20000, cps: 7 },
    { nom: "Rubis", icon: "❤️‍🔥", pallier: 40000, cps: 9 },
    { nom: "Saphir", icon: "💠", pallier: 80000, cps: 11 },
    { nom: "Légendaire", icon: "👑", pallier: 160000, cps: 13 },
  ];

  // -------------------- Auto click --------------------
  function setAutoClick(cps) {
    if (autoClickTimer) clearInterval(autoClickTimer);
    cpsActuel = cps;

    if (acpsEl) acpsEl.textContent = cps > 0 ? `+ ${cps} cps` : "";
    if (cps > 0) {
      autoClickTimer = setInterval(() => {
        for (let i = 0; i < cps; i++) socket.emit("clicker:click");
      }, 1000);
    }
  }

  function stopAutoClicks() {
    if (autoClickTimer) clearInterval(autoClickTimer);
    autoClickTimer = null;
    cpsActuel = 0;
    if (acpsEl) acpsEl.textContent = "";
  }

  // -------------------- Anim + UI --------------------
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
    background: #00ff00;
    opacity: 0.87;
    color: #000;
    padding: 15px 25px;
    border-radius: 8px;
    font-weight: bold;
    z-index: 9999;
    animation: slideIn 0.3s ease;
  `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), duration);
  }

  // -------------------- Médaille logique --------------------
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
            socket.emit("clicker:medalUnlock", { medalName: m.nom });
            if (m === medalCible)
              showNotif(`🏅 Médaille ${m.nom} débloquée ! ${m.icon}`);
          }
        }
      });

      // Ajuster l'auto-click selon la médaille la plus haute
      if (medalCible.cps !== cpsActuel) {
        setAutoClick(medalCible.cps);
      }
    }
  }

  // -------------------- Reset complet --------------------
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

  // -------------------- Click principal --------------------
  if (zone) {
    zone.addEventListener("click", () => {
      socket.emit("clicker:click");
      bumpZone();

      // Calcul CPS humain
      const mtn = Date.now();
      clicksManuels.push(mtn);
      clicksManuels = clicksManuels.filter((t) => mtn - t < 1000);
      cpsHumain = clicksManuels.length;
      clearTimeout(timerHumain);
      timerHumain = setTimeout(() => (cpsHumain = 0), 1100);
    });
  }

  // -------------------- Sockets --------------------
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

    // Met à jour l’auto-click selon la médaille la plus haute
    const best = medalsList
      .filter((m) => userMedals.includes(m.nom))
      .sort((a, b) => b.pallier - a.pallier)[0];
    if (best) setAutoClick(best.cps);
  });

  // -------------------- CPS humain affichage --------------------
  setInterval(() => {
    if (cpsHumainEl)
      cpsHumainEl.textContent =
        cpsHumain >= 0 ? `${cpsHumain.toFixed(1)} CPS` : "0.0 CPS";
  }, 750);
}
