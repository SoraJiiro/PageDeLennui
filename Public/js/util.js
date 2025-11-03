export function showNotif(text, duration = 4000) {
  try {
    const notif = document.createElement("div");
    notif.className = "notif";
    notif.textContent = text;
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0f0;
      opacity: 0.88;
      color: #000;
      padding: 12px 18px;
      font-weight: 700;
      z-index: 9999;
      border: 2px solid #0f0;
      box-shadow: 0 0 0 2px #000 inset;
      animation: slideIn 0.25s ease-out;
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), duration);
  } catch (e) {
    console.warn("showNotif fallback:", text);
  }
}
