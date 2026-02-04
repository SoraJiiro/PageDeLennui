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
