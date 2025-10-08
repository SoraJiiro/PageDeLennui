module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.accepts("html")) return res.redirect("/login");
  return res.status(401).json({ error: "Unauthorized" });
};
