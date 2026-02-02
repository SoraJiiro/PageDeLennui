const fs = require("fs");
const path = require("path");
const config = require("../config");

const USERS_FILE = path.join(config.DATA, "users.json");

function ensureFile() {
  if (!fs.existsSync(config.DATA))
    fs.mkdirSync(config.DATA, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
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
      (u) => u.pseudo.toLowerCase() === String(pseudo).toLowerCase(),
    ) || null
  );
}

function findByPseudoExact(pseudo) {
  const db = readAll();
  return db.users.find((u) => u.pseudo === String(pseudo)) || null;
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

function updateUserFields(pseudo, changes) {
  if (!pseudo || !changes || typeof changes !== "object") return null;
  const db = readAll();
  const lower = String(pseudo).toLowerCase();
  const index = db.users.findIndex((u) => u.pseudo.toLowerCase() === lower);
  if (index === -1) return null;
  db.users[index] = {
    ...db.users[index],
    ...changes,
  };
  writeAll(db);
  return db.users[index];
}

function updateUserMashKey(pseudo, key) {
  const db = readAll();
  const index = db.users.findIndex(
    (u) => u.pseudo.toLowerCase() === String(pseudo).toLowerCase(),
  );
  if (index !== -1) {
    db.users[index].mashKey = key;
    writeAll(db);
    return true;
  }
  return false;
}

function deleteUser(pseudo) {
  const db = readAll();
  const index = db.users.findIndex(
    (u) => u.pseudo.toLowerCase() === String(pseudo).toLowerCase(),
  );
  if (index !== -1) {
    db.users.splice(index, 1);
    writeAll(db);
    return true;
  }
  return false;
}

module.exports = {
  readAll,
  writeAll,
  findBypseudo,
  findByPseudoExact,
  findById,
  countByIp,
  createUser,
  deleteUser,
  updateUserFields,
  updateUserMashKey,
};
