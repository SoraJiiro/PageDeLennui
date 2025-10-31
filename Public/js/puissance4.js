export function initPuissance4(socket) {
  const lobby = document.querySelector(".p4-lobby");
  const game = document.querySelector(".p4-game");
  const joinBtn = document.querySelector(".p4-join");
  const leaveBtn = document.querySelector(".p4-leave");
  const startBtn = document.querySelector(".p4-start");
  const joueursList = document.querySelector(".p4-joueurs");
  const specsList = document.querySelector(".p4-spectators");
  const statusEl = document.querySelector(".p4-status");
  const boardEl = document.querySelector(".p4-board");
  const infoEl = document.querySelector(".p4-info");
  const modeSpec = document.querySelector(".p4-mode-spec");

  let monPseudo = null;
  let estAuLobby = false;
  let estSpec = false;
  let gameState = null;

  socket.emit("p4:getState");

  // Observer pour recharger l'état
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) socket.emit("p4:getState");
      });
    },
    { threshold: 0.5 }
  );

  const stage8 = document.getElementById("stage8");
  if (stage8) observer.observe(stage8);

  // Boutons lobby
  joinBtn?.addEventListener("click", () => socket.emit("p4:join"));
  leaveBtn?.addEventListener("click", () => socket.emit("p4:leave"));
  startBtn?.addEventListener("click", () => socket.emit("p4:start"));

  // Gestion des clics sur les colonnes
  if (boardEl) {
    boardEl.addEventListener("click", (e) => {
      const cell = e.target.closest(".p4-cell");
      if (!cell || !gameState) return;

      const col = parseInt(cell.dataset.col);
      if (isNaN(col)) return;

      if (gameState.estMonTour && !gameState.winner && !estSpec) {
        socket.emit("p4:play", { col });
      }
    });
  }

  // Socket: Lobby
  socket.on("p4:lobby", (data) => {
    monPseudo = data.myUsername;
    estAuLobby = data.estAuLobby;
    estSpec = !data.estAuLobby && data.gameStarted;

    joueursList.innerHTML = `
      <p>Joueurs dans le lobby (${data.joueurs.length}/2) :</p>
      ${
        data.joueurs.length > 0
          ? data.joueurs.map((p) => `<div>${p}</div>`).join("")
          : "<div style='color:#fff;'>Aucun joueur</div>"
      }
    `;

    if (specsList && data.spectators && data.spectators.length > 0) {
      specsList.innerHTML = `
        <p>Spectateurs (${data.spectators.length}) : ${data.spectators.join(
        ", "
      )}</p>
      `;
    } else if (specsList) {
      specsList.innerHTML = "";
    }

    if (estAuLobby) {
      joinBtn.style.display = "none";
      leaveBtn.style.display = "inline-block";
      startBtn.style.display = "inline-block";

      if (data.canStart && data.joueurs.length === 2) {
        startBtn.disabled = false;
        startBtn.textContent = "Démarrer la partie";
      } else {
        startBtn.disabled = true;
        startBtn.textContent = `En attente (${data.joueurs.length}/2)`;
      }
    } else {
      joinBtn.style.display = "inline-block";
      leaveBtn.style.display = "none";
      startBtn.style.display = "none";

      if (data.gameStarted) {
        joinBtn.textContent = "Partie en cours...";
        joinBtn.disabled = true;
      } else {
        joinBtn.textContent = "Rejoindre le lobby";
        joinBtn.disabled = data.joueurs.length >= 2;
      }
    }
  });

  // Socket: Début de partie
  socket.on("p4:gameStart", (state) => {
    lobby.style.display = "none";
    game.classList.add("active");
    updateGame(state);
  });

  // Socket: Mise à jour
  socket.on("p4:update", (state) => {
    lobby.style.display = "none";
    game.classList.add("active");
    updateGame(state);
  });

  // Socket: Retour au lobby
  socket.on("p4:backToLobby", () => {
    game.classList.remove("active");
    lobby.style.display = "block";
    socket.emit("p4:getState");
  });

  // Socket: Fin de partie
  socket.on("p4:gameEnd", (data) => {
    // Afficher l'alerte seulement pour les joueurs, pas les spectateurs
    if (!estSpec) {
      if (data.winner === "Partie annulée !") {
        alert(`${data.winner} ${data.reason}`);
        game.classList.remove("active");
        lobby.style.display = "block";
        socket.emit("p4:getState");
      } else if (data.draw) {
        // Attendre 3 secondes pour voir le message de match nul
        setTimeout(() => {
          alert(`🤝 Match nul !`);
          game.classList.remove("active");
          lobby.style.display = "block";
          socket.emit("p4:getState");
        }, 3000);
      } else {
        // Attendre 3 secondes pour voir le message de victoire
        setTimeout(() => {
          alert(`🎉 ${data.winner} a gagné la partie !`);
          game.classList.remove("active");
          lobby.style.display = "block";
          socket.emit("p4:getState");
        }, 3000);
      }
    } else {
      // Pour les spectateurs, retour immédiat au lobby
      setTimeout(() => {
        game.classList.remove("active");
        lobby.style.display = "block";
        socket.emit("p4:getState");
      }, 3000);
    }
  });

  // Socket: Erreur
  socket.on("p4:error", (msg) => {
    if (estSpec) return;
    alert(msg);
  });

  // Mise à jour de l'interface de jeu
  function updateGame(state) {
    if (!state) return;
    gameState = state;
    estSpec = state.estSpec;

    // Mode spectateur
    if (modeSpec) {
      if (estSpec) {
        modeSpec.style.display = "block";
        modeSpec.textContent = "👁️ Mode spectateur - Tu regardes la partie";
      } else {
        modeSpec.style.display = "none";
      }
    }

    // Statut
    if (statusEl) {
      if (state.winner) {
        statusEl.textContent = `${state.winner} a gagné !`;
        statusEl.style.background = "#ffd700";
        statusEl.style.color = "#000";
      } else if (state.draw) {
        statusEl.textContent = "Match nul !";
        statusEl.style.background = "#ff6b6b";
        statusEl.style.color = "#000";
      } else if (state.estMonTour && !estSpec) {
        statusEl.textContent = "C'est ton tour !";
        statusEl.style.background = "#0f0";
        statusEl.style.color = "#000";
      } else {
        statusEl.textContent = `Tour de ${state.currentPlayer}`;
        statusEl.style.background = "#0f0";
        statusEl.style.color = "#000";
      }
    }

    // Grille de jeu
    if (boardEl) {
      boardEl.innerHTML = "";

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
          const cell = document.createElement("div");
          cell.className = "p4-cell";
          cell.dataset.row = row;
          cell.dataset.col = col;

          const value = state.board[row][col];
          if (value !== 0) {
            const token = document.createElement("div");
            token.className = `p4-token ${value === 1 ? "red" : "blue"}`;
            cell.appendChild(token);
          }

          // Ajouter la classe clickable si c'est jouable
          if (
            state.estMonTour &&
            !state.winner &&
            !state.draw &&
            !estSpec &&
            row === 0
          ) {
            cell.classList.add("clickable");
          }

          boardEl.appendChild(cell);
        }
      }
    }

    // Informations
    if (infoEl) {
      const player1 = state.joueurs[0];
      const player2 = state.joueurs[1];

      let html = `<p>`;

      if (player1) {
        html += `<span class="${
          state.currentPlayer === player1 ? "p4-current-player" : ""
        } c1">${player1}</span>`;
      }

      if (player1 && player2) {
        html += ` vs `;
      }

      if (player2) {
        html += `<span class="${
          state.currentPlayer === player2 ? "p4-current-player" : ""
        } c2">${player2}</span>`;
      }

      html += `</p>`;

      if (state.winner) {
        html += `<div class="p4-winner-message">🏆 ${state.winner} remporte la partie ! 🏆</div>`;
        statusEl.innerHTML = "";
        statusEl.textContent = "";
      } else if (state.draw) {
        html += `<div class="p4-winner-message">🤝 Match nul ! 🤝</div>`;
        statusEl.innerHTML = "";
        statusEl.textContent = "";
      }

      if (state.message) {
        html += `<p style="color: #fff;">${state.message}</p>`;
      }

      infoEl.innerHTML = html;
    }
  }
}
