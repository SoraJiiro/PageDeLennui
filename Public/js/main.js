(async () => {
  // ---------- Conexion Socket ----------
  if (window.socketInitialized) return;
  window.socketInitialized = true;

  const sessionRes = await fetch("/api/session");
  if (!sessionRes.ok) {
    window.location.href = "/login";
    return;
  }

  const { username } = await sessionRes.json();

  // 1) Charger les modules AVANT d'ouvrir la connexion, pour brancher les listeners
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
      import("./blockblast.js"),
      import("./blockblast_leaderboard.js"),
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
      blockblast,
      blockblastLeaderboard,
    ] = modules;

    // 2) Créer le socket en mode autoConnect:false
    const socket = io({
      query: { username },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      // conserver les anciens alias pour compat
      reconnexion: true,
      reconnexionDelay: 1000,
      reconnexionEssais: 5,
    });

    window.socket = socket;
    window.username = username;

    // Brancher un reload tôt
    socket.on("reload", () => window.location.reload());

    // 3) Initialiser les modules (les listeners sont prêts AVANT connect)
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
    if (blockblast?.initBlockBlast) blockblast.initBlockBlast(socket);
    if (blockblastLeaderboard?.initBlockBlastLeaderboard)
      blockblastLeaderboard.initBlockBlastLeaderboard(socket);

    // 4) Ouvrir la connexion seulement maintenant (évite de rater les 1ers emits)
    socket.connect();

    // 5) Ceinture et bretelles: redemander certains états après connexion
    socket.on("connect", () => {
      // Ces emits sont bufferisés si envoyés avant connect, mais on assure ici
      socket.emit("uno:getState");
      socket.emit("pictionary:getState");
      socket.emit("p4:getState");
      // Les leaderboards et le chat sont envoyés automatiquement côté serveur
    });
  } catch (err) {
    console.error("Erreur chargement modules : ", err);
  }
})();
