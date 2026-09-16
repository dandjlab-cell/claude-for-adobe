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
// One axis: plateau = p10..p90, feather = p2..p98, as centre / inner / outer; hue is unwrapped around 0 first.
function axis(values, wrap) {
  const v = values.map((x) => (wrap && x > 0.5 ? x - 1 : x)).sort((a, b) => a - b);
  const lo = pct(v, 0.10), hi = pct(v, 0.90), lo2 = pct(v, 0.02), hi2 = pct(v, 0.98);
  let centre = (lo + hi) / 2, inner = Math.max(0.01, (hi - lo) / 2), outer = Math.max(inner + 0.02, (hi2 - lo2) / 2);
  if (wrap && centre < 0) centre += 1;
  return [centre, inner, outer].map((n) => Math.round(n * 1000) / 1000);
}

// rgb: packed RGB24; boxes: [{x0,y0,x1,y1}] as frame fractions (Vision's). Returns { key, text, pixels, share }
// or null when the boxes hold too few skin-like pixels to trust.
function skinKeyFrom(rgb, width, height, boxes, { minPixels = 200 } = {}) {
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
  const key = { H: axis(H, true), S: axis(S, false), L: axis(L, false) };
  return { key, text: formatKey(key), pixels: H.length, share: Math.round((H.length / Math.max(1, inBoxes)) * 1000) / 10 };
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

module.exports = { hsl, skinKeyFrom, formatKey, keyedPixels, EMPTY_KEY, PRIOR };
