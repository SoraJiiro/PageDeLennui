// ===============================
// 🌍 main.js
// ===============================

(async () => {
  console.log("🚀 Initialisation du client...");

  // --- Vérification session ---
  const sessionRes = await fetch("/api/session");
  if (!sessionRes.ok) {
    console.warn("🔒 Pas de session, redirection vers /login");
    window.location.href = "/login";
    return;
  }

  const { username } = await sessionRes.json();
  console.log(`✅ Session reconnue : ${username}`);

  // --- Connexion au serveur Socket.io ---
  const socket = io({
    query: { username },
  });

  // --- Reload automatique lors de modification du serveur ---
  socket.on("reload", () => {
    console.log("♻️ Reload détecté, rechargement de la page...");
    location.reload();
  });

  // --- Gestion de base de la connexion ---
  socket.on("connect", () => {
    console.log("✅ Connecté au serveur via Socket.io");
  });

  socket.on("disconnect", () => {
    console.warn("❌ Déconnecté du serveur Socket.io");
  });

  // --- Importation dynamique des modules ---
  try {
    const modules = await Promise.all([
      import("./chat.js"),
      import("./clicker.js"),
      import("./clicker_leaderboard.js"),
      import("./dino.js"),
      import("./dino_leaderboard.js"),
    ]);

    const [chat, clicker, clickerLeaderboard, dino, dinoLeaderboard] = modules;

    // --- Initialisation ---
    if (chat?.initChat) chat.initChat(socket, username);
    if (clicker?.initClicker) clicker.initClicker(socket, username);
    if (clickerLeaderboard?.initClickerLeaderboard)
      clickerLeaderboard.initClickerLeaderboard(socket);
    if (dino?.initDino) dino.initDino(socket);
    if (dinoLeaderboard?.initDinoLeaderboard)
      dinoLeaderboard.initDinoLeaderboard(socket);

    console.log("🧩 Tous les modules ont été initialisés !");
  } catch (err) {
    console.error("⚠️ Erreur lors du chargement des modules :", err);
  }

  // --- Sécurité : gestion des erreurs globales ---
  socket.on("connect_error", (err) => {
    console.error("🚨 Erreur Socket.io :", err.message);
  });
})();
