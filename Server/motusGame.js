const words = require("./words");

class MotusGame {
  constructor() {
    this.words = words;
  }

  getRandomWord(excludeList = []) {
    // Filter out words that are in the excludeList
    const availableWords = this.words.filter((w) => !excludeList.includes(w));

    if (availableWords.length === 0) {
      return null; // No more words available
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

    // First pass: find correct letters (Green / 2)
    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] === targetArr[i]) {
        result[i] = 2;
        targetArr[i] = null; // Mark as used
        guessArr[i] = null;
      } else {
        result[i] = 0; // Default to missing
      }
    }

    // Second pass: find present letters (Yellow / 1)
    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] !== null) {
        const foundIndex = targetArr.indexOf(guessArr[i]);
        if (foundIndex !== -1) {
          result[i] = 1;
          targetArr[foundIndex] = null; // Mark as used
        }
      }
    }

    return { result, targetLength: target.length };
  }
}

module.exports = MotusGame;
