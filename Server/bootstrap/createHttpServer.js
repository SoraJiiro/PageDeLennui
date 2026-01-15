const http = require("http");

function createHttpServer(app) {
  return http.createServer(app);
}

module.exports = { createHttpServer };
