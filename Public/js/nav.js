document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector(".btns-wrap");
  const showBtn = document.querySelector(".show-nav");
  const hideBtn = document.querySelector(".hide-nav");
  const colorPicker = document.getElementById("mainColorPicker");

  const savedColor = localStorage.getItem("primaryColor");
  if (savedColor) {
    document.documentElement.style.setProperty("--primary-color", savedColor);
    if (colorPicker) colorPicker.value = savedColor;
  } else {
    if (colorPicker) colorPicker.value = "#00ff00";
  }

  if (colorPicker) {
    // Mise à jour visuelle fluide pendant le déplacement
    colorPicker.addEventListener("input", (e) => {
      const color = e.target.value;
      document.documentElement.style.setProperty("--primary-color", color);
    });

    // Sauvegarde uniquement à la fin de la sélection (évite le lag)
    colorPicker.addEventListener("change", (e) => {
      const color = e.target.value;
      localStorage.setItem("primaryColor", color);
    });
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
    document.querySelector("#" + section).scrollIntoView();
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

  sec1.addEventListener("click", () => goTo("stage1"));
  sec2.addEventListener("click", () => goTo("stage2"));
  sec3.addEventListener("click", () => goTo("stage3"));
  sec4.addEventListener("click", () => goTo("stage4"));
  sec5.addEventListener("click", () => goTo("stage5"));
  mario.addEventListener("click", () =>
    window.open("https://supermario-game.com/mario-game/mario.html", "_blank")
  );
  sec6.addEventListener("click", () => goTo("stage6"));
  sec7.addEventListener("click", () => goTo("stage7"));
  sec8.addEventListener("click", () => goTo("stage8"));
  sec9.addEventListener("click", () => goTo("stage9"));
  sec10.addEventListener("click", () => goTo("stage10"));
});
