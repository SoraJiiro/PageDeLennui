const { Server } = require("socket.io");

function createIo(server) {
  // Allow large binary payloads (uploads up to 100MB)
  const io = new Server(server, {
    maxHttpBufferSize: 100 * 1024 * 1024,
  });
  return io;
}

module.exports = { createIo };
