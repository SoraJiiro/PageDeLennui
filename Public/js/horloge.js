document.addEventListener("DOMContentLoaded", () => {
  const display = document.querySelector("h1");

  function horloge() {
    let mtn = new Date();
    let h = mtn.getHours();
    let m = mtn.getMinutes();
    let s = mtn.getSeconds();

    if (h < 10) h = "0" + h;
    if (m < 10) m = "0" + m;
    if (s < 10) s = "0" + s;

    display.textContent = `[${h}:${m}:${s}]`;
  }

  horloge();
  setInterval(horloge, 1000);
});
