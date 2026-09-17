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
  // Exposure upward has a shoulder that is Lumetri's own - not the sequence tone mapper, which would have
  // to act on Whites too and does not. Deliberately not faked from four ratios on one frame.
  assert.throws(() => apply(rgb, "exposure", 0.5), /rolls off the highlights/);
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

// The retained sample must cover the WHOLE frame. An integer stride covers only want*floor(n/want)
// pixels - for 300k into 120k that is the first 80% of the buffer, and pixels are in scanline order, so
// it is the top 80% of the picture. A specular in the bottom fifth would never be sampled and a guard
// built on it would report no clipping for a move that clips. This is the frame that caught it.
test("the sample spans the whole frame, not the first 80% of it", () => {
  const { sample } = require("../src/forward.cjs");
  const n = 300000, rgb = Buffer.allocUnsafe(n * 3);
  for (let i = 0; i < n; i++) { const v = i > n * 0.992 ? 250 : Math.round(120 * i / (n * 0.992)); rgb[i * 3] = v; rgb[i * 3 + 1] = v; rgb[i * 3 + 2] = v; }
  const s = sample(rgb);
  assert.equal(s.length / 3, 120000, "the requested size");
  assert.equal(measure(s).luma.max, measure(rgb).luma.max, "and it sees the brightest pixel, which lives in the last 0.8%");
  // A frame smaller than the target is returned whole rather than padded or truncated.
  const small = Buffer.alloc(300);
  assert.equal(sample(small), small);
});

// The guard the pass needed on 2026-09-17: the white-point lift was solved from a table that was railed on
// its calibration frame, so the model said +2 stops reached p99 90.2 while the real gain took 76.5 to 136.
// A table of another frame's percentiles cannot see that. The frame's own pixels see it in milliseconds.
test("the forward guard refuses a move that would clip, and stays out of the way when it would not", async () => {
  const { planShot } = require("../src/grade.cjs");
  const { sample, apply } = require("../src/forward.cjs");
  const frame = (topCode, tailShare) => {
    const n = 300000, rgb = Buffer.allocUnsafe(n * 3);
    for (let i = 0; i < n; i++) { const v = i > n * (1 - tailShare) ? 250 : Math.round(topCode * i / (n * (1 - tailShare))); rgb[i * 3] = v; rgb[i * 3 + 1] = v; rgb[i * 3 + 2] = v; }
    return rgb;
  };
  const run = async (rgb, withGuard) => {
    const m = measure(rgb);
    const r = await planShot({ set: async (v) => v, measure: async () => m, measured: m, current: async () => 0,
      goals: [{ param: "whites", statistic: "whitePoint", target: 92, why: "lift" }], pixels: withGuard ? sample(rgb) : null });
    return r.plan[0];
  };
  // A frame whose max is already 98 IRE: any gain at all pushes its specular through the ceiling.
  const risky = frame(120, 0.008);
  const off = await run(risky, false), on = await run(risky, true);
  assert.ok(measure(apply(sample(risky), "whites", off.value)).clipped.red > 0.5, "unguarded, the move clips");
  assert.ok(Math.abs(on.value) < Math.abs(off.value), "guarded, it is backed off: " + on.value + " against " + off.value);
  assert.match(on.note, /held by the pixels/, "and the row says the pixels held it");
  // A frame with headroom: the guard must not interfere at all.
  const safe = frame(190, 0);
  const a = await run(safe, false), b = await run(safe, true);
  assert.equal(b.value, a.value, "same value with and without the guard when nothing would clip");
  assert.ok(!/held by the pixels/.test(b.note || ""), "and it says nothing");
});
