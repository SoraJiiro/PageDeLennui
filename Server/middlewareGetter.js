function defineLazyExport(name, getter) {
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    configurable: false,
    get: getter,
  });
}

// ------- Middlewares -------
defineLazyExport("requireAuth", () =>
  require("./middlewares/requireAuth")
);

defineLazyExport(
  "expressSession",
  () => require("./util").expressSession
);

defineLazyExport(
  "blacklistMiddleware",
  () => require("./util").blacklistMiddleware
);
