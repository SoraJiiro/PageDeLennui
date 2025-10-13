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
    ]);

    const [chat, clicker, clickerLeaderboard, dino, dinoLeaderboard, uno] =
      modules;

    if (chat?.initChat) chat.initChat(socket);
    if (clicker?.initClicker) clicker.initClicker(socket);
    if (clickerLeaderboard?.initClickerLeaderboard)
      clickerLeaderboard.initClickerLeaderboard(socket);
    if (dino?.initDino) dino.initDino(socket);
    if (dinoLeaderboard?.initDinoLeaderboard)
      dinoLeaderboard.initDinoLeaderboard(socket);
    if (uno?.initUno) uno.initUno(socket);
  } catch (err) {
    console.error("Erreur modules : ", err);
  }
})();
