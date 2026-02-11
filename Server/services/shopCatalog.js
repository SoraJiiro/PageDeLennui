const { FileService } = require("../util");

const DEFAULT_ITEMS = {
  life_1: {
    id: "life_1",
    name: "Vie x1",
    emoji: "\u2764\uFE0F",
    price: 12500,
    available: true,
    type: "revive_life",
    amount: 1,
    desc: "Ajoute 1 vie de reanimation pour les mini-jeux.",
  },
  life_2: {
    id: "life_2",
    name: "Vie x2",
    emoji: "\u2764\uFE0F\u2764\uFE0F",
    price: 23000,
    available: true,
    type: "revive_life",
    amount: 2,
    desc: "Ajoute 2 vies de reanimation pour les mini-jeux.",
  },
  life_3: {
    id: "life_3",
    name: "Vie x3",
    emoji: "\u2764\uFE0F\u2764\uFE0F\u2764\uFE0F",
    price: 33000,
    available: true,
    type: "revive_life",
    amount: 3,
    desc: "Ajoute 3 vies de reanimation pour les mini-jeux.",
  },
  pixel_1: {
    id: "pixel_1",
    name: "Pixel x1",
    emoji: "\uD83D\uDFE9",
    price: 2500,
    available: true,
    type: "pixelwar",
    upgrade: "pixel_1",
    desc: "Ajoute 1 pixel a placer dans Pixel War.",
  },
  pixel_15: {
    id: "pixel_15",
    name: "Pixels x15",
    emoji: "\uD83D\uDFE9",
    price: 30000,
    available: true,
    type: "pixelwar",
    upgrade: "pixel_15",
    desc: "Ajoute 15 pixels a placer dans Pixel War.",
  },
  storage_10: {
    id: "storage_10",
    name: "Stockage +10",
    emoji: "\uD83D\uDCE6",
    price: 10500,
    available: true,
    type: "pixelwar",
    upgrade: "storage_10",
    desc: "Augmente la capacite Pixel War de 10.",
  },
};

function ensureShopCatalog() {
  if (
    !FileService.data.shopCatalog ||
    typeof FileService.data.shopCatalog !== "object"
  ) {
    FileService.data.shopCatalog = { items: {} };
  }
  if (!FileService.data.shopCatalog.items) {
    FileService.data.shopCatalog.items = {};
  }

  let changed = false;
  Object.values(DEFAULT_ITEMS).forEach((item) => {
    if (!FileService.data.shopCatalog.items[item.id]) {
      FileService.data.shopCatalog.items[item.id] = item;
      changed = true;
    }
  });
  if (changed) {
    FileService.save("shopCatalog", FileService.data.shopCatalog);
  }
  return FileService.data.shopCatalog;
}

function getShopItem(id) {
  if (!id) return null;
  const catalog = ensureShopCatalog();
  return catalog.items[id] || null;
}

function listShopItems() {
  const catalog = ensureShopCatalog();
  return Object.values(catalog.items || {});
}

module.exports = { ensureShopCatalog, getShopItem, listShopItems };
