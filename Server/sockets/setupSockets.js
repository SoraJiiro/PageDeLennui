function setupSockets(io, { checkReconnect, initSocketHandlers, gameState }) {
  io.on("connection", (socket) => {
    checkReconnect(io, socket);
    initSocketHandlers(io, socket, gameState);
  });
}

module.exports = { setupSockets };
