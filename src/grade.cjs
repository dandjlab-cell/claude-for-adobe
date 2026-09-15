// Driving one Lumetri parameter to a measured target: bracket, solve, write, verify.
//
// The loop that src/grade_solve.cjs interpolates for. Everything Premiere-shaped is injected (`set`
// writes the parameter and returns what it reads back, `measure` renders and measures a frame), so the
// whole thing runs and is tested without Premiere - and the panel keeps its one place that talks to
// the host.
//
// Why a loop at all: Premiere's response is not predictable in advance (Exposure is a clean gain
// downwards and a highlight-protecting tone map upwards, see grade_solve.cjs), so the value is found
// by measuring the real render two or three times. Each measure costs 0.6-0.8 s.
"use strict";
const { solveFor } = require("./grade_solve.cjs");

// Statistics a grade can be steered by, read off one `scopes` measurement.
const STATISTICS = {
  brightness: (m) => m.luma.p50,
  shadows: (m) => m.luma.p1,
  highlights: (m) => m.luma.p99,
  spread: (m) => m.luma.p99 - m.luma.p1, // contrast moves this while leaving the median alone
  red: (m) => m.red.mean,
  green: (m) => m.green.mean,
  blue: (m) => m.blue.mean,
  warmth: (m) => m.cast.cr, // crosses zero on a neutral frame: needs the sign-safe solver
  tintCast: (m) => m.cast.cb,
  saturation: (m) => m.saturation.p50,
};

// Which statistic each parameter actually moves, and how big a first probe to take. `tested` marks the
// three swept live on 2026-09-15 (BRAW, Premiere 26.x); the rest are reasoned from what the control is
// for and must be confirmed by the same sweep before anything leans on them. Steering a parameter by a
// statistic it does not move reads as "nothing is happening" - Contrast leaves the median where it was.
// `lumetri` is the parameter's displayName. Several names repeat down the 130 properties (Temperature,
// Tint, Contrast, Saturation and Sharpen all appear again under HSL Secondary), and the host takes the
// FIRST match, which is always the Basic Correction one - that is what these entries mean. Reaching the
// HSL Secondary copies needs an index, not a name: see .claude/skills/premiere-scripting/lumetri.md.
const PARAMS = {
  exposure: { lumetri: "Exposure", steer: "brightness", step: 0.5, tested: true }, // luma median 20.8 -> 58.8 over -2..+2
  contrast: { lumetri: "Contrast", steer: "spread", step: 25, tested: true },      // p99-p1 59.6 -> 87.1 over -100..+100
  temperature: { lumetri: "Temperature", steer: "warmth", step: 25, tested: true },// cast Cr -0.1 -> 13.8; R mean 37 -> 60.6
  tint: { lumetri: "Tint", steer: "tintCast", step: 25, tested: false },
  highlights: { lumetri: "Highlights", steer: "highlights", step: 25, tested: false },
  shadows: { lumetri: "Shadows", steer: "shadows", step: 25, tested: false },
  whites: { lumetri: "Whites", steer: "highlights", step: 25, tested: false },
  blacks: { lumetri: "Blacks", steer: "shadows", step: 25, tested: false },
  saturation: { lumetri: "Saturation", steer: "saturation", step: 20, tested: false }, // a percentage: 100 is neutral
  vibrance: { lumetri: "Vibrance", steer: "saturation", step: 25, tested: false },
};

const MAX_MEASURES = 6;       // 6 x ~0.7 s is the most this should ever cost the editor
const CLAMP_EPSILON = 1e-6;   // a read-back that differs by more than this means Premiere refused the value

// set(value) -> the value Premiere reads back. measure() -> one scopes measurement.
// Returns what it did, what it achieved, and every reading taken, so the caller can show its work.
async function steer({ set, measure, param, target, statistic, start = 0, step, tolerance = 0.5 }) {
  const spec = PARAMS[param];
  if (!spec) throw new Error("unknown parameter: " + param);
  const statName = statistic || spec.steer;
  const readStat = STATISTICS[statName];
  if (!readStat) throw new Error("unknown statistic: " + statName);
  if (!isFinite(target)) throw new Error("target must be a number");

  const probe = Math.abs(Number(step) || spec.step);
  const readings = [];
  let measures = 0;

  // One measurement at `value`, recorded. A clamp is not a failure: Premiere refusing to go past its
  // own limit still lands on a real setting worth measuring - the end of the range often IS the answer.
  // What ends the search is landing somewhere already measured, because that means the wall is reached
  // and another render would tell us nothing.
  const at = async (value) => {
    const readBack = Number(await set(value));
    const clamped = Math.abs(readBack - value) > CLAMP_EPSILON;
    const known = readings.find((r) => Math.abs(r.value - readBack) <= CLAMP_EPSILON);
    if (known) return { value: readBack, stat: known.stat, clamped, repeat: true };
    if (measures >= MAX_MEASURES) return { value: readBack, clamped, exhausted: true };
    measures++;
    const stat = readStat(await measure());
    readings.push({ value: readBack, stat });
    return { value: readBack, stat, clamped };
  };

  await at(start);

  // Probe once to learn which way this parameter moves the statistic, then step that way until the
  // target is enclosed. Each step doubles, so a target far out is reached in a few measures, not many.
  const up = await at(start + probe);
  if (up.repeat) {
    const down = await at(start - probe);
    if (down.repeat) return done("clamped at " + readings[0].value + ": the parameter will not move");
  }

  let reach = probe;
  while (measures < MAX_MEASURES) {
    const solved = solveFor(readings, target);
    if (solved && solved.bracketed) break;
    if (!solved) return done("not enough usable readings");
    reach *= 2;
    const next = solved.measureAt !== undefined
      ? (solved.measureAt > solved.value ? solved.value + reach : solved.value - reach)
      : start + reach;
    const r = await at(next);
    if (r.repeat || r.exhausted) break; // the wall, or the measurement budget: stop asking
  }

  // Apply the solved value and check the real render agrees. One refinement, then stop: the readings
  // already bracket the answer, so a second miss means the statistic is not steering this parameter.
  let solved = solveFor(readings, target);
  if (!solved) return done("no solution from " + readings.length + " readings");
  let applied = await at(solved.value);
  if (applied.stat !== undefined && Math.abs(applied.stat - target) > tolerance && measures < MAX_MEASURES) {
    const again = solveFor(readings, target);
    if (again && again.bracketed) {
      solved = again;
      const retry = await at(again.value);
      if (retry.stat !== undefined) applied = retry;
    }
  }
  return done(null, solved, applied);

  function done(problem, solvedValue, appliedReading) {
    // Whatever is closest to the target is what the clip is left showing, so report that, not the last
    // thing tried: a search that walked past the answer must not claim the overshoot as its result.
    const best = appliedReading && appliedReading.stat !== undefined
      ? appliedReading
      : readings.slice().sort((a, b) => Math.abs(a.stat - target) - Math.abs(b.stat - target))[0];
    return {
      param, statistic: statName, target,
      value: best ? best.value : start,
      achieved: best ? best.stat : null,
      hit: !!best && Math.abs(best.stat - target) <= tolerance,
      reliable: !!(solvedValue && solvedValue.reliable),
      measures, readings, problem: problem || null,
      tested: spec.tested,
    };
  }
}

module.exports = { steer, STATISTICS, PARAMS, MAX_MEASURES };
