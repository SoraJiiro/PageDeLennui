class BlackjackGame {
  constructor() {
    this.joueurs = []; // Structure joueur
    this.waitingList = []; // Liste d'attente
    this.spectators = [];
    this.deck = [];
    this.dealerHand = [];
    this.gameStarted = false;
    this.phase = "lobby"; // lobby, betting, playing, dealer, payout
    this.currentPlayerIndex = 0;
    this.turnTimer = null;
    this.turnTimeoutMs = 15000; // 15s par tour
    this.turnDeadline = 0; // Timestamp deadline
    this.betTimer = null;
    this.betTimeoutMs = 15000; // 15s pour miser
    this.emitState = null;
    this.onRoundEnd = null;
  }

  setEmitter(fn) {
    this.emitState = fn;
  }

  setRoundEndCallback(fn) {
    this.onRoundEnd = fn;
  }

  addPlayer(pseudo, socketId) {
    const existingPlayer = this.joueurs.find((p) => p.pseudo === pseudo);
    if (existingPlayer) {
      existingPlayer.socketId = socketId; // Reconnect ?
      return { success: false, reason: "alreadyIn" };
    }

    const existingQueue = this.waitingList.find((p) => p.pseudo === pseudo);
    if (existingQueue) {
      existingQueue.socketId = socketId;
      return {
        success: true,
        status: "queued",
        position: this.waitingList.indexOf(existingQueue) + 1,
      };
    }

    // Si le jeu est commencé OU la table est pleine -> liste d'attente
    if (this.gameStarted || this.joueurs.length >= 4) {
      this.waitingList.push({ pseudo, socketId });
      return {
        success: true,
        status: "queued",
        position: this.waitingList.length,
      };
    }

    // Sinon rejoint direct
    this.joueurs.push({
      pseudo,
      socketId,
      hands: [],
      activeHandIndex: 0,
      bet: 0,
      status: "waiting",
      winnings: 0,
    });
    return { success: true, status: "joined" };
  }

  removePlayer(pseudo) {
    // Check Waiting List first
    const qIndex = this.waitingList.findIndex((p) => p.pseudo === pseudo);
    if (qIndex !== -1) {
      this.waitingList.splice(qIndex, 1);
      return true;
    }

    const index = this.joueurs.findIndex((p) => p.pseudo === pseudo);
    if (index !== -1) {
      // Si le joueur actuel quitte pendant son tour
      if (this.phase === "playing" && index === this.currentPlayerIndex) {
        this.nextTurn();
      } else if (this.phase === "playing" && index < this.currentPlayerIndex) {
        this.currentPlayerIndex--;
      }

      this.joueurs.splice(index, 1);

      // Si le jeu n'est pas en cours, on peut remplir les places vides depuis la file d'attente
      if (!this.gameStarted) {
        this.processQueue();
      }

      // Si plus de joueurs (même après processQueue), reset
      if (this.joueurs.length === 0) {
        this.resetGame();
      }

      return true;
    }
    return false;
  }

  processQueue() {
    while (this.joueurs.length < 4 && this.waitingList.length > 0) {
      const nextPlayer = this.waitingList.shift();
      this.joueurs.push({
        pseudo: nextPlayer.pseudo,
        socketId: nextPlayer.socketId,
        hands: [],
        activeHandIndex: 0,
        bet: 0,
        status: "waiting",
        winnings: 0,
      });
    }
  }

  addSpectator(pseudo, socketId) {
    const existingSpectator = this.spectators.find((s) => s.pseudo === pseudo);
    if (existingSpectator) {
      existingSpectator.socketId = socketId;
    } else {
      this.spectators.push({ pseudo, socketId });
    }
  }

  removeSpectator(pseudo) {
    const index = this.spectators.findIndex((s) => s.pseudo === pseudo);
    if (index !== -1) {
      this.spectators.splice(index, 1);
    }
  }

  updateSocketId(pseudo, newSocketId) {
    const joueur = this.joueurs.find((p) => p.pseudo === pseudo);
    if (joueur) joueur.socketId = newSocketId;

    const queued = this.waitingList.find((p) => p.pseudo === pseudo);
    if (queued) queued.socketId = newSocketId;

    const spectator = this.spectators.find((s) => s.pseudo === pseudo);
    if (spectator) spectator.socketId = newSocketId;
  }

  canStart() {
    return this.joueurs.length >= 1 && !this.gameStarted;
  }

  resetGame() {
    this.gameStarted = false;
    this.processQueue(); // Remplir les places avec la file d'attente

    this.phase = "lobby";
    this.deck = [];
    this.dealerHand = [];
    this.currentPlayerIndex = 0;
    this.joueurs.forEach((p) => {
      p.hands = [];
      p.activeHandIndex = 0;
      p.bet = 0;
      p.status = "waiting";
      p.winnings = 0;
    });
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.betTimer) clearTimeout(this.betTimer);
  }

  createDeck() {
    const suits = ["H", "D", "C", "S"];
    const values = [
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
      "A",
    ];
    this.deck = [];

    // Utiliser 8 paquets
    for (let i = 0; i < 8; i++) {
      suits.forEach((suit) => {
        values.forEach((value) => {
          this.deck.push({ suit, value });
        });
      });
    }

    // Mélanger
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  calculateScore(hand) {
    let score = 0;
    let aces = 0;

    hand.forEach((card) => {
      if (!card || !card.value) return;

      if (["J", "Q", "K"].includes(card.value)) {
        score += 10;
      } else if (card.value === "A") {
        aces += 1;
        score += 11;
      } else {
        score += parseInt(card.value);
      }
    });

    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }

    return score;
  }

  startBetting() {
    if (!this.canStart()) return false;
    this.gameStarted = true;
    this.phase = "betting";
    this.createDeck();

    // Réinitialiser états joueurs
    this.joueurs.forEach((p) => {
      p.hands = [];
      p.activeHandIndex = 0;
      p.bet = 0;
      p.status = "betting";
      p.winnings = 0;
    });
    this.dealerHand = [];

    if (this.emitState) this.emitState(this.getState());

    // Timer de mise (15s)
    if (this.betTimer) clearTimeout(this.betTimer);
    this.betTimer = setTimeout(() => {
      // Kick ceux qui n'ont pas misé
      this.joueurs = this.joueurs.filter((p) => p.bet > 0);

      if (this.joueurs.length === 0) {
        this.resetGame();
      } else {
        this.dealInitialCards();
      }
      if (this.emitState) this.emitState(this.getState());
    }, 15000);

    return true;
  }

  placeBet(pseudo, amount) {
    const player = this.joueurs.find((p) => p.pseudo === pseudo);
    if (!player || this.phase !== "betting") return false;

    player.bet = amount;
    player.status = "ready";

    // Vérifier si tous les joueurs ont misé
    if (this.joueurs.every((p) => p.bet > 0)) {
      if (this.betTimer) clearTimeout(this.betTimer);
      this.dealInitialCards();
    }
    return true;
  }

  dealInitialCards() {
    this.phase = "playing";
    this.currentPlayerIndex = 0;

    // Distribuer 2 cartes à chaque joueur
    this.joueurs.forEach((p) => {
      const cards = [this.deck.pop(), this.deck.pop()];
      const score = this.calculateScore(cards);
      let status = "playing";

      // Blackjack naturel sur la première main
      if (score === 21) {
        status = "blackjack";
      }

      p.hands = [
        {
          cards: cards,
          bet: p.bet,
          score: score,
          status: status,
        },
      ];
      p.activeHandIndex = 0;
    });

    // Distribuer 2 cartes au croupier (une cachée)
    this.dealerHand.push(this.deck.pop());
    this.dealerHand.push(this.deck.pop());

    this.checkTurn();
  }

  checkTurn() {
    if (this.turnTimer) clearTimeout(this.turnTimer);

    if (this.currentPlayerIndex >= this.joueurs.length) {
      this.startDealerTurn();
      return;
    }

    const player = this.joueurs[this.currentPlayerIndex];
    if (player.activeHandIndex >= player.hands.length) {
      this.nextPlayer();
      return;
    }

    const currentHand = player.hands[player.activeHandIndex];

    if (currentHand.status !== "playing") {
      this.nextHandOrPlayer();
      return;
    }

    // Timer de tour (15s)
    this.turnDeadline = Date.now() + 15000;
    this.turnTimer = setTimeout(() => {
      this.stand(player.pseudo);
    }, 15000);
  }

  nextHandOrPlayer() {
    const player = this.joueurs[this.currentPlayerIndex];
    player.activeHandIndex++;
    if (player.activeHandIndex >= player.hands.length) {
      this.nextPlayer();
    } else {
      this.checkTurn();
    }
  }

  nextPlayer() {
    this.currentPlayerIndex++;
    this.checkTurn();
  }

  // --- ACTIONS ---

  hit(pseudo) {
    const player = this.joueurs[this.currentPlayerIndex];
    if (!player || player.pseudo !== pseudo || this.phase !== "playing")
      return false;

    const hand = player.hands[player.activeHandIndex];
    if (!hand || hand.status !== "playing") return false;

    hand.cards.push(this.deck.pop());
    hand.score = this.calculateScore(hand.cards);

    if (hand.score > 21) {
      hand.status = "bust";
      this.nextHandOrPlayer();
    } else if (hand.score === 21) {
      hand.status = "stand"; // Auto stand à 21
      this.nextHandOrPlayer();
    }

    return true;
  }

  stand(pseudo) {
    const player = this.joueurs[this.currentPlayerIndex];
    if (!player || player.pseudo !== pseudo || this.phase !== "playing")
      return false;

    const hand = player.hands[player.activeHandIndex];
    if (!hand || hand.status !== "playing") return false;

    hand.status = "stand";
    this.nextHandOrPlayer();
    return true;
  }

  double(pseudo) {
    const player = this.joueurs[this.currentPlayerIndex];
    if (!player || player.pseudo !== pseudo || this.phase !== "playing")
      return { success: false };

    const hand = player.hands[player.activeHandIndex];
    if (!hand || hand.status !== "playing" || hand.cards.length !== 2)
      return { success: false };

    const cost = hand.bet;

    player.bet += cost;
    hand.bet += cost;

    hand.cards.push(this.deck.pop());
    hand.score = this.calculateScore(hand.cards);

    if (hand.score > 21) {
      hand.status = "bust";
    } else {
      hand.status = "stand";
    }

    this.nextHandOrPlayer();
    return { success: true, cost };
  }

  split(pseudo) {
    const player = this.joueurs[this.currentPlayerIndex];
    if (!player || player.pseudo !== pseudo || this.phase !== "playing")
      return { success: false };

    const hand = player.hands[player.activeHandIndex];

    // Vérif conditions: 2 cartes, même valeur de rang
    if (!hand || hand.status !== "playing" || hand.cards.length !== 2)
      return { success: false };
    if (hand.cards[0].value !== hand.cards[1].value) return { success: false };

    if (player.hands.length >= 2)
      return { success: false, reason: "max_splits" };

    const splitBet = hand.bet;

    const card1 = hand.cards[0];
    const card2 = hand.cards[1];

    // Main 1
    hand.cards = [card1, this.deck.pop()];
    hand.score = this.calculateScore(hand.cards);
    if (hand.score === 21) hand.status = "stand";

    // Main 2
    const newHand = {
      cards: [card2, this.deck.pop()],
      bet: splitBet,
      status: "playing",
      score: 0,
    };
    newHand.score = this.calculateScore(newHand.cards);
    if (newHand.score === 21) newHand.status = "stand";

    player.hands.splice(player.activeHandIndex + 1, 0, newHand);

    player.bet += splitBet;

    // On reste sur la même main (maintennant Main 1) pour la jouer
    // On ne fait pas nextHandOrPlayer
    // Reset timer manually:
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnDeadline = Date.now() + 15000;
    this.turnTimer = setTimeout(() => {
      this.stand(player.pseudo);
    }, 15000);

    return { success: true, cost: splitBet };
  }

  async startDealerTurn() {
    this.phase = "dealer";

    if (this.emitState) this.emitState(this.getState());
    await new Promise((r) => setTimeout(r, 800));

    let dealerScore = this.calculateScore(this.dealerHand);

    while (dealerScore < 17) {
      this.dealerHand.push(this.deck.pop());
      dealerScore = this.calculateScore(this.dealerHand);

      if (this.emitState) this.emitState(this.getState());
      await new Promise((r) => setTimeout(r, 1000));
    }

    this.endRound();
    if (this.emitState) this.emitState(this.getState());
  }

  endRound() {
    this.phase = "payout";
    const dealerScore = this.calculateScore(this.dealerHand);
    const dealerBust = dealerScore > 21;
    const dealerBlackjack = dealerScore === 21 && this.dealerHand.length === 2;

    this.joueurs.forEach((p) => {
      let totalWinnings = 0;

      p.hands.forEach((hand) => {
        let handWin = 0;

        if (hand.status === "bust") {
          handWin = -hand.bet;
        } else if (hand.status === "blackjack") {
          if (dealerBlackjack) {
            handWin = 0;
          } else {
            handWin = Math.floor(hand.bet * 1.5);
          }
        } else {
          if (dealerBlackjack) {
            handWin = -hand.bet;
          } else if (dealerBust) {
            handWin = hand.bet;
          } else if (hand.score > dealerScore) {
            handWin = hand.bet;
          } else if (hand.score < dealerScore) {
            handWin = -hand.bet;
          } else {
            handWin = 0;
          }
        }
        totalWinnings += handWin;
      });

      p.winnings = totalWinnings;
    });

    if (this.onRoundEnd) {
      this.onRoundEnd();
    }

    this.turnDeadline = Date.now() + 5000;
    if (this.emitState) this.emitState(this.getState());

    setTimeout(() => {
      this.resetGame();
      if (this.joueurs.length > 0) {
        this.startBetting();
      }
      if (this.emitState) this.emitState(this.getState());
    }, 5000);
  }

  getState() {
    let visibleDealerHand = [];
    let dealerScore = 0;

    if (this.dealerHand.length > 0) {
      if (this.phase === "dealer" || this.phase === "payout") {
        visibleDealerHand = this.dealerHand.filter((c) => c);
        dealerScore = this.calculateScore(visibleDealerHand);
      } else {
        if (this.dealerHand[0]) {
          visibleDealerHand = [this.dealerHand[0], { value: "?", suit: "?" }];
          dealerScore = this.calculateScore([this.dealerHand[0]]);
        }
      }
    }

    return {
      phase: this.phase,
      joueurs: this.joueurs.map((p) => ({
        pseudo: p.pseudo,
        hands: p.hands,
        bet: p.bet,
        status:
          p.hands.length > 0 ? p.hands[p.activeHandIndex]?.status : p.status,
        score: p.hands.length > 0 ? p.hands[p.activeHandIndex]?.score : p.score,
        winnings: p.winnings,
        activeHandIndex: p.activeHandIndex,
      })),
      dealerHand: visibleDealerHand,
      dealerScore: dealerScore,
      currentPlayerIndex: this.currentPlayerIndex,
      gameStarted: this.gameStarted,
      waitingList: this.waitingList.map((p) => p.pseudo),
      turnDeadline: this.turnDeadline, // Send deadline
    };
  }
}

module.exports = BlackjackGame;
