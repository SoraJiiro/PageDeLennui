const pixelWarGame = require("../../games/pixelWarGame");

function registerPixelWarHandlers({
  io,
  socket,
  pseudo,
  FileService,
  pixelWarGame,
}) {
  if (!pseudo) return;

  socket.on("pixelwar:join", () => {
    const user = pixelWarGame.getUserState(pseudo);
    const boardArray = Array.from(pixelWarGame.board);

    socket.emit("pixelwar:init", {
      board: boardArray,
      pixels: user.pixels,
      maxPixels: user.maxPixels,
      nextPixelIn: pixelWarGame.getNextPixelIn(pseudo),
    });

    socket.emit("pixelwar:stats", {
      pixels: user.pixels,
      maxPixels: user.maxPixels,
      nextPixelIn: pixelWarGame.getNextPixelIn(pseudo),
    });
  });

  socket.on("pixelwar:place", ({ x, y, colorIndex }) => {
    const res = pixelWarGame.placePixel(pseudo, x, y, colorIndex);
    if (res.success) {
      io.emit("pixelwar:update_pixel", { x, y, colorIndex, owner: pseudo });

      const user = pixelWarGame.getUserState(pseudo);
      socket.emit("pixelwar:stats", {
        pixels: user.pixels,
        nextPixelIn: pixelWarGame.getNextPixelIn(pseudo),
      });
    } else {
      socket.emit("pixelwar:error", res.reason || "Erreur placement");
    }
  });

  // Après validation d'un dessin (mode batch côté client), on persiste
  // immédiatement le compteur de pixels dans pixelwar_users.json.
  socket.on("pixelwar:batch_done", () => {
    try {
      pixelWarGame.getUserState(pseudo);
      pixelWarGame.saveUsers();
    } catch (e) {
      console.error("pixelwar:batch_done save error:", e);
    }
  });

  socket.on("pixelwar:erase", ({ x, y }) => {
    const res = pixelWarGame.erasePixel(pseudo, x, y);
    if (res.success) {
      io.emit("pixelwar:update_pixel", {
        x: res.x,
        y: res.y,
        colorIndex: res.colorIndex,
        owner: res.owner,
      });

      const user = pixelWarGame.getUserState(pseudo);
      socket.emit("pixelwar:stats", {
        pixels: user.pixels,
        maxPixels: user.maxPixels,
        nextPixelIn: pixelWarGame.getNextPixelIn(pseudo),
      });
    } else {
      socket.emit("pixelwar:error", res.reason || "Impossible d'effacer");
    }
  });

  socket.on("pixelwar:buy", (type) => {
    const res = pixelWarGame.buyUpgrade(pseudo, type);
    if (res.success) {
      socket.emit("pixelwar:stats", {
        pixels: res.userState.pixels,
        maxPixels: res.userState.maxPixels,
        nextPixelIn: pixelWarGame.getNextPixelIn(pseudo),
      });
      socket.emit("session:update_money", {
        money: FileService.data.clicks[pseudo],
      });

      // Envoyer une notification de succès
      let message = "";
      if (type === "storage_10") {
        message = "Stockage +10 acheté avec succès !";
      } else if (type === "pixel_1") {
        message = "1 Pixel acheté avec succès !";
      } else if (type === "pixel_15") {
        message = "15 Pixels achetés avec succès !";
      }
      if (message) {
        socket.emit("pixelwar:success", message);
      }
    } else {
      socket.emit("pixelwar:error", res.reason || "Achat impossible");
    }
  });

  socket.on("pixelwar:get_info", ({ x, y }) => {
    const info = pixelWarGame.getPixelInfo(x, y);
    if (info && info.owner) {
      let pfp = "/Public/imgs/defaultProfile.png";
      if (FileService.data.pfps && FileService.data.pfps[info.owner]) {
        pfp = FileService.data.pfps[info.owner];
      }
      socket.emit("pixelwar:pixel_info", {
        x,
        y,
        owner: info.owner,
        pseudo: info.owner,
        pfp,
      });
    } else {
      // Pixel vide - envoyer quand même l'info
      socket.emit("pixelwar:pixel_info", {
        x,
        y,
        owner: null,
        pseudo: "Pixel vide",
        pfp: null,
      });
    }
  });

  socket.on("pixelwar:get_leaderboard", () => {
    socket.emit("pixelwar:leaderboard", pixelWarGame.getLeaderboard());
  });
  socket.on("pixelwar:request_stats", () => {
    const user = pixelWarGame.getUserState(pseudo);
    socket.emit("pixelwar:stats", {
      pixels: user.pixels,
      maxPixels: user.maxPixels,
      nextPixelIn: pixelWarGame.getNextPixelIn(pseudo),
    });
  });
}

module.exports = { registerPixelWarHandlers };
