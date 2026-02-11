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
      "#00FFFF",
      "#7FFF00",
      "#FF00FF",
      "#1E90FF",
    ];

    this.board = new Uint8Array(this.WIDTH * this.HEIGHT);
    this.owners = {};
    this.undoStacks = {};
    this.users = {};

    this.UNIVERSAL_STORAGE_LIMIT = 250;

    this.PIXEL_GENERATION_INTERVAL_MS = 45000;

    this.MAX_UNDO_DEPTH_PER_PIXEL = 10;

    this.load();
  }

  _clampUserToUniversalLimits(user) {
    if (!user || typeof user !== "object") return false;
    let changed = false;

    const limit = this.UNIVERSAL_STORAGE_LIMIT;

    const maxPixels = Number(user.maxPixels);
    if (!Number.isFinite(maxPixels)) {
      user.maxPixels = 30;
      changed = true;
    } else if (maxPixels > limit) {
      user.maxPixels = limit;
      changed = true;
    }

    const pixels = Number(user.pixels);
    if (!Number.isFinite(pixels)) {
      user.pixels = 0;
      changed = true;
    } else if (pixels > limit) {
      user.pixels = limit;
      changed = true;
    }

    return changed;
  }

  _refreshAllUsersStates() {
    if (!this.users || typeof this.users !== "object") return;
    for (const pseudo of Object.keys(this.users)) {
      this.getUserState(pseudo);
    }
  }

  _cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  _convexHull(points) {
    const pts = [...points].sort((p1, p2) => p1.x - p2.x || p1.y - p2.y);
    if (pts.length <= 1) return pts;

    const lower = [];
    for (const p of pts) {
      while (
        lower.length >= 2 &&
        this._cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
      ) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (
        upper.length >= 2 &&
        this._cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
      ) {
        upper.pop();
      }
      upper.push(p);
    }

    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  _pointInPolygon(px, py, polygon) {
    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + 0.0) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  clearPolygon(points) {
    if (!Array.isArray(points)) return 0;

    const cleaned = [];
    const seen = new Set();

    for (const p of points) {
      if (!p || typeof p !== "object") continue;
      const x = Math.floor(Number(p.x));
      const y = Math.floor(Number(p.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || x >= this.WIDTH || y < 0 || y >= this.HEIGHT) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push({ x, y });
      if (cleaned.length >= 16) break; // safety
    }

    if (cleaned.length < 3) return 0;

    const hull = this._convexHull(cleaned);
    if (hull.length < 3) return 0;

    let minX = this.WIDTH - 1;
    let minY = this.HEIGHT - 1;
    let maxX = 0;
    let maxY = 0;
    for (const p of hull) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    let cleared = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // test pixel center
        if (!this._pointInPolygon(x + 0.5, y + 0.5, hull)) continue;
        const idx = y * this.WIDTH + x;
        if (this.board[idx] !== 0) {
          this.board[idx] = 0;
          cleared++;
        } else {
          this.board[idx] = 0;
        }
        delete this.owners[idx];
        delete this.undoStacks[idx];
      }
    }

    this.boardDirty = true;
    return cleared;
  }

  clearSquare(points) {
    if (!Array.isArray(points)) return 0;

    const cleaned = [];
    const seen = new Set();
    for (const p of points) {
      if (!p || typeof p !== "object") continue;
      const x = Math.floor(Number(p.x));
      const y = Math.floor(Number(p.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || x >= this.WIDTH || y < 0 || y >= this.HEIGHT) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push({ x, y });
      if (cleaned.length >= 4) break;
    }

    if (cleaned.length < 2) return 0;

    let minX = this.WIDTH - 1;
    let minY = this.HEIGHT - 1;
    let maxX = 0;
    let maxY = 0;
    for (const p of cleaned) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    // Convert bounding rectangle -> bounding square (equal sides)
    const width = maxX - minX;
    const height = maxY - minY;
    const side = Math.max(width, height);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let sqMinX = Math.floor(cx - side / 2);
    let sqMinY = Math.floor(cy - side / 2);
    let sqMaxX = sqMinX + side;
    let sqMaxY = sqMinY + side;

    // Clamp while preserving square size
    if (sqMinX < 0) {
      sqMaxX += -sqMinX;
      sqMinX = 0;
    }
    if (sqMinY < 0) {
      sqMaxY += -sqMinY;
      sqMinY = 0;
    }
    if (sqMaxX >= this.WIDTH) {
      const d = sqMaxX - (this.WIDTH - 1);
      sqMinX -= d;
      sqMaxX -= d;
    }
    if (sqMaxY >= this.HEIGHT) {
      const d = sqMaxY - (this.HEIGHT - 1);
      sqMinY -= d;
      sqMaxY -= d;
    }
    if (sqMinX < 0) sqMinX = 0;
    if (sqMinY < 0) sqMinY = 0;

    this.resetArea(sqMinX, sqMinY, sqMaxX, sqMaxY);
    return (sqMaxX - sqMinX + 1) * (sqMaxY - sqMinY + 1);
  }

  load() {
    try {
      if (fs.existsSync(this.usersPath)) {
        this.users = JSON.parse(fs.readFileSync(this.usersPath, "utf8"));
      }

      if (this.users && typeof this.users === "object") {
        let changed = false;
        for (const pseudo of Object.keys(this.users)) {
          if (this._clampUserToUniversalLimits(this.users[pseudo])) {
            changed = true;
          }
        }
        if (changed) this.usersDirty = true;
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

        // Historique d'override (pour restaurer le pixel d'avant lors d'un undo/erase)
        // Format attendu: { [idx:number]: Array<{ c:number, o:string|null }> }
        this.undoStacks = {};
        if (data.undoStacks && typeof data.undoStacks === "object") {
          for (const [k, stack] of Object.entries(data.undoStacks)) {
            if (!Array.isArray(stack)) continue;
            const idx = Number(k);
            if (
              !Number.isInteger(idx) ||
              idx < 0 ||
              idx >= this.WIDTH * this.HEIGHT
            )
              continue;
            const cleaned = [];
            for (const entry of stack) {
              if (!entry || typeof entry !== "object") continue;
              const c = Number(entry.c);
              const o = entry.o;
              if (!Number.isInteger(c) || c < 0 || c >= this.COLORS.length)
                continue;
              if (!(o === null || typeof o === "string")) continue;
              cleaned.push({ c, o });
              if (cleaned.length >= this.MAX_UNDO_DEPTH_PER_PIXEL) break;
            }
            if (cleaned.length > 0) this.undoStacks[idx] = cleaned;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load pixelwar board:", e);
      this.board.fill(0);
      this.owners = {};
      this.undoStacks = {};
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
        undoStacks: this.undoStacks,
      };
      fs.writeFileSync(this.boardPath, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save pixelwar board:", e);
    }
  }

  _pushUndoState(idx, colorIndex, owner) {
    if (!this.undoStacks[idx]) this.undoStacks[idx] = [];
    const stack = this.undoStacks[idx];
    stack.push({ c: colorIndex, o: owner ?? null });
    if (stack.length > this.MAX_UNDO_DEPTH_PER_PIXEL) {
      stack.splice(0, stack.length - this.MAX_UNDO_DEPTH_PER_PIXEL);
    }
  }

  _popUndoState(idx) {
    const stack = this.undoStacks[idx];
    if (!stack || stack.length === 0) return null;
    const entry = stack.pop();
    if (stack.length === 0) delete this.undoStacks[idx];
    return entry;
  }

  startAutoSave() {
    setInterval(() => {
      // Sans action socket, la régénération des pixels n'est recalculée
      // que lorsqu'on appelle getUserState. On tick donc régulièrement
      // tous les users pour que pixelwar_users.json reflète l'état réel.
      this._refreshAllUsersStates();

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

    if (this._clampUserToUniversalLimits(user)) {
      this.usersDirty = true;
    }

    const now = Date.now();
    const diff = now - user.lastPixelGeneration;
    const generated = Math.floor(diff / this.PIXEL_GENERATION_INTERVAL_MS);

    if (generated > 0) {
      if (user.pixels < user.maxPixels) {
        const space = user.maxPixels - user.pixels;
        const toAdd = Math.min(generated, space);
        if (toAdd > 0) {
          user.pixels += toAdd;
        }
      }
      user.lastPixelGeneration += generated * this.PIXEL_GENERATION_INTERVAL_MS;
      this.usersDirty = true;
    }

    const today = new Date().toISOString().split("T")[0];
    if (user.lastDaily !== today) {
      this.pixelsToGive = Math.floor(user.maxPixels * 0.75);
      const capacity = Math.min(user.maxPixels, this.UNIVERSAL_STORAGE_LIMIT);
      const spaceLeft = Math.max(0, capacity - user.pixels);
      if (spaceLeft > 0) {
        const toAdd = Math.min(this.pixelsToGive, spaceLeft);
        user.pixels += toAdd;
      }
      user.lastDaily = today;
      this.usersDirty = true;
    }
    if (user.pixels > this.UNIVERSAL_STORAGE_LIMIT) {
      user.pixels = this.UNIVERSAL_STORAGE_LIMIT;
      this.usersDirty = true;
    }

    return user;
  }

  getNextPixelIn(pseudo) {
    const user = this.users[pseudo];
    if (!user) return 0;
    if (user.pixels >= user.maxPixels) return 0;

    const now = Date.now();
    const nextTime =
      user.lastPixelGeneration + this.PIXEL_GENERATION_INTERVAL_MS;
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
    const oldColorIndex = this.board[idx] || 0;

    // Si on override le pixel de quelqu'un d'autre, enregistrer l'état précédent
    // pour pouvoir le restaurer en cas d'undo/erase.
    if (oldOwner && oldOwner !== pseudo) {
      this._pushUndoState(idx, oldColorIndex, oldOwner);
    }

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

    // Undo sécurisé : si le pixel a été obtenu via un override, restaurer
    // le pixel précédent (évite la suppression des dessins des autres).
    const prev = this._popUndoState(idx);
    if (prev) {
      this.board[idx] = prev.c;
      if (prev.o) this.owners[idx] = prev.o;
      else delete this.owners[idx];
    } else {
      this.board[idx] = 0;
      delete this.owners[idx];
    }

    user.pixelsErased = (user.pixelsErased || 0) + 1;

    // Récupérer le pixel dans le stockage
    if (user.pixels < user.maxPixels) {
      user.pixels++;
    }

    this.boardDirty = true;
    this.usersDirty = true;

    const finalColorIndex = this.board[idx] || 0;
    const finalOwner = this.owners[idx] || null;
    return {
      success: true,
      x,
      y,
      colorIndex: finalColorIndex,
      owner: finalOwner,
    };
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
      if (user.maxPixels >= this.UNIVERSAL_STORAGE_LIMIT)
        return {
          success: false,
          reason: `Limite de stockage atteinte (${this.UNIVERSAL_STORAGE_LIMIT})`,
        };
      user.maxPixels += 10;
      if (user.maxPixels > this.UNIVERSAL_STORAGE_LIMIT)
        user.maxPixels = this.UNIVERSAL_STORAGE_LIMIT;
    } else if (type === "pixel_1") {
      user.pixels += 1;
    } else if (type === "pixel_15") {
      user.pixels += 15;
      if (user.pixels > this.UNIVERSAL_STORAGE_LIMIT)
        user.pixels = this.UNIVERSAL_STORAGE_LIMIT;
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
    this.undoStacks = {};
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
        delete this.undoStacks[idx];
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
