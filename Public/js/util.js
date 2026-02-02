import { showNotif as showNotifImpl } from "./notifications.js";

const showNotif = showNotifImpl;
export { showNotif };

export function toggleScrollLock(isLocked) {
  document.body.style.overflow = isLocked ? "hidden" : "";
}

export const keys = { default: ["p", "P"] };

export function keyBind() {
  const input = document.querySelector(".keybind");
  const btn = document.querySelector(".keybind-submit");
  const marks = document.querySelectorAll("#keybind-mark");
  const s1 = document.querySelector(".stage1p0");

  try {
    const saved = localStorage.getItem("pauseKey");
    if (saved && typeof saved === "string" && saved.length === 1) {
      const lower = saved.toLowerCase();
      const upper = saved.toUpperCase();
      keys.default = [lower, upper];
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
    const lower = val.toLowerCase();
    const upper = val.toUpperCase();
    keys.default = [lower, upper];
    marks.forEach((mark) => {
      mark.textContent = `"${val}"`;
    });
    try {
      localStorage.setItem("pauseKey", val);
    } catch {}
    showNotif(`Touche de pause changée en "${val}"`);
    console.log("Nouvelle touche de pause:", keys.default);
    try {
      window.dispatchEvent(
        new CustomEvent("pauseKey:changed", { detail: { key: val } }),
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
      const lower = val.toLowerCase();
      const upper = val.toUpperCase();
      keys.default = [lower, upper];
      marks.forEach((mark) => {
        mark.textContent = `"${val}"`;
      });
      try {
        localStorage.setItem("pauseKey", val);
      } catch {}
      showNotif(`Touche de pause changée en "${val}"`);
      console.log("Nouvelle touche de pause:", keys.default);
      try {
        window.dispatchEvent(
          new CustomEvent("pauseKey:changed", { detail: { key: val } }),
        );
      } catch {}
    }
  });

  return keys;
}

export function darken(hex, percent) {
  hex = hex.replace("#", "");

  // Convertir en valeurs RGB
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  // Appliquer le pourcentage d’assombrissement
  r = Math.floor(r * (1 - percent));
  g = Math.floor(g * (1 - percent));
  b = Math.floor(b * (1 - percent));

  // Limiter à [0, 255]
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);

  // Retour en HEX
  const toHex = (c) => c.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function requestPassword() {
  return new Promise((resolve) => {
    const modal = document.getElementById("password-modal");
    const input = document.getElementById("password-input");
    const confirmBtn = document.getElementById("password-confirm");
    const cancelBtn = document.getElementById("password-cancel");

    if (!modal || !input || !confirmBtn || !cancelBtn) {
      console.error("Password modal elements missing");
      resolve(null);
      return;
    }

    const cleanup = () => {
      modal.style.display = "none";
      input.value = "";
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeydown = null;
    };

    const confirm = () => {
      const password = input.value;
      cleanup();
      resolve(password);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    confirmBtn.onclick = confirm;
    cancelBtn.onclick = cancel;

    input.onkeydown = (e) => {
      if (e.key === "Enter") confirm();
      if (e.key === "Escape") cancel();
    };

    modal.style.display = "flex";
    input.focus();
  });
}

export async function openSearchNoSocket() {
  try {
    const resp = await fetch("/search.html");
    if (!resp.ok) throw new Error("fetch failed");
    let html = await resp.text();

    // Remove all <script>...</script> blocks
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "");

    // Remove inline event handlers like onClick, onkeydown etc.
    html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
    html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, "");

    // Ensure relative links (css, img, a, etc.) resolve by adding a <base> tag
    try {
      const baseHref = window.location.origin + "/";
      if (/\<head[^>]*>/i.test(html)) {
        html = html.replace(
          /\<head([^>]*)>/i,
          `<head$1><base href="${baseHref}">`,
        );
      } else {
        // If no head tag, prepend a minimal head with base
        html = `<head><base href="${baseHref}"></head>` + html;
      }
    } catch (e) {
      // ignore if window not available or replacement fails
    }

    // Create a blob so the page opens without executing original scripts
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    // Revoke after a minute
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
    return !!win;
  } catch (e) {
    try {
      // Fallback to opening an empty tab
      window.open("", "_blank");
      return true;
    } catch {
      return false;
    }
  }
}
