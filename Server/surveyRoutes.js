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

  // Middleware to check if user is logged in
  router.use((req, res, next) => {
    if (req.session && req.session.user) {
      next();
    } else {
      res.status(401).json({ message: "Non authentifié" });
    }
  });

  // Get all surveys
  router.get("/list", (req, res) => {
    const surveys = getSurveys();
    // Filter out sensitive data if needed, but for now sending everything is fine
    // Maybe hide who voted what?
    const safeSurveys = surveys.map((s) => ({
      ...s,
      hasVoted: s.answers && s.answers[req.session.user.pseudo] !== undefined,
      userVote: s.answers ? s.answers[req.session.user.pseudo] : null,
      answers: undefined, // Don't send raw answers map
      results: calculateResults(s), // Send aggregated results
    }));
    res.json(safeSurveys);
  });

  // Vote on a survey
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

    // Broadcast update to all clients so they see the new vote count
    io.emit("survey:update", {
      id: survey.id,
      results: calculateResults(survey),
    });

    res.json({ success: true, results: calculateResults(survey) });
  });

  // Create a survey (Admin only)
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

  // Close a survey (Admin only)
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

  // Delete a survey (Admin only)
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
