// Silence planning across all audio tracks. Pure Node; peak windows come from pek.cjs.
// A range is cut only where at least one audio clip covers it and no audio clip is loud there.

const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -100);

function peakThreshold(dbs) {
  const sorted = [...dbs].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -60;
  return Math.max(-60, Math.min(-30, floor + 8));
}

// Loud intervals (timeline seconds) of one clip from its peak windows. Peak detection is click-prone,
// so loud runs shorter than minLoud (a lone transient) do not count as sound.
const MIN_LOUD_S = 0.15;
function loudIntervals(windows, windowSeconds, thresholdDb, minLoud = MIN_LOUD_S) {
  const dbs = windows.map((w) => toDb(w.peak));
  const thr = Number.isFinite(thresholdDb) ? thresholdDb : peakThreshold(dbs);
  const out = [];
  windows.forEach((w, i) => {
    if (dbs[i] < thr) return;
    const last = out[out.length - 1];
    if (last && w.t - last.end < windowSeconds * 0.5 + 1e-6) last.end = w.t + windowSeconds; else out.push({ start: w.t, end: w.t + windowSeconds });
  });
  return out.filter((r) => r.end - r.start >= minLoud - 1e-6);
}

function union(intervals) {
  const s = [...intervals].sort((a, b) => a.start - b.start);
  const out = [];
  s.forEach((x) => { const last = out[out.length - 1]; if (last && x.start <= last.end + 1e-6) last.end = Math.max(last.end, x.end); else out.push({ start: x.start, end: x.end }); });
  return out;
}

// coverage: union of audio clip spans; loud: union of loud intervals. Returns silences = coverage minus loud.
function silencesFrom(coverage, loud, rangeStart, rangeEnd) {
  const cov = union(coverage.map((c) => ({ start: Math.max(rangeStart, c.start), end: Math.min(rangeEnd, c.end) })).filter((c) => c.end > c.start));
  const l = union(loud);
  const out = [];
  cov.forEach((c) => {
    let cursor = c.start;
    l.forEach((x) => {
      if (x.end <= cursor || x.start >= c.end) return;
      if (x.start > cursor) out.push({ start: cursor, end: x.start });
      cursor = Math.max(cursor, x.end);
    });
    if (cursor < c.end) out.push({ start: cursor, end: c.end });
  });
  return out;
}

// Keep pad seconds of room tone on each side, drop anything shorter than minLen after padding, and
// absorb kept islands shorter than minKeep between two cuts (a blip is not worth a clip). Descending order.
const MIN_KEEP_S = 0.4;
// No padding against the range edges (sequence head/tail): silence that touches the edge is removed whole.
function planCuts(silences, { minLen = 1.0, pad = 0.2, minKeep = MIN_KEEP_S, rangeStart = -Infinity, rangeEnd = Infinity } = {}) {
  const eps = 1e-3;
  // The minimum applies to the real silence, before padding: a 0.4 s gap with 0.05 s pad is cut to 0.1 s of air,
  // not kept whole. (Previously min was checked after padding, which silently raised it by 2 x pad.)
  const padded = silences.filter((s) => s.end - s.start >= minLen).map((s) => ({ start: s.start <= rangeStart + eps ? s.start : s.start + pad, end: s.end >= rangeEnd - eps ? s.end : s.end - pad })).filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const merged = [];
  padded.forEach((s) => { const last = merged[merged.length - 1]; if (last && s.start - last.end < minKeep) last.end = s.end; else merged.push({ ...s }); });
  return merged.filter((s) => s.end > s.start).sort((a, b) => b.start - a.start);
}

module.exports = { MIN_KEEP_S, MIN_LOUD_S, loudIntervals, peakThreshold, planCuts, silencesFrom, union };
