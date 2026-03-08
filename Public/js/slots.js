export function initSlots(socket) {
  const input = document.getElementById("slots-bet-amount");
  const spinBtn = document.getElementById("slots-spin");
  const reels = document.getElementById("slots-reels");
  const reelEls = Array.from(
    document.querySelectorAll("#slots-reels .slots-reel"),
  );
  const reelSymbols = reelEls
    .map((el) => el.querySelector(".slots-reel-symbol"))
    .filter(Boolean);
  const result = document.getElementById("slots-result");

  if (!input || !spinBtn || !reels || !result || reelSymbols.length < 3) return;

  let tokens = 0;
  let rolling = false;
  const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣"];

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function animateReel(index, finalSymbol, stopAfterMs) {
    const reel = reelEls[index];
    const symbolEl = reelSymbols[index];
    if (!reel || !symbolEl) return;

    reel.classList.add("is-spinning");

    let spinIndex = Math.floor(Math.random() * symbols.length);
    const intervalId = setInterval(() => {
      spinIndex = (spinIndex + 1) % symbols.length;
      symbolEl.textContent = symbols[spinIndex];
    }, 70);

    await wait(stopAfterMs);
    clearInterval(intervalId);
    symbolEl.textContent = finalSymbol;
    reel.classList.remove("is-spinning");
    reel.classList.add("is-stop-bounce");
    setTimeout(() => reel.classList.remove("is-stop-bounce"), 320);
  }

  async function animateSpin(finalReels) {
    const finals = Array.isArray(finalReels) ? finalReels : ["❔", "❔", "❔"];
    await Promise.all([
      animateReel(0, finals[0] || "❔", 1100),
      animateReel(1, finals[1] || "❔", 1550),
      animateReel(2, finals[2] || "❔", 2050),
    ]);
  }

  function unlockSpin() {
    rolling = false;
    spinBtn.disabled = false;
  }

  socket.on("economy:wallet", (payload) => {
    tokens = Math.max(0, Number(payload?.tokens || 0));
    input.max = String(tokens);
  });

  spinBtn.onclick = () => {
    if (rolling) return;

    const amount = Math.max(0, Math.floor(Number(input.value) || 0));
    if (amount <= 0) {
      result.textContent = "Mise invalide";
      result.className = "slots-result lose";
      return;
    }
    if (amount > tokens) {
      result.textContent = "Pas assez de tokens";
      result.className = "slots-result lose";
      return;
    }

    rolling = true;
    spinBtn.disabled = true;
    result.textContent = "Roulage en cours...";
    result.className = "slots-result";
    socket.emit("slots:spin", { amount });
  };

  socket.on("slots:result", async (data) => {
    if (!data) return;
    await animateSpin(data.reels);

    if (data.won) {
      const payout = Number(data.payout || 0);
      const amount = Number(data.amount || 0);
      const net = Math.max(0, payout - amount);
      const mult = Number(data.multiplier || 0);
      result.textContent = `Gagné ! x${mult.toLocaleString("fr-FR", {
        minimumFractionDigits: Number.isInteger(mult) ? 0 : 2,
        maximumFractionDigits: 2,
      })} | +${payout.toLocaleString("fr-FR")} tokens (net +${net.toLocaleString("fr-FR")})`;
      result.className = "slots-result win";
    } else {
      const amount = Number(data.amount || 0);
      result.textContent = `Perdu ! -${amount.toLocaleString("fr-FR")} token(s)`;
      result.className = "slots-result lose";
    }

    unlockSpin();
  });

  socket.on("slots:error", (msg) => {
    result.textContent = msg || "Erreur slots";
    result.className = "slots-result lose";
    unlockSpin();
  });
}
