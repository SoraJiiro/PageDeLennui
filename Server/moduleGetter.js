function defineLazyExport(name, getter) {
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    configurable: false,
    get: getter,
  });
}

// ------- Games -------
defineLazyExport("MashGame", () =>
  require("./games/mashGame"),
);
defineLazyExport("UnoGame", () => require("./games/unoGame"));
defineLazyExport("Puissance4Game", () =>
  require("./games/puissance4Game"),
);
defineLazyExport("ChessGame", () =>
  require("./games/chessGame"),
);
defineLazyExport("MotusGame", () =>
  require("./games/motusGame"),
);
defineLazyExport("BlackjackGame", () =>
  require("./games/blackjackGame"),
);

// ------- Services -------
defineLazyExport("medalsService", () =>
  require("./services/medals"),
);
defineLazyExport(
  "recalculateMedals",
  () => require("./services/medals").recalculateMedals,
);
defineLazyExport(
  "broadcastSystemMessage",
  () => require("./services/medals").broadcastSystemMessage,
);
