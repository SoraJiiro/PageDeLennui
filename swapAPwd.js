#!/usr/bin/env node
// Script CLI pour réinitialiser le mot de passe de l'utilisateur Admin.

const bcrypt = require("bcryptjs");
const readline = require("readline");
const dbUsers = require("./Server/db/dbUsers");

function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.stdoutMuted = true;
    rl._writeToOutput = function (stringToWrite) {
      if (rl.stdoutMuted && !/\r?\n$/.test(stringToWrite)) {
        rl.output.write("*");
        return;
      }
      rl.output.write(stringToWrite);
    };

    rl.question(query, (answer) => {
      rl.stdoutMuted = false;
      rl.close();
      rl.output.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  try {
    let password = process.argv[2] ? process.argv[2].trim() : "";

    if (!password) {
      const first = (await askHidden("Nouveau mot de passe Admin : ")).trim();
      const second = (await askHidden("Confirmer le mot de passe : ")).trim();
      if (first !== second) {
        console.error("Les mots de passe ne correspondent pas.");
        process.exit(1);
      }
      password = first;
    }

    if (!password) {
      console.error("Un mot de passe non vide est requis.");
      process.exit(1);
    }

    const hashed = await bcrypt.hash(password, 12);
    const updated = dbUsers.updateUserFields("Admin", {
      password,
      passwordHashé: hashed,
    });

    if (!updated) {
      console.error("Utilisateur Admin introuvable.");
      process.exit(1);
    }

    console.log(
      "Le mot de passe de l'utilisateur Admin a été mis à jour avec succès.",
    );
  } catch (error) {
    console.error(
      "Erreur lors de la mise à jour du mot de passe :",
      error.message,
    );
    process.exit(1);
  }
}

main();
