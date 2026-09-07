// How much of the picture on one track is hidden at a moment, from what the panel already reads for every clip:
// Motion position and scale, the Crop effect, source size, opacity, and whether a still has an alpha channel
// (Premiere's own Video Info flag). Geometry, not frames.
// A side-by-side covers half; a picture-in-picture covers a corner; a full-frame PNG with no alpha covers all;
// a title, MOGRT, AE comp or alpha still covers nothing (it is drawn over the picture, not instead of it).
// Masks, track mattes, blend modes and the Transform effect's own position/scale are not modelled: that residual
// is what the frame renders exist for.
"use strict";
const { roiInFrame } = require("./frame.cjs");

const trackNo = (t) => Number(String(t).slice(1)) || 0;

// Rectangle (frame fractions, clipped to the frame) that a clip's source occupies, or null when unknown.
function clipRect(c, frameW, frameH) {
  if (!c.srcW || !c.srcH || c.x === null || c.x === undefined || !Number.isFinite(c.scale)) return null;
  // The Crop effect removes a percentage from each edge of the SOURCE before Motion places it.
  const cr = c.crop || { left: 0, top: 0, right: 0, bottom: 0 };
  const roi = { x0: c.srcW * cr.left / 100, y0: c.srcH * cr.top / 100, x1: c.srcW * (1 - cr.right / 100), y1: c.srcH * (1 - cr.bottom / 100) };
  if (roi.x1 <= roi.x0 || roi.y1 <= roi.y0) return null;
  const r = roiInFrame({ srcW: c.srcW, srcH: c.srcH, frameW, frameH, x: c.x, y: c.y, scale: c.scale }, roi);
  const x0 = Math.max(0, Math.min(1, r.x0)), y0 = Math.max(0, Math.min(1, r.y0)), x1 = Math.max(0, Math.min(1, r.x1)), y1 = Math.max(0, Math.min(1, r.y1));
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

// Fraction of the frame covered by the union of rectangles (grid sample; 40x40 is within 1% and instant).
function coverage(rects, n = 40) {
  if (!rects.length) return 0;
  let hit = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = (i + 0.5) / n, y = (j + 0.5) / n;
    if (rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) hit++;
  }
  return hit / (n * n);
}

// What a clip does to the picture under it. "opaque": footage, or a still without alpha, hides its rectangle.
// "alpha": AE comps, MOGRTs, PSD/AI/SVG, alpha stills: they carry transparency, so their rectangle MAY hide the
// picture (a full-frame comp) or may not (a lower third); geometry cannot tell, only a render can. "none": an
// adjustment layer, a title, a synthetic item, or opacity under 50%.
function coverKind(c, hasAlpha) {
  if (c.opacity !== undefined && c.opacity < 50) return "none";
  if (!c.mediaPath) return "none";
  if (/\.(mogrt|aep|ai|svg|psd)$/i.test(c.mediaPath)) return "alpha";
  if (/\.(png|gif|tiff?|webp)$/i.test(c.mediaPath)) return hasAlpha ? (hasAlpha(c.mediaPath) ? "alpha" : "opaque") : "alpha";
  return hasAlpha && hasAlpha(c.mediaPath) ? "alpha" : "opaque";
}
function isOpaque(c, hasAlpha) { return coverKind(c, hasAlpha) === "opaque"; }

// Cover of `track` at time t from the clips on higher tracks: { covered, possiblyCovered, by }.
// covered: fraction hidden by opaque clips for certain. possiblyCovered: with the alpha clips counted too,
// the ceiling. `by` lists every clip with its share and kind so the caller can name what to render to settle it.
function coverAt(transforms, frameW, frameH, track, t, hasAlpha) {
  const above = transforms.filter((c) => trackNo(c.track) > trackNo(track) && c.start <= t && t < c.end).map((c) => ({ c, kind: coverKind(c, hasAlpha) })).filter((x) => x.kind !== "none");
  const rects = above.map((x) => ({ ...x, r: clipRect(x.c, frameW, frameH) || { x0: 0, y0: 0, x1: 1, y1: 1 } })); // unknown geometry: assume full frame
  const covered = coverage(rects.filter((x) => x.kind === "opaque").map((x) => x.r));
  const possiblyCovered = coverage(rects.map((x) => x.r));
  return { covered, possiblyCovered, by: rects.map((x) => ({ track: x.c.track, name: x.c.name, share: coverage([x.r]), kind: x.kind, masked: !!x.c.masked })) };
}

module.exports = { clipRect, coverage, isOpaque, coverKind, coverAt };
