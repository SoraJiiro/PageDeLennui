export function initUno(socket) {
  // ========== UI Cache ==========
  const ui = {
    lobby: document.querySelector(".uno-lobby"),
    game: document.querySelector(".uno-game"),
    joinBtn: document.querySelector(".uno-rej"),
    leaveBtn: document.querySelector(".uno-quitter"),
    startBtn: document.querySelector(".uno-start-game"),
    joueursList: document.querySelector(".uno-joueurs"),
    specsList: document.querySelector(".uno-spectators"),
    statusEl: document.querySelector(".uno-status"),
    pileEl: document.querySelector(".uno-pile"),
    discardEl: document.querySelector(".uno-discard"),
    deckEl: document.querySelector(".uno-deck"),
    infoEl: document.querySelector(".uno-info"),
    advEl: document.querySelector(".uno-adversaires"),
    colorPicker: document.querySelector(".uno-color-picker"),
    colorOptions: document.querySelector(".uno-color-options"),
    modeSpec: document.querySelector(".uno-mode-spec"),
  };

  // ========== State ==========
  const state = {
    stateActuel: null,
    myUsername: null,
    estAuLobby: false,
    estSpec: false,
  };

  socket.emit("uno:getState");

  // Observer pour recharger l'état quand visible
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          socket.emit("uno:getState");
        }
      });
    },
    { threshold: 0.5 }
  );

  const stage6 = document.getElementById("stage6");
  if (stage6) observer.observe(stage6);

  // ========== Fonctions Utilitaires ==========
  function jouerCarte(cardIndex) {
    socket.emit("uno:play", { cardIndex });
  }

  function renderCard(card, isSmall = false) {
    if (!card) return "";
    const colorClass =
      card.color !== "wild" ? `color-${card.color}` : "color-black";
    const taille = isSmall ? "width: 80px; height: 120px;" : "";
    return `
       <div class="uno-card-item ${colorClass}" style="${taille}">
         <div>${card.valeur}</div>
       </div>
     `;
  }

  function setupColorPicker(cardIndex) {
    ui.colorPicker.classList.add("active");
    ui.colorOptions.innerHTML = `
       <button class="uno-color-btn color-red" data-color="red">Rouge</button>
       <button class="uno-color-btn color-blue" data-color="blue">Bleu</button>
       <button class="uno-color-btn color-green" data-color="green">Vert</button>
       <button class="uno-color-btn color-pink" data-color="pink">Rose</button>
     `;

    ui.pileEl.classList.add("disabled");
    ui.deckEl.querySelectorAll(".uno-deck-card").forEach((card) => {
      card.classList.add("disabled");
    });

    function closeColorPicker() {
      ui.colorPicker.classList.remove("active");
      ui.pileEl.classList.remove("disabled");
      ui.deckEl.querySelectorAll(".uno-deck-card").forEach((card) => {
        card.classList.remove("disabled");
      });
      document.removeEventListener("click", handleOutsideClick);
    }

    function handleOutsideClick(event) {
      if (!ui.colorPicker.contains(event.target)) {
        closeColorPicker();
      }
    }

    document.removeEventListener("click", handleOutsideClick);
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick);
    }, 1);

    // Choix couleur
    ui.colorOptions.querySelectorAll(".uno-color-btn").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const color = btn.dataset.color;
        socket.emit("uno:play", { cardIndex, color });
        closeColorPicker();
      });
    });
  }

  function updateGame(gameState) {
    state.stateActuel = gameState;
    state.estSpec = gameState.estSpec;

    if (ui.modeSpec) {
      if (state.estSpec) {
        ui.modeSpec.style.display = "block";
        ui.modeSpec.textContent =
          "👁️ Mode spectateur - Tu regardes la partie - CTRL + R quand la partie est finie";
      } else {
        ui.modeSpec.style.display = "none";
      }
    }

    if (ui.statusEl) {
      const tourDuJoueur = gameState.currentPlayer;
      const estMonTour = gameState.estMonTour && !state.estSpec;
      if (estMonTour) {
        ui.statusEl.textContent = "C'est ton tour !";
        ui.pileEl.classList.add("tonTour");
      } else {
        ui.statusEl.textContent = `Tour de ${tourDuJoueur}`;
        ui.pileEl.classList.remove("tonTour");
      }
    }

    // Carte du milieu
    if (ui.discardEl) {
      ui.discardEl.innerHTML = renderCard(gameState.topCard, true);
    }

    if (ui.pileEl) {
      if (state.estSpec || !gameState.estMonTour) {
        ui.pileEl.classList.add("disabled");
      } else {
        ui.pileEl.classList.remove("disabled");
      }
    }

    // Deck selon rôle
    if (ui.deckEl) {
      if (state.estSpec) {
        ui.deckEl.innerHTML =
          "<div style='color: #fff; text-align: center; width: 100%;'>Mode spectateur</div>";
      } else {
        ui.deckEl.innerHTML = "";
        gameState.monDeck.forEach((card, idx) => {
          const cardEl = document.createElement("div");
          cardEl.className = "uno-deck-card";
          const colorClass =
            card.color !== "wild" ? `color-${card.color}` : "color-black";
          cardEl.classList.add(colorClass);
          cardEl.textContent = card.valeur;

          const peutJouer =
            gameState.estMonTour && gameState.playableCards.includes(idx);

          if (!peutJouer) {
            cardEl.classList.add("disabled");
          } else {
            cardEl.addEventListener("click", () => {
              if (card.valeur === "Joker" || card.valeur === "+4") {
                setupColorPicker(idx);
              } else {
                jouerCarte(idx);
              }
            });
          }

          ui.deckEl.appendChild(cardEl);
        });
      }
    }

    if (ui.advEl) {
      ui.advEl.innerHTML = "";
      gameState.opponents.forEach((opp) => {
        const oppEl = document.createElement("div");
        oppEl.className = "uno-opponent";
        const isTurn = opp.pseudo === gameState.currentPlayer;

        oppEl.innerHTML = `
         <div class="uno-opponent-name ${isTurn ? "highlight" : ""}">
           ${opp.pseudo}
         </div>
         <div class="uno-opponent-cards">${opp.cardCount} carte(s)</div>
       `;

        ui.advEl.appendChild(oppEl);
      });
    }

    // Informations
    if (ui.infoEl) {
      ui.infoEl.innerHTML = `
         <p>Direction : ${
           gameState.direction === 1 ? "Gauche -> Droite" : "Droite -> Gauche"
         }</p>
         <p>Cartes dans la pioche : ${gameState.deckSize}</p>
         ${
           gameState.message
             ? `<p style="color: #fff;">${gameState.message}</p>`
             : ""
         }
       `;
    }
  }

  // ========== Event Listeners UI ==========
  ui.joinBtn?.addEventListener("click", () => {
    socket.emit("uno:join");
  });
  ui.leaveBtn?.addEventListener("click", () => {
    socket.emit("uno:leave");
  });
  ui.startBtn?.addEventListener("click", () => {
    socket.emit("uno:start");
  });

  ui.pileEl?.addEventListener("click", () => {
    if (state.stateActuel?.estMonTour && !state.estSpec) {
      socket.emit("uno:draw");
    }
  });

  // ========== Socket Handlers ==========
  socket.on("uno:lobby", (data) => {
    try {
      state.myUsername = data.myUsername;
      state.estAuLobby = data.estAuLobby;
      state.estSpec = !data.estAuLobby && data.gameStarted;

      ui.joueursList.innerHTML = `
      <p>Joueurs dans le lobby (${data.joueurs.length}/4) :</p>
      ${
        data.joueurs.length > 0
          ? data.joueurs.map((p) => `<div>${p}</div>`).join("")
          : "<div style='color: #fff;'>Aucun joueur</div>"
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

      // Gestion des boutons
      if (state.estAuLobby) {
        ui.joinBtn.style.display = "none";
        ui.leaveBtn.style.display = "inline-block";
        ui.startBtn.style.display = "inline-block";

        if (data.canStart && data.joueurs.length >= 2) {
          ui.startBtn.disabled = false;
          ui.startBtn.textContent = "Démarrer la partie";
        } else {
          ui.startBtn.disabled = true;
          ui.startBtn.textContent = `En attente (${data.joueurs.length}/2 min)`;
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
          ui.joinBtn.disabled = data.joueurs.length >= 4;
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Début de partie
  socket.on("uno:gameStart", (state) => {
    ui.lobby.style.display = "none";
    ui.game.classList.add("active");
    updateGame(state);
  });

  // Mise à jour du jeu
  socket.on("uno:update", (state) => {
    ui.lobby.style.display = "none";
    ui.game.classList.add("active");
    updateGame(state);
  });

  // Retour au lobby
  socket.on("uno:backToLobby", () => {
    ui.game.classList.remove("active");
    ui.lobby.style.display = "block";
    socket.emit("uno:getState");
  });

  socket.on("uno:gameEnd", (data) => {
    if (state.estSpec) return;
    if (data.winner === "Partie annulée !") {
      alert(`${data.winner} ${data.reason}`);
    } else {
      alert(`🎉 ${data.winner} a gagné la partie !`);
    }
    ui.game.classList.remove("active");
    ui.lobby.style.display = "block";
    ui.statusEl.textContent = "";
    socket.emit("uno:getState");
  });

  socket.on("uno:error", (msg) => {
    if (state.estSpec) return;
    alert(msg);
  });
}
