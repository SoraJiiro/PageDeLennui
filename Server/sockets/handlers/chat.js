function registerChatHandlers({
  io,
  socket,
  pseudo,
  FileService,
  getMotusState,
}) {
  const getPfpFor = (p) => {
    const url = FileService.data.pfps ? FileService.data.pfps[p] : null;
    return typeof url === "string" && url ? url : null;
  };

  const getSelectedBadgesFor = (p) => {
    const badgesData = FileService.data.chatBadges || {
      catalog: {},
      users: {},
    };
    const userBucket = (badgesData.users && badgesData.users[p]) || null;
    const selectedIds = Array.isArray(userBucket && userBucket.selected)
      ? userBucket.selected.slice(0, 3)
      : [];
    const out = [];
    for (const id of selectedIds) {
      const def = badgesData.catalog ? badgesData.catalog[id] : null;
      if (!def) continue;
      out.push({
        id,
        emoji: String(def.emoji || "🏷️"),
        name: String(def.name || id),
      });
    }
    return out;
  };

  socket.on("chat:message", ({ text }) => {
    let msg = String(text || "").trim();
    if (!msg) return;

    // Censure du mot du jour (Motus)
    // On doit vérifier le mot actuel de l'utilisateur car chacun a son propre mot
    const userMotusState = getMotusState ? getMotusState(pseudo) : null;
    if (userMotusState && userMotusState.currentWord) {
      const word = userMotusState.currentWord.toUpperCase();
      const leetMap = {
        A: "[A4@àâä]",
        B: "[B8&]",
        E: "[E3éèêë£€]",
        G: "[G69]",
        I: "[I1!|lìíîï]",
        L: "[L1|]",
        O: "[O0°òóôõö¤]",
        S: "[S5$š§]",
        T: "[T17]",
        Z: "[Z2²ž]",
        U: "[Uùúûüµ]",
        C: "[Cç]",
      };

      // Construction du pattern regex pour le mot
      // On autorise la répétition des caractères (ex: R+E+I+M+S+) pour attraper RREEIIMMSS
      let regexPattern = "";
      for (const char of word) {
        const mapped = leetMap[char] || char;
        // On ajoute + pour dire "1 ou plusieurs fois ce caractère"
        // On ajoute aussi des séparateurs optionnels (espaces, tirets, points) entre les lettres
        regexPattern += mapped + "+[\\s\\-_.]*";
      }

      // On retire le dernier séparateur optionnel inutile
      if (regexPattern.endsWith("[\\s\\-_.]*")) {
        regexPattern = regexPattern.slice(0, -10);
      }

      const regex = new RegExp(regexPattern, "gi");
      msg = msg.replace(regex, (match) => "*".repeat(match.length));
    }

    const tagData = FileService.data.tags
      ? FileService.data.tags[pseudo]
      : null;
    let tagPayload = null;
    if (tagData) {
      if (typeof tagData === "string") {
        tagPayload = { text: tagData, color: null };
      } else if (typeof tagData === "object") {
        tagPayload = tagData;
      }
    }

    const payload = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: pseudo,
      text: msg,
      at: new Date().toISOString(),
      tag: tagPayload,
      pfp: getPfpFor(pseudo),
      badges: getSelectedBadgesFor(pseudo),
    };

    FileService.data.historique.push(payload);
    if (FileService.data.historique.length > 200) {
      FileService.data.historique = FileService.data.historique.slice(-200);
    }
    FileService.save("historique", FileService.data.historique);
    FileService.appendLog(payload);
    io.emit("chat:message", payload);
  });

  socket.on("chat:delete", ({ id }) => {
    if (pseudo !== "Admin") return;
    const idx = FileService.data.historique.findIndex((m) => m.id === id);
    if (idx !== -1) {
      FileService.data.historique.splice(idx, 1);
      FileService.save("historique", FileService.data.historique);
      io.emit("chat:delete", { id });
    }
  });
}

module.exports = { registerChatHandlers };
