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
      // If multi-colored, update all colors to the new single color
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
      socket.emit("system:info", "Vous ne pouvez pas vous donner des clicks.");
      return;
    }

    const senderClicks = FileService.data.clicks[pseudo] || 0;
    if (senderClicks < val) {
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

    // Déduire immédiatement du sender
    FileService.data.clicks[pseudo] -= val;
    FileService.save("clicks", FileService.data.clicks);
    recalculateMedals(pseudo, FileService.data.clicks[pseudo], io, true); // Silent recalc
    socket.emit("clicker:you", { score: FileService.data.clicks[pseudo] });

    const senderIp = getIpFromSocket(socket);

    if (val > 250000) {
      // Transaction en attente
      if (!FileService.data.transactions) FileService.data.transactions = [];
      const transaction = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        from: pseudo,
        fromIp: senderIp,
        to: recipient,
        amount: val,
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
      });

      socket.emit(
        "system:info",
        `Don de ${val} clicks à ${recipient} en attente de validation (montant > 250k).`,
      );

      // Notifier les admins connectés
      io.to("admins").emit("admin:new_transaction", transaction);
    } else {
      // Transfert direct
      if (!FileService.data.clicks[recipient])
        FileService.data.clicks[recipient] = 0;
      FileService.data.clicks[recipient] += val;
      FileService.save("clicks", FileService.data.clicks);

      console.log(`[DON] De ${pseudo} (${senderIp}) à ${recipient} : ${val}`);
      FileService.appendLog({
        type: "DONATION",
        from: `${pseudo} (${senderIp})`,
        to: recipient,
        amount: val,
      });

      recalculateMedals(
        recipient,
        FileService.data.clicks[recipient],
        io,
        true,
      ); // Silent recalc

      socket.emit(
        "system:info",
        `Vous avez donné ${val} clicks à ${recipient}.`,
      );

      // Notifier le destinataire s'il est en ligne
      const recipientSocketId = gameState.userSockets.get(recipient); // Set of socketIds
      if (recipientSocketId) {
        recipientSocketId.forEach((sid) => {
          io.to(sid).emit(
            "system:info",
            `${pseudo} vous a donné ${val} clicks !`,
          );
          io.to(sid).emit("clicker:you", {
            score: FileService.data.clicks[recipient],
          });
        });
      }
    }

    leaderboardManager.broadcastClickerLB(io);
  });

  // Fournir l'état du cap quotidien au client (sidebar / UI)
  socket.on("economy:getProfitCap", () => {
    try {
      const {
        getDailyProfitCapInfo,
        freezeDailyProfitCapBaseClicks,
      } = require("../../services/economy");
      const currentClicks = FileService.data.clicks[pseudo] || 0;

      // Figer le baseClicks dès la première connexion du jour
      try {
        freezeDailyProfitCapBaseClicks({ FileService, pseudo, currentClicks });
      } catch (e) {}

      const capInfo = getDailyProfitCapInfo({
        FileService,
        pseudo,
        currentClicks,
      });
      socket.emit("economy:profitCap", capInfo);
    } catch (e) {}
  });
}

module.exports = { registerUserHandlers };
