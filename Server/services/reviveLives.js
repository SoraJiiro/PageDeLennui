function getTodayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureStore(FileService) {
  if (
    !FileService.data.reviveLives ||
    typeof FileService.data.reviveLives !== "object"
  ) {
    FileService.data.reviveLives = { users: {} };
  }
  if (
    !FileService.data.reviveLives.users ||
    typeof FileService.data.reviveLives.users !== "object"
  ) {
    FileService.data.reviveLives.users = {};
  }
  return FileService.data.reviveLives;
}

function getUserBucket(FileService, pseudo) {
  const store = ensureStore(FileService);
  const key = String(pseudo || "").trim();
  if (!key) return null;

  if (!store.users[key] || typeof store.users[key] !== "object") {
    store.users[key] = {
      lives: 0,
      daily: { date: getTodayKey(), purchased: 0 },
    };
    FileService.save("reviveLives", store);
  }

  const bucket = store.users[key];
  if (!bucket.daily || typeof bucket.daily !== "object") {
    bucket.daily = { date: getTodayKey(), purchased: 0 };
  }

  const today = getTodayKey();
  if (bucket.daily.date !== today) {
    bucket.daily.date = today;
    bucket.daily.purchased = 0;
    FileService.save("reviveLives", store);
  }

  bucket.lives = Math.max(0, Math.floor(Number(bucket.lives) || 0));
  bucket.daily.purchased = Math.max(
    0,
    Math.floor(Number(bucket.daily.purchased) || 0),
  );

  return bucket;
}

function canPurchaseLives(FileService, pseudo, amount, maxPerDay = 3) {
  const qty = Math.max(0, Math.floor(Number(amount) || 0));
  if (!qty) return { ok: false, remaining: 0 };

  const bucket = getUserBucket(FileService, pseudo);
  if (!bucket) return { ok: false, remaining: 0 };

  const remaining = Math.max(0, maxPerDay - bucket.daily.purchased);
  if (qty > remaining) {
    return { ok: false, remaining };
  }

  return { ok: true, remaining };
}

function addLives(FileService, pseudo, amount, maxPerDay = 3) {
  const qty = Math.max(0, Math.floor(Number(amount) || 0));
  if (!qty) return { ok: false, lives: 0, remaining: 0 };

  const store = ensureStore(FileService);
  const bucket = getUserBucket(FileService, pseudo);
  if (!bucket) return { ok: false, lives: 0, remaining: 0 };

  const remaining = Math.max(0, maxPerDay - bucket.daily.purchased);
  if (qty > remaining) {
    return { ok: false, lives: bucket.lives, remaining };
  }

  bucket.lives = Math.max(0, Math.floor(bucket.lives || 0)) + qty;
  bucket.daily.purchased =
    Math.max(0, Math.floor(bucket.daily.purchased || 0)) + qty;

  FileService.save("reviveLives", store);

  return {
    ok: true,
    lives: bucket.lives,
    remaining: maxPerDay - bucket.daily.purchased,
  };
}

function consumeLife(FileService, pseudo) {
  const store = ensureStore(FileService);
  const bucket = getUserBucket(FileService, pseudo);
  if (!bucket) return { used: false, remaining: 0 };

  if (bucket.lives > 0) {
    bucket.lives -= 1;
    FileService.save("reviveLives", store);
    return { used: true, remaining: bucket.lives };
  }

  return { used: false, remaining: bucket.lives };
}

function getLivesCount(FileService, pseudo) {
  const bucket = getUserBucket(FileService, pseudo);
  return bucket ? bucket.lives : 0;
}

module.exports = {
  canPurchaseLives,
  addLives,
  consumeLife,
  getLivesCount,
};
