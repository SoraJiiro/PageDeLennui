class PictionaryGame {
  constructor() {
    this.joueurs = [];
    this.spectators = [];
    this.gameStarted = false;
    this.currentDrawerIndex = 0;
    this.currentWord = null;
    this.words = [
      "chat",
      "chien",
      "mr francois",
      "ordinateur",
      "discord",
      "snapchat",
      "instagram",
    ];
    this.strokes = [];
    this.timeLeft = 0;
    this.roundDuration = 60;
    this.guessedThisRound = new Set();
  }

  addPlayer(pseudo, socketId) {
    if (this.joueurs.find((p) => p.pseudo === pseudo))
      return { success: false, reason: "alreadyIn" };
    this.joueurs.push({ pseudo, socketId, score: 0 });
    return { success: true };
  }

  removePlayer(pseudo) {
    const idx = this.joueurs.findIndex((p) => p.pseudo === pseudo);
    if (idx !== -1) {
      this.joueurs.splice(idx, 1);
      return true;
    }
    return false;
  }

  addSpectator(pseudo, socketId) {
    if (!this.spectators.find((s) => s.pseudo === pseudo)) {
      this.spectators.push({ pseudo, socketId });
    }
  }

  removeSpectator(pseudo) {
    const idx = this.spectators.findIndex((s) => s.pseudo === pseudo);
    if (idx !== -1) this.spectators.splice(idx, 1);
  }

  canStart() {
    return this.joueurs.length >= 1;
  }

  startGame() {
    if (this.gameStarted) return;
    this.gameStarted = true;
    this.currentDrawerIndex = 0;
    this.newWord();
  }

  newWord() {
    const i = Math.floor(Math.random() * this.words.length);
    this.currentWord = this.words[i];
    this.guessedThisRound.clear();
    this.timeLeft = this.roundDuration;
    this.strokes = [];
    this._revealedMask = "_ ".repeat(this.currentWord.length);
  }

  getCurrentDrawer() {
    return this.joueurs[this.currentDrawerIndex] || null;
  }

  nextRound() {
    this.currentDrawerIndex++;
    if (this.currentDrawerIndex >= this.joueurs.length) {
      return { finished: true };
    }
    this.newWord();
    return { finished: false };
  }

  handleCorrectGuess(pseudo) {
    const joueur = this.joueurs.find((p) => p.pseudo === pseudo);
    if (!joueur) return false;
    if (this.guessedThisRound.has(pseudo)) return false;
    joueur.score += 10;
    this.getCurrentDrawer().score += 5;
    this.guessedThisRound.add(pseudo);
    return true;
  }

  revealNextLetter() {
    const progress = this.getWordProgress().split("");
    const hiddenIndexes = [];
    for (let i = 0; i < progress.length; i++) {
      if (progress[i] === "_") hiddenIndexes.push(i);
    }
    if (hiddenIndexes.length > 0) {
      const idx =
        hiddenIndexes[Math.floor(Math.random() * hiddenIndexes.length)];
      progress[idx] = this.currentWord[idx].toUpperCase();
      this._revealedMask = progress.join("");
    }
  }

  revealAll() {
    this._revealedMask = this.currentWord.toUpperCase();
  }

  getWordProgress() {
    if (!this.currentWord) return "";
    if (!this._revealedMask) {
      this._revealedMask = "_".repeat(this.currentWord.length);
    }
    return this._revealedMask;
  }

  addStroke(data) {
    this.strokes.push(data);
  }

  getStrokes() {
    return this.strokes;
  }

  updateSocketId(pseudo, newSocketId) {
    const joueur = this.joueurs.find((p) => p.pseudo === pseudo);
    if (joueur) joueur.socketId = newSocketId;
    const spec = this.spectators.find((s) => s.pseudo === pseudo);
    if (spec) spec.socketId = newSocketId;
  }

  getState(pseudo) {
    const joueur = this.joueurs.find((p) => p.pseudo === pseudo);
    const estDessinateur =
      joueur && this.getCurrentDrawer()?.pseudo === joueur.pseudo;
    const estSpec = this.spectators.some((s) => s.pseudo === pseudo);

    const motVisible = estDessinateur
      ? this.currentWord || "(mot non défini)"
      : this.getWordProgress() || "???";

    return {
      gameStarted: this.gameStarted,
      joueurs: this.joueurs.map((j) => ({
        pseudo: j.pseudo,
        score: j.score || 0,
      })),
      spectators: this.spectators.map((s) => s.pseudo),
      currentDrawer: this.getCurrentDrawer()?.pseudo || null,
      currentWord: estDessinateur
        ? this.currentWord || "(mot non défini)"
        : null,
      wordProgress: this.getWordProgress() || "???",
      motVisible,
      timeLeft: this.timeLeft || 0,
      message: this.message || "",
      estDessinateur,
      estSpec,
    };
  }

  getLobbyState() {
    return {
      gameStarted: this.gameStarted,
      joueurs: this.joueurs.map((j) => j.pseudo),
      spectators: this.spectators.map((s) => s.pseudo),
      canStart: this.canStart(),
    };
  }
}

module.exports = PictionaryGame;
