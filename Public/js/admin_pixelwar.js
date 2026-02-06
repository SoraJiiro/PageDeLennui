function pixelWarResetBoard() {
  const socket = window.adminSocket;
  if (!socket) return alert("Socket not ready");

  if (!confirm("⚠️ RESET ENTIRE PIXEL WAR BOARD? THIS CANNOT BE UNDONE."))
    return;
  if (!confirm("⚠️ SERIOUSLY? ALL ART WILL BE LOST.")) return;
  socket.emit("admin:pixelwar:reset_board");
  showNotification("✅ Reset board command sent", "success");
}

function pixelWarResetArea() {
  const socket = window.adminSocket;
  const x1 = parseInt(document.getElementById("pw-x1").value) || 0;
  const y1 = parseInt(document.getElementById("pw-y1").value) || 0;
  const x2 = parseInt(document.getElementById("pw-x2").value) || 0;
  const y2 = parseInt(document.getElementById("pw-y2").value) || 0;

  if (!confirm(`⚠️ Reset area (${x1},${y1}) to (${x2},${y2})?`)) return;

  socket.emit("admin:pixelwar:reset_area", { x1, y1, x2, y2 });
  showNotification("✅ Reset area command sent", "success");
}

// -----------------------------
// Admin realtime viewer + 4-point clear
// -----------------------------

const ADMIN_PW_BOARD_SIZE = 256;
const ADMIN_PW_COLORS = [
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
];

let adminPwCanvas = null;
let adminPwCtx = null;
let adminPwOverlay = null;
let adminPwOverlayCtx = null;
let adminPwSelectionPoints = [];
let adminPwAttached = false;

function adminPwSetStatus(text) {
  const el = document.getElementById("admin-pw-selection-status");
  if (el) el.textContent = text;
}

function adminPwNormalizeBoard(board) {
  if (!board) return null;
  if (board instanceof Uint8Array) return board;
  if (Array.isArray(board)) return Uint8Array.from(board);
  // socket.io may send { type:'Buffer', data:[...] }
  if (board && Array.isArray(board.data)) return Uint8Array.from(board.data);
  return null;
}

function adminPwDrawFullBoard(boardU8) {
  if (!adminPwCtx || !boardU8) return;
  adminPwCtx.clearRect(0, 0, ADMIN_PW_BOARD_SIZE, ADMIN_PW_BOARD_SIZE);
  for (let y = 0; y < ADMIN_PW_BOARD_SIZE; y++) {
    for (let x = 0; x < ADMIN_PW_BOARD_SIZE; x++) {
      const idx = boardU8[y * ADMIN_PW_BOARD_SIZE + x] || 0;
      adminPwCtx.fillStyle = ADMIN_PW_COLORS[idx] || "#FFFFFF";
      adminPwCtx.fillRect(x, y, 1, 1);
    }
  }
}

function adminPwDrawPixel(x, y, colorIndex) {
  if (!adminPwCtx) return;
  const idx = Number(colorIndex) || 0;
  adminPwCtx.fillStyle = ADMIN_PW_COLORS[idx] || "#FFFFFF";
  adminPwCtx.fillRect(x, y, 1, 1);
}

function adminPwRedrawOverlay() {
  if (!adminPwOverlayCtx) return;
  adminPwOverlayCtx.clearRect(0, 0, ADMIN_PW_BOARD_SIZE, ADMIN_PW_BOARD_SIZE);

  if (adminPwSelectionPoints.length === 0) return;

  adminPwOverlayCtx.strokeStyle = "rgba(255, 64, 64, 0.95)";
  adminPwOverlayCtx.lineWidth = 1;

  // Draw bounding square based on selected points
  if (adminPwSelectionPoints.length >= 2) {
    let minX = ADMIN_PW_BOARD_SIZE - 1;
    let minY = ADMIN_PW_BOARD_SIZE - 1;
    let maxX = 0;
    let maxY = 0;
    for (const p of adminPwSelectionPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const side = Math.max(width, height);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let sqMinX = Math.floor(cx - side / 2);
    let sqMinY = Math.floor(cy - side / 2);
    let sqMaxX = sqMinX + side;
    let sqMaxY = sqMinY + side;

    if (sqMinX < 0) {
      sqMaxX += -sqMinX;
      sqMinX = 0;
    }
    if (sqMinY < 0) {
      sqMaxY += -sqMinY;
      sqMinY = 0;
    }
    if (sqMaxX >= ADMIN_PW_BOARD_SIZE) {
      const d = sqMaxX - (ADMIN_PW_BOARD_SIZE - 1);
      sqMinX -= d;
      sqMaxX -= d;
    }
    if (sqMaxY >= ADMIN_PW_BOARD_SIZE) {
      const d = sqMaxY - (ADMIN_PW_BOARD_SIZE - 1);
      sqMinY -= d;
      sqMaxY -= d;
    }
    if (sqMinX < 0) sqMinX = 0;
    if (sqMinY < 0) sqMinY = 0;

    adminPwOverlayCtx.strokeRect(
      sqMinX + 0.5,
      sqMinY + 0.5,
      (sqMaxX - sqMinX + 1) - 1,
      (sqMaxY - sqMinY + 1) - 1
    );

    adminPwOverlayCtx.fillStyle = "rgba(255, 64, 64, 0.12)";
    adminPwOverlayCtx.fillRect(
      sqMinX,
      sqMinY,
      sqMaxX - sqMinX + 1,
      sqMaxY - sqMinY + 1
    );
  }

  // Draw points
  for (const p of adminPwSelectionPoints) {
    adminPwOverlayCtx.fillStyle = "rgba(255, 64, 64, 0.95)";
    adminPwOverlayCtx.fillRect(p.x, p.y, 1, 1);
  }
}

function adminPwCanvasToBoardCoords(evt) {
  const rect = adminPwCanvas.getBoundingClientRect();
  const rx = (evt.clientX - rect.left) / rect.width;
  const ry = (evt.clientY - rect.top) / rect.height;
  const x = Math.floor(rx * ADMIN_PW_BOARD_SIZE);
  const y = Math.floor(ry * ADMIN_PW_BOARD_SIZE);
  if (x < 0 || x >= ADMIN_PW_BOARD_SIZE || y < 0 || y >= ADMIN_PW_BOARD_SIZE)
    return null;
  return { x, y };
}

function pixelWarClearSelectionCancel() {
  adminPwSelectionPoints = [];
  adminPwSetStatus("Clique 4 coins puis un 5e clic pour confirmer");
  adminPwRedrawOverlay();
}

function pixelWarClearSelection() {
  const socket = window.adminSocket;
  if (!socket) return alert("Socket not ready");

  if (adminPwSelectionPoints.length !== 4) {
    return alert("Il faut 4 points (coins) avant de confirmer.");
  }

  const pts = adminPwSelectionPoints.map((p) => ({ x: p.x, y: p.y }));
  if (!confirm(`⚠️ Clear le carré/rectangle englobant ces points ?`)) return;

  socket.emit("admin:pixelwar:clear_square", { points: pts });
  showNotification("✅ Clear zone command sent", "success");
  pixelWarClearSelectionCancel();
}

window.pixelWarClearSelection = pixelWarClearSelection;
window.pixelWarClearSelectionCancel = pixelWarClearSelectionCancel;

function adminPwAttachSocketHandlers(sock) {
  if (adminPwAttached) return;
  adminPwAttached = true;

  sock.on("connect", () => {
    try {
      sock.emit("pixelwar:join");
    } catch (e) {}
  });

  sock.on("pixelwar:init", (data) => {
    const boardU8 = adminPwNormalizeBoard(data && data.board);
    if (!boardU8) return;
    adminPwDrawFullBoard(boardU8);
  });

  sock.on("pixelwar:update_pixel", (data) => {
    if (!data) return;
    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < 0 || x >= ADMIN_PW_BOARD_SIZE || y < 0 || y >= ADMIN_PW_BOARD_SIZE)
      return;
    adminPwDrawPixel(x, y, data.colorIndex);
  });

  // If socket already connected, join immediately
  if (sock.connected) {
    try {
      sock.emit("pixelwar:join");
    } catch (e) {}
  }
}

function initAdminPixelWarUI() {
  adminPwCanvas = document.getElementById("admin-pixelwar-canvas");
  adminPwOverlay = document.getElementById("admin-pixelwar-overlay");
  if (!adminPwCanvas) return;

  adminPwCtx = adminPwCanvas.getContext("2d", { alpha: false });
  adminPwCtx.imageSmoothingEnabled = false;
  if (adminPwOverlay) {
    adminPwOverlayCtx = adminPwOverlay.getContext("2d");
    adminPwOverlayCtx.imageSmoothingEnabled = false;
  }

  pixelWarClearSelectionCancel();

  adminPwCanvas.addEventListener("click", (evt) => {
    const pt = adminPwCanvasToBoardCoords(evt);
    if (!pt) return;

    if (adminPwSelectionPoints.length === 4) {
      // 5e clic = confirmation
      pixelWarClearSelection();
      return;
    }

    adminPwSelectionPoints.push(pt);
    if (adminPwSelectionPoints.length < 4) {
      adminPwSetStatus(
        `Coins: ${adminPwSelectionPoints.length}/4 (dernier: ${pt.x},${pt.y})`
      );
    } else {
      adminPwSetStatus(
        `Coins: 4/4 — clique une 5e fois pour confirmer (${pt.x},${pt.y})`
      );
    }

    adminPwRedrawOverlay();
  });

  // wait for socket
  const tryAttach = () => {
    if (window.adminSocket) {
      adminPwAttachSocketHandlers(window.adminSocket);
      return true;
    }
    return false;
  };

  if (!tryAttach()) {
    const timer = setInterval(() => {
      if (tryAttach()) clearInterval(timer);
    }, 250);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    initAdminPixelWarUI();
  } catch (e) {
    console.warn("Admin PixelWar UI init failed:", e);
  }
});
