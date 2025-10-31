(async () => {
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

  window.socket = socket; // LE SEUL QUI DOIT EXISTER :'((
  window.username = username;

  socket.on("reload", () => {
    window.location.reload();
  });

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
    if (puissance4?.initPuissance4) puissance4.initPuissance4(socket);
    if (p4Leaderboard?.initP4Leaderboard)
      p4Leaderboard.initP4Leaderboard(socket);
  } catch (err) {
    console.error("Erreur modules : ", err);
  }
})();
