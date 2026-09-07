"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { clipRect, coverage, isOpaque, coverAt } = require("../src/cover.cjs");

const W = 1080, H = 1920;
const clip = (o) => Object.assign({ track: "V2", name: "b", x: 0.5, y: 0.5, scale: 100, srcW: 1080, srcH: 1920, start: 0, end: 10, opacity: 100, mediaPath: "/m/b.mp4" }, o);

test("full-frame footage covers everything, a side-by-side covers half, a PiP a corner", () => {
  assert.strictEqual(coverage([clipRect(clip(), W, H)]), 1);
  const left = clipRect(clip({ x: 0.25, scale: 50 }), W, H); // half width, half height, centred left
  assert.ok(Math.abs(coverage([left]) - 0.25) < 0.02);
  const sbs = [clipRect(clip({ x: 0.25, scale: 50, srcW: 1080, srcH: 3840 }), W, H), clipRect(clip({ x: 0.75, scale: 50, srcW: 1080, srcH: 3840 }), W, H)];
  assert.ok(Math.abs(coverage(sbs) - 1) < 0.02, "two tall halves fill the frame");
  const pip = clipRect(clip({ x: 0.85, y: 0.15, scale: 25 }), W, H);
  assert.ok(coverage([pip]) < 0.08);
});
test("opacity, alpha and graphics decide whether a clip hides the picture", () => {
  assert.strictEqual(isOpaque(clip(), null), true);
  assert.strictEqual(isOpaque(clip({ opacity: 30 }), null), false);
  assert.strictEqual(isOpaque(clip({ mediaPath: "/g/title.aep" }), null), false);
  assert.strictEqual(isOpaque(clip({ mediaPath: "" }), null), false);
  assert.strictEqual(isOpaque(clip({ mediaPath: "/g/full.png" }), () => false), true);
  assert.strictEqual(isOpaque(clip({ mediaPath: "/g/logo.png" }), () => true), false);
  assert.strictEqual(isOpaque(clip({ mediaPath: "/g/logo.png" }), null), false, "unknown alpha: treat as overlay");
});
test("coverAt sums what sits above the track at that moment", () => {
  const rows = [clip({ track: "V1", name: "head" }), clip({ track: "V2", name: "sbs", x: 0.25, scale: 50, srcW: 1080, srcH: 3840, start: 5, end: 8 }), clip({ track: "V3", name: "title", mediaPath: "/g/t.aep" })];
  assert.strictEqual(coverAt(rows, W, H, "V1", 2).covered, 0);
  const at6 = coverAt(rows, W, H, "V1", 6);
  assert.ok(Math.abs(at6.covered - 0.5) < 0.02);
  assert.deepStrictEqual(at6.by.map((b) => b.name), ["sbs"]);
});

test("the Crop effect shrinks what a clip covers", () => {
  const full = clipRect(clip(), W, H);
  const cropped = clipRect(clip({ crop: { left: 50, top: 0, right: 0, bottom: 0 } }), W, H); // left half cut away
  assert.ok(Math.abs(coverage([full]) - 1) < 0.01);
  assert.ok(Math.abs(coverage([cropped]) - 0.5) < 0.02);
  assert.strictEqual(clipRect(clip({ crop: { left: 60, top: 0, right: 60, bottom: 0 } }), W, H), null, "cropped away entirely");
});
