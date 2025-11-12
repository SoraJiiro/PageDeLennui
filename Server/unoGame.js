class UnoGame {
  constructor() {
    this.joueurs = [];
    this.spectators = [];
    this.deck = [];
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.direction = 1;
    this.gameStarted = false;
    this.drawStack = 0;
    this.turnTimer = null;
    this.turnTimeoutMs = 10000;
    this.turnDeadlineAt = null;
  }

  addPlayer(pseudo, socketId) {
    if (this.gameStarted) return { success: false, reason: "gameStarted" };
    if (this.joueurs.length >= 4) return { success: false, reason: "full" };

    const existingPlayer = this.joueurs.find((p) => p.pseudo === pseudo);
    if (existingPlayer) {
      return { success: false, reason: "alreadyIn" };
    }

    this.joueurs.push({ pseudo, socketId, hand: [] });
    return { success: true };
  }

  removePlayer(pseudo) {
    const index = this.joueurs.findIndex((p) => p.pseudo === pseudo);
    if (index !== -1) {
      this.joueurs.splice(index, 1);

      if (this.gameStarted && this.currentPlayerIndex >= this.joueurs.length) {
        this.currentPlayerIndex = this.joueurs.length > 0 ? 0 : 0;
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
    if (joueur) {
      joueur.socketId = newSocketId;
    }
    const spectator = this.spectators.find((s) => s.pseudo === pseudo);
    if (spectator) {
      spectator.socketId = newSocketId;
    }
  }

  canStart() {
    return (
      this.joueurs.length >= 2 && this.joueurs.length <= 4 && !this.gameStarted
    );
  }

  estVide() {
    return this.joueurs.length === 0 && this.spectators.length === 0;
  }

  createDeck() {
    const colors = ["red", "blue", "green", "pink"];
    const valeurs = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "Passe",
      "Inverse",
      "+2",
    ];

    this.deck = [];

    colors.forEach((color) => {
      valeurs.forEach((valeur) => {
        this.deck.push({ color, valeur });
        if (valeur !== "0") {
          this.deck.push({ color, valeur });
        }
      });
    });

    for (let i = 0; i < 4; i++) {
      this.deck.push({ color: "wild", valeur: "Joker" });
      this.deck.push({ color: "wild", valeur: "+4" });
    }

    this.shuffle();
  }

  shuffle() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  startGame() {
    if (!this.canStart()) return false;

    this.createDeck();
    this.gameStarted = true;
    this.currentPlayerIndex = 0;
    this.direction = 1;
    this.drawStack = 0;

    this.joueurs.forEach((joueur) => {
      joueur.hand = [];
      for (let i = 0; i < 7; i++) {
        joueur.hand.push(this.deck.pop());
      }
    });

    let firstCard = this.deck.pop();
    while (firstCard.color === "wild") {
      this.deck.unshift(firstCard);
      this.shuffle();
      firstCard = this.deck.pop();
    }
    this.discardPile.push(firstCard);

    return true;
  }

  getCurrentPlayer() {
    if (this.joueurs.length === 0) return null;
    return this.joueurs[this.currentPlayerIndex];
  }

  nextPlayer() {
    if (this.joueurs.length === 0) return;
    this.currentPlayerIndex =
      (this.currentPlayerIndex + this.direction + this.joueurs.length) %
      this.joueurs.length;
  }

  peutJouerCard(card, topCard) {
    if (card.color === "wild") return true;
    if (card.color === topCard.color) return true;
    if (card.valeur === topCard.valeur) return true;

    if (this.drawStack > 0) {
      if (topCard.valeur === "+2" && card.valeur === "+2") return true;
      if (topCard.valeur === "+2" && card.valeur === "+4") return true;
      if (topCard.valeur === "+4" && card.valeur === "+4") return true;
    }

    return false;
  }

  jouerCarte(joueur, cardIndex, chosenColor = null) {
    if (!joueur || joueur !== this.getCurrentPlayer()) {
      return { success: false, message: "Ce n'est pas ton tour !" };
    }

    const card = joueur.hand[cardIndex];
    if (!card) {
      return { success: false, message: "Carte invalide" };
    }

    const topCard = this.discardPile[this.discardPile.length - 1];

    if (!this.peutJouerCard(card, topCard)) {
      return { success: false, message: "Tu ne peux pas jouer cette carte" };
    }

    joueur.hand.splice(cardIndex, 1);

    if (card.color === "wild" && chosenColor) {
      card.color = chosenColor;
    }

    this.discardPile.push(card);

    let message = "";
    let skipNext = false;

    if (card.valeur === "Passe") {
      skipNext = true;
      message = `${joueur.pseudo} a passé le prochain joueur`;
    } else if (card.valeur === "Inverse") {
      this.direction *= -1;
      if (this.joueurs.length === 2) {
        // 1v1 rejoue
        message = `${joueur.pseudo} a inversé le sens et rejoue`;
      } else {
        message = `${joueur.pseudo} a inversé le sens`;
      }
    } else if (card.valeur === "+2") {
      if (this.drawStack > 0 && topCard.valeur === "+2") {
        this.drawStack += 2;
        message = `${joueur.pseudo} empile un +2 ! Total : +${this.drawStack}`;
      } else {
        this.drawStack = 2;
        message = `${joueur.pseudo} a joué un +2`;
      }
    } else if (card.valeur === "+4") {
      if (this.drawStack > 0) {
        this.drawStack += 4;
        message = `${joueur.pseudo} empile un +4 ! Total : +${this.drawStack}`;
      } else {
        this.drawStack = 4;
        message = `${joueur.pseudo} a joué un +4`;
      }
    }

    if (joueur.hand.length === 0) {
      return { success: true, winner: joueur.pseudo };
    }

    if (!(card.valeur === "Inverse" && this.joueurs.length === 2)) {
      this.nextPlayer();
    }

    if (this.drawStack > 0 && this.joueurs.length > 0) {
      const nextPlayer = this.getCurrentPlayer();
      if (!nextPlayer) return { success: true, message };

      const canCounter = nextPlayer.hand.some((c) => {
        if (topCard.valeur === "+2" && (c.valeur === "+2" || c.valeur === "+4"))
          return true;
        if (topCard.valeur === "+4" && c.valeur === "+4") return true;
        return false;
      });

      if (!canCounter) {
        for (let i = 0; i < this.drawStack; i++) {
          if (this.deck.length === 0) this.reshuffleDeck();
          if (this.deck.length > 0) {
            nextPlayer.hand.push(this.deck.pop());
          }
        }
        message += ` - ${nextPlayer.pseudo} pioche ${this.drawStack} carte(s)`;
        this.drawStack = 0;
        this.nextPlayer();
      }
    }

    if (skipNext) {
      this.nextPlayer();
    }

    return { success: true, message };
  }

  drawCard(joueur) {
    if (!joueur || joueur !== this.getCurrentPlayer()) {
      return { success: false, message: "Ce n'est pas ton tour !" };
    }

    if (this.deck.length === 0) {
      this.reshuffleDeck();
    }

    if (this.deck.length === 0) {
      return { success: false, message: "Plus de cartes disponibles" };
    }

    const card = this.deck.pop();
    joueur.hand.push(card);

    this.nextPlayer();

    return { success: true, message: `${joueur.pseudo} a pioché une carte` };
  }

  reshuffleDeck() {
    if (this.discardPile.length <= 1) return;

    const topCard = this.discardPile.pop();
    this.deck = [...this.discardPile];
    this.discardPile = [topCard];
    this.shuffle();
  }

  getPlayableCards(joueur) {
    if (!joueur) return [];
    const topCard = this.discardPile[this.discardPile.length - 1];
    const playable = [];

    joueur.hand.forEach((card, index) => {
      if (this.peutJouerCard(card, topCard)) {
        playable.push(index);
      }
    });

    return playable;
  }

  getState(forUsername) {
    const joueur = this.joueurs.find((p) => p.pseudo === forUsername);
    const estSpec = !joueur;
    const currentPlayer = this.getCurrentPlayer();

    return {
      estSpec,
      estMonTour: joueur && currentPlayer && joueur === currentPlayer,
      currentPlayer: currentPlayer ? currentPlayer.pseudo : "Inconnu",
      monDeck: joueur ? joueur.hand : [],
      topCard: this.discardPile[this.discardPile.length - 1],
      direction: this.direction,
      deckSize: this.deck.length,
      playableCards: joueur ? this.getPlayableCards(joueur) : [],
      turnDeadlineAt: this.turnDeadlineAt,
      opponents: this.joueurs
        .filter((p) => p.pseudo !== forUsername)
        .map((p) => ({ pseudo: p.pseudo, cardCount: p.hand.length })),
    };
  }

  getLobbyState() {
    return {
      joueurs: this.joueurs.map((p) => p.pseudo),
      spectators: this.spectators.map((s) => s.pseudo),
      gameStarted: this.gameStarted,
      canStart: this.canStart(),
    };
  }

  // Action automatique à l'expiration du tour: pioche puis passe
  autoDrawAndPass() {
    const joueur = this.getCurrentPlayer();
    if (!joueur) return { success: false, message: "Aucun joueur courant" };

    // Si une pénalité de pioche est en attente (+2/+4), on pioche tout le stack
    if (this.drawStack > 0) {
      let count = this.drawStack;
      for (let i = 0; i < count; i++) {
        if (this.deck.length === 0) this.reshuffleDeck();
        if (this.deck.length > 0) joueur.hand.push(this.deck.pop());
      }
      this.drawStack = 0;
      this.nextPlayer();
      return {
        success: true,
        message: `${joueur.pseudo} n'a pas joué à temps: pioche ${count} carte(s) automatiquement`,
      };
    }

    // Sinon, pioche 1 carte et passe
    if (this.deck.length === 0) this.reshuffleDeck();
    if (this.deck.length === 0) {
      // Pas de cartes, on passe quand même
      this.nextPlayer();
      return {
        success: true,
        message: `${joueur.pseudo} n'a pas joué à temps: passe (pioche impossible)`,
      };
    }
    const card = this.deck.pop();
    joueur.hand.push(card);
    this.nextPlayer();
    return {
      success: true,
      message: `${joueur.pseudo} n'a pas joué à temps: pioche 1 carte automatiquement`,
    };
  }
}

module.exports = UnoGame;
