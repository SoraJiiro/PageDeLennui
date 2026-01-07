const express = require("express");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
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
    const isAdmin = req.session.user.pseudo === "Admin";

    // Filtrer les données sensibles si nécessaire, mais pour l'instant tout envoyer est correct
    // Peut-être cacher qui a voté quoi ?
    const safeSurveys = surveys.map((s) => ({
      ...s,
      hasVoted: s.answers && s.answers[req.session.user.pseudo] !== undefined,
      userVote: s.answers ? s.answers[req.session.user.pseudo] : null,
      answers: isAdmin ? s.answers : undefined, // Envoyer la map brute des réponses seulement à l'Admin
      results: calculateResults(s), // Envoyer les résultats agrégés
    }));
    res.json(safeSurveys);
  });

  // Voter pour un sondage
  router.post("/vote", (req, res) => {
    const { surveyId, choiceIndex } = req.body;
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

    if (choiceIndex < 0 || choiceIndex >= survey.choices.length) {
      return res.status(400).json({ message: "Choix invalide" });
    }

    survey.answers[user.pseudo] = choiceIndex;
    saveSurveys(surveys);

    // Diffuser la mise à jour à tous les clients pour qu'ils voient le nouveau décompte des votes
    io.emit("survey:update", {
      id: survey.id,
      results: calculateResults(survey),
    });

    res.json({ success: true, results: calculateResults(survey) });
  });

  // Créer un sondage (Admin seulement)
  router.post("/create", (req, res) => {
    if (req.session.user.pseudo !== "Admin") {
      return res.status(403).json({ message: "Interdit" });
    }

    const { question, choices } = req.body;

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
      answers: {},
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

  // Fermer un sondage (Admin seulement)
  router.post("/close", (req, res) => {
    if (req.session.user.pseudo !== "Admin") {
      return res.status(403).json({ message: "Interdit" });
    }

    const { surveyId } = req.body;
    const surveys = getSurveys();
    const survey = surveys.find((s) => s.id === surveyId);

    if (!survey) {
      return res.status(404).json({ message: "Sondage introuvable" });
    }

    survey.status = "closed";
    saveSurveys(surveys);

    io.emit("survey:closed", { id: surveyId });

    res.json({ success: true });
  });

  // Supprimer un sondage (Admin seulement)
  router.post("/delete", (req, res) => {
    if (req.session.user.pseudo !== "Admin") {
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
