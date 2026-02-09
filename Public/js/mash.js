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
  let currentPlayers = [];

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

  let currentScore = 0;

  if (joinBtn)
    joinBtn.addEventListener("click", () => socket.emit("mash:join"));
  if (leaveBtn)
    leaveBtn.addEventListener("click", () => socket.emit("mash:leave"));

  document.addEventListener("keyup", (e) => {
    if (e.key === " " && isPlaying) e.preventDefault();

    if (isPlaying && e.key.toLowerCase() === myKey.toLowerCase()) {
      socket.emit("mash:mash", myKey);
    }
  });

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
    syncState(state);
  });
  socket.on("mash:update", (data) => {
    updateBars(data.scores);
  });

  function syncState(state) {
    const username =
      window.username ||
      document.querySelector(".sb-username")?.textContent?.trim() ||
      "";

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

    if (specCount) {
      if (!me) {
        specCount.innerText = "Spectateur";
        specCount.style.display = "inline-block";
      } else {
        specCount.style.display = "none";
      }
    }

    if (me) {
      joinBtn.style.display = "none";
      leaveBtn.style.display = "inline-block";
    } else {
      leaveBtn.style.display = "none";
      if (state.players.length < 2 && state.gameState === "waiting") {
        joinBtn.style.display = "inline-block";
      } else {
        joinBtn.style.display = "none";
      }
    }

    const gameArea = document.querySelector(".mash-game-area");
    const infoSection = document.querySelector(".mash-header");
    if (gameArea) gameArea.style.display = "flex";

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
      if (me) {
        infoText.innerText = `SPAMMEZ LA TOUCHE [${myKey.toUpperCase()}] !`;
      } else {
        infoText.innerText = "Match en cours...";
      }
    } else if (state.gameState === "finished") {
      if (gameArea) gameArea.style.display = "none";

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
