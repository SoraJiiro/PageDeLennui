import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustPdeHeroStagePresence,
  getPdeHeroMultiplier,
  getPdeHeroScoreMultiplier,
  parsePdeHeroChart,
  schedulePdeHeroTrack,
} from "../Public/js/pde_hero_chart.mjs";

test("parses chart lanes using tempo changes and maps open notes", () => {
  const chart = parsePdeHeroChart(`[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
  192 = B 60000
}
[ExpertSingle]
{
  0 = N 0 0
  192 = N 4 384
  192 = N 5 0
  384 = N 7 0
}
`);

  assert.deepEqual(
    chart.tracks.expert.notes.map(({ lane, time, sustain }) => [
      lane,
      time,
      sustain,
    ]),
    [
      [0, 0, 0],
      [4, 0.5, 2],
      [0, 1.5, 0],
    ],
  );
  assert.equal(chart.tracks.expert.duration, 1.5);
});

test("rejects charts without a playable difficulty", () => {
  assert.throws(
    () =>
      parsePdeHeroChart(`[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  0 = N 5 0
}
`),
    /Aucune difficulté jouable/,
  );
});

test("slows chart timing and shortens visual travel with hyperspeed", () => {
  const chart = parsePdeHeroChart(`[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[EasySingle]
{
  0 = N 0 0
  192 = N 1 192
}
`);
  const schedule = schedulePdeHeroTrack(
    chart.tracks.easy,
    10000,
    1000,
    0.5,
  );

  assert.equal(schedule.startAt, 10000);
  assert.equal(schedule.notes[0].spawnAt, 9000);
  assert.equal(schedule.notes[1].spawnAt, 10000);
  assert.equal(schedule.notes[1].sustain, 1);
  assert.equal(schedule.duration, 1);
});

test("weights score by chart tier, chart rhythm, and hyperspeed", () => {
  assert.equal(getPdeHeroScoreMultiplier("hard", 0.75, 1.5), 1.125);
  assert.equal(getPdeHeroScoreMultiplier("expert", 1, 2.5), 4.375);
  assert.equal(getPdeHeroScoreMultiplier("easy", 0.5, 1), 0.125);
});

test("scales combo multipliers and stage presence within their limits", () => {
  assert.equal(getPdeHeroMultiplier(9), 1);
  assert.equal(getPdeHeroMultiplier(10), 2);
  assert.equal(getPdeHeroMultiplier(30), 4);
  assert.equal(getPdeHeroMultiplier(50), 4);
  assert.equal(adjustPdeHeroStagePresence(80, false), 70);
  assert.equal(adjustPdeHeroStagePresence(99, true), 100);
  assert.equal(adjustPdeHeroStagePresence(10, false), 0);
});
