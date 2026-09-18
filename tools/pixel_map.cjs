#!/usr/bin/env node
// Per-pixel map between two renders of the same frame: `before.png after.png`, as curve_sweep keeps them
// with keepFrames. A percentile cannot say whether one channel's output depends on another channel's
// input; this can. Prints, per channel, the median output at each input level (IRE), and for the green
// channel at a chosen input level, the median output split by the same pixel's red and blue input.
// Usage: node tools/pixel_map.cjs before.png after.png [greenLevelIRE=14]
const { decodeRgb } = require("../src/scopes.cjs");
const [before, after, gArg] = process.argv.slice(2);
if (!before || !after) { console.error("usage: pixel_map.cjs before.png after.png [greenLevelIRE]"); process.exit(2); }
const A = decodeRgb(before), B = decodeRgb(after);
if (A.length !== B.length) { console.error("frames differ in size: " + A.length + " vs " + B.length); process.exit(1); }
const ire = (v) => (v / 255 * 100).toFixed(1);
const med = (a) => { a.sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
const N = A.length / 3;
// 1. out vs in per channel, binned by input code.
const bins = [[], [], []]; for (let c = 0; c < 3; c++) for (let v = 0; v < 256; v++) bins[c][v] = [];
for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) bins[c][A[i * 3 + c]].push(B[i * 3 + c]);
console.log("in IRE | out median IRE  red / green / blue   (count)");
for (let v = 0; v <= 160; v += 5) {
  const cells = bins.map((b) => b[v]);
  if (cells.every((x) => x.length < 50)) continue;
  console.log(ire(v).padStart(6) + " | " + cells.map((x) => (x.length < 50 ? "   -  " : ire(med(x.slice())).padStart(6)) + " (" + x.length + ")").join("  "));
}
// 2. Does green's output depend on the pixel's red and blue INPUT? Fix green input at one level and split.
const gLevel = Math.round(Number(gArg || 14) / 100 * 255);
const sel = []; for (let i = 0; i < N; i++) if (Math.abs(A[i * 3 + 1] - gLevel) <= 1) sel.push(i);
if (sel.length > 200) {
  const byR = sel.map((i) => A[i * 3]).sort((a, b) => a - b), byB = sel.map((i) => A[i * 3 + 2]).sort((a, b) => a - b);
  const t = (arr, q) => arr[Math.floor(arr.length * q)];
  const rT = [t(byR, 1 / 3), t(byR, 2 / 3)], bT = [t(byB, 1 / 3), t(byB, 2 / 3)];
  const split = (get, T, name) => {
    const g = [[], [], []]; for (const i of sel) { const v = get(i); g[v < T[0] ? 0 : v < T[1] ? 1 : 2].push(B[i * 3 + 1]); }
    console.log("green in " + ire(gLevel) + " IRE, out median by " + name + " input tercile (low / mid / high, thresholds " + ire(T[0]) + " / " + ire(T[1]) + "): " + g.map((x) => ire(med(x)) + " (" + x.length + ")").join(" / "));
  };
  split((i) => A[i * 3], rT, "RED"); split((i) => A[i * 3 + 2], bT, "BLUE");
  // and by the pixel's minimum channel
  const g = [[], [], []]; const mins = sel.map((i) => Math.min(A[i * 3], A[i * 3 + 1], A[i * 3 + 2])).sort((a, b) => a - b); const mT = [t(mins, 1 / 3), t(mins, 2 / 3)];
  for (const i of sel) { const v = Math.min(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]); g[v < mT[0] ? 0 : v < mT[1] ? 1 : 2].push(B[i * 3 + 1]); }
  console.log("green in " + ire(gLevel) + " IRE, out median by MIN-channel tercile (thresholds " + ire(mT[0]) + " / " + ire(mT[1]) + "): " + g.map((x) => ire(med(x)) + " (" + x.length + ")").join(" / "));
} else console.log("too few pixels at green " + ire(gLevel) + " IRE (" + sel.length + ")");
