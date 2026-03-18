const express = require("express");
const { FileService } = require("../util");
const { getPublicState, placeBet } = require("../services/guerreClans");

module.exports = function guerreClansRoutesFactory() {
  const router = express.Router();

  router.use((req, res, next) => {
    if (req.session && req.session.user) return next();
    return res.status(401).json({ message: "Non authentifie" });
  });

  router.get("/state", (req, res) => {
    const state = getPublicState(FileService, req.session?.user?.pseudo);
    res.json(state);
  });

  router.post("/bet", express.json(), (req, res) => {
    const pseudo = req.session?.user?.pseudo;
    const clan = req.body && req.body.clan;
    const amount = req.body && req.body.amount;

    const result = placeBet({
      FileService,
      io: req.app.get("io"),
      pseudo,
      clan,
      amount,
    });

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        message: result.message || "Pari refuse.",
        wallet: result.wallet || null,
      });
    }

    return res.json({
      ok: true,
      message: "Pari enregistre.",
      myBet: result.myBet,
      wallet: result.wallet,
      activeWar: result.state,
    });
  });

  return router;
};
