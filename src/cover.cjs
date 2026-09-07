// How much of the picture on one track is hidden at a moment, from what the panel already reads for every clip:
// Motion position and scale, source size, opacity, and whether a still has an alpha channel. Geometry, not frames.
// A side-by-side covers half; a picture-in-picture covers a corner; a full-frame PNG with no alpha covers all;
// a title, MOGRT, AE comp or alpha still covers nothing (it is drawn over the picture, not instead of it).
// Masks, track mattes and blend modes are not modelled: those are the residual the frame renders exist for.
"use strict";
const { roiInFrame } = require("./frame.cjs");

const trackNo = (t) => Number(String(t).slice(1)) || 0;

// Rectangle (frame fractions, clipped to the frame) that a clip's source occupies, or null when unknown.
function clipRect(c, frameW, frameH) {
  if (!c.srcW || !c.srcH || c.x === null || c.x === undefined || !Number.isFinite(c.scale)) return null;
  const r = roiInFrame({ srcW: c.srcW, srcH: c.srcH, frameW, frameH, x: c.x, y: c.y, scale: c.scale }, { x0: 0, y0: 0, x1: c.srcW, y1: c.srcH });
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

// Does this clip hide what is under it? Footage yes; a still only without alpha; graphics never.
function isOpaque(c, hasAlpha) {
  if (c.opacity !== undefined && c.opacity < 50) return false;
  if (!c.mediaPath) return false;                                   // adjustment layer, title, synthetic
  if (/\.(mogrt|aep|ai|svg|psd)$/i.test(c.mediaPath)) return false; // drawn over the picture
  if (/\.(png|gif|tiff?|webp)$/i.test(c.mediaPath)) return hasAlpha ? !hasAlpha(c.mediaPath) : false;
  return true;
}

// Cover of `track` at time t: { covered: 0..1, by: [{ track, name, share }] } from the clips on higher tracks.
// `transforms` is readTransforms().rows; hasAlpha(path) -> boolean is optional and cached by the caller.
function coverAt(transforms, frameW, frameH, track, t, hasAlpha) {
  const above = transforms.filter((c) => trackNo(c.track) > trackNo(track) && c.start <= t && t < c.end && isOpaque(c, hasAlpha));
  const rects = above.map((c) => ({ c, r: clipRect(c, frameW, frameH) || { x0: 0, y0: 0, x1: 1, y1: 1 } })); // unknown geometry: assume full frame (footage fills by default)
  const covered = coverage(rects.map((x) => x.r));
  return { covered, by: rects.map((x) => ({ track: x.c.track, name: x.c.name, share: coverage([x.r]) })) };
}

module.exports = { clipRect, coverage, isOpaque, coverAt };
