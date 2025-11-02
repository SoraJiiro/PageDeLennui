(async () => {
  // ---------- Conexion Socket ----------
  if (window.socketInitialized) {
    return;
  }

  window.socketInitialized = true;

  const sessionRes = await fetch("/api/session");
  if (!sessionRes.ok) {
    window.location.href = "/login";
    return;
  }

  const { username } = await sessionRes.json();

  const socket = io({
    query: { username },
    reconnexion: true,
    reconnexionDelay: 1000,
    reconnexionEssais: 5,
  });

  window.socket = socket;
  window.username = username;

  socket.on("reload", () => {
    window.location.reload();
  });

  // ---------- Init modules ----------
  try {
    const modules = await Promise.all([
      import("./chat.js"),
      import("./clicker.js"),
      import("./clicker_leaderboard.js"),
      import("./dino.js"),
      import("./dino_leaderboard.js"),
      import("./uno.js"),
      import("./flappy.js"),
      import("./flappy_leaderboard.js"),
      import("./uno_leaderboard.js"),
      import("./pictionary.js"),
      import("./pictionary_leaderboard.js"),
      import("./puissance4.js"),
      import("./p4_leaderboard.js"),
    ]);

    const [
      chat,
      clicker,
      clickerLeaderboard,
      dino,
      dinoLeaderboard,
      uno,
      flappy,
      flappyLeaderboard,
      unoLeaderboard,
      pictionary,
      pictionaryLeaderboard,
      puissance4,
      p4Leaderboard,
    ] = modules;

    if (chat?.initChat) chat.initChat(socket);
    if (clicker?.initClicker) clicker.initClicker(socket);
    if (clickerLeaderboard?.initClickerLeaderboard)
      clickerLeaderboard.initClickerLeaderboard(socket);
    if (dino?.initDino) dino.initDino(socket);
    if (dinoLeaderboard?.initDinoLeaderboard)
      dinoLeaderboard.initDinoLeaderboard(socket);
    if (uno?.initUno) uno.initUno(socket);
    if (flappy?.initFlappy) flappy.initFlappy(socket);
    if (flappyLeaderboard?.initFlappyLeaderboard)
      flappyLeaderboard.initFlappyLeaderboard(socket);
    if (unoLeaderboard?.initUnoLeaderboard)
      unoLeaderboard.initUnoLeaderboard(socket);
    if (pictionary?.initPictionary) pictionary.initPictionary(socket);
    if (pictionaryLeaderboard?.initPictionaryLeaderboard)
      pictionaryLeaderboard.initPictionaryLeaderboard(socket);
    if (puissance4?.initPuissance4) puissance4.initPuissance4(socket);
    if (p4Leaderboard?.initP4Leaderboard)
      p4Leaderboard.initP4Leaderboard(socket);
  } catch (err) {
    console.error("Erreur chargement modules : ", err);
  }

  function getAndDeleteLSKeys() {
    var initialLength = window.localStorage.length;
    for (let p = 0; p < window.localStorage.length; p++) {
      // Supp le contenu du localStorage (pas de triche par injection)
      const key = window.localStorage.key(p);
      if (key) {
        window.localStorage.removeItem(key);
        console.info(
          `${key} Supprimé ! [index-${p}:\\${socket.id}\\${initialLength}]`
        );
      } else {
        if (key === "undefined" || key === null) {
          console.info("Aucun objet.");
        }
      }
    }
  }

  // Anti injection
  setTimeout(() => {
    getAndDeleteLSKeys();
  }, 200);
  window.addEventListener("beforeunload", getAndDeleteLSKeys);
  window.addEventListener("storage", getAndDeleteLSKeys);

  window.localStorage.setItem = (key, val) => {
    return "Nope.";
  };
})();
