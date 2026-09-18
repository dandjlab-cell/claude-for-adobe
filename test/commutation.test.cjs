// The closed form for the order of two pivot-gains (src/lumetri_sweeps.json `commutation`). It replaced a
// proposed render, so it had better be right: the check below is brute force, not a restatement.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { gap, whitesK, CONTRAST, table, check, curveVsSliders, toeK, liftK, TOE_PIVOT } = require("../tools/commutation.cjs");

test("the order of two pivot-gains differs by a CONSTANT, and the closed form gives it exactly", () => {
  // The tool's own check composes the two orders at every level from 0 to 100 and asserts the difference
  // matches (kA-1)(kB-1)(PA-PB) to 1e-9. If the identity were only approximate this throws.
  assert.ok(check());
  // Independently here: the difference must not depend on the level. A form that got the CONSTANT right
  // but the shape wrong would pass a single-level comparison and fail this.
  const f = (v) => 0 + (v - 0) * 1.1554, g = (v) => 49.6 + (v - 49.6) * 1.191;
  const at = (v) => f(g(v)) - g(f(v));
  assert.ok(Math.abs(at(5) - at(95)) < 1e-9, "the difference between the orders is constant in level");
  assert.ok(Math.abs(at(50) - gap(1.1554, 0, 1.191, 49.6)) < 1e-9);
});

test("a neutral control commutes with everything, and equal pivots commute at any gain", () => {
  // `===`, not strictEqual: the identity legitimately returns -0 here (the PA-PB term is 0 and kA-1 is
  // negative), and strictEqual uses Object.is, under which -0 is not 0. The maths is right; the comparison
  // would have been wrong.
  assert.ok(gap(1, 0, 1.191, 49.6) === 0, "k = 1 is the identity map");
  assert.ok(gap(1.1554, 49.6, 1.191, 49.6) === 0, "the pivots cancel");
  assert.strictEqual(whitesK(0), 1, "whites at 0 points is a gain of 1");
});

test("whites and contrast do NOT commute at realistic settings, by more than the noise floor", () => {
  // 0.392 IRE is one 8-bit code. A difference under it is indistinguishable from the measurement.
  const NOISE = 0.392;
  const rows = table();
  const over = rows.filter((r) => Math.abs(r.ire) > NOISE);
  assert.ok(over.length > rows.length / 2, "most realistic combinations exceed the noise floor: " + over.length + " of " + rows.length);
  const worst = rows.reduce((a, b) => (Math.abs(b.ire) > Math.abs(a.ire) ? b : a));
  assert.ok(Math.abs(worst.ire) > 3, "the worst case is over 3 IRE, not a rounding detail");
  // The plan's two quoted figures, which this work was meant to confirm rather than replace.
  assert.ok(Math.abs(gap(whitesK(50), 0, CONTRAST["50"], 49.6) - -0.771) < 0.01, "whites+50 with contrast+50");
  assert.ok(Math.abs(gap(whitesK(-50), 0, CONTRAST["100"], 49.6) - 1.274) < 0.01, "whites-50 with contrast+100");
});

// The correction of 2026-09-18: the first version of this work excluded the curve toes on the grounds that
// their fixed point is "at the top rather than a pivot inside the range". A fixed point at the top IS a
// pivot at 100, and the exclusion was wrong.
test("a curve toe and a lift ARE pivot-gains about 100, so the identity covers them", () => {
  const toe = (v, x) => (v - 100 * x) / (1 - x), lift = (v, y) => 100 * y + v * (1 - y);
  const asPivot = (v, k) => TOE_PIVOT + (v - TOE_PIVOT) * k;
  for (const x of [0.02, 0.1, 0.25]) for (const v of [0, 12.5, 49.6, 88, 100])
    assert.ok(Math.abs(toe(v, x) - asPivot(v, toeK(x))) < 1e-9, "toe x=" + x + " at " + v);
  for (const y of [0.02, 0.1, 0.3]) for (const v of [0, 12.5, 49.6, 88, 100])
    assert.ok(Math.abs(lift(v, y) - asPivot(v, liftK(y))) < 1e-9, "lift y=" + y + " at " + v);
  // A toe has k > 1 and a lift k < 1 - the same control either side of neutral, like Whites and Exposure.
  assert.ok(toeK(0.1) > 1 && liftK(0.1) < 1);
  // Sharing the pivot, two channel toes commute EXACTLY. That is the algebra agreeing with the measurement
  // in `channelToe._isolation`, which found the three toes identical to the digit on six rows.
  assert.ok(gap(toeK(0.1), TOE_PIVOT, toeK(0.03), TOE_PIVOT) === 0, "two toes share a pivot");
});

test("the curve toes do NOT commute with the tonal sliders, and the effect is large", () => {
  const rows = curveVsSliders();
  const atCap = rows.filter((r) => r.toe === 0.25);
  // LEVELS_CAP is 0.25 and whites runs to +-100, so this is inside the range the pass actually uses.
  assert.ok(Math.max(...atCap.map((r) => Math.abs(r.ire))) > 4,
    "a toe at its cap against whites is over 4 IRE: " + JSON.stringify(atCap));
  // And it is bigger than the whites-x-contrast case the plan had already flagged as mattering.
  const worstSliders = Math.max(...table().map((r) => Math.abs(r.ire)));
  assert.ok(Math.max(...atCap.map((r) => Math.abs(r.ire))) > worstSliders,
    "the curve-vs-slider order matters more than the slider-vs-slider order the plan named");
});

test("the sweeps file records this as DERIVED, and says what it does not cover", () => {
  const sweeps = require("../src/lumetri_sweeps.json");
  const c = sweeps.commutation;
  assert.ok(c, "the commutation block exists");
  assert.match(c._source, /DERIVED, not measured/, "it must not be mistaken for a swept result");
  // The dangerous misreading is 'order does not matter'. Both caveats have to be on the record.
  assert.match(c._whatItDoesNOTCover, /PIVOT-GAINS ONLY/);
  // The correction has to stay on the record next to the claim it corrects, or a later reader re-derives it.
  assert.match(c._curveTOESareAlsoPivotGainsCORRECTION, /A FIXED POINT AT THE TOP IS A PIVOT AT P = 100/);
  assert.doesNotMatch(c._whatItDoesNOTCover, /curve toes have their fixed point/, "the withdrawn claim must not survive");
  assert.match(c._andItIsUNCLAMPED, /CLAMPING, NOT NON-COMMUTATION, IS WHAT ACTUALLY FIXES AN ORDER/);
});
