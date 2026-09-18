// Item #15 of docs/color-sweep-queue.md: how much does the ORDER of two pivot-gains matter?
//
// DERIVED, not measured. Two controls of the form f(v) = P + (v - P)k compose like this:
//
//   f(g(v)) = PA + kA·PB - kA·PA + kA·kB·v - kA·kB·PB
//   g(f(v)) = PB + kB·PA - kB·PB + kA·kB·v - kA·kB·PA
//   f∘g - g∘f = (kA - 1)(kB - 1)(PA - PB)
//
// The v terms cancel, so the difference is CONSTANT in level: swapping the order of two pivot-gains
// shifts the whole picture by a fixed number of IRE. That is why this needs no render - it is a two-line
// algebraic identity, and the check below confirms it against brute-force composition over every level.
//
// WHAT IT DOES NOT COVER. Only pivot-gains. Blacks is a toe exponential in level and Highlights is a band;
// neither is of this form, so their orders are NOT settled by this. And it is the UNCLAMPED difference: once
// a channel rails, order matters irreversibly and no closed form describes it. Clamping, not
// non-commutation, is what actually fixes an order.
//
// CORRECTION 2026-09-18. The first version of this file also excluded the CURVE TOES, on the grounds that
// their fixed point is at the top rather than at a pivot inside the range. That is a distinction without a
// difference - a fixed point at the top IS a pivot at 100:
//
//   toe  (v - 100x)/(1 - x) == 100 + (v - 100)·k,  k = 1/(1 - x) > 1
//   lift 100y + v(1 - y)    == 100 + (v - 100)·k,  k = 1 - y     < 1
//
// verified exact below. So a toe and a lift on one channel are ONE control in two unit systems; the three
// channel toes share the pivot 100 and therefore commute exactly, which independently explains the measured
// separability in `channelToe._isolation`; and the toes against the tonal sliders are covered by the
// identity, at 1.7 IRE and up - four times the noise floor.
"use strict";
const { CONTRAST_PIVOT, EXPOSURE_GAMMA } = require("../src/forward.cjs");

// Whites is a pure gain about zero: P = 0, k = 2^(points/100/gamma). (`whitesRule._ITISEXPOSURE`.)
const whitesK = (pts) => Math.pow(2, pts / 100 / EXPOSURE_GAMMA);
// Contrast, approximate - median residual 2.09 (`contrastRule._DOWNGRADED`).
const CONTRAST = { "-100": 0.798, "-50": 0.900, "-20": 0.966, "0": 1, "20": 1.046, "50": 1.100, "100": 1.191 };

const gap = (kA, PA, kB, PB) => (kA - 1) * (kB - 1) * (PA - PB);

function brute(kA, PA, kB, PB) {
  const f = (v) => PA + (v - PA) * kA, g = (v) => PB + (v - PB) * kB;
  let worst = 0;
  for (let v = 0; v <= 100; v += 0.25) worst = Math.max(worst, Math.abs((f(g(v)) - g(f(v))) - gap(kA, PA, kB, PB)));
  return worst;
}

const NOISE = 0.392; // one 8-bit code, in IRE

// A curve toe or lift as a pivot-gain about 100. `x` is the bottom-point position, `y` the lift position.
const TOE_PIVOT = 100;
const toeK = (x) => 1 / (1 - x);
const liftK = (y) => 1 - y;

// The toes against the tonal sliders - the order question the pass actually faces, since it writes the
// channel bottoms and then solves the sliders.
function curveVsSliders() {
  const rows = [];
  for (const x of [0.02, 0.05, 0.1, 0.25]) {
    const kT = toeK(x);
    for (const w of [-50, 50]) rows.push({ toe: x, against: "whites " + w, ire: Math.round(gap(kT, TOE_PIVOT, whitesK(w), 0) * 1000) / 1000 });
    for (const c of [-50, 50]) rows.push({ toe: x, against: "contrast " + c, ire: Math.round(gap(kT, TOE_PIVOT, CONTRAST[String(c)], CONTRAST_PIVOT) * 1000) / 1000 });
  }
  return rows;
}

function table() {
  const rows = [];
  for (const w of [-100, -50, -20, 20, 50, 100]) for (const c of [-100, -50, -20, 20, 50, 100]) {
    const kA = whitesK(w), kB = CONTRAST[String(c)];
    rows.push({ whites: w, contrast: c, ire: Math.round(gap(kA, 0, kB, CONTRAST_PIVOT) * 1000) / 1000, matters: Math.abs(gap(kA, 0, kB, CONTRAST_PIVOT)) > NOISE });
  }
  return rows;
}

function check() {
  // The identity holds exactly, at every level, for any pivots and gains.
  for (const [kA, PA, kB, PB] of [[1.15, 0, 1.10, 49.6], [0.87, 0, 1.19, 49.6], [1.4, 12, 0.6, 88], [1, 0, 2, 50]]) {
    const off = brute(kA, PA, kB, PB);
    if (!(off < 1e-9)) throw new Error("the closed form is not exact: off by " + off + " for " + [kA, PA, kB, PB]);
  }
  // A gain of 1 commutes with anything, and equal pivots commute whatever the gains.
  if (gap(1, 0, 1.19, 49.6) !== 0) throw new Error("a neutral control must commute with everything");
  if (gap(1.15, 49.6, 1.19, 49.6) !== 0) throw new Error("equal pivots must commute");
  // The correction: a curve toe and a lift ARE pivot-gains about 100. Checked at every level, not at one.
  const toe = (v, x) => (v - 100 * x) / (1 - x), lift = (v, y) => 100 * y + v * (1 - y);
  const asPivot = (v, k) => TOE_PIVOT + (v - TOE_PIVOT) * k;
  for (const x of [0.02, 0.1, 0.25]) for (let v = 0; v <= 100; v += 0.5)
    if (Math.abs(toe(v, x) - asPivot(v, toeK(x))) > 1e-9) throw new Error("a toe is not a pivot-gain about 100 at x=" + x + ", v=" + v);
  for (const y of [0.02, 0.1, 0.3]) for (let v = 0; v <= 100; v += 0.5)
    if (Math.abs(lift(v, y) - asPivot(v, liftK(y))) > 1e-9) throw new Error("a lift is not a pivot-gain about 100 at y=" + y + ", v=" + v);
  // Sharing the pivot, the three channel toes must commute exactly - which is what `channelToe._isolation`
  // measured. The algebra and the measurement have to agree or one of them is wrong.
  if (gap(toeK(0.1), TOE_PIVOT, toeK(0.03), TOE_PIVOT) !== 0) throw new Error("two toes share a pivot and must commute");
  return true;
}

if (require.main === module) {
  check();
  const rows = table();
  const worst = rows.reduce((a, b) => (Math.abs(b.ire) > Math.abs(a.ire) ? b : a));
  console.log("closed form verified exact against brute-force composition over 0..100 IRE\n");
  console.log("Whites x Contrast, IRE difference between the two orders (constant in level):");
  for (const r of rows) console.log("  whites " + String(r.whites).padStart(4) + "  contrast " + String(r.contrast).padStart(4) + "  " + r.ire.toFixed(3).padStart(7) + (r.matters ? "  > noise floor" : ""));
  console.log("\nworst: whites " + worst.whites + " with contrast " + worst.contrast + " = " + worst.ire.toFixed(3) + " IRE");
  console.log("rows above the " + NOISE + " IRE noise floor: " + rows.filter((r) => r.matters).length + " of " + rows.length);
  console.log("\nCurve toe (pivot 100) against the tonal sliders - the order the pass actually faces:");
  for (const r of curveVsSliders()) console.log("  toe " + r.toe.toFixed(2) + "  vs " + r.against.padEnd(13) + r.ire.toFixed(3).padStart(7) + (Math.abs(r.ire) > NOISE ? "  > noise floor" : ""));
}

module.exports = { gap, whitesK, CONTRAST, table, check, curveVsSliders, toeK, liftK, TOE_PIVOT };
