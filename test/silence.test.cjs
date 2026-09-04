const test = require("node:test");
const assert = require("node:assert/strict");
const { loudIntervals, planCuts, silencesFrom, union } = require("../src/silence.cjs");

const r = (x) => Math.round(x * 100) / 100;
const rr = (list) => list.map((x) => [r(x.start), r(x.end)]);

test("loudIntervals merges adjacent loud windows and ignores room tone", () => {
  const w = [];
  for (let i = 0; i < 50; i++) { const t = i * 0.1; w.push({ t, peak: t >= 1 && t < 2 ? 0.3 : 0.003 }); }
  assert.deepEqual(rr(loudIntervals(w, 0.1)), [[1, 2]]);
});

test("silencesFrom cuts only where audio exists and nothing is loud; planCuts pads and filters", () => {
  // two audio clips: A1 covers 0-10 loud at 2-4 and 7-8; A2 covers 5-12 loud at 9-11. Video-only region 12-15 has no audio coverage.
  const coverage = [{ start: 0, end: 10 }, { start: 5, end: 12 }];
  const loud = [{ start: 2, end: 4 }, { start: 7, end: 8 }, { start: 9, end: 11 }];
  const s = silencesFrom(coverage, loud, 0, 15);
  assert.deepEqual(rr(s), [[0, 2], [4, 7], [8, 9], [11, 12]]);
  const cuts = planCuts(s, { minLen: 1, pad: 0.2 });
  assert.deepEqual(rr(cuts), [[4.2, 6.8], [0.2, 1.8]]); // 8-9 and 11-12 are under 1 s after padding; descending order
  assert.deepEqual(rr(union([{ start: 3, end: 5 }, { start: 1, end: 3.5 }, { start: 7, end: 8 }])), [[1, 5], [7, 8]]);
});

test("a lone click does not break a silence; blip islands between cuts are absorbed", () => {
  // 6 s of room tone with one 100 ms click at 2.0 s and a 300 ms speech burst at 4.0 s
  const w = [];
  for (let i = 0; i < 60; i++) { const t = i * 0.1; w.push({ t, peak: (Math.abs(t - 2.0) < 0.05) || (t >= 4.0 && t < 4.3) ? 0.3 : 0.003 }); }
  const loud = loudIntervals(w, 0.1);
  assert.deepEqual(loud.map((r) => [Math.round(r.start * 10) / 10, Math.round(r.end * 10) / 10]), [[4.0, 4.3]]); // click dropped
  const cuts = planCuts(silencesFrom([{ start: 0, end: 6 }], loud, 0, 6), { minLen: 1, pad: 0.2 });
  // without absorption this would be [0.2,3.8] and [4.5,5.8] with a 0.7 s island; the 0.3 s burst + pads = 0.7 s island stays (>= 0.4)
  assert.deepEqual(cuts.map((r) => [Math.round(r.start * 10) / 10, Math.round(r.end * 10) / 10]), [[4.5, 5.8], [0.2, 3.8]]);
  // a 0.1 s burst instead: island = 0.5 s... still kept; make pad 0.1 -> island 0.3 s -> absorbed into one cut
  const cuts2 = planCuts(silencesFrom([{ start: 0, end: 6 }], [{ start: 4.0, end: 4.1 }], 0, 6), { minLen: 1, pad: 0.1 });
  assert.deepEqual(cuts2.map((r) => [Math.round(r.start * 10) / 10, Math.round(r.end * 10) / 10]), [[0.1, 5.9]]);
});

test("no padding at the range edges: head and tail silence is removed whole", () => {
  const cuts = planCuts([{ start: 0, end: 3.4 }, { start: 10, end: 12 }, { start: 20, end: 30 }], { minLen: 0.5, pad: 0.1, rangeStart: 0, rangeEnd: 30 });
  assert.deepEqual(cuts.map((c) => [c.start, c.end]), [[20.1, 30], [10.1, 11.9], [0, 3.3]]);
});
