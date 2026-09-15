"use strict";
// The fixtures are real calibration sweeps, not synthetic numbers: Lumetri Exposure, Temperature and
// Contrast on one BRAW frame of the sandbox timeline, scopes measured after every set (Premiere 26.x,
// 2026-09-15; every value read back exactly, nothing clamped). They are the evidence behind the
// module's two design decisions - measure instead of simulate, and take the interpolation space from
// the readings - so they are what it is tested against.
const test = require("node:test");
const assert = require("node:assert/strict");
const { predictStat, solveFor, clean, pickSpace, LOG, LINEAR } = require("../src/grade_solve.cjs");

const EXPOSURE = [-2, -1, -0.5, 0, 0.5, 1, 2];
const WIDE = [-100, -50, -20, 0, 20, 50, 100]; // Temperature and Contrast share this grid
const SWEEP = {
  // Exposure, at Temperature 0 / Contrast 0
  expP1: { x: EXPOSURE, y: [6.3, 8.2, 9.8, 11.0, 12.9, 14.9, 19.6] },
  expMedian: { x: EXPOSURE, y: [20.8, 27.5, 31.8, 36.9, 42.0, 47.5, 58.8] },
  expP99: { x: EXPOSURE, y: [48.2, 64.3, 74.1, 85.9, 91.8, 96.1, 99.6] },
  expMax: { x: EXPOSURE, y: [51.0, 68.2, 78.8, 91.0, 95.7, 98.4, 100] },
  // Temperature, at Exposure 0 / Contrast 0
  tempRed: { x: WIDE, y: [37.0, 42.7, 46.3, 48.7, 51.1, 54.8, 60.6] },
  tempBlue: { x: WIDE, y: [34.9, 30.6, 27.9, 26.1, 24.4, 22.0, 18.3] },
  tempCr: { x: WIDE, y: [-0.1, 3.0, 5.0, 6.4, 7.8, 10.0, 13.8] }, // crosses zero
  // Contrast, at Exposure 0 / Temperature 0
  contrastSpread: { x: WIDE, y: [59.6, 67.1, 71.4, 74.1, 77.3, 81.2, 87.1] }, // p99 - p1
  contrastP1: { x: WIDE, y: [18.4, 14.9, 12.5, 11.4, 9.8, 7.8, 5.1] },
};
const samplesOf = (key, drop = -1) =>
  SWEEP[key].x.map((value, i) => ({ value, stat: SWEEP[key].y[i] })).filter((_, i) => i !== drop);

test("every sweep predicts a held-out reading from its neighbours, within 5%", () => {
  for (const key of Object.keys(SWEEP)) {
    for (let i = 1; i < SWEEP[key].x.length - 1; i++) {
      const { stat, bracketed } = predictStat(samplesOf(key, i), SWEEP[key].x[i]);
      assert.equal(bracketed, true);
      const scale = Math.abs(SWEEP[key].y[i]) || 1;
      const err = Math.abs(stat - SWEEP[key].y[i]) / scale * 100;
      assert.ok(err < 5, key + " at " + SWEEP[key].x[i] + ": " + err.toFixed(1) + "% off");
    }
  }
});

test("the interpolation space is taken from the readings, not assumed", () => {
  // Exposure against the luma median is multiplicative; a channel mean against Temperature is a line.
  assert.equal(pickSpace(clean(samplesOf("expMedian"))), LOG);
  assert.equal(pickSpace(clean(samplesOf("tempRed"))), LINEAR);
  // A statistic that crosses zero has no log: it must not be forced into one, and must not be dropped.
  assert.equal(pickSpace(clean(samplesOf("tempCr"))), LINEAR);
  assert.equal(clean(samplesOf("tempCr")).length, 7, "the -0.1 reading survives");
});

test("solving lands on the value that measured the target, where the statistic is still moving", () => {
  let checked = 0;
  for (const key of Object.keys(SWEEP)) {
    const span = SWEEP[key].x[SWEEP[key].x.length - 1] - SWEEP[key].x[0];
    for (let i = 1; i < SWEEP[key].x.length - 1; i++) {
      const r = solveFor(samplesOf(key, i), SWEEP[key].y[i]);
      assert.equal(r.bracketed, true);
      if (!r.reliable) continue; // saturated: the next test covers it
      // Holding a reading out doubles the bracket, so this is the worst case - interpolating straight
      // across a bend. 6% of the parameter's own range; the verify step is what closes the rest.
      assert.ok(Math.abs(r.value - SWEEP[key].x[i]) < span * 0.06,
        key + ": solved " + r.value.toFixed(2) + " for a reading measured at " + SWEEP[key].x[i]);
      checked++;
    }
  }
  assert.ok(checked >= 30, "most of the three sweeps is invertible, checked " + checked);
});

test("a saturated statistic is flagged instead of answered confidently", () => {
  // Pushed up, `max` piles into 100 and stops carrying information; the median keeps moving. The agent
  // has to be told, or it will keep trusting a number that cannot answer.
  const sat = solveFor(samplesOf("expMax", EXPOSURE.indexOf(1)), SWEEP.expMax.y[EXPOSURE.indexOf(1)]);
  assert.equal(sat.reliable, false, "responsiveness " + sat.responsiveness.toFixed(2));
  const good = solveFor(samplesOf("expMedian", EXPOSURE.indexOf(1)), SWEEP.expMedian.y[EXPOSURE.indexOf(1)]);
  assert.equal(good.reliable, true, "responsiveness " + good.responsiveness.toFixed(2));
});

test("the same test passes on a parameter with a hundred times the range, unchanged", () => {
  // Responsiveness is normalised, so one threshold covers Exposure in stops and Temperature in its own
  // units. Without that, every Temperature bracket looks flat and nothing would ever be solvable.
  const r = solveFor(samplesOf("tempRed", WIDE.indexOf(0)), SWEEP.tempRed.y[WIDE.indexOf(0)]);
  assert.equal(r.reliable, true, "responsiveness " + r.responsiveness.toFixed(2));
  assert.ok(Math.abs(r.value) < 6, "solved " + r.value.toFixed(1) + " for a reading measured at 0");
});

test("a decreasing statistic solves the same as a rising one", () => {
  const r = solveFor(samplesOf("tempBlue", WIDE.indexOf(20)), SWEEP.tempBlue.y[WIDE.indexOf(20)]);
  assert.equal(r.bracketed, true);
  assert.ok(Math.abs(r.value - 20) < 12, "solved " + r.value.toFixed(1) + " for a reading measured at 20");
});

test("a target beyond the readings is refused, with the next value to measure", () => {
  const three = [-1, 0, 1].map((value) => ({ value, stat: SWEEP.expMedian.y[EXPOSURE.indexOf(value)] }));
  const over = solveFor(three, 70);
  assert.equal(over.bracketed, false);
  assert.ok(over.measureAt > 1, "points further up, got " + over.measureAt);
  const under = solveFor(three, 10);
  assert.equal(under.bracketed, false);
  assert.ok(under.measureAt < -1, "points further down, got " + under.measureAt);
});

test("bad input is refused rather than guessed", () => {
  assert.equal(solveFor([{ value: 0, stat: 10 }], 10), null, "one reading is not a bracket");
  assert.equal(predictStat([], 1), null);
  assert.equal(clean([{ value: 0, stat: 5 }, { value: 0, stat: 7 }]).length, 1, "a repeated value keeps one");
  assert.equal(clean([{ value: 1, stat: NaN }, { value: 2, stat: 3 }]).length, 1, "unreadable stats go");
  assert.equal(clean([{ value: 1, stat: -5 }]).length, 1, "a negative reading is data, not an error");
});
