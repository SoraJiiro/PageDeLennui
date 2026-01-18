export function initCoinFlip(socket) {
  const coin = document.getElementById("coin");
  const betInput = document.getElementById("cf-bet-amount");
  const betMaxInfo = document.getElementById("cf-bet-max");
  const btnHeads = document.getElementById("cf-btn-heads");
  const btnTails = document.getElementById("cf-btn-tails");
  const resultMsg = document.getElementById("cf-result");
  const quickBtns = document.querySelectorAll(".quick-bet-btn");

  let isFlipping = false;
  let currentScore = 0;

  function updateMaxBetUI() {
    const maxBet = Math.max(0, Math.floor(currentScore || 0));
    if (betInput) betInput.max = String(maxBet);
    if (betMaxInfo) {
      betMaxInfo.textContent = `Mise max : ${maxBet.toLocaleString(
        "fr-FR",
      )} (100% de vos clicks)`;
    }
  }

  updateMaxBetUI();

  // Écouter les mises à jour du score depuis le serveur
  socket.on("clicker:you", (data) => {
    currentScore = data.score;
    updateMaxBetUI();
  });

  socket.on("clicker:update", (data) => {
    currentScore = data.score;
    updateMaxBetUI();
  });

  // Boutons de mise rapide
  quickBtns.forEach((btn) => {
    // Supprimer les écouteurs existants pour éviter les doublons si réinitialisé
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", () => {
      const percent = parseInt(newBtn.dataset.percent);

      if (!isNaN(percent) && currentScore > 0) {
        const betAmount = Math.floor(currentScore * (percent / 100));
        betInput.value = betAmount;
      } else {
        betInput.value = 0;
      }
    });
  });

  if (betInput) {
    betInput.addEventListener("input", () => {
      if (betInput.value === "") return;
      const val = parseInt(betInput.value);
      const maxBet = Math.max(0, Math.floor(currentScore || 0));
      if (!isNaN(val) && val > maxBet) betInput.value = maxBet;
    });
  }

  function placeBet(side) {
    if (isFlipping) return;

    const amount = parseInt(betInput.value);
    if (isNaN(amount) || amount <= 0) {
      resultMsg.textContent = "Mise invalide !";
      resultMsg.className = "result-message lose";
      return;
    }

    // Désactiver les contrôles
    isFlipping = true;
    btnHeads.disabled = true;
    btnTails.disabled = true;
    betInput.disabled = true;
    resultMsg.textContent = "Lancement de la pièce...";
    resultMsg.className = "result-message";

    // Réinitialiser l'animation
    coin.className = "coin";
    // Forcer le reflow
    void coin.offsetWidth;

    socket.emit("coinflip:bet", { amount, side });
  }

  // Utiliser onclick pour remplacer les écouteurs précédents potentiels
  btnHeads.onclick = () => placeBet("heads");
  btnTails.onclick = () => placeBet("tails");

  socket.off("coinflip:result"); // Supprimer l'écouteur précédent
  socket.on("coinflip:result", (data) => {
    // data: { won: boolean, side: 'heads'|'tails', newScore: number, amount: number }

    // Jouer l'animation
    if (data.side === "heads") {
      coin.classList.add("flipping-heads");
    } else {
      coin.classList.add("flipping-tails");
    }

    setTimeout(() => {
      isFlipping = false;
      btnHeads.disabled = false;
      btnTails.disabled = false;
      betInput.disabled = false;

      if (data.won) {
        resultMsg.textContent = `Gagné ! +${data.amount} clicks`;
        resultMsg.className = "result-message win";
      } else {
        resultMsg.textContent = `Perdu ! -${data.amount} clicks`;
        resultMsg.className = "result-message lose";
      }

      // Mettre à jour l'affichage du score global s'il existe
      const scoreDisplay = document.getElementById("your-score");
      if (scoreDisplay) {
        scoreDisplay.innerText = data.newScore;
      }
    }, 3000); // Correspond à la durée de l'animation CSS
  });

  socket.off("coinflip:error"); // Remove previous listener
  socket.on("coinflip:error", (msg) => {
    isFlipping = false;
    btnHeads.disabled = false;
    btnTails.disabled = false;
    betInput.disabled = false;
    resultMsg.textContent = msg;
    resultMsg.className = "result-message lose";
  });
}
