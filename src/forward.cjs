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

// Whites and Exposure are ONE control in two unit systems (`whitesRule._ITISEXPOSURE`): 100 Whites points
// = 1 stop, and a gamma-2.4 gain is the plain scale 2^(stops/2.4) in display code values. Confirmed on two
// frames; on C202 the rows are bit-identical field for field. So there is one gain function here, not two
// tables - keeping two would have been a redundancy pretending to be evidence.
const gainForStops = (stops) => Math.pow(2, stops / 2.4);
// Contrast: a gain about a pivot near 49.6 (`contrastRule`) - APPROXIMATE, median residual up to 2.09.
const CONTRAST_K = { pts: [-100, -50, -20, 0, 20, 50, 100], k: [0.798, 0.900, 0.966, 1, 1.046, 1.100, 1.191] };
const CONTRAST_PIVOT = 49.6;
// The gamma the gain is taken in. Exported so a caller can see what the constant is rather than find 2.4
// buried in gainForStops.
const EXPOSURE_GAMMA = 2.4;
// Blacks: a toe, exponential in level, lambda about 23 IRE (`blacksRule`). Strength per slider point is
// taken from the measured black-point move: +100 lifted luma p1 by 8.2 on C202.
const BLACKS_LAMBDA = 23, BLACKS_PER_POINT = 0.082;

const OPS = {
  temperature: (amount) => { const k = { red: lerpTable(WB.temperature.pts, WB.temperature.red, amount), green: lerpTable(WB.temperature.pts, WB.temperature.green, amount), blue: lerpTable(WB.temperature.pts, WB.temperature.blue, amount) }; return (v, ch) => v * k[ch]; },
  tint: (amount) => { const k = { red: lerpTable(WB.tint.pts, WB.tint.red, amount), green: lerpTable(WB.tint.pts, WB.tint.green, amount), blue: lerpTable(WB.tint.pts, WB.tint.blue, amount) }; return (v, ch) => v * k[ch]; },
  whites: (amount) => { const k = gainForStops(amount / 100); return (v) => v * k; },
  contrast: (amount) => { const k = lerpTable(CONTRAST_K.pts, CONTRAST_K.k, amount), P = to255(CONTRAST_PIVOT); return (v) => P + (v - P) * k; },
  // Exposure is the same gain DOWNWARD and rolls off UPWARD, and the roll-off is Lumetri's own - not the
  // sequence tone mapper, which would have to act on Whites too and does not (`exposureRule._notTheToneMapper`).
  // The shoulder is level-dependent: measured/predicted at +0.5 stops is 0.985 at p1, 0.971 at the median,
  // 0.926 at p99, 0.886 at max, and below about 20 IRE it is invisible even at +2. Not modelled, because a
  // shoulder fitted from four ratios on one frame would be a guess wearing a number. Use whites for a clean
  // gain up, or measure the shoulder properly first.
  exposure: (stops) => {
    if (stops > 0) throw new Error("exposure above 0 is not modelled: Lumetri rolls off the highlights, and the shoulder has not been measured (exposureRule._notTheToneMapper)");
    return (v) => v * gainForStops(stops);
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

// A retained sample: every Nth pixel of a decoded frame, sized so a candidate can be evaluated in
// milliseconds instead of a render. Clip and floor SHARES are what this is used for and they are ratios,
// so a uniform subsample estimates them without bias; percentiles survive too. 120k pixels is about 6% of
// a 1080p frame and puts the sampling error on a 1% share near 0.03%.
const SAMPLE_PIXELS = 120000;
function sample(rgb, want = SAMPLE_PIXELS) {
  const n = Math.floor(rgb.length / 3);
  if (n <= want) return rgb;
  // The stride is FRACTIONAL on purpose. An integer step covers only want*floor(n/want) pixels, which for
  // 300k into 120k is the first 80% of the buffer - and pixels are in scanline order, so that is the top
  // 80% of the picture. A specular in the bottom fifth would never be sampled, and the guard built on it
  // would report no clipping for a move that clips. Caught by a test frame with its bright tail at the end.
  const step = n / want;
  const out = Buffer.allocUnsafe(want * 3);
  for (let i = 0, j = 0; i < want; i++, j += 3) { const k = Math.floor(i * step) * 3; out[j] = rgb[k]; out[j + 1] = rgb[k + 1]; out[j + 2] = rgb[k + 2]; }
  return out;
}

// What a candidate would DO to the frame, from the pixels rather than from a table of another frame's
// percentiles. Returns the damage shares only - this is a guard, not a predictor, and it is deliberately
// not used to choose a value. Null when the control has no measured form, so a caller can tell "safe"
// from "unknown" and treat them differently.
function damageOf(rgbSample, op, amount, extra) {
  if (!rgbSample || !OPS[op]) return null;
  try {
    const m = measure(apply(rgbSample, op, amount, extra));
    return { clipped: Math.max(m.clipped.red, m.clipped.green, m.clipped.blue), floored: Math.max(m.floor.red, m.floor.green, m.floor.blue) };
  } catch (_) { return null; }
}

module.exports = { apply, pipeline, forward, sample, damageOf, SAMPLE_PIXELS, OPS, SECTION_ORDER, CONTRAST_PIVOT, BLACKS_LAMBDA, EXPOSURE_GAMMA };
