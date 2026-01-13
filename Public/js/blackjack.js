export function initBlackjack(socket, username) {
  const container = document.getElementById("stage14");
  const dealerHandEl = document.querySelector(".dealer-hand");
  const dealerScoreEl = document.querySelector(".dealer-score");
  const messageEl = document.getElementById("bj-message");
  const playersAreaEl = document.querySelector(".players-area");
  const lobbyControlsEl = document.querySelector(".lobby-controls");
  const joinBtn = document.getElementById("bj-join");
  const startBtn = document.getElementById("bj-start");
  const leaveBtn = document.getElementById("bj-leave");

  // Rebuild controls dynamically to support new features
  const betControls = document.getElementById("bj-bet-controls");
  if (betControls) {
    betControls.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center; justify-content:center;">
        <input type="number" id="bj-bet-input" class="bj-input" placeholder="Mise" min="1">
        <button id="bj-bet-confirm" class="btn">Miser</button>
      </div>
      <div style="font-size:0.8em; margin-top:5px; color:#aaa; text-align:center;">Max: 50% de vos clicks</div>
    `;
  }

  const playControls = document.getElementById("bj-play-controls");
  // On ajoute les boutons Double et Split
  if (playControls) {
    playControls.innerHTML = `
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button id="bj-hit" class="btn">Tirer</button>
        <button id="bj-stand" class="btn btn-reset">Rester</button>
        <button id="bj-double" class="btn">Doubler</button>
        <button id="bj-split" class="btn">Split</button>
      </div>
    `;
  }

  // Contrôles du jeu
  const hitBtn = document.getElementById("bj-hit");
  const standBtn = document.getElementById("bj-stand");
  const doubleBtn = document.getElementById("bj-double");
  const splitBtn = document.getElementById("bj-split");

  const betInput = document.getElementById("bj-bet-input");
  const betConfirmBtn = document.getElementById("bj-bet-confirm");

  let myPseudo = username;
  let gameState = null;
  let currentScore = 0; // User wealth

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
  if (doubleBtn) doubleBtn.onclick = () => socket.emit("blackjack:double");
  if (splitBtn) splitBtn.onclick = () => socket.emit("blackjack:split");

  // Bet Logic
  if (betInput) {
    betInput.addEventListener("input", (e) => {
      if (e.target.value === "") return; // Allow clearing functionality

      const val = parseInt(e.target.value);
      // If currentScore is not loaded yet, default to 0 to prevent over-betting
      const max = Math.floor((currentScore || 0) * 0.5);

      if (!isNaN(val) && val > max) {
        e.target.value = max;
      }
    });
  }

  if (betConfirmBtn) {
    betConfirmBtn.onclick = () => {
      const val = parseInt(betInput.value);
      if (val && val > 0) {
        socket.emit("blackjack:bet", val);
      } else {
        alert("Mise invalide");
      }
    };
  }

  if (window.bjTimerInt) clearInterval(window.bjTimerInt);

  window.bjTimerInt = setInterval(() => {
    if (!gameState) {
      document
        .querySelectorAll(".bj-turn-timer")
        .forEach((el) => (el.textContent = ""));
      return;
    }

    const now = Date.now();
    const deadline = gameState.turnDeadline;
    const remaining =
      deadline && deadline > now ? Math.ceil((deadline - now) / 1000) : 0;

    // Phase: Playing - Timer sur joueurs
    if (gameState.phase === "playing") {
      const currentPlayerIndex = gameState.currentPlayerIndex;
      const currentPlayer = gameState.joueurs[currentPlayerIndex];

      document.querySelectorAll(".player-seat").forEach((seat) => {
        const timerEl = seat.querySelector(".bj-turn-timer");
        if (seat.dataset.pseudo === currentPlayer?.pseudo && remaining > 0) {
          if (timerEl) {
            timerEl.textContent = remaining + "s";
            timerEl.style.color = remaining <= 5 ? "red" : "gold";
          }
        } else {
          if (timerEl) timerEl.textContent = "";
        }
      });
    } else {
      document
        .querySelectorAll(".bj-turn-timer")
        .forEach((el) => (el.textContent = ""));
    }

    // Phase: Payout - Timer retour lobby
    if (gameState.phase === "payout" && remaining > 0) {
      const messageEl = document.getElementById("bj-message");
      if (messageEl && messageEl.dataset.baseText) {
        messageEl.textContent = `${messageEl.dataset.baseText} (Lobby: ${remaining}s)`;
      }
    }
  }, 250);

  socket.on("blackjack:state", (state) => {
    gameState = state;
    renderGame(state);
  });

  socket.on("blackjack:error", (msg) => {
    alert(msg);
  });

  function renderGame(state) {
    const currentPseudo = myPseudo || window.username;

    // --- Affichage Croupier ---
    syncCards(dealerHandEl, state.dealerHand);
    if (dealerScoreEl) dealerScoreEl.textContent = state.dealerScore;

    // --- Mise à jour Message ---
    if (messageEl) {
      const me = state.joueurs.find((p) => p.pseudo === currentPseudo);
      // Check waiting list
      const inQueue =
        state.waitingList && state.waitingList.includes(currentPseudo);
      let queueMsg = "";
      if (inQueue) {
        const pos = state.waitingList.indexOf(currentPseudo) + 1;
        queueMsg = ` (En attente : ${pos}/${state.waitingList.length})`;
      }

      if (inQueue) {
        messageEl.textContent = `Vous êtes dans la file d'attente${queueMsg}. Prochain tour...`;
        messageEl.style.color = "#aaa";
      } else if (state.phase === "betting") {
        messageEl.textContent =
          "Faites vos jeux ! (Max 50% de vos clicks)" + queueMsg;
        messageEl.style.color = "gold";
      } else if (state.phase === "playing") {
        const currentPlayer = state.joueurs[state.currentPlayerIndex];

        if (currentPlayer) {
          if (currentPlayer.pseudo === currentPseudo) {
            const activeHandIdx = currentPlayer.activeHandIndex;
            const handIdxDisplay =
              currentPlayer.hands.length > 1
                ? ` (Main ${activeHandIdx + 1})`
                : "";
            messageEl.textContent = `C'est à toi de jouer !${handIdxDisplay}`;
            messageEl.style.color = "#0f0";
          } else {
            messageEl.textContent = `Au tour de ${currentPlayer.pseudo}`;
            messageEl.style.color = "white";
          }
        }
      } else if (state.phase === "dealer") {
        messageEl.textContent = "Tour du Croupier...";
        messageEl.style.color = "#ff4444";
      } else if (state.phase === "payout") {
        let msg = "";
        if (me) {
          const totalWin = me.winnings;
          if (totalWin > 0) {
            msg = `GAGNÉ ! (+${totalWin})`;
            messageEl.style.color = "#0f0";
          } else if (totalWin < 0) {
            msg = `PERDU (${totalWin})`;
            messageEl.style.color = "#ff4444";
          } else {
            if (me.hands.some((h) => h.status !== "waiting")) {
              msg = "EGALITÉ";
              messageEl.style.color = "white";
            } else {
              msg = "FIN DE MANCHE";
            }
          }
        } else {
          msg = "Fin de la manche !";
          messageEl.style.color = "gold";
        }
        messageEl.textContent = msg;
        messageEl.dataset.baseText = msg;
      } else {
        messageEl.textContent = "En attente de joueurs...";
        messageEl.style.color = "#aaa";
      }
    }

    // --- Affichage Joueurs ---
    playersAreaEl.innerHTML = "";
    state.joueurs.forEach((player) => {
      const seat = createSeat(player, state, currentPseudo);
      playersAreaEl.appendChild(seat);
    });

    // Mise à jour visibilité contrôles
    updateControls(state);
  }

  function createSeat(player, state, currentPseudo) {
    const isCurrentPlayer =
      state.phase === "playing" &&
      state.joueurs[state.currentPlayerIndex]?.pseudo === player.pseudo;
    const seat = document.createElement("div");
    seat.className = `player-seat ${
      isCurrentPlayer ? "current-turn-seat" : ""
    }`;
    if (player.pseudo === currentPseudo) seat.classList.add("active");
    seat.style.position = "relative";
    seat.dataset.pseudo = player.pseudo;

    // --- Animations de fin de tour (Payout) ---
    if (state.phase === "payout") {
      if (player.winnings > 0) {
        seat.classList.add("bj-anim-win");
      } else if (player.winnings < 0) {
        seat.classList.add("bj-anim-lose");
      } else {
        // Egalité globale ou pas joué
        if (
          player.hands.length > 0 &&
          player.hands.some((h) => h.status !== "waiting")
        ) {
          seat.classList.add("bj-anim-push");
        }
      }
    }

    // Timer Display
    const timerDiv = document.createElement("div");
    timerDiv.className = "bj-turn-timer";
    timerDiv.style.position = "absolute";
    timerDiv.style.top = "-20px";
    timerDiv.style.left = "50%";
    timerDiv.style.transform = "translateX(-50%)";
    timerDiv.style.color = "gold";
    timerDiv.style.fontWeight = "bold";
    timerDiv.style.textShadow = "0 0 3px black";
    seat.appendChild(timerDiv);

    // Header info util
    // On affiche l'info globale, ou par main ?
    // Affiche le pseudo
    const header = document.createElement("div");
    header.className = "player-info";
    header.innerHTML = `<div class="player-name">${player.pseudo}</div>`;
    seat.appendChild(header);

    // Conteneur des mains
    const handsContainer = document.createElement("div");
    handsContainer.style.display = "flex";
    handsContainer.style.gap = "10px";
    handsContainer.style.justifyContent = "center";

    // Si pas de main (ou betting phase sans main encore distribuée mais bet posé)
    // Mais le serveur n'initialise hands qu'au deal. Avant c'est vide.
    if (player.hands.length === 0) {
      // Afficher juste mise si betting
      if (player.bet > 0) {
        const info = document.createElement("div");
        info.textContent = `Mise: ${player.bet}`;
        handsContainer.appendChild(info);
      }
    } else {
      const isSingleHand = player.hands.length === 1;

      player.hands.forEach((hand, idx) => {
        const isHandActive = isCurrentPlayer && player.activeHandIndex === idx;
        const handDiv = document.createElement("div");
        handDiv.className = "player-hand-container";

        if (isSingleHand) {
          handDiv.style.border = "none";
          handDiv.style.padding = "0";
          handDiv.style.background = "none";

          // Animations spécifiques à la main (même si unique)
          if (hand.status === "blackjack") {
            handDiv.classList.add("bj-anim-blackjack");
            // Force border display for animation
            handDiv.style.border = "2px solid gold";
            handDiv.style.padding = "5px";
            handDiv.style.borderRadius = "10px";
          } else if (hand.status === "bust") {
            handDiv.classList.add("bj-anim-bust");
            handDiv.style.border = "2px solid red";
            handDiv.style.padding = "5px";
            handDiv.style.borderRadius = "10px";
          }
        } else {
          handDiv.style.border = isHandActive
            ? "2px solid yellow"
            : "1px solid #444";
          handDiv.style.padding = "10px";
          handDiv.style.backgroundColor = isHandActive
            ? "rgba(255,255,0,0.1)"
            : "transparent";

          // Animations multi-main
          if (hand.status === "blackjack") {
            handDiv.classList.add("bj-anim-blackjack");
          } else if (hand.status === "bust") {
            handDiv.classList.add("bj-anim-bust");
          }
        }

        // Score & Bet
        const infoMin = document.createElement("div");
        infoMin.style.fontSize = "0.8em";
        infoMin.style.marginBottom = "5px";
        infoMin.innerHTML = `Mise: ${hand.bet} <br> Score: ${hand.score}`;
        handDiv.appendChild(infoMin);

        // Cards
        const cardsDiv = document.createElement("div");
        cardsDiv.className = "player-hand";
        // Note: CSS .player-hand expects display flex usually.
        cardsDiv.style.display = "flex";
        cardsDiv.style.minHeight = "60px";

        hand.cards.forEach((c) => cardsDiv.appendChild(createCardEl(c)));
        handDiv.appendChild(cardsDiv);

        // Status Overlay specific to hand
        if (hand.status !== "playing" && hand.status !== "waiting") {
          const overlay = document.createElement("div");
          overlay.style.fontWeight = "bold";
          overlay.style.marginTop = "2px";
          if (hand.status === "bust") {
            overlay.textContent = "BUST";
            overlay.style.color = "red";
          } else if (hand.status === "blackjack") {
            overlay.textContent = "BLACKJACK !";
            overlay.style.color = "gold";
          } else if (hand.status === "stand") {
            overlay.textContent = "STAND";
            overlay.style.color = "#aaa";
          }
          handDiv.appendChild(overlay);
        }

        handsContainer.appendChild(handDiv);
      });
    }

    seat.appendChild(handsContainer);
    return seat;
  }

  // Helper sync inutilisé ici car je rebuild tout (plus simple pour multi-mains dynamique)
  function syncCards(container, cards) {
    container.innerHTML = "";
    cards.forEach((c) => container.appendChild(createCardEl(c)));
  }

  function updateControls(state) {
    const currentPseudo = myPseudo || window.username;
    const me = state.joueurs.find((p) => p.pseudo === currentPseudo);
    const inQueue =
      state.waitingList && state.waitingList.includes(currentPseudo);

    const isMyTurn =
      state.phase === "playing" &&
      state.joueurs[state.currentPlayerIndex]?.pseudo === currentPseudo;

    // Controls display logic
    // If player is playing OR in queue, consider them "inside" (hide Join, show Leave)
    if (!me && !inQueue) {
      if (joinBtn) joinBtn.style.display = "block";
      if (leaveBtn) leaveBtn.style.display = "none";
      if (startBtn) startBtn.style.display = "none";
    } else {
      if (joinBtn) joinBtn.style.display = "none";
      if (leaveBtn) leaveBtn.style.display = "block";
      if (startBtn) {
        // Start button visible only if playing (not in queue) and game not started
        startBtn.style.display =
          state.gameStarted || inQueue ? "none" : "block";
      }
    }

    const betC = document.getElementById("bj-bet-controls");
    const playC = document.getElementById("bj-play-controls");

    if (state.phase === "betting" && me && me.bet === 0) {
      if (betC) betC.style.display = "flex";
      if (playC) playC.style.display = "none";
    } else if (isMyTurn) {
      if (betC) betC.style.display = "none";
      if (playC) playC.style.display = "flex";

      // Enable/Disable Split/Double based on hand
      const activeHand = me.hands[me.activeHandIndex];
      // Double: 2 cards only
      const canDouble = activeHand && activeHand.cards.length === 2;
      // Split: 2 cards, same rank, and only if hands.length < 2 (as per server rule)
      const canSplit =
        activeHand &&
        activeHand.cards.length === 2 &&
        me.hands.length < 2 &&
        activeHand.cards[0].value === activeHand.cards[1].value;

      if (doubleBtn) doubleBtn.disabled = !canDouble;
      if (splitBtn) splitBtn.disabled = !canSplit;

      // Style disabled buttons?
      doubleBtn.style.opacity = canDouble ? "1" : "0.3";
      splitBtn.style.opacity = canSplit ? "1" : "0.3";
    } else {
      if (betC) betC.style.display = "none";
      if (playC) playC.style.display = "none";
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
