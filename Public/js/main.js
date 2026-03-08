import { keyBind, showNotif } from "./util.js";
import { initCanvasResizer } from "./canvas_resize.js";
import { initSiteMoneyAverageWidget } from "./site_money_average.js";

(async () => {
  // ---------- Conexion Socket ----------
  if (window.socketInitialized) return;
  window.socketInitialized = true;

  const subPageName = document.URL;
  const sidebar = document.getElementById("sidebar");

  const sessionRes = await fetch("/api/session");
  if (!sessionRes.ok) {
    window.location.href = "/login";
    return;
  }

  const sessionData = await sessionRes.json();
  const username = sessionData.pseudo || sessionData.username;
  const rulesAccepted = sessionData.rulesAccepted;

  // LS Clear
  try {
    const lastClearKey = `pde_lastLocalClear_${username}`;
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const last = window.localStorage.getItem(lastClearKey);
    if (last !== today) {
      window.localStorage.clear();
      window.localStorage.setItem(lastClearKey, today);
    }
  } catch (e) {
    console.warn("Daily localStorage clear failed:", e);
  }

  try {
    keyBind(username);
    try {
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
      import("./economie_leaderboard.js"),
      import("./dino.js"),
      import("./dino_leaderboard.js"),
      import("./uno.js"),
      import("./flappy.js"),
      import("./flappy_leaderboard.js"),
      import("./uno_leaderboard.js"),
      import("./puissance4.js"),
      import("./p4_leaderboard.js"),
      import("./blockblast.js"),
      import("./blockblast_leaderboard.js"),
      import("./snake.js"),
      import("./snake_leaderboard.js"),
      import("./system.js"),
      import("./motus.js"),
      import("./coinflip.js"),
      import("./blackjack.js"),
      import("./motus_leaderboard.js"),
      import("./2048.js"),
      import("./2048_leaderboard.js"),
      import("./password_change.js"),
      import("./mash.js"),
      import("./mash_leaderboard.js"),
      import("./blackjack_leaderboard.js"),
      import("./coinflip_leaderboard.js"),
      import("./pixelwar.js"),
      import("./pixelwar_leaderboard.js"),
      import("./roulette.js"),
      import("./slots.js"),
      import("./roulette_leaderboard.js"),
      import("./slots_leaderboard.js"),
      import("./sudoku.js"),
      import("./sudoku_leaderboard.js"),
      import("./subway_leaderboard.js"),
      import("./subway.js"),
    ]);

    const [
      chat,
      clicker,
      economieLeaderboard,
      dino,
      dinoLeaderboard,
      uno,
      flappy,
      flappyLeaderboard,
      unoLeaderboard,
      puissance4,
      p4Leaderboard,
      blockblast,
      blockblastLeaderboard,
      snake,
      snakeLeaderboard,
      system,
      motus,
      coinflip,
      blackjack,
      motusLeaderboard,
      game2048,
      game2048Leaderboard,
      passwordChange,
      mash,
      mashLeaderboard,
      blackjackLeaderboard,
      coinflipLeaderboard,
      pixelwar,
      pixelwarLeaderboard,
      roulette,
      slots,
      rouletteLeaderboard,
      slotsLeaderboard,
      sudoku,
      sudokuLeaderboard,
      subwayLeaderboard,
      subway,
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

    // Exposer le socket pour les scripts non-modules (ex: nav.js)
    window.socket = socket;
    try {
      window.dispatchEvent(
        new CustomEvent("pde:socket-ready", { detail: { socket } }),
      );
    } catch {}

    window.username = username;

    if (window.initUiColor) {
      window.initUiColor(socket);
      if (sidebar) {
        document.getElementsByClassName("sb-username")[0].innerHTML =
          `<i class="fa-solid fa-user"></i> ${username}`;
      }
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

    socket.on("economy:gameMoney", (payload = {}) => {
      if (payload.final !== true) return;
      const gained = Number(payload.gained || 0);
      const total = Number(payload.total || gained || 0);
      if (gained <= 0 && total <= 0) return;
      const game = String(payload.game || "jeu");
      showNotif(
        `💰 ${game} : +${gained.toLocaleString(
          "fr-FR",
        )} monnaie (total gagné: ${total.toLocaleString("fr-FR")})`,
      );
    });

    initSiteMoneyAverageWidget(socket, {
      elementId: "hub-site-money-average",
    });

    if (
      !subPageName.endsWith("demande-tag.html") &&
      !subPageName.endsWith("suggestions.html") &&
      !subPageName.endsWith("hall-des-oublies.html") &&
      !subPageName.endsWith("patch_notes.html") &&
      !subPageName.endsWith("profile.html") &&
      !subPageName.endsWith("403.html") &&
      !subPageName.endsWith("badges.html")
    ) {
      if (chat?.initChat) chat.initChat(socket);
      if (clicker?.initClicker) clicker.initClicker(socket);
      if (economieLeaderboard?.initEconomieLeaderboard)
        economieLeaderboard.initEconomieLeaderboard(socket);
      if (dino?.initDino) dino.initDino(socket);
      if (dinoLeaderboard?.initDinoLeaderboard)
        dinoLeaderboard.initDinoLeaderboard(socket);
      if (uno?.initUno) uno.initUno(socket);
      if (flappy?.initFlappy) flappy.initFlappy(socket);
      if (flappyLeaderboard?.initFlappyLeaderboard)
        flappyLeaderboard.initFlappyLeaderboard(socket);
      if (unoLeaderboard?.initUnoLeaderboard)
        unoLeaderboard.initUnoLeaderboard(socket);
      if (puissance4?.initPuissance4) puissance4.initPuissance4(socket);
      if (p4Leaderboard?.initP4Leaderboard)
        p4Leaderboard.initP4Leaderboard(socket);
      if (blockblast?.initBlockBlast) blockblast.initBlockBlast(socket);
      if (blockblastLeaderboard?.initBlockBlastLeaderboard)
        blockblastLeaderboard.initBlockBlastLeaderboard(socket);
      if (snake?.initSnake) snake.initSnake(socket);
      if (snakeLeaderboard?.initSnakeLeaderboard)
        snakeLeaderboard.initSnakeLeaderboard(socket);
      if (system?.initSystem) system.initSystem(socket, rulesAccepted);
      if (motus?.initMotus) motus.initMotus(socket);
      if (blackjack?.initBlackjack) blackjack.initBlackjack(socket, username);
      if (coinflip?.initCoinFlip) coinflip.initCoinFlip(socket);
      if (motusLeaderboard?.initMotusLeaderboard)
        motusLeaderboard.initMotusLeaderboard(socket);
      if (game2048?.init2048) game2048.init2048(socket);
      if (game2048Leaderboard?.init2048Leaderboard)
        game2048Leaderboard.init2048Leaderboard(socket);
      if (mash?.initMash) mash.initMash(socket);
      if (mashLeaderboard?.initMashLeaderboard)
        mashLeaderboard.initMashLeaderboard(socket);
      if (blackjackLeaderboard?.initBlackjackLeaderboard)
        blackjackLeaderboard.initBlackjackLeaderboard(socket);
      if (coinflipLeaderboard?.initCoinflipLeaderboard)
        coinflipLeaderboard.initCoinflipLeaderboard(socket);
      if (pixelwar?.initPixelWar) pixelwar.initPixelWar(socket);
      if (pixelwarLeaderboard?.initPixelwarLeaderboard)
        pixelwarLeaderboard.initPixelwarLeaderboard(socket);
      if (roulette?.initRoulette) roulette.initRoulette(socket);
      if (slots?.initSlots) slots.initSlots(socket);
      if (rouletteLeaderboard?.initRouletteLeaderboard)
        rouletteLeaderboard.initRouletteLeaderboard(socket);
      if (slotsLeaderboard?.initSlotsLeaderboard)
        slotsLeaderboard.initSlotsLeaderboard(socket);
      if (sudoku?.initSudoku) sudoku.initSudoku(socket);
      if (sudokuLeaderboard?.initSudokuLeaderboard)
        sudokuLeaderboard.initSudokuLeaderboard(socket);
      if (subwayLeaderboard?.initSubwayLeaderboard)
        subwayLeaderboard.initSubwayLeaderboard(socket);
      if (subway?.initSubway) subway.initSubway(socket);
      if (passwordChange?.setupPasswordChange)
        passwordChange.setupPasswordChange(socket);
    } else {
      console.warn(
        "Modules non initialisés (page non compatible  : " + subPageName + " )",
      );
    }
    // Important: enregistrer les listeners AVANT socket.connect()
    socket.on("connect", () => {
      // Resync initial (au cas où certains events init auraient été ratés)
      socket.emit("chat:sync");
      socket.emit("clicker:sync");
      socket.emit("motus:sync");

      // États de jeux existants
      socket.emit("uno:getState");
      socket.emit("p4:getState");
      socket.emit("blackjack:state");
      socket.emit("coinflip:state");
      socket.emit("mash:state");
      socket.emit("economy:getWallet");
    });

    socket.connect();
  } catch (err) {
    console.error("Erreur chargement modules : ", err);
  }
})();
