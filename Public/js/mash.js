import { showNotif } from "./util.js";

export function initMash(socket) {
  if (!socket) return;

  const inputKey = document.getElementById("mash-key-input");
  const joinBtn = document.getElementById("mash-join");
  const leaveBtn = document.getElementById("mash-leave");

  const p1Pseudo = document.querySelector("#mash-p1 .player-pseudo");
  const p2Pseudo = document.querySelector("#mash-p2 .player-pseudo");
  const p1Bar = document.querySelector("#mash-p1 .progress-bar");
  const p2Bar = document.querySelector("#mash-p2 .progress-bar");

  const infoText = document.getElementById("mash-info-text");
  const specCount = document.getElementById("mash-spec-count");

  let isPlaying = false;
  let myKey = "k";
  let currentPlayers = []; // Store players for betting mapping

  // mashKey is managed server-side; do not persist client-side

  // Key Config
  const btnKeySubmit = document.getElementById("mash-key-submit");
  if (inputKey && btnKeySubmit) {
    btnKeySubmit.addEventListener("click", () => {
      const val = inputKey.value.trim();
      if (val && val.length === 1) {
        myKey = val.toLowerCase();
        try {
          window.dispatchEvent(
            new CustomEvent("mashKey:changed", { detail: { key: myKey } }),
          );
        } catch (e) {}
        socket.emit("mash:key", myKey);
        showNotif(`Touche de Mash définie sur : ${myKey.toUpperCase()}`);
      } else {
        showNotif("⚠️ Entrez une seule touche (1 caractère)");
      }
    });
  }

  // Buttons
  let currentScore = 0;

  if (joinBtn)
    joinBtn.addEventListener("click", () => socket.emit("mash:join"));
  if (leaveBtn)
    leaveBtn.addEventListener("click", () => socket.emit("mash:leave"));

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
      try {
        window.dispatchEvent(
          new CustomEvent("mashKey:changed", { detail: { key: key } }),
        );
      } catch (e) {}
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

    // Update players
    currentPlayers = state.players;
    const p1 = state.players.find((p) => p.team === "red");
    const p2 = state.players.find((p) => p.team === "blue");

    if (p1) {
      p1Pseudo.innerText = p1.pseudo;
    } else {
      p1Pseudo.innerText = "En attente...";
    }

    if (p2) {
      p2Pseudo.innerText = p2.pseudo;
    } else {
      p2Pseudo.innerText = "En attente...";
    }

    const me = state.players.find((p) => p.pseudo === username);
    isPlaying = !!(me && state.gameState === "playing");

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
        } else {
          infoText.innerText = "C'est parti !";
        }
      };

      updateCountdown();
      window.mashCountdownInterval = setInterval(updateCountdown, 500);
    } else if (state.gameState === "playing") {
      // Ne pas afficher le message d'action aux spectateurs
      if (me) {
        infoText.innerText = `SPAMMEZ LA TOUCHE [${myKey.toUpperCase()}] !`;
      } else {
        infoText.innerText = "Match en cours...";
      }
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
