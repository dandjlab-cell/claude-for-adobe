// Skin as an HSL key: the ranges Lumetri's HSL Secondary wants (centre, inner half-width, outer
// half-width per axis, 0..1, outer >= inner - Round 253, 2026-09-16), learned from the pixels inside
// Vision's hand/face boxes, not picked with an eyedropper. A skin prior drops the ring, the cloth and
// the shirt that share a box with a hand; the percentiles of what is left set the plateau (10-90) and the
// feather (2-98). The check is the mask view: how much of the boxes lights up, how much outside them.
"use strict";

// HSL of one 8-bit pixel: hue 0..1 (0 = red, 0.5 = cyan), saturation and lightness 0..1.
function hsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255, max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

// Skin sits near red-orange: hue within SKIN_HUE of 0 (wrapping), neither grey nor neon, neither black nor white.
const PRIOR = { hueMax: 0.14, sat: [0.10, 0.75], light: [0.15, 0.85] };

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))];

// How a colourist actually builds a skin key (researched 2026-09-16 from Adobe's own Lumetri procedure,
// Resolve's qualifier guidance, Cullen Kelly via Frame.io, Cine Source, Larry Jordan):
//
//  - The eyedropper is a SEED, not the key. "Sampling will always leave you with an overly-narrow
//    selection" (Kelly). Our percentile key was that mistake with extra decimals: it caught the rims of
//    two hands and nothing else (the owner's mask, 14:50).
//  - Hue and saturation are the two axes that matter; brightness is "a distant third". Standard practice
//    is to key on hue, or hue and saturation, and leave LIGHTNESS FULLY OPEN.
//  - The hue range is deliberately wide, taking in the neighbouring yellows and magentas. No source
//    publishes a width; the skin line itself spans 116-126 deg across implementations, so +-25-30 deg is
//    the defensible machine default and narrowing is a response to contamination, not a starting point.
//  - Saturation is opened at the BOTTOM (pale skin is near grey) and bounded only at the top, which is
//    the one control that rejects a same-hue wall or a red sleeve.
//  - Refine (Denoise, Blur) comes BEFORE any correction: it is the documented fix for a chattering,
//    speckled key, and a loose blurred key beats a tight hard one, which bands.
// The mask against Vision's boxes: a key that lights far more of the frame than the boxes cover has taken
// the room (a kitchen's cream cabinets, 12:18). Some spill is an HSL key's nature - it is meant to be wide.
const spills = (coverage, boxShare) => coverage > 3 * boxShare + 0.10;

const HUE_INNER = 0.05, HUE_OUTER = 0.083;   // about +-18 deg plateau, +-30 deg feather
const SAT_FLOOR = 0.02, SAT_HEADROOM = 0.12; // open at the bottom, a little headroom over the skin found
const OPEN = [0.5, 0.5, 0.5];                // an axis that selects everything

// The circular median of hue values unwrapped around red.
function hueCentre(H) {
  const v = H.map((x) => (x > 0.5 ? x - 1 : x)).sort((a, b) => a - b);
  let c = pct(v, 0.5);
  return c < 0 ? c + 1 : c;
}

// rgb: packed RGB24; boxes: [{x0,y0,x1,y1}] as frame fractions (Vision's). Returns { key, text, pixels, share }
// or null when the boxes hold too few skin-like pixels to trust. `satCeiling` (0..1) narrows the one axis
// that rejects contamination; every other axis stays as wide as the method says.
function skinKeyFrom(rgb, width, height, boxes, { minPixels = 200, satCeiling = null } = {}) {
  const H = [], S = [], L = [];
  let inBoxes = 0;
  for (const b of boxes || []) {
    const x0 = Math.max(0, Math.floor(b.x0 * width)), x1 = Math.min(width, Math.ceil(b.x1 * width));
    const y0 = Math.max(0, Math.floor(b.y0 * height)), y1 = Math.min(height, Math.ceil(b.y1 * height));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 3, [h, s, l] = hsl(rgb[i], rgb[i + 1], rgb[i + 2]);
      inBoxes++;
      const hd = Math.min(h, 1 - h);
      if (hd > PRIOR.hueMax || s < PRIOR.sat[0] || s > PRIOR.sat[1] || l < PRIOR.light[0] || l > PRIOR.light[1]) continue;
      H.push(h); S.push(s); L.push(l);
    }
  }
  if (H.length < minPixels) return null;
  const sorted = S.slice().sort((a, b) => a - b);
  const hi = Math.min(1, satCeiling === null ? pct(sorted, 0.98) + SAT_HEADROOM : satCeiling);
  const lo = Math.min(SAT_FLOOR, hi - 0.05);
  const sInner = Math.max(0.01, (hi - lo) / 2 * 0.7);
  const key = {
    H: [Math.round(hueCentre(H) * 1000) / 1000, HUE_INNER, HUE_OUTER],
    S: [Math.round((lo + hi) / 2 * 1000) / 1000, Math.round(sInner * 1000) / 1000, Math.round((hi - lo) / 2 * 1000) / 1000],
    L: OPEN,
  };
  return { key, text: formatKey(key), pixels: H.length, share: Math.round((H.length / Math.max(1, inBoxes)) * 1000) / 10, satCeiling: Math.round(hi * 1000) / 1000 };
}

// The method's wide key is the START, not the answer: on a wooden table the oak shares skin's hue and
// saturation, and the wide key lit 98% of the frame (measured 15:10 on three sandbox frames). Adobe's own
// remedy is to narrow the range that is letting the room in, watching the mask - so that is what this does,
// with the mask computed rather than eyeballed. Each axis is narrowed a step at a time, always the step
// that costs the least skin for the most background removed, until the key is inside the spill rule or too
// little skin is left to correct (then the caller skips this clip). Lightness is narrowed only last: it is
// "a distant third" for skin, but on a bright table it is the one axis that separates.
function refineKey(key, skinPixels, framePixels, boxShare, { minKeep = 0.7, steps = 14 } = {}) {
  const shrink = { H: [0.004, 0.006], S: [0.02, 0.03], L: [0.05, 0.07] };
  let cur = { H: [...key.H], S: [...key.S], L: [...key.L] };
  const cover = (k, px) => keyCoverage(px, k, 1);
  let kept = cover(cur, skinPixels), lit = cover(cur, framePixels), narrowed = [];
  for (let step = 0; step < steps && spills(lit, boxShare); step++) {
    let best = null;
    for (const ax of ["H", "S", "L"]) {
      const [di, doo] = shrink[ax], next = { ...cur, [ax]: [cur[ax][0], Math.max(0.01, cur[ax][1] - di), Math.max(0.02, cur[ax][2] - doo)] };
      if (next[ax][2] <= 0.03) continue;
      const k2 = cover(next, skinPixels), l2 = cover(next, framePixels);
      if (k2 < minKeep) continue;
      const gain = (lit - l2) / Math.max(0.001, kept - k2 + 0.001); // background removed per skin lost
      if (!best || gain > best.gain) best = { ax, next, kept: k2, lit: l2, gain };
    }
    if (!best) break;
    cur = best.next; kept = best.kept; lit = best.lit;
    if (!narrowed.includes(best.ax)) narrowed.push(best.ax);
  }
  return { key: cur, text: formatKey(cur), keeps: Math.round(kept * 1000) / 10, lights: Math.round(lit * 1000) / 10, narrowed, ok: !spills(lit, boxShare) && kept >= minKeep };
}

// What share of a frame a key would light, by this file's HSL (inside every axis's outer range; the
// feather is ignored). Premiere's own mask lit 3-4% where this said 8% on the C227 frames (14:02):
// within the spill rule's margin, and it needs no render - the mask view reaches an export only on
// Premiere's own schedule. `step` subsamples pixels.
function keyCoverage(rgb, key, step = 4) {
  const inAx = (v, [c, , o], wrap) => { let d = Math.abs(v - c); if (wrap) d = Math.min(d, 1 - d); return d <= o; };
  let n = 0, lit = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3 * step) {
    n++;
    const [h, sat, l] = hsl(rgb[i], rgb[i + 1], rgb[i + 2]);
    if (inAx(h, key.H, true) && inAx(sat, key.S, false) && inAx(l, key.L, false)) lit++;
  }
  return n ? lit / n : 0;
}

// The QE text: "H:c,i,o;S:c,i,o;L:c,i,o", dots, two decimals.
function formatKey(key) {
  const f = (n) => Math.max(0, Math.min(1, n)).toFixed(2);
  return ["H", "S", "L"].map((k) => k + ":" + key[k].map(f).join(",")).join(";");
}
const EMPTY_KEY = "H:0.50,0.00,0.00;S:0.50,0.00,0.00;L:0.50,0.00,0.00";

// The mask view: unselected pixels are one flat grey (luma 72.2, R=G=B), selected pixels keep their colour.
// Keep only the selected ones as a packed buffer, so the scopes read the keyed pixels alone.
function keyedPixels(rgb) {
  const out = Buffer.alloc(rgb.length);
  let n = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    if (Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2 && r >= 180 && r <= 188) continue; // the mask grey (184 = 72.2%)
    out[n] = r; out[n + 1] = g; out[n + 2] = b; n += 3;
  }
  return { rgb: out.subarray(0, n), share: Math.round((n / 3) / (rgb.length / 3) * 10000) / 100 };
}

// Refine, before any correction (Adobe: Denoise "smooths colors and removes noise from the selection";
// Blur "softens the edges of the mask to blend the selection"; Resolve's typical matte blur is 2-4 px).
// The sliders' units are not published; these are a first pass on a 0-100 scale and the mask check judges them.
const REFINE = { denoise: 10, blur: 15 };

module.exports = { hsl, skinKeyFrom, refineKey, formatKey, keyedPixels, keyCoverage, spills, EMPTY_KEY, PRIOR, SAT_FLOOR, REFINE, HUE_INNER, HUE_OUTER };
