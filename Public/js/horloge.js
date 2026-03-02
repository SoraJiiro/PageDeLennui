document.addEventListener("DOMContentLoaded", () => {
  const display = document.getElementById("main-clock");

  function placeNumbers(clockEl) {
    if (!clockEl) return;
    const computedWidth = Number.parseFloat(
      window.getComputedStyle(clockEl).width,
    );
    const size =
      clockEl.clientWidth ||
      clockEl.offsetWidth ||
      (Number.isFinite(computedWidth) ? computedWidth : 260);
    const center = size / 2;
    const radius = size * 0.42;

    clockEl.querySelectorAll(".number").forEach((num) => {
      const n = Number(num.dataset.n || 0);
      const angle = (n - 3) * (Math.PI / 6);
      num.style.left = `${center + radius * Math.cos(angle)}px`;
      num.style.top = `${center + radius * Math.sin(angle)}px`;
    });
  }

  function updateClockHands(clockEl, h, m, s) {
    if (!clockEl) return;
    const hourHand = clockEl.querySelector(".hour");
    const minuteHand = clockEl.querySelector(".minute");
    const secondHand = clockEl.querySelector(".second");
    if (!hourHand || !minuteHand || !secondHand) return;

    const seconds = s;
    const minutes = m + seconds / 60;
    const hours = (h % 12) + minutes / 60;

    secondHand.style.transform = `translateX(-50%) rotate(${seconds * 6}deg)`;
    minuteHand.style.transform = `translateX(-50%) rotate(${minutes * 6}deg)`;
    hourHand.style.transform = `translateX(-50%) rotate(${hours * 30}deg)`;
  }

  function getAllClocks() {
    return Array.from(document.querySelectorAll(".clock"));
  }

  getAllClocks().forEach((clock) => placeNumbers(clock));

  function horloge() {
    let mtn = new Date();
    let h = mtn.getHours();
    let m = mtn.getMinutes();
    let s = mtn.getSeconds();

    // ----- Affichage texte (inchangé) -----
    let hh = h < 10 ? "0" + h : h;
    let mm = m < 10 ? "0" + m : m;
    let ss = s < 10 ? "0" + s : s;

    if (display) {
      display.textContent = `[${hh}:${mm}:${ss}]`;
    }

    getAllClocks().forEach((clock) => {
      placeNumbers(clock);
      updateClockHands(clock, h, m, s);
    });
  }

  horloge();
  setInterval(horloge, 1000);
  window.addEventListener("resize", () => {
    getAllClocks().forEach((clock) => placeNumbers(clock));
  });
});
