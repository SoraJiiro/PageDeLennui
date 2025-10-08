const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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

function findByUsername(username) {
  const db = readAll();
  return (
    db.users.find(
      (u) => u.username.toLowerCase() === String(username).toLowerCase()
    ) || null
  );
}

function countByIp(ip) {
  const db = readAll();
  return db.users.filter((u) => u.createdFromIp === ip).length;
}

function createUser({ id, username, passHash, createdFromIp }) {
  const db = readAll();
  db.users.push({
    id,
    username,
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

module.exports = { findByUsername, findById, countByIp, createUser };
