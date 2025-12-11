const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const DATA_DIR = path.join(__dirname, "..", "data");
const REQUESTS_FILE = path.join(DATA_DIR, "tag_requests.json");

function getRequests() {
  if (!fs.existsSync(REQUESTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveRequests(reqs) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(reqs, null, 2));
}

// Middleware to check if user is logged in
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ message: "Non authentifié" });
  }
}

router.use(requireLogin);

router.get("/status", (req, res) => {
  const user = req.session.user;
  const requests = getRequests();
  const pending = requests.find(
    (r) => r.pseudo === user.pseudo && !r.fulfilled
  );

  if (pending) {
    res.json({ hasPending: true, request: pending });
  } else {
    res.json({ hasPending: false });
  }
});

router.post("/request", (req, res) => {
  const user = req.session.user;
  const { tag } = req.body;

  if (
    !tag ||
    typeof tag !== "string" ||
    tag.trim().length === 0 ||
    tag.length > 15
  ) {
    return res
      .status(400)
      .json({ message: "Tag invalide (max 15 caractères)" });
  }

  // Check cheater
  let cheaters = [];
  try {
    const cheatersPath = path.join(DATA_DIR, "cheaters.json");
    if (fs.existsSync(cheatersPath)) {
      const raw = fs.readFileSync(cheatersPath, "utf8");
      const data = JSON.parse(raw);
      // Handle both array and object format just in case
      if (Array.isArray(data)) {
        cheaters = data;
      } else if (data && Array.isArray(data.cheaters)) {
        cheaters = data.cheaters;
      }
    }
  } catch (e) {
    console.error("Error reading cheaters.json", e);
  }

  if (cheaters.includes(user.pseudo)) {
    return res.status(403).json({ message: "Action interdite." });
  }

  const requests = getRequests();
  const pending = requests.find(
    (r) => r.pseudo === user.pseudo && !r.fulfilled
  );

  if (pending) {
    return res.status(400).json({ message: "Une demande est déjà en cours." });
  }

  const newRequest = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    pseudo: user.pseudo,
    tag: tag.trim(),
    time: Date.now(),
    fulfilled: false,
  };

  requests.push(newRequest);
  saveRequests(requests);

  res.json({ success: true, request: newRequest });
});

module.exports = router;
