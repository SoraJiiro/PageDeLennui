// HORLOGE
const display = document.querySelector("h1");

function horloge() {
  let now = new Date();
  let h = now.getHours();
  let m = now.getMinutes();
  let s = now.getSeconds();

  if (h < 10) {
    h = "0" + h;
  }
  if (m < 10) {
    m = "0" + m;
  }
  if (s < 10) {
    s = "0" + s;
  }

  display.textContent = `[${h}:${m}:${s}]`; // Affichage
}

horloge();
setInterval(horloge, 1000);
