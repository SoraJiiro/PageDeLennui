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
  const {
    getReviveCostForSocket,
    incrementReviveUsed,
  } = require("../../services/economy");
  const { consumeLife } = require("../../services/reviveLives");

  function handleRevive(game, label, successEvent, errorEvent, color) {
    return () => {
      const info = getReviveCostForSocket(socket, game);
      if (!info || info.cost == null) {
        socket.emit(
          errorEvent,
          "Contexte de réanimation introuvable (score manquant).",
        );
        return;
      }
      if (info.error) {
        socket.emit(errorEvent, info.error);
        return;
      }

      const lifeResult = consumeLife(FileService, pseudo);
      if (lifeResult.used) {
        incrementReviveUsed(socket, game);
        socket.emit(successEvent);
        console.log(
          withGame(
            `[${label}] ${pseudo} a utilise une vie de reanimation.`,
            color,
          ),
        );
        return;
      }

      const userClicks = FileService.data.clicks[pseudo] || 0;

      const cost = Number(info.cost);
      if (!Number.isFinite(cost) || cost < 0) {
        socket.emit(errorEvent, "Prix invalide.");
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
          true,
        );

        socket.emit("clicker:you", {
          score: FileService.data.clicks[pseudo],
        });
        leaderboardManager.broadcastClickerLB(io);

        incrementReviveUsed(socket, game);
        socket.emit(successEvent);

        console.log(
          withGame(
            `[${label}] ${pseudo} a payé ${cost} clicks pour continuer.`,
            color,
          ),
        );
      } else {
        socket.emit(errorEvent, "Pas assez de clicks !");
      }
    };
  }

  // ------- Dino Revive -------
  socket.on(
    "dino:payToContinue",
    handleRevive(
      "dino",
      "Dino",
      "dino:reviveSuccess",
      "dino:reviveError",
      colors.blue,
    ),
  );

  // ------- Flappy Revive -------
  socket.on(
    "flappy:payToContinue",
    handleRevive(
      "flappy",
      "Flappy",
      "flappy:reviveSuccess",
      "flappy:reviveError",
      colors.pink,
    ),
  );

  // ------- Snake Revive -------
  socket.on(
    "snake:payToContinue",
    handleRevive(
      "snake",
      "Snake",
      "snake:reviveSuccess",
      "snake:reviveError",
      colors.green,
    ),
  );

  // ------- 2048 Revive -------
  socket.on(
    "2048:payToContinue",
    handleRevive(
      "2048",
      "2048",
      "2048:reviveSuccess",
      "2048:reviveError",
      colors.green,
    ),
  );
}

module.exports = { registerReviveHandlers };
