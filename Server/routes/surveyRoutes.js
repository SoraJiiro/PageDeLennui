const express = require("express");
const fs = require("fs");
const path = require("path");
const { FileService } = require("../util");
const { getWallet, spendTokens, addTokens } = require("../services/wallet");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const SURVEYS_FILE = path.join(DATA_DIR, "surveys.json");

function getSurveys() {
  if (!fs.existsSync(SURVEYS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SURVEYS_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveSurveys(surveys) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SURVEYS_FILE, JSON.stringify(surveys, null, 2));
}

module.exports = function (io) {
  const router = express.Router();
  const staff = new Set(["Admin", "Moderateur1", "Moderateur2"]);

  // Middleware pour vérifier si l'utilisateur est connecté
  router.use((req, res, next) => {
    if (req.session && req.session.user) {
      next();
    } else {
      res.status(401).json({ message: "Non authentifié" });
    }
  });

  // Récupérer tous les sondages
  router.get("/list", (req, res) => {
    const surveys = getSurveys();
    const isStaff = staff.has(req.session.user.pseudo);
    const wallet = getWallet(
      FileService,
      req.session.user.pseudo,
      FileService.data.clicks?.[req.session.user.pseudo] || 0,
    );
    const userBet = (survey) => survey.bets?.[req.session.user.pseudo] || null;

    // Filtrer les données sensibles si nécessaire, mais pour l'instant tout envoyer est correct
    // Peut-être cacher qui a voté quoi ?
    const safeSurveys = surveys.map((s) => ({
      ...s,
      hasVoted: s.answers && s.answers[req.session.user.pseudo] !== undefined,
      userVote: s.answers ? s.answers[req.session.user.pseudo] : null,
      userBet: userBet(s),
      userPayout: s.payouts?.[req.session.user.pseudo] || 0,
      answers: isStaff ? s.answers : undefined,
      bets: isStaff ? s.bets : undefined,
      payouts: isStaff ? s.payouts : undefined,
      betting: {
        enabled: s.allowBets === true,
        maxTokens: s.allowBets === true ? Math.floor(wallet.tokens * 0.75) : 0,
      },
      results: calculateResults(s), // Envoyer les résultats agrégés
    }));
    res.json(safeSurveys);
  });

  // Voter pour un sondage
  router.post("/vote", (req, res) => {
    const { surveyId, choiceIndex } = req.body;
    const requestedBet =
      req.body.betAmount === undefined ? 0 : Number(req.body.betAmount);
    const user = req.session.user;

    const surveys = getSurveys();
    const survey = surveys.find((s) => s.id === surveyId);

    if (!survey) {
      return res.status(404).json({ message: "Sondage introuvable" });
    }

    if (survey.status !== "active") {
      return res.status(400).json({ message: "Ce sondage est clos" });
    }

    if (!survey.answers) survey.answers = {};

    if (survey.answers[user.pseudo] !== undefined) {
      return res.status(400).json({ message: "Vous avez déjà voté" });
    }

    if (!Number.isInteger(requestedBet) || requestedBet < 0) {
      return res.status(400).json({ message: "Mise invalide" });
    }

    const wallet = getWallet(
      FileService,
      user.pseudo,
      FileService.data.clicks?.[user.pseudo] || 0,
    );
    const maxBet =
      survey.allowBets === true ? Math.floor(wallet.tokens * 0.75) : 0;
    if (requestedBet > maxBet) {
      return res
        .status(400)
        .json({ message: "La mise ne peut pas dépasser 75% de vos tokens" });
    }

    if (
      !Number.isInteger(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= survey.choices.length
    ) {
      return res.status(400).json({ message: "Choix invalide" });
    }

    survey.answers[user.pseudo] = choiceIndex;
    if (!survey.bets) survey.bets = {};
    if (requestedBet > 0) {
      const spent = spendTokens(
        FileService,
        user.pseudo,
        requestedBet,
        FileService.data.clicks?.[user.pseudo] || 0,
      );
      if (!spent.ok) {
        return res.status(400).json({ message: "Pas assez de tokens" });
      }
      survey.bets[user.pseudo] = { choiceIndex, amount: requestedBet };
    }
    saveSurveys(surveys);

    // Diffuser la mise à jour à tous les clients pour qu'ils voient le nouveau décompte des votes
    io.emit("survey:update", {
      id: survey.id,
      results: calculateResults(survey),
    });

    res.json({ success: true, results: calculateResults(survey) });
  });

  // Créer un sondage (Admin ou modérateur)
  router.post("/create", (req, res) => {
    if (!staff.has(req.session.user.pseudo)) {
      return res.status(403).json({ message: "Interdit" });
    }

    const { question, choices, allowBets } = req.body;

    if (
      !question ||
      !choices ||
      !Array.isArray(choices) ||
      choices.length < 2
    ) {
      return res
        .status(400)
        .json({ message: "Données invalides (min 2 choix)" });
    }

    const newSurvey = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      question,
      choices,
      createdBy: req.session.user.pseudo,
      createdAt: Date.now(),
      status: "active",
      allowBets: allowBets === true,
      answers: {},
      bets: {},
    };

    const surveys = getSurveys();
    surveys.push(newSurvey);
    saveSurveys(surveys);

    io.emit("survey:new", {
      ...newSurvey,
      results: calculateResults(newSurvey),
    });

    res.json({ success: true, survey: newSurvey });
  });

  // Fermer un sondage (Admin ou modérateur)
  router.post("/close", (req, res) => {
    if (!staff.has(req.session.user.pseudo)) {
      return res.status(403).json({ message: "Interdit" });
    }

    const { surveyId, winningChoice } = req.body;
    const surveys = getSurveys();
    const survey = surveys.find((s) => s.id === surveyId);

    if (!survey) {
      return res.status(404).json({ message: "Sondage introuvable" });
    }

    if (survey.status === "closed") {
      return res.status(400).json({ message: "Ce sondage est déjà clos" });
    }

    if (
      survey.allowBets === true &&
      (!Number.isInteger(winningChoice) ||
        winningChoice < 0 ||
        winningChoice >= survey.choices.length)
    ) {
      return res.status(400).json({ message: "Choix gagnant invalide" });
    }

    settleBets(survey, winningChoice);
    survey.status = "closed";
    saveSurveys(surveys);

    io.emit("survey:closed", { id: surveyId });

    res.json({ success: true });
  });

  // Supprimer un sondage (Admin ou modérateur)
  router.post("/delete", (req, res) => {
    if (!staff.has(req.session.user.pseudo)) {
      return res.status(403).json({ message: "Interdit" });
    }

    const { surveyId } = req.body;
    let surveys = getSurveys();
    surveys = surveys.filter((s) => s.id !== surveyId);
    saveSurveys(surveys);

    io.emit("survey:deleted", { id: surveyId });
    res.json({ success: true });
  });

  return router;
};

function calculateResults(survey) {
  const results = new Array(survey.choices.length).fill(0);
  const total = Object.keys(survey.answers || {}).length;

  if (survey.answers) {
    Object.values(survey.answers).forEach((choiceIndex) => {
      if (results[choiceIndex] !== undefined) {
        results[choiceIndex]++;
      }
    });
  }

  return {
    counts: results,
    total,
  };
}

function settleBets(survey, selectedWinningChoice = null) {
  if (survey.betsSettled) return;

  const counts = calculateResults(survey).counts;
  const highest = Math.max(...counts);
  const winners =
    survey.allowBets === true
      ? [selectedWinningChoice]
      : counts.reduce(
          (indices, count, index) =>
            count === highest ? [...indices, index] : indices,
          [],
        );
  const bets = Object.entries(survey.bets || {});
  const totalPot = bets.reduce(
    (sum, [, bet]) => sum + Math.max(0, Number(bet.amount) || 0),
    0,
  );
  const winningBets =
    winners.length === 1
      ? bets.filter(([, bet]) => Number(bet.choiceIndex) === winners[0])
      : [];
  const winningTotal = winningBets.reduce(
    (sum, [, bet]) => sum + Math.max(0, Number(bet.amount) || 0),
    0,
  );

  if (winningTotal > 0) {
    let distributed = 0;
    survey.payouts = {};
    winningBets.forEach(([pseudo, bet], index) => {
      const amount = Math.max(0, Number(bet.amount) || 0);
      const gain =
        index === winningBets.length - 1
          ? totalPot - distributed
          : Math.floor((totalPot * amount) / winningTotal);
      if (gain > 0) addTokens(FileService, pseudo, gain, 0, "gain_sondage");
      survey.payouts[pseudo] = gain;
      distributed += gain;
    });
  } else {
    survey.payouts = {};
    bets.forEach(([pseudo, bet]) => {
      const amount = Math.max(0, Number(bet.amount) || 0);
      if (amount > 0) {
        addTokens(FileService, pseudo, amount, 0, "remboursement_sondage");
        survey.payouts[pseudo] = amount;
      }
    });
  }

  survey.betsSettled = true;
  survey.winningChoice = winners.length === 1 ? winners[0] : null;
}
