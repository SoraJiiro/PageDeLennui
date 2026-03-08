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

  function parseRgb(colorValue) {
    if (!colorValue) return null;
    const m = String(colorValue)
      .trim()
      .match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i);
    if (!m) return null;
    return {
      r: Math.max(0, Math.min(255, Number(m[1]))),
      g: Math.max(0, Math.min(255, Number(m[2]))),
      b: Math.max(0, Math.min(255, Number(m[3]))),
      a: m[4] == null ? 1 : Math.max(0, Math.min(1, Number(m[4]))),
    };
  }

  function isTransparent(colorValue) {
    const value = String(colorValue || "")
      .trim()
      .toLowerCase();
    if (!value || value === "transparent") return true;
    const parsed = parseRgb(value);
    return !!parsed && parsed.a === 0;
  }

  function rgbToCss(rgb) {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  function inverseRgb(rgb) {
    return {
      r: 255 - rgb.r,
      g: 255 - rgb.g,
      b: 255 - rgb.b,
    };
  }

  function getHoverColorFromElement(element) {
    const fallback = parseRgb(getPrimaryColor());
    if (!element || !(element instanceof Element)) {
      return fallback;
    }

    let node = element;
    while (node && node instanceof Element) {
      const style = getComputedStyle(node);
      const candidates = [
        style.backgroundColor,
        style.borderTopColor,
        style.color,
      ];

      for (const candidate of candidates) {
        if (isTransparent(candidate)) continue;
        const parsed = parseRgb(candidate);
        if (parsed) return parsed;
      }

      node = node.parentElement;
    }

    return fallback;
  }

  function installCustomCursor() {
    if (window.__pdeSimpleCursorReady) return;
    if (!canUseCustomCursor()) return;

    const style = document.createElement("style");
    style.id = "pde-simple-cursor-style";
    style.textContent = [
      "@media (hover: hover) and (pointer: fine) {",
      "  html, body, a, button, input, textarea, select, summary, label, [role='button'] { cursor: none !important; }",
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
      "  .pde-cursor-dot.is-hover-interactive { opacity: 0.88; animation: pdeCursorHoverRotate 888ms ease-in infinite}",
      "  .pde-cursor-dot.is-hover-interactive::after { animation: pdeCursorHoverPulse 888ms ease-in-out infinite; }",
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

    const hoverSelector =
      "a, button, [role='button'], summary, label[for], select, input, textarea, .btn, .zone, .medal, scrollbar-thumb, -webkit-scrollbar-thumb, span, .p4-cell, .uno-card-item, .uno-pile.tonTour";

    const applyHoverVisual = (target) => {
      const base =
        getHoverColorFromElement(target) || parseRgb(getPrimaryColor());
      const inv = inverseRgb(base);
      const invCss = rgbToCss(inv);
      const isInteractive = !!(target && target.closest(hoverSelector));

      dot.classList.toggle("is-hover-interactive", isInteractive);
      dot.style.setProperty("--pde-cursor-color", invCss);
      dot.style.backgroundColor = isInteractive ? "transparent" : invCss;
    };

    const clearHoverVisual = () => {
      dot.classList.remove("is-hover-interactive");
      applyColor(dot);
    };

    const render = () => {
      raf = 0;
      dot.style.left = nextX + "px";
      dot.style.top = nextY + "px";
    };

    const onMove = (event) => {
      const isPixelWarCanvas = !!(
        event.target &&
        event.target.closest &&
        event.target.closest(
          "#pixelwar-canvas, #admin-pixelwar-canvas, #board-wrapper",
        )
      );

      if (isPixelWarCanvas) {
        hideDot();
        return;
      }

      nextX = event.clientX;
      nextY = event.clientY;
      if (!raf) raf = window.requestAnimationFrame(render);

      applyHoverVisual(event.target);
      dot.classList.remove("is-hidden");
    };

    const hideDot = () => {
      dot.classList.add("is-hidden");
      clearHoverVisual();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", hideDot, { passive: true });
    window.addEventListener("blur", hideDot, { passive: true });

    window.addEventListener("uiColor:changed", () => {
      if (!dot.classList.contains("is-hover-interactive")) applyColor(dot);
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
