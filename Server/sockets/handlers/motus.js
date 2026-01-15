function registerMotusHandlers({
  io,
  socket,
  pseudo,
  FileService,
  motusGame,
  leaderboardManager,
}) {
  function getMotusState(pseudo) {
    if (!FileService.data.motusState) FileService.data.motusState = {};
    if (!FileService.data.motusState[pseudo]) {
      FileService.data.motusState[pseudo] = {
        currentWord: null,
        history: [],
        foundWords: [],
      };
    }

    // Migration (anciens formats)
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

  socket.on("motus:getFoundWords", () => {
    const state = getMotusState(pseudo);
    socket.emit("motus:foundWords", { foundWords: state.foundWords.length });
  });

  socket.on("motus:requestWordListLength", () => {
    const length = motusGame.getWordListLength();
    console.log(`[Motus] Sending word list length: ${length}`);
    socket.emit("motus:wordListLength", { length });
  });

  socket.on("motus:guess", ({ guess }) => {
    if (!guess || typeof guess !== "string") return;

    const state = getMotusState(pseudo);
    if (!state.currentWord) {
      assignNewWord(pseudo);
      if (!state.currentWord) return;
    }

    // Check if already won
    const last = state.history[state.history.length - 1];
    if (last && last.result.every((s) => s === 2)) return;

    const { result, error } = motusGame.checkGuess(state.currentWord, guess);

    if (error) {
      socket.emit("motus:error", { message: error });
      return;
    }

    state.history.push({ guess: guess.toUpperCase(), result });

    // Update tries immediately (increment by 1 for every guess)
    if (!FileService.data.motusScores) FileService.data.motusScores = {};
    if (!FileService.data.motusScores[pseudo]) {
      FileService.data.motusScores[pseudo] = { words: 0, tries: 0 };
    }
    FileService.data.motusScores[pseudo].tries++;

    // Check win
    let won = false;
    if (result.every((s) => s === 2)) {
      won = true;
      state.foundWords.push(state.currentWord);
      FileService.data.motusScores[pseudo].words++;
    }

    FileService.save("motusScores", FileService.data.motusScores);
    leaderboardManager.broadcastMotusLB(io);

    FileService.save("motusState", FileService.data.motusState);

    socket.emit("motus:result", {
      result,
      guess: guess.toUpperCase(),
      won: won,
    });
  });

  socket.on("motus:skip", () => {
    assignNewWord(pseudo);
    const state = getMotusState(pseudo);
    const word = state.currentWord;

    if (!word) {
      socket.emit("motus:end", {
        message: "Toutes les communes ont été trouvées !",
      });
      return;
    }

    const hyphens = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === "-") hyphens.push(i);
    }

    socket.emit("motus:init", {
      length: word.length,
      hyphens: hyphens,
      history: [],
      won: false,
    });
  });

  socket.on("motus:continue", () => {
    assignNewWord(pseudo);
    const state = getMotusState(pseudo);
    const word = state.currentWord;

    if (!word) {
      socket.emit("motus:end", {
        message: "Toutes les communes ont été trouvées !",
      });
      return;
    }

    const hyphens = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === "-") hyphens.push(i);
    }

    socket.emit("motus:init", {
      length: word.length,
      hyphens: hyphens,
      history: [],
      won: false,
    });
  });

  // Send initial state on connect
  const state = getMotusState(pseudo);
  if (!state.currentWord) {
    assignNewWord(pseudo);
  }

  if (state.currentWord) {
    const word = state.currentWord;
    const hyphens = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] === "-") hyphens.push(i);
    }

    const last = state.history[state.history.length - 1];
    const won = last && last.result.every((s) => s === 2);

    socket.emit("motus:init", {
      length: word.length,
      hyphens: hyphens,
      history: state.history,
      won: won,
    });
  } else {
    socket.emit("motus:end", {
      message: "Toutes les communes ont été trouvées !",
    });
  }

  // Send LB on connect
  const lb = Object.entries(FileService.data.motusScores || {})
    .map(([u, s]) => ({
      pseudo: u,
      words: s.words || 0,
      tries: s.tries || 0,
    }))
    .sort(
      (a, b) =>
        b.words - a.words ||
        a.tries - b.tries ||
        a.pseudo.localeCompare(b.pseudo)
    );
  socket.emit("motus:leaderboard", lb);
}

module.exports = { registerMotusHandlers };
