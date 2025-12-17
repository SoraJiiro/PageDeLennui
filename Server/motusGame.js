const words = require("./words");

class MotusGame {
  constructor() {
    this.words = words;
    this.currentWord = this.getDailyWord();
  }

  getDailyWord() {
    const now = new Date();
    // Seed based on date (YYYY-MM-DD)
    const seed =
      now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    // Simple LCG to avoid alphabetical sequence
    const a = 1664525;
    const c = 1013904223;
    const m = 4294967296;

    let random = seed;
    // Run a few iterations to mix it up
    for (let i = 0; i < 5; i++) {
      random = (a * random + c) % m;
    }

    const index = Math.floor((random / m) * this.words.length);
    return this.words[index];
  }

  reroll() {
    const index = Math.floor(Math.random() * this.words.length);
    this.currentWord = this.words[index];
    return this.currentWord;
  }

  checkGuess(guess) {
    const target = this.currentWord.toUpperCase();
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
