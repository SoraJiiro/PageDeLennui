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

export const keys = { default: ["P", "p"] };

export function keyBind(username = null) {
  const input = document.querySelector(".keybind");
  const btn = document.querySelector(".keybind-submit");
  const marks = document.querySelectorAll("#keybind-mark");
  const s1 = document.querySelector(".stage1");

  const storageKey = username ? `pauseKey:${username}` : "pauseKey";

  try {
    const saved =
      localStorage.getItem(storageKey) || localStorage.getItem("pauseKey");
    if (saved && typeof saved === "string" && saved.length === 1) {
      keys.default = [saved.toUpperCase(), saved.toLowerCase()];
    }
  } catch {}

  try {
    const current = keys.default[0] || "P";
    marks.forEach((mark) => {
      mark.textContent = `"${current}"`;
    });
    if (input) input.value = current;
  } catch {}

  if (!input || !btn) return keys;

  btn.addEventListener("click", () => {
    const val = (input.value || "").trim();
    if (val.length !== 1) {
      showNotif("⚠️ Entrez une seule touche (1 caractère)");
      return;
    }
    keys.default = [val.toUpperCase(), val.toLowerCase()];
    marks.forEach((mark) => {
      mark.textContent = `"${val}"`;
    });
    try {
      localStorage.setItem(storageKey, val);
    } catch {}
    showNotif(`Touche de pause changée en "${val}"`);
    console.log("Nouvelle touche de pause:", keys.default);
    try {
      window.dispatchEvent(
        new CustomEvent("pauseKey:changed", { detail: { key: val } })
      );
    } catch {}
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement === input) {
      e.preventDefault();
      const val = (input.value || "").trim();
      if (val.length !== 1) {
        showNotif("⚠️ Entrez une seule touche (1 caractère)");
        return;
      }
      keys.default = [val.toUpperCase(), val.toLowerCase()];
      marks.forEach((mark) => {
        mark.textContent = `"${val}"`;
      });
      try {
        localStorage.setItem(storageKey, val);
      } catch {}
      showNotif(`Touche de pause changée en "${val}"`);
      console.log("Nouvelle touche de pause:", keys.default);
      try {
        window.dispatchEvent(
          new CustomEvent("pauseKey:changed", { detail: { key: val } })
        );
      } catch {}
    }
  });

  return keys;
}
