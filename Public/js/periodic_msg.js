document.addEventListener("DOMContentLoaded", () => {
  // Animation periodic-msg
  const msg = document.getElementById("periodic-msg");
  if (msg) {
    const text = msg.textContent;
    msg.innerHTML = "";
    [...text].forEach((char, i) => {
      const span = document.createElement("span");
      span.textContent = char;
      // Délai progressif pour l'effet de vague
      span.style.animationDelay = `${i * 0.1}s`;
      msg.appendChild(span);
    });
  }
});
