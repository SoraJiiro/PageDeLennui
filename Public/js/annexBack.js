(function () {
  function goBackToIndex() {
    try {
      const ref = document.referrer || "";
      const sameOrigin = ref.startsWith(window.location.origin);
      if (sameOrigin && /\/index(\.html)?$/i.test(new URL(ref).pathname)) {
        window.history.back();
        return;
      }
    } catch (e) {}
    window.location.href = "/";
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.querySelector(".annex-back-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "annex-back-btn";
    btn.setAttribute("aria-label", "Retour à l'index");
    btn.textContent = "← Retour";
    btn.addEventListener("click", goBackToIndex);

    document.body.appendChild(btn);
  });
})();
