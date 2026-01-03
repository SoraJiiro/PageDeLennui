const { getIpFromSocket, persistBanIp } = require("./util");

const connectionHistory = new Map(); // IP -> [horodatage, horodatage, ...]
const TIME_WINDOW = 1250; // 1.25 secondes
const MAX_CONNECTIONS = 5; // Max 5 connexions dans la fenêtre de temps

function checkReconnect(io, socket) {
  const ip = getIpFromSocket(socket);
  if (!ip || ip === "::1") return;

  const now = Date.now();
  let timestamps = connectionHistory.get(ip) || [];

  // Filtrer les horodatages plus anciens que la fenêtre de temps
  timestamps = timestamps.filter((t) => now - t < TIME_WINDOW);

  // Ajouter l'horodatage actuel
  timestamps.push(now);
  connectionHistory.set(ip, timestamps);

  if (timestamps.length >= MAX_CONNECTIONS) {
    console.log(
      `\n🚫 ${ip} Banni pour reconnexion rapide (${timestamps.length} en ${
        TIME_WINDOW / 1000
      }s)\n`
    );
    persistBanIp(ip);
    io.emit(
      "system:info",
      "Un utilisateur a été banni pour reconnexion rapide."
    );
    socket.disconnect(true);
    connectionHistory.delete(ip);
  }
}

module.exports = { checkReconnect };
