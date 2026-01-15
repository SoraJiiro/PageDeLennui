const express = require("express");
const sharedSession = require("express-socket.io-session");

function setupMiddleware(app, io, { expressSession, blacklistMiddleware }) {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(expressSession);
  app.use(blacklistMiddleware);

  io.use(sharedSession(expressSession, { autoSave: true }));
}

module.exports = { setupMiddleware };
