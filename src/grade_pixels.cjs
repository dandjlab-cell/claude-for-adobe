// Pixel choice shared by Basic sliders and curves (2026-09-18). The sweep's FORMS are the authority;
// no calibration percentile participates. Rebuild each candidate from the source in Lumetri order:
// adding a Basic move to an already baked curve buffer models a different, unshipped effect stack.
"use strict";
const { pipeline, newlyRailed } = require("./forward.cjs");
const { measure } = require("./scopes.cjs");

const NOISE = 0.4; // IRE: the 8-bit/adjacent-frame floor recorded in color-full-table-plan.md §0.
const GRID = 16, REFINE = 8, PASSES = 2, CENTERS = 3; // 17 coarse + 2×3×9 refined + current: at most 72 full evaluations.
const serial = (v) => Math.round(v * 100) / 100; // Basic writes and curves.format both serialize two decimals.
const bin = (v) => Math.max(0, Math.ceil(v / NOISE - 1e-9));
const compare = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

function context(pixels) {
  if (!pixels) return null;
  if (Buffer.isBuffer(pixels) || pixels instanceof Uint8Array) {
    if (!pixels.length || pixels.length % 3) throw new Error("pixel sample must be packed RGB");
    return { source: pixels, operations: [], baseline: measure(pixels) };
  }
  if (!pixels.source || !pixels.source.length || pixels.source.length % 3 || !Array.isArray(pixels.operations)) throw new Error("invalid pixel context");
  return pixels.baseline ? pixels : { ...pixels, baseline: measure(pixels.source) };
}

// A frame sample contains no information about which pixels belonged to the face/subject crop.
// Preserve that reading, including its skin chroma; replacing its median with the room's is a lie.
function stateFor(reading, frame) {
  return reading.frame ? { ...reading, frame: { ...reading.frame, ...frame } } : { ...reading, ...frame };
}
function readingFor(pixels, reading) {
  const p = context(pixels);
  return stateFor(reading, p.operations.length ? measure(pipeline(p.source, [p.operations])) : p.baseline);
}
function replace(pixels, op, value, extra) {
  const same = ([name, , ch]) => name === op && ch === extra ||
    (/^channel(Toe|Lift)$/.test(op) && /^channel(Toe|Lift)$/.test(name) && ch === extra) ||
    (/^masterToe/.test(op) && /^masterToe/.test(name));
  return { ...pixels, operations: [...pixels.operations.filter((p) => !same(p)), ...(value === 0 ? [] : [[op, value, extra]])] };
}

// Every prefix is checked, with a persistent witness of rail events: a later lift cannot conceal an
// earlier crush. Aggregate shares and source-interior destruction are separate constraints (Astra,
// 2026-09-18); a source with many dead channels must not license killing its few surviving samples.
function evaluate(pixels, reading, allow) {
  const highWitness = Buffer.from(pixels.source), lowWitness = Buffer.from(pixels.source);
  let clipped = 0, floored = 0, crushed = 0;
  const inspect = (buf) => {
    const high = [0, 0, 0], low = [0, 0, 0]; let dark = 0;
    for (let i = 0; i < buf.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        const v = buf[i + c];
        if (v === 0) low[c]++; if (v === 255) high[c]++;
        if (v === 0) lowWitness[i + c] = 0;
        if (v === 255) highWitness[i + c] = 255;
      }
      if (Math.round(buf[i] * 0.2126 + buf[i + 1] * 0.7152 + buf[i + 2] * 0.0722) <= 1) dark++;
    }
    const pct = 300 / buf.length; // counts are per pixel; RGB24 has three bytes per pixel.
    clipped = Math.max(clipped, Math.max(...high) * pct);
    floored = Math.max(floored, Math.max(...low) * pct);
    crushed = Math.max(crushed, dark * pct);
  };
  const rgb = pipeline(pixels.source, [pixels.operations], inspect);
  if (!pixels.operations.length) inspect(rgb);
  const rails = { high: newlyRailed(pixels.source, highWitness).high, low: newlyRailed(pixels.source, lowWitness).low };
  const reasons = [];
  if (rails.high > allow.clipped || rails.low > allow.crushed) reasons.push("newly railed " + serial(rails.high) + "% high / " + serial(rails.low) + "% low");
  if (clipped > allow.clipped) reasons.push("clip " + serial(clipped) + "% > " + serial(allow.clipped) + "%");
  // damage() intentionally ignores small object-channel floors. Compare the unconditional pixel floor
  // to its OWN source baseline (+0.2% is allowance's existing resampling margin), so an untouched blue
  // object with 2.8% red at zero is feasible. This does not enlarge the newly-railed budget above.
  const floorLimit = Math.max(allow.crushed, Math.max(...Object.values(pixels.baseline.floor)) + 0.2);
  if (floored > floorLimit) reasons.push("channel floor " + serial(floored) + "% > " + serial(floorLimit) + "%");
  if (crushed > allow.crushed) reasons.push("luma crush " + serial(crushed) + "% > " + serial(allow.crushed) + "%");
  let displacement = 0;
  for (let i = 0; i < rgb.length; i++) displacement += Math.abs(rgb[i] - pixels.source[i]);
  return { rgb, state: stateFor(reading, measure(rgb)), reasons, distortion: displacement / rgb.length * 100 / 255 };
}

function choose({ pixels, reading, op, extra, range, from = 0, target, readStat, allow, constraint = () => null, score = null, discrete = false, rangeNote = "range/serialization limit" }) {
  const p = context(pixels);
  if (!p || !Number.isFinite(target) || !Number.isFinite(from) || range.some((v) => !Number.isFinite(v)) || range[0] > range[1]) throw new Error("invalid pixel choice");
  // Bounds round INWARD. Rounding a toe up past its floor cap undoes the cap at the writer.
  const lo = Math.ceil(range[0] * 100 - 1e-9) / 100, hi = Math.floor(range[1] * 100 + 1e-9) / 100;
  const seen = new Map(); let best = null, closest = null;
  const at = (raw) => {
    const value = serial(Math.max(lo, Math.min(hi, raw)));
    if (seen.has(value)) return seen.get(value);
    const next = replace(p, op, value, extra), e = evaluate(next, reading, allow);
    const stat = readStat(e.state), error = Math.abs(stat - target), held = constraint(e.state, value);
    if (held) e.reasons.push(held);
    if (!Number.isFinite(stat)) e.reasons.push("unreadable target statistic");
    const rank = score ? score(e.state, e.distortion) : [bin(error - NOISE), bin(e.distortion)];
    const r = { value, stat, error, ...e, pixels: next, rank: [...rank, Math.abs(value - from), value] };
    seen.set(value, r);
    if (!closest || error < closest.error) closest = r;
    if (!r.reasons.length && (!best || compare(r.rank, best.rank) < 0)) best = r;
    return r;
  };
  const start = at(from);
  if (discrete) {
    // Curves have at most 51 writable amounts (existing lift cap .5), so enumerate the actual writes.
    for (let v = Math.round(lo * 100); v <= Math.round(hi * 100); v++) at(v / 100);
  } else {
    for (let i = 0; i <= GRID; i++) at(lo + (hi - lo) * i / GRID);
    let step = (hi - lo) / GRID;
    for (let pass = 0; pass < PASSES; pass++) {
      // Quantized statistics are not convex. Objective-only centers missed Tint +5 between worse
      // +3.13/+6.25 trials (2026-09-18 regression). Refine the nearest TARGET as well as two objective
      // basins: a coarse collateral-violation bin must not hide the bracket containing a neutral cast.
      const feasible = [...seen.values()].filter((r) => !r.reasons.length);
      const nearest = feasible.slice().sort((a, b) => a.error - b.error || compare(a.rank, b.rank))[0];
      const centers = nearest ? [nearest.value] : [];
      for (const r of feasible.sort((a, b) => compare(a.rank, b.rank))) {
        if (centers.every((c) => Math.abs(c - r.value) >= step - 1e-9)) centers.push(r.value);
        if (centers.length === CENTERS) break;
      }
      for (let k = 0; k < CENTERS; k++) {
        const center = centers[k] === undefined ? (best || start).value : centers[k];
        const a = Math.max(lo, center - step), b = Math.min(hi, center + step);
        for (let i = 0; i <= REFINE; i++) at(a + (b - a) * i / REFINE);
      }
      step *= 2 / REFINE;
    }
  }
  const chosen = best || start;
  const residual = serial(chosen.stat - target);
  let reason = null;
  if (!best) reason = "no certified candidate: " + start.reasons.join(", ");
  else if (chosen.error > NOISE + 1e-9) {
    reason = closest.reasons.length ? "held by the pixels: " + closest.reasons.join(", ")
      : closest.error + NOISE < chosen.error ? "acceptance objective (competing frame criteria)" : rangeNote;
  }
  return { ...chosen, residual, evaluations: seen.size, feasible: !!best, reason,
    note: "pixels " + chosen.value + " → " + serial(chosen.stat) + " (target " + target + ", residual " + residual + ")" + (reason ? "; " + reason : "") };
}

module.exports = { choose, context, readingFor, stateFor, evaluate, replace, serial, bin, NOISE };
