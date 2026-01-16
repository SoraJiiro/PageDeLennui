const words = require("../constants/words");

class MotusGame {
  constructor() {
    this.words = words || [];
    console.log(`[MotusGame] Initialisé avec ${this.words.length} mots.`);
  }

  getRandomWord(excludeList = []) {
    const availableWords = this.words.filter((w) => !excludeList.includes(w));

    if (availableWords.length === 0) {
      return null;
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

    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] === targetArr[i]) {
        result[i] = 2;
        targetArr[i] = null;
        guessArr[i] = null;
      } else {
        result[i] = 0;
      }
    }

    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] !== null) {
        const foundIndex = targetArr.indexOf(guessArr[i]);
        if (foundIndex !== -1) {
          result[i] = 1;
          targetArr[foundIndex] = null;
        }
      }
    }

    return { result, targetLength: target.length };
  }

  getWordListLength() {
    //console.log(`Nb de mots au total: ${this.words.length}`);
    return this.words.length;
  }
}

module.exports = MotusGame;
