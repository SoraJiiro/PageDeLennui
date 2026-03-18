module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    const pseudo = req.session.user.pseudo;
    const isHomeRequest = req.path === "/" || req.path === "/index.html";

    if (pseudo === "Admin" && isHomeRequest) {
      return res.redirect("/admin");
    }

    if (pseudo === "Moderateur1" && isHomeRequest) {
      return res.redirect("/mod");
    }

    if (pseudo === "Moderateur2" && isHomeRequest) {
      return res.redirect("/mod2");
    }
    return next();
  }
  if (req.accepts("html")) return res.redirect("/login");
  return res.status(401).json({ error: "Unauthorized" });
};
