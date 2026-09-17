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

// The Master curve as a levels move: black input at blackIn, white input at whiteIn (0..1). With an
// `anchor` (0..1, a luma the picture should keep - the frame's median), the curve is PINNED there, so
// only the toe below the anchor moves: a two-point line is a global stretch (the sweep's median went
// 41.6 -> 36 at x 0.10), which is not how a colorist sets a black point. A second pin at 0.8 holds the
// top: Premiere's spline through the anchor bows ABOVE the diagonal on its way to (1,1) - seen on the
// 21:26 run's C187 curve, whites 91.4 -> 93.7 with nothing else touching them.
function levels(blackIn = 0, whiteIn = 1, current = null, anchor = null) {
  const out = Object.assign({}, current || {});
  const x = Math.max(0, Math.min(0.5, blackIn)), w = Math.max(0.5, Math.min(1, whiteIn));
  const pts = [[x, 0]];
  if (anchor !== null && anchor > x + 0.05 && anchor < w - 0.05) {
    pts.push([anchor, anchor]);
    if (anchor < 0.7 && w > 0.9) pts.push([0.8, 0.8]);
  }
  pts.push([w, 1]);
  out.Master = pts;
  return out;
}

// The bottom point that puts a black point (luma p1, 0-100) at `target`. Unanchored, on the straight
// line to (1,1): x = (p1 - t) / (100 - t). Anchored at A (0-100), on the line from (x, 0) to (A, A):
// x = A (p1 - t) / (A - t). The soft toe measured live leaves it a touch higher than the line says
// (3.1 for 2.3), inside the accepted band, and the confirm reports what it actually did.
function blackInFor(p1, target = 4, anchor = null) {
  if (!(p1 > target)) return 0;
  if (anchor !== null) { const A = anchor * 100; if (A > target + 5 && p1 < A) return Math.max(0, Math.min(0.5, (A * (p1 - target) / (A - target)) / 100)); }
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
function predictLevels(m, blackIn = 0, whiteIn = 1, anchor = null) {
  const X = blackIn * 100, W = whiteIn * 100, A = anchor !== null ? anchor * 100 : null;
  const map = (v) => {
    if (!isFinite(v)) return v;
    if (A !== null && A > X + 5 && W >= 90) return v >= A ? v : Math.max(0, (v - X) * A / (A - X)); // pinned at the anchor: above it, untouched
    return Math.max(0, Math.min(100, (v - X) / ((W - X) / 100)));
  };
  const move = (f) => {
    for (const k of ["min", "p1", "p50", "p99", "max"]) if (f.luma && k in f.luma) f.luma[k] = map(f.luma[k]);
    for (const c of ["red", "green", "blue"]) if (f[c]) for (const k of ["mean", "p1", "p99"]) if (k in f[c]) f[c][k] = map(f[c][k]);
  };
  const out = JSON.parse(JSON.stringify(m));
  move(out);
  if (out.frame) move(out.frame);
  return out;
}

// Lumetri's Hue Saturation Curves ("Luma vs Sat", "Hue vs Sat", "Hue vs Hue", "Hue vs Luma", "Sat vs
// Sat") are single curves through the same QE text door: "N:x,y,x,y,…," with x the position 0..1 and y a
// SIGNED offset, 0 neutral; "0:" is the empty curve (no points). Premiere draws a cubic spline through
// the points, so a sparse shape bows: ends at -0.5 with two zeros at 0.15 / 0.85 rendered as a flat
// +0.5 (the natural spline through them peaks at +0.51). Probed live 2026-09-16 00:10-00:20 on the
// sandbox (Luma vs Sat: flat ±0.5 moved the saturation median 28 -> 45 / 12; seven pinned points held
// the median at 28 while the ends desaturated; "0:" restored the baseline every time).
function parseSingle(text) {
  const m = /^\s*(\d+)\s*:\s*(.*)$/.exec(String(text || ""));
  if (!m) return [];
  const body = m[2].replace(/,\s*$/, "");
  if (!body) return [];
  let nums;
  if (body.indexOf(".") >= 0) nums = body.split(",").map(Number);
  else { const t = body.split(","); nums = []; for (let i = 0; i + 1 < t.length; i += 2) nums.push(Number(t[i] + "." + t[i + 1])); }
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) if (isFinite(nums[i]) && isFinite(nums[i + 1])) pts.push([nums[i], nums[i + 1]]);
  return pts;
}
function formatSingle(points) {
  const pts = points || [];
  if (!pts.length) return "0:";
  return pts.length + ":" + pts.map(([x, y]) => Math.max(0, Math.min(1, x)).toFixed(2) + "," + Math.max(-1, Math.min(1, y)).toFixed(2) + ",").join("");
}

// A natural cubic spline through the points: Premiere's own curve is not published, but this one
// reproduced the live bow (+0.51 for the sparse shape; the rendered saturation matched the flat +0.5).
function spline(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0]), n = p.length;
  if (n < 2) return () => (n ? p[0][1] : 0);
  const h = [], a = [], l = [1], mu = [0], z = [0], c = new Array(n).fill(0), b = [], d = [];
  for (let i = 0; i < n - 1; i++) h.push(p[i + 1][0] - p[i][0]);
  for (let i = 1; i < n - 1; i++) a[i] = 3 / h[i] * (p[i + 1][1] - p[i][1]) - 3 / h[i - 1] * (p[i][1] - p[i - 1][1]);
  for (let i = 1; i < n - 1; i++) { l[i] = 2 * (p[i + 1][0] - p[i - 1][0]) - h[i - 1] * mu[i - 1]; mu[i] = h[i] / l[i]; z[i] = (a[i] - h[i - 1] * z[i - 1]) / l[i]; }
  for (let j = n - 2; j >= 0; j--) { c[j] = z[j] - mu[j] * c[j + 1]; b[j] = (p[j + 1][1] - p[j][1]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3; d[j] = (c[j + 1] - c[j]) / (3 * h[j]); }
  return (x) => {
    let j = 0;
    while (j < n - 2 && x > p[j + 1][0]) j++;
    const t = Math.max(0, Math.min(x, p[n - 1][0])) - p[j][0];
    return p[j][1] + b[j] * t + c[j] * t * t + d[j] * t * t * t;
  };
}

// The colorists' cleanup on Luma vs Sat: saturation rolled off in the deepest shadows and the near-
// whites, the middle pinned so the spline holds it (Frame.io, the Resolve manual, a Premiere user's
// default preset). Each end is its own half so a colored end can be left alone.
// ponytail: one depth for both ends, from the ±0.5 sweep; per-end depth if a frame ever asks for it.
const ROLLOFF_DEPTH = 0.35;
function satRolloff({ shadows = true, whites = true, depth = ROLLOFF_DEPTH } = {}) {
  if (!shadows && !whites) return null;
  const low = shadows ? [[0, -depth], [0.06, -0.43 * depth], [0.12, 0]] : [[0, 0], [0.12, 0]];
  const high = whites ? [[0.88, 0], [0.94, -0.43 * depth], [1, -depth]] : [[0.88, 0], [1, 0]];
  return [...low, [0.25, 0], [0.5, 0], [0.75, 0], ...high].map(([x, y]) => [x, Math.round(y * 100) / 100]);
}

// A Hue vs Hue nudge on skin: a bump centred on the skin's own hue that returns to zero on either side,
// so nothing else in the picture rotates. The colorists' hierarchy puts this ABOVE an HSL qualifier
// ("Primaries, Custom curves, Hue vs Hue curves, HSL qualifier using as few parameters as possible" -
// Cullen Kelly via Frame.io; "the HSL curves are some of the most powerful tools in Lumetri" - R Neil
// Haugen), and it is the whole answer to a key that cannot separate skin from a wooden table: a curve
// needs no key at all. `centre` is the skin's hue 0..1, `shift` the signed offset at the peak, `width`
// the half-width in hue units; the zeros pin the spline so the bump does not bow into the neighbours.
const HUE_BUMP_WIDTH = 0.08;
function hueBump(centre, shift, width = HUE_BUMP_WIDTH) {
  if (!isFinite(centre) || !isFinite(shift) || Math.abs(shift) < 0.001) return [];
  const wrap = (x) => (x < 0 ? x + 1 : x > 1 ? x - 1 : x);
  const pts = [[wrap(centre - 2 * width), 0], [wrap(centre - width), 0], [wrap(centre), shift], [wrap(centre + width), 0], [wrap(centre + 2 * width), 0]];
  return pts.sort((a, b) => a[0] - b[0]);
}

// Line the parade's three bottoms up, per channel, on the RGB curves - the move a colorist makes for a
// cast in the blacks the balance did not take out. Only ever DOWNWARD: lifting a channel's floor would
// raise the black point that was just set.
//
// NOT WIRED INTO THE GRADE, and the reason is the whole lesson. It shipped in 0.1.80 fed with each
// channel's own p1 and made the grade worse - balanced fell from 8 clips to 4, black points were crushed
// under target (C220: 4.3 -> 1.6) and casts grew (blacks 0.4 -> 3.9 blue). A channel's independent p1 is
// NOT a cast: green's p1 sitting above red's says their distributions differ, not that the blacks are
// green. The cast at the bottom is a PAIRED statistic - bands.blacks, the darkest 3% of pixels with all
// three channels read at those same pixels - and it carries differences (rb, g), not absolute levels.
// Before this is wired again it needs those paired numbers AND a measured toe-to-output model, the way the
// pad model was swept. Guessing the second half is what broke it.
//
// `bottoms` are three channel levels (0-100) on a COMMON set of pixels. Returns curves with the toes set.
function neutralBottoms(current, bottoms, cap = 0.12) {
  const out = Object.assign({}, current || {});
  const floor = Math.min(bottoms.red, bottoms.green, bottoms.blue);
  for (const ch of ["Red", "Green", "Blue"]) {
    const p1 = bottoms[ch.toLowerCase()];
    const x = Math.min(cap, blackInFor(p1, floor));
    const rest = (out[ch] || IDENTITY[ch]).filter(([px]) => px > x + 0.02 && px > 0);
    out[ch] = x > 0.002 ? [[x, 0], ...(rest.length ? rest : [[1, 1]])] : [[0, 0], [1, 1]];
  }
  return out;
}

// What those toes do to the readings: each channel's bottom rises to the shared floor, so the parade ends
// meet and blacksRB goes to zero. The luma follows the channels it is made of; the confirm reads the truth.
function predictBottoms(m, bottoms) {
  const floor = Math.min(bottoms.red, bottoms.green, bottoms.blue);
  const out = JSON.parse(JSON.stringify(m));
  const f = out.frame || out;
  for (const ch of ["red", "green", "blue"]) if (f[ch]) f[ch].p1 = floor;
  return out;
}

module.exports = { NAMES, IDENTITY, hueBump, HUE_BUMP_WIDTH, parse, format, isIdentity, levels, blackInFor, whiteInFor, predictLevels, neutralBottoms, predictBottoms, parseSingle, formatSingle, spline, satRolloff, ROLLOFF_DEPTH };
