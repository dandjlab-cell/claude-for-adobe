"use strict";
// The color wheels as knobs: QE's text form both ways, and the linear model fitted from the live
// sweep (src/lumetri_sweeps.json wheels): one write from a cast reading, one write for a tonal end.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, format, castMatrix, solveCast, solveLuma, lumaSlope, castAt, nudgePad } = require("../src/wheels.cjs");

test("QE's comma-decimal read parses, and the write form uses dots with every wheel present", () => {
  const w = parse("Shadows:227,00,0,10,0,40;Midtones:0,00,0,00,0,50;Highlights:0,00,0,00,0,50");
  assert.deepEqual(w.shadows, { hue: 227, sat: 0.1, luma: 0.4 });
  assert.deepEqual(w.highlights, { hue: 0, sat: 0, luma: 0.5 });
  assert.equal(format({ shadows: { hue: 227, sat: 0.1, luma: 0.4 } }), "Shadows:227.00,0.10,0.40;Midtones:0.00,0.00,0.50;Highlights:0.00,0.00,0.50");
  assert.deepEqual(parse(format(w)), w, "round-trips through the write form");
  assert.equal(format({ shadows: { hue: 10, sat: 2, luma: -1 } }), "Shadows:10.00,1.00,0.00;Midtones:0.00,0.00,0.50;Highlights:0.00,0.00,0.50", "sat and luma are clamped to 0..1");
});

test("the sweep's hue convention holds: red at 0 raises R at the wheel's end, cyan at 180 lowers it", () => {
  const [[a]] = castMatrix("shadows"); // d(B-R)/dx: x = +sat at hue 0 (red) must make B-R more negative
  assert.ok(a < -20, "d(B-R)/dx = " + a.toFixed(1));
  const hi = castMatrix("highlights");
  assert.ok(hi[0][0] < -20, "the Highlights wheel does the same at the whites: " + hi[0][0].toFixed(1));
});

test("a blue cast at the blacks is cancelled by a warm pad on the Shadows wheel, capped for a huge cast", () => {
  const r = solveCast("shadows", [-17.3, 0]); // blacks blue by 17.3 -> cancel
  assert.ok(r.hue > 0 && r.hue < 60, "warm (orange) side, got " + r.hue.toFixed(1));
  assert.ok(r.sat > 0.2 && r.sat <= 0.3, "a large cast is a large pad, inside the 0.3 cap: " + r.sat.toFixed(3));
  const huge = solveCast("shadows", [-40, 0]);
  assert.equal(huge.capped, true, "40 points of cast is more than the pad model covers: say so");
  assert.equal(huge.sat, 0.3, "the cap is twice the sampled radius, not 3.3x (0.5 was the 18:03 run)");
  const small = solveCast("shadows", [-3, 0]);
  assert.ok(small.sat > 0.03 && small.sat < 0.15, "a small cast is a small move: sat " + small.sat.toFixed(3));
});

test("a pad nudge rescales the move by what it actually did, direction included", () => {
  const none = { hue: 0, sat: 0 };
  // Fell short: -10.2 -> -3 removed 70%, so the move scales by 1/0.7.
  const short = nudgePad(none, { hue: 222.9, sat: 0.2 }, [-10.2, 0], [-3, 0]);
  assert.ok(Math.abs(short.sat - 0.2 / 0.7) < 0.01, "a bit more: " + short.sat.toFixed(3));
  assert.ok(Math.abs(short.hue - 222.9) < 0.01, "same direction");
  // CROSSED neutral: -10 -> +5 means two thirds of the move was enough. The 18:03 nudge read this as
  // "half removed" and doubled the pad - warm blacks came back blue by 13.
  const over = nudgePad(none, { hue: 220, sat: 0.2 }, [-10, 0], [5, 0]);
  assert.ok(Math.abs(over.sat - 0.2 * 2 / 3) < 0.01, "an overshoot pulls the pad BACK: " + over.sat.toFixed(3));
  // Went the wrong way: not the tool.
  assert.equal(nudgePad(none, { hue: 217, sat: 0.3 }, [-23.2, 0], [-25.9, 0]), null);
  // Rounds to the same write: nothing to send.
  assert.equal(nudgePad(none, { hue: 220, sat: 0.2 }, [-10, 0], [-0.05, 0]), null);
  // A second pass scales the DELTA from where the pad started, not the whole pad.
  const from = { hue: 220, sat: 0.1 };
  const again = nudgePad(from, { hue: 220, sat: 0.2 }, [-10, 0], [-5, 0]);
  assert.ok(Math.abs(again.sat - 0.3) < 0.01, "0.1 + 2 x 0.1: " + again.sat.toFixed(3));
});

test("the pads' predicted effect on the parade ends follows the same model the solve inverts", () => {
  const { predictPads } = require("../src/wheels.cjs");
  const m = { luma: { p1: 5, p50: 40, p99: 90 }, red: { p1: 14.5, p99: 90 }, green: { p1: 23.5, p99: 90 }, blue: { p1: 31.8, p99: 90 } }; // blacks blue by 17.3
  const pad = solveCast("shadows", [-17.3, -(23.5 - (14.5 + 31.8) / 2)]);
  const after = predictPads(m, { shadows: pad });
  assert.ok(Math.abs(after.blue.p1 - after.red.p1) < Math.abs(m.blue.p1 - m.red.p1) / 3, "the cast is mostly gone in the prediction: " + (after.blue.p1 - after.red.p1).toFixed(2));
  assert.equal(after.luma.p1, 5, "luma is not moved by a pad in this model");
  assert.equal(after.red.p99, 90, "the whites are the Highlights wheel's, untouched by a Shadows pad");
});

test("the pads read and are fitted on the paired-pixel bands: the darkest and brightest 3% as pixels", () => {
  const m = { luma: { p1: 8, p99: 76 }, red: { p1: 9.4, p99: 74.1, mean: 50 }, green: { p1: 7.8, p99: 76.1, mean: 39 }, blue: { p1: 4.7, p99: 76.1, mean: 29 },
    bands: { blacks: { share: 3, rb: -1.6, g: -0.8 }, whites: { share: 3, rb: 2.7, g: 1.2 }, midtones: { share: 74, rb: -27.5, g: 0.4 }, shadows: { share: 20, rb: -18, g: -1.6 }, highlights: { share: 5, rb: 2.4, g: 1.2 } } };
  assert.deepEqual(castAt(m, "shadows"), [-1.6, -0.8], "the blacks band, not blue p1 - red p1 (-4.7)");
  assert.deepEqual(castAt(m, "highlights"), [2.7, 1.2]);
  assert.deepEqual(castAt({ red: m.red, green: m.green, blue: m.blue }, "shadows"), [4.7 - 9.4, 7.8 - (9.4 + 4.7) / 2], "no bands: the channel ends, as before");
  // The 21:00 sweep: a Shadows pad at hue 0 (red) sat 0.15 moved the blacks band by -6.6 on B-R.
  const [[a]] = castMatrix("shadows");
  assert.ok(a * 0.15 < -5 && a * 0.15 > -8, "d(B-R)/dx x 0.15 = " + (a * 0.15).toFixed(1));
  const r = solveCast("shadows", [6, 0]); // blacks warm by 6 -> add 6 to B-R
  assert.ok(r.hue > 150 && r.hue < 240 && r.sat > 0.08 && r.sat < 0.2, "a cyan-blue pad, about the sweep's radius: " + JSON.stringify(r));
});

test("a warm cast is cancelled by a cool pad, opposite direction", () => {
  const r = solveCast("shadows", [6, 0]); // blacks warm by 6 -> B-R must rise by 6
  assert.ok(r.hue > 150 && r.hue < 240, "cyan/blue side, got " + r.hue.toFixed(1));
});

test("each wheel's luma is the canon's control: Shadows a lift, Highlights and Midtones a gain", () => {
  assert.ok(Math.abs(lumaSlope("shadows", "p1") - 38.8) < 2, "Shadows lifts the black point ~39 per unit");
  assert.ok(Math.abs(lumaSlope("highlights", "p99") - 0.50) < 0.05, "Highlights multiplies the white point by ~1.5 per unit: " + lumaSlope("highlights", "p99").toFixed(3));
  assert.ok(lumaSlope("highlights", "p1") < 6, "and barely touches the black point");
  assert.ok(Math.abs(lumaSlope("midtones", "p50") - 0.85) < 0.1, "Midtones scales the median: " + lumaSlope("midtones", "p50").toFixed(3));
});

test("a black point of 8 goes to 4 with a Shadows luma just under 0.4, and an impossible gain is flagged", () => {
  const r = solveLuma("shadows", "p1", 8.2, 4);
  assert.ok(Math.abs(r.luma - 0.39) < 0.02, "luma " + r.luma.toFixed(3));
  assert.equal(r.capped, false);
  const far = solveLuma("highlights", "p99", 60, 100); // x1.67 on the white point: more than the wheel has
  assert.equal(far.luma, 1);
  assert.equal(far.capped, true);
});

test("castAt reads the parade end for the wheel, from the frame when a subject was measured", () => {
  const m = { frame: { red: { p1: 14.5, p99: 56.1, mean: 25 }, green: { p1: 23.5, p99: 58.8, mean: 35 }, blue: { p1: 31.8, p99: 63.9, mean: 44 } }, red: { p1: 0, p99: 0, mean: 0 }, green: { p1: 0, p99: 0, mean: 0 }, blue: { p1: 0, p99: 0, mean: 0 } };
  const [br, g] = castAt(m, "shadows");
  assert.ok(Math.abs(br - 17.3) < 0.01 && Math.abs(g - 0.35) < 0.01, "blacks: B-R " + br + ", G " + g);
  assert.ok(Math.abs(castAt(m, "highlights")[0] - 7.8) < 0.01, "whites: B-R");
});

test("grade_sequence writes the wheel pads through QE by name, on the frame as read, before the sliders", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const host = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  assert.match(panel, /host\("lumetriQE", String\(at\), String\(track\), "Color Wheels & Match", value\)/);
  assert.match(host, /lumetriQE: lumetriQE/);
  assert.match(host, /setParamValue\(String\(name\), String\(value\)\)/);
  assert.match(panel, /then each end's wheel pad for what is left, solved on the state predicted after/);
  assert.match(panel, /before the tonal sliders, because a bottom pulled to the/);
});
