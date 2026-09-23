const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const readline = require("readline");
const dbUsers = require("./Server/dbUsers");

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.stdoutMuted = true;
    rl._writeToOutput = (text) => {
      if (rl.stdoutMuted && !/\r?\n$/.test(text)) {
        rl.output.write("*");
        return;
      }
      rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.stdoutMuted = false;
      rl.close();
      rl.output.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  const choice = (
    await ask("Créer quel compte ? [1] Admin / [2] Admin2 : ")
  ).toLowerCase();
  const pseudo =
    choice === "1" || choice === "admin"
      ? "Admin"
      : choice === "2" || choice === "admin2"
        ? "Admin2"
        : null;

  if (!pseudo) {
    console.error("Choix invalide.");
    process.exitCode = 1;
    return;
  }

  if (dbUsers.findBypseudo(pseudo)) {
    console.log(
      `Le compte ${pseudo} existe déjà. Aucune modification effectuée.`,
    );
    return;
  }

  const password = await askHidden(`Mot de passe ${pseudo} : `);
  const confirmation = await askHidden("Confirmer le mot de passe : ");

  if (!password) {
    console.error("Le mot de passe ne peut pas être vide.");
    process.exitCode = 1;
    return;
  }
  if (password !== confirmation) {
    console.error("Les mots de passe ne correspondent pas.");
    process.exitCode = 1;
    return;
  }

  const confirmed = (
    await ask(`Confirmer la création de ${pseudo} ? [y/N] `)
  ).toLowerCase();
  if (!["y", "yes", "o", "oui"].includes(confirmed)) {
    console.log("Création annulée.");
    return;
  }

  const db = dbUsers.readAll();
  if (
    db.users.some((user) => user.pseudo.toLowerCase() === pseudo.toLowerCase())
  ) {
    console.log(
      `Le compte ${pseudo} existe déjà. Aucune modification effectuée.`,
    );
    return;
  }

  db.users.push({
    id: crypto.randomUUID(),
    pseudo,
    passwordHashé: await bcrypt.hash(password, 12),
    creeDepuis: "CLI",
    creeAt: new Date().toISOString(),
  });
  dbUsers.writeAll(db);
  console.log(`Le compte ${pseudo} a été créé.`);
}

main().catch((error) => {
  console.error("Erreur lors de la création du compte :", error.message);
  process.exitCode = 1;
});
