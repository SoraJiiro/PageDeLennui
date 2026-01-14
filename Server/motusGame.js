const words = require("./words");

class MotusGame {
  constructor() {
    this.words = words || [];
    console.log(`[MotusGame] Initialisé avec ${this.words.length} mots.`);
  }

  getRandomWord(excludeList = []) {
    // Filtrer les mots qui sont dans la liste d'exclusion
    const availableWords = this.words.filter((w) => !excludeList.includes(w));

    if (availableWords.length === 0) {
      return null; // Plus de mots disponibles
    }

    const index = Math.floor(Math.random() * availableWords.length);
    return availableWords[index];
  }

  checkGuess(target, guess) {
    target = target.toUpperCase();
    const result = [];
    const targetArr = target.split("");
    const guessArr = guess.toUpperCase().split("");

    if (guessArr.length !== targetArr.length) {
      return { error: "Longueur incorrecte" };
    }

    // Première passe : trouver les lettres correctes (Vert / 2)
    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] === targetArr[i]) {
        result[i] = 2;
        targetArr[i] = null; // Marquer comme utilisé
        guessArr[i] = null;
      } else {
        result[i] = 0; // Par défaut manquant
      }
    }

    // Deuxième passe : trouver les lettres présentes (Jaune / 1)
    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] !== null) {
        const foundIndex = targetArr.indexOf(guessArr[i]);
        if (foundIndex !== -1) {
          result[i] = 1;
          targetArr[foundIndex] = null; // Marquer comme utilisé
        }
      }
    }

    return { result, targetLength: target.length };
  }
  getWordListLength() {
    console.log(`Nb de mots au total: ${this.words.length}`);
    return this.words.length;
  }
}

module.exports = MotusGame;
