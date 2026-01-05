const { FileService } = require("./util");

// Liste des médailles avec leurs paliers
const medalsList = [
  { nom: "Bronze", pallier: 2500 },
  { nom: "Argent", pallier: 5000 },
  { nom: "Or", pallier: 10000 },
  { nom: "Diamant", pallier: 20000 },
  { nom: "Rubis", pallier: 40000 },
  { nom: "Saphir", pallier: 80000 },
  { nom: "Légendaire", pallier: 160000 },
];

// Générer les médailles Prestige (8 à 21)
function generatePrestigeMedals() {
  const prestige = [];
  let precedente = medalsList[medalsList.length - 1];

  for (let idx = 8; idx <= 21; idx++) {
    let pallierTemp = precedente.pallier * 2;
    let pallier = Math.ceil(pallierTemp * 0.78 - 6500);
    prestige.push({
      nom: `Médaille Prestige - ${idx}`,
      pallier: pallier,
    });
    precedente = { pallier };
  }

  return prestige;
}

const allMedals = [...medalsList, ...generatePrestigeMedals()];

function broadcastSystemMessage(io, text, persist = false) {
  if (!io) return;
  const payload = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    name: "Système",
    text: text,
    at: new Date().toISOString(),
    tag: { text: "System", color: "#ff0000" },
  };
  io.emit("chat:message", payload);
  if (persist) {
    FileService.data.historique.push(payload);
    if (FileService.data.historique.length > 200) {
      FileService.data.historique = FileService.data.historique.slice(-200);
    }
    FileService.save("historique", FileService.data.historique);
    FileService.appendLog(payload);
  }
}

// Fonction pour recalculer les médailles d'un utilisateur en fonction de ses clicks
function recalculateMedals(pseudo, clicks, io) {
  if (!FileService.data.medals) FileService.data.medals = {};

  // Gestion des tricheurs (score négatif)
  if (clicks < 0) {
    if (!FileService.data.cheaters) FileService.data.cheaters = [];
    if (!FileService.data.cheaters.includes(pseudo)) {
      FileService.data.cheaters.push(pseudo);
      FileService.save("cheaters", FileService.data.cheaters);
    }
  }

  // Récupérer les médailles existantes pour préserver les couleurs générées
  const existingMedals = FileService.data.medals[pseudo] || [];
  const existingColors = {};
  const existingNames = new Set();

  existingMedals.forEach((medal) => {
    if (typeof medal === "string") {
      existingNames.add(medal);
    } else {
      existingNames.add(medal.name);
      if (medal.colors && medal.colors.length > 0) {
        existingColors[medal.name] = medal.colors;
      }
    }
  });

  const userMedals = [];
  const newUnlocked = [];

  // Déterminer quelles médailles l'utilisateur devrait avoir
  for (const medal of allMedals) {
    if (clicks >= medal.pallier) {
      userMedals.push({
        name: medal.nom,
        colors: existingColors[medal.nom] || [],
      });

      if (!existingNames.has(medal.nom)) {
        newUnlocked.push(medal.nom);
      }
    }
  }

  // Mettre à jour les médailles de l'utilisateur
  FileService.data.medals[pseudo] = userMedals;
  FileService.save("medals", FileService.data.medals);

  // Log des nouvelles médailles
  if (newUnlocked.length > 0) {
    const msg = `${pseudo} a débloqué : ${newUnlocked.join(", ")} !`;
    console.log(`🏅 [${pseudo}] a débloqué ${newUnlocked.join(", ")} (Recalc)`);
    broadcastSystemMessage(io, msg, true);
  }

  // Si l'utilisateur est connecté, lui envoyer ses nouvelles médailles
  if (io) {
    // Trouver les sockets de l'utilisateur
    // On peut itérer sur tous les sockets ou utiliser une map si disponible
    // Ici on itère comme dans le code original
    io.sockets.sockets.forEach((socket) => {
      const user = socket.handshake.session?.user;
      if (user && user.pseudo === pseudo) {
        // Normaliser pour l'envoi
        const normalized = userMedals.map((m) => ({
          name: m.name,
          colors: m.colors || [],
        }));

        // Si tricheur, ajouter la médaille Tricheur
        if (
          FileService.data.cheaters &&
          FileService.data.cheaters.includes(pseudo)
        ) {
          if (!normalized.find((m) => m.name === "Tricheur")) {
            normalized.unshift({
              name: "Tricheur",
              colors: [
                "#dcdcdc",
                "#ffffff",
                "#222",
                "#dcdcdc",
                "#ffffff",
                "#222",
              ],
            });
          }
        }

        socket.emit("clicker:medals", normalized);
      }
    });
  }

  return userMedals;
}

module.exports = { recalculateMedals };
