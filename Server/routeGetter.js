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

// ------- Routing helpers -------
defineLazyExport(
  "setupRoutes",
  () => requireCached("setupRoutesModule", "./routes/setupRoutes").setupRoutes,
);

// ------- Routes -------
defineLazyExport("authRoutes", () =>
  requireCached("authRoutes", "./routes/authRoutes"),
);
defineLazyExport("createAdminRouter", () =>
  requireCached("createAdminRouter", "./routes/adminRoutes"),
);
defineLazyExport("tagRoutes", () =>
  requireCached("tagRoutes", "./routes/tagRoutes"),
);
defineLazyExport("surveyRoutesFactory", () =>
  requireCached("surveyRoutesFactory", "./routes/surveyRoutes"),
);
defineLazyExport("suggestionRoutes", () =>
  requireCached("suggestionRoutes", "./routes/suggestionRoutes"),
);
defineLazyExport("easterEggRoutes", () =>
  requireCached("easterEggRoutes", "./routes/easterEggRoutes"),
);
