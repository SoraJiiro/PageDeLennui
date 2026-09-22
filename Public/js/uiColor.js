function normalizeHexColor(value, fallback = "#000000") {
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

function updateSecondaryThemeColor(color) {
  const root = document.documentElement;
  const safeColor = normalizeHexColor(color, "#000000");
  const isLight = getRelativeLuminance(safeColor) > 0.6;
  const contrastText = isLight ? "#000000" : "#ffffff";

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
  const isLight = getRelativeLuminance(color) > 0.6;
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

// Appliquer les couleurs sauvegardées immédiatement pour éviter le FOUC
(function () {
  const savedColor = localStorage.getItem("uiColor");
  if (savedColor) {
    document.documentElement.style.setProperty("--primary-color", savedColor);
  }

  const savedSecondaryColor =
    localStorage.getItem("secondaryUiColor") || "#000000";
  updateSecondaryThemeColor(savedSecondaryColor);

  const savedChessColor =
    localStorage.getItem("chessSecondaryColor") || "#00a500";
  document.documentElement.style.setProperty(
    "--chess-cell-dark",
    savedChessColor,
  );
})();

refreshSecondaryUiKillSwitch();

// Load simple div-based cursor once for pages using uiColor.js.
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
        document.documentElement.style.setProperty("--primary-color", color);
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
      updateSecondaryThemeColor(color);
      localStorage.setItem("secondaryUiColor", color);
    });

    secondaryColorPicker.addEventListener("change", (e) => {
      const color = e.target.value;
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
    document.documentElement.style.setProperty("--primary-color", savedColor);
    const colorPicker = document.getElementById("mainColorPicker");
    if (colorPicker) colorPicker.value = savedColor;
  } else {
    rainbowInterval = setInterval(() => {
      rainbowHue = (rainbowHue + 5) % 360;
      const color = `hsl(${rainbowHue}, 100%, 50%)`;
      document.documentElement.style.setProperty("--primary-color", color);
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
      document.documentElement.style.setProperty("--primary-color", color);
      window.dispatchEvent(
        new CustomEvent("uiColor:changed", { detail: { color } }),
      );
    });
  }

  if (secondaryColorPicker) {
    secondaryColorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--secondary-color", color);
      document.documentElement.style.setProperty("--bg-color", color);
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
