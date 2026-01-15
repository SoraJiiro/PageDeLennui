export function initMash(socket) {
  if (!socket) return;

  const inputKey = document.getElementById("mash-key-input");
  const joinBtn = document.getElementById("mash-join");
  const leaveBtn = document.getElementById("mash-leave");

  const p1Pseudo = document.querySelector("#mash-p1 .player-pseudo");
  const p2Pseudo = document.querySelector("#mash-p2 .player-pseudo");
  const p1Bar = document.querySelector("#mash-p1 .progress-bar");
  const p2Bar = document.querySelector("#mash-p2 .progress-bar");

  const betOverlay = document.getElementById("mash-bet-overlay");
  const betInput = document.getElementById("mash-bet-amount");
  const btnBetRed = document.getElementById("mash-bet-red");
  const btnBetBlue = document.getElementById("mash-bet-blue");

  const infoText = document.getElementById("mash-info-text");
  const specCount = document.getElementById("mash-spec-count");

  let isPlaying = false;
  let myKey = "k";
  let currentPlayers = []; // Store players for betting mapping

  // Load saved key
  const savedKey = localStorage.getItem("mashKey");
  if (savedKey) {
    myKey = savedKey;
    if (inputKey) inputKey.value = myKey;
  }

  // Key Config
  const btnKeySubmit = document.getElementById("mash-key-submit");
  if (inputKey && btnKeySubmit) {
    btnKeySubmit.addEventListener("click", () => {
      const val = inputKey.value.trim();
      if (val && val.length === 1) {
        myKey = val.toLowerCase();
        localStorage.setItem("mashKey", myKey);
        socket.emit("mash:key", myKey);
        inputKey.blur();
        showNotification(`Touche de Mash définie sur : ${myKey.toUpperCase()}`);
      } else {
        showNotification("⚠️ Entrez une seule touche (1 caractère)");
      }
    });
  }

  // Buttons
  if (joinBtn)
    joinBtn.addEventListener("click", () => socket.emit("mash:join"));
  if (leaveBtn)
    leaveBtn.addEventListener("click", () => socket.emit("mash:leave"));

  if (btnBetRed) btnBetRed.addEventListener("click", () => sendBet("red"));
  if (btnBetBlue) btnBetBlue.addEventListener("click", () => sendBet("blue"));

  function sendBet(teamColor) {
    const amount = parseInt(betInput.value);

    // Find pseudo for the team
    const p = currentPlayers.find((p) => p.team === teamColor);
    const targetPseudo = p ? p.pseudo : null;

    if (!targetPseudo) {
      showNotification("Erreur: Joueur introuvable ?");
      return;
    }

    if (amount > 0) {
      socket.emit("mash:bet", { betOn: targetPseudo, amount: amount });
      betOverlay.style.display = "none";
      infoText.innerText = `Mise de ${amount} clicks placée sur ${targetPseudo} !`;
    }
  }

  // Mash Event
  document.addEventListener("keyup", (e) => {
    // Prevent scrolling if space is used
    if (e.key === " " && isPlaying) e.preventDefault();

    if (isPlaying && e.key.toLowerCase() === myKey.toLowerCase()) {
      socket.emit("mash:mash", myKey);
    }
  });

  // Socket listeners
  socket.on("mash:init_key", (key) => {
    if (key) {
      myKey = key;
      if (inputKey) inputKey.value = key;
      localStorage.setItem("mashKey", key);
    }
  });

  socket.on("mash:state", (state) => {
    //console.log("[MASH] State received:", state);
    syncState(state);
  });
  socket.on("mash:update", (data) => {
    // console.log("[MASH] Update:", data);
    updateBars(data.scores);
  });

  function syncState(state) {
    const username =
      window.username ||
      document.querySelector(".sb-username")?.textContent?.trim() ||
      "";
    //console.log("[MASH] Syncing state. My pseudo (local):", username);

    // Update players
    currentPlayers = state.players;
    const p1 = state.players.find((p) => p.team === "red");
    const p2 = state.players.find((p) => p.team === "blue");

    if (p1) {
      p1Pseudo.innerText = p1.pseudo;
      if (btnBetRed) btnBetRed.innerText = `Miser sur ${p1.pseudo}`;
    } else {
      p1Pseudo.innerText = "En attente...";
      if (btnBetRed) btnBetRed.innerText = "En attente...";
    }

    if (p2) {
      p2Pseudo.innerText = p2.pseudo;
      if (btnBetBlue) btnBetBlue.innerText = `Miser sur ${p2.pseudo}`;
    } else {
      p2Pseudo.innerText = "En attente...";
      if (btnBetBlue) btnBetBlue.innerText = "En attente...";
    }

    // Determine if I am playing
    // Use trim() to avoid issues with DOM text content
    const me = state.players.find((p) => p.pseudo === username);
    isPlaying = !!(me && state.gameState === "playing");
    //console.log("[MASH] Am I in game?", !!me, "Is playing?", isPlaying);

    // Spectators logic: Hide number, only show status if spectator
    if (specCount) {
      if (!me) {
        specCount.innerText = "Spectateur";
        specCount.style.display = "inline-block";
      } else {
        specCount.style.display = "none";
      }
    }

    // Controls visibility
    if (me) {
      joinBtn.style.display = "none";
      leaveBtn.style.display = "inline-block";
    } else {
      leaveBtn.style.display = "none";
      // Allow join if space available and waiting
      if (state.players.length < 2 && state.gameState === "waiting") {
        joinBtn.style.display = "inline-block";
      } else {
        joinBtn.style.display = "none";
      }
    }

    // Betting overlay
    if (state.gameState === "betting" && !me) {
      betOverlay.style.display = "flex";
      infoText.innerText = "Les paris sont ouverts ! (10s)";
    } else {
      betOverlay.style.display = "none";
    }

    let countdownInterval = null;

    if (window.mashCountdownInterval) {
      clearInterval(window.mashCountdownInterval);
      window.mashCountdownInterval = null;
    }

    const gameArea = document.querySelector(".mash-game-area");
    const infoSection = document.querySelector(".mash-header"); // Contains title and infoText. Actually maybe hide game area only.

    // Default show game area
    if (gameArea) gameArea.style.display = "flex";

    // Info text updates
    if (state.gameState === "waiting") {
      infoText.innerText =
        state.players.length < 2
          ? "En attente de joueurs..."
          : "Prêt à commencer...";
      infoText.style.display = "block"; // Ensure visible
    } else if (state.gameState === "betting") {
      const updateCountdown = () => {
        if (!state.phaseEndTime) return;
        const left = Math.ceil((state.phaseEndTime - Date.now()) / 1000);
        if (left > 0) {
          const txt = `Début dans ${left}s...`;
          if (me) infoText.innerText = txt;
          else {
            infoText.innerText = `Les paris sont ouverts ! (${left}s)`;
            // Also update overlay title if visible
            const overlayTitle = betOverlay.querySelector("h3");
            if (overlayTitle)
              overlayTitle.innerText = `Faites vos jeux ! (Fin dans ${left}s)`;
          }
        } else {
          infoText.innerText = "C'est parti !";
          betOverlay.style.display = "none";
        }
      };

      updateCountdown();
      window.mashCountdownInterval = setInterval(updateCountdown, 500);
    } else if (state.gameState === "playing") {
      infoText.innerText = `SPAMMEZ LA TOUCHE [${myKey.toUpperCase()}] !`;
    } else if (state.gameState === "finished") {
      // Hide game area on finish and show large message
      if (gameArea) gameArea.style.display = "none";
      // We can use infoText or create a new element, but user asked to hide game.
      // Server broadcasts system msg "VICTOIRE DE...", which appears in chat?
      // But user likely wants visual feedback in place of game.

      // Let's rely on updateBars seeing 100% to know who won or scores logic
      // But actually server sets gameState=finished.
      // We can check scores to see winner or just wait for reset.

      const winnerTeam =
        state.scores.red >= 100
          ? "Rouge"
          : state.scores.blue >= 100
          ? "Bleu"
          : "Inconnu";
      const winnerName =
        winnerTeam === "Rouge"
          ? state.players.find((p) => p.team === "red")?.pseudo || "Rouge"
          : state.players.find((p) => p.team === "blue")?.pseudo || "Bleu";

      infoText.innerHTML = `<span style="font-size: 2rem; color: var(--primary-color);">VICTOIRE DE ${winnerName.toUpperCase()} !</span>`;
    }

    updateBars(state.scores);
  }

  function updateBars(scores) {
    if (!scores) return;
    // Assuming max score 100
    const p1Pct = Math.min(scores.red, 100);
    const p2Pct = Math.min(scores.blue, 100);

    p1Bar.style.width = p1Pct + "%";
    p2Bar.style.width = p2Pct + "%";
  }

  function showNotification(msg) {
    const oldText = infoText.innerText;
    infoText.innerText = msg;
    setTimeout(() => {
      if (infoText.innerText === msg) infoText.innerText = oldText;
    }, 2000);
  }
}
