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

// ------- Middlewares -------
defineLazyExport("requireAuth", () =>
  requireCached("requireAuth", "./middlewares/requireAuth")
);

defineLazyExport(
  "expressSession",
  () => requireCached("util", "./util").expressSession
);

defineLazyExport(
  "blacklistMiddleware",
  () => requireCached("util", "./util").blacklistMiddleware
);
