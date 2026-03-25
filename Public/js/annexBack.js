(function () {
  function goBackToPreviousPage() {
    // Priorite a l'historique reel de navigation.
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    // Fallback: referrer interne (utile pour certains onglets ouverts depuis le site).
    try {
      const ref = document.referrer || "";
      if (ref) {
        const url = new URL(ref);
        if (url.origin === window.location.origin) {
          window.location.href = `${url.pathname}${url.search}${url.hash}`;
          return;
        }
      }
    } catch (e) {}

    // Dernier recours.
    window.location.href = "/";
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.querySelector(".annex-back-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "annex-back-btn";
    btn.setAttribute("aria-label", "Retour à la page précédente");
    btn.innerHTML = "<b>🠔</b> <b>Retour</b>";
    btn.addEventListener("click", goBackToPreviousPage);

    document.body.appendChild(btn);
  });
})();
