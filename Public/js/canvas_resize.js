export function initCanvasResizer() {
  function resizeCanvasToDisplaySize(canvas) {
    if (!canvas) return false;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // Limit canvas height to viewport-safe area if set via CSS
    const maxH = Math.max(0, window.innerHeight - 160);
    const cssWidth = Math.min(rect.width, window.innerWidth - 32);
    const cssHeight = Math.min(rect.height || (cssWidth * 9) / 16, maxH);
    const displayWidth = Math.floor(cssWidth * ratio);
    const displayHeight = Math.floor(cssHeight * ratio);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      // ensure the CSS size matches the measured rect so DOM layout is stable
      try {
        canvas.style.width = `${Math.round(cssWidth)}px`;
        canvas.style.height = `${Math.round(cssHeight)}px`;
      } catch (e) {}
      // set transform so drawing commands use CSS pixels coordinates
      try {
        const ctx = canvas.getContext("2d");
        if (ctx && typeof ctx.setTransform === "function") {
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
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

  // Resize on load and on resize/orientationchange
  window.addEventListener("load", resizeAll);
  let to = null;
  window.addEventListener("resize", () => {
    clearTimeout(to);
    to = setTimeout(resizeAll, 120);
  });
  window.addEventListener("orientationchange", () =>
    setTimeout(resizeAll, 200)
  );

  // Expose function for manual calls
  return { resizeAll };
}

export default initCanvasResizer;
