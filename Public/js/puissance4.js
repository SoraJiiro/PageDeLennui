export function initPuissance4(socket) {
  // ---------- Cache UI ----------
  const ui = {
    lobby: document.querySelector(".p4-lobby"),
    game: document.querySelector(".p4-game"),
    joinBtn: document.querySelector(".p4-join"),
    leaveBtn: document.querySelector(".p4-leave"),
    startBtn: document.querySelector(".p4-start"),
    joueursList: document.querySelector(".p4-joueurs"),
    specsList: document.querySelector(".p4-spectators"),
    statusEl: document.querySelector(".p4-status"),
    boardEl: document.querySelector(".p4-board"),
    infoEl: document.querySelector(".p4-info"),
    modeSpec: document.querySelector(".p4-mode-spec"),
  };

  // ---------- Etat local ----------
  const state = {
    monPseudo: null,
    estAuLobby: false,
    estSpec: false,
    gameState: null,
  };

  let estSpec = false; // Variable locale pour estSpec accessible globalement dans le module

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

  // --------- Events Bouton/Input ---------
  ui.joinBtn?.addEventListener("click", () => socket.emit("p4:join"));
  ui.leaveBtn?.addEventListener("click", () => socket.emit("p4:leave"));
  ui.startBtn?.addEventListener("click", () => socket.emit("p4:start"));

  // Gestion clicks dans la grille
  if (ui.boardEl) {
    ui.boardEl.addEventListener("click", (e) => {
      const cell = e.target.closest(".p4-cell");
      if (!cell || !state.gameState) return;

      const col = parseInt(cell.dataset.col);
      if (isNaN(col)) return;

      if (state.gameState.estMonTour && !state.gameState.winner && !estSpec) {
        socket.emit("p4:play", { col });
      }
    });
  }

  socket.on("p4:lobby", (data) => {
    state.monPseudo = data.myUsername;
    state.estAuLobby = data.estAuLobby;
    state.estSpec = !data.estAuLobby && data.gameStarted;

    ui.joueursList.innerHTML = `
      <p>Joueurs dans le lobby (${data.joueurs.length}/2) :</p>
      ${
        data.joueurs.length > 0
          ? data.joueurs.map((p) => `<div>${p}</div>`).join("")
          : "<div style='color:#fff;'>Aucun joueur</div>"
      }
    `;

    if (ui.specsList && data.spectators && data.spectators.length > 0) {
      ui.specsList.innerHTML = `
        <p>Spectateurs (${data.spectators.length}) : ${data.spectators.join(
        ", "
      )}</p>
      `;
    } else if (ui.specsList) {
      ui.specsList.innerHTML = "";
    }

    if (state.estAuLobby) {
      ui.joinBtn.style.display = "none";
      ui.leaveBtn.style.display = "inline-block";
      ui.startBtn.style.display = "inline-block";

      if (data.canStart && data.joueurs.length === 2) {
        ui.startBtn.disabled = false;
        ui.startBtn.textContent = "Démarrer la partie";
      } else {
        ui.startBtn.disabled = true;
        ui.startBtn.textContent = `En attente (${data.joueurs.length}/2)`;
      }
    } else {
      ui.joinBtn.style.display = "inline-block";
      ui.leaveBtn.style.display = "none";
      ui.startBtn.style.display = "none";

      if (data.gameStarted) {
        ui.joinBtn.textContent = "Partie en cours...";
        ui.joinBtn.disabled = true;
      } else {
        ui.joinBtn.textContent = "Rejoindre le lobby";
        ui.joinBtn.disabled = data.joueurs.length >= 2;
      }
    }
  });

  socket.on("p4:gameStart", (gameState) => {
    ui.lobby.style.display = "none";
    ui.game.classList.add("active");
    updateGame(gameState);
  });

  socket.on("p4:update", (gameState) => {
    ui.lobby.style.display = "none";
    ui.game.classList.add("active");
    updateGame(gameState);
  });

  socket.on("p4:backToLobby", () => {
    ui.game.classList.remove("active");
    ui.lobby.style.display = "block";
    socket.emit("p4:getState");
  });

  socket.on("p4:gameEnd", (data) => {
    if (!state.estSpec) {
      if (data.winner === "Partie annulée !") {
        alert(`${data.winner} ${data.reason}`);
        ui.game.classList.remove("active");
        ui.lobby.style.display = "block";
        socket.emit("p4:getState");
      } else if (data.draw) {
        // 3s message egalité
        setTimeout(() => {
          alert(`🤝 Match nul !`);
          ui.game.classList.remove("active");
          ui.lobby.style.display = "block";
          socket.emit("p4:getState");
        }, 3000);
      } else {
        // 3s message win
        setTimeout(() => {
          alert(`🎉 ${data.winner} a gagné la partie !`);
          ui.game.classList.remove("active");
          ui.lobby.style.display = "block";
          socket.emit("p4:getState");
        }, 3000);
      }
    } else {
      setTimeout(() => {
        ui.game.classList.remove("active");
        ui.lobby.style.display = "block";
        socket.emit("p4:getState");
      }, 3000);
    }
  });

  socket.on("p4:error", (msg) => {
    if (estSpec) return;
    alert(msg);
  });

  function updateGame(gameStateData) {
    if (!gameStateData) return;
    state.gameState = gameStateData;
    estSpec = gameStateData.estSpec;

    if (ui.modeSpec) {
      if (estSpec) {
        ui.modeSpec.style.display = "block";
        ui.modeSpec.textContent = "👁️ Mode spectateur - Tu regardes la partie";
      } else {
        ui.modeSpec.style.display = "none";
      }
    }

    if (ui.statusEl) {
      if (gameStateData.winner) {
        ui.statusEl.textContent = `${gameStateData.winner} a gagné !`;
        ui.statusEl.style.background = "#ffd700";
        ui.statusEl.style.color = "#000";
      } else if (gameStateData.draw) {
        ui.statusEl.textContent = "Match nul !";
        ui.statusEl.style.background = "#ff6b6b";
        ui.statusEl.style.color = "#000";
      } else if (gameStateData.estMonTour && !estSpec) {
        ui.statusEl.textContent = "C'est ton tour !";
        ui.statusEl.style.background = "#0f0";
        ui.statusEl.style.color = "#000";
      } else {
        ui.statusEl.textContent = `Tour de ${gameStateData.currentPlayer}`;
        ui.statusEl.style.background = "#0f0";
        ui.statusEl.style.color = "#000";
      }
    }

    // Grille de jeu
    if (ui.boardEl) {
      ui.boardEl.innerHTML = "";

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
          const cell = document.createElement("div");
          cell.className = "p4-cell";
          cell.dataset.row = row;
          cell.dataset.col = col;

          const value = gameStateData.board[row][col];
          if (value !== 0) {
            const token = document.createElement("div");
            token.className = `p4-token ${value === 1 ? "red" : "blue"}`;
            cell.appendChild(token);
          }

          if (
            gameStateData.estMonTour &&
            !gameStateData.winner &&
            !gameStateData.draw &&
            !estSpec &&
            row === 0
          ) {
            cell.classList.add("clickable");
          }

          ui.boardEl.appendChild(cell);
        }
      }
    }

    // -------- Display info --------
    if (ui.infoEl) {
      const player1 = gameStateData.joueurs[0];
      const player2 = gameStateData.joueurs[1];

      let html = `<p>`;

      if (player1) {
        html += `<span class="${
          gameStateData.currentPlayer === player1 ? "p4-current-player" : ""
        } c1">${player1}</span>`;
      }

      if (player1 && player2) {
        html += ` vs `;
      }

      if (player2) {
        html += `<span class="${
          gameStateData.currentPlayer === player2 ? "p4-current-player" : ""
        } c2">${player2}</span>`;
      }

      html += `</p>`;

      if (gameStateData.winner) {
        html += `<div class="p4-winner-message">🏆 ${gameStateData.winner} remporte la partie ! 🏆</div>`;
        ui.statusEl.innerHTML = "";
        ui.statusEl.textContent = "";
      } else if (gameStateData.draw) {
        html += `<div class="p4-winner-message">🤝 Match nul ! 🤝</div>`;
        ui.statusEl.innerHTML = "";
        ui.statusEl.textContent = "";
      }

      if (gameStateData.message) {
        html += `<p style="color: #fff;">${gameStateData.message}</p>`;
      }

      ui.infoEl.innerHTML = html;
    }
  }
}
