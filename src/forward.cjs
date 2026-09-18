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
const CURVES = require("./curves.cjs");
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

// The Shadows/Highlights bumps: (input IRE -> delta IRE at +-100), both calibration frames pooled, readings
// within one code of each other averaged, pinned to zero at 0 and 100. `p` is the slider-amount exponent per
// direction. See OPS.shadows below and `shadowsHighlightsForm` in the sweeps for the fit and its residuals.
const BUMP = {
  shadows: {
    up: [[0, 0], [4.7, 5.5], [8, 8.9], [9.2, 10], [13.7, 13.4], [14.5, 13.7], [17.3, 15.6], [41.6, 11.3], [54.9, 8.2], [74.1, 3.2], [76, 2.7], [78.8, 2.4], [84.7, 1.2], [88.6, 0.8], [91.4, 0.4], [97.3, 0], [100, 0]],
    down: [[0, 0], [4.7, -1.2], [8, -3.3], [9.2, -4.1], [13.7, -7], [14.5, -7.4], [17.3, -9.5], [41.6, -10.6], [54.9, -9], [74.1, -4.7], [76, -4.3], [78.8, -3.5], [84.7, -2], [88.6, -1.1], [91.4, -0.8], [97.3, 0.3], [100, 0]],
    pUp: 1.0, pDown: 0.7,
  },
  highlights: {
    up: [[0, 0], [4.7, 0.4], [8, 0.8], [9.2, 0.6], [13.7, 2], [14.5, 2], [17.3, 2.3], [41.6, 9.8], [54.9, 12.6], [74.1, 13], [76, 12.2], [78.8, 11.4], [84.7, 7.8], [88.6, 5.5], [91.4, 4.3], [97.3, 0.7], [100, 0]],
    down: [[0, 0], [4.7, 0], [8, -0.3], [9.2, -0.6], [13.7, -0.8], [14.5, -1.2], [17.3, -1.6], [41.6, -8.3], [54.9, -11.8], [74.1, -16.8], [76, -16.9], [78.8, -16.4], [84.7, -13.9], [88.6, -12.1], [91.4, -9.8], [97.3, -2.8], [100, 0]],
    pUp: 0.78, pDown: 1.0,
  },
  // The Shadows WHEEL's luma slider - Lumetri's Lift - at its full swept excursion x = 0.25 (0.5 is neutral,
  // down darkens). Same bump family as the Shadows slider, peaking near 20 IRE (-9.8) and dying at the top.
  // Both frames (`shadowsWheelLuma` C220, `shadowsWheelLumaC187`) pooled; they meet seamlessly at input
  // 10.2 -> -7.8 [C220] / 10.6 -> -8.2 [C187]. Linear in the excursion (0.5 - x): C187 reads 0.19 / 0.40 /
  // 0.60 / 0.80 / 1.00 of the x=0.25 delta at 0.45 / 0.40 / 0.35 / 0.30 / 0.25. Only x < 0.5 is measured.
  shadowsWheelLuma: {
    down: [[0, 0], [4.7, -4.3], [7.9, -6.5], [8.6, -7], [9.4, -7.4], [10.4, -8], [11.8, -8.7], [19.2, -9.8], [21.2, -9.8], [23.9, -9.4], [38, -7.8], [41.2, -7.5], [55.3, -5.5], [91.8, -0.8], [100, 0]],
  },
};
// The Highlights wheel PAD, measured 2026-09-18 17:50-18:00 on C202 at five hues and five sats
// (`highlightsPad`). NOT a band: per row, out/in is one number per channel across every level statistic
// from the blacks to the whites (spread within a code), so it is a PER-CHANNEL GAIN ABOUT ZERO, luma-
// preserving (0.2126 gR + 0.7152 gG + 0.0722 gB = 1 within 0.008 on every hue) and linear in sat:
// gain_ch = 1 + sat * c_ch(hue). c is one vector rotating in one plane, but the wheel's angle is warped
// (45 sits at plane angle 49, 135 at 130.5) and the vector length runs 0.39-0.46, so the table below is
// interpolated by hue rather than fitted to cos/sin, which would miss by 0.78 IRE at sat 0.3. 225/270/315
// are the mirrors of 45/90/135 - 180 mirrors 0 here within 0.02 and 270 mirrors 90 on C220 within 0.02,
// so the mirror is measured on both axes. Hue convention is QE's: 0 red, 90 green, 180 cyan, 270 magenta.
const PAD_C = [
  [0, 0.372, -0.108, -0.104], [45, 0.118, -0.005, -0.371], [90, -0.159, 0.093, -0.409], [135, -0.366, 0.141, -0.244],
  [180, -0.392, 0.116, 0.113], [225, -0.118, 0.005, 0.371], [270, 0.159, -0.093, 0.409], [315, 0.366, -0.141, 0.244], [360, 0.372, -0.108, -0.104],
];
const padVector = (hue) => {
  const h = ((hue % 360) + 360) % 360;
  for (let i = 0; i < PAD_C.length - 1; i++) if (h >= PAD_C[i][0] && h <= PAD_C[i + 1][0]) {
    const t = (h - PAD_C[i][0]) / (PAD_C[i + 1][0] - PAD_C[i][0]), a = PAD_C[i], b = PAD_C[i + 1];
    return { red: a[1] + t * (b[1] - a[1]), green: a[2] + t * (b[2] - a[2]), blue: a[3] + t * (b[3] - a[3]) };
  }
  return { red: PAD_C[0][1], green: PAD_C[0][2], blue: PAD_C[0][3] };
};
const lerpPts = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) { const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]); } return pts[pts.length - 1][1]; };
const bumpOp = (amount, b) => {
  if (!amount) return (v) => v;
  const table = amount > 0 ? b.up : b.down, scale = Math.pow(Math.abs(amount) / 100, amount > 0 ? b.pUp : b.pDown);
  return (v) => v + to255(scale * lerpPts(table, toIRE(v)));
};

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
  // Shadows and Highlights are BUMPS: an additive lift whose weight is a bell over input level, zero at both
  // ends of the scale, centred in the shadows (~17 IRE) or the upper mids (~75). Neither is a gain and
  // neither is the Blacks toe - Shadows +100 adds 9.8 at input 9 and RISES to 15.6 at input 17 before
  // falling to 0 at 97; a lift would move the darkest input most. Measured 2026-09-18 (`shadowsHighlightsForm`)
  // on two frames with different pictures, and the two frames' (input -> delta) points interleave on ONE
  // curve, so the weight is a property of the slider, not the picture: fitted on C202 it predicts every row
  // of C220 to a median 0.22 IRE (Shadows) / 0.34 (Highlights). The tables are both frames pooled.
  //
  // The amount scales the bump by (|s|/100)^p, and p differs by DIRECTION: Shadows up and Highlights down
  // are linear (p 1.03-1.12 across both frames); Shadows down and Highlights up saturate (half the slider
  // gives 60-65% of the effect). Those two exponents are the soft part - they came out 0.78/0.59 and
  // 0.70/0.85 on the two frames - and are set to the mean, worth about 0.8 IRE at mid-slider. Everything
  // else here is within the 0.4 IRE noise floor. This replaces two DOWNGRADED forms and was, on the
  // chooser's first two live runs, the whole of the remaining MODEL OFF BY above 1.2.
  shadows: (amount) => bumpOp(amount, BUMP.shadows),
  highlights: (amount) => bumpOp(amount, BUMP.highlights),
  // The Shadows wheel's luma, by its slider POSITION x (0.5 neutral). "Its magnitude does not transfer" was
  // recorded twice (`shadowsWheelLumaC187._transfer`) and was a key error, not a physics one: the two frames
  // were compared at luma p1, which sits at a different INPUT LEVEL on each (8.2 against 23.9), and a bump
  // moves different levels by different amounts. Overlaid by input level the two frames are one curve
  // (2026-09-18 16:40). Upward (x > 0.5) is unswept and refuses, like exposure above 0.
  // The Highlights wheel pad: amount is the wheel's sat, extra is its hue. A gain about zero, so it scales
  // the blacks in the same proportion as the whites - which is the whole story of the blue blacks of
  // 2026-09-17: a pad aimed at a warm top tints the bottom by construction. The chooser can now see that.
  highlightsPad: (sat, hue) => {
    if (!(sat > 0)) return (v) => v;
    const c = padVector(hue), k = { red: 1 + sat * c.red, green: 1 + sat * c.green, blue: 1 + sat * c.blue };
    return (v, ch) => v * k[ch];
  },
  shadowsWheelLuma: (x) => {
    if (x > 0.5 + 1e-9) throw new Error("Shadows wheel luma above 0.5 is not modelled: only the downward half was swept (shadowsWheelLuma, shadowsWheelLumaC187)");
    const scale = (0.5 - x) / 0.25;
    if (scale <= 0) return (v) => v;
    return (v) => v + to255(scale * lerpPts(BUMP.shadowsWheelLuma.down, toIRE(v)));
  },
  // The Master curve's bottom point, and one channel's. Both are the same measured line
  // (`curveToe._model`, `channelToe._model`): out = (v - 100x) / (1 - x).
  masterToe: (x) => (v) => (v - to255(100 * x)) / (1 - x),
  // The Master bottom point WITH the anchor the pass actually writes. levels() emits
  // (x,0) -> (anchor,anchor) -> (0.8,0.8) -> (1,1), and the last three are collinear on the diagonal, so
  // above the anchor the curve is the identity and below it the straight line from (x,0) to (anchor,anchor).
  //
  // MEASURED, not assumed. `curveToe._anchored` swept the four-point spline the grade writes against the
  // bare two-point curve and got the same black end - luma p1 8.2 / 6.7 / 4.3 / 0.4 / 0 / 0 against
  // 8.2 / 6.7 / 3.9 / 0.4 / 0 / 0 - with this form predicting it to within 0.24 IRE. The anchor changes the
  // midtones, not the black point. This is the same map as predictLevels' anchored branch (curves.cjs),
  // deliberately: one form, two places, so they cannot drift apart silently.
  //
  // Without this the guard was DEAD CODE in production. `levelsFor` sets anchor = clamp(p50/100, 0.3, 0.6)
  // and caps blackIn at 0.25, so anchor > blackIn + 0.05 holds for every clip that gets a black point,
  // which on this footage is all of them - and the caller bailed out on exactly that condition.
  // 2026-09-18 21:42: the anchored curve is a NATURAL CUBIC SPLINE through the written points, not the
  // chord (`curveToeAnchoredC202._perPixelSpline`, 0.12-0.15 IRE against the pixels). curves.cjs owns the
  // form (levelsMap); this is the same map on codes. Exact for a channel curve and for Master's red and blue;
  // Master's GREEN is not a 1-D map (`curveToe._modelCORRECTION`) and is not modelled - the pass should
  // write the black point as three channel curves (RGB), which are.
  masterToeAnchored: (x, anchor) => {
    const map = CURVES.levelsMap(x, 1, anchor);
    return (v) => to255(map(toIRE(v)));
  },
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
  // 2026-09-18 chooser benchmark: replaying a channel function for every sample dominated composed
  // searches. RGB24 has only 256 inputs per channel; these exact tables retain rounding and EVERY
  // intermediate clamp while doing the expensive exp()/gain work once per code, not per pixel.
  const red = new Uint8Array(256), green = new Uint8Array(256), blue = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    red[v] = clamp255(Math.round(f(v, "red")));
    green[v] = clamp255(Math.round(f(v, "green")));
    blue[v] = clamp255(Math.round(f(v, "blue")));
  }
  const out = Buffer.allocUnsafe(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    out[i] = red[rgb[i]];
    out[i + 1] = green[rgb[i + 1]];
    out[i + 2] = blue[rgb[i + 2]];
  }
  return out;
}

// A stage is one Lumetri instance: operations applied in Premiere's own section order. A list of stages
// is a STACK of instances, which is how an arbitrary order is reached - Lumetri's internal order is fixed
// per instance, not overall.
// Wheels come AFTER the curves in Lumetri's own order, so the wheel luma is last.
const SECTION_ORDER = ["temperature", "tint", "exposure", "contrast", "highlights", "shadows", "whites", "blacks", "masterToe", "masterToeAnchored", "channelToe", "channelLift", "shadowsWheelLuma", "highlightsPad"];
function pipeline(rgb, stages, visit = null) {
  let buf = rgb;
  for (const stage of stages) {
    // 2026-09-18: a tuple list permits three channel toes in ONE instance. Separate objects would
    // accidentally model stacked Lumetris, putting Master after channels instead of before them.
    const ops = (Array.isArray(stage) ? stage.slice() : Object.entries(stage).map(([op, a]) => [op, ...(Array.isArray(a) ? a : [a])]))
      .sort((a, b) => SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]));
    for (const [op, amount, extra] of ops) {
      buf = apply(buf, op, amount, extra);
      if (visit) visit(buf, op);
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
function damageOf(rgbSample, op, amount, extra, source) {
  if (!rgbSample || !OPS[op]) return null;
  try {
    const out = apply(rgbSample, op, amount, extra);
    const m = measure(out);
    const nr = source ? newlyRailed(source, out) : null;
    return {
      clipped: Math.max(m.clipped.red, m.clipped.green, m.clipped.blue),
      floored: Math.max(m.floor.red, m.floor.green, m.floor.blue),
      newHigh: nr ? nr.high : null,
      newLow: nr ? nr.low : null,
    };
  } catch (_) { return null; }
}

// What the AGGREGATE share cannot tell you, per gpt-6-astra 2026-09-18.
//
// Comparing "floored % now" against "floored % before" is maskable in two ways, and both are ordinary rather
// than exotic. Lifting pixels off the floor while pushing others onto it can leave the total unchanged or
// even lower while destroying information. And a final-only check misses a channel that floored at one stage
// and was lifted back at the next: the pixels are gone, the total says nothing happened.
//
// The honest constraint is per sample, against the SOURCE: a channel that was strictly interior in the
// original frame and is on a rail now has been destroyed, whatever the totals say. Pixels that arrived
// already railed are excluded - a legitimately clipped specular is not the grade's doing, and it is also not
// recoverable by anyone.
//
// This is measured against the source rather than the previous stage on purpose, so it is CUMULATIVE: damage
// done by an earlier accepted move still counts against a later one, which is what "every prefix of the
// chain must preserve the protected samples" means.
function newlyRailed(source, now) {
  if (!source || !now || source.length !== now.length) return null;
  let high = 0, low = 0, interior = 0;
  for (let i = 0; i < source.length; i++) {
    const s = source[i];
    if (s <= 0 || s >= 255) continue; // already railed at the source: not ours, and not recoverable
    interior++;
    const v = now[i];
    if (v >= 255) high++; else if (v <= 0) low++;
  }
  if (!interior) return { high: 0, low: 0, interior: 0 };
  return { high: (high / interior) * 100, low: (low / interior) * 100, interior };
}

module.exports = { apply, pipeline, forward, sample, damageOf, newlyRailed, SAMPLE_PIXELS, OPS, SECTION_ORDER, CONTRAST_PIVOT, BLACKS_LAMBDA, EXPOSURE_GAMMA };
