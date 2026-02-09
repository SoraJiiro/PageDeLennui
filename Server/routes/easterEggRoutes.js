const express = require("express");
const { requireAuth } = require("../middlewareGetter");
const {
  markStepByCode,
  recordPreloginStep,
  applyPendingForUser,
  getStatusForUser,
} = require("../services/easterEggs");

const router = express.Router();

router.post("/prelogin", (req, res) => {
  recordPreloginStep(req);
  res.json({ ok: true });
});

router.get("/annonces-link", requireAuth, (req, res) => {
  const pseudo = req.session.user && req.session.user.pseudo;
  if (pseudo) {
    markStepByCode(pseudo, "a1");
  }
  res.redirect("/imgs/logo_random.png");
});

router.post("/step", requireAuth, (req, res) => {
  const pseudo = req.session.user && req.session.user.pseudo;
  const code = req.body && req.body.code;
  if (!pseudo || !code) {
    return res.status(400).json({ ok: false });
  }
  applyPendingForUser(req, pseudo);
  const progress = markStepByCode(pseudo, code);
  if (!progress) {
    return res.status(400).json({ ok: false });
  }
  res.json({ ok: true });
});

router.get("/status", requireAuth, (req, res) => {
  const pseudo = req.session.user && req.session.user.pseudo;
  if (!pseudo) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  applyPendingForUser(req, pseudo);
  const status = getStatusForUser(pseudo);
  res.json(status);
});

module.exports = router;
