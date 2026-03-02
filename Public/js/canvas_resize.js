export function initCanvasResizer() {
  function resizeCanvasToDisplaySize(canvas) {
    if (!canvas) return false;

    if (canvas.classList.contains("game")) return false;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const maxH = Math.max(0, window.innerHeight - 160);
    const cssWidth = Math.min(rect.width, window.innerWidth - 32);
    const cssHeight = Math.min(rect.height || (cssWidth * 9) / 16, maxH);

    // Ne pas écraser un canvas quand sa section est masquée (rect à 0x0).
    // Sinon on perd le buffer et certains canvases restent invisibles jusqu'au prochain redraw.
    if (cssWidth < 2 || cssHeight < 2) {
      return false;
    }

    const displayWidth = Math.floor(cssWidth * ratio);
    const displayHeight = Math.floor(cssHeight * ratio);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;

      try {
        canvas.style.width = `${Math.round(cssWidth)}px`;
        canvas.style.height = `${Math.round(cssHeight)}px`;
      } catch (e) {}
      return true;
    }
    return false;
  }

  function resizeAll() {
    document.querySelectorAll("canvas").forEach((c) => {
      try {
        resizeCanvasToDisplaySize(c);
      } catch (e) {}
    });
  }

  window.addEventListener("load", resizeAll);
  let to = null;
  window.addEventListener("resize", () => {
    clearTimeout(to);
    to = setTimeout(resizeAll, 120);
  });
  window.addEventListener("orientationchange", () =>
    setTimeout(resizeAll, 200),
  );

  return { resizeAll };
}

export default initCanvasResizer;
