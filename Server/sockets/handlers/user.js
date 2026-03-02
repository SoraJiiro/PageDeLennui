function registerUserHandlers({
  io,
  socket,
  pseudo,
  FileService,
  dbUsers,
  gameState,
  leaderboardManager,
  getIpFromSocket,
  recalculateMedals,
}) {
  const {
    getWallet,
    convertClicksToMoney,
    convertMoneyToTokens,
    convertTokensToMoney,
  } = require("../../services/wallet");
  socket.on("system:acceptRules", () => {
    try {
      // IMPORTANT: pseudo peut varier en casse selon les clients.
      // On met à jour de façon case-insensitive pour que ça persiste au refresh.
      const updated = dbUsers.updateUserFields
        ? dbUsers.updateUserFields(pseudo, { rulesAccepted: true })
        : null;

      if (updated) {
        socket.emit("system:rulesAccepted");
        return;
      }

      // Fallback (si updateUserFields n'existe pas)
      const db = dbUsers.readAll();
      const users = Array.isArray(db?.users) ? db.users : [];
      const lower = String(pseudo || "").toLowerCase();
      const u = users.find(
        (usr) =>
          usr &&
          typeof usr === "object" &&
          typeof usr.pseudo === "string" &&
          usr.pseudo.toLowerCase() === lower,
      );
      if (u) {
        u.rulesAccepted = true;
        dbUsers.writeAll({ ...db, users });
        socket.emit("system:rulesAccepted");
      }
    } catch (e) {
      console.warn("Err rules : ", e);
    }
  });

  // ------- UI Color -------
  socket.on("ui:saveColor", ({ color }) => {
    if (!color || typeof color !== "string") return;
    if (!FileService.data.uis) FileService.data.uis = {};
    FileService.data.uis[pseudo] = color;
    FileService.save("uis", FileService.data.uis);
  });

  socket.on("user:setTagColor", ({ color }) => {
    if (!color || typeof color !== "string") return;

    // Check tricheur
    const userMedals = FileService.data.medals[pseudo] || [];
    const hasTricheurMedal = userMedals.some((m) =>
      typeof m === "string" ? m === "Tricheur" : m.name === "Tricheur",
    );
    const isInCheatersList =
      FileService.data.cheaters && FileService.data.cheaters.includes(pseudo);

    if (hasTricheurMedal || isInCheatersList) {
      return socket.emit("system:notification", {
        message:
          "🚫 Les tricheurs ne peuvent pas changer la couleur de leur tag",
        duration: 4000,
      });
    }

    if (!FileService.data.tags) FileService.data.tags = {};
    let currentTag = FileService.data.tags[pseudo];

    if (!currentTag) {
      // Pas de tag, on ne fait rien
      return;
    }

    if (typeof currentTag === "string") {
      currentTag = { text: currentTag, color: color };
    } else if (typeof currentTag === "object") {
      currentTag.color = color;
      if (currentTag.colors && Array.isArray(currentTag.colors)) {
        currentTag.colors = currentTag.colors.map(() => color);
      }
    }

    FileService.data.tags[pseudo] = currentTag;
    FileService.save("tags", FileService.data.tags);

    socket.emit("user:tagColor", { color });
    socket.emit("system:notification", {
      message: "✅ Couleur du tag mise à jour",
      duration: 3000,
    });
  });

  // ------- Donation System -------
  socket.on("user:donate", ({ recipient, amount }) => {
    const val = parseInt(amount);
    if (isNaN(val) || val <= 0) {
      socket.emit("system:info", "Montant invalide.");
      return;
    }

    if (recipient === pseudo) {
      socket.emit("system:info", "Vous ne pouvez pas vous donner de monnaie.");
      return;
    }

    const senderWallet = getWallet(
      FileService,
      pseudo,
      FileService.data.clicks[pseudo] || 0,
    );
    if ((senderWallet.money || 0) < val) {
      socket.emit("system:info", "Fonds insuffisants.");
      return;
    }

    // Vérifier si le destinataire existe
    const recipientExists = dbUsers.findByPseudoExact
      ? dbUsers.findByPseudoExact(recipient)
      : dbUsers.findBypseudo(recipient);

    if (!recipientExists) {
      socket.emit("system:info", "Utilisateur introuvable.");
      return;
    }

    const wallets = FileService.data.wallets || {};
    if (!wallets[pseudo]) return;
    wallets[pseudo].money = Math.max(0, (wallets[pseudo].money || 0) - val);
    FileService.save("wallets", wallets);
    io.to("user:" + pseudo).emit(
      "economy:wallet",
      getWallet(FileService, pseudo, FileService.data.clicks[pseudo] || 0),
    );

    const senderIp = getIpFromSocket(socket);

    // Transaction en attente (sans seuil minimum)
    if (!FileService.data.transactions) FileService.data.transactions = [];
    const transaction = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      from: pseudo,
      fromIp: senderIp,
      to: recipient,
      amount: val,
      currency: "money",
      date: new Date().toISOString(),
      status: "pending",
    };
    FileService.data.transactions.push(transaction);
    FileService.save("transactions", FileService.data.transactions);

    console.log(
      `[DON_EN_ATTENTE] De ${pseudo} (${senderIp}) à ${recipient} : ${val}`,
    );
    FileService.appendLog({
      type: "DONATION_PENDING",
      from: `${pseudo} (${senderIp})`,
      to: recipient,
      amount: val,
      currency: "money",
    });

    socket.emit(
      "system:info",
      `Demande de don de ${val} monnaie envoyée. En attente de validation admin.`,
    );

    // Notifier les admins connectés
    io.to("admins").emit("admin:new_transaction", transaction);

    leaderboardManager.broadcastClickerLB(io);
  });

  socket.on("economy:getWallet", () => {
    const clicks = FileService.data.clicks[pseudo] || 0;
    socket.emit("economy:wallet", getWallet(FileService, pseudo, clicks));
  });

  socket.on("economy:convertClicksToMoney", ({ clicks }) => {
    const result = convertClicksToMoney({
      FileService,
      pseudo,
      clicksAmount: clicks,
      currentClicks: FileService.data.clicks[pseudo] || 0,
    });
    if (!result.ok) return socket.emit("economy:error", result.message);
    recalculateMedals(pseudo, result.clicks, io, false, false);
    socket.emit("clicker:you", { score: result.clicks });
    io.to("user:" + pseudo).emit("economy:wallet", result.wallet);
    leaderboardManager.broadcastClickerLB(io);
  });

  socket.on("economy:convertMoneyToTokens", ({ money }) => {
    const result = convertMoneyToTokens({
      FileService,
      pseudo,
      moneyAmount: money,
      currentClicks: FileService.data.clicks[pseudo] || 0,
    });
    if (!result.ok) return socket.emit("economy:error", result.message);
    io.to("user:" + pseudo).emit("economy:wallet", result.wallet);
  });

  socket.on("economy:convertTokensToMoney", ({ tokens }) => {
    const result = convertTokensToMoney({
      FileService,
      pseudo,
      tokenAmount: tokens,
      currentClicks: FileService.data.clicks[pseudo] || 0,
    });
    if (!result.ok) return socket.emit("economy:error", result.message);
    io.to("user:" + pseudo).emit("economy:wallet", result.wallet);
  });
}

module.exports = { registerUserHandlers };
