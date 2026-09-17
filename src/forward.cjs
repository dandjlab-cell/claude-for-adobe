// The forward model: apply a Lumetri control to PIXELS, then measure the result.
//
// Why this exists. Until now the pass predicted how each scope STATISTIC moves - `predict()` in
// grade_model.cjs scales or offsets p1, p50, p99 and the channel ends independently from a swept table.
// That is structurally wrong, not merely imprecise: two images with identical percentiles respond
// differently to the same control, so a statistic vector cannot predict its own evolution, and a chain of
// such predictions can reach a state that corresponds to no real image. The p10-below-p1 bug found on
// 2026-09-17 was exactly that failure mode reaching the shipped code.
//
// Here the operation is applied to an RGB buffer and the existing measure() runs over the result. Every
// statistic - percentiles, paired band medians, floor and clip shares, saturation - falls out of real
// pixels, so it is consistent by construction. There is no residual to fit and no transfer problem: the
// same code is exact on footage nobody has swept.
//
// WHAT IS STILL A MODEL. The per-control transfer functions below are the forms measured on 2026-09-17
// (src/lumetri_sweeps.json). Those can be wrong. What cannot be wrong any more is the step from a
// transformed image to its statistics. This file separates the two so the fallible half is isolated and
// testable: `apply()` is the hypothesis, measure() is arithmetic.
//
// ORDER. Premiere processes Lumetri top-down - Basic and Creative, then RGB Curves, then the hue/sat
// curves, then wheels and HSL - regardless of the order parameters are written. `pipeline()` applies in
// that order. Where a different order is wanted the answer is a second stacked Lumetri instance, not a
// different write order; `pipeline()` takes a list of stages for exactly that.
"use strict";
const { measure } = require("./scopes.cjs");

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const to255 = (ire) => (ire / 100) * 255;
const toIRE = (v) => (v / 255) * 100;

// ---- the measured transfer functions -------------------------------------------------------------
// Each takes a channel value in 0..255 and returns one, BEFORE clamping. `amount` is the slider value in
// Premiere's own units. Sources are named per function; a control with no measured form is absent rather
// than guessed, and applying it throws.

// Per-channel gains. `whiteBalanceRule`: Temperature runs red against blue, Tint runs red and blue
// together against green. Measured k at +-100 and interpolated linearly in the slider between the swept
// points, which is how the sweep was taken.
const WB = {
  temperature: { pts: [-100, -50, -20, 0, 20, 50, 100], red: [0.760, 0.877, 0.951, 1, 1.049, 1.125, 1.244], green: [1.016, 1.014, 1.008, 1, 0.992, 0.973, 0.935], blue: [1.337, 1.172, 1.069, 1, 0.935, 0.843, 0.701] },
  tint: { pts: [-100, -50, -20, 0, 20, 50, 100], red: [0.705, 0.847, 0.938, 1, 1.062, 1.153, 1.295], green: [1.086, 1.051, 1.023, 1, 0.972, 0.929, 0.840], blue: [0.706, 0.848, 0.941, 1, 1.062, 1.156, 1.298] },
};
const lerpTable = (pts, vals, x) => {
  if (x <= pts[0]) return vals[0];
  if (x >= pts[pts.length - 1]) return vals[vals.length - 1];
  for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i] && x <= pts[i + 1]) {
    const t = (x - pts[i]) / (pts[i + 1] - pts[i]);
    return vals[i] + t * (vals[i + 1] - vals[i]);
  }
  return vals[vals.length - 1];
};

// Whites: a pure multiplicative gain about zero (`whitesRule`, out = in * k, residual 0.27 out of sample).
const WHITES_K = { pts: [-100, -50, -20, 0, 20, 50, 100], k: [0.750, 0.865, 0.945, 1, 1.060, 1.152, 1.330] };
// Contrast: a gain about a pivot near 49.6 (`contrastRule`) - APPROXIMATE, median residual up to 2.09.
const CONTRAST_K = { pts: [-100, -50, -20, 0, 20, 50, 100], k: [0.798, 0.900, 0.966, 1, 1.046, 1.100, 1.191] };
const CONTRAST_PIVOT = 49.6;
// Exposure: a gain in LINEAR light at gamma 2.4 (`exposureRule`), exact downward. Upward Premiere
// tone-maps the highlights and that is not modelled - applying a positive exposure throws rather than
// pretending.
const EXPOSURE_GAMMA = 2.4;
// Blacks: a toe, exponential in level, lambda about 23 IRE (`blacksRule`). Strength per slider point is
// taken from the measured black-point move: +100 lifted luma p1 by 8.2 on C202.
const BLACKS_LAMBDA = 23, BLACKS_PER_POINT = 0.082;

const OPS = {
  temperature: (amount) => { const k = { red: lerpTable(WB.temperature.pts, WB.temperature.red, amount), green: lerpTable(WB.temperature.pts, WB.temperature.green, amount), blue: lerpTable(WB.temperature.pts, WB.temperature.blue, amount) }; return (v, ch) => v * k[ch]; },
  tint: (amount) => { const k = { red: lerpTable(WB.tint.pts, WB.tint.red, amount), green: lerpTable(WB.tint.pts, WB.tint.green, amount), blue: lerpTable(WB.tint.pts, WB.tint.blue, amount) }; return (v, ch) => v * k[ch]; },
  whites: (amount) => { const k = lerpTable(WHITES_K.pts, WHITES_K.k, amount); return (v) => v * k; },
  contrast: (amount) => { const k = lerpTable(CONTRAST_K.pts, CONTRAST_K.k, amount), P = to255(CONTRAST_PIVOT); return (v) => P + (v - P) * k; },
  exposure: (stops) => {
    if (stops > 0) throw new Error("exposure above 0 is not modelled: Premiere tone-maps the highlights (exposureRule._upwardIsDifferent)");
    const g = Math.pow(2, stops);
    return (v) => 255 * Math.pow(Math.pow(v / 255, EXPOSURE_GAMMA) * g, 1 / EXPOSURE_GAMMA);
  },
  blacks: (amount) => { const lift = to255(amount * BLACKS_PER_POINT); return (v) => v + lift * Math.exp(-toIRE(v) / BLACKS_LAMBDA); },
  // The Master curve's bottom point, and one channel's. Both are the same measured line
  // (`curveToe._model`, `channelToe._model`): out = (v - 100x) / (1 - x).
  masterToe: (x) => (v) => (v - to255(100 * x)) / (1 - x),
  channelToe: (x, channel) => (v, ch) => (ch === channel ? (v - to255(100 * x)) / (1 - x) : v),
  channelLift: (y, channel) => (v, ch) => (ch === channel ? to255(100 * y) + v * (1 - y) : v),
};

const CHANNELS = ["red", "green", "blue"];

// Apply one operation to an RGB buffer. Clamping happens per channel, here, because that is where
// Premiere does it - and because a clamped channel changes the luma and the ranks that every band
// statistic is built from, which is invisible to a statistic-space model.
function apply(rgb, op, amount, extra) {
  if (!OPS[op]) throw new Error("no measured form for " + op + " - add one or do not model it");
  const f = OPS[op](amount, extra);
  const out = Buffer.allocUnsafe(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    out[i] = clamp255(Math.round(f(rgb[i], "red")));
    out[i + 1] = clamp255(Math.round(f(rgb[i + 1], "green")));
    out[i + 2] = clamp255(Math.round(f(rgb[i + 2], "blue")));
  }
  return out;
}

// A stage is one Lumetri instance: operations applied in Premiere's own section order. A list of stages
// is a STACK of instances, which is how an arbitrary order is reached - Lumetri's internal order is fixed
// per instance, not overall.
const SECTION_ORDER = ["temperature", "tint", "exposure", "contrast", "highlights", "shadows", "whites", "blacks", "masterToe", "channelToe", "channelLift"];
function pipeline(rgb, stages) {
  let buf = rgb;
  for (const stage of stages) {
    const ops = Object.keys(stage).sort((a, b) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b));
    for (const op of ops) {
      const a = stage[op];
      buf = Array.isArray(a) ? apply(buf, op, a[0], a[1]) : apply(buf, op, a);
    }
  }
  return buf;
}

// The whole point: pixels in, statistics out, with no statistic ever predicted from another statistic.
function forward(rgb, stages) { return measure(pipeline(rgb, stages)); }

module.exports = { apply, pipeline, forward, OPS, SECTION_ORDER, CONTRAST_PIVOT, BLACKS_LAMBDA, EXPOSURE_GAMMA };
