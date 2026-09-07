// The visibility ledger: evidence about what the viewer sees, computed once per timeline state from Premiere's
// own clip data and kept next to the project, so every decision starts from a lookup instead of a fresh read.
// Built from clip_transforms rows (Motion, Crop, Opacity, source size, Alpha, masks) and the sequence frame.
"use strict";
const { coverAt, clipRect } = require("./cover.cjs");

// Per clip: where it sits and how much of the frame it occupies. Per cut: how hidden it is on either side.
// Per half second: the base track's cover, so "is V1 visible at t" is a lookup.
function buildLedger(snap, transforms, { base = "V1", step = 0.5, half = 0.25 } = {}) {
  const rows = transforms.rows, W = transforms.w, H = transforms.h;
  const hasAlpha = (p) => !!rows.find((c) => c.mediaPath === p && c.alpha);
  // A clip whose geometry cannot be read (AE comps and MOGRTs report no source size) is assumed to fill the frame:
  // that is the conservative reading, and the renderer settles it.
  const clips = rows.map((c) => { const r = clipRect(c, W, H); const known = !!r; const rr = r || { x0: 0, y0: 0, x1: 1, y1: 1 }; return { track: c.track, name: c.name, mediaPath: c.mediaPath || "", start: c.start, end: c.end, rect: rr, geometryKnown: known, share: Number((((rr.x1 - rr.x0) * (rr.y1 - rr.y0))).toFixed(3)), opacity: c.opacity, crop: c.crop, alpha: c.alpha, masked: c.masked, graphic: c.graphic }; });
  // Every footage edge on every track is a cut worth grading (seams() only lists the ones that change the
  // picture in the binary model; here the fraction is the point).
  const edges = new Map();
  rows.filter((c) => !c.graphic).forEach((c) => { [c.start, c.end].forEach((t) => { const k = Number(t.toFixed(2)); if (k > 0 && k < snap.duration) edges.set(k, (edges.get(k) || []).concat(c.track + " " + c.name)); }); });
  const cuts = [...edges.keys()].sort((a, b) => a - b).map((t) => {
    const before = coverAt(rows, W, H, base, t - half, hasAlpha), after = coverAt(rows, W, H, base, t + half, hasAlpha);
    return { t, edges: edges.get(t), hiddenBefore: Number(before.covered.toFixed(2)), hiddenAfter: Number(after.covered.toFixed(2)), maybeBefore: Number(before.possiblyCovered.toFixed(2)), maybeAfter: Number(after.possiblyCovered.toFixed(2)), by: [...new Set(before.by.concat(after.by).map((b) => b.track + " " + b.name + " " + Math.round(b.share * 100) + "%" + (b.kind === "alpha" ? " (alpha: may or may not hide)" : "") + (b.masked ? " (masked)" : "")))] };
  });
  const timeline = [];
  for (let t = 0; t < snap.duration; t += step) { const c = coverAt(rows, W, H, base, t + step / 2, hasAlpha); timeline.push([Number(t.toFixed(2)), Number(c.covered.toFixed(2)), Number(c.possiblyCovered.toFixed(2))]); }
  return { sequence: snap.name, frame: [W, H], base, builtAt: new Date().toISOString(), clips, cuts, coverEvery: step, cover: timeline };
}

// "What does the viewer see at t": the base track's cover from the ledger, and who is over it.
function visibleAt(ledger, t) {
  const i = Math.min(ledger.cover.length - 1, Math.max(0, Math.floor(t / ledger.coverEvery)));
  const hidden = ledger.cover[i] ? ledger.cover[i][1] : 0, maybe = ledger.cover[i] ? (ledger.cover[i][2] === undefined ? hidden : ledger.cover[i][2]) : 0;
  const over = ledger.clips.filter((c) => c.track !== ledger.base && c.start <= t && t < c.end && c.share);
  return { hidden, maybe, baseVisible: 1 - hidden, over: over.map((c) => c.track + " \"" + c.name + "\" " + Math.round((c.share || 0) * 100) + "%" + (c.masked ? " masked" : "") + (c.alpha || c.graphic ? " (alpha: may or may not hide)" : "")) };
}

module.exports = { buildLedger, visibleAt };
