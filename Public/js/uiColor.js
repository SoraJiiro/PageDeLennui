function normalizeHexColor(value, fallback = "#00FF00") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const match = raw.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return fallback;

  const hex = match[0].replace("#", "");
  if (hex.length === 3) {
    return `#${hex
      .split("")
      .map((char) => char + char)
      .join("")}`.toLowerCase();
  }

  return `#${hex.toLowerCase()}`;
}

function hslToHex(value) {
  const match = String(value || "")
    .trim()
    .match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i);
  if (!match) return null;

  const h = (Number(match[1]) % 360) / 360;
  const s = Math.max(0, Math.min(100, Number(match[2]))) / 100;
  const l = Math.max(0, Math.min(100, Number(match[3]))) / 100;
  const hueToRgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const channel = Math.round(l * 255)
      .toString(16)
      .padStart(2, "0");
    return `#${channel}${channel}${channel}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rgb = [h + 1 / 3, h, h - 1 / 3].map((t) =>
    Math.round(hueToRgb(p, q, t) * 255)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${rgb.join("")}`;
}

function getRelativeLuminance(hexColor) {
  const color = normalizeHexColor(hexColor, "#000000").slice(1);
  const num = Number.parseInt(color, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const channels = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getContrastText(color, fallback = "#000000") {
  const safeColor = normalizeHexColor(color, fallback);
  return getRelativeLuminance(safeColor) > 0.179 ? "#000000" : "#ffffff";
}

function colorsTooSimilar(first, second) {
  const a = normalizeHexColor(first, "#00ff00").slice(1);
  const b = normalizeHexColor(second, "#000000").slice(1);
  const rgbA = [0, 2, 4].map((offset) =>
    Number.parseInt(a.slice(offset, offset + 2), 16),
  );
  const rgbB = [0, 2, 4].map((offset) =>
    Number.parseInt(b.slice(offset, offset + 2), 16),
  );
  return (
    Math.hypot(...rgbA.map((channel, index) => channel - rgbB[index])) < 80
  );
}

function notifyColorRejected() {
  const message =
    "La couleur primaire et la couleur secondaire doivent être suffisamment différentes.";
  if (typeof window.showNotif === "function") window.showNotif(message, 4000);
  else if (window.PDENotifications?.show) {
    window.PDENotifications.show(message, { duration: 4000 });
  }
}

function updatePrimaryThemeColor(color) {
  const root = document.documentElement;
  const rawColor = String(color || "").trim();
  const safeColor = normalizeHexColor(
    rawColor,
    hslToHex(rawColor) || "#00ff00",
  );
  const contrastColor = hslToHex(rawColor) || safeColor;
  root.style.setProperty(
    "--primary-color",
    rawColor.match(/^hsl\(/i) ? rawColor : safeColor,
  );
  root.style.setProperty(
    "--primary-contrast-text",
    getContrastText(contrastColor),
  );
  return rawColor.match(/^hsl\(/i) ? rawColor : safeColor;
}

function updateSecondaryThemeColor(color) {
  const root = document.documentElement;
  const safeColor = normalizeHexColor(color, "#000000");
  const isLight = getRelativeLuminance(safeColor) > 0.6;
  const contrastText = getContrastText(safeColor);

  root.style.setProperty("--secondary-color", safeColor);
  root.style.setProperty("--bg-color", safeColor);
  root.style.setProperty("--secondary-is-light", isLight ? "1" : "0");
  root.style.setProperty("--secondary-contrast-text", contrastText);
  root.style.setProperty("--chat-text-color", contrastText);

  return { color: safeColor, isLight, contrastText };
}

window.getSecondaryThemeState = function getSecondaryThemeState() {
  const root = document.documentElement;
  const color = normalizeHexColor(
    getComputedStyle(root).getPropertyValue("--secondary-color").trim() ||
      "#000000",
    "#000000",
  );
  const isLight = getContrastText(color) === "#000000";
  const contrastText = isLight ? "#000000" : "#ffffff";
  return { color, isLight, contrastText };
};

window.getSecondaryCanvasColor = function getSecondaryCanvasColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--secondary-color")
      .trim() || "#000000"
  );
};

function applySecondaryUiKillSwitch(disabled, { persist = true } = {}) {
  if (!disabled) return false;

  const forcedColor = "#000000";
  updateSecondaryThemeColor(forcedColor);
  if (persist) {
    try {
      localStorage.setItem("secondaryUiColor", forcedColor);
    } catch (e) {}
  }

  const secondaryColorPicker = document.getElementById("secondaryColorPicker");
  if (secondaryColorPicker) {
    secondaryColorPicker.value = forcedColor;
    secondaryColorPicker.disabled = true;
  }

  return true;
}

async function refreshSecondaryUiKillSwitch() {
  try {
    const response = await fetch("/api/ui-config", { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    const disabled = Boolean(data && data.secondaryUiDisabled);
    window.__PDE_UI_CONFIG__ = data || {};
    if (disabled) {
      return applySecondaryUiKillSwitch(true, { persist: true });
    }

    const secondaryColorPicker = document.getElementById(
      "secondaryColorPicker",
    );
    if (secondaryColorPicker) {
      secondaryColorPicker.disabled = false;
    }
    return false;
  } catch (e) {
    return false;
  }
}

(function () {
  const savedColor = localStorage.getItem("uiColor");
  if (savedColor) {
    updatePrimaryThemeColor(savedColor);
  } else {
    updatePrimaryThemeColor("#00ff00");
  }

  const savedSecondaryColor =
    localStorage.getItem("secondaryUiColor") || "#000";
  updateSecondaryThemeColor(savedSecondaryColor);

  const savedChessColor =
    localStorage.getItem("chessSecondaryColor") || "#00a500";
  document.documentElement.style.setProperty(
    "--chess-cell-dark",
    savedChessColor,
  );
})();

refreshSecondaryUiKillSwitch();

(function () {
  if (window.__pdeSimpleCursorBootstrapped) return;
  window.__pdeSimpleCursorBootstrapped = true;

  const boot = () => {
    if (typeof window.initSimpleCursor === "function") {
      window.initSimpleCursor();
      return;
    }

    const script = document.createElement("script");
    script.src = "/js/custom_cursor.js";
    script.defer = true;
    document.head.appendChild(script);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

// Exposer la fonction init pour main.js et les autres pages
window.initUiColor = (socket) => {
  const colorPicker = document.getElementById("mainColorPicker");
  const secondaryColorPicker = document.getElementById("secondaryColorPicker");
  const chessColorPicker = document.getElementById("chessSecondaryColorPicker");

  // Écouter les mises à jour de couleur du serveur si le socket est fourni
  if (socket) {
    socket.on("ui:color", ({ color }) => {
      if (color) {
        updatePrimaryThemeColor(color);
        localStorage.setItem("uiColor", color);
        if (colorPicker) colorPicker.value = color;
        window.dispatchEvent(
          new CustomEvent("uiColor:changed", { detail: { color } }),
        );
      }
    });

    socket.on("ui:secondaryColor", ({ color }) => {
      if (color) {
        updateSecondaryThemeColor(color);
        localStorage.setItem("secondaryUiColor", color);
        if (secondaryColorPicker) secondaryColorPicker.value = color;
      }
    });
  }

  // Gérer la sauvegarde de la couleur lorsque le sélecteur change
  if (colorPicker) {
    colorPicker.addEventListener("change", (e) => {
      const color = e.target.value;
      const secondary = localStorage.getItem("secondaryUiColor") || "#000000";
      if (colorsTooSimilar(color, secondary)) {
        e.target.value = localStorage.getItem("uiColor") || "#00ff00";
        notifyColorRejected();
        return;
      }
      updatePrimaryThemeColor(color);
      localStorage.setItem("uiColor", color);
      if (socket) {
        socket.emit("ui:saveColor", { color });
      }
    });
  }

  if (secondaryColorPicker) {
    const currentSecondaryColor =
      localStorage.getItem("secondaryUiColor") || "#000000";
    secondaryColorPicker.value = currentSecondaryColor;
    updateSecondaryThemeColor(currentSecondaryColor);

    secondaryColorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      const primary = localStorage.getItem("uiColor") || "#00ff00";
      if (colorsTooSimilar(primary, color)) {
        e.target.value = localStorage.getItem("secondaryUiColor") || "#000000";
        notifyColorRejected();
        return;
      }
      updateSecondaryThemeColor(color);
      localStorage.setItem("secondaryUiColor", color);
    });

    secondaryColorPicker.addEventListener("change", (e) => {
      const color = e.target.value;
      const primary = localStorage.getItem("uiColor") || "#00ff00";
      if (colorsTooSimilar(primary, color)) {
        e.target.value = localStorage.getItem("secondaryUiColor") || "#000000";
        notifyColorRejected();
        return;
      }
      updateSecondaryThemeColor(color);
      localStorage.setItem("secondaryUiColor", color);
      if (socket) {
        socket.emit("ui:saveSecondaryColor", { color });
      }
    });
  }

  if (chessColorPicker) {
    const currentChessColor =
      localStorage.getItem("chessSecondaryColor") || "#00a500";
    chessColorPicker.value = currentChessColor;
    document.documentElement.style.setProperty(
      "--chess-cell-dark",
      currentChessColor,
    );

    chessColorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--chess-cell-dark", color);
      localStorage.setItem("chessSecondaryColor", color);
    });

    chessColorPicker.addEventListener("change", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--chess-cell-dark", color);
      localStorage.setItem("chessSecondaryColor", color);
    });
  }
};

// Logique du mode arc-en-ciel
let rainbowInterval = null;
let rainbowHue = 0;

window.toggleRainbowMode = () => {
  if (rainbowInterval) {
    clearInterval(rainbowInterval);
    rainbowInterval = null;
    // Restaurer la couleur sauvegardée
    const savedColor = localStorage.getItem("uiColor") || "#00ff00";
    updatePrimaryThemeColor(savedColor);
    const colorPicker = document.getElementById("mainColorPicker");
    if (colorPicker) colorPicker.value = savedColor;
  } else {
    rainbowInterval = setInterval(() => {
      rainbowHue = (rainbowHue + 5) % 360;
      const color = `hsl(${rainbowHue}, 100%, 50%)`;
      updatePrimaryThemeColor(color);
    }, 13); // Animation très rapide
  }
};

// Initialiser la logique UI locale (aperçu)
document.addEventListener("DOMContentLoaded", () => {
  const colorPicker = document.getElementById("mainColorPicker");
  const secondaryColorPicker = document.getElementById("secondaryColorPicker");
  const chessColorPicker = document.getElementById("chessSecondaryColorPicker");

  // Couleur par défaut si pas encore chargée
  if (colorPicker && !colorPicker.value) colorPicker.value = "#00ff00";
  if (secondaryColorPicker && !secondaryColorPicker.value)
    secondaryColorPicker.value =
      localStorage.getItem("secondaryUiColor") || "#000000";
  if (chessColorPicker && !chessColorPicker.value)
    chessColorPicker.value =
      localStorage.getItem("chessSecondaryColor") || "#00a500";

  if (colorPicker) {
    // Mise à jour visuelle fluide pendant la sélection (aperçu)
    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      const secondary = localStorage.getItem("secondaryUiColor") || "#000000";
      if (colorsTooSimilar(color, secondary)) {
        e.target.value = localStorage.getItem("uiColor") || "#00ff00";
        notifyColorRejected();
        return;
      }
      updatePrimaryThemeColor(color);
      window.dispatchEvent(
        new CustomEvent("uiColor:changed", { detail: { color } }),
      );
    });
  }

  if (secondaryColorPicker) {
    secondaryColorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      const primary = localStorage.getItem("uiColor") || "#00ff00";
      if (colorsTooSimilar(primary, color)) {
        e.target.value = localStorage.getItem("secondaryUiColor") || "#000000";
        notifyColorRejected();
        return;
      }
      updateSecondaryThemeColor(color);
      localStorage.setItem("secondaryUiColor", color);
    });
  }

  if (chessColorPicker) {
    chessColorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--chess-cell-dark", color);
      localStorage.setItem("chessSecondaryColor", color);
    });
  }
});
