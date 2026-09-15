// Choosing a grade value by measuring Premiere, not by simulating it.
//
// The plan was a Lumetri simulator: decode the source ourselves, apply the maths offline, iterate for
// free. A calibration sweep on a BRAW clip (Exposure -2..+2, scopes after each) says don't. Premiere's
// Exposure is ASYMMETRIC: downwards it is a clean gain - every percentile moves by the same ratio,
// matching a gamma 2.4 stop to the third digit (-1 stop measured 0.745/0.745/0.749/0.749 against 0.750
// predicted). Upwards it is a tone mapping that protects highlights: at +1 the shadows move a full stop
// (p1 x1.355) while the top barely moves (max x1.081), which is why nothing clipped until +2. No static
// curve reproduces both directions; two fits were tried and both failed. That is Adobe's colour
// science, and copying it offline is a research project.
//
// Measuring it is one second. A `scopes` call renders and measures in 0.6-0.8 s, so the cheap, exact
// move is: take a few real readings around the guess, then interpolate between them. The answer comes
// from Premiere's own render, so it cannot drift from what the editor sees, and it needs no source
// decoding and no per-version recalibration.
//
// Accuracy, from that sweep (leave-one-out, predicting a reading from its two neighbours): median
// 0.2-1.1%, worst 4.6% where the response bends hardest (p99 and max around Exposure 0). Extrapolating
// past the measured points costs 3-8%, so this refuses to and says where to measure instead.
"use strict";

// samples: [{ value, stat }] - a grade parameter value and one measured number (luma median, a channel
// mean, whatever is being steered). Order does not matter; a repeated `value` keeps the last reading.
function clean(samples) {
  const seen = new Map();
  for (const s of samples || []) {
    const value = Number(s && s.value), stat = Number(s && s.stat);
    if (!isFinite(value) || !isFinite(stat) || stat <= 0) continue; // log space needs a positive stat
    seen.set(value, stat);
  }
  return [...seen.entries()].map(([value, stat]) => ({ value, stat })).sort((a, b) => a.value - b.value);
}

// Inverting a flat stretch of the response is hopeless: once highlights saturate, `max` moves 3% per
// stop while `median` moves 25%, so a 0.5% measurement wobble becomes a sixth of a stop of error. Below
// this much relative movement per unit of the parameter, the answer is reported unreliable and the
// caller should steer on a statistic that is still moving (the median, usually) instead.
const MIN_SENSITIVITY = 0.10;

const lerp = (x0, y0, x1, y1, x) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);

// The response is multiplicative through the middle of its range, so both directions interpolate
// against log(stat): a half-stop between two whole stops lands within 0.3% that way, against 1.5% for
// a straight line in stat.
const statAt = (a, b, value) => Math.exp(lerp(a.value, Math.log(a.stat), b.value, Math.log(b.stat), value));
const valueAt = (a, b, stat) => lerp(Math.log(a.stat), a.value, Math.log(b.stat), b.value, Math.log(stat));

// What the measurement would read at `value`. bracketed=false means it is an extrapolation off the end
// of the readings - worth 3-8% on the sweep, so take it as a hint to go and measure there.
function predictStat(samples, value) {
  const s = clean(samples);
  if (s.length < 2 || !isFinite(value)) return null;
  const bracketed = value >= s[0].value && value <= s[s.length - 1].value;
  let i = s.findIndex((p) => p.value > value) - 1;
  if (i < 0) i = value < s[0].value ? 0 : s.length - 2; // off an end: lean on the nearest pair
  return { stat: statAt(s[i], s[i + 1], value), bracketed };
}

// The parameter value that should land the measurement on `target`. Needs the target to sit between
// two readings; when it does not, returns the nearest end with bracketed=false and `measureAt` - the
// value worth measuring next to close the bracket.
function solveFor(samples, target) {
  const s = clean(samples);
  const want = Number(target);
  if (s.length < 2 || !isFinite(want) || want <= 0) return null;

  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if ((want >= a.stat && want <= b.stat) || (want <= a.stat && want >= b.stat)) {
      if (a.stat === b.stat) return { value: a.value, bracketed: true, sensitivity: 0, reliable: false };
      const sensitivity = Math.abs(Math.log(b.stat / a.stat) / (b.value - a.value)); // relative change per unit
      return { value: valueAt(a, b, want), bracketed: true, sensitivity, reliable: sensitivity >= MIN_SENSITIVITY };
    }
  }

  // Outside every pair: say which end, and how far to step to get a bracket next time.
  const lo = s[0], hi = s[s.length - 1];
  const rising = hi.stat > lo.stat;
  const past = rising ? want > hi.stat : want < hi.stat;
  const end = past ? hi : lo;
  const step = Math.abs(hi.value - lo.value) / Math.max(1, s.length - 1);
  return { value: end.value, bracketed: false, reliable: false, measureAt: end.value + (past ? step : -step) };
}

module.exports = { predictStat, solveFor, clean, MIN_SENSITIVITY };
