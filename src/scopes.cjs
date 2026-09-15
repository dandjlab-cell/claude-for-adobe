// Scopes as numbers for one rendered frame, measured from the pixels Premiere exported (QE exportFramePNG, 8-bit).
// The values are READ AS SDR Rec.709 full range; that is an assumption about the export, not verified against
// Lumetri's own readout, so shots are compared with each other rather than against Lumetri numbers. A model reads
// values reliably and a waveform picture poorly, so the numbers carry the answer and the picture corroborates.
"use strict";
const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { FFMPEG } = require("./media.cjs");

// ponytail: SDR Rec.709 only. A log, HDR or wide-gamut working space needs Premiere's colour pipeline, and a
// calibration pass against Lumetri colour patches before these numbers can be quoted as Lumetri's.
const CRUSH_PCT = 1.0;   // share of pixels with luma at the floor (code 0-1) that reads as crushed blacks
const CLIP_PCT = 0.5;    // share of pixels with a channel at 255 that reads as clipped highlights
const FLAT_RANGE = 60;   // p1..p99 luma spread (0-100) under this reads as low contrast
const CAST = 2.5;        // mean Cb or Cr beyond this (-50..50 scale) reads as a colour cast
// Casts by luma band, read from PAIRED pixels: the same pixel's B-R and G-(R+B)/2, accumulated per luma
// code, so any band can be read after one pass. Two kinds of band: by RANK (the darkest / brightest
// share of pixels - the parade's bottoms and tops, which is what the canon lines up, because the
// darkest and brightest things in a shot are the ones most likely meant to be neutral) and by LEVEL
// (fixed luma ranges, roughly what each wheel acts on). The 2026-09-15 20:43 sweep showed why the
// distinction matters: a 5-30 level band read the shadows warm by 18 on a warm-toned scene under
// neutral light (highlights +2) - scene colour, not a cast - where the bottoms were nearly aligned.
const RANK_SHARE = 0.03; // darkest / brightest 3% of pixels
const LEVEL_BANDS = { shadows: [5, 30], midtones: [30, 65], highlights: [65, 95] }; // 0-100

// rgb: Uint8Array/Buffer of packed RGB24. Returns every number the report prints.
function measure(rgb) {
  const n = Math.floor(rgb.length / 3);
  if (!n) throw new Error("empty frame");
  const hy = new Uint32Array(256), hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256), hs = new Uint32Array(151);
  // Casts by LUMA BAND, from paired pixels: for every pixel in a band, B-R and G-(R+B)/2 go into a
  // histogram (offset 255) and the band's cast is the median. Three independently taken channel
  // percentiles (red p1, blue p1) need not be the same pixels, and once a tonal knob pulls one channel
  // onto the floor they are not - the 2026-09-15 runs read a warm bottom getting warmer after a correct
  // pad. Pixels with any channel at 0 or 255 are left out: a clamped channel has no cast to read.
  const cBR = new Uint32Array(256 * 511), cGM = new Uint32Array(256 * 511), cN = new Uint32Array(256); // per luma code
  let sr = 0, sg = 0, sb = 0, scb = 0, scr = 0, clipR = 0, clipG = 0, clipB = 0, zero = 0, floorR = 0, floorG = 0, floorB = 0;
  for (let i = 0; i < n * 3; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const cb = (b - y) / 1.8556, cr = (r - y) / 1.5748; // Rec.709, -127.5..127.5
    hy[Math.min(255, Math.round(y))]++; hr[r]++; hg[g]++; hb[b]++;
    if (r > 0 && g > 0 && b > 0 && r < 255 && g < 255 && b < 255) { const yc = Math.min(255, Math.round(y)); cBR[yc * 511 + b - r + 255]++; cGM[yc * 511 + Math.round(g - (r + b) / 2) + 255]++; cN[yc]++; }
    hs[Math.min(150, Math.round(Math.hypot(cb, cr) / 127.5 * 100))]++; // pure red ~103, pure green ~119: not capped at 100
    sr += r; sg += g; sb += b; scb += cb; scr += cr;
    if (r === 255) clipR++; if (g === 255) clipG++; if (b === 255) clipB++;
    if (r === 0) floorR++; if (g === 0) floorG++; if (b === 0) floorB++;
    if (r === 0 && g === 0 && b === 0) zero++;
  }
  // nearest rank, at least 1: p0 is the first OCCUPIED bin, so a flat grey frame has a grey minimum, not 0
  const pct = (h, p) => { const want = Math.max(1, Math.ceil(p / 100 * n)); let acc = 0; for (let v = 0; v < h.length; v++) { acc += h[v]; if (acc >= want) return v; } return h.length - 1; };
  const to100 = (v) => Math.round(v / 255 * 1000) / 10;
  const share = (c) => Math.round(c / n * 10000) / 100;
  const low = hy[0] + hy[1]; // at the floor, the mirror of a channel at 255: dark is fine, clipped is not
  const luma = { min: to100(pct(hy, 0)), p1: to100(pct(hy, 1)), p50: to100(pct(hy, 50)), p99: to100(pct(hy, 99)), max: to100(pct(hy, 100)) };
  const chan = (h, s) => ({ mean: to100(s / n), p1: to100(pct(h, 1)), p99: to100(pct(h, 99)) });
  // A band is a set of luma codes; its cast is the median over the paired-pixel histograms of those codes.
  // codes: [[code, weight], ...]; a weight under 1 takes that share of the code's pixels (the boundary
  // code of a rank band, so a large surface one code past the mark is not swallowed whole).
  const band = (codes) => {
    let total = 0; for (const [c, w] of codes) total += w * cN[c];
    if (!(total >= 1)) return { share: 0, rb: null, g: null };
    const med = (h) => { const want = total / 2; let acc = 0; for (let v = 0; v < 511; v++) { for (const [c, w] of codes) acc += w * h[c * 511 + v]; if (acc >= want) return to100(v - 255); } return null; };
    return { share: share(total), rb: med(cBR), g: med(cGM) };
  };
  const codesBetween = (lo, hi) => { const out = []; for (let c = Math.round(lo * 2.55); c < Math.round(hi * 2.55); c++) out.push([c, 1]); return out; };
  // By rank: the darkest / brightest RANK_SHARE of ALL pixels (luma histogram), the boundary code weighted.
  const rankCodes = (fromDark, share = RANK_SHARE) => { const want = Math.max(1, share * n); const out = []; let acc = 0; for (let i = 0; i < 256 && acc < want; i++) { const c = fromDark ? i : 255 - i; if (!hy[c]) continue; const w = Math.min(1, (want - acc) / hy[c]); out.push([c, w]); acc += hy[c]; } return out; };
  return {
    pixels: n, luma,
    red: chan(hr, sr), green: chan(hg, sg), blue: chan(hb, sb),
    bands: {
      blacks: band(rankCodes(true)), whites: band(rankCodes(false)),
      // The darkest / brightest 1%: when this differs from the 3% band, the bottom (or top) is mixed - a
      // black object and a coloured one sharing the parade's end, which the 3% median cannot show.
      blacks1: band(rankCodes(true, 0.01)), whites1: band(rankCodes(false, 0.01)),
      shadows: band(codesBetween(...LEVEL_BANDS.shadows)), midtones: band(codesBetween(...LEVEL_BANDS.midtones)), highlights: band(codesBetween(...LEVEL_BANDS.highlights)),
    },
    clipped: { red: share(clipR), green: share(clipG), blue: share(clipB) },
    // A channel on the floor is the mirror of a channel at 255: a warm shadow whose blue is at 0 has
    // no blue to read, and a curve that puts two channels of a coloured dark surface at 0 has crushed
    // it even though its luma (from the third channel) has not moved - the 21:26 run's C187.
    floor: { red: share(floorR), green: share(floorG), blue: share(floorB) },
    crushed: share(low), pureBlack: share(zero),
    saturation: { p50: pct(hs, 50), p99: pct(hs, 99) },
    cast: { cb: Math.round(scb / n / 127.5 * 500) / 10, cr: Math.round(scr / n / 127.5 * 500) / 10 },
  };
}

// What the counts say, with what they can and cannot mean: pixel occupancy is not a diagnosis. A letterbox fills
// the luma floor and a saturated title fills a channel at 255 without anything being wrong with the exposure.
function readings(m) {
  const out = [];
  if (m.crushed >= CRUSH_PCT) out.push("luma floor: " + m.crushed + "% of pixels at code 0-1 (crushed blacks, or letterbox and black graphics)");
  const hot = ["red", "green", "blue"].filter((c) => m.clipped[c] >= CLIP_PCT);
  if (hot.length) out.push("channel at 255: " + hot.map((c) => c + " " + m.clipped[c] + "%").join(", ") + " of pixels (clipped highlights, or saturated graphics and titles)");
  const spread = Math.round((m.luma.p99 - m.luma.p1) * 10) / 10;
  if (spread < FLAT_RANGE) out.push("narrow tonal spread: luma p1-p99 " + m.luma.p1 + "-" + m.luma.p99 + " (flat exposure, or a naturally low-contrast scene)");
  const warm = m.cast.cr > CAST ? "red/warm" : m.cast.cr < -CAST ? "cyan" : "", blue = m.cast.cb > CAST ? "blue" : m.cast.cb < -CAST ? "yellow" : "";
  if (warm || blue) out.push("frame leans " + [warm, blue].filter(Boolean).join(" and ") + " (mean Cr " + m.cast.cr + ", Cb " + m.cast.cb + "; a whole-frame mean, so a coloured subject can cause it)");
  return out.length ? out : ["no endpoint pile-up (luma floor under " + CRUSH_PCT + "%, each channel at 255 under " + CLIP_PCT + "%), tonal spread " + spread + ", no whole-frame lean"];
}

function report(m, label) {
  return [
    (label ? label + ": " : "") + "luma 0-100: min " + m.luma.min + ", p1 " + m.luma.p1 + ", median " + m.luma.p50 + ", p99 " + m.luma.p99 + ", max " + m.luma.max,
    "parade means R " + m.red.mean + " G " + m.green.mean + " B " + m.blue.mean + "; p1-p99 R " + m.red.p1 + "-" + m.red.p99 + ", G " + m.green.p1 + "-" + m.green.p99 + ", B " + m.blue.p1 + "-" + m.blue.p99,
    "clipped at 255: R " + m.clipped.red + "% G " + m.clipped.green + "% B " + m.clipped.blue + "%; at the luma floor " + m.crushed + "% (pure black " + m.pureBlack + "%); channel at 0: R " + m.floor.red + "% G " + m.floor.green + "% B " + m.floor.blue + "%",
    "vectorscope: saturation median " + m.saturation.p50 + ", p99 " + m.saturation.p99 + " (% of a 127.5 Cb/Cr radius: pure red is about 103, pure green about 119); mean Cb " + m.cast.cb + ", Cr " + m.cast.cr + " (-50..50)",
    "casts by luma band (median B-R / G-mid of paired pixels, 0-100; >0 blue / green, <0 warm / magenta): " + [["blacks1", "darkest 1%"], ["blacks", "darkest 3%"], ["shadows", "5-30"], ["midtones", "30-65"], ["highlights", "65-95"], ["whites", "brightest 3%"], ["whites1", "brightest 1%"]].map(([k, label]) => { const b = m.bands && m.bands[k]; return k + " (" + label + ")" + (b && b.rb !== null ? " " + b.rb + " / " + b.g + " [" + b.share + "%]" : " none"); }).join("; "),
    "reads: " + readings(m).join("; "),
  ].join("\n");
}

// The exported PNG as packed RGB24, at full resolution (clip and crush shares need every pixel).
// box, when given, is {x0,y0,x1,y1} as fractions of the frame: measure only that rectangle. Grading a
// person by whole-frame numbers is grading the background too - a warm wall drags the frame's cast far
// from the face's, and neutralising the frame then drains the skin. The crop happens in ffmpeg, so the
// pixel dimensions never have to be known here.
function decodeRgb(png, box) {
  const crop = box ? ["-vf", "crop=iw*" + clamp01(box.x1 - box.x0) + ":ih*" + clamp01(box.y1 - box.y0) +
    ":iw*" + clamp01(box.x0) + ":ih*" + clamp01(box.y0)] : [];
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", png, "-frames:v", "1", ...crop, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout || !r.stdout.length) throw new Error("ffmpeg could not decode the frame: " + String(r.stderr || "").trim().slice(0, 200));
  return r.stdout;
}

// A mask image (8-bit grey, same size as the frame, white = keep) as one byte per pixel.
function decodeGray(png) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", png, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout || !r.stdout.length) throw new Error("ffmpeg could not decode the mask: " + String(r.stderr || "").trim().slice(0, 200));
  return r.stdout;
}

// Only the pixels the mask keeps, packed back into RGB24 for measure(). Vision's subject mask is the
// general answer to "measure the subject, not the room": it does not care whether the subject is a
// face, hands or a product. A frame and its mask must be the same size, or the pixels do not line up.
function maskRgb(rgb, gray, threshold = 128) {
  const n = Math.floor(rgb.length / 3);
  if (gray.length !== n) throw new Error("mask is " + gray.length + " pixels, frame is " + n);
  const out = Buffer.alloc(rgb.length);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (gray[i] < threshold) continue;
    out[k] = rgb[i * 3]; out[k + 1] = rgb[i * 3 + 1]; out[k + 2] = rgb[i * 3 + 2]; k += 3;
  }
  if (!k) throw new Error("the mask keeps no pixels");
  return out.subarray(0, k);
}

// One picture, laid out like Lumetri Scopes: luma waveform and vectorscope on top, RGB parade below. The conversion is
// explicit: ffmpeg's implicit RGB->YUV is limited-range BT.601 (pure red plotted at 81 against Rec.709's 54, probed
// 2026-09-14), so the picture disagreed with the numbers. ffmpeg's waveform graticule and vectorscope targets assume
// limited range, so the display maps full range onto it: 0 lands on the 0 line, 255 on the 100 line, and a Rec.709
// primary on its target. The numbers above stay full range; this mapping is for the picture only.
const TO_TV_709 = "scale=in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv444p";
const TV_RGB = "lutrgb=r=16+val*219/255:g=16+val*219/255:b=16+val*219/255";
const WAVE = "waveform=i=0.08:g=green:s=ire:bgopacity=1,format=rgb24";
const SCOPE_GRAPH = "[0:v]format=gbrp,split=3[l][p][v];" +
  "[l]" + TO_TV_709 + ",extractplanes=y," + WAVE.replace("s=ire", "fl=1:s=ire") + ",scale=960:540[wl];" +
  "[p]" + TV_RGB + ",split=3[pr][pg][pb];" +
  "[pr]extractplanes=r," + WAVE.replace("s=ire", "fl=1:s=ire") + ",lutrgb=g=0:b=0,scale=520:540[wr];" +
  "[pg]extractplanes=g," + WAVE + ",lutrgb=r=0:b=0,scale=520:540[wg];" +
  "[pb]extractplanes=b," + WAVE + ",lutrgb=r=0:g=0,scale=520:540[wb];" +
  "[v]" + TO_TV_709 + ",vectorscope=m=color4:g=color:i=0.08:bgopacity=1,format=rgb24,scale=540:540,pad=600:540:30:0[vs];" +
  "[wl][vs]hstack[top];[wr][wg][wb]hstack=3,crop=1560:540:0:0[par];[top][par]vstack,scale=1024:-2";
function renderScopes(png, jpg) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-y", "-i", png, "-filter_complex", SCOPE_GRAPH, "-frames:v", "1", "-q:v", "4", jpg], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(jpg)) throw new Error("ffmpeg could not draw the scopes: " + String(r.stderr || "").trim().slice(0, 200));
  return jpg;
}

module.exports = { measure, readings, report, decodeRgb, decodeGray, maskRgb, renderScopes, CRUSH_PCT, CLIP_PCT, FLAT_RANGE, CAST };
