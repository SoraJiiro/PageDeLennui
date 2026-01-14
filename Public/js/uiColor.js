// Appliquer la couleur sauvegardée immédiatement pour éviter le FOUC
(function () {
  const savedColor = localStorage.getItem("uiColor");
  if (savedColor) {
    document.documentElement.style.setProperty("--primary-color", savedColor);
  }
  const savedBgColor = localStorage.getItem("bgColor");
  if (savedBgColor) {
    document.documentElement.style.setProperty("--bg-color", savedBgColor);
  }
})();

// Exposer la fonction init pour main.js et les autres pages
window.initUiColor = (socket) => {
  const colorPicker = document.getElementById("mainColorPicker");
  const bgPicker = document.getElementById("bgColorPicker");

  // Écouter les mises à jour de couleur du serveur si le socket est fourni
  if (socket) {
    socket.on("ui:color", ({ color }) => {
      if (color) {
        document.documentElement.style.setProperty("--primary-color", color);
        localStorage.setItem("uiColor", color);
        if (colorPicker) colorPicker.value = color;
        window.dispatchEvent(
          new CustomEvent("uiColor:changed", { detail: { color } })
        );
      }
    });

    socket.on("ui:bgColor", ({ color }) => {
      if (color) {
        document.documentElement.style.setProperty("--bg-color", color);
        localStorage.setItem("bgColor", color);
        if (bgPicker) bgPicker.value = color;
        window.dispatchEvent(
          new CustomEvent("bgColor:changed", { detail: { color } })
        );
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

  if (bgPicker) {
    bgPicker.addEventListener("change", (e) => {
      const color = e.target.value;
      localStorage.setItem("bgColor", color);
      if (socket) {
        socket.emit("ui:saveBgColor", { color });
      }
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

let bgRainbowInterval = null;
let bgRainbowHue = 0;

window.toggleBgRainbowMode = () => {
  if (bgRainbowInterval) {
    clearInterval(bgRainbowInterval);
    bgRainbowInterval = null;
    const savedBgColor = localStorage.getItem("bgColor") || "#000000";
    document.documentElement.style.setProperty("--bg-color", savedBgColor);
    const bgPicker = document.getElementById("bgColorPicker");
    if (bgPicker) bgPicker.value = savedBgColor;
  } else {
    bgRainbowInterval = setInterval(() => {
      bgRainbowHue = (bgRainbowHue + 5) % 360;
      const color = `hsl(${bgRainbowHue}, 100%, 10%)`; // Darker for background
      document.documentElement.style.setProperty("--bg-color", color);
    }, 13);
  }
};

// Initialiser la logique UI locale (aperçu)
document.addEventListener("DOMContentLoaded", () => {
  const colorPicker = document.getElementById("mainColorPicker");
  const bgPicker = document.getElementById("bgColorPicker");

  // Couleur par défaut si pas encore chargée
  if (colorPicker && !colorPicker.value) colorPicker.value = "#00ff00";
  if (bgPicker && !bgPicker.value) bgPicker.value = "#000000";

  if (colorPicker) {
    // Mise à jour visuelle fluide pendant la sélection (aperçu)
    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--primary-color", color);
      window.dispatchEvent(
        new CustomEvent("uiColor:changed", { detail: { color } })
      );
    });
  }

  if (bgPicker) {
    bgPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--bg-color", color);
      window.dispatchEvent(
        new CustomEvent("bgColor:changed", { detail: { color } })
      );
    });
  }
});
