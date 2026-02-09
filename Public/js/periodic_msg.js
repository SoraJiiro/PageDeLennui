document.addEventListener("DOMContentLoaded", () => {
  const msg = document.getElementById("periodic-msg");
  if (msg) {
    const text = msg.textContent;
    msg.innerHTML = "";
    [...text].forEach((char, i) => {
      const span = document.createElement("span");
      span.textContent = char;
      span.style.animationDelay = `${i * 0.07}s`;
      msg.appendChild(span);
    });
  }
});
