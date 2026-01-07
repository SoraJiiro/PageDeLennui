document.addEventListener("DOMContentLoaded", () => {
  const display =
    document.getElementById("main-clock") || document.querySelector("h1");

  const hourHand = document.getElementById("hour");
  const minuteHand = document.getElementById("minute");
  const secondHand = document.getElementById("second");

  // Placement des nombres
  document.querySelectorAll(".number").forEach((num) => {
    const n = num.dataset.n;
    const angle = (n - 3) * (Math.PI / 6);
    const r = 110;

    num.style.left = 130 + r * Math.cos(angle) - 2.5 + "px";
    num.style.top = 130 + r * Math.sin(angle) - 2.5 + "px";
  });

  function horloge() {
    let mtn = new Date();
    let h = mtn.getHours();
    let m = mtn.getMinutes();
    let s = mtn.getSeconds();

    // ----- Affichage texte (inchangé) -----
    let hh = h < 10 ? "0" + h : h;
    let mm = m < 10 ? "0" + m : m;
    let ss = s < 10 ? "0" + s : s;

    display.textContent = `[${hh}:${mm}:${ss}]`;

    // ----- Horloge analogique -----
    const seconds = s;
    const minutes = m + seconds / 60;
    const hours = (h % 12) + minutes / 60;

    secondHand.style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;
    minuteHand.style.transform = `translateX(-50%) rotate(${minutes * 6}deg)`;
    hourHand.style.transform = `translateX(-50%) rotate(${hours * 30}deg)`;
  }

  horloge();
  setInterval(horloge, 1000);
});
