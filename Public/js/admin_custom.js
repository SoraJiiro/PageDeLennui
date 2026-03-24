// Bootstrap pour initialiser l'UI des multiplicateurs de guerre de clans (admin)
import { initClanwarMultipliersUI } from "./admin_clanwar_multipliers.js";

window.addEventListener("DOMContentLoaded", () => {
  // On attend que la socket admin soit prête
  function tryInit() {
    if (window.adminSocket) {
      initClanwarMultipliersUI(window.adminSocket);
      return true;
    }
    setTimeout(tryInit, 200);
  }
  tryInit();
});
