// The Lumetri colour wheels as one-shot knobs: parse and format QE's text, and a linear model of what
// each wheel does to the parade, from the live sweep in src/lumetri_sweeps.json (wheels).
//
// QE serialises the wheels as "Shadows:h,s,l;Midtones:h,s,l;Highlights:h,s,l" - hue in degrees
// (0 red, 90 green, 180 cyan, 270 magenta), sat 0..1 (the pad radius), luma 0..1 centred at 0.50.
// Reads come back with a COMMA decimal mark; writes must use a DOT or Premiere accepts them and does
// nothing (probed 2026-09-15). The file stores (hue, luma, sat); this order is QE's, not the file's.
//
// Model: a wheel's pad offset (x, y) = sat * (cos hue, sin hue) moves the parade's cast at its end
// linearly for small offsets - four points at sat 0.15 fit a 2x2 matrix - and its luma slider moves
// the tonal ends linearly. Both are solved directly: for a cast to cancel, invert the matrix; for a
// black or white point, one division. One write, one confirm.
"use strict";
const SWEEPS = require("./lumetri_sweeps.json").wheels;

const WHEELS = ["shadows", "midtones", "highlights"];
const NAME = { shadows: "Shadows", midtones: "Midtones", highlights: "Highlights" };
const NEUTRAL = { hue: 0, sat: 0, luma: 0.5 };
// The pad model was fitted at sat 0.15 and is off by ~1.3 points there already on its own shadow rows;
// 0.3 is twice the sampled radius and the most an automatic pass extrapolates (0.5 was 3.3x, and the
// run of 2026-09-15 18:03 showed what that does). More cast than this is reported, not chased.
const MAX_SAT = 0.3;

// "Shadows:227,00,0,10,0,40;..." -> { shadows: {hue, sat, luma}, ... }. Tolerates dots too.
function parse(text) {
  const out = {};
  for (const part of String(text || "").split(";")) {
    const m = /^\s*(Shadows|Midtones|Highlights)\s*:\s*(.*)$/.exec(part);
    if (!m) continue;
    // Comma is both the decimal mark and the separator on read: "227,00,0,10,0,40" is three numbers
    // with two decimals each. A dot form ("227.00,0.10,0.40") is three plain numbers.
    const body = m[2].trim();
    let nums;
    if (body.indexOf(".") >= 0) nums = body.split(",").map(Number);
    else { const t = body.split(","); nums = []; for (let i = 0; i + 1 < t.length; i += 2) nums.push(Number(t[i] + "." + t[i + 1])); }
    if (nums.length < 3 || nums.some((n) => !isFinite(n))) continue;
    out[m[1].toLowerCase()] = { hue: nums[0], sat: nums[1], luma: nums[2] };
  }
  return out;
}

// The write form: dots, two decimals, every wheel present (an omitted wheel is written neutral).
function format(wheels) {
  const f = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
  return WHEELS.map((w) => { const v = { ...NEUTRAL, ...(wheels[w] || {}) }; return NAME[w] + ":" + f(v.hue) + "," + f(clamp(v.sat, 0, 1)) + "," + f(clamp(v.luma, 0, 1)); }).join(";");
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));

// Cast at a wheel's end of the parade: (B - R, G - (R + B) / 2), the two axes the parade shows. Read
// from PAIRED pixels when the measurement carries the bands (scopes.cjs: blacks = the darkest 3% of
// pixels, whites = the brightest 3%, midtones = the 30-65 level band) - the parade's bottoms and tops
// as pixels. Three separately taken channel percentiles are the fallback for older measurements; once a
// tonal knob puts one channel on the floor they stop being the same pixels, which is how the 20:05 run
// read a warm bottom getting warmer after a correct pad.
const BAND = { shadows: "blacks", midtones: "midtones", highlights: "whites" };
const END = { shadows: "P1", midtones: "P50", highlights: "P99" };
function castAt(m, wheel) {
  const f = m.frame || m;
  const b = f.bands && f.bands[BAND[wheel]];
  if (b && b.rb !== null && b.rb !== undefined) return [b.rb, b.g];
  if (wheel === "midtones") { // no per-channel median in the measurement: use the means
    return [f.blue.mean - f.red.mean, f.green.mean - (f.red.mean + f.blue.mean) / 2];
  }
  const k = wheel === "shadows" ? "p1" : "p99";
  return [f.blue[k] - f.red[k], f.green[k] - (f.red[k] + f.blue[k]) / 2];
}

// 2x2 response of a wheel's pad on its cast, fitted by least squares from a sweep's four hues. Fitted
// on the band statistic (the 21:00 sweep, `wheelBands`) when that sweep has the wheel; the channel-end
// statistic from the older sweep otherwise (Midtones).
const BANDS_SWEEP = require("./lumetri_sweeps.json").wheelBands;
function castMatrix(wheel) {
  const banded = BANDS_SWEEP && BANDS_SWEEP[wheel];
  const n = banded ? BANDS_SWEEP.neutral : SWEEPS.neutral, end = END[wheel], key = BAND[wheel];
  const rows = (banded ? BANDS_SWEEP[wheel] : SWEEPS[wheel]).filter((p) => p.sat > 0);
  const castOf = banded ? (r) => [r[key + "RB"], r[key + "G"]] : (r) => [r["blue" + end] - r["red" + end], r["green" + end] - (r["red" + end] + r["blue" + end]) / 2];
  const [nb, ng] = castOf(n);
  // Solve d = [a b; c d] * [x y] for each row; with four rows use normal equations on x and y.
  let sxx = 0, sxy = 0, syy = 0, sxb = 0, syb = 0, sxg = 0, syg = 0;
  for (const p of rows) {
    const x = p.sat * Math.cos(p.hue * Math.PI / 180), y = p.sat * Math.sin(p.hue * Math.PI / 180);
    const [cb, cg] = castOf(p);
    const db = cb - nb, dg = cg - ng;
    sxx += x * x; sxy += x * y; syy += y * y; sxb += x * db; syb += y * db; sxg += x * dg; syg += y * dg;
  }
  const det = sxx * syy - sxy * sxy;
  return [[(syy * sxb - sxy * syb) / det, (sxx * syb - sxy * sxb) / det],   // d(B-R)/dx, d(B-R)/dy
          [(syy * sxg - sxy * syg) / det, (sxx * syg - sxy * sxg) / det]];  // dG/dx, dG/dy
}

// The pad offset that changes the cast by `delta` (a 2-vector), as {hue, sat}. Capped: a balance is
// a small move, and the model is linear only near the centre.
function solveCast(wheel, delta, maxSat = MAX_SAT) {
  const [[a, b], [c, d]] = castMatrix(wheel);
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return null;
  const x = (d * delta[0] - b * delta[1]) / det, y = (a * delta[1] - c * delta[0]) / det;
  const sat = Math.hypot(x, y);
  let hue = Math.atan2(y, x) * 180 / Math.PI; if (hue < 0) hue += 360;
  return { hue, sat: Math.min(maxSat, sat), capped: sat > maxSat };
}

// Luma slider. The canon's names are exact: Shadows luma is a LIFT (it adds - the sweep's black point
// moves 2 -> 17.3 across 0.3..0.7, a straight line), Highlights luma is a GAIN (it multiplies - the
// white point reads x0.90 at 0.3 and x1.10 at 0.7 of its neutral value, so a dark shot gets less lift
// from the same luma), Midtones is a gamma and is treated as a gain on the median. Getting this wrong
// was the first live run's "white point 80, low" on every dark shot.
const GAIN = { shadows: false, midtones: true, highlights: true };
function lumaSlope(wheel, key) {
  const rows = SWEEPS[wheel].filter((p) => p.sat === 0);
  const base = SWEEPS.neutral[key];
  const xs = rows.map((p) => p.luma), ys = rows.map((p) => (GAIN[wheel] ? p[key] / base : p[key]));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
  return num / den; // units: statistic per luma (lift) or ratio per luma (gain)
}
// The luma value that takes `key` (p1 / p50 / p99) from `current` to `target`, starting at `from`.
function solveLuma(wheel, key, current, target, from = 0.5) {
  const s = lumaSlope(wheel, key);
  if (!(Math.abs(s) > 1e-9) || !(current > 0)) return null;
  const want = GAIN[wheel] ? (target / current - 1) / s : (target - current) / s; // luma delta from centre
  const raw = from + want;
  const luma = clamp(raw, 0, 1);
  return { luma, capped: raw !== luma, slope: s, gain: GAIN[wheel] };
}
// After a confirm: correct a luma move from what it actually did. Two real readings give the true
// local response of THIS shot; one more write lands it.
function nudgeLuma(wheel, key, before, after, target, fromLuma, appliedLuma) {
  const moved = GAIN[wheel] ? after / before - 1 : after - before;
  const per = moved / (appliedLuma - fromLuma);
  if (!isFinite(per) || Math.abs(per) < 1e-6) return null;
  const want = GAIN[wheel] ? (target / after - 1) / per : (target - after) / per;
  const raw = appliedLuma + want;
  return { luma: clamp(raw, 0, 1), capped: raw !== clamp(raw, 0, 1) };
}
// After a confirm: correct a pad move from what it actually did, DIRECTION included. `before` is the
// pad the move started from, `applied` the pad written; c0 the cast the move was solved against, c1 the
// cast after it, so d = c1 - c0 is the move's observed effect. The share of the move that would have
// landed on neutral is t = -(c0 . d) / (d . d), least squares along the observed response: t < 1 means
// it overshot, t > 1 it fell short. The previous version compared magnitudes only, so a cast that
// CROSSED neutral (-10 -> +5) read as "half removed" and the pad was doubled - the warm-to-blue flip
// on eight clips of the 2026-09-15 18:03 run. Scales the delta the move made, not the whole pad.
// null = leave it: the move did nothing measurable, went the wrong way, or rounds to the same write.
function nudgePad(before, applied, c0, c1, maxSat = MAX_SAT) {
  const d = [c1[0] - c0[0], c1[1] - c0[1]];
  const dd = d[0] * d[0] + d[1] * d[1];
  if (dd < 1e-6) return null;
  const t = -(c0[0] * d[0] + c0[1] * d[1]) / dd;
  if (!(t > 0) || t > 3) return null;
  const b = vec(before), a = vec(applied);
  const next = [b[0] + t * (a[0] - b[0]), b[1] + t * (a[1] - b[1])];
  const sat = Math.hypot(next[0], next[1]);
  let hue = Math.atan2(next[1], next[0]) * 180 / Math.PI; if (hue < 0) hue += 360;
  const out = { hue, sat: Math.min(maxSat, sat), capped: sat > maxSat, t };
  return same(out, applied) ? null : out;
}
const vec = (p) => [(p.sat || 0) * Math.cos((p.hue || 0) * Math.PI / 180), (p.sat || 0) * Math.sin((p.hue || 0) * Math.PI / 180)];
const same = (p, q) => { const a = vec(p), b = vec(q); return Math.abs(a[0] - b[0]) < 0.005 && Math.abs(a[1] - b[1]) < 0.005; }; // QE takes two decimals

// What the pads are expected to do to the parade's ends, by the same linear model the solve inverts:
// the per-channel p1 (Shadows) and p99 (Highlights) move so that B-R and G-(R+B)/2 change by matrix x
// pad delta, luma untouched. Enough to solve the tonal sliders on the state after the pads without a
// render in between; the confirm is what says whether it held.
function predictPads(m, wheels, current = null) {
  const out = JSON.parse(JSON.stringify(m));
  const apply = (f) => {
    for (const wheel of Object.keys(wheels)) {
      if (wheel === "midtones") continue;
      const k = wheel === "shadows" ? "p1" : "p99";
      const from = vec((current && current[wheel]) || NEUTRAL), to = vec(wheels[wheel]);
      const [[a, b], [c, d]] = castMatrix(wheel);
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const dBR = a * dx + b * dy, dG = c * dx + d * dy;
      f.blue[k] += dBR / 2; f.red[k] -= dBR / 2; f.green[k] += dG;
      const band = f.bands && f.bands[BAND[wheel]];
      if (band && band.rb !== null && band.rb !== undefined) { band.rb += dBR; band.g += dG; }
    }
  };
  apply(out);
  if (out.frame) apply(out.frame);
  return out;
}

module.exports = { WHEELS, NAME, NEUTRAL, GAIN, MAX_SAT, parse, format, castAt, castMatrix, solveCast, lumaSlope, solveLuma, nudgeLuma, nudgePad, predictPads };
