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

// Luma vs Sat through the same QE door, probed live 2026-09-16 00:10-00:20 (clip 1, saturation median 28).
const { parseSingle, formatSingle, spline, satRolloff } = require("../src/curves.cjs");

test("a Hue Saturation curve reads as N:x,y,… with comma decimals and signed y, writes dotted, and 0: is empty", () => {
  assert.deepEqual(parseSingle("0:"), []);
  assert.deepEqual(parseSingle("2:0,00,-0,50,1,00,-0,50,"), [[0, -0.5], [1, -0.5]]);
  assert.equal(formatSingle([[0, -0.5], [1, -0.5]]), "2:0.00,-0.50,1.00,-0.50,");
  assert.equal(formatSingle([]), "0:");
  const seven = "7:0,00,-0,50,0,15,0,00,0,30,0,00,0,50,0,00,0,70,0,00,0,85,0,00,1,00,-0,50,";
  assert.equal(formatSingle(parseSingle(seven)), seven.replace(/(\d),(\d\d)/g, "$1.$2"), "round trip of the live read");
});

test("the spline reproduces the live bow: ends at -0.5 with zeros at 0.15 / 0.85 renders as a flat +0.5", () => {
  const s = spline([[0, -0.5], [0.15, 0], [0.85, 0], [1, -0.5]]);
  assert.ok(Math.abs(s(0.5) - 0.51) < 0.05, "peak " + s(0.5).toFixed(2));
  assert.ok(Math.abs(s(0)) - 0.5 < 0.001 && Math.abs(s(1) + 0.5) < 0.001, "through the end points");
  const flat = spline([[0, 0.5], [1, 0.5]]);
  assert.equal(flat(0.3), 0.5);
});

test("the roll-off shape holds the middle within 0.04 and desaturates only the ends", () => {
  const pts = satRolloff();
  const s = spline(pts);
  for (let x = 0.2; x <= 0.8; x += 0.01) assert.ok(Math.abs(s(x)) < 0.04, "bow at " + x.toFixed(2) + ": " + s(x).toFixed(3));
  assert.ok(s(0) < -0.3 && s(1) < -0.3 && s(0.05) < -0.1 && s(0.95) < -0.1);
  const shadowsOnly = spline(satRolloff({ whites: false }));
  assert.ok(shadowsOnly(0) < -0.3 && Math.abs(shadowsOnly(1)) < 0.01 && Math.abs(shadowsOnly(0.95)) < 0.04);
  assert.equal(satRolloff({ shadows: false, whites: false }), null);
});

// A cast in the blacks that outlived the balance goes to the RGB curves, per channel - the tool a colourist
// reaches for. The wheel is a hue-and-saturation rotation of a whole tonal range and it overshoots: on the
// 2026-09-17 14:09 run C202's Shadows pad went 0.13 -> 0.31 -> 0.18 across two corrections and still left
// the blacks blue by 3.1. A channel's own toe is a levels move and lands where the arithmetic says.
test("neutralBottoms pulls the high channel's toe down to meet the lowest, and never lifts one", () => {
  const { neutralBottoms, predictBottoms, IDENTITY } = require("../src/curves.cjs");
  const c = neutralBottoms(null, { red: 2.4, green: 3.0, blue: 5.5 }); // blue +3.1 over red
  assert.deepEqual(c.Red, [[0, 0], [1, 1]], "the lowest channel is not touched");
  assert.ok(c.Blue[0][0] > c.Green[0][0], "the highest channel moves most");
  assert.equal(c.Blue[0][1], 0, "a toe sets an input black, it does not lift an output");
  for (const ch of ["Red", "Green", "Blue"]) assert.ok(c[ch][0][0] >= 0, ch + " never goes negative (no channel is lifted)");
  // The arithmetic: crushing blue by (5.5 - 2.4) on the line to (1,1).
  assert.ok(Math.abs(c.Blue[0][0] - (5.5 - 2.4) / (100 - 2.4)) < 1e-9);
  // Already neutral: nothing is written.
  const flat = neutralBottoms(null, { red: 4, green: 4, blue: 4 });
  for (const ch of ["Red", "Green", "Blue"]) assert.deepEqual(flat[ch], IDENTITY[ch], ch + " is left as the identity");
  // A Master curve set by the black point survives the channel write.
  const withMaster = neutralBottoms({ Master: [[0.11, 0], [0.4, 0.4], [1, 1]] }, { red: 2.4, green: 3, blue: 5.5 });
  assert.deepEqual(withMaster.Master, [[0.11, 0], [0.4, 0.4], [1, 1]], "the black point is not disturbed");
  // And the prediction says the ends meet.
  const after = predictBottoms({ red: { p1: 2.4 }, green: { p1: 3 }, blue: { p1: 5.5 }, luma: { p1: 3 } }, { red: 2.4, green: 3, blue: 5.5 });
  assert.equal(after.blue.p1 - after.red.p1, 0, "blacksRB goes to zero");
});

test("the grade reaches for the curves only once the wheel is done with the blacks", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const seq = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seq, /const BOTTOM_TOL = 2\.5;/);
  assert.match(seq, /if \(!next\.shadows && bottomsOff > BOTTOM_TOL\)/, "never while the Shadows wheel is still moving, or the two fight");
  assert.match(seq, /await cw\.write\(toes \? neutralBottoms\(cur, toes\) : cur\)/, "one curve write carries the black point and the cast");
  assert.match(seq, /parade bottoms " \+ round2\(bottomsOff\) \+ " apart/, "and the row says what it did and why");
});
