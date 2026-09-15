// The internal scopes: predict what a Lumetri knob will do to a shot's parade and waveform, without
// rendering. The calibration sweeps (src/lumetri_sweeps.json: Exposure, Contrast, Temperature, each set
// to seven values on one BRAW frame with the scopes measured after every set) say how each statistic
// moved on that clip. Transferred to the clip in hand - as a ratio for statistics that scale, as an
// offset for ones that cross zero - they predict the shot's numbers after a change. So a grade is: one
// render to read the scopes, this model to choose every knob, the writes, and one render to confirm.
//
// Honest limits: the sweeps were measured one knob at a time from zero, so knobs applied together are
// composed sequentially and interactions are approximate; Premiere's tone mapping depends on content,
// so highlights predicted near 100 are less reliable than midtones. That is what the confirm render is
// for, and why the residual is always reported rather than hidden behind another attempt.
"use strict";
const { solveFor, clean, pickSpace, LOG } = require("./grade_solve.cjs");
const SWEEPS = require("./lumetri_sweeps.json");

// Every number a measurement carries that the model tracks, and how to read it from a sweep row.
const TRACKED = {
  "luma.p1": (r, i) => r.p1[i], "luma.p50": (r, i) => r.p50[i], "luma.p99": (r, i) => r.p99[i],
  "luma.min": (r, i) => r.min[i], "luma.max": (r, i) => r.max[i],
  "red.mean": (r, i) => r.red[i], "green.mean": (r, i) => r.green[i], "blue.mean": (r, i) => r.blue[i],
  "red.p1": (r, i) => r.redP1[i], "green.p1": (r, i) => r.greenP1[i], "blue.p1": (r, i) => r.blueP1[i],
  "red.p99": (r, i) => r.redP99[i], "green.p99": (r, i) => r.greenP99[i], "blue.p99": (r, i) => r.blueP99[i],
  "saturation.p50": (r, i) => r.sat[i], "cast.cb": (r, i) => r.cb[i], "cast.cr": (r, i) => r.cr[i],
};
const get = (m, key) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), m);
const set = (m, key, v) => { const ks = key.split("."); let o = m; for (const k of ks.slice(0, -1)) o = o[k] = o[k] || {}; o[ks[ks.length - 1]] = v; };

// The calibration clip's reading of one statistic at one knob value (piecewise-linear between sweeps).
function calib(param, key, value) {
  const s = SWEEPS[param];
  if (!s || !TRACKED[key]) return null;
  const xs = s.values;
  if (value <= xs[0]) return TRACKED[key](s, 0);
  if (value >= xs[xs.length - 1]) return TRACKED[key](s, xs.length - 1);
  const i = xs.findIndex((x) => x > value) - 1;
  const a = TRACKED[key](s, i), b = TRACKED[key](s, i + 1);
  return a + (b - a) * (value - xs[i]) / (xs[i + 1] - xs[i]);
}
const RANGE = (param) => { const xs = SWEEPS[param].values; return [xs[0], xs[xs.length - 1]]; };
const scales = (param, key) => pickSpace(clean(SWEEPS[param].values.map((v, i) => ({ value: v, stat: TRACKED[key](SWEEPS[param], i) })))) === LOG;

// Predict the whole measurement after `param` moves from -> to. Statistics that scale (luma, channel
// levels, saturation) transfer as a ratio; ones that cross zero (cast) as an offset.
function predict(m, param, from, to) {
  if (!SWEEPS[param]) return m; // no calibration: no prediction, the caller renders instead
  const out = JSON.parse(JSON.stringify(m));
  const move = (src, dst) => {
    for (const key of Object.keys(TRACKED)) {
      const cur = get(src, key);
      if (!isFinite(cur)) continue;
      const a = calib(param, key, from), b = calib(param, key, to);
      if (a === null || b === null) continue;
      const next = (scales(param, key) && a > 0 && cur > 0) ? cur * (b / a) : cur + (b - a);
      set(dst, key, Math.max(-50, Math.min(100, next)));
    }
  };
  move(m, out);
  // A region reading carries the whole frame alongside it, and the frame is what white balance and the
  // clipping guard read. It moves with the knob too - the first live run predicted the subject only,
  // so the frame's whites stayed flat in the model, never crossed zero, and every temperature went to
  // the end of its range.
  if (m.frame) { out.frame = JSON.parse(JSON.stringify(m.frame)); move(m.frame, out.frame); }
  // The casts by band (paired pixels) were not in these sweeps: move them by what the same knob did to
  // the channel ends, so a white balance the model predicts is not cancelled again by the pads that
  // read the bands next.
  coupleBands(m, out); if (m.frame) coupleBands(m.frame, out.frame);
  return out;
}

function coupleBands(before, after) {
  if (!before.bands || !after.bands) return;
  const pairs = [["blacks", "p1"], ["whites", "p99"], ["shadows", "p1"], ["highlights", "p99"], ["midtones", "mean"]];
  for (const [band, k] of pairs) {
    const b = after.bands[band];
    if (!b || b.rb === null || b.rb === undefined) continue;
    const dRB = (after.blue[k] - after.red[k]) - (before.blue[k] - before.red[k]);
    const dG = (after.green[k] - (after.red[k] + after.blue[k]) / 2) - (before.green[k] - (before.red[k] + before.blue[k]) / 2);
    b.rb = Math.round((b.rb + dRB) * 10) / 10; b.g = Math.round((b.g + dG) * 10) / 10;
  }
}

// The knob value that should bring `readStat(m)` to `target`, from the current value, by this model.
// Returns null when there is no calibration for the knob, or the target is beyond the swept range.
function solveKnob(m, param, from, readStat, target) {
  if (!SWEEPS[param]) return null;
  const [lo, hi] = RANGE(param);
  const curve = [];
  for (let k = 0; k <= 40; k++) {
    const v = lo + (hi - lo) * k / 40;
    curve.push({ value: v, stat: readStat(predict(m, param, from, v)) });
  }
  const r = solveFor(curve, target);
  if (!r) return null;
  const value = Math.max(lo, Math.min(hi, r.value));
  // Not bracketed: the knob cannot reach the target inside its calibrated range. The end of the range
  // is still the best it can do IF it moves the right way; the caller decides whether to take a
  // partial move, and must not mistake it for a hit.
  const now = readStat(m), atEnd = readStat(predict(m, param, from, value));
  const helps = Math.abs(atEnd - target) < Math.abs(now - target);
  return { value, bracketed: r.bracketed, reliable: r.reliable !== false, partial: !r.bracketed, helps, predicted: atEnd };
}

module.exports = { predict, solveKnob, calib, RANGE, TRACKED, SWEEPS };
