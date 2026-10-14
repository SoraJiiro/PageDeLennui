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
  () => require("./routes/setupRoutes").setupRoutes,
);

// ------- Routes -------
defineLazyExport("authRoutes", () =>
  require("./routes/authRoutes"),
);
defineLazyExport("createAdminRouter", () =>
  require("./routes/adminRoutes"),
);
defineLazyExport("tagRoutes", () =>
  require("./routes/tagRoutes"),
);
defineLazyExport("surveyRoutesFactory", () =>
  require("./routes/surveyRoutes"),
);
// defineLazyExport("guerreClansRoutesFactory", ...) supprimé (guerre des clans)
defineLazyExport("suggestionRoutes", () =>
  require("./routes/suggestionRoutes"),
);
defineLazyExport("easterEggRoutes", () =>
  require("./routes/easterEggRoutes"),
);
