// Apply saved color immediately to prevent FOUC
(function () {
  const savedColor = localStorage.getItem("uiColor");
  if (savedColor) {
    document.documentElement.style.setProperty("--primary-color", savedColor);
  }
})();

// Expose init function for main.js and other pages
window.initUiColor = (socket) => {
  const colorPicker = document.getElementById("mainColorPicker");

  // Listen for color updates from server if socket is provided
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
  }

  // Handle color saving when picker changes
  if (colorPicker) {
    colorPicker.addEventListener("change", (e) => {
      const color = e.target.value;
      localStorage.setItem("uiColor", color);
      if (socket) {
        socket.emit("ui:saveColor", { color });
      }
    });
  }
};

// Rainbow mode logic
let rainbowInterval = null;
let rainbowHue = 0;

window.toggleRainbowMode = () => {
  if (rainbowInterval) {
    clearInterval(rainbowInterval);
    rainbowInterval = null;
    // Restore saved color
    const savedColor = localStorage.getItem("uiColor") || "#00ff00";
    document.documentElement.style.setProperty("--primary-color", savedColor);
    const colorPicker = document.getElementById("mainColorPicker");
    if (colorPicker) colorPicker.value = savedColor;
  } else {
    rainbowInterval = setInterval(() => {
      rainbowHue = (rainbowHue + 5) % 360;
      const color = `hsl(${rainbowHue}, 100%, 50%)`;
      document.documentElement.style.setProperty("--primary-color", color);
    }, 13); // Very fast animation
  }
};

// Initialize local UI logic (preview)
document.addEventListener("DOMContentLoaded", () => {
  const colorPicker = document.getElementById("mainColorPicker");

  // Default color if not loaded yet
  if (colorPicker && !colorPicker.value) colorPicker.value = "#00ff00";

  if (colorPicker) {
    // Fluid visual update during selection (preview)
    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--primary-color", color);
      window.dispatchEvent(
        new CustomEvent("uiColor:changed", { detail: { color } })
      );
    });
  }
});
