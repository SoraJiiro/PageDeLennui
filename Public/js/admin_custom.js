// Bootstrap pour initialiser l'UI des multiplicateurs de guerre de clans (admin)
import { initClanwarMultipliersUI } from "./admin_clanwar_multipliers.js";

window.addEventListener("DOMContentLoaded", () => {
  // On attend que la socket admin soit prête
  function tryInit() {
    if (window.adminSocket && window.adminSocket.connected) {
      initClanwarMultipliersUI(window.adminSocket);
      return true;
    }

    if (window.adminSocket && !window.adminSocket.connected) {
      // Attendre l'événement de connexion
      try {
        window.adminSocket.once("connect", () =>
          initClanwarMultipliersUI(window.adminSocket),
        );
      } catch (e) {
        // fallback: retry
        setTimeout(tryInit, 200);
      }
      return false;
    }

    setTimeout(tryInit, 200);
  }
  tryInit();
});
