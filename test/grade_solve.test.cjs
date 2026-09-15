"use strict";
// The fixture is a real calibration sweep, not synthetic numbers: Lumetri Exposure -2..+2 on one BRAW
// frame of the sandbox timeline, scopes measured after each set (Premiere 26.x, 2026-09-15). It is the
// evidence that Premiere's Exposure is asymmetric, so it is also the right thing to test against.
const test = require("node:test");
const assert = require("node:assert/strict");
const { predictStat, solveFor, clean } = require("../src/grade_solve.cjs");

const E = [-2, -1, -0.5, 0, 0.5, 1, 2];
const SWEEP = {
  p1: [6.3, 8.2, 9.8, 11.0, 12.9, 14.9, 19.6],
  median: [20.8, 27.5, 31.8, 36.9, 42.0, 47.5, 58.8],
  p99: [48.2, 64.3, 74.1, 85.9, 91.8, 96.1, 99.6],
  max: [51.0, 68.2, 78.8, 91.0, 95.7, 98.4, 100],
};
const samplesOf = (key, keep = () => true) =>
  E.map((value, i) => ({ value, stat: SWEEP[key][i] })).filter((s, i) => keep(E[i], i));

test("predicts a held-out reading from its neighbours, within the sweep's measured ceiling", () => {
  let worst = 0;
  for (const key of Object.keys(SWEEP)) {
    for (let i = 1; i < E.length - 1; i++) {
      const without = samplesOf(key, (_, j) => j !== i);
      const { stat, bracketed } = predictStat(without, E[i]);
      assert.equal(bracketed, true, key + " at " + E[i] + " should sit inside the remaining readings");
      worst = Math.max(worst, Math.abs(stat - SWEEP[key][i]) / SWEEP[key][i] * 100);
    }
  }
  // 4.6% is p99/max at Exposure 0, where the highlight rolloff bends hardest; the median is ~1%.
  assert.ok(worst < 5, "worst leave-one-out error " + worst.toFixed(1) + "% should stay under 5%");
});

test("solving for a target lands on the exposure that measured it, where the response is still moving", () => {
  let checked = 0;
  for (const key of Object.keys(SWEEP)) {
    for (let i = 1; i < E.length - 1; i++) {
      const without = samplesOf(key, (_, j) => j !== i);
      const r = solveFor(without, SWEEP[key][i]);
      assert.equal(r.bracketed, true);
      if (!r.reliable) continue; // a saturated statistic cannot be inverted; the next test covers that
      // Dropping a reading doubles the bracket, so this measures the worst case: interpolating a full
      // stop straight across the bend where the highlight rolloff starts. Worst here is 0.24 of a stop
      // (max at Exposure 0); the measure-and-verify step is what closes that, not a better guess.
      assert.ok(Math.abs(r.value - E[i]) < 0.25, key + ": solved " + r.value.toFixed(2) + " for a reading measured at " + E[i]);
      checked++;
    }
  }
  assert.ok(checked >= 12, "most of the sweep is invertible, checked " + checked);
});

test("a saturated statistic is reported unreliable instead of answered confidently", () => {
  // max between Exposure 0.5 and 2 only moves 95.7 -> 100: inverting that puts the answer 0.45 of a
  // stop out. The number is still returned, flagged, so the agent can steer on the median instead.
  const r = solveFor(samplesOf("max", (_, j) => j !== E.indexOf(1)), SWEEP.max[E.indexOf(1)]);
  assert.equal(r.bracketed, true);
  assert.equal(r.reliable, false, "sensitivity " + r.sensitivity.toFixed(3) + " should fall under the floor");
  assert.ok(r.sensitivity < 0.1);

  // The median over the same stretch is moving fast and inverts cleanly.
  const m = solveFor(samplesOf("median", (_, j) => j !== E.indexOf(1)), SWEEP.median[E.indexOf(1)]);
  assert.equal(m.reliable, true, "median sensitivity " + m.sensitivity.toFixed(3));
  assert.ok(m.sensitivity > 0.2);
});

test("a target beyond the readings is refused, with the next value to measure", () => {
  const three = samplesOf("median", (e) => e === -1 || e === 0 || e === 1); // 27.5, 36.9, 47.5
  const over = solveFor(three, 70);
  assert.equal(over.bracketed, false, "70 is above every reading");
  assert.ok(over.measureAt > 1, "should point further up, got " + over.measureAt);

  const under = solveFor(three, 10);
  assert.equal(under.bracketed, false);
  assert.ok(under.measureAt < -1, "should point further down, got " + under.measureAt);
});

test("predicting past the ends is allowed but flagged, because it costs 3-8% here", () => {
  const upTo1 = samplesOf("median", (e) => e === 0 || e === 1);
  const { stat, bracketed } = predictStat(upTo1, 2);
  assert.equal(bracketed, false);
  assert.ok(stat > 55 && stat < 65, "extrapolated " + stat.toFixed(1) + " against 58.8 measured");
});

test("exposure downwards is a clean gain: one ratio fits every percentile", () => {
  // The finding that killed the simulator. At -1 stop each percentile scales the same; at +1 they fan out.
  const at = (key, e) => SWEEP[key][E.indexOf(e)] / SWEEP[key][E.indexOf(0)];
  const down = Object.keys(SWEEP).map((k) => at(k, -1));
  assert.ok(Math.max(...down) - Math.min(...down) < 0.01, "ratios at -1 agree: " + down.map((r) => r.toFixed(3)));
  const up = Object.keys(SWEEP).map((k) => at(k, 1));
  assert.ok(Math.max(...up) - Math.min(...up) > 0.2, "ratios at +1 fan out: " + up.map((r) => r.toFixed(3)));
});

test("bad input is refused rather than guessed", () => {
  assert.equal(solveFor([{ value: 0, stat: 10 }], 10), null, "one reading is not a bracket");
  assert.equal(predictStat([], 1), null);
  assert.equal(solveFor(samplesOf("median"), 0), null, "a non-positive target has no log");
  assert.equal(clean([{ value: 0, stat: 5 }, { value: 0, stat: 7 }]).length, 1, "a repeated value keeps one reading");
  assert.equal(clean([{ value: 1, stat: 0 }, { value: 2, stat: -3 }]).length, 0, "unusable readings are dropped");
});
