(function () {
  if (window.__pdeSimpleCursorReady) return;

  function canUseCustomCursor() {
    try {
      return (
        window.matchMedia &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches
      );
    } catch (err) {
      return false;
    }
  }

  function getPrimaryColor() {
    const root = document.documentElement;
    const value = getComputedStyle(root)
      .getPropertyValue("--primary-color")
      .trim();
    return value || "#00ff00";
  }

  function applyColor(dot) {
    const color = getPrimaryColor();
    dot.style.setProperty("--pde-cursor-color", color);
    dot.style.backgroundColor = color;
  }

  function isTextInputElement(target) {
    if (!target || !(target instanceof Element)) return false;
    if (target.matches("textarea, [contenteditable='true']")) return true;
    if (!target.matches("input")) return false;

    const type = String(target.getAttribute("type") || "text").toLowerCase();
    return [
      "text",
      "search",
      "email",
      "password",
      "url",
      "tel",
      "number",
    ].includes(type);
  }

  function resolveCursorKind(target) {
    if (!target || !(target instanceof Element)) return "default";

    if (
      target.closest("#pixelwar-canvas, #admin-pixelwar-canvas, #board-wrapper")
    ) {
      return "crosshair";
    }

    if (target.closest("textarea, input, [contenteditable='true']")) {
      return isTextInputElement(
        target.closest("textarea, input, [contenteditable='true']"),
      )
        ? "input-text"
        : "text";
    }

    const cursor = getComputedStyle(target).cursor || "";
    if (cursor === "crosshair") return "crosshair";
    if (cursor === "pointer") return "pointer";
    if (cursor === "text" || cursor === "vertical-text") return "text";

    if (
      target.closest(
        "a, button, [role='button'], summary, label[for], select, .btn, .zone, .medal, .p4-cell, .uno-card-item, .uno-pile.tonTour",
      )
    ) {
      return "pointer";
    }

    return "default";
  }

  function installCustomCursor() {
    if (window.__pdeSimpleCursorReady) return;
    if (!canUseCustomCursor()) return;

    const style = document.createElement("style");
    style.id = "pde-simple-cursor-style";
    style.textContent = [
      "@media (hover: hover) and (pointer: fine) {",
      "  html, body, a, button, input, textarea, select, summary, label, [role='button'] { cursor: none !important; }",
      "  #pixelwar-canvas, #admin-pixelwar-canvas, #board-wrapper, #board-wrapper * { cursor: none !important; }",
      "  .pde-cursor-dot {",
      "    position: fixed;",
      "    left: 0;",
      "    top: 0;",
      "    width: 16px;",
      "    height: 16px;",
      "    --pde-cursor-color: #00ff00;",
      "    border: 2px solid var(--pde-cursor-color);",
      "    outline: 2px dotted var(--pde-cursor-color);",
      "    outline-offset: 3px;",
      "    border-radius: 999px;",
      "    background: var(--pde-cursor-color);",
      "    opacity: 0.77;",
      "    mix-blend-mode: difference;",
      "    pointer-events: none;",
      "    z-index: 2147483647;",
      "    transform: translate(-50%, -50%) scale(1);",
      "    transition: opacity 120ms ease, border-color 120ms ease, background-color 120ms ease, outline-color 120ms ease;",
      "  }",
      "  .pde-cursor-dot::after {",
      "    content: '';",
      "    position: absolute;",
      "    left: 0;",
      "    top: 0;",
      "    width: 100%;",
      "    height: 100%;",
      "    transform: translate(-50%, -50%) scale(1);",
      "    border: 1px solid var(--pde-cursor-color);",
      "    border-radius: 999px;",
      "    pointer-events: none;",
      "    transform: rotate(0deg) scale(1);",
      "    transform-origin: center;",
      "    transition: all 222ms ease;",
      "  }",
      "  .pde-cursor-dot::before {",
      "    content: '';",
      "    position: absolute;",
      "    left: 50%;",
      "    top: 50%;",
      "    transform: translate(-50%, -50%);",
      "    background: var(--pde-cursor-color);",
      "    border-radius: 999px;",
      "    width: 3.5px;",
      "    height: 3.5px;",
      "    border: 1px solid var(--pde-cursor-color);",
      "    pointer-events: none;",
      "    transform-origin: center;",
      "    transition: all 222ms ease;",
      "  }",
      "  @keyframes pdeCursorHoverPulse {",
      "    0% { transform: rotate(0deg) scale(1); }",
      "    50% { transform: rotate(14deg) scale(2.75); }",
      "    100% { transform: rotate(-14deg) scale(1); }",
      "  }",
      "  @keyframes pdeCursorHoverRotate {",
      "    0% { transform: rotate(0deg); }",
      "    50% { transform: rotate(90deg); }",
      "    100% { transform: rotate(0deg); }",
      "  }",
      "  .pde-cursor-dot.is-hover-pointer { opacity: 0.88; animation: pdeCursorHoverRotate 888ms ease-in infinite; }",
      "  .pde-cursor-dot.is-hover-pointer::after { animation: pdeCursorHoverPulse 888ms ease-in-out infinite; }",
      "  .pde-cursor-dot.is-hover-text { width: 4px; border-radius: 2px; outline: none; opacity: 0.92; }",
      "  .pde-cursor-dot.is-hover-text::after { transform: rotate(0deg) scale(0); opacity: 0; }",
      "  .pde-cursor-dot.is-hover-text::before { width: 0; height: 0; border: 0; }",
      "  .pde-cursor-dot.is-hover-input-text { width: 5px; height: 20px; border-radius: 2px; outline: none; opacity: 0.96; }",
      "  .pde-cursor-dot.is-hover-input-text::after { transform: rotate(0deg) scale(0); opacity: 0; }",
      "  .pde-cursor-dot.is-hover-input-text::before { width: 0; height: 0; border: 0; }",
      "  .pde-cursor-dot.is-hover-crosshair { width: 26px; height: 26px; border: 0; border-radius: 0; outline: none; background: transparent; opacity: 0.98; animation: none; }",
      "  .pde-cursor-dot.is-hover-crosshair::before { left: 50%; top: 50%; transform: translate(-50%, -50%); width: 2px; height: 18px; border: 0; border-radius: 2px; background: var(--pde-cursor-color); animation: none; }",
      "  .pde-cursor-dot.is-hover-crosshair::after { left: 50%; top: 50%; width: 18px; height: 2px; border: 0; border-radius: 2px; background: var(--pde-cursor-color); transform: translate(-50%, -50%); animation: none; }",
      "  .pde-cursor-dot.is-hidden { opacity: 0; }",
      "}",
    ].join("\n");
    document.head.appendChild(style);

    const dot = document.createElement("div");
    dot.className = "pde-cursor-dot is-hidden";
    dot.setAttribute("aria-hidden", "true");
    document.body.appendChild(dot);
    applyColor(dot);

    let raf = 0;
    let nextX = 0;
    let nextY = 0;
    let currentX = 0;
    let currentY = 0;
    let hasCursorPosition = false;
    const EASE_FACTOR = 0.66;

    const applyHoverVisual = (target) => {
      const kind = resolveCursorKind(target);
      dot.classList.remove(
        "is-hover-pointer",
        "is-hover-text",
        "is-hover-input-text",
        "is-hover-crosshair",
      );

      if (kind === "pointer") dot.classList.add("is-hover-pointer");
      else if (kind === "text") dot.classList.add("is-hover-text");
      else if (kind === "input-text") dot.classList.add("is-hover-input-text");
      else if (kind === "crosshair") dot.classList.add("is-hover-crosshair");

      dot.style.backgroundColor =
        kind === "crosshair" ? "transparent" : "var(--pde-cursor-color)";
    };

    const clearHoverVisual = () => {
      dot.classList.remove(
        "is-hover-pointer",
        "is-hover-text",
        "is-hover-input-text",
        "is-hover-crosshair",
      );
      applyColor(dot);
    };

    const render = () => {
      if (!hasCursorPosition) {
        currentX = nextX;
        currentY = nextY;
        hasCursorPosition = true;
      }

      currentX += (nextX - currentX) * EASE_FACTOR;
      currentY += (nextY - currentY) * EASE_FACTOR;

      dot.style.left = currentX + "px";
      dot.style.top = currentY + "px";

      const dx = Math.abs(nextX - currentX);
      const dy = Math.abs(nextY - currentY);
      if (dx > 0.1 || dy > 0.1) {
        raf = window.requestAnimationFrame(render);
      } else {
        // Snap final pour éviter les micro-décalages permanents.
        currentX = nextX;
        currentY = nextY;
        dot.style.left = currentX + "px";
        dot.style.top = currentY + "px";
        raf = 0;
      }
    };

    const onMove = (event) => {
      nextX = event.clientX;
      nextY = event.clientY;
      if (!raf) raf = window.requestAnimationFrame(render);

      applyHoverVisual(event.target);
      dot.classList.remove("is-hidden");
    };

    const hideDot = () => {
      dot.classList.add("is-hidden");
      clearHoverVisual();
      hasCursorPosition = false;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", hideDot, { passive: true });
    window.addEventListener("blur", hideDot, { passive: true });

    window.addEventListener("uiColor:changed", () => {
      applyColor(dot);
    });

    window.__pdeSimpleCursorReady = true;
  }

  window.initSimpleCursor = installCustomCursor;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installCustomCursor, {
      once: true,
    });
  } else {
    installCustomCursor();
  }
})();
