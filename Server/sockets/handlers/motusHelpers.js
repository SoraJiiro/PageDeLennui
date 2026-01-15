function createMotusHelpers({ FileService, motusGame }) {
  function getMotusState(pseudo) {
    if (!FileService.data.motusState) FileService.data.motusState = {};
    if (!FileService.data.motusState[pseudo]) {
      FileService.data.motusState[pseudo] = {
        currentWord: null,
        history: [],
        foundWords: [],
      };
    }

    // Migration
    if (!FileService.data.motusState[pseudo].foundWords) {
      FileService.data.motusState[pseudo].foundWords = [];
      FileService.data.motusState[pseudo].currentWord = null;
      FileService.data.motusState[pseudo].history = [];
    }

    return FileService.data.motusState[pseudo];
  }

  function assignNewWord(pseudo) {
    const state = getMotusState(pseudo);
    const newWord = motusGame.getRandomWord(state.foundWords);
    if (newWord) {
      state.currentWord = newWord;
      state.history = [];
      FileService.save("motusState", FileService.data.motusState);
    }
    return newWord;
  }

  return { getMotusState, assignNewWord };
}

module.exports = { createMotusHelpers };
