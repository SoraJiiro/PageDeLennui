function pixelWarResetBoard() {
  const socket = window.adminSocket;
  if (!socket) return alert("Socket not ready");

  if (!confirm("⚠️ RESET ENTIRE PIXEL WAR BOARD? THIS CANNOT BE UNDONE."))
    return;
  if (!confirm("⚠️ SERIOUSLY? ALL ART WILL BE LOST.")) return;
  socket.emit("admin:pixelwar:reset_board");
  showNotification("✅ Reset board command sent", "success");
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
  "#00FFFF",
  "#7FFF00",
  "#FF00FF",
  "#1E90FF",
];

let adminPwCanvas = null;
let adminPwCtx = null;
let adminPwOverlay = null;
let adminPwOverlayCtx = null;
let adminPwSelectionPoints = [];
let adminPwAttached = false;

function adminPwComputeBoundingSquare(points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  let minX = ADMIN_PW_BOARD_SIZE - 1;
  let minY = ADMIN_PW_BOARD_SIZE - 1;
  let maxX = 0;
  let maxY = 0;

  for (const p of points) {
    if (!p) continue;
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

  return { sqMinX, sqMinY, sqMaxX, sqMaxY };
}

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
    const sq = adminPwComputeBoundingSquare(adminPwSelectionPoints);
    if (sq) {
      const w = sq.sqMaxX - sq.sqMinX + 1;
      const h = sq.sqMaxY - sq.sqMinY + 1;

      adminPwOverlayCtx.strokeRect(
        sq.sqMinX + 0.5,
        sq.sqMinY + 0.5,
        w - 1,
        h - 1,
      );

      adminPwOverlayCtx.fillStyle = "rgba(255, 64, 64, 0.12)";
      adminPwOverlayCtx.fillRect(sq.sqMinX, sq.sqMinY, w, h);
    }
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
  adminPwSetStatus("Clique 2 coins opposés (1/2)");
  adminPwRedrawOverlay();
}

function pixelWarClearSelection() {
  const socket = window.adminSocket;
  if (!socket) return alert("Socket not ready");

  if (adminPwSelectionPoints.length !== 2) {
    return alert("Clique 2 coins opposés avant de clear.");
  }

  const pts = adminPwSelectionPoints.map((p) => ({ x: p.x, y: p.y }));

  const sq = adminPwComputeBoundingSquare(adminPwSelectionPoints);
  if (!sq) return alert("Sélection invalide.");
  const w = sq.sqMaxX - sq.sqMinX + 1;
  const h = sq.sqMaxY - sq.sqMinY + 1;
  if (
    !confirm(
      `⚠️ Clear le carré sélectionné ?\nDe (${sq.sqMinX},${sq.sqMinY}) à (${sq.sqMaxX},${sq.sqMaxY}) — ${w}x${h}`,
    )
  )
    return;

  socket.emit("admin:pixelwar:clear_square", { points: pts });

  // Mise à jour immédiate côté admin (optimiste)
  if (adminPwCtx) {
    adminPwCtx.fillStyle = ADMIN_PW_COLORS[0] || "#FFFFFF";
    adminPwCtx.fillRect(sq.sqMinX, sq.sqMinY, w, h);
  }

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

    // UX plus simple : 2 clics opposés.
    // Si déjà 2 points, un nouveau clic redémarre la sélection.
    if (adminPwSelectionPoints.length >= 2) {
      adminPwSelectionPoints = [pt];
      adminPwSetStatus(`Coin 1/2: (${pt.x},${pt.y}) — clique le coin opposé`);
      adminPwRedrawOverlay();
      return;
    }

    adminPwSelectionPoints.push(pt);
    if (adminPwSelectionPoints.length === 1) {
      adminPwSetStatus(`Coin 1/2: (${pt.x},${pt.y}) — clique le coin opposé`);
    } else {
      const sq = adminPwComputeBoundingSquare(adminPwSelectionPoints);
      if (sq) {
        const w = sq.sqMaxX - sq.sqMinX + 1;
        const h = sq.sqMaxY - sq.sqMinY + 1;
        adminPwSetStatus(
          `Coin 2/2: (${pt.x},${pt.y}) — carré: (${sq.sqMinX},${sq.sqMinY})→(${sq.sqMaxX},${sq.sqMaxY}) ${w}x${h}`,
        );
      } else {
        adminPwSetStatus(`Coin 2/2: (${pt.x},${pt.y})`);
      }
    }

    adminPwRedrawOverlay();
  });

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
