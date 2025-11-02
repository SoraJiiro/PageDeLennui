const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA, "users.json");

function ensureFile() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  if (!fs.existsSync(USERS_FILE))
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}

function readAll() {
  ensureFile();
  const raw = fs.readFileSync(USERS_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeAll(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
}

function findBypseudo(pseudo) {
  const db = readAll();
  return (
    db.users.find(
      (u) => u.pseudo.toLowerCase() === String(pseudo).toLowerCase()
    ) || null
  );
}

function countByIp(ip) {
  const db = readAll();
  return db.users.filter((u) => u.createdFromIp === ip).length;
}

function createUser({ id, pseudo, passHash, createdFromIp }) {
  const db = readAll();
  db.users.push({
    id,
    pseudo,
    passHash,
    createdFromIp,
    createdAt: new Date().toISOString(),
  });
  writeAll(db);
}

function findById(id) {
  const db = readAll();
  return db.users.find((u) => u.id === id) || null;
}

module.exports = { findBypseudo, findById, countByIp, createUser };
