const cache = new Map();

function requireCached(key, modulePath) {
  if (cache.has(key)) return cache.get(key);
  const value = require(modulePath);
  cache.set(key, value);
  return value;
}

function defineLazyExport(name, getter) {
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    configurable: false,
    get: getter,
  });
}

// ------- Games -------
defineLazyExport("MashGame", () =>
  requireCached("MashGame", "./games/mashGame"),
);
defineLazyExport("UnoGame", () => requireCached("UnoGame", "./games/unoGame"));
defineLazyExport("Puissance4Game", () =>
  requireCached("Puissance4Game", "./games/puissance4Game"),
);
defineLazyExport("MotusGame", () =>
  requireCached("MotusGame", "./games/motusGame"),
);
defineLazyExport("BlackjackGame", () =>
  requireCached("BlackjackGame", "./games/blackjackGame"),
);

// ------- Services -------
defineLazyExport("medalsService", () =>
  requireCached("medalsService", "./services/medals"),
);
defineLazyExport(
  "recalculateMedals",
  () => requireCached("medalsService", "./services/medals").recalculateMedals,
);
defineLazyExport(
  "broadcastSystemMessage",
  () =>
    requireCached("medalsService", "./services/medals").broadcastSystemMessage,
);
