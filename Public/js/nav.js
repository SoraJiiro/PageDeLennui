// Expose init function for main.js
window.initNavSocket = (socket) => {
  const colorPicker = document.getElementById("mainColorPicker");

  socket.on("ui:color", ({ color }) => {
    if (color) {
      document.documentElement.style.setProperty("--primary-color", color);
      if (colorPicker) colorPicker.value = color;
      window.dispatchEvent(
        new CustomEvent("uiColor:changed", { detail: { color } })
      );
    }
  });

  if (colorPicker) {
    colorPicker.addEventListener("change", (e) => {
      const color = e.target.value;
      socket.emit("ui:saveColor", { color });
    });
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".btns-wrap");
  const showBtn = document.querySelector(".show-nav");
  const hideBtn = document.querySelector(".hide-nav");
  const colorPicker = document.getElementById("mainColorPicker");

  // Default color if not loaded yet
  if (colorPicker) colorPicker.value = "#00ff00";

  if (colorPicker) {
    // Mise à jour visuelle fluide pendant le déplacement
    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--primary-color", color);
      window.dispatchEvent(
        new CustomEvent("uiColor:changed", { detail: { color } })
      );
    });
    // Note: "change" event for saving is handled in initNavSocket
  }

  const navState = localStorage.getItem("navVisible");
  if (navState === "true") {
    nav.style.display = "";
  } else {
    nav.style.display = "none";
  }

  showBtn.addEventListener("click", () => {
    nav.style.display = "";
    localStorage.setItem("navVisible", "true");
  });

  hideBtn.addEventListener("click", () => {
    nav.style.display = "none";
    localStorage.setItem("navVisible", "false");
  });

  function goTo(section) {
    const el = document.querySelector("#" + section);
    if (el) el.scrollIntoView();
  }

  const sec1 = document.querySelector(".sec1");
  const sec2 = document.querySelector(".sec2");
  const sec3 = document.querySelector(".sec3");
  const sec4 = document.querySelector(".sec4");
  const sec5 = document.querySelector(".sec5");
  const mario = document.querySelector(".mario");
  const sec6 = document.querySelector(".sec6");
  const sec7 = document.querySelector(".sec7");
  const sec8 = document.querySelector(".sec8");
  const sec9 = document.querySelector(".sec9");
  const sec10 = document.querySelector(".sec10");
  const sec11 = document.querySelector(".sec11");

  if (sec1) sec1.addEventListener("click", () => goTo("stage1"));
  if (sec2) sec2.addEventListener("click", () => goTo("stage2"));
  if (sec3) sec3.addEventListener("click", () => goTo("stage3"));
  if (sec4) sec4.addEventListener("click", () => goTo("stage4"));
  if (sec5) sec5.addEventListener("click", () => goTo("stage5"));
  if (mario)
    mario.addEventListener("click", () =>
      window.open("https://supermario-game.com/mario-game/mario.html", "_blank")
    );
  if (sec6) sec6.addEventListener("click", () => goTo("stage6"));
  if (sec7) sec7.addEventListener("click", () => goTo("stage7"));
  if (sec8) sec8.addEventListener("click", () => goTo("stage8"));
  if (sec9) sec9.addEventListener("click", () => goTo("stage9"));
  if (sec10) sec10.addEventListener("click", () => goTo("stage10"));
  if (sec11) sec11.addEventListener("click", () => goTo("stage11"));
});
