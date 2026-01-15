const { Server } = require("socket.io");

function createIo(server) {
  return new Server(server);
}

module.exports = { createIo };
