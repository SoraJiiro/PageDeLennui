const { getIpFromSocket, persistBanIp } = require("./util");

const connectionHistory = new Map(); // IP -> [timestamp, timestamp, ...]
const TIME_WINDOW = 2000; // 2 seconds
const MAX_CONNECTIONS = 3;

function checkReconnect(io, socket) {
  const ip = getIpFromSocket(socket);
  if (!ip) return;

  const now = Date.now();
  let timestamps = connectionHistory.get(ip) || [];

  // Filter out timestamps older than the time window
  timestamps = timestamps.filter((t) => now - t < TIME_WINDOW);

  // Add current timestamp
  timestamps.push(now);
  connectionHistory.set(ip, timestamps);

  if (timestamps.length >= MAX_CONNECTIONS) {
    console.log(
      `\n🚫 Banning ${ip} for rapid reconnection (${timestamps.length} in ${TIME_WINDOW}ms)\n`
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
