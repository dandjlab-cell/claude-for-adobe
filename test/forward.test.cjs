"use strict";
// The forward model: apply a control to PIXELS, then measure. The point is not accuracy - the transfer
// functions are the same measured forms as before and can still be wrong - it is that the step from a
// transformed image to its statistics stops being a model at all. Every percentile, band median, floor
// and clip share comes from real pixels, so the state is consistent by construction and cannot be
// impossible the way a statistic-space prediction can (the p10-below-p1 bug, 2026-09-17).
const test = require("node:test");
const assert = require("node:assert/strict");
const { forward, apply, pipeline } = require("../src/forward.cjs");
const { measure } = require("../src/scopes.cjs");

// A neutral ramp: every percentile is known in advance, so the model is checked against arithmetic
// rather than against another measurement.
const ramp = (n = 200000) => {
  const rgb = Buffer.allocUnsafe(n * 3);
  for (let i = 0; i < n; i++) { const v = Math.round(255 * i / (n - 1)); rgb[i * 3] = v; rgb[i * 3 + 1] = v; rgb[i * 3 + 2] = v; }
  return rgb;
};

test("whites is a gain about zero, and every percentile scales by k", () => {
  const rgb = ramp(), base = measure(rgb);
  for (const [amount, k] of [[-50, 0.865], [-20, 0.945], [20, 1.060]]) {
    const m = forward(rgb, [{ whites: amount }]);
    for (const p of ["p50", "p99"]) {
      // Clamped, because the container is 0..100 and a gain can leave it. On this ramp p99 x 1.060 is
      // 104.7, so the +20 row must read 100 - which is the model being right, not wrong. A statistic-space
      // predictor reports 104.7 and calls it a white point.
      const want = Math.min(100, base.luma[p] * k);
      assert.ok(Math.abs(m.luma[p] - want) < 0.5, "whites " + amount + " " + p + ": " + m.luma[p] + " against " + want.toFixed(1));
    }
  }
});

test("contrast holds its pivot while the ends spread", () => {
  const rgb = ramp(), base = measure(rgb);
  const down = forward(rgb, [{ contrast: -50 }]), up = forward(rgb, [{ contrast: 50 }]);
  assert.ok(Math.abs(down.luma.p50 - base.luma.p50) < 1, "the pivot barely moves going down");
  assert.ok(Math.abs(up.luma.p50 - base.luma.p50) < 1, "or going up");
  assert.ok(down.luma.p99 - down.luma.p1 < base.luma.p99 - base.luma.p1, "negative contrast narrows");
  assert.ok(up.luma.p1 < base.luma.p1, "positive contrast pushes the bottom down");
});

// The capability no statistic-space model has. A gain of 1.33 rails everything above 100/1.33 = 75.2 IRE,
// which on a uniform ramp is 24.8% of the pixels. The old predictor would have reported p99 = 113.8.
test("clipping is computed from the pixels, not predicted", () => {
  const rgb = ramp();
  const m = forward(rgb, [{ whites: 100 }]);
  assert.ok(Math.abs(m.clipped.red - 24.8) < 0.5, "clip share falls out of the transform: " + m.clipped.red + "%");
  assert.equal(m.luma.p99, 100, "and the percentile is bounded, not extrapolated past the container");
  assert.deepEqual([m.clipped.red, m.clipped.green, m.clipped.blue], [m.clipped.red, m.clipped.red, m.clipped.red], "a neutral ramp rails all three channels together");
});

test("a channel toe moves one channel and the others are untouched, in the pixels", () => {
  const rgb = ramp();
  const m = forward(rgb, [{ channelToe: [0.1, "blue"] }]);
  const base = measure(rgb);
  // measure() gives {mean, p1, p99} per channel - there is no channel p50, and asserting on one compares
  // undefined to undefined and passes vacuously. Caught by this test failing for the other reason.
  assert.equal(m.red.mean, base.red.mean, "red is not touched");
  assert.equal(m.red.p1, base.red.p1);
  assert.equal(m.green.mean, base.green.mean, "green is not touched");
  assert.equal(m.green.p1, base.green.p1);
  // What a toe actually is, settled by the arithmetic rather than by intuition - two wrong guesses were
  // made about this before the pixels decided it. (v - 100x)/(1 - x) has its FIXED POINT AT THE TOP: it
  // maps 255 -> 255 and 128 -> 113.9 at x=0.1. So every level below the top comes DOWN, the top is the
  // anchor, and the SPACING between any two levels widens by 1/(1 - x). Lowering levels and widening
  // spacing are both true and neither alone describes it.
  assert.ok(m.blue.p1 < base.blue.p1, "the bottom comes down");
  assert.ok(m.blue.mean < base.blue.mean, "and so does the mean - the anchor is the top, not the bottom");
  assert.ok(Math.abs(m.blue.p99 - base.blue.p99) < 0.5, "while the top is very nearly fixed");
  // And the paired statistic follows, because it is recomputed from the same pixels rather than nudged.
  assert.ok(m.bands.blacks.levels.blue < m.bands.blacks.levels.red, "the paired bottoms separate");
});

test("what has no measured form refuses to be modelled", () => {
  const rgb = ramp(64);
  assert.throws(() => apply(rgb, "vibrance", 50), /no measured form/);
  assert.throws(() => apply(rgb, "saturation", 150), /no measured form/);
  // Exposure upward is a tone map in Premiere and is deliberately not faked.
  assert.throws(() => apply(rgb, "exposure", 0.5), /tone-map/);
  assert.doesNotThrow(() => apply(rgb, "exposure", -1), "downward is the measured gamma-2.4 gain");
});

// Stacking is how an arbitrary order is reached: Lumetri's section order is fixed per INSTANCE, so a
// second instance is the only way to put a curve before the Basic sliders. The model takes a list.
test("a stage applies in Premiere's section order; a second stage is a second Lumetri instance", () => {
  const rgb = ramp();
  // Within one stage, write order must not matter - the section order decides.
  const a = pipeline(rgb, [{ contrast: 30, masterToe: 0.05 }]);
  const b = pipeline(rgb, [{ masterToe: 0.05, contrast: 30 }]);
  assert.deepEqual(measure(a).luma, measure(b).luma, "one instance: the order the ops were listed in is irrelevant");
  // Across two stages it must matter, or stacking would buy nothing.
  const first = pipeline(rgb, [{ masterToe: 0.05 }, { contrast: 30 }]);
  const second = pipeline(rgb, [{ contrast: 30 }, { masterToe: 0.05 }]);
  assert.notDeepEqual(measure(first).luma, measure(second).luma, "two instances: the order between them is real");
});
