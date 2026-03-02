function getTodayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const logger = require("../logger");

// Limite quotidienne exprimée en monnaie. Pour autoriser 750 tokens/jour,
// la limite en monnaie doit être 750 * 50 = 37 500.
const TOKEN_DAILY_MONEY_LIMIT = 37500;

function ensureWalletStore(FileService) {
  if (
    !FileService.data.wallets ||
    typeof FileService.data.wallets !== "object"
  ) {
    FileService.data.wallets = {};
  }
  return FileService.data.wallets;
}

function normalizeWallet(raw, fallbackClicks = 0) {
  const money = Number.isFinite(Number(raw?.money))
    ? Math.max(0, Math.floor(Number(raw.money)))
    : Math.max(0, Math.floor(Number(fallbackClicks) / 5));

  const tokens = Number.isFinite(Number(raw?.tokens))
    ? Math.max(0, Math.floor(Number(raw.tokens)))
    : 0;

  const tokenDaily =
    raw && typeof raw.tokenDaily === "object" ? raw.tokenDaily : {};
  const spentMoney = Number.isFinite(Number(tokenDaily.spentMoney))
    ? Math.max(0, Math.floor(Number(tokenDaily.spentMoney)))
    : 0;

  return {
    money,
    tokens,
    tokenDaily: {
      date:
        typeof tokenDaily.date === "string" ? tokenDaily.date : getTodayKey(),
      spentMoney,
    },
  };
}

function ensureWallet(FileService, pseudo, currentClicks = 0) {
  const wallets = ensureWalletStore(FileService);
  const existing = wallets[pseudo];
  const normalized = normalizeWallet(existing, currentClicks);

  if (!existing || JSON.stringify(existing) !== JSON.stringify(normalized)) {
    wallets[pseudo] = normalized;
    FileService.save("wallets", wallets);
  }

  if (wallets[pseudo].tokenDaily.date !== getTodayKey()) {
    wallets[pseudo].tokenDaily = { date: getTodayKey(), spentMoney: 0 };
    FileService.save("wallets", wallets);
  }

  return wallets[pseudo];
}

function migrateWalletsFromClicks(FileService) {
  const wallets = ensureWalletStore(FileService);
  const clicks = FileService.data.clicks || {};
  let changed = false;

  for (const [pseudo, score] of Object.entries(clicks)) {
    if (!wallets[pseudo]) {
      wallets[pseudo] = normalizeWallet(null, score);
      changed = true;
    }
  }

  if (changed) FileService.save("wallets", wallets);
}

function getWalletView(wallet) {
  const remainingMoney = Math.max(
    0,
    TOKEN_DAILY_MONEY_LIMIT - wallet.tokenDaily.spentMoney,
  );
  return {
    money: wallet.money,
    tokens: wallet.tokens,
    tokenDaily: {
      date: wallet.tokenDaily.date,
      spentMoney: wallet.tokenDaily.spentMoney,
      remainingMoney,
      limitMoney: TOKEN_DAILY_MONEY_LIMIT,
      remainingTokens: Math.floor(remainingMoney / 50),
      limitTokens: Math.floor(TOKEN_DAILY_MONEY_LIMIT / 50),
    },
  };
}

function getWallet(FileService, pseudo, currentClicks = 0) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const view = getWalletView(wallet);
  // expose clicks available to the client for UI limits
  view.clicks = Math.max(
    0,
    Math.floor(
      Number(FileService.data.clicks?.[pseudo]) || Number(currentClicks) || 0,
    ),
  );
  return view;
}

// Retourne la vue du wallet sans créer ni persister d'entrée dans le store.
function peekWallet(FileService, pseudo, currentClicks = 0) {
  const wallets = FileService.data.wallets || {};
  const existing = wallets[pseudo];
  const normalized = normalizeWallet(existing, currentClicks);
  const view = getWalletView(normalized);
  view.clicks = Math.max(
    0,
    Math.floor(
      Number(FileService.data.clicks?.[pseudo]) || Number(currentClicks) || 0,
    ),
  );
  return view;
}

function convertClicksToMoney({
  FileService,
  pseudo,
  clicksAmount,
  currentClicks = 0,
}) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const raw = Math.floor(Number(clicksAmount) || 0);
  if (raw <= 0) {
    const message = "Montant invalide";
    logger.warn(`[convertClicksToMoney] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }

  const availableClicks = Math.max(
    0,
    Math.floor(Number(FileService.data.clicks?.[pseudo]) || 0),
  );
  if (availableClicks < 5) {
    const message = "Pas assez de clicks";
    logger.warn(`[convertClicksToMoney] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }

  const bounded = Math.min(raw, availableClicks);
  const usableClicks = bounded - (bounded % 5);
  if (usableClicks <= 0) {
    const message = "Conversion minimale: 5 clicks";
    logger.warn(`[convertClicksToMoney] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }

  const moneyGain = Math.floor(usableClicks / 5);
  FileService.data.clicks[pseudo] = availableClicks - usableClicks;
  wallet.money += moneyGain;

  FileService.save("clicks", FileService.data.clicks);
  FileService.save("wallets", ensureWalletStore(FileService));

  const result = {
    ok: true,
    clicksSpent: usableClicks,
    moneyGain,
    wallet: getWalletView(wallet),
    clicks: FileService.data.clicks[pseudo],
  };

  logger.action(
    `[convertClicksToMoney] ${pseudo} converted ${usableClicks} clicks -> +${moneyGain} money (remainingClicks:${result.clicks})`,
  );
  return result;
}

function convertMoneyToTokens({
  FileService,
  pseudo,
  moneyAmount,
  currentClicks = 0,
}) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const raw = Math.floor(Number(moneyAmount) || 0);
  if (raw <= 0) {
    const message = "Montant invalide";
    logger.warn(`[convertMoneyToTokens] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }

  if (wallet.tokenDaily.date !== getTodayKey()) {
    wallet.tokenDaily = { date: getTodayKey(), spentMoney: 0 };
  }

  const remainingCap = Math.max(
    0,
    TOKEN_DAILY_MONEY_LIMIT - wallet.tokenDaily.spentMoney,
  );
  if (remainingCap < 50) {
    const message = "Quota quotidien atteint";
    logger.warn(`[convertMoneyToTokens] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }

  const amount = Math.min(raw, wallet.money, remainingCap);
  const usable = amount - (amount % 50);
  if (usable <= 0) {
    const message = "Conversion minimale: 50 monnaie";
    logger.warn(`[convertMoneyToTokens] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }

  const tokenGain = Math.floor(usable / 50);
  wallet.money -= usable;
  wallet.tokens += tokenGain;
  wallet.tokenDaily.spentMoney += usable;

  FileService.save("wallets", ensureWalletStore(FileService));

  const result = {
    ok: true,
    moneySpent: usable,
    tokenGain,
    wallet: getWalletView(wallet),
  };

  logger.action(
    `[convertMoneyToTokens] ${pseudo} converted ${usable} money -> +${tokenGain} tokens (spentToday:${wallet.tokenDaily.spentMoney})`,
  );
  return result;
}

function convertTokensToMoney({
  FileService,
  pseudo,
  tokenAmount,
  currentClicks = 0,
}) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const amount = Math.floor(Number(tokenAmount) || 0);
  if (amount <= 0) {
    const message = "Montant invalide";
    logger.warn(`[convertTokensToMoney] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }
  if (wallet.tokens < amount) {
    const message = "Pas assez de tokens";
    logger.warn(`[convertTokensToMoney] ${pseudo} failed: ${message}`);
    return { ok: false, message };
  }

  const moneyGain = amount * 50;
  wallet.tokens -= amount;
  wallet.money += moneyGain;

  FileService.save("wallets", ensureWalletStore(FileService));

  const result = {
    ok: true,
    tokensSpent: amount,
    moneyGain,
    wallet: getWalletView(wallet),
  };

  logger.action(
    `[convertTokensToMoney] ${pseudo} converted ${amount} tokens -> +${moneyGain} money (remainingTokens:${result.wallet.tokens})`,
  );
  return result;
}

function canSpendTokens(FileService, pseudo, amount, currentClicks = 0) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  return wallet.tokens >= cost;
}

function spendTokens(FileService, pseudo, amount, currentClicks = 0) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (wallet.tokens < cost) return { ok: false, wallet: getWalletView(wallet) };
  wallet.tokens -= cost;
  FileService.save("wallets", ensureWalletStore(FileService));
  return { ok: true, wallet: getWalletView(wallet) };
}

function addTokens(FileService, pseudo, amount, currentClicks = 0) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (gain > 0) {
    wallet.tokens += gain;
    FileService.save("wallets", ensureWalletStore(FileService));
    try {
      // Met à jour le monitoring des gains journaliers (tokens earned)
      const { recordDailyEarned } = require("./economy");
      recordDailyEarned({ FileService, pseudo, amount: gain, currentClicks });
    } catch (e) {}
  }
  return getWalletView(wallet);
}

function addMoney(FileService, pseudo, amount, currentClicks = 0) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  if (gain > 0) {
    wallet.money += gain;
    FileService.save("wallets", ensureWalletStore(FileService));
  }
  return getWalletView(wallet);
}

function canSpendMoney(FileService, pseudo, amount, currentClicks = 0) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  return wallet.money >= cost;
}

function spendMoney(FileService, pseudo, amount, currentClicks = 0) {
  const wallet = ensureWallet(FileService, pseudo, currentClicks);
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (wallet.money < cost) return { ok: false, wallet: getWalletView(wallet) };
  wallet.money -= cost;
  FileService.save("wallets", ensureWalletStore(FileService));
  return { ok: true, wallet: getWalletView(wallet) };
}

module.exports = {
  migrateWalletsFromClicks,
  ensureWallet,
  getWallet,
  peekWallet,
  convertClicksToMoney,
  convertMoneyToTokens,
  convertTokensToMoney,
  canSpendTokens,
  spendTokens,
  addTokens,
  addMoney,
  canSpendMoney,
  spendMoney,
};
