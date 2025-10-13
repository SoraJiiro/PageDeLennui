export function initUno(socket) {
  const lobby = document.querySelector(".uno-lobby");
  const game = document.querySelector(".uno-game");
  const joinBtn = document.querySelector(".uno-rej");
  const leaveBtn = document.querySelector(".uno-quitter");
  const startBtn = document.querySelector(".uno-start-game");
  const joueursList = document.querySelector(".uno-joueurs");
  const specsList = document.querySelector(".uno-spectators");
  const statusEl = document.querySelector(".uno-status");
  const pileEl = document.querySelector(".uno-pile");
  const discardEl = document.querySelector(".uno-discard");
  const deckEl = document.querySelector(".uno-deck");
  const infoEl = document.querySelector(".uno-info");
  const advEl = document.querySelector(".uno-adversaires");
  const colorPicker = document.querySelector(".uno-color-picker");
  const colorOptions = document.querySelector(".uno-color-options");
  const modeSpec = document.querySelector(".uno-mode-spec");

  let stateActuel = null;
  let myUsername = null;
  let estAuLobby = false;
  let estSpec = false;

  // Demander l'état initial au chargement de la page
  socket.emit("uno:getState");

  // Redemander l'état quand on arrive sur la page UNO
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

  // Rejoindre le lobby
  joinBtn?.addEventListener("click", () => {
    socket.emit("uno:join");
  });

  // Quitter le lobby
  leaveBtn?.addEventListener("click", () => {
    socket.emit("uno:leave");
  });

  // Démarrer la partie
  startBtn?.addEventListener("click", () => {
    socket.emit("uno:start");
  });

  // Mise à jour du lobby
  socket.on("uno:lobby", (data) => {
    try {
      myUsername = data.myUsername;
      estAuLobby = data.estAuLobby;
      estSpec = !data.estAuLobby && data.gameStarted;

      joueursList.innerHTML = `
      <p>Joueurs dans le lobby (${data.joueurs.length}/4) :</p>
      ${
        data.joueurs.length > 0
          ? data.joueurs.map((p) => `<div>${p}</div>`).join("")
          : "<div style='color: #fff;'>Aucun joueur</div>"
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

      // Gestion des boutons
      if (estAuLobby) {
        joinBtn.style.display = "none";
        leaveBtn.style.display = "inline-block";
        startBtn.style.display = "inline-block";

        if (data.canStart && data.joueurs.length >= 2) {
          startBtn.disabled = false;
          startBtn.textContent = "Démarrer la partie";
        } else {
          startBtn.disabled = true;
          startBtn.textContent = `En attente (${data.joueurs.length}/2 min)`;
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
          joinBtn.disabled = data.joueurs.length >= 4;
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Début de partie
  socket.on("uno:gameStart", (state) => {
    lobby.style.display = "none";
    game.classList.add("active");
    updateGame(state);
  });

  // Mise à jour du jeu
  socket.on("uno:update", (state) => {
    lobby.style.display = "none";
    game.classList.add("active");
    updateGame(state);
  });

  // Retour au lobby
  socket.on("uno:backToLobby", () => {
    game.classList.remove("active");
    lobby.style.display = "block";
    socket.emit("uno:getState");
  });

  // Pioche
  pileEl?.addEventListener("click", () => {
    if (stateActuel?.estMonTour && !estSpec) {
      socket.emit("uno:draw");
    }
  });

  // Jouer une carte
  function jouerCarte(cardIndex) {
    socket.emit("uno:play", { cardIndex });
  }

  // Choisir une couleur
  function setupColorPicker(cardIndex) {
    colorPicker.classList.add("active");
    colorOptions.innerHTML = `
      <button class="uno-color-btn color-red" data-color="red">Rouge</button>
      <button class="uno-color-btn color-blue" data-color="blue">Bleu</button>
      <button class="uno-color-btn color-green" data-color="green">Vert</button>
      <button class="uno-color-btn color-pink" data-color="pink">Rose</button>
    `;

    colorOptions.querySelectorAll(".uno-color-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const color = btn.dataset.color;
        socket.emit("uno:play", { cardIndex, color });
        colorPicker.classList.remove("active");
      });
    });
  }

  // Affichage d'une carte
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

  // Mise à jour de l'interface
  function updateGame(state) {
    stateActuel = state;
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
      const tourDuJoueur = state.currentPlayer;
      const estMonTour = state.estMonTour && !estSpec;
      if (estMonTour) {
        statusEl.textContent = "C'est ton tour !";
        pileEl.classList.add("tonTour");
      } else {
        statusEl.textContent = `Tour de ${tourDuJoueur}`;
        pileEl.classList.remove("tonTour");
      }
    }

    // Carte défaussée
    if (discardEl) {
      discardEl.innerHTML = renderCard(state.topCard, true);
    }

    // Pioche
    if (pileEl) {
      if (estSpec || !state.estMonTour) {
        pileEl.classList.add("disabled");
      } else {
        pileEl.classList.remove("disabled");
      }
    }

    // Main du joueur (vide si spectateur)
    if (deckEl) {
      if (estSpec) {
        deckEl.innerHTML =
          "<div style='color: #fff; text-align: center; width: 100%;'>Mode spectateur</div>";
      } else {
        deckEl.innerHTML = "";
        state.monDeck.forEach((card, idx) => {
          const cardEl = document.createElement("div");
          cardEl.className = "uno-deck-card";
          const colorClass =
            card.color !== "wild" ? `color-${card.color}` : "color-black";
          cardEl.classList.add(colorClass);
          cardEl.textContent = card.valeur;

          const peutJouer =
            state.estMonTour && state.playableCards.includes(idx);

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

          deckEl.appendChild(cardEl);
        });
      }
    }

    // Adversaires
    if (advEl) {
      advEl.innerHTML = "";
      state.opponents.forEach((opp) => {
        const oppEl = document.createElement("div");
        oppEl.className = "uno-opponent";
        const isTurn = opp.pseudo === state.currentPlayer;

        oppEl.innerHTML = `
      <div class="uno-opponent-name ${isTurn ? "highlight" : ""}">
        ${opp.pseudo}
      </div>
      <div class="uno-opponent-cards">${opp.cardCount} carte(s)</div>
    `;

        advEl.appendChild(oppEl);
      });
    }

    // Informations
    if (infoEl) {
      infoEl.innerHTML = `
        <p>Direction : ${
          state.direction === 1 ? "Gauche -> Droite" : "Droite -> Gacuhe"
        }</p>
        <p>Cartes dans la pioche : ${state.deckSize}</p>
        ${state.message ? `<p style="color: #fff;">${state.message}</p>` : ""}
      `;
    }
  }

  // Fin de partie
  socket.on("uno:gameEnd", (data) => {
    if (estSpec) return;
    if (data.winner === "Partie annulée !") {
      alert(`${data.winner} ${data.reason}`);
    } else {
      alert(`🎉 ${data.winner} a gagné la partie !`);
    }
    game.classList.remove("active");
    lobby.style.display = "block";
    statusEl.textContent = "";
    socket.emit("uno:getState");
  });

  socket.on("uno:error", (msg) => {
    if (estSpec) return;
    alert(msg);
  });
}
