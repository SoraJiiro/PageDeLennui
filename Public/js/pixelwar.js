let socket = null;
let canvas, ctx, container, wrapper;
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let isPainting = false;
let isErasing = false;
let lastPaintKey = null;
let lastEraseKey = null;
let startX, startY;
let currentTool = "draw";
let selectedColor = "#000000";
let pixelsInfo = {};

let COLORS = [
  "#FFFFFF",
  "#000000",
  "#FF0000",
  "#0000FF",
  "#FFFF00",
  "#008000",
  "#FFA500",
  "#F5F5DC",
  "#800080",
  "#A52A2A",
  "#FFC0CB",
  "#808080",
  "#00FFFF",
  "#7FFF00",
  "#FF00FF",
  "#5EAFFF",
];

let COLOR_NAMES = [
  "Blanc",
  "Noir",
  "Rouge",
  "Bleu",
  "Jaune",
  "Vert",
  "Orange",
  "Beige",
  "Violet",
  "Marron",
  "Rose",
  "Gris",
  "Cyan",
  "Citron vert",
  "Magenta",
  "Bleu ciel",
];

const BOARD_SIZE = 256;

const ZOOM_step = 0.5;
const MAX_ZOOM = 20;
const MIN_ZOOM = 0.7;

let hoverTimer = null;
let lastHoveredPixel = null;
let currentMouseX = 0;
let currentMouseY = 0;
const modal = document.getElementById("pixel-info-modal");
let gridCanvas, gridCtx;
let calcCanvas, calcCtx;

const calcLayer = {
  active: false,
  isPlacing: false,
  img: null,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  aspectRatio: 1,
  opacity: 0.42,
};

const CALC_MIN_SIZE = 8;
const CALC_RESIZE_HANDLE_SIZE = 8;
let isCalcDragging = false;
let isCalcResizing = false;
let calcDragOffsetX = 0;
let calcDragOffsetY = 0;

let isBatchMode = false;
let pendingPixels = new Map();
let localBoardCache = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
let unlockedColorIndices = new Set(Array.from({ length: 16 }, (_, i) => i));

export function initPixelWar(sock) {
  socket = sock;
  canvas = document.getElementById("pixelwar-canvas");
  ctx = canvas.getContext("2d", { alpha: false });
  wrapper = document.getElementById("board-wrapper");
  container = document.getElementById("canvas-container");
  if (container && canvas) {
    container.style.width = `${canvas.width}px`;
    container.style.height = `${canvas.height}px`;
  }

  window.debugPW = () => {
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  };
  gridCanvas = document.getElementById("grid-canvas");
  if (gridCanvas) {
    gridCtx = gridCanvas.getContext("2d");
  }
  calcCanvas = document.getElementById("calc-canvas");
  if (calcCanvas) {
    calcCtx = calcCanvas.getContext("2d", { alpha: true });
    calcCtx.imageSmoothingEnabled = false;
    calcCtx.mozImageSmoothingEnabled = false;
    calcCtx.webkitImageSmoothingEnabled = false;
    calcCtx.msImageSmoothingEnabled = false;
  }

  const ro = new ResizeObserver((entries) => {
    for (let entry of entries) {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        if (gridCanvas) {
          gridCanvas.width = entry.contentRect.width;
          gridCanvas.height = entry.contentRect.height;
        }

        if (!scale || scale <= MIN_ZOOM || isNaN(scale) || scale === Infinity) {
          centerView();
        } else {
          drawGrid();
        }
      }
    }
  });
  ro.observe(wrapper);

  initPalette();
  initControls();
  initCanvasEvents();

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.msImageSmoothingEnabled = false;

  try {
    centerView();
  } catch (e) {}

  const recenterPixelWarView = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          centerView();
        } catch (e) {}
      });
    });
  };

  window.addEventListener("pde:section-activated", (e) => {
    const sectionId = e && e.detail ? e.detail.sectionId : null;
    if (sectionId === "stage16") {
      recenterPixelWarView();
    }
  });

  socket.on("pixelwar:init", (data) => {
    if (Array.isArray(data.colors) && data.colors.length) {
      COLORS = data.colors.slice();
      if (!Array.isArray(COLOR_NAMES) || COLOR_NAMES.length < COLORS.length) {
        COLOR_NAMES = COLORS.map(
          (_, idx) => COLOR_NAMES[idx] || `Couleur ${idx + 1}`,
        );
      }
    }
    if (Array.isArray(data.unlockedColorIndices)) {
      unlockedColorIndices = new Set(
        data.unlockedColorIndices.map((v) => Number(v)),
      );
    }
    initPalette();
    updateStats(data);
    drawFullBoard(data.board);
  });

  socket.on("pixelwar:palette_update", (data) => {
    if (Array.isArray(data?.colors) && data.colors.length) {
      COLORS = data.colors.slice();
      if (!Array.isArray(COLOR_NAMES) || COLOR_NAMES.length < COLORS.length) {
        COLOR_NAMES = COLORS.map(
          (_, idx) => COLOR_NAMES[idx] || `Couleur ${idx + 1}`,
        );
      }
    }
    if (Array.isArray(data?.unlockedColorIndices)) {
      unlockedColorIndices = new Set(
        data.unlockedColorIndices.map((v) => Number(v)),
      );
    }
    initPalette();
  });

  socket.on("pixelwar:update_pixel", (data) => {
    const idx = parseInt(data.colorIndex, 10);

    const boardIdx = data.y * BOARD_SIZE + data.x;
    if (boardIdx >= 0 && boardIdx < localBoardCache.length) {
      localBoardCache[boardIdx] = idx;
    }

    const color = COLORS[idx];
    if (color) {
      const key = `${data.x},${data.y}`;
      if (!pendingPixels.has(key)) {
        drawPixel(data.x, data.y, color);
      }
    }
  });

  socket.on("pixelwar:stats", (data) => {
    updateStats(data);
  });

  socket.on("pixelwar:pixel_info", (data) => {
    showTooltip(data);
  });

  socket.on("pixelwar:error", (msg) => {
    if (window.showNotif) window.showNotif(msg, 3000);
    else alert(msg);
  });

  socket.on("pixelwar:success", (msg) => {
    if (window.showNotif) window.showNotif(msg, 3000);
    else alert(msg);
  });

  socket.emit("pixelwar:join");
}

function initPalette() {
  const p = document.getElementById("pixelwar-palette");
  if (!p) return;
  p.innerHTML = "";

  let visibleIndices = Array.from(unlockedColorIndices)
    .map((idx) => Number(idx))
    .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < COLORS.length)
    .sort((a, b) => a - b);

  // Fallback defensif: si rien n'est renvoye, afficher les couleurs de base.
  if (!visibleIndices.length) {
    visibleIndices = Array.from(
      { length: Math.min(16, COLORS.length) },
      (_, i) => i,
    );
  }

  const visibleColors = new Set(visibleIndices.map((idx) => COLORS[idx]));
  if (!visibleColors.has(selectedColor)) {
    selectedColor = COLORS[visibleIndices[0]] || "#000000";
  }

  visibleIndices.forEach((idx) => {
    const c = COLORS[idx];
    const div = document.createElement("div");
    div.className = "color-swatch";
    div.style.backgroundColor = c;
    div.title = COLOR_NAMES[idx] || "";
    if (c === selectedColor) div.classList.add("active");
    div.onclick = () => {
      selectColor(c);
    };
    p.appendChild(div);
  });
}

function selectColor(c) {
  selectedColor = c;
  currentTool = "draw";
  updateToolUI();
  document.querySelectorAll(".color-swatch").forEach((el) => {
    el.classList.toggle(
      "active",
      el.style.backgroundColor === rgbToHex(c) ||
        el.style.backgroundColor === c.toLowerCase(),
    );
  });
}

function updateToolUI() {
  document
    .getElementById("btn-move")
    .classList.toggle("active", currentTool === "move");
  document
    .getElementById("btn-draw")
    .classList.toggle("active", currentTool === "draw");
  document
    .getElementById("btn-erase")
    .classList.toggle("active", currentTool === "erase");

  if (currentTool === "move") wrapper.style.cursor = "grab";
  else if (currentTool === "erase") wrapper.style.cursor = "not-allowed";
  else wrapper.style.cursor = "crosshair";
}

function initControls() {
  document.getElementById("btn-move").onclick = () => {
    currentTool = "move";
    updateToolUI();
  };
  document.getElementById("btn-draw").onclick = () => {
    currentTool = "draw";
    updateToolUI();
  };
  document.getElementById("btn-erase").onclick = () => {
    currentTool = "erase";
    updateToolUI();
  };

  document.getElementById("btn-zoom-in").onclick = () =>
    zoomAtCenter(1 + ZOOM_step);
  document.getElementById("btn-zoom-out").onclick = () =>
    zoomAtCenter(1 - ZOOM_step);
  document.getElementById("btn-pixel-reset-view").onclick = centerView;

  const btnBatch = document.getElementById("btn-mode-batch");
  const batchControls = document.getElementById("batch-controls");

  btnBatch.onclick = () => {
    isBatchMode = !isBatchMode;
    btnBatch.classList.toggle("active", isBatchMode);
    batchControls.style.display = isBatchMode ? "flex" : "none";

    if (!isBatchMode) {
      cancelBatch();
    }
  };

  document.getElementById("btn-batch-confirm").onclick = confirmBatch;
  document.getElementById("btn-batch-cancel").onclick = cancelBatch;

  const buySingle = document.getElementById("buy-pixel-single");
  if (buySingle) {
    buySingle.onclick = () => socket.emit("pixelwar:buy", "pixel_1");
  }

  const buyPack = document.getElementById("buy-pixel-pack");
  if (buyPack) {
    buyPack.onclick = () => socket.emit("pixelwar:buy", "pixel_15");
  }

  const buyStorage = document.getElementById("buy-storage");
  if (buyStorage) {
    buyStorage.onclick = () => socket.emit("pixelwar:buy", "storage_10");
  }

  const calcInput = document.getElementById("calc-image-input");
  const calcUploadBtn = document.getElementById("btn-calc-upload");
  const calcLockBtn = document.getElementById("btn-calc-lock");
  const calcRemoveBtn = document.getElementById("btn-calc-remove");

  if (calcUploadBtn && calcInput) {
    calcUploadBtn.onclick = () => calcInput.click();
  }

  if (calcInput) {
    calcInput.onchange = (e) => {
      const file = e?.target?.files?.[0];
      if (!file) return;
      loadCalcFromFile(file);
      calcInput.value = "";
    };
  }

  if (calcRemoveBtn) {
    calcRemoveBtn.onclick = clearCalcLayer;
  }

  if (calcLockBtn) {
    calcLockBtn.onclick = lockCalcPlacement;
  }

  updateCalcButtons();
}

function centerView() {
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const minD = Math.min(rect.width, rect.height);
  scale = (minD / BOARD_SIZE) * 0.95;

  translateX = (rect.width - BOARD_SIZE * scale) / 2;
  translateY = (rect.height - BOARD_SIZE * scale) / 2;
  updateTransform();
}

function updateTransform() {
  if (isNaN(translateX) || isNaN(translateY) || isNaN(scale)) {
    return;
  }

  container.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  drawGrid();
}

function drawGrid() {
  // Quadrillage désactivé
  if (!gridCtx || !gridCanvas) return;
  const width = gridCanvas.width;
  const height = gridCanvas.height;
  gridCtx.clearRect(0, 0, width, height);
}

function zoomAtCenter(factor) {
  const rect = wrapper.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  const oldScale = scale;
  scale *= factor;
  if (scale > MAX_ZOOM) scale = MAX_ZOOM;
  if (scale < MIN_ZOOM) scale = MIN_ZOOM;

  translateX = cx - (cx - translateX) * (scale / oldScale);
  translateY = cy - (cy - translateY) * (scale / oldScale);

  updateTransform();
}

function initCanvasEvents() {
  wrapper.addEventListener("mousedown", (e) => {
    if (calcLayer.isPlacing && e.button === 0) {
      if (startCalcInteraction(e)) {
        e.preventDefault();
        return;
      }
      // Tant que le calc est en placement, on bloque le dessin normal.
      e.preventDefault();
      return;
    }

    const isMove =
      e.button === 1 ||
      e.button === 2 ||
      (e.button === 0 && e.altKey) ||
      (e.button === 0 && currentTool === "move");

    if (isMove) {
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      wrapper.style.cursor = "grabbing";
      e.preventDefault();
    } else if (e.button === 0) {
      if (currentTool === "draw" && isBatchMode) {
        isPainting = true;
        paintAtEvent(e);
      } else if (currentTool === "erase") {
        isErasing = true;
        eraseAtEvent(e);
      } else if (currentTool === "erase" && isBatchMode) {
        isErasing = true;
        eraseAtEvent(e);
      } else {
        handleCanvasClick(e);
      }
    }
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    isPainting = false;
    isErasing = false;
    stopCalcInteraction();
    lastPaintKey = null;
    lastEraseKey = null;
    if (!calcLayer.isPlacing) {
      updateToolUI();
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (isDragging) {
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
      return;
    }

    if (calcLayer.isPlacing) {
      handleCalcPlacementMouseMove(e);
      return;
    } else if (isPainting) {
      paintAtEvent(e);
    } else if (isErasing) {
      eraseAtEvent(e);
    } else {
      handleHover(e);
    }
  });

  wrapper.addEventListener(
    "wheel",
    (e) => {
      if (calcLayer.isPlacing && calcLayer.active) {
        const resized = resizeCalcWithWheel(e);
        if (resized) {
          e.preventDefault();
          return;
        }
      }

      e.preventDefault();

      const delta = -Math.sign(e.deltaY) * 0.15;
      const zoomFactor = 1 + delta;

      const rect = wrapper.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const oldScale = scale || 1;
      scale *= zoomFactor;
      if (scale > MAX_ZOOM) scale = MAX_ZOOM;
      if (scale < MIN_ZOOM) scale = MIN_ZOOM;

      if (isNaN(scale)) scale = 1;

      if (isNaN(translateX)) translateX = 0;
      if (isNaN(translateY)) translateY = 0;

      translateX = mouseX - (mouseX - translateX) * (scale / oldScale);
      translateY = mouseY - (mouseY - translateY) * (scale / oldScale);

      updateTransform();
    },
    { passive: false },
  );

  wrapper.addEventListener("contextmenu", (e) => e.preventDefault());
}

function getClientXY(e) {
  if (e?.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e?.changedTouches && e.changedTouches.length > 0) {
    return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function eventToBoardCoords(e) {
  if (!container || !canvas) return { x: NaN, y: NaN };

  const { x: clientX, y: clientY } = getClientXY(e);
  const rect = container.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: NaN, y: NaN };

  // On mappe le pointeur sur le rect reel du container transformé.
  // Cette conversion reste stable pour drag/resize, y compris grands ecrans.
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  const boardX = nx * canvas.width;
  const boardY = ny * canvas.height;

  return { x: boardX, y: boardY };
}

function paintAtEvent(e) {
  const { x, y } = eventToBoardCoords(e);

  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;

  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const key = `${ix},${iy}`;

  if (lastPaintKey === key) return;
  lastPaintKey = key;

  const colorIdx = COLORS.indexOf(selectedColor);
  if (colorIdx === -1) return;

  addToBatch(ix, iy, colorIdx, selectedColor);
}

function eraseAtEvent(e) {
  const { x, y } = eventToBoardCoords(e);

  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;

  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const key = `${ix},${iy}`;

  if (lastEraseKey === key) return;
  lastEraseKey = key;

  // Si le pixel est dans les pixels en attente (mode batch), le retirer localement
  if (pendingPixels.has(key)) {
    const p = pendingPixels.get(key);
    pendingPixels.delete(key);

    // Restaurer le pixel original
    const originalIdx = localBoardCache[iy * BOARD_SIZE + ix];
    const originalColor = COLORS[originalIdx] || "#FFFFFF";
    drawPixel(ix, iy, originalColor);
    updateBatchUI();
    return;
  }

  // Sinon, envoyer la demande d'effacement au serveur
  socket.emit("pixelwar:erase", { x: ix, y: iy });
}

function screenToBoard(sx, sy) {
  const cx = (sx - translateX) / scale;
  const cy = (sy - translateY) / scale;

  return { x: cx, y: cy };
}

function handleCanvasClick(e) {
  if (isDragging) {
    return;
  }

  const { x, y } = eventToBoardCoords(e);

  if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
    if (currentTool === "draw") {
      if (!isBatchMode) {
        if (window.showNotif)
          window.showNotif("Active le mode Dessin pour dessiner.", 2500);
        return;
      }
      const ix = Math.floor(x);
      const iy = Math.floor(y);

      const colorIdx = COLORS.indexOf(selectedColor);
      if (colorIdx === -1) {
        return;
      }

      addToBatch(ix, iy, colorIdx, selectedColor);
    }
  }
}

function addToBatch(x, y, colorIdx, colorHex) {
  const key = `${x},${y}`;
  if (pendingPixels.has(key)) {
    const p = pendingPixels.get(key);
    if (p.colorIdx === colorIdx) {
      pendingPixels.delete(key);
      const originalIdx = localBoardCache[y * BOARD_SIZE + x];
      const originalColor = COLORS[originalIdx] || "#FFFFFF";
      drawPixel(x, y, originalColor);
      updateBatchUI();
      return;
    }
  }

  const currentStock =
    parseInt(document.getElementById("pixel-count").innerText, 10) || 0;
  if (pendingPixels.size >= currentStock) {
    if (!pendingPixels.has(key)) {
      if (window.showNotif) window.showNotif("Pas assez de pixels !", 2000);
      return;
    }
  }

  pendingPixels.set(key, { x, y, colorIdx, colorHex });
  drawPixel(x, y, colorHex, { pending: true });
  updateBatchUI();
}

function updateBatchUI() {
  document.getElementById("batch-count").innerText = pendingPixels.size;
}

function cancelBatch() {
  pendingPixels.forEach((p) => {
    const idx = p.y * BOARD_SIZE + p.x;
    const originalIdx = localBoardCache[idx];
    const color = COLORS[originalIdx] || "#FFFFFF";
    drawPixel(p.x, p.y, color);
  });
  pendingPixels.clear();
  updateBatchUI();
}

function confirmBatch() {
  if (pendingPixels.size === 0) return;

  pendingPixels.forEach((p) => {
    socket.emit("pixelwar:place", { x: p.x, y: p.y, colorIndex: p.colorIdx });
  });

  // Marque la fin de la validation du dessin (mode batch).
  // Permet au serveur de persister immédiatement le compteur de pixels.
  socket.emit("pixelwar:batch_done");

  pendingPixels.clear();
  updateBatchUI();
}

function handleHover(e) {
  const { x, y } = eventToBoardCoords(e);
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  // Mettre à jour les coordonnées actuelles du curseur
  const { x: clientX, y: clientY } = getClientXY(e);
  currentMouseX = clientX;
  currentMouseY = clientY;

  if (
    lastHoveredPixel &&
    lastHoveredPixel.x === ix &&
    lastHoveredPixel.y === iy
  ) {
    return;
  }

  lastHoveredPixel = { x: ix, y: iy };
  hideTooltip();

  if (hoverTimer) clearTimeout(hoverTimer);

  if (ix >= 0 && ix < BOARD_SIZE && iy >= 0 && iy < BOARD_SIZE) {
    hoverTimer = setTimeout(() => {
      requestPixelInfo(ix, iy);
    }, 1000);
  }
}

function requestPixelInfo(x, y) {
  // Positionner le modal au-dessus du curseur actuel
  modal.style.left = px(currentMouseX + 10);
  modal.style.top = px(currentMouseY - 60); // Au-dessus du curseur

  socket.emit("pixelwar:get_info", { x, y });
}

function showTooltip(data) {
  const modal = document.getElementById("pixel-info-modal");
  modal.style.left = px(currentMouseX - 25);
  modal.style.top = px(currentMouseY - 225);

  if (data.owner) {
    modal.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;">
            <img src="${data.pfp || "/Public/imgs/defaultProfile.png"}" onerror="this.src='/Public/imgs/defaultProfile.png'">
            <strong>${data.pseudo || "Inconnu"}</strong>
        </div>
        <div style="font-size:0.7em; color:#bbb;">(${data.x}, ${data.y})</div>
    `;
  } else {
    modal.innerHTML = `
        <div style="text-align:center;">
            <strong>Pixel vide</strong>
        </div>
        <div style="font-size:0.7em; color:#bbb;">(${data.x}, ${data.y})</div>
    `;
  }

  modal.style.display = "block";
}

function hideTooltip() {
  const modal = document.getElementById("pixel-info-modal");
  modal.style.display = "none";
}

function updateStats(data) {
  if (data.pixels !== undefined)
    document.getElementById("pixel-count").innerText = data.pixels;
  if (data.maxPixels !== undefined)
    document.getElementById("pixel-max").innerText = data.maxPixels;
  if (data.nextPixelIn !== undefined) {
    startTimer(data.nextPixelIn);
  }
}

let timerInterval;
function startTimer(ms) {
  if (timerInterval) clearInterval(timerInterval);
  let target = Date.now() + ms;

  function tick() {
    let diff = target - Date.now();
    if (diff <= 0) {
      document.getElementById("pixel-timer").innerText = "00:00";
      clearInterval(timerInterval);
      // Demander une mise à jour des stats au serveur
      if (socket) {
        socket.emit("pixelwar:request_stats");
      }
      return;
    }
    let sec = Math.floor(diff / 1000);
    let m = Math.floor(sec / 60);
    let s = sec % 60;
    document.getElementById("pixel-timer").innerText =
      `${m}:${s.toString().padStart(2, "0")}`;
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function drawFullBoard(compressedBoard) {
  if (!compressedBoard) return;

  let boardData = compressedBoard;
  if (compressedBoard.data && Array.isArray(compressedBoard.data)) {
    boardData = compressedBoard.data;
  } else if (compressedBoard instanceof ArrayBuffer) {
    boardData = new Uint8Array(compressedBoard);
  }

  if (boardData.length === BOARD_SIZE * BOARD_SIZE) {
    localBoardCache.set(boardData);
  }

  const imgData = ctx.createImageData(BOARD_SIZE, BOARD_SIZE);
  const data = imgData.data;

  const colorMap = COLORS.map((hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  });

  const len = BOARD_SIZE * BOARD_SIZE;
  for (let i = 0; i < len; i++) {
    const colorIdx = boardData[i] || 0;
    const [r, g, b] = colorMap[colorIdx] || [255, 255, 255];

    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);

  if (isBatchMode && pendingPixels.size > 0) {
    pendingPixels.forEach((p) => {
      drawPixel(p.x, p.y, p.colorHex, { pending: true });
    });
  }
}

function drawPixel(x, y, colorHex, options = {}) {
  if (!colorHex) return;
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  ctx.fillStyle = colorHex;
  ctx.fillRect(ix, iy, 1, 1);
}

function rgbToHex(c) {
  if (c.startsWith("#")) return c;
  return c;
}

function loadCalcFromFile(file) {
  if (!file || !calcCtx) return;

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    const fit = Math.min(BOARD_SIZE / img.width, BOARD_SIZE / img.height, 1);
    const w = clamp(Math.floor(img.width * fit), CALC_MIN_SIZE, BOARD_SIZE);
    const h = clamp(Math.floor(img.height * fit), CALC_MIN_SIZE, BOARD_SIZE);

    calcLayer.active = true;
    calcLayer.isPlacing = true;
    calcLayer.img = img;
    calcLayer.width = w;
    calcLayer.height = h;
    calcLayer.aspectRatio =
      img.width > 0 && img.height > 0 ? img.width / img.height : 1;
    calcLayer.x = clamp(Math.floor((BOARD_SIZE - w) / 2), 0, BOARD_SIZE - w);
    calcLayer.y = clamp(Math.floor((BOARD_SIZE - h) / 2), 0, BOARD_SIZE - h);
    stopCalcInteraction();

    drawCalcLayer();
    updateCalcButtons();
    updateCalcPlacementCursor(null);

    if (window.showNotif) {
      window.showNotif(
        "Glisse le calc, redimensionne via le coin bas-droite, puis valide.",
        4200,
      );
    }

    URL.revokeObjectURL(objectUrl);
  };

  img.onerror = () => {
    if (window.showNotif)
      window.showNotif("Image invalide pour le calc.", 2500);
    URL.revokeObjectURL(objectUrl);
  };

  img.src = objectUrl;
}

function startCalcInteraction(e) {
  if (!calcLayer.active || !calcLayer.isPlacing) return false;

  const { x, y } = eventToBoardCoords(e);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  const bx = Math.floor(x);
  const by = Math.floor(y);
  if (!isPointInsideCalc(bx, by)) return false;

  if (isPointOnCalcResizeHandle(bx, by)) {
    isCalcResizing = true;
    isCalcDragging = false;
    return true;
  }

  isCalcDragging = true;
  isCalcResizing = false;
  calcDragOffsetX = bx - calcLayer.x;
  calcDragOffsetY = by - calcLayer.y;
  return true;
}

function handleCalcPlacementMouseMove(e) {
  if (!calcLayer.active || !calcLayer.isPlacing) return;

  const { x, y } = eventToBoardCoords(e);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    updateCalcPlacementCursor(null);
    return;
  }

  const bx = Math.floor(x);
  const by = Math.floor(y);

  if (isCalcDragging) {
    const nextX = bx - calcDragOffsetX;
    const nextY = by - calcDragOffsetY;
    calcLayer.x = clamp(nextX, 0, BOARD_SIZE - calcLayer.width);
    calcLayer.y = clamp(nextY, 0, BOARD_SIZE - calcLayer.height);
    drawCalcLayer();
  } else if (isCalcResizing) {
    const desiredWidth = bx - calcLayer.x + 1;
    resizeCalcByWidth(desiredWidth);
  }

  updateCalcPlacementCursor({ x: bx, y: by });
}

function stopCalcInteraction() {
  isCalcDragging = false;
  isCalcResizing = false;
}

function lockCalcPlacement() {
  if (!calcLayer.active || !calcLayer.isPlacing) return;

  stopCalcInteraction();

  calcLayer.isPlacing = false;
  drawCalcLayer();
  updateCalcButtons();
  updateToolUI();

  if (window.showNotif) {
    window.showNotif("Calc verrouille. Tu peux dessiner par-dessus.", 3000);
  }
}

function clearCalcLayer() {
  calcLayer.active = false;
  calcLayer.isPlacing = false;
  calcLayer.img = null;
  calcLayer.x = 0;
  calcLayer.y = 0;
  calcLayer.width = 0;
  calcLayer.height = 0;
  calcLayer.aspectRatio = 1;
  stopCalcInteraction();
  updateToolUI();

  if (calcCtx && calcCanvas) {
    calcCtx.clearRect(0, 0, calcCanvas.width, calcCanvas.height);
  }

  updateCalcButtons();
}

function drawCalcLayer() {
  if (!calcCtx || !calcCanvas) return;
  calcCtx.clearRect(0, 0, calcCanvas.width, calcCanvas.height);

  if (!calcLayer.active || !calcLayer.img) return;

  calcCtx.save();
  calcCtx.globalAlpha = calcLayer.opacity;
  calcCtx.drawImage(
    calcLayer.img,
    calcLayer.x,
    calcLayer.y,
    calcLayer.width,
    calcLayer.height,
  );
  calcCtx.restore();

  if (calcLayer.isPlacing) {
    calcCtx.save();
    calcCtx.strokeStyle = "rgba(255, 210, 77, 0.95)";
    calcCtx.lineWidth = 1;
    calcCtx.strokeRect(
      calcLayer.x + 0.5,
      calcLayer.y + 0.5,
      Math.max(0, calcLayer.width - 1),
      Math.max(0, calcLayer.height - 1),
    );

    const handleX = calcLayer.x + calcLayer.width - CALC_RESIZE_HANDLE_SIZE;
    const handleY = calcLayer.y + calcLayer.height - CALC_RESIZE_HANDLE_SIZE;
    calcCtx.fillStyle = "rgba(255, 210, 77, 0.95)";
    calcCtx.fillRect(
      handleX,
      handleY,
      CALC_RESIZE_HANDLE_SIZE,
      CALC_RESIZE_HANDLE_SIZE,
    );
    calcCtx.restore();
  }
}

function updateCalcButtons() {
  const calcRemoveBtn = document.getElementById("btn-calc-remove");
  const calcUploadBtn = document.getElementById("btn-calc-upload");
  const calcLockBtn = document.getElementById("btn-calc-lock");

  if (calcRemoveBtn) {
    calcRemoveBtn.disabled = !calcLayer.active;
  }

  if (calcLockBtn) {
    calcLockBtn.disabled = !calcLayer.active || !calcLayer.isPlacing;
  }

  if (calcUploadBtn) {
    calcUploadBtn.classList.toggle("calc-placing", calcLayer.isPlacing);
  }
}

function resizeCalcByWidth(desiredWidth) {
  if (!calcLayer.active) return;

  const ratio = calcLayer.aspectRatio > 0 ? calcLayer.aspectRatio : 1;
  const maxWidth = BOARD_SIZE - calcLayer.x;
  const maxHeight = BOARD_SIZE - calcLayer.y;

  let nextWidth = clamp(Math.floor(desiredWidth), CALC_MIN_SIZE, maxWidth);
  let nextHeight = Math.max(CALC_MIN_SIZE, Math.round(nextWidth / ratio));

  if (nextHeight > maxHeight) {
    nextHeight = maxHeight;
    nextWidth = Math.max(CALC_MIN_SIZE, Math.round(nextHeight * ratio));
  }

  nextWidth = clamp(nextWidth, CALC_MIN_SIZE, maxWidth);
  nextHeight = clamp(nextHeight, CALC_MIN_SIZE, maxHeight);

  calcLayer.width = nextWidth;
  calcLayer.height = nextHeight;
  drawCalcLayer();
}

function resizeCalcWithWheel(e) {
  if (!calcLayer.active || !calcLayer.isPlacing) return false;

  const { x, y } = eventToBoardCoords(e);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  const bx = Math.floor(x);
  const by = Math.floor(y);
  if (!isPointInsideCalc(bx, by)) return false;

  const step = e.deltaY < 0 ? 1 : -1;
  resizeCalcByWidth(calcLayer.width + step);
  updateCalcPlacementCursor({ x: bx, y: by });
  return true;
}

function isPointInsideCalc(x, y) {
  return (
    x >= calcLayer.x &&
    x < calcLayer.x + calcLayer.width &&
    y >= calcLayer.y &&
    y < calcLayer.y + calcLayer.height
  );
}

function isPointOnCalcResizeHandle(x, y) {
  return (
    x >= calcLayer.x + calcLayer.width - CALC_RESIZE_HANDLE_SIZE &&
    x < calcLayer.x + calcLayer.width &&
    y >= calcLayer.y + calcLayer.height - CALC_RESIZE_HANDLE_SIZE &&
    y < calcLayer.y + calcLayer.height
  );
}

function updateCalcPlacementCursor(boardPoint) {
  if (!wrapper || !calcLayer.isPlacing) return;
  if (!boardPoint) {
    wrapper.style.cursor = "crosshair";
    return;
  }

  if (isPointOnCalcResizeHandle(boardPoint.x, boardPoint.y)) {
    wrapper.style.cursor = "nwse-resize";
    return;
  }

  if (isPointInsideCalc(boardPoint.x, boardPoint.y)) {
    wrapper.style.cursor = "move";
    return;
  }

  wrapper.style.cursor = "crosshair";
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function px(v) {
  return v + "px";
}
