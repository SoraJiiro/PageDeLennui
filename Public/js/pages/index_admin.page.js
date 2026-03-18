let socket;
let currentUser = null;
let chatModule = null;
let shutdownBonusEnabled = true;
let isModeratorPanel = window.location.search.includes("view=mod");
let adminAimLeaderboards = { 15: [], 30: [], 60: [] };

function updateShutdownBonusToggleUi() {
  const btn = document.getElementById("shutdown-bonus-toggle-btn");
  if (!btn) return;
  if (shutdownBonusEnabled) {
    btn.textContent = "Bonus: activé";
    btn.classList.remove("is-off");
    btn.title = "Cliquer pour désactiver les bonus au prochain shutdown";
  } else {
    btn.textContent = "Bonus: désactivé";
    btn.classList.add("is-off");
    btn.title = "Cliquer pour réactiver les bonus au prochain shutdown";
  }
}

function toggleShutdownBonusMode() {
  shutdownBonusEnabled = !shutdownBonusEnabled;
  updateShutdownBonusToggleUi();
  showNotification(
    `✅ Bonus shutdown ${shutdownBonusEnabled ? "activé" : "désactivé"}`,
    "success",
  );
}

function normalizePanelText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function applyModeratorView() {
  document.title = "Moderation - PDE";

  const title = document.querySelector(".admin-header h1");
  if (title) {
    title.innerHTML =
      '<i class="fa-solid fa-shield-halved"></i> PANEL MODERATEUR';
  }

  document
    .querySelectorAll(".reset-rules, .del-other-admins, .shutdown-admin-only")
    .forEach((btn) => {
      btn.style.display = "none";
    });

  const allowedSectionKeys = [
    "transactions (monnaie) en attente",
    "gains money (jeux)",
    "demandes de mot de passe",
    "demandes de pfp",
    "badges perso",
    "gestion tricheurs",
    "blacklist",
    "sondages",
    "chat lan",
    "dms entre 2 users",
    "monitoring gains (casino)",
    "leaderboards",
    "logs",
    "commandes",
  ];

  document.querySelectorAll(".admin-section").forEach((section) => {
    const h2 = section.querySelector("h2");
    const text = normalizePanelText(h2 ? h2.textContent : "");
    const keep = allowedSectionKeys.some((key) => text.includes(key));
    section.style.display = keep ? "" : "none";

    if (!keep) return;
    if (!text.includes("commandes")) return;

    section.querySelectorAll(".control-group").forEach((group) => {
      const h3 = normalizePanelText(
        group.querySelector("h3")?.textContent || "",
      );
      const keepGroup = h3.includes("demandes de tag") || h3.includes("/notif");
      group.style.display = keepGroup ? "" : "none";
    });
  });
}

async function checkSes() {
  const res = await fetch("/api/session");
  if (!res.ok) {
    window.location.href = "/login";
    return;
  }
  const data = await res.json();
  currentUser = data.pseudo;
  isModeratorPanel =
    currentUser === "Moderateur1" || currentUser === "Moderateur2";

  if (
    currentUser !== "Admin" &&
    currentUser !== "Moderateur1" &&
    currentUser !== "Moderateur2"
  ) {
    window.location.href = "/";
    return;
  }

  if (isModeratorPanel) {
    applyModeratorView();
    ["badges", "shop-catalog", "ee-completions", "clicker-anti-cheat"].forEach(
      (key) => {
        adminRefreshHandlers[key] = () => {};
      },
    );
  }

  try {
    chatModule = await import("/js/chat.js");
  } catch (err) {
    console.warn("Impossible de précharger le module de chat:", err);
    chatModule = null;
  }

  if (!socket) {
    initSocket();
  }
  loadTagRequests();
  loadAdminSurveys();
  updateShutdownBonusToggleUi();
  if (isModeratorPanel) {
    loadCheaters();
  }
}

const adminRefreshHandlers = {
  transactions: () => refreshTransactions(),
  "game-money-rewards": () => refreshGameMoneyRewards(),
  "password-requests": () => refreshPasswordRequests(),
  "pfp-requests": () => refreshPfpRequests(),
  "custom-badge-requests": () => refreshCustomBadgeRequests(),
  "users-birthdays": () => refreshAdminUsersBirthdays(),
  badges: () => refreshBadges(),
  "shop-catalog": () => refreshShopCatalog(),
  "daily-cap": () => refreshDailyCap(),
  "ee-completions": () => refreshEeCompletions(),
  "tag-requests": () => loadTagRequests(),
  surveys: () => loadAdminSurveys(),
  cheaters: () => loadCheaters(),
  "clicker-anti-cheat": () => refreshClickerAntiCheatSettings(),
};

const adminRefreshTimers = new Map();

function scheduleAdminRefresh(typeOrList) {
  const types = Array.isArray(typeOrList) ? typeOrList : [typeOrList];
  types.forEach((entry) => {
    const key = String(entry || "").trim();
    if (!key) return;
    if (key === "all") {
      Object.keys(adminRefreshHandlers).forEach((k) => scheduleAdminRefresh(k));
      return;
    }
    const handler = adminRefreshHandlers[key];
    if (!handler) return;
    if (adminRefreshTimers.has(key)) return;
    adminRefreshTimers.set(
      key,
      setTimeout(() => {
        adminRefreshTimers.delete(key);
        try {
          handler();
        } catch (err) {
          console.warn("Erreur refresh admin:", key, err);
        }
      }, 150),
    );
  });
}

// Initialiser Socket.IO
function initSocket() {
  // on crée la socket sans auto-connexion pour pouvoir initialiser
  // les handlers du module chat avant que le serveur n'émette des événements
  socket = io({
    query: { username: currentUser },
    autoConnect: false,
  });

  // Expose pour scripts admin externes (ex: admin_pixelwar.js)
  window.adminSocket = socket;
  window.socket = socket;

  if (window.initUiColor) {
    window.initUiColor(socket);
  }

  import("/js/site_money_average.js")
    .then(({ initSiteMoneyAverageWidget }) => {
      initSiteMoneyAverageWidget(socket, {
        elementId: "admin-site-money-average",
      });
    })
    .catch((err) => {
      console.warn("Impossible de charger site_money_average.js:", err);
    });

  // initialiser le module chat (s'il a été préchargé)
  try {
    if (chatModule && typeof chatModule.initChat === "function") {
      chatModule.initChat(socket);
    }
  } catch (err) {
    console.warn("Erreur lors de l'initialisation du module chat:", err);
  }

  // connecte après l'initialisation des handlers
  socket.connect();

  socket.on("connect", () => {
    console.log("> Connecté au serveur");
  });

  // Auto-reload sur modification de fichiers
  socket.on("reload", (data) => {
    const file = data?.file || "";
    // Recharger seulement les CSS sans reset de socket
    if (file.match(/\.css$/i)) {
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        const href = link.href.split("?")[0];
        link.href = href + "?v=" + Date.now();
      });
    } else if (file.match(/\.js$/i) || file.match(/\.html$/i)) {
      // Pour les JS/HTML, reload complet nécessaire
      window.location.reload();
    }
  });

  socket.on("admin:data:refresh", (payload) => {
    const types = payload?.types || (payload?.type ? [payload.type] : []);
    scheduleAdminRefresh(types);
  });

  socket.on("clicker:antiCheatSettings", (settings) => {
    renderClickerAntiCheatSettings(settings || {});
  });

  socket.on("admin:new_transaction", () => {
    scheduleAdminRefresh("transactions");
  });

  const onSurveyChange = () => scheduleAdminRefresh("surveys");
  socket.on("survey:new", onSurveyChange);
  socket.on("survey:update", onSurveyChange);
  socket.on("survey:closed", onSurveyChange);
  socket.on("survey:deleted", onSurveyChange);

  // Leaderboards
  socket.on("economie:leaderboard", (data) => {
    updateLeaderboard("economie", data, "score");
    updateLeaderboard("clicks-cps", data, "score");
  });
  socket.on("dino:leaderboard", (data) =>
    updateLeaderboard("dino", data, "score"),
  );
  socket.on("flappy:leaderboard", (data) =>
    updateLeaderboard("flappy", data, "score"),
  );
  socket.on("subway:leaderboard", (data) =>
    updateLeaderboard("subway", data, "score"),
  );
  socket.on("uno:leaderboard", (data) =>
    updateLeaderboard("uno", data, "wins"),
  );
  socket.on("p4:leaderboard", (data) => updateLeaderboard("p4", data, "wins"));
  socket.on("blockblast:leaderboard", (data) =>
    updateLeaderboard("blockblast", data, "score"),
  );
  socket.on("snake:leaderboard", (data) =>
    updateLeaderboard("snake", data, "score"),
  );
  socket.on("motus:leaderboard", (data) =>
    updateLeaderboard("motus", data, "words"),
  );
  socket.on("2048:leaderboard", (data) =>
    updateLeaderboard("2048", data, "score"),
  );
  socket.on("mash:leaderboard", (data) =>
    updateLeaderboard("mash", data, "wins"),
  );
  socket.on("blackjack:leaderboard", (data) =>
    updateLeaderboard("blackjack", data, "handsWon"),
  );
  socket.on("coinflip:leaderboard", (data) =>
    updateLeaderboard("coinflip", data, "wins"),
  );
  socket.on("roulette:leaderboard", (data) =>
    updateLeaderboard("roulette", data, "wins"),
  );
  socket.on("slots:leaderboard", (data) =>
    updateLeaderboard("slots", data, "wins"),
  );
  socket.on("sudoku:leaderboard", (data) =>
    updateLeaderboard("sudoku", data, "completed"),
  );
  socket.on("aim:leaderboard", (payload) => {
    if (Array.isArray(payload)) {
      adminAimLeaderboards["30"] = payload;
    } else if (payload && typeof payload === "object" && payload.leaderboards) {
      adminAimLeaderboards = {
        15: Array.isArray(payload.leaderboards["15"])
          ? payload.leaderboards["15"]
          : [],
        30: Array.isArray(payload.leaderboards["30"])
          ? payload.leaderboards["30"]
          : [],
        60: Array.isArray(payload.leaderboards["60"])
          ? payload.leaderboards["60"]
          : [],
      };
    }

    const selectedDuration = String(
      document.getElementById("admin-aim-duration")?.value || "30",
    );
    const list = adminAimLeaderboards[selectedDuration] || [];
    updateLeaderboard("aim", list, "score");
  });
  socket.on("pixelwar:leaderboard", (data) =>
    updateLeaderboard("pixelwar", data, "pixelsPlaced"),
  );
  socket.emit("pixelwar:get_leaderboard");
  socket.emit("aim:requestLeaderboard", { duration: "30" });

  // Notifications globales (admin voit aussi le countdown)
  socket.on("system:notification", (data) => {
    const message = data && data.message ? data.message : "Notification";
    const duration = data && data.duration ? data.duration : 8000;
    const withCountdown = !!(data && data.withCountdown);
    if (window.showNotif) {
      window.showNotif(message, duration, withCountdown);
    } else if (window.PDENotifications?.show) {
      window.PDENotifications.show(message, { duration, withCountdown });
    }
  });

  socket.on("system:redirect", (url) => {
    window.location.href = url;
  });

  // Blacklist admin socket handlers
  socket.on("admin:blacklist:result", (res) => {
    if (!res) return;
    if (!res.success)
      return showNotification(
        `❌ ${res.message || "Erreur blacklist"}`,
        "error",
      );
    const payload =
      res.data && typeof res.data === "object" && !Array.isArray(res.data)
        ? res.data
        : {
            alwaysBlocked: Array.isArray(res.data) ? res.data : [],
            alwaysBlockedPseudos: [],
          };
    window.__adminBlacklistData = {
      alwaysBlocked: Array.isArray(payload.alwaysBlocked)
        ? payload.alwaysBlocked
        : [],
      alwaysBlockedPseudos: Array.isArray(payload.alwaysBlockedPseudos)
        ? payload.alwaysBlockedPseudos
        : [],
    };
    window.__adminBlacklistForced = Array.isArray(res.forced) ? res.forced : [];
    window.__adminBlacklistForcedPseudos = Array.isArray(res.forcedPseudos)
      ? res.forcedPseudos
      : [];
    renderBlacklist();
  });

  socket.on("admin:blacklist:updated", (alwaysBlocked) => {
    const payload =
      alwaysBlocked &&
      typeof alwaysBlocked === "object" &&
      !Array.isArray(alwaysBlocked)
        ? alwaysBlocked
        : {
            alwaysBlocked: Array.isArray(alwaysBlocked) ? alwaysBlocked : [],
            alwaysBlockedPseudos: [],
          };
    window.__adminBlacklistData = {
      alwaysBlocked: Array.isArray(payload.alwaysBlocked)
        ? payload.alwaysBlocked
        : [],
      alwaysBlockedPseudos: Array.isArray(payload.alwaysBlockedPseudos)
        ? payload.alwaysBlockedPseudos
        : [],
    };
    if (!Array.isArray(window.__adminBlacklistForced))
      window.__adminBlacklistForced = [];
    if (!Array.isArray(window.__adminBlacklistForcedPseudos))
      window.__adminBlacklistForcedPseudos = [];
    renderBlacklist();
    showNotification("✅ Blacklist mise à jour", "success");
  });

  socket.on("admin:rules:resetAll:result", (res) => {
    if (!res) return;
    if (!res.success) {
      showNotification(
        `❌ ${res.message || "Erreur reset règlement"}`,
        "error",
      );
      return;
    }
    const changed = typeof res.changed === "number" ? res.changed : null;
    const total = typeof res.total === "number" ? res.total : null;
    if (changed != null && total != null) {
      showNotification(
        `✅ Règlement reset: ${changed}/${total} utilisateur(s) mis à jour`,
        "success",
      );
    } else {
      showNotification(
        "✅ Règlement reset pour tous les utilisateurs",
        "success",
      );
    }
  });
}

function resetRulesForAll() {
  if (!socket) {
    showNotification("❌ Socket non initialisée", "error");
    return;
  }
  const ok = confirm(
    "⚠️ Forcer tous les utilisateurs à relire le règlement ?\n",
  );
  if (!ok) return;
  socket.emit("admin:rules:resetAll");
  showNotification("⏳ Reset du règlement en cours...", "info");
}

function updateLeaderboard(type, data, valueKey) {
  const tbody = document.getElementById(`lb-${type}`);
  if (!tbody) return;

  tbody.innerHTML = "";
  data.forEach((item, index) => {
    const tr = document.createElement("tr");

    let val = item[valueKey];
    if (typeof val === "number") {
      val = val.toLocaleString("fr-FR");
    }

    let extraTd = "";
    // Gestion spécifique pour afficher le temps si présent (BlockBlast / Snake)
    if (type === "blockblast" || type === "snake") {
      const t = item.timeMs;
      let timeTxt = "—";
      if (typeof t === "number") {
        const totalSec = Math.floor(t / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) {
          timeTxt = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        } else {
          timeTxt = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        }
      }
      extraTd = `<td>${timeTxt}</td>`;
    }

    if (type === "blackjack") {
      // Mots clés: Mains | W/L | Max Bet | Double/BJ
      const hands = item.handsPlayed || 0;
      const won = item.handsWon || 0;
      const lost = item.handsLost || 0;
      const maxBet = (item.biggestBet || 0).toLocaleString("fr-FR");
      const dbl = item.doubles || 0;
      const bj = item.bjs || 0;

      val = hands;

      // Reconstruction complète pour blackjack car colonnes spécifiques
      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${hands}</td>
                        <td>${won} / ${lost}</td>
                        <td>${maxBet}</td>
                        <td>${dbl}</td>
                        <td>${bj}</td>
                    `;
      tbody.appendChild(tr);
      return; // Skip default row construction
    }

    if (type === "economie") {
      const clicks = Number(item.score || 0).toLocaleString("fr-FR");
      const money = Number(item.money || 0).toLocaleString("fr-FR");
      const tokens = Number(item.tokens || 0).toLocaleString("fr-FR");

      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${clicks}</td>
                        <td>${money}</td>
                        <td>${tokens}</td>
                    `;
      tbody.appendChild(tr);
      return;
    }

    if (type === "motus") {
      const tries = Number(item.tries || 0).toLocaleString("fr-FR");
      const words = Number(item.words || 0).toLocaleString("fr-FR");
      const totalWords = Number(item.totalWords || 0).toLocaleString("fr-FR");

      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${tries}</td>
                        <td>${words}</td>
                        <td>${totalWords}</td>
                    `;
      tbody.appendChild(tr);
      return;
    }

    if (type === "coinflip") {
      // Rang | Pseudo | Parties | W/L | Max Bet | Max Loss | All-ins
      const games = item.gamesPlayed || 0;
      const won = item.wins || 0;
      const lost = item.losses || 0;
      const maxBet = (item.biggestBet || 0).toLocaleString("fr-FR");
      const maxLoss = (item.biggestLoss || 0).toLocaleString("fr-FR");
      const allins = item.allIns || 0;

      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${games}</td>
                        <td>${won} / ${lost}</td>
                        <td>${maxBet}</td>
                        <td>${maxLoss}</td>
                        <td>${allins}</td>
                    `;
      tbody.appendChild(tr);
      return; // Skip default row construction
    }

    if (type === "roulette" || type === "slots") {
      const games = item.gamesPlayed || 0;
      const won = item.wins || 0;
      const lost = item.losses || 0;
      const maxBet = (item.biggestBet || 0).toLocaleString("fr-FR");
      const maxWin = (item.biggestWin || 0).toLocaleString("fr-FR");

      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${games}</td>
                        <td>${won} / ${lost}</td>
                        <td>${maxBet}</td>
                        <td>${maxWin}</td>
                    `;
      tbody.appendChild(tr);
      return;
    }

    if (type === "pixelwar") {
      const pixels = Number(item.pixelsPlaced || 0).toLocaleString("fr-FR");
      const favColor = Number.isFinite(Number(item.favColor))
        ? item.favColor
        : "-";
      const overridden = Number(item.pixelsOverridden || 0).toLocaleString(
        "fr-FR",
      );

      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${pixels}</td>
                        <td>${favColor}</td>
                        <td>${overridden}</td>
                    `;
      tbody.appendChild(tr);
      return;
    }

    if (type === "clicks-cps") {
      const clicks = Number(item.score || 0).toLocaleString("fr-FR");
      const peakCps = Number(item.peakHumanCps || 0).toLocaleString("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });

      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${clicks}</td>
                        <td>${peakCps}</td>
                    `;
      tbody.appendChild(tr);
      return;
    }

    if (type === "aim") {
      const score = Number(item.score || 0).toLocaleString("fr-FR");
      tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${item.pseudo}</td>
                        <td>${score}</td>
                    `;
      tbody.appendChild(tr);
      return;
    }

    tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${item.pseudo}</td>
                    <td>${val}</td>
                    ${extraTd}
                `;
    tbody.appendChild(tr);
  });
}

// Tabs Leaderboard
document.querySelectorAll(".lb-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const board = tab.dataset.board;

    document
      .querySelectorAll(".lb-tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".leaderboard-content")
      .forEach((c) => c.classList.remove("active"));

    tab.classList.add("active");
    document
      .querySelector(`.leaderboard-content[data-board="${board}"]`)
      .classList.add("active");
  });
});

const adminAimDurationSelect = document.getElementById("admin-aim-duration");
if (adminAimDurationSelect) {
  adminAimDurationSelect.addEventListener("change", () => {
    const duration = String(adminAimDurationSelect.value || "30");
    const list = adminAimLeaderboards[duration] || [];
    updateLeaderboard("aim", list, "score");
    if (socket) {
      socket.emit("aim:requestLeaderboard", { duration });
    }
  });
}

const _adminPagers = {
  transactions: { page: 1, pageSize: 5 },
  gameMoneyRewards: { page: 1, pageSize: 5 },
  badgesCatalog: { page: 1, pageSize: 5 },
  adminSurveys: { page: 1, pageSize: 5 },
};

function getAdminPager(key) {
  if (!_adminPagers[key]) {
    _adminPagers[key] = { page: 1, pageSize: 5 };
  }
  return _adminPagers[key];
}

function changeAdminPage(key, delta) {
  const pager = getAdminPager(key);
  pager.page = Math.max(1, (pager.page || 1) + Number(delta || 0));

  if (key === "transactions") return refreshTransactions();
  if (key === "gameMoneyRewards") return refreshGameMoneyRewards();
  if (key === "badgesCatalog") return refreshBadges();
  if (key === "adminSurveys") return loadAdminSurveys();
}

function renderAdminPaginatedNodes({
  key,
  listId,
  paginationId,
  nodes,
  emptyHtml,
}) {
  const list = document.getElementById(listId);
  const pagerNode = document.getElementById(paginationId);
  if (!list) return;

  const allNodes = Array.isArray(nodes) ? nodes : [];
  if (allNodes.length === 0) {
    list.innerHTML =
      emptyHtml || '<div style="text-align:center">Aucune donnée</div>';
    if (pagerNode) pagerNode.innerHTML = "";
    return;
  }

  const pager = getAdminPager(key);
  const pageSize = Math.max(1, Number(pager.pageSize || 5));
  const pageCount = Math.max(1, Math.ceil(allNodes.length / pageSize));
  pager.page = Math.min(Math.max(1, Number(pager.page || 1)), pageCount);

  const start = (pager.page - 1) * pageSize;
  const end = start + pageSize;
  const visibleNodes = allNodes.slice(start, end);

  list.innerHTML = "";
  visibleNodes.forEach((node) => list.appendChild(node));

  if (pagerNode) {
    pagerNode.innerHTML = `
                    <button class="btn" onclick="changeAdminPage('${key}', -1)" ${pager.page <= 1 ? "disabled" : ""}>
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <span style="font-size:0.9rem;">Page ${pager.page} / ${pageCount} (${allNodes.length} entrées)</span>
                    <button class="btn" onclick="changeAdminPage('${key}', 1)" ${pager.page >= pageCount ? "disabled" : ""}>
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                `;
  }
}

function renderAdminPaginatedRows({
  key,
  tbodyId,
  paginationId,
  rows,
  emptyHtml,
  emptyColspan,
}) {
  const tbody = document.getElementById(tbodyId);
  const pagerNode = document.getElementById(paginationId);
  if (!tbody) return;

  const allRows = Array.isArray(rows) ? rows : [];
  if (allRows.length === 0) {
    tbody.innerHTML =
      emptyHtml ||
      `<tr><td colspan="${emptyColspan || 1}" style="text-align:center">Aucune donnée</td></tr>`;
    if (pagerNode) pagerNode.innerHTML = "";
    return;
  }

  const pager = getAdminPager(key);
  const pageSize = Math.max(1, Number(pager.pageSize || 5));
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  pager.page = Math.min(Math.max(1, Number(pager.page || 1)), pageCount);

  const start = (pager.page - 1) * pageSize;
  const end = start + pageSize;
  const visibleRows = allRows.slice(start, end);

  tbody.innerHTML = "";
  visibleRows.forEach((tr) => tbody.appendChild(tr));

  if (pagerNode) {
    pagerNode.innerHTML = `
                    <button class="btn" onclick="changeAdminPage('${key}', -1)" ${pager.page <= 1 ? "disabled" : ""}>
                        <i class="fa-solid fa-chevron-left"></i>
                    </button>
                    <span style="font-size:0.9rem;">Page ${pager.page} / ${pageCount} (${allRows.length} entrées)</span>
                    <button class="btn" onclick="changeAdminPage('${key}', 1)" ${pager.page >= pageCount ? "disabled" : ""}>
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                `;
  }
}

// --- Transactions ---
async function refreshTransactions() {
  try {
    const res = await fetch("/api/admin/transactions");
    if (!res.ok) return;
    const transactions = await res.json();
    const pending = transactions.filter((t) => t.status === "pending");

    const rows = [];

    pending.forEach((tx) => {
      // Gestion affichage ancien format vs nouveau format + IP
      let fromDisplay = tx.from;
      if (tx.fromIp) {
        fromDisplay = `${tx.from} (${tx.fromIp})`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
                        <td>${fromDisplay}</td>
                        <td>${tx.to}</td>
                        <td>${tx.amount.toLocaleString()} FCO</td>
                        <td>${new Date(tx.date).toLocaleString()}</td>
                        <td>
                            <button onclick="approveTransaction('${tx.id}')" class="btn-approve" style="background:#4CAF50; color:white; border:none; padding:5px 10px; margin-right:5px;"><i class="fa-solid fa-check"></i></button>
                            <button onclick="rejectTransaction('${tx.id}')" class="btn-reject" style="background:#f44336; color:white; border:none; padding:5px 10px;"><i class="fa-solid fa-times"></i></button>
                        </td>
                    `;
      rows.push(tr);
    });

    renderAdminPaginatedRows({
      key: "transactions",
      tbodyId: "transactions-list",
      paginationId: "transactions-pagination",
      rows,
      emptyHtml:
        '<tr><td colspan="5" style="text-align:center">Aucune transaction en attente</td></tr>',
      emptyColspan: 5,
    });
  } catch (e) {
    console.error(e);
  }
}

async function refreshGameMoneyRewards() {
  try {
    const res = await fetch("/api/admin/game-money-rewards?limit=200");
    if (!res.ok) return;
    const rows = await res.json();
    const tableRows = [];

    rows.forEach((entry) => {
      const tr = document.createElement("tr");
      const gain = Number(entry.gained || 0);
      const total = Number(entry.total || 0);
      const score = Number(entry.score || 0);
      const maxTile = Number(entry.maxTile || 0);
      let detail = "-";
      if (score > 0) detail = `score: ${score.toLocaleString("fr-FR")}`;
      if (maxTile > 0) detail = `maxTile: ${maxTile.toLocaleString("fr-FR")}`;

      tr.innerHTML = `
                        <td>${entry.at ? new Date(entry.at).toLocaleString() : "-"}</td>
                        <td>${entry.pseudo || "-"}</td>
                        <td>${entry.game || "-"}</td>
                        <td>+${gain.toLocaleString("fr-FR")}</td>
                        <td>${total.toLocaleString("fr-FR")}</td>
                        <td>${detail}</td>
                    `;
      tableRows.push(tr);
    });

    renderAdminPaginatedRows({
      key: "gameMoneyRewards",
      tbodyId: "game-money-rewards-list",
      paginationId: "game-money-rewards-pagination",
      rows: tableRows,
      emptyHtml:
        '<tr><td colspan="6" style="text-align:center">Aucun gain enregistré</td></tr>',
      emptyColspan: 6,
    });
  } catch (e) {
    console.error(e);
  }
}

async function approveTransaction(id) {
  if (!confirm("Valider cette transaction ?")) return;
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/transactions/approve",
      { id },
    );
    if (res.ok) {
      showNotification("Transaction approuvée", "success");
      refreshTransactions();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function rejectTransaction(id) {
  if (!confirm("Refuser cette transaction ?")) return;
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/transactions/reject",
      { id },
    );
    if (res.ok) {
      showNotification("Transaction refusée", "success");
      refreshTransactions();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// --- Password Requests ---
async function refreshPasswordRequests() {
  try {
    const res = await fetch("/api/admin/password-requests");
    if (!res.ok) return;
    const requests = await res.json();
    const pending = requests.filter((r) => r.status === "pending");

    const tbody = document.getElementById("password-requests-list");
    tbody.innerHTML = "";

    if (pending.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center">Aucune demande</td></tr>';
      return;
    }

    pending.forEach((req) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                        <td>${req.pseudo}</td>
                        <td>${req.ip || "?"}</td>
                        <td>${new Date(req.date).toLocaleString()}</td>
                        <td>
                            <button onclick="handlePasswordRequest('${req.id}', true)" class="btn-approve" 
                                style="background:#4CAF50; color:white; border:none; padding:5px 10px; margin-right:5px;"
                                title="Approuver et changer le mot de passe">
                                <i class="fa-solid fa-check"></i>
                            </button>
                            <button onclick="handlePasswordRequest('${req.id}', false)" class="btn-reject" 
                                style="background:#f44336; color:white; border:none; padding:5px 10px;"
                                title="Rejeter">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </td>
                    `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Erreur refreshPasswordRequests", e);
  }
}

// --- PFP Requests ---
async function refreshPfpRequests() {
  try {
    const res = await fetch("/api/admin/pfp/requests");
    if (!res.ok) return;
    const requests = await res.json();
    const pending = requests.filter((r) => r.status === "pending");

    const tbody = document.getElementById("pfp-requests-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (pending.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center">Aucune demande</td></tr>';
      return;
    }

    pending.forEach((req) => {
      const safeUrl = (req.url || "").toString();
      const tr = document.createElement("tr");
      tr.innerHTML = `
                        <td>${req.pseudo}</td>
                        <td style="max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            <a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a>
                        </td>
                        <td>${new Date(req.createdAt || req.date || Date.now()).toLocaleString()}</td>
                        <td>
                            <button onclick="approvePfp('${req.id}')" class="btn-approve" style="background:#4CAF50; color:white; border:none; padding:5px 10px; margin-right:5px;" title="Approuver">
                                <i class="fa-solid fa-check"></i>
                            </button>
                            <button onclick="rejectPfp('${req.id}')" class="btn-reject" style="background:#f44336; color:white; border:none; padding:5px 10px;" title="Refuser">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </td>
                    `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Erreur refreshPfpRequests", e);
  }
}

async function approvePfp(id) {
  if (!confirm("Approuver cette PFP ?")) return;
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/pfp/requests/approve",
      { id },
    );
    if (res.ok) {
      showNotification("PFP approuvée", "success");
      refreshPfpRequests();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function rejectPfp(id) {
  const reason = prompt("Raison du refus ? (optionnel)") || "";
  if (!confirm("Refuser cette PFP ?")) return;
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/pfp/requests/reject",
      { id, reason },
    );
    if (res.ok) {
      showNotification("PFP refusée", "success");
      refreshPfpRequests();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// --- Custom badge requests ---
async function refreshCustomBadgeRequests() {
  try {
    const res = await fetch("/api/admin/custom-badges/requests");
    if (!res.ok) return;
    const requests = await res.json();
    const pending = requests.filter((r) => r.status === "pending");

    const tbody = document.getElementById("custom-badge-requests-list");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (pending.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center">Aucune demande</td></tr>';
      return;
    }

    pending.forEach((req) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                        <td>${req.pseudo}</td>
                        <td>${req.emoji || ""}</td>
                        <td>${req.name || ""}</td>
                        <td>${new Date(req.createdAt || Date.now()).toLocaleString()}</td>
                        <td>
                            <button onclick="approveCustomBadge('${req.id}')" class="btn-approve" style="background:#4CAF50; color:white; border:none; padding:5px 10px; margin-right:5px;" title="Approuver">
                                <i class="fa-solid fa-check"></i>
                            </button>
                            <button onclick="rejectCustomBadge('${req.id}')" class="btn-reject" style="background:#f44336; color:white; border:none; padding:5px 10px;" title="Refuser">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </td>
                    `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Erreur refreshCustomBadgeRequests", e);
  }
}

async function approveCustomBadge(id) {
  if (!confirm("Valider ce badge perso ?")) return;
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/custom-badges/requests/approve",
      { id },
    );
    if (res.ok) {
      showNotification("Badge perso validé", "success");
      refreshCustomBadgeRequests();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function rejectCustomBadge(id) {
  const reason = prompt("Raison du refus ? (optionnel)") || "";
  if (!confirm("Refuser ce badge perso ?")) return;
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/custom-badges/requests/reject",
      { id, reason },
    );
    if (res.ok) {
      showNotification("Badge perso refusé", "success");
      refreshCustomBadgeRequests();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// --- Badges (chat) ---
let _badgesCache = null;
async function refreshBadges() {
  try {
    const res = await fetch("/api/admin/badges");
    if (!res.ok) return;
    const data = await res.json();
    _badgesCache = data;
    const catalog = data.catalog || {};

    const tbody = document.getElementById("badges-catalog-list");
    if (tbody) {
      const rows = [];
      const entries = Object.entries(catalog).sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      entries.forEach(([id, def]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                            <td>${id}</td>
                            <td>${def.emoji || ""}</td>
                            <td>${def.name || ""}</td>
                            <td>
                                <button class="btn" onclick="updateBadge('${id}')" title="Modifier">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button onclick="deleteBadge('${id}')" class="btn btn-red" title="Supprimer">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </td>
                        `;
        rows.push(tr);
      });

      renderAdminPaginatedRows({
        key: "badgesCatalog",
        tbodyId: "badges-catalog-list",
        paginationId: "badges-catalog-pagination",
        rows,
        emptyHtml:
          '<tr><td colspan="4" style="text-align:center">Aucun badge</td></tr>',
        emptyColspan: 4,
      });
    }

    const select = document.getElementById("assignBadgeId");
    if (select) {
      select.innerHTML = "";
      Object.entries(catalog)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([id, def]) => {
          const opt = document.createElement("option");
          opt.value = id;
          opt.textContent = `${id} ${def.emoji ? "(" + def.emoji + ")" : ""} - ${def.name || ""}`;
          select.appendChild(opt);
        });
    }

    const lookupInput = document.getElementById("badgeLookupPseudo");
    if (lookupInput && lookupInput.value.trim()) {
      await lookupUserBadges(lookupInput.value.trim(), { skipRefresh: true });
    }
  } catch (e) {
    console.error("Erreur refreshBadges", e);
  }
}

async function lookupUserBadges(forcePseudo = "", options = {}) {
  const input = document.getElementById("badgeLookupPseudo");
  const resultNode = document.getElementById("badge-user-lookup-result");
  const skipRefresh = Boolean(options && options.skipRefresh);

  const rawPseudo = String(forcePseudo || input?.value || "").trim();
  if (!rawPseudo) {
    if (resultNode) resultNode.innerHTML = "";
    showNotification("Pseudo manquant", "error");
    return;
  }

  if (!_badgesCache || !skipRefresh) {
    await refreshBadges();
  }

  let canonicalPseudo = rawPseudo;
  try {
    const infoRes = await fetch(
      `/api/admin/user-info?pseudo=${encodeURIComponent(rawPseudo)}`,
    );
    if (infoRes.ok) {
      const info = await infoRes.json();
      if (info && info.pseudo) canonicalPseudo = String(info.pseudo).trim();
    }
  } catch (e) {
    console.warn("Lookup badges: user-info indisponible", e);
  }

  const users =
    _badgesCache && _badgesCache.users && typeof _badgesCache.users === "object"
      ? _badgesCache.users
      : {};
  const catalog =
    _badgesCache &&
    _badgesCache.catalog &&
    typeof _badgesCache.catalog === "object"
      ? _badgesCache.catalog
      : {};
  const matchedPseudo =
    Object.keys(users).find(
      (p) => String(p).toLowerCase() === canonicalPseudo.toLowerCase(),
    ) || canonicalPseudo;
  const bucket = users[matchedPseudo] || { assigned: [] };
  const assigned = Array.isArray(bucket.assigned)
    ? Array.from(new Set(bucket.assigned))
    : [];

  if (input) input.value = canonicalPseudo;
  if (!resultNode) return;

  resultNode.innerHTML = "";

  const title = document.createElement("div");
  title.style.marginBottom = "8px";
  title.style.fontSize = "0.95rem";
  title.innerHTML = `<strong>${matchedPseudo}</strong> — ${assigned.length} badge(s)`;
  resultNode.appendChild(title);

  if (assigned.length === 0) {
    const empty = document.createElement("div");
    empty.style.color = "var(--primary-color)";
    empty.textContent = "Aucun badge attribué.";
    resultNode.appendChild(empty);
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexWrap = "wrap";
  wrap.style.gap = "8px";

  assigned.forEach((badgeId) => {
    const def = catalog[badgeId] || {};
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-red";
    btn.title = `Retirer ${badgeId}`;
    btn.innerHTML = `${def.emoji || "🏷️"} ${def.name || badgeId} <i class="fa-solid fa-xmark"></i>`;
    btn.addEventListener("click", () =>
      removeLookupBadge(matchedPseudo, badgeId),
    );
    wrap.appendChild(btn);
  });

  resultNode.appendChild(wrap);
}

async function removeLookupBadge(pseudo, badgeId) {
  const p = String(pseudo || "").trim();
  const id = String(badgeId || "").trim();
  if (!p || !id) return;

  if (!confirm(`Retirer le badge ${id} de ${p} ?`)) return;

  try {
    const { res, data } = await adminPostJson("/api/admin/badges/assign", {
      pseudo: p,
      badgeId: id,
      action: "remove",
    });
    if (!res.ok) {
      showNotification(data.message || "Erreur", "error");
      return;
    }
    showNotification("Badge retiré", "success");
    await refreshBadges();
    await refreshUserInfoPanel(p);
    await lookupUserBadges(p, { skipRefresh: true });
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function createBadge() {
  const id = (document.getElementById("badgeId")?.value || "").trim();
  const emoji = (document.getElementById("badgeEmoji")?.value || "").trim();
  const name = (document.getElementById("badgeName")?.value || "").trim();
  if (!id || !emoji || !name) {
    showNotification("Champs manquants", "error");
    return;
  }
  try {
    const { res, data } = await adminPostJson("/api/admin/badges/create", {
      id,
      emoji,
      name,
    });
    if (res.ok) {
      showNotification("Badge créé", "success");
      refreshBadges();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function deleteBadge(id) {
  if (!confirm(`Supprimer le badge ${id} ?`)) return;
  try {
    const { res, data } = await adminPostJson("/api/admin/badges/delete", {
      id,
    });
    if (res.ok) {
      showNotification("Badge supprimé", "success");
      refreshBadges();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function updateBadge(id) {
  openBadgeEditModal(id);
}

function openBadgeEditModal(id) {
  const catalog =
    _badgesCache && _badgesCache.catalog ? _badgesCache.catalog : {};
  const current = catalog[id] || {};
  const modal = document.getElementById("badge-edit-modal");
  if (!modal) return;

  modal.dataset.originalId = id;
  const idInput = document.getElementById("badgeEditId");
  const emojiInput = document.getElementById("badgeEditEmoji");
  const nameInput = document.getElementById("badgeEditName");

  if (idInput) idInput.value = id;
  if (emojiInput) emojiInput.value = current.emoji || "";
  if (nameInput) nameInput.value = current.name || id;

  modal.style.display = "flex";
  if (idInput) setTimeout(() => idInput.focus(), 0);
}

function closeBadgeEditModal() {
  const modal = document.getElementById("badge-edit-modal");
  if (!modal) return;
  modal.style.display = "none";
  modal.dataset.originalId = "";
}

async function submitBadgeEdit() {
  const modal = document.getElementById("badge-edit-modal");
  if (!modal) return;
  const originalId = modal.dataset.originalId || "";
  const idInput = document.getElementById("badgeEditId");
  const emojiInput = document.getElementById("badgeEditEmoji");
  const nameInput = document.getElementById("badgeEditName");

  const cleanedId = String(idInput?.value || "").trim();
  const cleanedEmoji = String(emojiInput?.value || "").trim();
  const cleanedName = String(nameInput?.value || "").trim();

  if (!originalId || !cleanedId || !cleanedEmoji || !cleanedName) {
    showNotification("Champs manquants", "error");
    return;
  }

  if (!confirm(`Modifier le badge ${originalId} ?`)) return;

  try {
    const { res, data } = await adminPostJson("/api/admin/badges/update", {
      id: originalId,
      newId: cleanedId,
      emoji: cleanedEmoji,
      name: cleanedName,
    });
    if (res.ok) {
      showNotification("Badge modifié", "success");
      closeBadgeEditModal();
      refreshBadges();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

function parseBadgeTargets(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\n,;]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}

async function assignBadge(action) {
  const pseudoInput = (
    document.getElementById("assignPseudo")?.value || ""
  ).trim();
  const badgeId = (
    document.getElementById("assignBadgeId")?.value || ""
  ).trim();
  const targets = parseBadgeTargets(pseudoInput);
  const isAllTarget = targets.some((t) => t.toLowerCase() === "all");
  if (!targets.length || !badgeId) {
    showNotification("Pseudo/Badge manquants", "error");
    return;
  }
  try {
    const payload = isAllTarget
      ? { pseudo: "ALL", badgeId, action }
      : { pseudos: targets, badgeId, action };
    const { res, data } = await adminPostJson(
      "/api/admin/badges/assign",
      payload,
    );
    if (res.ok) {
      const targetCount =
        Number(data && data.count) || (isAllTarget ? 0 : targets.length);
      const successText = isAllTarget
        ? action === "remove"
          ? "Badge retiré pour tous les joueurs"
          : "Badge donné à tous les joueurs"
        : `Badge ${action === "remove" ? "retiré" : "donné"} à ${targetCount} joueur(s)`;
      showNotification(successText, "success");
      await refreshBadges();
      if (!isAllTarget && targetCount === 1) {
        await refreshUserInfoPanel(targets[0]);
      }
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function resetUserBadges() {
  const pseudo = (document.getElementById("assignPseudo")?.value || "").trim();
  const isAllTarget = pseudo.toLowerCase() === "all";
  if (!pseudo) {
    showNotification("Pseudo manquant", "error");
    return;
  }

  const confirmText = isAllTarget
    ? "Retirer TOUS les badges et reset les conditions auto pour TOUS les joueurs ?"
    : `Retirer TOUS les badges de ${pseudo} et reset ses conditions auto ?`;

  if (!confirm(confirmText)) {
    return;
  }

  try {
    const { res, data } = await adminPostJson("/api/admin/badges/reset-user", {
      pseudo,
    });
    if (res.ok) {
      showNotification(
        isAllTarget
          ? "Badges réinitialisés pour tous les joueurs"
          : "Badges du joueur réinitialisés",
        "success",
      );
      await refreshBadges();
      if (!isAllTarget) {
        await refreshUserInfoPanel(pseudo);
      }
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// --- Shop badges ---
let _shopCatalogCache = [];

function readShopForm() {
  return {
    id: (document.getElementById("shopItemId")?.value || "").trim(),
    emoji: (document.getElementById("shopItemEmoji")?.value || "").trim(),
    name: (document.getElementById("shopItemName")?.value || "").trim(),
    price: parseInt(document.getElementById("shopItemPrice")?.value, 10),
    desc: (document.getElementById("shopItemDesc")?.value || "").trim(),
    available: Boolean(document.getElementById("shopItemAvailable")?.checked),
  };
}

function fillShopForm(item) {
  if (!item) return;
  const idInput = document.getElementById("shopItemId");
  const emojiInput = document.getElementById("shopItemEmoji");
  const nameInput = document.getElementById("shopItemName");
  const priceInput = document.getElementById("shopItemPrice");
  const descInput = document.getElementById("shopItemDesc");
  const availableInput = document.getElementById("shopItemAvailable");

  if (idInput) idInput.value = item.id || "";
  if (emojiInput) emojiInput.value = item.emoji || "";
  if (nameInput) nameInput.value = item.name || "";
  if (priceInput) priceInput.value = item.price || "";
  if (descInput) descInput.value = item.desc || "";
  if (availableInput) availableInput.checked = !!item.available;
}

async function refreshShopCatalog() {
  try {
    const res = await fetch("/api/admin/shop/catalog");
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    _shopCatalogCache = items.slice();

    const tbody = document.getElementById("shop-catalog-list");
    if (tbody) {
      tbody.innerHTML = "";
      if (items.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center">Aucun badge</td></tr>';
      } else {
        items
          .slice()
          .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")))
          .forEach((item) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                                    <td>${item.id || ""}</td>
                                    <td>${item.emoji || ""}</td>
                                    <td>${item.name || ""}</td>
                                    <td>${typeof item.price === "number" ? item.price.toLocaleString("fr-FR") : ""}</td>
                                    <td>${item.available ? "Oui" : "Non"}</td>
                                    <td>${item.desc || ""}</td>
                                `;
            tbody.appendChild(tr);
          });
      }
    }

    const select = document.getElementById("shopItemSelect");
    if (select) {
      select.innerHTML = "";
      items
        .slice()
        .sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")))
        .forEach((item) => {
          const opt = document.createElement("option");
          opt.value = item.id;
          opt.textContent = `${item.id} ${item.emoji ? "(" + item.emoji + ")" : ""} - ${item.name || ""}`;
          select.appendChild(opt);
        });
    }
  } catch (e) {
    console.error("Erreur refreshShopCatalog", e);
  }
}

async function createShopItem() {
  const payload = readShopForm();
  if (!payload.id || !payload.name || !payload.emoji || !payload.price) {
    showNotification("Champs manquants", "error");
    return;
  }
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/shop/catalog/create",
      payload,
    );
    if (res.ok) {
      showNotification("Badge shop créé", "success");
      refreshShopCatalog();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function updateShopItem() {
  const payload = readShopForm();
  if (!payload.id) {
    showNotification("ID manquant", "error");
    return;
  }
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/shop/catalog/update",
      payload,
    );
    if (res.ok) {
      showNotification("Badge shop modifié", "success");
      refreshShopCatalog();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function deleteShopItem() {
  const id = (document.getElementById("shopItemSelect")?.value || "").trim();
  if (!id) {
    showNotification("ID manquant", "error");
    return;
  }
  if (!confirm(`Supprimer le badge shop ${id} ?`)) return;
  try {
    const { res, data } = await adminPostJson(
      "/api/admin/shop/catalog/delete",
      { id },
    );
    if (res.ok) {
      showNotification("Badge shop supprimé", "success");
      refreshShopCatalog();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// --- Cap quotidien (casino only) ---
async function refreshDailyCap() {
  try {
    const tbody = document.getElementById("daily-cap-list");
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center">Chargement...</td></tr>';

    const res = await fetch("/api/admin/economy/daily-cap");
    if (!res.ok) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center">Erreur chargement</td></tr>';
      return;
    }
    const data = await res.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];

    tbody.innerHTML = "";
    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center">Aucune donnée</td></tr>';
      return;
    }

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const fmt = (n) =>
        typeof n === "number" ? n.toLocaleString("fr-FR") : "—";
      tr.innerHTML = `
                        <td>${r.pseudo}</td>
                        <td>${fmt(r.currentTokens)}</td>
                        <td>${fmt(r.baseClicks)}</td>
                        <td>${fmt(r.earned)}</td>
                        <td>${r.date || "—"}</td>
                    `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error("Erreur refreshDailyCap", e);
  }
}

// --- Easter Eggs completions ---
async function refreshEeCompletions() {
  try {
    const tbody = document.getElementById("ee-completions-list");
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center">Chargement...</td></tr>';

    const res = await fetch("/api/admin/ee/completions");
    if (!res.ok) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center">Erreur chargement</td></tr>';
      return;
    }

    const data = await res.json();
    const eggs = Array.isArray(data.eggs) ? data.eggs : [];

    tbody.innerHTML = "";
    if (eggs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center">Aucun Easter Egg</td></tr>';
      return;
    }

    eggs.forEach((egg) => {
      const completions = Array.isArray(egg.completions) ? egg.completions : [];
      const groupRow = document.createElement("tr");
      const groupCell = document.createElement("td");
      groupCell.colSpan = 4;
      groupCell.style.fontWeight = "bold";
      groupCell.style.background = "rgba(0, 255, 0, 0.08)";
      groupCell.textContent = `${egg.label} — ${completions.length} trouve(s)`;
      groupRow.appendChild(groupCell);
      tbody.appendChild(groupRow);

      if (completions.length === 0) {
        const emptyRow = document.createElement("tr");
        const emptyCell = document.createElement("td");
        emptyCell.colSpan = 4;
        emptyCell.style.textAlign = "center";
        emptyCell.textContent = "Aucun trouve";
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
        return;
      }

      completions.forEach((entry, idx) => {
        const tr = document.createElement("tr");
        const tdEgg = document.createElement("td");
        const tdRank = document.createElement("td");
        const tdPseudo = document.createElement("td");
        const tdDate = document.createElement("td");

        const dt = entry.completedAt ? new Date(entry.completedAt) : null;
        const dateText =
          dt && !isNaN(dt.getTime()) ? dt.toLocaleString("fr-FR") : "—";

        tdEgg.textContent = egg.id;
        tdRank.textContent = String(idx + 1);
        tdPseudo.textContent = entry.pseudo || "";
        tdDate.textContent = dateText;

        tr.appendChild(tdEgg);
        tr.appendChild(tdRank);
        tr.appendChild(tdPseudo);
        tr.appendChild(tdDate);
        tbody.appendChild(tr);
      });
    });
  } catch (e) {
    console.error("Erreur refreshEeCompletions", e);
  }
}

// --- RESET SERVEUR (SOFT) ---
function resetServerSoft() {
  if (!window.socket) {
    showNotification("❌ Socket non initialisée", "error");
    return;
  }
  if (
    !confirm(
      "⚠️ Cette action va effacer toutes les stats, badges attribués, etc. (hors Pixelwar, tags, shop).\n\nContinuer ?",
    )
  )
    return;
  window.socket.emit("admin:server:softReset");
  showNotification("⏳ Reset serveur en cours...", "info");
}

// Écouteur unique pour le résultat du reset serveur (évite doublons)
if (window.socket && !window._softResetListenerAdded) {
  window._softResetListenerAdded = true;
  window.socket.on("admin:server:softReset:result", (res) => {
    if (!res) return;
    if (res.success) {
      showNotification("✅ Reset serveur effectué avec succès", "success");
    } else {
      showNotification(
        "❌ Erreur reset serveur : " + (res.error || "inconnue"),
        "error",
      );
    }
  });
}

async function resetEeProgress() {
  // Résultat reset serveur (soft)
  socket.on("admin:server:softReset:result", (res) => {
    if (!res) return;
    if (res.success) {
      showNotification("✅ Reset serveur effectué avec succès", "success");
    } else {
      showNotification(
        "❌ Erreur reset serveur : " + (res.error || "inconnue"),
        "error",
      );
    }
  });
  const pseudo = (
    document.getElementById("ee-reset-pseudo")?.value || ""
  ).trim();
  const eggId = (document.getElementById("ee-reset-id")?.value || "").trim();

  if (!pseudo || !eggId) {
    showNotification("Pseudo/EE manquants", "error");
    return;
  }

  if (!confirm(`Reset EE ${eggId} pour ${pseudo} ?`)) return;

  try {
    const res = await fetch("/api/admin/ee/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, eggId }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showNotification("EE reset OK", "success");
      refreshEeCompletions();
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error("Erreur resetEeProgress", e);
    showNotification("Erreur serveur", "error");
  }
}

async function handlePasswordRequest(requestId, approve) {
  const action = approve ? "approuver" : "rejeter";
  if (
    !confirm(
      `Voulez-vous vraiment ${action} cette demande de changement de mot de passe ?`,
    )
  )
    return;

  try {
    const res = await fetch("/api/admin/approve-password-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, approve }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showNotification(
        `Demande ${approve ? "approuvée" : "rejetée"} avec succès`,
        "success",
      );
      refreshPasswordRequests();
    } else {
      showNotification(`Erreur: ${data.message || "inconnue"}`, "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// Initial load
refreshTransactions();
refreshGameMoneyRewards();
refreshPasswordRequests();
refreshPfpRequests();
refreshCustomBadgeRequests();

if (!isModeratorPanel) {
  refreshBadges();
  refreshShopCatalog();
  refreshClickerAntiCheatSettings();
  refreshEeCompletions();
  refreshAdminUsersBirthdays();
}

const shopSelect = document.getElementById("shopItemSelect");
if (shopSelect) {
  shopSelect.addEventListener("change", () => {
    const id = shopSelect.value;
    const item = _shopCatalogCache.find((x) => x && x.id === id);
    fillShopForm(item);
  });
}
refreshDailyCap();

let adminUsersBirthdaysCache = [];

function formatBirthDateForAdminList(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Non renseignée";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }
  return raw;
}

function getBirthdayStatusLabel(entry) {
  if (!entry || !entry.hasBirthDate) {
    return '<span style="color:#9a9a9a;">Non renseigné</span>';
  }
  return entry.birthdayPassed
    ? '<span style="color:#17b26a;font-weight:600;">Passé</span>'
    : '<span style="color:#f79009;font-weight:600;">Pas encore</span>';
}

function getBirthdayGiftActionHtml(entry) {
  const pseudo = String(entry?.pseudo || "");
  const hasBirthDate = !!entry?.hasBirthDate;
  const birthdayPassed = !!entry?.birthdayPassed;
  const giftedThisYear = !!entry?.giftedThisYear;
  const canGift = !!entry?.canGift;

  let reason = "";
  if (!hasBirthDate) {
    reason = "Date non renseignée";
  } else if (!birthdayPassed) {
    reason = "Anniversaire pas encore passé";
  } else if (giftedThisYear) {
    reason = "Déjà donné cette année";
  }

  return `
                <button
                    type="button"
                    class="btn"
                    data-birthday-gift-pseudo="${pseudo}"
                    ${canGift ? "" : "disabled"}
                    title="${canGift ? "Envoyer le cadeau anniversaire" : reason}">
                    <i class="fa-solid fa-gift"></i>
                    Cadeau
                </button>
            `;
}

function renderAdminUsersBirthdays(list) {
  const tbody = document.getElementById("adminBirthdaysList");
  if (!tbody) return;

  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#9a9a9a;">Aucun utilisateur</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      (entry) => `
                <tr>
                    <td>${entry.pseudo || "—"}</td>
                    <td>${formatBirthDateForAdminList(entry.birthDate)}</td>
                    <td>${getBirthdayStatusLabel(entry)}</td>
                    <td>${getBirthdayGiftActionHtml(entry)}</td>
                </tr>
            `,
    )
    .join("");
}

async function giftBirthdayBundle(pseudoRaw) {
  const pseudo = String(pseudoRaw || "").trim();
  if (!pseudo) return;

  const ok = confirm(
    `Envoyer le cadeau anniversaire à ${pseudo} ?\n\n` +
      "- 50 K clicks\n" +
      "- 1 K monnaie\n" +
      "- 1 vie revive\n" +
      "- badge Anniversaire 🎂",
  );
  if (!ok) return;

  try {
    const res = await fetch("/api/admin/users-birthdays/gift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showNotification(data?.message || "Erreur envoi cadeau", "error");
      return;
    }

    showNotification(`✅ Cadeau envoyé à ${pseudo}`, "success");
    await refreshUserInfoPanel(pseudo);
    await refreshAdminUsersBirthdays();
  } catch (err) {
    console.error("Erreur giftBirthdayBundle", err);
    showNotification("Erreur serveur (cadeau anniversaire)", "error");
  }
}

function applyAdminUsersBirthdaysFilter() {
  const input = document.getElementById("adminBirthdaysSearchInput");
  const query = String(input?.value || "")
    .trim()
    .toLowerCase();
  if (!query) {
    renderAdminUsersBirthdays(adminUsersBirthdaysCache);
    return;
  }

  const filtered = adminUsersBirthdaysCache.filter((entry) =>
    String(entry?.pseudo || "")
      .toLowerCase()
      .includes(query),
  );
  renderAdminUsersBirthdays(filtered);
}

async function refreshAdminUsersBirthdays() {
  if (isModeratorPanel) return;

  try {
    const res = await fetch("/api/admin/users-birthdays");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showNotification(
        data?.message || "Erreur chargement anniversaires",
        "error",
      );
      return;
    }

    adminUsersBirthdaysCache = Array.isArray(data?.users) ? data.users : [];
    applyAdminUsersBirthdaysFilter();
  } catch (err) {
    console.error("Erreur refreshAdminUsersBirthdays", err);
    showNotification("Erreur serveur (liste anniversaires)", "error");
  }
}

const adminBirthdaysSearchInput = document.getElementById(
  "adminBirthdaysSearchInput",
);
if (adminBirthdaysSearchInput) {
  adminBirthdaysSearchInput.addEventListener(
    "input",
    applyAdminUsersBirthdaysFilter,
  );
}

const adminBirthdaysList = document.getElementById("adminBirthdaysList");
if (adminBirthdaysList) {
  adminBirthdaysList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-birthday-gift-pseudo]");
    if (!btn) return;
    giftBirthdayBundle(btn.dataset.birthdayGiftPseudo);
  });
}

// Recherche utilisateur
document
  .getElementById("userSearchInput")
  .addEventListener("input", async (e) => {
    const pseudo = e.target.value.trim();
    if (!pseudo) {
      document.getElementById("userInfoDisplay").classList.remove("visible");
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (!res.ok) {
        document.getElementById("userInfoDisplay").classList.remove("visible");
        return;
      }

      const data = await res.json();
      displayUserInfo(data);
    } catch (err) {
      console.error(err);
      showNotification("⚠️ Erreur lors de la recherche", "error");
    }
  });

function renderClickerUpgradeAdminRows(data) {
  const catalog = Array.isArray(data?.clickerUpgradeCatalog)
    ? data.clickerUpgradeCatalog
    : [];
  const upgrades =
    data?.clickerUpgrades && typeof data.clickerUpgrades === "object"
      ? data.clickerUpgrades
      : {};

  if (!catalog.length) {
    return `<span style="color:var(--primary-color)">Aucun upgrade disponible</span>`;
  }

  return catalog
    .map((u) => {
      const id = String(u?.id || "");
      const name = String(u?.name || id || "Upgrade");
      const maxLevel = Math.max(0, Number(u?.maxLevel || 0));
      const level = Math.max(0, Number(upgrades[id] || 0));
      return `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid #2f2f2f;padding:8px 10px;margin-bottom:8px;">
                        <div>
                            <div style="font-weight:600;">${name}</div>
                            <div style="font-size:0.9rem;color:#9a9a9a;">ID: ${id} • Lvl ${level}/${maxLevel}</div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button type="button" class="btn btn-red" data-clicker-upgrade-action="decrease" data-upgrade-id="${id}" data-upgrade-name="${name}" data-pseudo="${data.pseudo || ""}">
                                <i class="fa-solid fa-minus"></i>
                                -1
                            </button>
                            <button type="button" class="btn" data-clicker-upgrade-action="increase" data-upgrade-id="${id}" data-upgrade-name="${name}" data-pseudo="${data.pseudo || ""}">
                                <i class="fa-solid fa-plus"></i>
                                +1
                            </button>
                            <button type="button" class="btn btn-red" data-clicker-upgrade-action="reset" data-upgrade-id="${id}" data-upgrade-name="${name}" data-pseudo="${data.pseudo || ""}">
                                <i class="fa-solid fa-rotate-left"></i>
                                Reset
                            </button>
                        </div>
                    </div>
                `;
    })
    .join("");
}

function displayUserInfo(data) {
  const display = document.getElementById("userInfoDisplay");
  const pseudoEl = document.getElementById("userInfoPseudo");
  const statsEl = document.getElementById("userInfoStats");

  pseudoEl.innerHTML = `<i class="fa-solid fa-user"></i> ${data.pseudo}`;
  const metaHtml = `
                <div class="user-meta">
                    <div class="user-stat">
                        <span class="label">ID:</span>
                        <span class="value">${data.id || "—"}</span>
                    </div>
                    <div class="user-stat">
                        <span class="label">Créé le:</span>
                        <span class="value">${data.createdAt ? new Date(data.createdAt).toLocaleString() : "—"}</span>
                    </div>
                    <div class="user-stat">
                        <span class="label">Créé par (IP):</span>
                        <span class="value">${data.createdFromIp || "—"}</span>
                    </div>
                </div>
            `;

  statsEl.innerHTML = `
                <div class="user-stat">
                    <span class="label">Clicks (Clicker):</span>
                    <span class="value">${data.clicks || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Upgrades Clicker (admin):</span>
                    <div style="margin-top:8px;">${renderClickerUpgradeAdminRows(data)}</div>
                    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        <button type="button" class="btn" id="maxAllClickerUpgradesBtn" data-pseudo="${data.pseudo || ""}">
                            <i class="fa-solid fa-angles-up"></i>
                            Max tous les upgrades
                        </button>
                        <button type="button" class="btn btn-red" id="resetAllClickerUpgradesBtn" data-pseudo="${data.pseudo || ""}">
                            <i class="fa-solid fa-broom"></i>
                            Reset tous les upgrades
                        </button>
                    </div>
                </div>
                <div class="user-stat">
                    <span class="label">Money:</span>
                    <span class="value">${data.money || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Tokens:</span>
                    <span class="value">${data.tokens || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Vies Revive:</span>
                    <span class="value">${data.reviveLives || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">CPS auto (bonus admin):</span>
                    <span class="value" id="adminAutoCpsValue">${Number.isFinite(Number(data.adminAutoCps)) ? Math.max(0, Math.floor(Number(data.adminAutoCps))) : 0}</span>
                    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label style="font-size:0.9rem;margin-right:6px;">Montant:</label>
                            <input type="number" id="adminAutoCpsInput" min="1" step="1" value="1" style="width:90px;padding:6px;background:var(--bg-color);border:1px solid #444;color:var(--fg-color);" />
                        </div>
                        <button type="button" class="btn" id="addAdminAutoCpsBtn" data-pseudo="${data.pseudo || ""}">
                            <i class="fa-solid fa-plus"></i>
                            Ajouter
                        </button>
                        <button type="button" class="btn btn-red" id="resetAdminAutoCpsBtn" data-pseudo="${data.pseudo || ""}">
                            <i class="fa-solid fa-rotate-left"></i>
                            Reset
                        </button>
                    </div>
                </div>
                <div class="user-stat">
                    <span class="label">Score Dino:</span>
                    <span class="value">${data.dinoScore || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Score Flappy:</span>
                    <span class="value">${data.flappyScore || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Victoires UNO:</span>
                    <span class="value">${data.unoWins || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Victoires P4:</span>
                    <span class="value">${data.p4Wins || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Score Block Blast:</span>
                    <span class="value">${data.blockblastScore || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Score 2048:</span>
                    <span class="value">${data.score2048 || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Sudoku (grilles complétées):</span>
                    <span class="value">${data.sudokuCompleted || 0}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Roulette (W/L):</span>
                    <span class="value">${data.rouletteStats ? `${data.rouletteStats.wins || 0} / ${data.rouletteStats.losses || 0}` : "0 / 0"}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Slots (W/L):</span>
                    <span class="value">${data.slotsStats ? `${data.slotsStats.wins || 0} / ${data.slotsStats.losses || 0}` : "0 / 0"}</span>
                </div>
                <div class="user-stat">
                    <span class="label">Motus (Mots/Essais):</span>
                    <span class="value">${
                      data.motusScores
                        ? typeof data.motusScores === "object"
                          ? `${data.motusScores.words} / ${data.motusScores.tries}`
                          : `${data.motusScores} / ?`
                        : "0 / 0"
                    }</span>
                    <span class="label">Motus mots trouvés / mots totaux :</span>
                    <span class="value">${
                      data.motusScores
                        ? typeof data.motusScores === "object"
                          ? `${data.motusScores.words} / ${data.motusTotalWords || "?"}`
                          : `${data.motusScores} / ?`
                        : "0 / 0"
                    }</span>
                        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        <button type="button" class="btn btn-red" id="resetMotusBtn"> 
                            <i class="fa-solid fa-rotate-left"></i>
                            Reset mots trouvés (Motus)
                        </button>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label style="font-size:0.9rem;margin-right:6px;">Essais:</label>
                            <input type="number" id="motusTriesInput" min="0" step="1" value="${data.motusScores && typeof data.motusScores === "object" && typeof data.motusScores.tries === "number" ? data.motusScores.tries : 0}" style="width:80px;padding:6px;background:var(--bg-color);border:1px solid #444;color:var(--fg-color);" />
                            <button type="button" class="btn" id="modifyMotusBtn" data-pseudo="${data.pseudo || ""}">
                                <i class="fa-solid fa-pen"></i>
                                Modifier
                            </button>
                        </div>
                    </div>
                </div>
                <div class="user-stat">
                    <span class="label">Médailles:</span>
                    <div class="medals-wrap admin-medals-wrap">
                        ${
                          data.medals && data.medals.length > 0
                            ? data.medals
                                .map((m) => {
                                  let styleStr = "";
                                  let innerContent = "";
                                  const isSpecial = [
                                    "Bronze",
                                    "Argent",
                                    "Or",
                                    "Diamant",
                                    "Rubis",
                                    "Saphir",
                                  ].includes(m.name);

                                  if (m.colors && m.colors.length) {
                                    if (
                                      m.name.startsWith("Médaille") ||
                                      m.name === "Tricheur"
                                    ) {
                                      m.colors.forEach(
                                        (c, i) =>
                                          (styleStr += `--grad${i + 1}: ${c}; `),
                                      );
                                    } else if (
                                      !isSpecial &&
                                      m.name !== "Légendaire" &&
                                      m.name !== "Rainbow"
                                    ) {
                                      const bg =
                                        m.colors.length > 1
                                          ? `linear-gradient(120deg, ${m.colors[0]} 30%, ${m.colors[1]} 60%)`
                                          : m.colors[0];
                                      styleStr = `background: ${bg} !important; border: 5px solid #fff;`;
                                    }
                                  }

                                  if (m.name === "Légendaire") {
                                    innerContent =
                                      '<div class="medal-index">7</div>';
                                  } else if (m.name.startsWith("Médaille")) {
                                    const num = m.name.replace("Médaille ", "");
                                    innerContent = `<div class="medal-index">${num}</div>`;
                                  } else if (m.name === "Tricheur") {
                                    innerContent =
                                      '<div class="medal-index"><i class="fa-solid fa-ban"></i></div>';
                                  }

                                  const titleContent =
                                    m.colors && m.colors.length > 0
                                      ? `${m.name}\n${m.colors.join("\n")}`
                                      : m.name;

                                  return `<div class="medal shown" data-name="${m.name}" style="${styleStr}" title="${titleContent}">${innerContent.replace("Prestige - ", "")}</div>`;
                                })
                                .join("")
                            : '<span style="color:var(--primary-color)">0</span>'
                        }
                    </div>
                    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                        <button type="button" class="btn btn-red" id="resetMedalsBtn" data-pseudo="${data.pseudo || ""}">
                            <i class="fa-solid fa-rotate-left"></i>
                            Reset médailles + clicks
                        </button>
                    </div>
                </div>
                <div class="user-stat">
                    <span class="label">Tag:</span>
                    <span class="value">${
                      typeof data.tag === "object" && data.tag !== null
                        ? `<span style="color:${data.tag.color || "inherit"}">${data.tag.text}</span>`
                        : data.tag || "—"
                    }</span>
                </div>
                <div class="user-stat">
                    <span class="label">Couleurs custom PixelWar:</span>
                    <span class="value">${Array.isArray(data.customPixelColors) && data.customPixelColors.length ? data.customPixelColors.join(", ") : "Aucune"}</span>
                </div>
            `;

  pwdLength = data.password ? data.password.length : 0;
  hashedPwdLength = data.password ? data.passwordHash.length : 0;

  const pwdHtml = `
                <div class="user-passwords">
                    <div class="user-stat">
                        <span class="label">MPD :</span>
                        <span class="value" id="pwdPlain">${data.password ? "•".repeat(pwdLength) : "—"}</span>
                    </div>
                    <div class="user-stat">
                        <span class="label">MDP HASH :</span>
                        <span class="value" id="pwdHash">${data.passwordHash ? "•".repeat(hashedPwdLength) : "—"}</span>
                    </div>
                    <div class="action-buttons">
                        <button type="button" class="btn" id="togglePwdBtn">Afficher les mdp</button>
                    </div>
                </div>
            `;

  // Préfixer par les meta si disponibles
  statsEl.innerHTML = metaHtml + pwdHtml + statsEl.innerHTML;

  display.classList.add("visible");

  // Attacher le comportement du bouton pour afficher/masquer les mdp
  const toggleBtn = document.getElementById("togglePwdBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const plainEl = document.getElementById("pwdPlain");
      const hashEl = document.getElementById("pwdHash");
      if (!plainEl || !hashEl) return;

      const visible = plainEl.dataset.visible === "1";
      if (visible) {
        plainEl.textContent = data.password ? "••••••" : "—";
        hashEl.textContent = data.passwordHash ? "••••••" : "—";
        plainEl.dataset.visible = "0";
        toggleBtn.textContent = "Afficher les mdp";
      } else {
        plainEl.textContent = data.password || "—";
        hashEl.textContent = data.passwordHash || "—";
        plainEl.dataset.visible = "1";
        toggleBtn.textContent = "Masquer les mdp";
      }
    });
    // initialiser état masqué
    const plainElInit = document.getElementById("pwdPlain");
    if (plainElInit) plainElInit.dataset.visible = "0";
  }

  // Attacher listeners pour Motus (reset + modifier essais)
  const resetBtn = document.getElementById("resetMotusBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => resetMotusFoundWords(data.pseudo));
  }

  const modBtn = document.getElementById("modifyMotusBtn");
  if (modBtn) {
    modBtn.addEventListener("click", () =>
      modifyMotusTries(modBtn.dataset.pseudo || data.pseudo),
    );
  }

  const resetMedalsBtn = document.getElementById("resetMedalsBtn");
  if (resetMedalsBtn) {
    resetMedalsBtn.addEventListener("click", () =>
      resetUserMedals(resetMedalsBtn.dataset.pseudo || data.pseudo),
    );
  }

  const addCpsBtn = document.getElementById("addAdminAutoCpsBtn");
  if (addCpsBtn) {
    addCpsBtn.addEventListener("click", () =>
      addAdminAutoCps(addCpsBtn.dataset.pseudo || data.pseudo),
    );
  }
  const resetCpsBtn = document.getElementById("resetAdminAutoCpsBtn");
  if (resetCpsBtn) {
    resetCpsBtn.addEventListener("click", () =>
      resetAdminAutoCps(resetCpsBtn.dataset.pseudo || data.pseudo),
    );
  }

  const clickerUpgradeButtons = statsEl.querySelectorAll(
    "[data-clicker-upgrade-action]",
  );
  clickerUpgradeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      manageClickerUpgradeLevel({
        pseudo: btn.dataset.pseudo || data.pseudo,
        upgradeId: btn.dataset.upgradeId,
        upgradeName:
          btn.dataset.upgradeName || btn.dataset.upgradeId || "upgrade",
        action: btn.dataset.clickerUpgradeAction,
      });
    });
  });

  const resetAllClickerUpgradesBtn = document.getElementById(
    "resetAllClickerUpgradesBtn",
  );
  if (resetAllClickerUpgradesBtn) {
    resetAllClickerUpgradesBtn.addEventListener("click", () => {
      resetAllClickerUpgrades(
        resetAllClickerUpgradesBtn.dataset.pseudo || data.pseudo,
      );
    });
  }

  const maxAllClickerUpgradesBtn = document.getElementById(
    "maxAllClickerUpgradesBtn",
  );
  if (maxAllClickerUpgradesBtn) {
    maxAllClickerUpgradesBtn.addEventListener("click", () => {
      maxAllClickerUpgrades(
        maxAllClickerUpgradesBtn.dataset.pseudo || data.pseudo,
      );
    });
  }
}

async function refreshUserInfoPanel(pseudoHint = "") {
  try {
    const searchInput = document.getElementById("userSearchInput");
    const pseudoFromInput = (searchInput?.value || "").trim();
    const pseudoFromHint = String(pseudoHint || "").trim();
    const pseudo = (pseudoFromHint || pseudoFromInput).trim();

    if (!pseudo || pseudo.toUpperCase() === "ALL") return;

    const res = await fetch(
      `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
    );
    if (!res.ok) return;
    const data = await res.json();
    displayUserInfo(data);
  } catch (e) {
    console.error("Erreur refreshUserInfoPanel", e);
  }
}

async function handleAdminStatSuccess(
  data,
  pseudo,
  { clearPseudo = false } = {},
) {
  showNotification(`✅ ${data?.message || "Action effectuée"}`, "success");
  if (socket) socket.emit("admin:refresh");
  await refreshUserInfoPanel(pseudo);

  if (clearPseudo) {
    const userInput = document.getElementById("modifyUser");
    if (userInput) userInput.value = "";
  }

  const valueInput = document.getElementById("modifyStatValue");
  if (valueInput) valueInput.value = "";
}

async function adminPostJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function giveReviveLives() {
  const pseudo = String(
    document.getElementById("reviveLivesUser")?.value || "",
  ).trim();
  const amount = Number.parseInt(
    document.getElementById("reviveLivesAmount")?.value,
    10,
  );

  if (!pseudo) {
    showNotification("Pseudo manquant", "error");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    showNotification("Nombre de vies invalide", "error");
    return;
  }

  const ok = confirm(`Donner ${amount} vie(s) de revive à ${pseudo} ?`);
  if (!ok) return;

  try {
    const { res, data } = await adminPostJson("/api/admin/revive/give-lives", {
      pseudo,
      amount,
    });

    if (!res.ok) {
      showNotification(data?.message || "Erreur", "error");
      return;
    }

    showNotification(`✅ ${data?.message || "Vies ajoutées"}`, "success");
    await refreshUserInfoPanel(pseudo);
  } catch (err) {
    console.error(err);
    showNotification("Erreur serveur", "error");
  }
}

async function manageClickerUpgradeLevel({
  pseudo,
  upgradeId,
  upgradeName,
  action,
}) {
  const p = String(pseudo || "").trim();
  const id = String(upgradeId || "").trim();
  const mode = String(action || "")
    .trim()
    .toLowerCase();
  const name = String(upgradeName || id || "upgrade").trim();

  if (!p || !id || !["increase", "decrease", "reset"].includes(mode)) {
    showNotification(
      "⚠️ Données invalides pour la modification d'upgrade",
      "error",
    );
    return;
  }

  if (mode === "reset") {
    const ok = confirm(`Reset le niveau de "${name}" pour ${p} ?`);
    if (!ok) return;
  }

  try {
    const { res, data } = await adminPostJson(
      "/api/admin/clicker/upgrades/level",
      {
        pseudo: p,
        upgradeId: id,
        action: mode,
      },
    );

    if (!res.ok) {
      showNotification(
        `❌ ${data?.message || "Erreur lors de la modification de l'upgrade"}`,
        "error",
      );
      return;
    }

    const level = Number(data?.level || 0);
    const maxLevel = Number(data?.maxLevel || 0);
    showNotification(
      `✅ ${name}: niveau ${level}/${maxLevel} (${p})`,
      "success",
    );
    await refreshUserInfoPanel(p);
  } catch (err) {
    console.error(err);
    showNotification(
      "⚠️ Erreur serveur lors de la modification de l'upgrade",
      "error",
    );
  }
}

async function resetAllClickerUpgrades(pseudo) {
  const p = String(pseudo || "").trim();
  if (!p) {
    showNotification("⚠️ Pseudo manquant", "error");
    return;
  }

  const ok = confirm(`Reset tous les upgrades clicker de ${p} ?`);
  if (!ok) return;

  try {
    const { res, data } = await adminPostJson(
      "/api/admin/clicker/upgrades/reset-all",
      {
        pseudo: p,
      },
    );

    if (!res.ok) {
      showNotification(
        `❌ ${data?.message || "Erreur lors du reset des upgrades"}`,
        "error",
      );
      return;
    }

    showNotification(
      `✅ Tous les upgrades clicker ont été reset pour ${p}`,
      "success",
    );
    await refreshUserInfoPanel(p);
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur serveur lors du reset des upgrades", "error");
  }
}

async function maxAllClickerUpgrades(pseudo) {
  const p = String(pseudo || "").trim();
  if (!p) {
    showNotification("⚠️ Pseudo manquant", "error");
    return;
  }

  const ok = confirm(
    `Mettre tous les upgrades clicker au niveau max pour ${p} ?`,
  );
  if (!ok) return;

  try {
    const { res, data } = await adminPostJson(
      "/api/admin/clicker/upgrades/max-all",
      {
        pseudo: p,
      },
    );

    if (!res.ok) {
      showNotification(
        `❌ ${data?.message || "Erreur lors du max des upgrades"}`,
        "error",
      );
      return;
    }

    showNotification(
      `✅ Tous les upgrades clicker ont été maxés pour ${p}`,
      "success",
    );
    await refreshUserInfoPanel(p);
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur serveur lors du max des upgrades", "error");
  }
}

async function addAdminAutoCps(pseudo) {
  if (!pseudo) return;
  const input = document.getElementById("adminAutoCpsInput");
  const amount = input ? parseInt(input.value, 10) : 0;
  if (!Number.isFinite(amount) || amount <= 0) {
    showNotification("⚠️ Montant invalide", "error");
    return;
  }

  try {
    const res = await fetch("/api/admin/clicker/admin-auto-cps/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, amount }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showNotification(
        `✅ Bonus CPS admin mis à ${data.adminAutoCps} pour ${pseudo}`,
        "success",
      );

      // refresh la fiche utilisateur
      const s = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (s.ok) {
        const refreshed = await s.json();
        displayUserInfo(refreshed);
      }
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function resetAdminAutoCps(pseudo) {
  if (!pseudo) return;

  if (!confirm(`Reset le bonus CPS admin de ${pseudo} (remise à 0) ?`)) return;

  try {
    const res = await fetch("/api/admin/clicker/admin-auto-cps/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      showNotification(`✅ Bonus CPS admin reset pour ${pseudo}`, "success");

      // refresh la fiche utilisateur
      const s = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (s.ok) {
        const refreshed = await s.json();
        displayUserInfo(refreshed);
      }
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function resetUserMedals(pseudo) {
  if (!pseudo) return;

  if (!confirm(`Reset les médailles de ${pseudo} et mettre ses clicks à 0 ?`))
    return;

  try {
    const res = await fetch("/api/admin/reset-medals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showNotification(`✅ ${data.message || "OK"}`, "success");
      if (socket) socket.emit("admin:refresh");

      // refresh la fiche utilisateur
      const s = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (s.ok) {
        const refreshed = await s.json();
        displayUserInfo(refreshed);
      }
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

async function resetMotusFoundWords(pseudo) {
  if (!pseudo) return;

  const ok = confirm(
    `Reset les mots trouvés Motus de ${pseudo} ?\n\nCela remet aussi à zéro ses essais et sa liste de mots déjà trouvés.`,
  );
  if (!ok) return;

  try {
    const res = await fetch("/api/admin/motus/reset-found-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo }),
    });

    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload.success) {
      showNotification(`✅ Motus reset pour ${pseudo}`, "success");

      // refresh la fiche utilisateur
      const s = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (s.ok) {
        const refreshed = await s.json();
        displayUserInfo(refreshed);
      }
    } else {
      showNotification(`Erreur: ${payload.message || "inconnue"}`, "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// Modifier le nombre d'essais Motus pour un joueur
async function modifyMotusTries(pseudo) {
  try {
    if (typeof pseudo === "string") {
      pseudo = pseudo.trim();
      if (
        (pseudo.startsWith('"') && pseudo.endsWith('"')) ||
        (pseudo.startsWith("'") && pseudo.endsWith("'"))
      ) {
        pseudo = pseudo.slice(1, -1);
      }
    }
  } catch (e) {
    /* ignore */
  }

  if (!pseudo) {
    const pEl = document.getElementById("userInfoPseudo");
    if (pEl) {
      const txt = pEl.textContent || "";
      pseudo = txt.replace(/^[^\s]+\s*/, "").trim();
    }
  }

  const input = document.getElementById("motusTriesInput");
  if (!pseudo || !input) {
    showNotification(
      "⚠️ Veuillez sélectionner un utilisateur et renseigner les essais",
      "error",
    );
    return;
  }

  const tries = parseInt(input.value, 10);
  if (isNaN(tries) || tries < 0) {
    showNotification("⚠️ Valeur d'essais invalide", "error");
    return;
  }

  if (!confirm(`Modifier le nombre d'essais Motus de ${pseudo} à ${tries} ?`))
    return;

  try {
    const res = await fetch("/api/admin/modify-tries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, tries }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showNotification("✅ Essais Motus modifiés", "success");
      // refresh la fiche utilisateur
      const s = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (s.ok) {
        const refreshed = await s.json();
        displayUserInfo(refreshed);
      }
    } else {
      showNotification(data.message || "Erreur", "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("Erreur serveur", "error");
  }
}

// Setup Stat Field Selector
const complexStats = {
  blackjackStats: [
    { value: "wins", label: "Victoires" },
    { value: "losses", label: "Défaites" },
    { value: "draws", label: "Égalités" },
    { value: "blackjacks", label: "Blackjacks" },
    { value: "doubles", label: "Doubles" },
  ],
  coinflipStats: [
    { value: "wins", label: "Victoires" },
    { value: "losses", label: "Défaites" },
    { value: "allIns", label: "All-ins" },
    { value: "highestWin", label: "Plus gros gain" },
    { value: "totalWon", label: "Total Gagné" },
    { value: "totalLost", label: "Total Perdu" },
  ],
  rouletteStats: [
    { value: "gamesPlayed", label: "Parties" },
    { value: "wins", label: "Victoires" },
    { value: "losses", label: "Défaites" },
    { value: "biggestBet", label: "Plus grosse mise" },
    { value: "biggestWin", label: "Plus gros gain net" },
    { value: "totalWon", label: "Total gagné net" },
    { value: "totalLost", label: "Total perdu" },
  ],
  slotsStats: [
    { value: "gamesPlayed", label: "Parties" },
    { value: "wins", label: "Victoires" },
    { value: "losses", label: "Défaites" },
    { value: "biggestBet", label: "Plus grosse mise" },
    { value: "biggestWin", label: "Plus gros gain net" },
    { value: "totalWon", label: "Total gagné net" },
    { value: "totalLost", label: "Total perdu" },
  ],
  wallets: [
    { value: "money", label: "Money" },
    { value: "tokens", label: "Tokens" },
  ],
  pixelwar: [
    { value: "pixels", label: "Pixels (Stock)" },
    { value: "maxPixels", label: "Stockage Max" },
  ],
  aimTrainerScores: [
    { value: "15", label: "15 secondes" },
    { value: "30", label: "30 secondes" },
    { value: "60", label: "1 minute" },
  ],
};

const modifyStatTypeSelect = document.getElementById("modifyStatType");
if (modifyStatTypeSelect) {
  modifyStatTypeSelect.addEventListener("change", function () {
    const val = this.value;
    const container = document.getElementById("statFieldContainer");
    const select = document.getElementById("modifyStatField");

    select.innerHTML = "";

    if (complexStats[val]) {
      container.style.display = "block";
      complexStats[val].forEach((opt) => {
        const el = document.createElement("option");
        el.value = opt.value;
        el.innerText = opt.label;
        select.appendChild(el);
      });
    } else {
      container.style.display = "none";
    }
  });
}

// Modifier Stat
async function modifyStat() {
  const pseudo = document.getElementById("modifyUser").value.trim();
  const statType = document.getElementById("modifyStatType").value;
  let field = null;
  let value = parseInt(document.getElementById("modifyStatValue").value);
  if ((isNaN(value) || value === null) && statType === "motusScores") {
    const triesVal = parseInt(
      document.getElementById("modifyStatTries").value,
      10,
    );
    if (!isNaN(triesVal)) {
      value = triesVal;
      field = "tries";
    }
  }
  const fieldSelect = document.getElementById("modifyStatField");
  if (document.getElementById("statFieldContainer").style.display !== "none") {
    field = fieldSelect.value;
  }

  if (!pseudo || isNaN(value)) {
    showNotification("⚠️ Veuillez remplir tous les champs", "error");
    return;
  }

  const targetAll = pseudo.toUpperCase() === "ALL";
  let confirmMsg = targetAll
    ? `Modifier ${statType} de ALL LES JOUEURS à ${value} ?`
    : `Modifier ${statType} de ${pseudo} à ${value} ?`;

  if (field) {
    confirmMsg = targetAll
      ? `Modifier ${statType}.${field} de ALL LES JOUEURS à ${value} ?`
      : `Modifier ${statType}.${field} de ${pseudo} à ${value} ?`;
  }

  if (!confirm(confirmMsg)) return;
  if (statType === "motusScores" && field === "tries") {
    if (targetAll) {
      showNotification(
        "⚠️ Modification des essais pour ALL non supportée",
        "error",
      );
      return;
    }

    try {
      const res = await fetch("/api/admin/modify-tries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo, tries: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await handleAdminStatSuccess(
          { message: "Essais Motus modifiés" },
          pseudo,
        );
      } else {
        showNotification(data.message || "Erreur", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("⚠️ Erreur lors de la modification", "error");
    }

    return;
  }

  try {
    const endpoint = targetAll
      ? "/api/admin/modify-all-users-stat"
      : "/api/admin/modify-stat";
    const body = targetAll
      ? { statType, value, field }
      : { pseudo, statType, value, field };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      await handleAdminStatSuccess(data, pseudo);
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur lors de la modification", "error");
  }
}

async function addStat() {
  const pseudo = document.getElementById("modifyUser").value.trim();
  const statType = document.getElementById("modifyStatType").value;
  let value = parseInt(document.getElementById("modifyStatValue").value);
  let field = null;
  if ((isNaN(value) || value === null) && statType === "motusScores") {
    const triesVal = parseInt(
      document.getElementById("modifyStatTries").value,
      10,
    );
    if (!isNaN(triesVal)) {
      value = triesVal;
      field = "tries";
    }
  }

  if (!pseudo || isNaN(value) || value <= 0) {
    showNotification(
      "⚠️ Veuillez remplir tous les champs avec une valeur positive",
      "error",
    );
    return;
  }
  const fieldSelect = document.getElementById("modifyStatField");
  if (
    document.getElementById("statFieldContainer") &&
    document.getElementById("statFieldContainer").style.display !== "none"
  ) {
    field = fieldSelect.value;
  }

  const targetAll = pseudo.toUpperCase() === "ALL";
  let confirmMsg = targetAll
    ? `Ajouter ${value} à ${statType} de ALL LES JOUEURS ?`
    : `Ajouter ${value} à ${statType} de ${pseudo} ?`;

  if (field) {
    confirmMsg = targetAll
      ? `Ajouter ${value} à ${statType}.${field} de ALL LES JOUEURS ?`
      : `Ajouter ${value} à ${statType}.${field} de ${pseudo} ?`;
  }

  if (!confirm(confirmMsg)) return;

  try {
    if (statType === "motusScores" && field === "tries") {
      if (targetAll) {
        showNotification("⚠️ Ajout d'essais pour ALL non supporté", "error");
        return;
      }

      const curRes = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (!curRes.ok)
        return showNotification("❌ Utilisateur introuvable", "error");
      const cur = await curRes.json().catch(() => ({}));
      const currentTries =
        cur.motusScores && typeof cur.motusScores === "object"
          ? cur.motusScores.tries || 0
          : 0;
      const newTries = Math.max(0, currentTries + value);

      const res = await fetch("/api/admin/modify-tries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo, tries: newTries }),
      });
      const data = await res.json();
      if (res.ok) {
        await handleAdminStatSuccess(
          { message: `Essais Motus augmentés (total: ${newTries})` },
          pseudo,
        );
      } else {
        showNotification(`❌ ${data.message}`, "error");
      }

      return;
    }

    const endpoint = targetAll
      ? "/api/admin/add-all-users-stat"
      : "/api/admin/add-stat";
    const body = targetAll
      ? { statType, value, field }
      : { pseudo, statType, value, field };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      await handleAdminStatSuccess(data, pseudo);
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur lors de l'ajout", "error");
  }
}

async function removeStat() {
  const pseudo = document.getElementById("modifyUser").value.trim();
  const statType = document.getElementById("modifyStatType").value;
  let value = parseInt(document.getElementById("modifyStatValue").value);
  let field = null;
  if ((isNaN(value) || value === null) && statType === "motusScores") {
    const triesVal = parseInt(
      document.getElementById("modifyStatTries").value,
      10,
    );
    if (!isNaN(triesVal)) {
      value = triesVal;
      field = "tries";
    }
  }

  if (!pseudo || isNaN(value) || value <= 0) {
    showNotification(
      "⚠️ Veuillez remplir tous les champs avec une valeur positive",
      "error",
    );
    return;
  }
  const fieldSelect = document.getElementById("modifyStatField");
  if (
    document.getElementById("statFieldContainer") &&
    document.getElementById("statFieldContainer").style.display !== "none"
  ) {
    field = fieldSelect.value;
  }

  const targetAll = pseudo.toUpperCase() === "ALL";
  let confirmMsg = targetAll
    ? `Retirer ${value} de ${statType} de ALL LES JOUEURS ?`
    : `Retirer ${value} de ${statType} de ${pseudo} ?`;

  if (field) {
    confirmMsg = targetAll
      ? `Retirer ${value} de ${statType}.${field} de ALL LES JOUEURS ?`
      : `Retirer ${value} de ${statType}.${field} de ${pseudo} ?`;
  }

  if (!confirm(confirmMsg)) return;

  try {
    if (statType === "motusScores" && field === "tries") {
      if (targetAll) {
        showNotification("⚠️ Retrait d'essais pour ALL non supporté", "error");
        return;
      }

      const curRes = await fetch(
        `/api/admin/user-info?pseudo=${encodeURIComponent(pseudo)}`,
      );
      if (!curRes.ok)
        return showNotification("❌ Utilisateur introuvable", "error");
      const cur = await curRes.json().catch(() => ({}));
      const currentTries =
        cur.motusScores && typeof cur.motusScores === "object"
          ? cur.motusScores.tries || 0
          : 0;
      const newTries = Math.max(0, currentTries - value);

      const res = await fetch("/api/admin/modify-tries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo, tries: newTries }),
      });
      const data = await res.json();
      if (res.ok) {
        await handleAdminStatSuccess(
          { message: `Essais Motus mis à jour (total: ${newTries})` },
          pseudo,
        );
      } else {
        showNotification(`❌ ${data.message}`, "error");
      }

      return;
    }

    const endpoint = targetAll
      ? "/api/admin/remove-all-users-stat"
      : "/api/admin/remove-stat";
    const body = targetAll
      ? { statType, value, field }
      : { pseudo, statType, value, field };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      await handleAdminStatSuccess(data, pseudo);
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur lors de la suppression", "error");
  }
}

// Modifier / Supprimer les best-times (snake, blockblast)
async function modifyTime() {
  const pseudo = document.getElementById("modifyUser").value.trim();
  const board = document.getElementById("modifyStatType").value;
  const time = parseInt(document.getElementById("modifyStatTime").value);

  if (!pseudo || isNaN(time) || time < 0) {
    showNotification(
      "⚠️ Veuillez entrer un pseudo et une durée valide (ms)",
      "error",
    );
    return;
  }

  const allowed = { snakeScores: "snake", blockblastScores: "blockblast" };
  if (!allowed[board]) {
    showNotification(
      "⚠️ Sélectionnez Snake ou Block Blast dans Stat ?",
      "error",
    );
    return;
  }

  if (
    !confirm(
      `Définir la durée (${time} ms) pour ${pseudo} sur ${allowed[board]} ?`,
    )
  )
    return;

  try {
    const { res, data } = await adminPostJson("/api/admin/modify-time", {
      pseudo,
      boardType: allowed[board],
      time,
    });
    if (res.ok) {
      showNotification(`✅ ${data.message}`, "success");
      if (socket) socket.emit("admin:refresh");
      await refreshUserInfoPanel(pseudo);
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("⚠️ Erreur lors de la modification du temps", "error");
  }
}

async function removeTime() {
  const pseudo = document.getElementById("modifyUser").value.trim();
  const board = document.getElementById("modifyStatType").value;

  if (!pseudo) {
    showNotification("⚠️ Veuillez entrer un pseudo", "error");
    return;
  }

  const allowed = { snakeScores: "snake", blockblastScores: "blockblast" };
  if (!allowed[board]) {
    showNotification(
      "⚠️ Sélectionnez Snake ou Block Blast dans Stat ?",
      "error",
    );
    return;
  }

  if (
    !confirm(
      `Supprimer la durée enregistrée pour ${pseudo} sur ${allowed[board]} ?`,
    )
  )
    return;

  try {
    const { res, data } = await adminPostJson("/api/admin/remove-time", {
      pseudo,
      boardType: allowed[board],
    });
    if (res.ok) {
      showNotification(`✅ ${data.message}`, "success");
      if (socket) socket.emit("admin:refresh");
      await refreshUserInfoPanel(pseudo);
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("⚠️ Erreur lors de la suppression du temps", "error");
  }
}

async function modifyTries() {
  const pseudo = document.getElementById("modifyUser").value.trim();
  const board = document.getElementById("modifyStatType").value;
  const tries = parseInt(document.getElementById("modifyStatTries").value);

  if (!pseudo || isNaN(tries) || tries < 0) {
    showNotification(
      "⚠️ Veuillez entrer un pseudo et un nombre d'essais valide",
      "error",
    );
    return;
  }

  if (board !== "motusScores") {
    showNotification("⚠️ Sélectionnez Motus dans Stat ?", "error");
    return;
  }

  if (!confirm(`Définir ${tries} essais pour ${pseudo} sur Motus ?`)) return;

  try {
    const { res, data } = await adminPostJson("/api/admin/modify-tries", {
      pseudo,
      tries,
    });
    if (res.ok) {
      showNotification(`✅ ${data.message}`, "success");
      if (socket) socket.emit("admin:refresh");
      await refreshUserInfoPanel(pseudo);
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("⚠️ Erreur lors de la modification des essais", "error");
  }
}

// Gestion des Tags
async function setTag() {
  const pseudo = document.getElementById("tagUser").value.trim();
  const tag = document.getElementById("tagValue").value.trim();

  if (!pseudo) {
    showNotification("⚠️ Veuillez entrer un pseudo", "error");
    return;
  }

  try {
    const { res, data } = await adminPostJson("/api/admin/set-tag", {
      pseudo,
      tag,
      color: "#ffffff",
    });

    if (res.ok) {
      showNotification(`✅ ${data.message}`, "success");
      await refreshUserInfoPanel(pseudo);
      document.getElementById("tagUser").value = "";
      document.getElementById("tagValue").value = "";
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur lors de la définition du tag", "error");
  }
}

async function removeTag() {
  const pseudo = document.getElementById("tagUser").value.trim();

  if (!pseudo) {
    showNotification("⚠️ Veuillez entrer un pseudo", "error");
    return;
  }

  if (!confirm(`Supprimer le tag de ${pseudo} ?`)) return;

  try {
    const { res, data } = await adminPostJson("/api/admin/remove-tag", {
      pseudo,
    });

    if (res.ok) {
      showNotification(`✅ ${data.message}`, "success");
      await refreshUserInfoPanel(pseudo);
      document.getElementById("tagUser").value = "";
      document.getElementById("tagValue").value = "";
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur lors de la suppression du tag", "error");
  }
}

// Supprimer Utilisateur
async function deleteUser() {
  const pseudo = document.getElementById("deleteUser").value.trim();

  if (!pseudo) {
    showNotification("⚠️ Veuillez entrer un pseudo", "error");
    return;
  }

  if (pseudo === "Admin") {
    showNotification("❌ Impossible de supprimer cet administrateur", "error");
    return;
  }

  if (
    !confirm(
      `⚠️ ATTENTION ⚠️\n\nSupprimer définitivement l'utilisateur "${pseudo}" ?\n\nToutes ses données seront perdues !`,
    )
  )
    return;

  try {
    const { res, data } = await adminPostJson("/api/admin/delete-user", {
      pseudo,
    });

    if (res.ok) {
      showNotification(`✅ ${data.message}`, "success");
      document.getElementById("deleteUser").value = "";
      socket.emit("admin:refresh");
      const userInfoDisplay = document.getElementById("userInfoDisplay");
      if (userInfoDisplay) userInfoDisplay.classList.remove("visible");
    } else {
      showNotification(`❌ ${data.message}`, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur lors de la suppression", "error");
  }
}

// Supprimer des Leaderboards (sans supprimer l'utilisateur)
async function clearFromLeaderboard() {
  const pseudo = document.getElementById("deleteUser").value.trim();
  const boardType = document.getElementById("clearLbType").value;
  const resetTimes =
    !!document.getElementById("clearResetTimes") &&
    document.getElementById("clearResetTimes").checked;

  if (!pseudo) {
    showNotification("⚠️ Veuillez entrer un pseudo", "error");
    return;
  }

  const labelMap = {
    all: "tous les leaderboards",
    clicker: "Clicker",
    dino: "Dino",
    flappy: "Flappy",
    subway: "Subway",
    uno: "UNO",
    p4: "P4",
    blockblast: "Block Blast",
    snake: "Snake",
    motus: "Motus",
    2048: "2048",
    blackjack: "Blackjack",
    coinflip: "Coin Flip",
    mash: "Mash",
  };

  const label = labelMap[boardType] || boardType;
  if (!confirm(`Supprimer les entrées ${label} de "${pseudo}" ?`)) return;

  try {
    const { res, data } = await adminPostJson(
      "/api/admin/clear-from-leaderboard",
      { pseudo, boardType, resetTimes },
    );
    if (res.ok) {
      showNotification(`✅ ${data.message}`, "success");
      if (socket) socket.emit("admin:refresh");
      await refreshUserInfoPanel(pseudo);
    } else {
      showNotification(
        `❌ ${data.message || "Erreur lors du nettoyage"}`,
        "error",
      );
    }
  } catch (err) {
    console.error(err);
    showNotification("⚠️ Erreur lors du nettoyage des leaderboards", "error");
  }
}

// Blacklist admin helpers
function loadBlacklist() {
  if (!socket) return;
  socket.emit("admin:blacklist:get");
}

socket &&
  socket.on &&
  socket.on("admin:blacklist:result", (res) => {
    if (!res) return;
    if (!res.success)
      return showNotification(
        `❌ ${res.message || "Erreur blacklist"}`,
        "error",
      );
    const payload =
      res.data && typeof res.data === "object" && !Array.isArray(res.data)
        ? res.data
        : {
            alwaysBlocked: Array.isArray(res.data) ? res.data : [],
            alwaysBlockedPseudos: [],
          };
    window.__adminBlacklistData = {
      alwaysBlocked: Array.isArray(payload.alwaysBlocked)
        ? payload.alwaysBlocked
        : [],
      alwaysBlockedPseudos: Array.isArray(payload.alwaysBlockedPseudos)
        ? payload.alwaysBlockedPseudos
        : [],
    };
    window.__adminBlacklistForced = Array.isArray(res.forced) ? res.forced : [];
    window.__adminBlacklistForcedPseudos = Array.isArray(res.forcedPseudos)
      ? res.forcedPseudos
      : [];
    renderBlacklist();
  });

socket &&
  socket.on &&
  socket.on("admin:blacklist:updated", (alwaysBlocked) => {
    // admin:blacklist:updated provides updated data object or alwaysBlocked array
    const payload =
      alwaysBlocked &&
      typeof alwaysBlocked === "object" &&
      !Array.isArray(alwaysBlocked)
        ? alwaysBlocked
        : {
            alwaysBlocked: Array.isArray(alwaysBlocked) ? alwaysBlocked : [],
            alwaysBlockedPseudos: [],
          };
    window.__adminBlacklistData = {
      alwaysBlocked: Array.isArray(payload.alwaysBlocked)
        ? payload.alwaysBlocked
        : [],
      alwaysBlockedPseudos: Array.isArray(payload.alwaysBlockedPseudos)
        ? payload.alwaysBlockedPseudos
        : [],
    };
    // ensure forced lists exist
    if (!Array.isArray(window.__adminBlacklistForced))
      window.__adminBlacklistForced = [];
    if (!Array.isArray(window.__adminBlacklistForcedPseudos))
      window.__adminBlacklistForcedPseudos = [];
    renderBlacklist();
    showNotification("✅ Blacklist mise à jour", "success");
  });

function renderBlacklist() {
  const data = window.__adminBlacklistData || {
    alwaysBlocked: [],
    alwaysBlockedPseudos: [],
  };
  const ipArr = Array.isArray(data.alwaysBlocked) ? data.alwaysBlocked : [];
  const pseudoArr = Array.isArray(data.alwaysBlockedPseudos)
    ? data.alwaysBlockedPseudos
    : [];
  const list = document.getElementById("blacklistList");
  const pseudoList = document.getElementById("blacklistPseudoList");
  const count = document.getElementById("blacklistCount");
  const pseudoCount = document.getElementById("blacklistPseudoCount");
  if (count) count.textContent = ipArr.length;
  if (pseudoCount) pseudoCount.textContent = pseudoArr.length;
  if (list) list.innerHTML = "";
  if (pseudoList) pseudoList.innerHTML = "";

  const forced = Array.isArray(window.__adminBlacklistForced)
    ? window.__adminBlacklistForced
    : [];
  const forcedPseudos = Array.isArray(window.__adminBlacklistForcedPseudos)
    ? window.__adminBlacklistForcedPseudos
    : [];

  if (list) {
    ipArr.forEach((ip) => {
      const tr = document.createElement("tr");
      const isForced = forced.includes(ip);
      if (isForced) {
        tr.innerHTML = `<td style="padding:6px;border:1px solid #222">${ip} <span style="color:#b00;font-weight:700;margin-left:8px">(FORCÉE)</span></td><td style="padding:6px;border:1px solid #222;text-align:right"><button class="btn" disabled style="opacity:0.5;cursor:not-allowed">Unban</button></td>`;
      } else {
        tr.innerHTML = `<td style="padding:6px;border:1px solid #222">${ip}</td><td style="padding:6px;border:1px solid #222;text-align:right"><button class="btn btn-red" onclick="removeBan('${ip}')">Unban</button></td>`;
      }
      list.appendChild(tr);
    });
  }

  if (pseudoList) {
    pseudoArr.forEach((p) => {
      const tr = document.createElement("tr");
      const isForced = forcedPseudos.some(
        (fp) =>
          fp && fp.toLowerCase && fp.toLowerCase() === String(p).toLowerCase(),
      );
      if (isForced) {
        tr.innerHTML = `<td style="padding:6px;border:1px solid #222">${p} <span style="color:#b00;font-weight:700;margin-left:8px">(FORCÉ)</span></td><td style="padding:6px;border:1px solid #222;text-align:right"><button class="btn" disabled style="opacity:0.5;cursor:not-allowed">Unban</button></td>`;
      } else {
        tr.innerHTML = `<td style="padding:6px;border:1px solid #222">${p}</td><td style="padding:6px;border:1px solid #222;text-align:right"><button class="btn btn-red" onclick="removePseudoBan('${p}')">Unban</button></td>`;
      }
      pseudoList.appendChild(tr);
    });
  }
}

function addBanFromInput() {
  const ip = document.getElementById("blacklistInput").value.trim();
  var ipv4Regex =
    /^(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipv4Regex.test(ip))
    return showNotification("⚠️ Entrez une IP IPv4 valide", "error");
  if (!ip) return showNotification("⚠️ Entrez une IP", "error");
  if (!confirm(`Bannir ${ip} ?`)) return;
  socket.emit("admin:blacklist:add", { ip });
  loadBlacklist();
  document.getElementById("blacklistInput").value = "";
}

function addPseudoBanFromInput() {
  const pseudo = document.getElementById("blacklistPseudoInput").value.trim();
  if (!pseudo) return showNotification("⚠️ Entrez un pseudo", "error");
  if (!confirm(`Bannir ${pseudo} ?`)) return;
  socket.emit("admin:blacklist:pseudo:add", { pseudo });
  loadBlacklist();
  document.getElementById("blacklistPseudoInput").value = "";
}

function removeBan(ip) {
  if (!confirm(`Retirer le ban pour ${ip} ?`)) return;
  socket.emit("admin:blacklist:remove", { ip });
}

function removePseudoBan(pseudo) {
  if (!confirm(`Retirer le ban pour ${pseudo} ?`)) return;
  socket.emit("admin:blacklist:pseudo:remove", { pseudo });
}

function disconnectOtherAdmins() {
  if (!confirm("Déconnecter toutes les autres sessions Admin ?")) return;
  socket.emit("admin:disconnect-others");
}

(function waitForSocketThenLoad() {
  const attempt = () => {
    if (socket && socket.connected) {
      loadBlacklist();
    } else {
      setTimeout(attempt, 250);
    }
  };
  attempt();
})();

// Notification Globale
function sendGlobalNotification() {
  const message = document.getElementById("notificationMessage").value.trim();
  const withCountdown = document.getElementById("countdownCheckbox").checked;

  if (!message) {
    showNotification("⚠️ Veuillez entrer un message", "error");
    return;
  }

  const countdownText = withCountdown ? "\n\n(countdown ?)" : "";
  if (
    !confirm(
      `Envoyer cette notification à tous les utilisateurs ?${countdownText}\n\n"${message}"`,
    )
  )
    return;

  socket.emit("admin:global-notification", { message, withCountdown });
  showNotification(
    `✅ Notification envoyée à tous${withCountdown ? " (avec countdown)" : ""}`,
    "success",
  );
  document.getElementById("notificationMessage").value = "";
  document.getElementById("countdownCheckbox").checked = false;
}

function showNotification(message, type = "info") {
  const variant =
    type === "error" ? "error" : type === "success" ? "success" : "info";
  if (window.PDENotifications?.showStatus) {
    window.PDENotifications.showStatus(message, variant);
    return;
  }
  const notif = document.createElement("div");
  notif.className = "notification";
  notif.textContent = message;

  if (type === "error") {
    notif.style.background = "#ff4444";
  } else if (type === "success") {
    notif.style.background = "#0f0";
  }

  document.body.appendChild(notif);

  setTimeout(() => {
    notif.remove();
  }, 4000);
}

// Gestion Tricheurs
function clearChat() {
  if (
    !confirm(
      "⚠️ Effacer tout l'historique du chat ?\nCette action est irréversible.",
    )
  )
    return;
  socket.emit("admin:chat:clear");
}

async function loadCheaters() {
  try {
    const res = await fetch("/api/admin/cheater/list");
    const cheaters = await res.json();
    const list = document.getElementById("cheaters-list");
    list.innerHTML = "";

    if (cheaters.length === 0) {
      list.innerHTML = '<li style="color: #888;">Aucun tricheur</li>';
      return;
    }

    cheaters.forEach((pseudo) => {
      const li = document.createElement("li");
      li.textContent = pseudo;
      li.style.padding = "5px";
      li.style.cursor = "pointer";
      li.onclick = () => {
        document.getElementById("cheater-pseudo").value = pseudo;
      };
      list.appendChild(li);
    });
  } catch (err) {
    console.error("Erreur chargement tricheurs", err);
  }
}

function getAntiCheatFieldMap() {
  return {
    humanPatternWindowMs: document.getElementById("ac-humanPatternWindowMs"),
    humanPatternMinSamples: document.getElementById(
      "ac-humanPatternMinSamples",
    ),
    humanFastConstAvgMs: document.getElementById("ac-humanFastConstAvgMs"),
    humanFastConstStdMs: document.getElementById("ac-humanFastConstStdMs"),
    humanVeryConstAvgMs: document.getElementById("ac-humanVeryConstAvgMs"),
    humanVeryConstStdMs: document.getElementById("ac-humanVeryConstStdMs"),
  };
}

function renderClickerAntiCheatSettings(settings) {
  const map = getAntiCheatFieldMap();
  Object.entries(map).forEach(([key, input]) => {
    if (!input) return;
    const val = Number(settings && settings[key]);
    input.value = Number.isFinite(val) ? Math.floor(val) : "";
  });
  const status = document.getElementById("ac-settings-status");
  if (status) {
    status.textContent = `État: synchronisé (${new Date().toLocaleTimeString("fr-FR")})`;
  }
}

function collectClickerAntiCheatSettingsPayload() {
  const map = getAntiCheatFieldMap();
  const payload = {};
  Object.entries(map).forEach(([key, input]) => {
    const val = Number(input?.value);
    if (Number.isFinite(val)) payload[key] = Math.floor(val);
  });
  return payload;
}

async function refreshClickerAntiCheatSettings() {
  try {
    const res = await fetch("/api/admin/clicker/anti-cheat/settings");
    const data = await res.json();
    if (!res.ok) {
      showNotification(
        `❌ ${data?.message || "Erreur chargement anti-cheat"}`,
        "error",
      );
      return;
    }
    renderClickerAntiCheatSettings(data?.settings || {});
  } catch (err) {
    console.error("Erreur refresh anti-cheat clicker", err);
    showNotification("❌ Erreur serveur anti-cheat", "error");
  }
}

async function saveClickerAntiCheatSettings() {
  const payload = collectClickerAntiCheatSettingsPayload();
  try {
    const res = await fetch("/api/admin/clicker/anti-cheat/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(
        `❌ ${data?.message || "Erreur sauvegarde anti-cheat"}`,
        "error",
      );
      return;
    }
    renderClickerAntiCheatSettings(data?.settings || payload);
    showNotification("✅ Réglages anti-cheat mis à jour", "success");
  } catch (err) {
    console.error("Erreur save anti-cheat clicker", err);
    showNotification("❌ Erreur serveur anti-cheat", "error");
  }
}

async function resetClickerAntiCheatSettings() {
  if (
    !confirm(
      "Réinitialiser les réglages anti-cheat clicker aux valeurs par défaut ?",
    )
  )
    return;

  try {
    const res = await fetch("/api/admin/clicker/anti-cheat/settings/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(
        `❌ ${data?.message || "Erreur reset anti-cheat"}`,
        "error",
      );
      return;
    }
    renderClickerAntiCheatSettings(data?.settings || {});
    showNotification("✅ Réglages anti-cheat remis par défaut", "success");
  } catch (err) {
    console.error("Erreur reset anti-cheat clicker", err);
    showNotification("❌ Erreur serveur anti-cheat", "error");
  }
}

if (
  !isModeratorPanel ||
  currentUser === "Moderateur1" ||
  currentUser === "Moderateur2"
) {
  loadCheaters();
}

async function addCheater() {
  const pseudo = document.getElementById("cheater-pseudo").value.trim();
  if (!pseudo) return showNotification("⚠️ Pseudo requis", "error");

  try {
    const res = await fetch("/api/admin/cheater/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo }),
    });
    const data = await res.json();
    if (res.ok) {
      showNotification("✅ Joueur ajouté aux tricheurs", "success");
      document.getElementById("cheater-pseudo").value = "";
      loadCheaters();
    } else {
      showNotification("❌ " + data.message, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("❌ Erreur serveur", "error");
  }
}

async function removeCheater() {
  const pseudo = document.getElementById("cheater-pseudo").value.trim();
  if (!pseudo) return showNotification("⚠️ Pseudo requis", "error");

  try {
    const res = await fetch("/api/admin/cheater/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo }),
    });
    const data = await res.json();
    if (res.ok) {
      loadCheaters();
    } else {
      showNotification("❌ " + data.message, "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("❌ Erreur serveur", "error");
  }
}

async function shutdownServer() {
  if (
    !confirm(
      "⚠️ Êtes-vous sûr de vouloir éteindre le serveur ?\nCela coupera l'accès à tout le monde.",
    )
  )
    return;

  try {
    const res = await fetch("/api/admin/shutdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ awardLeaderboardBonus: shutdownBonusEnabled }),
    });
    const data = await res.json();
    if (data.redirect) {
      window.location.replace(data.redirect);
    }
  } catch (err) {
    console.error(err);
    showNotification("❌ Erreur lors de l'arrêt", "error");
  }
}

async function resetShutdownBonusState() {
  if (
    !confirm(
      "Reset l'état des récompenses shutdown ?\nCela réactive les bonus leaderboard pour le prochain arrêt.",
    )
  )
    return;

  try {
    const res = await fetch("/api/admin/shutdown/bonus/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(
        "❌ " + (data.message || "Erreur reset bonus shutdown"),
        "error",
      );
      return;
    }
    showNotification("✅ État bonus shutdown reset", "success");
  } catch (err) {
    console.error(err);
    showNotification("❌ Erreur lors du reset bonus shutdown", "error");
  }
}

// Gestion des demandes de Tag
async function loadTagRequests() {
  const list = document.getElementById("tagRequestsList");
  try {
    const res = await fetch("/api/admin/tag/list");
    const requests = await res.json();

    if (requests.length === 0) {
      list.innerHTML = '<p style="color:#888">Aucune demande en attente.</p>';
      return;
    }

    list.innerHTML = "";
    requests.forEach((req) => {
      const div = document.createElement("div");
      div.style.border = "1px solid #333";
      div.style.padding = "10px";
      div.style.marginBottom = "5px";
      div.style.background = "rgba(0,0,0,0.3)";

      div.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <div>
                                <strong>${req.pseudo}</strong> veut le tag: <span style="color:var(--primary-color)">${req.tag}</span><br>
                                <small style="color:#aaa">${new Date(req.time).toLocaleString()}</small>
                            </div>
                            <div style="display:flex; gap:5px">
                                <button class="btn" onclick="respondTag('${req.id}', 'accept')"><i class="fa-solid fa-check"></i></button>
                                <button class="btn btn-red" onclick="respondTag('${req.id}', 'reject')"><i class="fa-solid fa-xmark"></i></button>
                            </div>
                        </div>
                    `;
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<p style="color:red">Erreur chargement.</p>';
  }
}

async function respondTag(requestId, action) {
  if (!confirm(action === "accept" ? "Accepter ce tag ?" : "Refuser ce tag ?"))
    return;

  try {
    const res = await fetch("/api/admin/tag/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
    });

    if (res.ok) {
      showNotification("✅ Réponse envoyée", "success");
      loadTagRequests();
    } else {
      showNotification("❌ Erreur", "error");
    }
  } catch (e) {
    console.error(e);
  }
}

// --- SURVEYS ---
async function createSurvey() {
  const question = document.getElementById("surveyQuestion").value.trim();
  const choicesText = document.getElementById("surveyChoices").value.trim();

  if (!question) return alert("Question requise");
  if (!choicesText) return alert("Choix requis");

  const choices = choicesText
    .split("\n")
    .map((c) => c.trim())
    .filter((c) => c);
  if (choices.length < 2) return alert("Il faut au moins 2 choix");

  try {
    const res = await fetch("/api/surveys/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, choices }),
    });

    if (res.ok) {
      showNotification("✅ Sondage créé", "success");
      document.getElementById("surveyQuestion").value = "";
      document.getElementById("surveyChoices").value = "";
      loadAdminSurveys();
    } else {
      const data = await res.json();
      alert("Erreur: " + data.message);
    }
  } catch (e) {
    console.error(e);
    alert("Erreur serveur");
  }
}

async function loadAdminSurveys() {
  try {
    const res = await fetch("/api/surveys/list");
    const surveys = await res.json();
    const list = document.getElementById("adminSurveyList");
    if (!list) return;

    const orderedSurveys = (Array.isArray(surveys) ? surveys : [])
      .slice()
      .reverse();

    const nodes = [];

    orderedSurveys.forEach((s) => {
      const div = document.createElement("div");
      div.className = "admin-item";

      const statusClass =
        s.status === "active" ? "status-active" : "status-closed";

      let votersHtml = "";
      if (s.answers && Object.keys(s.answers).length > 0) {
        votersHtml =
          '<div style="margin-top:10px; font-size:0.85rem; border-top:1px solid #333; padding-top:5px;"><strong>Détails des votes:</strong><ul style="padding-left:20px; margin:5px 0;">';

        // Grouper par choix pour une meilleure lisibilité
        const votesByChoice = {};
        s.choices.forEach((c, i) => (votesByChoice[i] = []));

        Object.entries(s.answers).forEach(([pseudo, choiceIdx]) => {
          if (votesByChoice[choiceIdx]) votesByChoice[choiceIdx].push(pseudo);
        });

        s.choices.forEach((choice, idx) => {
          const voters = votesByChoice[idx];
          if (voters && voters.length > 0) {
            votersHtml += `<li><strong>${choice}</strong> (${voters.length}): <span style="color:#aaa">${voters.join(", ")}</span></li>`;
          }
        });

        votersHtml += "</ul></div>";
      } else if (s.results && s.results.total > 0 && !s.answers) {
        votersHtml =
          '<div style="margin-top:10px; font-size:0.85rem; color:#aaa;"><i>Détails masqués ou non disponibles</i></div>';
      }

      div.innerHTML = `
                        <div>
                            <div style="font-weight:bold; color:#fff; margin-bottom: 4px;">${s.question}</div>
                            <div style="font-size:0.8rem; color:#aaa">
                                Status: <span class="${statusClass}">${s.status}</span> • 
                                Votes: ${s.results.total}
                            </div>
                            ${votersHtml}
                        </div>
                        <div style="display:flex; gap:5px; align-items: flex-start;">
                            ${
                              s.status === "active"
                                ? `<button class="btn btn-red" onclick="closeSurvey('${s.id}')" title="Clore"><i class="fa-solid fa-stop"></i></button>`
                                : ""
                            }
                            <button class="btn btn-red" onclick="deleteSurvey('${s.id}')" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `;
      nodes.push(div);
    });

    renderAdminPaginatedNodes({
      key: "adminSurveys",
      listId: "adminSurveyList",
      paginationId: "admin-surveys-pagination",
      nodes,
      emptyHtml: '<p style="color:#aaa">Aucun sondage.</p>',
    });
  } catch (e) {
    console.error(e);
  }
}

async function closeSurvey(surveyId) {
  if (!confirm("Clore ce sondage ?")) return;
  try {
    const res = await fetch("/api/surveys/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surveyId }),
    });
    if (res.ok) loadAdminSurveys();
  } catch (e) {
    console.error(e);
  }
}

async function deleteSurvey(surveyId) {
  if (!confirm("Supprimer ce sondage ?")) return;
  try {
    const res = await fetch("/api/surveys/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surveyId }),
    });
    if (res.ok) loadAdminSurveys();
  } catch (e) {
    console.error(e);
  }
}

async function toggleAdminPanel(forceShow = false) {
  const panel = document.getElementById("panel");
  const passwordBtn = document.querySelector(".password-btn");

  if (forceShow) {
    panel.classList.remove("admin-hidden");
    passwordBtn.style.display = "none";
    return;
  }

  if (panel.classList.contains("admin-hidden")) {
    requestUnlock();
  } else {
    // Lock on server
    try {
      await fetch("/api/admin/panel/lock", { method: "POST" });
      panel.classList.add("admin-hidden");
      passwordBtn.style.display = "block";
    } catch (e) {
      console.error("Lock error", e);
    }
  }
}

async function requestUnlock() {
  const { requestPassword } = await import("/js/util.js");
  const password = await requestPassword();

  if (password === null) return;

  try {
    const res = await fetch("/api/admin/panel/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.success) {
      toggleAdminPanel(true);
    } else {
      showNotification("❌ Mot de passe incorrect", "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("❌ Erreur serveur", "error");
  }
}

async function createBackup() {
  if (
    !confirm("Créer un backup manuel de toutes les stats (y compris Clicks) ?")
  )
    return;

  try {
    const res = await fetch("/api/admin/backups/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();

    if (res.ok) {
      showNotification("✅ Backup créé avec succès", "success");
      loadBackups();
    } else {
      showNotification("❌ " + data.message, "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("❌ Erreur création backup", "error");
  }
}

async function loadBackups() {
  const list = document.getElementById("backupsList");
  try {
    const res = await fetch("/api/admin/backups/list");
    const backups = await res.json();

    if (backups.length === 0) {
      list.innerHTML = '<p style="color:#888">0 backup.</p>';
      return;
    }

    list.innerHTML = "";
    backups.forEach((backupId) => {
      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.justifyContent = "space-between";
      div.style.alignItems = "center";
      div.style.padding = "8px";
      div.style.borderBottom = "1px solid #444";

      const displayDatePt1 = backupId
        .replace("T", " ")
        .replace(/-/g, "/")
        .slice(0, 10);
      const displayDatePt2 = backupId
        .replace("T", " ")
        .replace(/-/g, ":")
        .slice(11);

      const displayDate = `${displayDatePt1} - ${displayDatePt2}`;

      div.innerHTML = `
                        <span style="font-family:monospace">${displayDate}</span>
                        <button class="btn" style="padding: 4px 8px; font-size: 0.8em;" onclick="restoreBackup('${backupId}')">
                            <i class="fa-solid fa-rotate-left"></i> Restaurer
                        </button>
                    `;
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<p style="color:red">Erreur chargement backups.</p>';
  }
}

async function restoreBackup(backupId) {
  if (
    !confirm(
      `⚠️ Restaurer le backup du ${backupId} ?\nCela écrasera les données actuelles !`,
    )
  )
    return;

  try {
    const res = await fetch("/api/admin/backups/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupId }),
    });

    const data = await res.json();
    if (res.ok) {
      showNotification("✅ Backup restauré avec succès", "success");
      socket.emit("admin:refresh");
    } else {
      showNotification("❌ " + data.message, "error");
    }
  } catch (e) {
    console.error(e);
    showNotification("❌ Erreur restauration", "error");
  }
}

// --- DMs ---
async function fetchDmsBetweenUsers() {
  const u1 = (document.getElementById("dmUser1")?.value || "").trim();
  const u2 = (document.getElementById("dmUser2")?.value || "").trim();
  const tbody = document.getElementById("dms-between-list");
  const meta = document.getElementById("dms-between-meta");

  if (!tbody) return;
  tbody.innerHTML = "";
  if (meta) meta.textContent = "";

  if (!u1 || !u2) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center">Renseigne 2 pseudos</td></tr>';
    return;
  }

  try {
    if (meta) meta.textContent = "Chargement...";
    const res = await fetch(
      `/api/admin/dms/between?u1=${encodeURIComponent(u1)}&u2=${encodeURIComponent(u2)}`,
    );
    if (!res.ok) {
      if (meta) meta.textContent = "";
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center">Erreur récupération</td></tr>';
      return;
    }
    const list = await res.json();
    const dms = Array.isArray(list) ? list : [];

    if (meta) meta.textContent = `${dms.length} message(s)`;

    if (dms.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center">Aucun DM</td></tr>';
      return;
    }

    dms.forEach((m) => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      const tdFrom = document.createElement("td");
      const tdTo = document.createElement("td");
      const tdText = document.createElement("td");
      const tdDelivered = document.createElement("td");

      const at = m?.at ? new Date(m.at) : null;
      tdDate.textContent =
        at && !isNaN(at.getTime()) ? at.toLocaleString() : "";
      tdFrom.textContent = m?.from || "";
      tdTo.textContent = m?.to || "";
      tdText.textContent = m?.text || "";
      tdDelivered.textContent = m?.delivered ? "oui" : "non";

      tr.appendChild(tdDate);
      tr.appendChild(tdFrom);
      tr.appendChild(tdTo);
      tr.appendChild(tdText);
      tr.appendChild(tdDelivered);
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
    if (meta) meta.textContent = "";
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center">Erreur serveur</td></tr>';
  }
}

// Restore panel state on load from server
(async function initPanelState() {
  try {
    const res = await fetch("/api/admin/panel/state");
    const data = await res.json();
    if (data.hidden) {
      const panel = document.getElementById("panel");
      const passwordBtn = document.querySelector(".password-btn");
      if (panel && passwordBtn) {
        panel.classList.add("admin-hidden");
        passwordBtn.style.display = "block";
      }
    }
  } catch (e) {
    console.error("Failed to fetch panel state", e);
  }
})();

// Scroll Saver
document.addEventListener("DOMContentLoaded", () => {
  const scrollPos = localStorage.getItem("adminScrollPos");
  if (scrollPos) window.scrollTo(0, parseInt(scrollPos));
  loadBackups();
});

window.addEventListener("beforeunload", () => {
  localStorage.setItem("adminScrollPos", window.scrollY);
});

// Initialiser
checkSes();
