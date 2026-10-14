import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const badgeModulePath = require.resolve("../Server/services/badgesAuto.js");
require.cache[badgeModulePath] = {
  id: badgeModulePath,
  filename: badgeModulePath,
  loaded: true,
  exports: { applyAutoBadges() {} },
};
const { registerPdeHeroHandlers } = require("../Server/sockets/handlers/pdeHero.js");

function createHandler() {
  let onFinal;
  const FileService = {
    data: {
      pdeHeroScores: {
        player: {
          totalScore: 300,
          longestGame: 90,
          scores: { easy: 0, medium: 0, hard: 0, expert: 0 },
        },
      },
    },
    save() {},
  };
  const socket = {
    on(event, callback) {
      if (event === "pdehero:final") onFinal = callback;
    },
  };
  registerPdeHeroHandlers({
    io: {},
    socket,
    pseudo: "player",
    FileService,
    leaderboardManager: { broadcastPdeHeroLB() {} },
  });
  return { FileService, onFinal };
}

test("adds completed chart score while retaining legacy stats", () => {
  const { FileService, onFinal } = createHandler();
  onFinal({
    score: 1000,
    duration: 60,
    difficulty: "easy",
    chartSpeed: 0.5,
    hyperspeed: 1,
    totalNotes: 2,
    hits: 2,
    misses: 0,
    completed: true,
  });
  assert.deepEqual(FileService.data.pdeHeroScores.player, {
    totalScore: 400,
    longestGame: 90,
    scores: { easy: 100, medium: 0, hard: 0, expert: 0 },
  });
});

test("does not add interrupted charts to the global score", () => {
  const { FileService, onFinal } = createHandler();
  onFinal({
    score: 1000,
    duration: 30,
    difficulty: "expert",
    chartSpeed: 1,
    hyperspeed: 1,
    totalNotes: 4,
    hits: 2,
    misses: 2,
    completed: false,
  });
  assert.deepEqual(FileService.data.pdeHeroScores.player, {
    totalScore: 300,
    longestGame: 90,
    scores: { easy: 0, medium: 0, hard: 0, expert: 0 },
  });
});
