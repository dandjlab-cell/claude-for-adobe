// Choosing a grade value by measuring Premiere, not by simulating it.
//
// The plan was a Lumetri simulator: decode the source ourselves, apply the maths offline, iterate for
// free. Calibration sweeps on a BRAW clip (Exposure, Temperature and Contrast, scopes after every set)
// say don't. Premiere's Exposure is ASYMMETRIC: downwards it is a clean gain - every percentile moves
// by the same ratio, matching a gamma-2.4 stop to the third digit - while upwards it is a tone mapping
// that protects highlights, so at +1 the shadows take a full stop and the top barely moves. No static
// curve reproduces both directions; two fits were tried and both failed. That is Adobe's color
// science, and copying it offline is a research project.
//
// Measuring it is one second. A `scopes` call renders and measures in 0.6-0.8 s, so the cheap, exact
// move is: take a few real readings around the guess and interpolate between them. The answer comes
// from Premiere's own render, so it cannot drift from what the editor sees, it needs no source
// decoding, and it needs no recalibration when Adobe changes the pipeline.
//
// Each parameter moves its own statistic, so steer on the right one (measured, same clip and frame):
//   Exposure     luma median 20.8 -> 58.8 over -2..+2; `max` saturates, so never steer on it up high
//   Temperature  R mean 37.0 -> 60.6 and B mean 34.9 -> 18.3 over -100..+100; luma median moves 2.3
//   Contrast     luma p99-p1 spread 59.6 -> 87.1 over -100..+100; the median stays put (39.2 -> 36.1)
"use strict";

// Interpolation space is taken from the readings, not assumed: Exposure against the luma median wants
// log (1.1% against 2.3%), Temperature against a channel mean wants linear (0.3% against 0.6%), and a
// statistic that crosses zero - cast Cr runs -0.1 to 13.8 - has no log at all. An earlier version
// dropped non-positive readings to keep log valid, which silently threw away half a Temperature sweep.
const LOG = "log", LINEAR = "linear";

// How much of the sweep's total movement a bracket delivers, per unit of its share of the parameter
// range. Both axes are normalised, so this reads the same for Exposure in stops and Temperature in its
// own -100..100 units: 1.0 is an average stretch, near 0 is a stretch where the statistic has stopped
// responding. Below this the answer is reported unreliable - the caller should steer on a statistic
// that is still moving. Two readings cannot show this (the bracket is the whole range, so it scores
// 1.0 by construction); three or more can.
const MIN_RESPONSIVENESS = 0.5;

// samples: [{ value, stat }] - a grade parameter value and one measured number. Any sign; order does
// not matter; a repeated `value` keeps the last reading.
function clean(samples) {
  const seen = new Map();
  for (const s of samples || []) {
    const value = Number(s && s.value), stat = Number(s && s.stat);
    if (!isFinite(value) || !isFinite(stat)) continue;
    seen.set(value, stat);
  }
  return [...seen.entries()].map(([value, stat]) => ({ value, stat })).sort((a, b) => a.value - b.value);
}

const lerp = (x0, y0, x1, y1, x) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);
const statBetween = (a, b, value, space) => space === LOG
  ? Math.exp(lerp(a.value, Math.log(a.stat), b.value, Math.log(b.stat), value))
  : lerp(a.value, a.stat, b.value, b.stat, value);
const valueBetween = (a, b, stat, space) => space === LOG
  ? lerp(Math.log(a.stat), a.value, Math.log(b.stat), b.value, Math.log(stat))
  : lerp(a.stat, a.value, b.stat, b.value, stat);

// Hold out each interior reading, predict it from its neighbours in both spaces, keep the better one.
function pickSpace(s) {
  if (!s.every((p) => p.stat > 0)) return LINEAR;
  if (s.length < 3) return LOG; // cannot tell from two points; a multiplicative response is the common case
  let logWorst = 0, linWorst = 0;
  for (let i = 1; i < s.length - 1; i++) {
    const scale = Math.abs(s[i].stat) || 1;
    logWorst = Math.max(logWorst, Math.abs(statBetween(s[i - 1], s[i + 1], s[i].value, LOG) - s[i].stat) / scale);
    linWorst = Math.max(linWorst, Math.abs(statBetween(s[i - 1], s[i + 1], s[i].value, LINEAR) - s[i].stat) / scale);
  }
  return logWorst <= linWorst ? LOG : LINEAR;
}

function responsivenessOf(s, a, b) {
  const statSpan = Math.max(...s.map((p) => p.stat)) - Math.min(...s.map((p) => p.stat));
  const valueSpan = s[s.length - 1].value - s[0].value;
  if (!(statSpan > 0) || !(valueSpan > 0)) return 0;
  return (Math.abs(b.stat - a.stat) / statSpan) / (Math.abs(b.value - a.value) / valueSpan);
}

// What the measurement would read at `value`. bracketed=false means it is an extrapolation off the end
// of the readings - worth 3-8% on the Exposure sweep - so take it as a hint to go and measure there.
function predictStat(samples, value) {
  const s = clean(samples);
  if (s.length < 2 || !isFinite(value)) return null;
  const space = pickSpace(s);
  const bracketed = value >= s[0].value && value <= s[s.length - 1].value;
  let i = s.findIndex((p) => p.value > value) - 1;
  if (i < 0) i = value < s[0].value ? 0 : s.length - 2; // off an end: lean on the nearest pair
  return { stat: statBetween(s[i], s[i + 1], value, space), bracketed, space };
}

// The parameter value that should land the measurement on `target`. Needs the target to sit between
// two readings; when it does not, returns the nearest end with bracketed=false and `measureAt` - the
// value worth measuring next to close the bracket.
function solveFor(samples, target) {
  const s = clean(samples);
  const want = Number(target);
  if (s.length < 2 || !isFinite(want)) return null;
  const space = pickSpace(s);

  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    if ((want >= a.stat && want <= b.stat) || (want <= a.stat && want >= b.stat)) {
      if (a.stat === b.stat) return { value: a.value, bracketed: true, responsiveness: 0, reliable: false, space };
      const responsiveness = responsivenessOf(s, a, b);
      return {
        value: valueBetween(a, b, want, space),
        bracketed: true, responsiveness, space,
        reliable: responsiveness >= MIN_RESPONSIVENESS,
      };
    }
  }

  // Outside every pair: say which end, and how far to step to get a bracket next time.
  const lo = s[0], hi = s[s.length - 1];
  const rising = hi.stat > lo.stat;
  const past = rising ? want > hi.stat : want < hi.stat;
  const end = past ? hi : lo;
  const step = Math.abs(hi.value - lo.value) / Math.max(1, s.length - 1);
  return { value: end.value, bracketed: false, reliable: false, space, measureAt: end.value + (past ? step : -step) };
}

module.exports = { predictStat, solveFor, clean, pickSpace, MIN_RESPONSIVENESS, LOG, LINEAR };
