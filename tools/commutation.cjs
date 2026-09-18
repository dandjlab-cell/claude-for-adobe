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
// WHAT IT DOES NOT COVER. Only pivot-gains. Blacks is a toe, Highlights is a band, and the curve toes have
// their fixed point at the top - none of them are of this form, so their orders are NOT settled by this.
// And it is the UNCLAMPED difference: once a channel rails, order matters irreversibly and no closed form
// describes it. Clamping, not non-commutation, is what actually fixes an order.
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
}

module.exports = { gap, whitesK, CONTRAST, table, check };
