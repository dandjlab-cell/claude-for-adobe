"use strict";
// The colour wheels as knobs: QE's text form both ways, and the linear model fitted from the live
// sweep (src/lumetri_sweeps.json wheels): one write from a cast reading, one write for a tonal end.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parse, format, castMatrix, solveCast, solveLuma, lumaSlope, castAt } = require("../src/wheels.cjs");

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

test("a blue cast at the blacks is cancelled by a warm pad on the Shadows wheel, capped for a large cast", () => {
  const r = solveCast("shadows", [-17.3, 0]); // blacks blue by 17.3 -> cancel
  assert.ok(r.hue > 0 && r.hue < 60, "warm (orange) side, got " + r.hue.toFixed(1));
  assert.equal(r.capped, true, "17 points of cast is more than a 0.3 pad: say so");
  assert.equal(r.sat, 0.3);
  const small = solveCast("shadows", [-3, 0]);
  assert.equal(small.capped, false);
  assert.ok(small.sat > 0.03 && small.sat < 0.15, "a small cast is a small move: sat " + small.sat.toFixed(3));
});

test("a warm cast is cancelled by a cool pad, opposite direction", () => {
  const r = solveCast("shadows", [6, 0]); // blacks warm by 6 -> B-R must rise by 6
  assert.ok(r.hue > 150 && r.hue < 240, "cyan/blue side, got " + r.hue.toFixed(1));
});

test("each wheel's luma moves the end the canon says it does, ~38 per unit", () => {
  assert.ok(Math.abs(lumaSlope("shadows", "p1") - 38.8) < 2, "Shadows -> black point");
  assert.ok(Math.abs(lumaSlope("highlights", "p99") - 38.5) < 2, "Highlights -> white point");
  assert.ok(lumaSlope("highlights", "p1") < 6, "and barely touches the black point");
  assert.ok(Math.abs(lumaSlope("midtones", "p50") - 35) < 3, "Midtones -> median");
});

test("a black point of 8 goes to 4 with a Shadows luma just under 0.4, and an impossible lift is flagged", () => {
  const r = solveLuma("shadows", "p1", 4 - 8.2);
  assert.ok(Math.abs(r.luma - 0.39) < 0.02, "luma " + r.luma.toFixed(3));
  assert.equal(r.capped, false);
  const far = solveLuma("highlights", "p99", 40); // +40 on the white point: more than the wheel has
  assert.equal(far.luma, 1);
  assert.equal(far.capped, true);
});

test("castAt reads the parade end for the wheel, from the frame when a subject was measured", () => {
  const m = { frame: { red: { p1: 14.5, p99: 56.1, mean: 25 }, green: { p1: 23.5, p99: 58.8, mean: 35 }, blue: { p1: 31.8, p99: 63.9, mean: 44 } }, red: { p1: 0, p99: 0, mean: 0 }, green: { p1: 0, p99: 0, mean: 0 }, blue: { p1: 0, p99: 0, mean: 0 } };
  const [br, g] = castAt(m, "shadows");
  assert.ok(Math.abs(br - 17.3) < 0.01 && Math.abs(g - 0.35) < 0.01, "blacks: B-R " + br + ", G " + g);
  assert.ok(Math.abs(castAt(m, "highlights")[0] - 7.8) < 0.01, "whites: B-R");
});

test("grade_sequence writes the wheels through QE by name and confirms before planning sliders", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const host = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  assert.match(panel, /host\("lumetriQE", String\(at\), String\(track\), "Color Wheels & Match", value\)/);
  assert.match(host, /lumetriQE: lumetriQE/);
  assert.match(host, /setParamValue\(String\(name\), String\(value\)\)/);
  assert.match(panel, /Wheels first - the canon's black point, white point and casts - as ONE write, then one confirm/);
});
