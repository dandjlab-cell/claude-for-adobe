// The closed form for the order of two pivot-gains (src/lumetri_sweeps.json `commutation`). It replaced a
// proposed render, so it had better be right: the check below is brute force, not a restatement.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { gap, whitesK, CONTRAST, table, check } = require("../tools/commutation.cjs");

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

test("the sweeps file records this as DERIVED, and says what it does not cover", () => {
  const sweeps = require("../src/lumetri_sweeps.json");
  const c = sweeps.commutation;
  assert.ok(c, "the commutation block exists");
  assert.match(c._source, /DERIVED, not measured/, "it must not be mistaken for a swept result");
  // The dangerous misreading is 'order does not matter'. Both caveats have to be on the record.
  assert.match(c._whatItDoesNOTCover, /PIVOT-GAINS ONLY/);
  assert.match(c._andItIsUNCLAMPED, /CLAMPING, NOT NON-COMMUTATION, IS WHAT ACTUALLY FIXES AN ORDER/);
});
