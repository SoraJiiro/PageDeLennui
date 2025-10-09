document.addEventListener("click", () => {
  function goTo(section) {
    document.querySelector("#" + section).scrollIntoView();
  }

  const sec1 = document.querySelector(".sec1");
  const sec2 = document.querySelector(".sec2");
  const sec3 = document.querySelector(".sec3");
  const sec4 = document.querySelector(".sec4");
  const sec5 = document.querySelector(".sec5");

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
});
