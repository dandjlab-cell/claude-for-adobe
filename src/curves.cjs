// Lumetri's RGB Curves as a levels tool: the Master curve's end points set the black point and the
// white point EXACTLY, which no tone slider does (Blacks is a toe control, Shadows a dark-areas control,
// and which of them reaches a lifted black point depends on what the darkest pixels are).
//
// QE serialises "RGB Curves" as "Master:N:x,y,x,y,;Red:N:…;Green:N:…;Blue:N:…" - point count, then the
// points as 0..1 pairs, each followed by a comma. Reads come back with COMMA decimals, writes need dots
// (the same rule as the wheels). Verified live 2026-09-15 20:28 on the sandbox: every write accepted,
// read back, and the restore matched the original text.
//
// The response measured there (clip 1, luma 0-100): the bottom point at x is output = (in - x) / (1 - x)
// with a soft toe (p1 8.2 -> 5.9 / 3.1 / 0.4 / 0 / 0 at x 0.03 / 0.06 / 0.10 / 0.15 / 0.20; the straight
// line says 5.4 / 2.3 / 0 / 0 / 0); the top point at x is output = in / x to the decimal (p99 75.7 -> 82
// / 86.7 / 94.5 at 0.92 / 0.87 / 0.80) and the peak clips once max / x passes 100.
"use strict";

const NAMES = ["Master", "Red", "Green", "Blue"];
const IDENTITY = { Master: [[0, 0], [1, 1]], Red: [[0, 0], [1, 1]], Green: [[0, 0], [1, 1]], Blue: [[0, 0], [1, 1]] };

// "Master:2:0,06,0,00,1,00,1,00,;Red:…" -> { Master: [[0.06, 0], [1, 1]], … }. Tolerates the dot form.
function parse(text) {
  const out = {};
  for (const part of String(text || "").split(";")) {
    const m = /^\s*(Master|Red|Green|Blue)\s*:\s*(\d+)\s*:\s*(.*)$/.exec(part);
    if (!m) continue;
    const body = m[3].replace(/,\s*$/, "");
    let nums;
    if (body.indexOf(".") >= 0) nums = body.split(",").map(Number);
    else { const t = body.split(","); nums = []; for (let i = 0; i + 1 < t.length; i += 2) nums.push(Number(t[i] + "." + t[i + 1])); }
    if (nums.some((n) => !isFinite(n))) continue;
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (pts.length) out[m[1]] = pts;
  }
  return out;
}

// The write form: dots, two decimals, every curve present, each point followed by a comma.
function format(curves) {
  const f = (n) => Math.max(0, Math.min(1, Number(n))).toFixed(2);
  return NAMES.map((name) => {
    const pts = (curves && curves[name]) || IDENTITY[name];
    return name + ":" + pts.length + ":" + pts.map(([x, y]) => f(x) + "," + f(y) + ",").join("");
  }).join(";");
}

// A curve that is not the identity line means the clip already carries a curve grade.
function isIdentity(curves) {
  for (const name of NAMES) {
    const pts = (curves && curves[name]) || IDENTITY[name];
    if (pts.length !== 2) return false;
    if (Math.abs(pts[0][0]) > 0.005 || Math.abs(pts[0][1]) > 0.005 || Math.abs(pts[1][0] - 1) > 0.005 || Math.abs(pts[1][1] - 1) > 0.005) return false;
  }
  return true;
}

// The Master curve as a levels move: black input at blackIn, white input at whiteIn (0..1).
function levels(blackIn = 0, whiteIn = 1, current = null) {
  const out = Object.assign({}, current || {});
  out.Master = [[Math.max(0, Math.min(0.5, blackIn)), 0], [Math.max(0.5, Math.min(1, whiteIn)), 1]];
  return out;
}

// The bottom point that puts a black point (luma p1, 0-100) at `target`, on the straight line. The soft
// toe measured live leaves it a touch higher than the line says (3.1 for 2.3), which is inside the
// accepted band, and the confirm reports what it actually did.
function blackInFor(p1, target = 4) {
  if (!(p1 > target)) return 0;
  return Math.max(0, Math.min(0.5, (p1 - target) / (100 - target)));
}
// The top point that puts a white point at `target` without pushing the peak past 100: output = in / x,
// so x cannot go below max / 100.
function whiteInFor(p99, max, target = 92) {
  if (!(p99 < target)) return 1;
  return Math.max(0.5, Math.min(1, p99 / target, 1), Math.min(1, max / 100));
}

// Predict a measurement after the levels move: every luma and channel level maps through the line,
// clamped to 0..100; casts and clip shares are left as they are (a neutral op moves both channels
// together; the confirm reads the truth).
function predictLevels(m, blackIn = 0, whiteIn = 1) {
  const X = blackIn * 100, W = whiteIn * 100;
  const map = (v) => (isFinite(v) ? Math.max(0, Math.min(100, (v - X) / ((W - X) / 100))) : v);
  const move = (f) => {
    for (const k of ["min", "p1", "p50", "p99", "max"]) if (f.luma && k in f.luma) f.luma[k] = map(f.luma[k]);
    for (const c of ["red", "green", "blue"]) if (f[c]) for (const k of ["mean", "p1", "p99"]) if (k in f[c]) f[c][k] = map(f[c][k]);
  };
  const out = JSON.parse(JSON.stringify(m));
  move(out);
  if (out.frame) move(out.frame);
  return out;
}

module.exports = { NAMES, IDENTITY, parse, format, isIdentity, levels, blackInFor, whiteInFor, predictLevels };
