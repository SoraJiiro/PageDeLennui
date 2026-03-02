import { showNotif } from "./util.js";

const socket = io();

const walletLine = document.getElementById("wallet-line");
const capLine = document.getElementById("cv-cap");
const capTokensLine = document.getElementById("cv-cap-tokens");
const moneyInput = document.getElementById("cv-money");
const msg = document.getElementById("cv-msg");

const clicksInput = document.getElementById("cv-clicks");
const tokensInput = document.getElementById("cv-tokens");
const clicksPreview = document.getElementById("cv-clicks-preview");
const moneyPreview = document.getElementById("cv-money-preview");
const tokensPreview = document.getElementById("cv-tokens-preview");

let currentWallet = null;

function renderCap(wallet, moneyInputValue = 0) {
  const limitMoney = Number(wallet?.tokenDaily?.limitMoney || 20000);
  const remainingMoney = Number(wallet?.tokenDaily?.remainingMoney || 0);
  const limitTokens = Number(
    wallet?.tokenDaily?.limitTokens || Math.floor(limitMoney / 50),
  );
  const remainingTokens = Number(
    wallet?.tokenDaily?.remainingTokens || Math.floor(remainingMoney / 50),
  );
  // Affiche le quota en tokens (plus lisible pour l'utilisateur)
  capLine.textContent = `Quota conversion monnaie → tokens restant: ${remainingTokens.toLocaleString("fr-FR")} / ${limitTokens.toLocaleString("fr-FR")} tokens`;

  // LIMITS: set max attributes for inputs
  if (moneyInput) {
    const maxMoney = Math.max(
      0,
      Math.floor(Number(wallet?.tokenDaily?.remainingMoney || 0)),
    );
    moneyInput.max = String(maxMoney);
  }
  if (clicksInput) {
    const availableClicks = Math.max(
      0,
      Math.floor(Number(wallet?.clicks || 0)),
    );
    // user can only convert existing clicks; input max is available clicks
    clicksInput.max = String(availableClicks);
  }
  if (tokensInput) {
    const availableTokens = Math.max(
      0,
      Math.floor(Number(wallet?.tokens || 0)),
    );
    tokensInput.max = String(availableTokens);
  }

  // Previews
  // Money -> tokens preview
  const typed = Math.max(0, Math.floor(Number(moneyInputValue) || 0));
  const usableMoney = Math.max(
    0,
    Math.min(typed, remainingMoney) - (Math.min(typed, remainingMoney) % 50),
  );
  const tokenGainPreview = Math.floor(usableMoney / 50);
  if (moneyPreview)
    moneyPreview.textContent = `→ Prévu: ${tokenGainPreview} token(s)`;

  // Clicks -> money preview (5 clicks = 1 money)
  const availableClicks = Math.max(0, Math.floor(Number(wallet?.clicks || 0)));
  const typedClicks = Math.max(0, Math.floor(Number(clicksInput?.value || 0)));
  const boundedClicks = Math.min(typedClicks, availableClicks);
  const usableClicks = boundedClicks - (boundedClicks % 5);
  const moneyGainPreview = Math.floor(usableClicks / 5);
  if (clicksPreview)
    clicksPreview.textContent = `→ Prévu: ${moneyGainPreview} monnaie(s)`;

  // Tokens -> money preview (1 token = 50 money)
  const typedTokens = Math.max(0, Math.floor(Number(tokensInput?.value || 0)));
  const boundedTokens = Math.min(
    typedTokens,
    Math.max(0, Math.floor(Number(wallet?.tokens || 0))),
  );
  const moneyFromTokensPreview = boundedTokens * 50;
  if (tokensPreview)
    tokensPreview.textContent = `→ Prévu: ${moneyFromTokensPreview} monnaie`;
}

function updateWallet(wallet) {
  if (!wallet) return;
  currentWallet = wallet;
  walletLine.textContent = `Monnaie: ${Number(wallet.money || 0).toLocaleString("fr-FR")} | Tokens: ${Number(wallet.tokens || 0).toLocaleString("fr-FR")} | Clicks: ${Number(wallet.clicks || 0).toLocaleString("fr-FR")}`;
  renderCap(wallet, moneyInput?.value || 0);
}

socket.on("connect", () => {
  socket.emit("economy:getWallet");
});

socket.on("economy:wallet", (wallet) => {
  updateWallet(wallet);
});

socket.on("economy:error", (message) => {
  msg.textContent = message || "Erreur conversion";
  showNotif(message || "Erreur conversion", 2500);
});

document.getElementById("cv-clicks-btn")?.addEventListener("click", () => {
  const inputEl = document.getElementById("cv-clicks");
  let v = Math.max(0, Math.floor(Number(inputEl?.value || 0)));
  const maxV = Number(inputEl?.max || 0);
  if (v > maxV) v = maxV;
  // enforce multiple of 5
  v = v - (v % 5);
  if (v <= 0) return showNotif("Montant invalide", 2000);
  socket.emit("economy:convertClicksToMoney", { clicks: v });
});

document.getElementById("cv-money-btn")?.addEventListener("click", () => {
  let v = Math.max(0, Math.floor(Number(moneyInput?.value || 0)));
  const maxV = Number(moneyInput?.max || 0);
  if (v > maxV) v = maxV;
  // enforce multiple of 50
  v = v - (v % 50);
  if (v <= 0) return showNotif("Montant invalide", 2000);
  socket.emit("economy:convertMoneyToTokens", { money: v });
});

document.getElementById("cv-tokens-btn")?.addEventListener("click", () => {
  const inputEl = document.getElementById("cv-tokens");
  let v = Math.max(0, Math.floor(Number(inputEl?.value || 0)));
  const maxV = Number(inputEl?.max || 0);
  if (v > maxV) v = maxV;
  if (v <= 0) return showNotif("Montant invalide", 2000);
  socket.emit("economy:convertTokensToMoney", { tokens: v });
});

moneyInput?.addEventListener("input", () => {
  if (!currentWallet) return;
  renderCap(currentWallet, moneyInput.value);
});

clicksInput?.addEventListener("input", () => {
  if (!currentWallet) return;
  // clamp to max
  const maxV = Number(clicksInput.max || 0);
  let v = Math.max(0, Math.floor(Number(clicksInput.value || 0)));
  if (v > maxV) {
    clicksInput.value = String(maxV);
    v = maxV;
  }
  renderCap(currentWallet, moneyInput?.value || 0);
});

tokensInput?.addEventListener("input", () => {
  if (!currentWallet) return;
  const maxV = Number(tokensInput.max || 0);
  let v = Math.max(0, Math.floor(Number(tokensInput.value || 0)));
  if (v > maxV) {
    tokensInput.value = String(maxV);
    v = maxV;
  }
  renderCap(currentWallet, moneyInput?.value || 0);
});
