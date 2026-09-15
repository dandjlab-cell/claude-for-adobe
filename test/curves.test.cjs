"use strict";
// The Master curve's end points as the black-point and white-point tool, against the live sweep of
// 2026-09-15 20:28 (clip 1, luma 0-100: p1 8.2, p99 75.7, max 91.4 at the identity curve).
const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, format, isIdentity, levels, blackInFor, whiteInFor, predictLevels } = require("../src/curves.cjs");

const READ = "Master:2:0,06,0,00,1,00,1,00,;Red:2:0,00,0,00,1,00,1,00,;Green:2:0,00,0,00,1,00,1,00,;Blue:2:0,00,0,00,1,00,1,00,";

test("QE's comma-decimal read form parses, and the write form is the dotted one Premiere accepted", () => {
  const c = parse(READ);
  assert.deepEqual(c.Master, [[0.06, 0], [1, 1]]);
  assert.deepEqual(c.Blue, [[0, 0], [1, 1]]);
  assert.equal(format(c), "Master:2:0.06,0.00,1.00,1.00,;Red:2:0.00,0.00,1.00,1.00,;Green:2:0.00,0.00,1.00,1.00,;Blue:2:0.00,0.00,1.00,1.00,");
  assert.equal(format(parse(format(c))), format(c), "round trip");
  assert.equal(isIdentity(c), false);
  assert.equal(isIdentity(parse("Master:2:0,00,0,00,1,00,1,00,;Red:2:0,00,0,00,1,00,1,00,;Green:2:0,00,0,00,1,00,1,00,;Blue:2:0,00,0,00,1,00,1,00,")), true);
});

test("the bottom point is a levels move: the sweep's black points within the toe's tolerance", () => {
  const m = { luma: { min: 2.4, p1: 8.2, p50: 41.6, p99: 75.7, max: 91.4 }, red: { mean: 50.2, p1: 9.4, p99: 74.1 }, green: { mean: 39.4, p1: 7.8, p99: 76.1 }, blue: { mean: 28.9, p1: 4.7, p99: 76.1 } };
  const measured = { 0.03: 5.9, 0.06: 3.1, 0.10: 0.4, 0.15: 0, 0.20: 0 };
  for (const [x, p1] of Object.entries(measured)) {
    const got = predictLevels(m, Number(x)).luma.p1;
    assert.ok(Math.abs(got - p1) < 1.2, "x " + x + ": line says " + got.toFixed(1) + ", measured " + p1);
  }
  assert.ok(Math.abs(predictLevels(m, 0.10).luma.p50 - 36.1) < 1, "the median follows the line too");
  const x = blackInFor(8.2, 4);
  assert.ok(x > 0.03 && x < 0.06, "8.2 -> 4 sits between the 0.03 and 0.06 rows: " + x.toFixed(3));
  assert.equal(blackInFor(3, 4), 0, "already there: no move");
});

test("the top point is output = input / x to the decimal, and never past the peak", () => {
  const m = { luma: { min: 2.4, p1: 8.2, p50: 41.6, p99: 75.7, max: 91.4 } };
  for (const [x, p99] of [[0.92, 82], [0.87, 86.7], [0.80, 94.5]]) assert.ok(Math.abs(predictLevels(m, 0, x).luma.p99 - p99) < 0.6, "x " + x + " -> " + predictLevels(m, 0, x).luma.p99.toFixed(1) + " vs " + p99);
  assert.equal(predictLevels(m, 0, 0.80).luma.max, 100, "the peak clips at 100");
  const x = whiteInFor(75.7, 91.4, 92);
  assert.ok(Math.abs(x - 0.914) < 0.001, "the peak has no room: x stops at max/100 = " + x.toFixed(3));
  assert.ok(Math.abs(whiteInFor(80, 85, 92) - 0.87) < 0.001, "with room, x = p99 / target");
});

test("an anchored bottom point is a toe pull: the median and the top stay, the black point lands", () => {
  const m = { luma: { min: 2.4, p1: 16.1, p50: 41.6, p99: 75.7, max: 91.4 }, red: { mean: 50, p1: 9.4, p99: 74.1 }, green: { mean: 39, p1: 7.8, p99: 76.1 }, blue: { mean: 29, p1: 4.7, p99: 76.1 } };
  const a = 0.416;
  const x = blackInFor(16.1, 4, a);
  assert.ok(x > 0.13 && x < 0.14, "steeper below the anchor than the global line (0.126): " + x.toFixed(3));
  const p = predictLevels(m, x, 1, a);
  assert.ok(Math.abs(p.luma.p1 - 4) < 0.05, "p1 " + p.luma.p1.toFixed(2));
  assert.equal(p.luma.p50, 41.6, "the median is pinned");
  assert.equal(p.luma.p99, 75.7, "the top is untouched");
  assert.equal(p.red.p99, 74.1);
  assert.equal(format(levels(x, 1, null, a)).split(";")[0], "Master:4:0.13,0.00,0.42,0.42,0.80,0.80,1.00,1.00,", "the 0.8 pin holds the top: the spline bowed over the diagonal on the 21:26 run");
  assert.deepEqual(levels(0.1, 1, null, 0.12).Master, [[0.1, 0], [1, 1]], "an anchor too close to the bottom point is dropped");
});

test("levels() composes onto an existing set of curves", () => {
  const cur = parse(READ);
  cur.Red = [[0, 0], [0.5, 0.6], [1, 1]];
  const c = levels(0.1, 0.9, cur);
  assert.deepEqual(c.Master, [[0.1, 0], [0.9, 1]]);
  assert.equal(c.Red.length, 3, "the other curves are kept");
});
