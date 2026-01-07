require("dotenv").config();
const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const requireAuth = require("./requireAuth");
const { readAll, writeAll } = require("./dbUsers");

// Configure transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "pde.suggestions@gmail.com",
    pass: process.env.APP_PSWD,
  },
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log("Erreur de configuration Nodemailer:", error);
    if (!process.env.APP_PSWD) {
      console.log(
        "ATTENTION: Aucun mot de passe d'application trouvé dans les variables d'environnement (APP_PSWD)."
      );
    }
  } else {
    console.log("* Serveur prêt à envoyer des emails. \n");
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { content } = req.body;
  const user = req.session.user;

  if (!content) {
    return res
      .status(400)
      .json({ message: "Le contenu de la suggestion est requis." });
  }

  // Vérification du quota
  const db = readAll();
  const userIndex = db.users.findIndex((u) => u.id === user.id);

  if (userIndex === -1) {
    return res.status(404).json({ message: "Utilisateur introuvable." });
  }

  const userRecord = db.users[userIndex];
  const today = new Date().toISOString().split("T")[0];

  // Initialiser ou réinitialiser le quota si c'est un nouveau jour
  if (
    !userRecord.suggestionQuota ||
    userRecord.suggestionQuota.date !== today
  ) {
    userRecord.suggestionQuota = { count: 0, date: today };
  }

  if (userRecord.suggestionQuota.count >= 3) {
    return res.status(429).json({
      message:
        "Vous avez atteint votre quota de 3 suggestions pour aujourd'hui.",
    });
  }

  const mailOptions = {
    from: process.env.GMAIL_USER || "pde.suggestions@gmail.com",
    to: "pde.suggestions@gmail.com",
    subject: `Nouvelle suggestion de ${user.pseudo}`,
    text: `Suggestion de l'utilisateur: ${user.pseudo}\n\n${content}`,
  };

  try {
    await transporter.sendMail(mailOptions);

    // Mise à jour du quota après envoi réussi
    userRecord.suggestionQuota.count++;
    writeAll(db);

    res.json({ message: "Suggestion envoyée avec succès." });
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email:", error);
    res.status(500).json({ message: "Erreur lors de l'envoi de l'email." });
  }
});

module.exports = router;
