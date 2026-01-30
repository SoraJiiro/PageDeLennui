const { FileService } = require("../util");

const medalsList = [
  { nom: "Bronze", pallier: 2500 },
  { nom: "Argent", pallier: 5000 },
  { nom: "Or", pallier: 10000 },
  { nom: "Diamant", pallier: 20000 },
  { nom: "Rubis", pallier: 40000 },
  { nom: "Saphir", pallier: 80000 },
  { nom: "Légendaire", pallier: 160000 },
];

function generatePrestigeMedals() {
  const prestige = [];
  let precedente = medalsList[medalsList.length - 1];

  for (let idx = 8; idx <= 21; idx++) {
    const pallierTemp = precedente.pallier * 1.8;
    const pallier = Math.ceil(pallierTemp - 50);
    prestige.push({
      nom: `Médaille Prestige - ${idx}`,
      pallier: pallier,
    });
    precedente = { pallier };
  }

  return prestige;
}

const allMedals = [...medalsList, ...generatePrestigeMedals()];

const baseColors = {
  Bronze: ["#cd7f32"],
  Argent: ["#c0c0c0"],
  Or: ["#ffd700"],
  Diamant: ["#b9f2ff"],
  Rubis: ["#e0115f"],
  Saphir: ["#0f52ba"],
  Légendaire: [
    "#ff0000",
    "#ff7f00",
    "#ffff00",
    "#00ff00",
    "#0000ff",
    "#4b0082",
    "#9400d3",
  ],
};

function generateRandomColors() {
  const colors = [];
  while (colors.length < 12) {
    const h = Math.floor(Math.random() * 360);
    const s = 70 + Math.floor(Math.random() * 25);
    const l = 35 + Math.floor(Math.random() * 20);
    colors.push(`hsl(${h}, ${s}%, ${l}%)`);
  }
  return colors;
}

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

function recalculateMedals(pseudo, clicks, io, silent = false, strict = false) {
  if (!FileService.data.medals) FileService.data.medals = {};

  if (clicks < 0) {
    if (!FileService.data.cheaters) FileService.data.cheaters = [];
    if (!FileService.data.cheaters.includes(pseudo)) {
      FileService.data.cheaters.push(pseudo);
      FileService.save("cheaters", FileService.data.cheaters);
    }
  }

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

  for (const medal of allMedals) {
    const condition = strict
      ? clicks >= medal.pallier
      : clicks >= medal.pallier || existingNames.has(medal.nom);

    if (condition) {
      let colors = existingColors[medal.nom] || [];

      if (colors.length === 0) {
        if (baseColors[medal.nom]) {
          colors = baseColors[medal.nom];
        } else if (medal.nom.startsWith("Médaille Prestige")) {
          colors = generateRandomColors();
        }
      }

      userMedals.push({
        name: medal.nom,
        colors: colors,
      });

      if (!existingNames.has(medal.nom)) {
        newUnlocked.push(medal.nom);
      }
    }
  }

  if (!strict) {
    existingMedals.forEach((m) => {
      const mName = typeof m === "string" ? m : m.name;
      if (mName === "Tricheur") return;

      if (!userMedals.find((um) => um.name === mName)) {
        let colors = [];
        if (
          typeof m === "object" &&
          Array.isArray(m.colors) &&
          m.colors.length > 0
        ) {
          colors = m.colors;
        } else if (existingColors[mName]) {
          colors = existingColors[mName];
        }

        userMedals.push({
          name: mName,
          colors: colors,
        });
      }
    });
  }

  userMedals.sort((a, b) => {
    const palierA =
      allMedals.find((m) => m.nom === a.name)?.pallier ||
      (a.name === "Tricheur" ? -1 : 0);
    const palierB =
      allMedals.find((m) => m.nom === b.name)?.pallier ||
      (b.name === "Tricheur" ? -1 : 0);
    return palierA - palierB;
  });

  FileService.data.medals[pseudo] = userMedals;
  FileService.save("medals", FileService.data.medals);

  if (newUnlocked.length > 0 && !silent) {
    console.log(`🏅 [${pseudo}] a débloqué ${newUnlocked.join(", ")} (Recalc)`);
  }

  if (io) {
    io.sockets.sockets.forEach((socket) => {
      const user = socket.handshake.session?.user;
      if (user && user.pseudo === pseudo) {
        const normalized = userMedals.map((m) => ({
          name: m.name,
          colors: m.colors || [],
        }));

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

module.exports = { recalculateMedals, broadcastSystemMessage };
