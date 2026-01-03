import { keyBind } from "./util.js";
import { initCanvasResizer } from "./canvas_resize.js";

(async () => {
  // ---------- Conexion Socket ----------
  if (window.socketInitialized) return;
  window.socketInitialized = true;

  const sessionRes = await fetch("/api/session");
  if (!sessionRes.ok) {
    window.location.href = "/login";
    return;
  }

  const sessionData = await sessionRes.json();
  const username = sessionData.pseudo || sessionData.username;
  const rulesAccepted = sessionData.rulesAccepted;

  try {
    keyBind(username);
    try {
      // initialiser le redimensionneur de canvas tôt pour que les jeux obtiennent les tailles de buffer correctes
      initCanvasResizer();
    } catch (e) {
      console.warn("canvas resizer init failed", e);
    }
  } catch (e) {
    console.warn("keyBind init error", e);
  }

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
      import("./snake.js"),
      import("./snake_leaderboard.js"),
      import("./tagColor.js"),
      import("./system.js"),
      import("./motus.js"),
      import("./coinflip.js"),
      import("./blackjack.js"),
      import("./motus_leaderboard.js"),
      import("./2048.js"),
      import("./2048_leaderboard.js"),
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
      snake,
      snakeLeaderboard,
      tagColor,
      system,
      motus,
      coinflip,
      blackjack,
      motusLeaderboard,
      game2048,
      game2048Leaderboard,
    ] = modules;

    const socket = io({
      query: { username },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      reconnexion: true,
      reconnexionDelay: 1000,
      reconnexionEssais: 5,
    });

    window.username = username;

    if (window.initUiColor) {
      window.initUiColor(socket);
    }

    socket.on("reload", (data) => {
      const file = data?.file || "";
      // Recharger seulement les CSS/JS sans reset de socket
      if (file.match(/\.css$/i)) {
        // Recharger les CSS
        document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
          const href = link.href.split("?")[0];
          link.href = href + "?v=" + Date.now();
        });
      } else if (file.match(/\.js$/i)) {
        // Pour les JS, reload complet nécessaire
        window.location.reload();
      } else if (file.match(/\.html$/i)) {
        // Pour les HTML, reload complet
        window.location.reload();
      }
    });

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
    if (snake?.initSnake) snake.initSnake(socket);
    if (snakeLeaderboard?.initSnakeLeaderboard)
      snakeLeaderboard.initSnakeLeaderboard(socket);
    if (tagColor?.initTagColor) tagColor.initTagColor(socket);
    if (system?.initSystem) system.initSystem(socket, rulesAccepted);
    if (motus?.initMotus) motus.initMotus(socket);
    if (blackjack?.initBlackjack) blackjack.initBlackjack(socket, username);
    if (coinflip?.initCoinFlip) coinflip.initCoinFlip(socket);
    if (motusLeaderboard?.initMotusLeaderboard)
      motusLeaderboard.initMotusLeaderboard(socket);
    if (game2048?.init2048) game2048.init2048(socket);
    if (game2048Leaderboard?.init2048Leaderboard)
      game2048Leaderboard.init2048Leaderboard(socket);

    socket.connect();

    socket.on("connect", () => {
      socket.emit("uno:getState");
      socket.emit("pictionary:getState");
      socket.emit("p4:getState");
    });
  } catch (err) {
    console.error("Erreur chargement modules : ", err);
  }
})();
