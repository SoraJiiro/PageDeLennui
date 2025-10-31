document.addEventListener("DOMContentLoaded", () => {
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

  sec1.addEventListener("click", () => {
    goTo("stage1");
  });
  sec2.addEventListener("click", () => {
    goTo("stage2");
  });
  sec3.addEventListener("click", () => {
    goTo("stage3");
  });
  sec4.addEventListener("click", () => {
    goTo("stage4");
  });
  sec5.addEventListener("click", () => {
    goTo("stage5");
  });
  mario.addEventListener("click", () => {
    window.open("https://supermario-game.com/mario-game/mario.html", {
      target: "_blank",
    });
  });
  sec6.addEventListener("click", () => {
    goTo("stage6");
  });
  sec7.addEventListener("click", () => {
    goTo("stage7");
  });
  sec8.addEventListener("click", () => {
    goTo("stage8");
  });
});
