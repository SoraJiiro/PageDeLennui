const fs = require("fs");
const path = require("path");
const config = require("../config");

class PixelWarGame {
  constructor(fileService) {
    this.fileService = fileService;

    this.boardPath = path.join(config.DATA, "pixelwar_board.json");
    this.usersPath = path.join(config.DATA, "pixelwar_users.json");

    this.WIDTH = 256;
    this.HEIGHT = 256;
    this.COLORS = [
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

    this.board = new Uint8Array(this.WIDTH * this.HEIGHT);
    this.owners = {};
    this.users = {};

    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.usersPath)) {
        this.users = JSON.parse(fs.readFileSync(this.usersPath, "utf8"));
      }
    } catch (e) {
      console.error("Failed to load pixelwar users:", e);
      this.users = {};
    }

    try {
      if (fs.existsSync(this.boardPath)) {
        const data = JSON.parse(fs.readFileSync(this.boardPath, "utf8"));
        if (data.board && data.board.length === this.WIDTH * this.HEIGHT) {
          this.board = Uint8Array.from(Object.values(data.board));
        }
        this.owners = data.owners || {};
      }
    } catch (e) {
      console.error("Failed to load pixelwar board:", e);
      this.board.fill(0);
    }
  }

  saveUsers() {
    try {
      fs.writeFileSync(this.usersPath, JSON.stringify(this.users, null, 2));
    } catch (e) {
      console.error("Failed to save pixelwar users:", e);
    }
  }

  saveBoard() {
    try {
      const data = {
        board: Array.from(this.board),
        owners: this.owners,
      };
      fs.writeFileSync(this.boardPath, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save pixelwar board:", e);
    }
  }

  startAutoSave() {
    setInterval(() => {
      if (this.boardDirty) {
        this.saveBoard();
        this.boardDirty = false;
      }
      if (this.usersDirty) {
        this.saveUsers();
        this.usersDirty = false;
      }
    }, 10000);
  }

  getUserState(pseudo) {
    if (!this.users[pseudo]) {
      this.users[pseudo] = {
        pixels: 0,
        maxPixels: 30,
        lastPixelGeneration: Date.now(),
        lastDaily: null,
        pixelsPlaced: 0,
        pixelsOverridden: 0,
        pixelsErased: 0,
      };
      this.usersDirty = true;
    }

    const user = this.users[pseudo];

    const now = Date.now();
    const diff = now - user.lastPixelGeneration;
    const generated = Math.floor(diff / 60000);

    if (generated > 0) {
      if (user.pixels < user.maxPixels) {
        const space = user.maxPixels - user.pixels;
        const toAdd = Math.min(generated, space);
        if (toAdd > 0) {
          user.pixels += toAdd;
        }
      }
      user.lastPixelGeneration += generated * 60000;
      this.usersDirty = true;
    }

    const today = new Date().toISOString().split("T")[0];
    if (user.lastDaily !== today) {
      user.pixels += 10;
      user.lastDaily = today;
      this.usersDirty = true;
    }
    if (user.pixels > 1000) user.pixels = 1000;

    return user;
  }

  getNextPixelIn(pseudo) {
    const user = this.users[pseudo];
    if (!user) return 0;
    if (user.pixels >= user.maxPixels) return 0;

    const now = Date.now();
    const nextTime = user.lastPixelGeneration + 60000;
    return Math.max(0, nextTime - now);
  }

  placePixel(pseudo, x, y, colorIndex) {
    x = Math.floor(x);
    y = Math.floor(y);

    const user = this.getUserState(pseudo);

    if (user.pixels < 1)
      return { success: false, reason: "Pas assez de pixels" };
    if (x < 0 || x >= this.WIDTH || y < 0 || y >= this.HEIGHT)
      return { success: false };
    if (colorIndex < 0 || colorIndex >= this.COLORS.length)
      return { success: false };

    const idx = y * this.WIDTH + x;
    const oldOwner = this.owners[idx];

    this.board[idx] = colorIndex;
    this.owners[idx] = pseudo;

    user.pixels--;
    user.pixelsPlaced = (user.pixelsPlaced || 0) + 1;

    user.colorStats = user.colorStats || {};
    user.colorStats[colorIndex] = (user.colorStats[colorIndex] || 0) + 1;

    if (oldOwner && oldOwner !== pseudo) {
      user.pixelsOverridden = (user.pixelsOverridden || 0) + 1;
    }

    this.boardDirty = true;
    this.usersDirty = true;

    return { success: true, x, y, colorIndex, owner: pseudo };
  }

  erasePixel(pseudo, x, y) {
    x = Math.floor(x);
    y = Math.floor(y);

    const user = this.getUserState(pseudo);
    const idx = y * this.WIDTH + x;
    if (this.owners[idx] !== pseudo) {
      return { success: false, reason: "Tu ne peux gommer que tes pixels" };
    }

    this.board[idx] = 0;
    delete this.owners[idx];

    user.pixelsErased = (user.pixelsErased || 0) + 1;

    // Récupérer le pixel dans le stockage
    if (user.pixels < user.maxPixels) {
      user.pixels++;
    }

    this.boardDirty = true;
    this.usersDirty = true;

    return { success: true, x, y, colorIndex: 0, owner: null };
  }

  buyUpgrade(pseudo, type) {
    const costs = {
      storage_10: 10500,
      pixel_1: 2500,
      pixel_15: 30000,
    };

    if (!costs[type]) return { success: false };

    const cost = costs[type];

    let currentClicks = this.fileService.data.clicks[pseudo];
    if (typeof currentClicks !== "number") currentClicks = 0;
    currentClicks = Number(currentClicks) || 0;

    if (currentClicks < cost)
      return { success: false, reason: "Pas assez de clicks" };

    const user = this.getUserState(pseudo);

    if (type === "storage_10") {
      if (user.maxPixels >= 1000)
        return { success: false, reason: "Limite de stockage atteinte (1000)" };
      user.maxPixels += 10;
      if (user.maxPixels > 1000) user.maxPixels = 1000;
    } else if (type === "pixel_1") {
      user.pixels += 1;
    } else if (type === "pixel_15") {
      user.pixels += 15;
      if (user.pixels > 1000) user.pixels = 1000;
    }

    this.fileService.data.clicks[pseudo] = currentClicks - cost;
    this.fileService.save("clicks", this.fileService.data.clicks);

    this.usersDirty = true;
    return { success: true, userState: user };
  }

  getPixelInfo(x, y) {
    if (x < 0 || x >= this.WIDTH || y < 0 || y >= this.HEIGHT) return null;
    const idx = y * this.WIDTH + x;
    const owner = this.owners[idx];
    if (!owner) return null;
    return { owner };
  }
  resetBoard() {
    this.board.fill(0);
    this.owners = {};
    this.boardDirty = true;
  }

  resetArea(x1, y1, x2, y2) {
    x1 = Math.max(0, x1);
    y1 = Math.max(0, y1);
    x2 = Math.min(this.WIDTH - 1, x2);
    y2 = Math.min(this.HEIGHT - 1, y2);

    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const idx = y * this.WIDTH + x;
        this.board[idx] = 0;
        delete this.owners[idx];
      }
    }
    this.boardDirty = true;
  }

  getUserPixelsList(pseudo) {
    const list = [];
    for (const [key, owner] of Object.entries(this.owners)) {
      if (owner === pseudo) {
        const idx = parseInt(key);
        const y = Math.floor(idx / this.WIDTH);
        const x = idx % this.WIDTH;
        list.push({ x, y });
      }
    }
    return list;
  }

  getLeaderboard() {
    return Object.entries(this.users)
      .map(([pseudo, stats]) => {
        let topColor = -1;
        let maxC = -1;
        if (stats.colorStats) {
          for (const [c, count] of Object.entries(stats.colorStats)) {
            if (count > maxC) {
              maxC = count;
              topColor = c;
            }
          }
        }

        return {
          pseudo,
          pixelsPlaced: stats.pixelsPlaced || 0,
          pixelsOverridden: stats.pixelsOverridden || 0,
          favColor: topColor,
        };
      })
      .sort((a, b) => b.pixelsPlaced - a.pixelsPlaced)
      .slice(0, 50);
  }
}

module.exports = PixelWarGame;
