class BlackjackGame {
  constructor() {
    this.joueurs = []; // Structure joueur
    this.spectators = [];
    this.deck = [];
    this.dealerHand = [];
    this.gameStarted = false;
    this.phase = "lobby"; // lobby, betting, playing, dealer, payout
    this.currentPlayerIndex = 0;
    this.turnTimer = null;
    this.turnTimeoutMs = 15000; // 15s par tour
    this.betTimer = null;
    this.betTimeoutMs = 10000; // 10s pour miser
    this.emitState = null;
  }

  setEmitter(fn) {
    this.emitState = fn;
  }

  addPlayer(pseudo, socketId) {
    if (this.gameStarted) return { success: false, reason: "gameStarted" };
    if (this.joueurs.length >= 4) return { success: false, reason: "full" };

    const existingPlayer = this.joueurs.find((p) => p.pseudo === pseudo);
    if (existingPlayer) {
      return { success: false, reason: "alreadyIn" };
    }

    this.joueurs.push({
      pseudo,
      socketId,
      hand: [],
      bet: 0,
      status: "waiting",
      score: 0,
    });
    return { success: true };
  }

  removePlayer(pseudo) {
    const index = this.joueurs.findIndex((p) => p.pseudo === pseudo);
    if (index !== -1) {
      // Si le joueur actuel quitte pendant son tour
      if (this.phase === "playing" && index === this.currentPlayerIndex) {
        this.nextTurn();
      } else if (this.phase === "playing" && index < this.currentPlayerIndex) {
        this.currentPlayerIndex--;
      }

      this.joueurs.splice(index, 1);

      // Si plus de joueurs, reset
      if (this.joueurs.length === 0) {
        this.resetGame();
      }

      return true;
    }
    return false;
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
    const spectator = this.spectators.find((s) => s.pseudo === pseudo);
    if (spectator) spectator.socketId = newSocketId;
  }

  canStart() {
    return this.joueurs.length >= 1 && !this.gameStarted;
  }

  resetGame() {
    this.gameStarted = false;
    this.phase = "lobby";
    this.deck = [];
    this.dealerHand = [];
    this.currentPlayerIndex = 0;
    this.joueurs.forEach((p) => {
      p.hand = [];
      p.bet = 0;
      p.status = "waiting";
      p.score = 0;
    });
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.betTimer) clearTimeout(this.betTimer);
  }

  createDeck() {
    const suits = ["H", "D", "C", "S"]; // Coeurs, Carreaux, Trèfles, Piques
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

    // Utiliser 1 paquet pour éviter les doublons
    for (let i = 0; i < 1; i++) {
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
      p.hand = [];
      p.bet = 0;
      p.status = "betting";
      p.score = 0;
    });
    this.dealerHand = [];

    return true;
  }

  placeBet(pseudo, amount) {
    const player = this.joueurs.find((p) => p.pseudo === pseudo);
    if (!player || this.phase !== "betting") return false;

    player.bet = amount;
    player.status = "ready";

    // Vérifier si tous les joueurs ont misé
    if (this.joueurs.every((p) => p.bet > 0)) {
      this.dealInitialCards();
    }
    return true;
  }

  dealInitialCards() {
    this.phase = "playing";
    this.currentPlayerIndex = 0;

    // Distribuer 2 cartes à chaque joueur
    this.joueurs.forEach((p) => {
      p.hand.push(this.deck.pop());
      p.hand.push(this.deck.pop());
      p.score = this.calculateScore(p.hand);
      if (p.score === 21) {
        p.status = "blackjack";
      } else {
        p.status = "playing";
      }
    });

    // Distribuer 2 cartes au croupier (une cachée)
    this.dealerHand.push(this.deck.pop());
    this.dealerHand.push(this.deck.pop());

    // Vérifier si le premier joueur a blackjack
    this.checkTurn();
  }

  checkTurn() {
    if (this.currentPlayerIndex >= this.joueurs.length) {
      this.startDealerTurn();
      return;
    }

    const player = this.joueurs[this.currentPlayerIndex];
    if (player.status === "blackjack") {
      this.nextTurn();
    }
  }

  nextTurn() {
    this.currentPlayerIndex++;
    this.checkTurn();
  }

  hit(pseudo) {
    const player = this.joueurs[this.currentPlayerIndex];
    if (!player || player.pseudo !== pseudo || this.phase !== "playing")
      return false;

    player.hand.push(this.deck.pop());
    player.score = this.calculateScore(player.hand);

    if (player.score > 21) {
      player.status = "bust";
      this.nextTurn();
    } else if (player.score === 21) {
      // Stand auto à 21
      player.status = "stand";
      this.nextTurn();
    }

    return true;
  }

  stand(pseudo) {
    const player = this.joueurs[this.currentPlayerIndex];
    if (!player || player.pseudo !== pseudo || this.phase !== "playing")
      return false;

    player.status = "stand";
    this.nextTurn();
    return true;
  }

  async startDealerTurn() {
    this.phase = "dealer";

    // Révéler carte cachée immédiatement
    if (this.emitState) this.emitState(this.getState());
    await new Promise((r) => setTimeout(r, 800));

    let dealerScore = this.calculateScore(this.dealerHand);

    // Croupier tire jusqu'à 17
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
      if (p.status === "bust") {
        p.winnings = -p.bet;
      } else if (p.status === "blackjack") {
        if (dealerBlackjack) {
          p.winnings = 0; // Egalité
        } else {
          p.winnings = Math.floor(p.bet * 1.5); // Blackjack paie 3:2
        }
      } else {
        // Joueur a resté
        if (p.score === 21 && dealerScore === 21) {
          p.winnings = 0; // Egalité si les deux ont 21
        } else if (dealerBlackjack) {
          p.winnings = -p.bet;
        } else if (dealerBust) {
          p.winnings = p.bet;
        } else if (p.score > dealerScore) {
          p.winnings = p.bet;
        } else if (p.score < dealerScore) {
          p.winnings = -p.bet;
        } else {
          p.winnings = 0; // Egalité
        }
      }
    });

    // Auto-kick tout le monde après 3 secondes
    setTimeout(() => {
      this.joueurs = [];
      this.resetGame();
      if (this.emitState) this.emitState(this.getState());
    }, 3000);
  }

  getState() {
    let visibleDealerHand = [];
    let dealerScore = 0;

    if (this.dealerHand.length > 0) {
      if (this.phase === "dealer" || this.phase === "payout") {
        visibleDealerHand = this.dealerHand;
        dealerScore = this.calculateScore(this.dealerHand);
      } else {
        visibleDealerHand = [this.dealerHand[0], { value: "?", suit: "?" }];
        dealerScore = this.calculateScore([this.dealerHand[0]]);
      }
    }

    return {
      phase: this.phase,
      joueurs: this.joueurs.map((p) => ({
        pseudo: p.pseudo,
        hand: p.hand,
        score: p.score,
        bet: p.bet,
        status: p.status,
        winnings: p.winnings,
      })),
      dealerHand: visibleDealerHand,
      dealerScore: dealerScore,
      currentPlayerIndex: this.currentPlayerIndex,
      gameStarted: this.gameStarted,
    };
  }
}

module.exports = BlackjackGame;
