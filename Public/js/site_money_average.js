export function initSiteMoneyAverageWidget(
  socket,
  { elementId = "hub-site-money-average" } = {},
) {
  if (!socket) return;

  const targetEl = document.getElementById(elementId);
  if (!targetEl) return;

  const render = (payload) => {
    if (!payload) return;

    const average = Number(payload.averageMoney);
    const total = Number(payload.totalMoney);
    const users = Number(payload.usersCount);

    const avgSafe = Number.isFinite(average) ? average : 0;
    const totalSafe = Number.isFinite(total)
      ? Math.max(0, Math.floor(total))
      : 0;
    const usersSafe = Number.isFinite(users)
      ? Math.max(0, Math.floor(users))
      : 0;

    targetEl.textContent =
      `Avg monnaie: ${Math.round(avgSafe).toLocaleString("fr-FR")}` +
      ` -- Total: ${totalSafe.toLocaleString("fr-FR")}
        -- Utilisateurs: ${usersSafe.toLocaleString("fr-FR")}`;
  };

  socket.on("economy:siteMoneyStats", render);

  socket.on("connect", () => {
    socket.emit("economy:siteMoneyStats:get");
  });
}
