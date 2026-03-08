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
  const { consumeLife, getLivesCount } = require("../../services/reviveLives");
  const { spendMoney } = require("../../services/wallet");

  socket.on("revive:getLives", () => {
    const lives = getLivesCount(FileService, pseudo);
    socket.emit("revive:lives", { lives });
  });

  function handleRevive(game, label, successEvent, errorEvent, color) {
    return ({ mode } = {}) => {
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

      const requestedMode = mode === "life" || mode === "pay" ? mode : "auto";

      if (requestedMode === "life") {
        const lifeResult = consumeLife(FileService, pseudo);
        if (!lifeResult.used) {
          socket.emit(errorEvent, "Tu n'as plus de vie disponible.");
          return;
        }

        incrementReviveUsed(socket, game);
        socket.emit(successEvent, {
          usedLife: true,
          remainingLives: lifeResult.remaining,
        });
        console.log(
          withGame(
            `[${label}] ${pseudo} a utilise une vie de reanimation.`,
            color,
          ),
        );
        return;
      }

      if (requestedMode === "auto") {
        const lifeResult = consumeLife(FileService, pseudo);
        if (lifeResult.used) {
          incrementReviveUsed(socket, game);
          socket.emit(successEvent, {
            usedLife: true,
            remainingLives: lifeResult.remaining,
          });
          console.log(
            withGame(
              `[${label}] ${pseudo} a utilise une vie de reanimation.`,
              color,
            ),
          );
          return;
        }
      }

      const cost = Number(info.cost);
      if (!Number.isFinite(cost) || cost < 0) {
        socket.emit(errorEvent, "Prix invalide.");
        return;
      }

      const spend = spendMoney(
        FileService,
        pseudo,
        cost,
        FileService.data.clicks?.[pseudo] || 0,
      );

      if (spend.ok) {
        socket.emit("economy:wallet", spend.wallet);
        incrementReviveUsed(socket, game);
        socket.emit(successEvent, {
          usedLife: false,
          remainingLives: getLivesCount(FileService, pseudo),
        });

        console.log(
          withGame(
            `[${label}] ${pseudo} a payé ${cost} monnaie pour continuer.`,
            color,
          ),
        );
      } else {
        socket.emit(errorEvent, "Pas assez de monnaie !");
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

  // ------- Subway Revive -------
  socket.on(
    "subway:payToContinue",
    handleRevive(
      "subway",
      "Subway",
      "subway:reviveSuccess",
      "subway:reviveError",
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
