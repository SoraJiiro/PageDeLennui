export function initBlackjack(socket, username) {
  const container = document.getElementById("stage14");
  const dealerHandEl = document.querySelector(".dealer-hand");
  const dealerScoreEl = document.querySelector(".dealer-score");
  const messageEl = document.getElementById("bj-message");
  const playersAreaEl = document.querySelector(".players-area");
  const controlsEl = document.querySelector(".blackjack-controls");
  const lobbyControlsEl = document.querySelector(".lobby-controls");
  const joinBtn = document.getElementById("bj-join");
  const startBtn = document.getElementById("bj-start");
  const leaveBtn = document.getElementById("bj-leave");

  // Contrôles du jeu
  const hitBtn = document.getElementById("bj-hit");
  const standBtn = document.getElementById("bj-stand");
  const betBtns = document.querySelectorAll(".bj-bet-btn");

  let myPseudo = username;
  let gameState = null;
  let currentScore = 0;

  // Suivi du score
  socket.on("clicker:you", (data) => {
    currentScore = data.score;
  });
  socket.on("clicker:update", (data) => {
    currentScore = data.score;
  });

  // Listeners Rejoindre/Quitter
  if (joinBtn) joinBtn.onclick = () => socket.emit("blackjack:join");
  if (leaveBtn) leaveBtn.onclick = () => socket.emit("blackjack:leave");
  if (startBtn) startBtn.onclick = () => socket.emit("blackjack:start");

  // Listeners Actions Jeu
  if (hitBtn) hitBtn.onclick = () => socket.emit("blackjack:hit");
  if (standBtn) standBtn.onclick = () => socket.emit("blackjack:stand");

  betBtns.forEach((btn) => {
    btn.onclick = () => {
      const percent = parseInt(btn.dataset.percent);
      if (isNaN(percent) || percent <= 0) return;

      const amount = Math.floor(currentScore * (percent / 100));
      if (amount > 0) {
        socket.emit("blackjack:bet", amount);
      } else {
        alert("Pas assez de clicks pour miser !");
      }
    };
  });

  socket.on("blackjack:state", (state) => {
    gameState = state;
    renderGame(state);
  });

  socket.on("blackjack:error", (msg) => {
    alert(msg); // Alerte simple pour l'instant
  });

  function renderGame(state) {
    const currentPseudo = myPseudo || window.username;

    // --- Affichage Croupier ---
    syncCards(dealerHandEl, state.dealerHand);
    if (dealerScoreEl) dealerScoreEl.textContent = state.dealerScore;

    // --- Mise à jour Message ---
    if (messageEl) {
      const me = state.joueurs.find((p) => p.pseudo === currentPseudo);

      if (state.phase === "betting") {
        messageEl.textContent = "Faites vos jeux ! (Misez)";
        messageEl.style.color = "gold";
      } else if (state.phase === "playing") {
        const currentPlayer = state.joueurs[state.currentPlayerIndex];

        // Custom Logic: Si le joueur local a sauté ("bust"), on laisse le message affiché pour lui
        if (me && me.status === "bust") {
          messageEl.textContent = "VOUS AVEZ SAUTÉ (Au dessus) ! 💥";
          messageEl.style.color = "#ff4444";
        } else if (currentPlayer) {
          if (currentPlayer.pseudo === currentPseudo) {
            messageEl.textContent = "C'est à toi de jouer !";
            messageEl.style.color = "#0f0";
          } else {
            messageEl.textContent = `Au tour de ${currentPlayer.pseudo}`;
            messageEl.style.color = "white";
          }
        }
      } else if (state.phase === "dealer") {
        if (me && me.status === "bust") {
          messageEl.textContent = "VOUS AVEZ SAUTÉ... (Croupier joue)";
          messageEl.style.color = "#ff4444";
        } else {
          messageEl.textContent = "Tour du Croupier...";
          messageEl.style.color = "#ff4444";
        }
      } else if (state.phase === "payout") {
        if (me && me.winnings !== undefined) {
          if (me.winnings > me.bet) {
            messageEl.textContent = "BLACKJACK !!";
            messageEl.style.color = "gold";
          } else if (me.winnings > 0) {
            messageEl.textContent = "VOUS AVEZ GAGNÉ !";
            messageEl.style.color = "#0f0";
          } else if (me.winnings < 0) {
            messageEl.textContent = "VOUS AVEZ PERDU...";
            messageEl.style.color = "#ff4444";
          } else {
            messageEl.textContent = "ÉGALITÉ";
            messageEl.style.color = "white";
          }
        } else {
          messageEl.textContent = "Fin de la manche !";
          messageEl.style.color = "gold";
        }
      } else {
        messageEl.textContent = "En attente de joueurs...";
        messageEl.style.color = "#aaa";
      }
    }

    // --- Affichage Joueurs ---
    const existingSeats = Array.from(playersAreaEl.children);
    const playerPseudos = state.joueurs.map((p) => p.pseudo);
    const existingPseudos = existingSeats.map((el) => el.dataset.pseudo);

    // Vérifier si la liste des joueurs a changé
    const playersChanged =
      JSON.stringify(existingPseudos) !== JSON.stringify(playerPseudos);

    if (playersChanged) {
      playersAreaEl.innerHTML = "";
      state.joueurs.forEach((player) => {
        const seat = createSeat(player, state, currentPseudo);
        playersAreaEl.appendChild(seat);
        // Affichage initial des cartes
        const handEl = seat.querySelector(".player-hand");
        player.hand.forEach((card) => handEl.appendChild(createCardEl(card)));
      });
    } else {
      // Mise à jour des sièges existants
      state.joueurs.forEach((player, index) => {
        const seat = existingSeats[index];
        updateSeatInfo(seat, player, state, currentPseudo);
        const handEl = seat.querySelector(".player-hand");
        syncCards(handEl, player.hand);
      });
    }

    // Mise à jour visibilité contrôles
    updateControls(state);
  }

  function createSeat(player, state, currentPseudo) {
    const seat = document.createElement("div");
    seat.className = `player-seat`;
    seat.dataset.pseudo = player.pseudo;
    updateSeatInfo(seat, player, state, currentPseudo);

    seat.innerHTML = `
            <div class="player-info">
                <div class="player-name">${player.pseudo}</div>
                <div class="player-bet">Mise: ${player.bet}</div>
                <div class="player-score">${player.score}</div>
            </div>
            <div class="player-hand"></div>
        `;
    return seat;
  }

  function updateSeatInfo(seat, player, state, currentPseudo) {
    // Mise à jour classes
    seat.className = `player-seat ${
      state.phase === "playing" &&
      state.joueurs[state.currentPlayerIndex]?.pseudo === player.pseudo
        ? "current-turn"
        : ""
    }`;
    if (player.pseudo === currentPseudo) seat.classList.add("active");

    // Mise à jour texte si siège existe déjà
    if (seat.children.length > 0) {
      seat.querySelector(".player-bet").textContent = `Mise: ${player.bet}`;
      seat.querySelector(".player-score").textContent = player.score;

      // Gestion overlay statut
      let statusOverlay = seat.querySelector(".bj-status-overlay");
      if (statusOverlay) statusOverlay.remove();

      if (state.phase === "payout" && player.winnings !== undefined) {
        const status = document.createElement("div");
        status.className = "bj-status-overlay";
        if (player.winnings > player.bet) {
          status.textContent = "BLACKJACK!";
          status.classList.add("status-blackjack");
        } else if (player.winnings > 0) {
          status.textContent = "GAGNÉ";
          status.classList.add("status-win");
        } else if (player.winnings < 0) {
          status.textContent = "PERDU";
          status.classList.add("status-lose");
        } else {
          status.textContent = "EGALITÉ";
          status.classList.add("status-push");
        }
        seat.appendChild(status);
      } else if (player.status === "bust") {
        const status = document.createElement("div");
        status.className = "bj-status-overlay status-lose";
        status.textContent = "AU DESSUS";
        seat.appendChild(status);
      } else if (player.status === "stand") {
        const status = document.createElement("div");
        status.className = "bj-status-overlay";
        status.style.fontSize = "1.5rem";
        status.style.color = "#aaa";
        status.textContent = "STAND";
        seat.appendChild(status);
      }
    }
  }

  function syncCards(container, cards) {
    const currentEls = Array.from(container.children);

    // If fewer cards in state (new game), clear
    if (cards.length < currentEls.length) {
      container.innerHTML = "";
      cards.forEach((c) => container.appendChild(createCardEl(c)));
      return;
    }

    // Update existing cards (in case hidden card is revealed)
    for (let i = 0; i < currentEls.length; i++) {
      const el = currentEls[i];
      const card = cards[i];
      const isHidden = el.classList.contains("hidden");
      const shouldBeHidden = card.value === "?";

      if (isHidden !== shouldBeHidden) {
        const newCard = createCardEl(card);
        container.replaceChild(newCard, el);
      }
    }

    // Add new cards
    for (let i = currentEls.length; i < cards.length; i++) {
      container.appendChild(createCardEl(cards[i]));
    }
  }

  function updateControls(state) {
    const currentPseudo = myPseudo || window.username;
    const me = state.joueurs.find((p) => p.pseudo === currentPseudo);
    const isMyTurn =
      state.phase === "playing" &&
      state.joueurs[state.currentPlayerIndex]?.pseudo === currentPseudo;

    /*console.log("--- DEBUG BLACKJACK ---");
    console.log("Current Pseudo:", currentPseudo);
    console.log("Players:", state.joueurs);
    console.log("Am I in?", !!me);
    console.log("Game Started?", state.gameStarted);
    console.log("-----------------------");*/

    // Lobby controls
    if (!me) {
      joinBtn.style.display = "block";
      leaveBtn.style.display = "none";
      startBtn.style.display = "none";
    } else {
      joinBtn.style.display = "none";
      leaveBtn.style.display = "block";
      // Show start button if game not started
      if (state.gameStarted) {
        startBtn.style.display = "none";
      } else {
        startBtn.style.display = "block";
      }
    }

    // Game controls
    if (state.phase === "betting" && me && me.bet === 0) {
      document.getElementById("bj-bet-controls").style.display = "flex";
      document.getElementById("bj-play-controls").style.display = "none";
    } else if (isMyTurn) {
      document.getElementById("bj-bet-controls").style.display = "none";
      document.getElementById("bj-play-controls").style.display = "flex";
    } else {
      document.getElementById("bj-bet-controls").style.display = "none";
      document.getElementById("bj-play-controls").style.display = "none";
    }
  }

  function createCardEl(card) {
    const el = document.createElement("div");
    el.className = "bj-card";

    if (!card) return el;

    if (card.value === "?") {
      el.classList.add("hidden");
      return el;
    }

    const suitSymbols = { H: "♥", D: "♦", C: "♣", S: "♠" };
    const isRed = card.suit === "H" || card.suit === "D";

    if (isRed) el.classList.add("red");

    el.innerHTML = `
            <div class="suit-top">${card.value}</div>
            <div class="suit-center">${suitSymbols[card.suit]}</div>
            <div class="suit-bottom">${card.value}</div>
        `;
    return el;
  }
}
