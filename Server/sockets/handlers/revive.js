function registerReviveHandlers({
  io,
  socket,
  pseudo,
  FileService,
  leaderboardManager,
  recalculateMedals,
  withGame,
  colors,
}) {
  // ------- Dino Revive -------
  socket.on("dino:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("dino:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      recalculateMedals(
        pseudo,
        FileService.data.clicks[pseudo],
        io,
        false,
        true
      );

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("dino:reviveSuccess");
      console.log(
        withGame(
          `[Dino] ${pseudo} a payé ${cost} clicks pour continuer.`,
          colors.blue
        )
      );
    } else {
      socket.emit("dino:reviveError", "Pas assez de clicks !");
    }
  });

  // ------- Flappy Revive -------
  socket.on("flappy:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("flappy:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      recalculateMedals(
        pseudo,
        FileService.data.clicks[pseudo],
        io,
        false,
        true
      );

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("flappy:reviveSuccess");
      console.log(
        withGame(
          `[Flappy] ${pseudo} a payé ${cost} clicks pour continuer.`,
          colors.pink
        )
      );
    } else {
      socket.emit("flappy:reviveError", "Pas assez de clicks !");
    }
  });

  // ------- Snake Revive -------
  socket.on("snake:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("snake:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      recalculateMedals(
        pseudo,
        FileService.data.clicks[pseudo],
        io,
        false,
        true
      );

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("snake:reviveSuccess");
      console.log(
        withGame(
          `[Snake] ${pseudo} a payé ${cost} clicks pour continuer.`,
          colors.green
        )
      );
    } else {
      socket.emit("snake:reviveError", "Pas assez de clicks !");
    }
  });

  // ------- 2048 Revive -------
  socket.on("2048:payToContinue", ({ price }) => {
    const userClicks = FileService.data.clicks[pseudo] || 0;
    const cost = Number(price);

    if (isNaN(cost) || cost < 0) {
      socket.emit("2048:reviveError", "Prix invalide.");
      return;
    }

    if (userClicks >= cost) {
      FileService.data.clicks[pseudo] = userClicks - cost;
      FileService.save("clicks", FileService.data.clicks);

      recalculateMedals(
        pseudo,
        FileService.data.clicks[pseudo],
        io,
        false,
        true
      );

      socket.emit("clicker:you", {
        score: FileService.data.clicks[pseudo],
      });
      leaderboardManager.broadcastClickerLB(io);

      socket.emit("2048:reviveSuccess");
      console.log(
        withGame(
          `[2048] ${pseudo} a payé ${cost} clicks pour continuer.`,
          colors.green
        )
      );
    } else {
      socket.emit("2048:reviveError", "Pas assez de clicks !");
    }
  });
}

module.exports = { registerReviveHandlers };
