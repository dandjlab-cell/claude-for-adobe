// Scopes as numbers for one rendered frame, measured from the pixels Premiere exported (QE exportFramePNG, 8-bit).
// The values are READ AS SDR Rec.709 full range; that is an assumption about the export, not verified against
// Lumetri's own readout, so shots are compared with each other rather than against Lumetri numbers. A model reads
// values reliably and a waveform picture poorly, so the numbers carry the answer and the picture corroborates.
"use strict";
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { FFMPEG } = require("./media.cjs");

// ponytail: SDR Rec.709 only. A log, HDR or wide-gamut working space needs Premiere's colour pipeline, and a
// calibration pass against Lumetri colour patches before these numbers can be quoted as Lumetri's.
const CRUSH_PCT = 1.0;   // share of pixels with luma at the floor (code 0-1) that reads as crushed blacks
const CLIP_PCT = 0.5;    // share of pixels with a channel at 255 that reads as clipped highlights
const FLAT_RANGE = 60;   // p1..p99 luma spread (0-100) under this reads as low contrast
const CAST = 2.5;        // mean Cb or Cr beyond this (-50..50 scale) reads as a colour cast

// rgb: Uint8Array/Buffer of packed RGB24. Returns every number the report prints.
function measure(rgb) {
  const n = Math.floor(rgb.length / 3);
  if (!n) throw new Error("empty frame");
  const hy = new Uint32Array(256), hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256), hs = new Uint32Array(151);
  let sr = 0, sg = 0, sb = 0, scb = 0, scr = 0, clipR = 0, clipG = 0, clipB = 0, zero = 0;
  for (let i = 0; i < n * 3; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const cb = (b - y) / 1.8556, cr = (r - y) / 1.5748; // Rec.709, -127.5..127.5
    hy[Math.min(255, Math.round(y))]++; hr[r]++; hg[g]++; hb[b]++;
    hs[Math.min(150, Math.round(Math.hypot(cb, cr) / 127.5 * 100))]++; // pure red ~103, pure green ~119: not capped at 100
    sr += r; sg += g; sb += b; scb += cb; scr += cr;
    if (r === 255) clipR++; if (g === 255) clipG++; if (b === 255) clipB++;
    if (r === 0 && g === 0 && b === 0) zero++;
  }
  // nearest rank, at least 1: p0 is the first OCCUPIED bin, so a flat grey frame has a grey minimum, not 0
  const pct = (h, p) => { const want = Math.max(1, Math.ceil(p / 100 * n)); let acc = 0; for (let v = 0; v < h.length; v++) { acc += h[v]; if (acc >= want) return v; } return h.length - 1; };
  const to100 = (v) => Math.round(v / 255 * 1000) / 10;
  const share = (c) => Math.round(c / n * 10000) / 100;
  const low = hy[0] + hy[1]; // at the floor, the mirror of a channel at 255: dark is fine, clipped is not
  const luma = { min: to100(pct(hy, 0)), p1: to100(pct(hy, 1)), p50: to100(pct(hy, 50)), p99: to100(pct(hy, 99)), max: to100(pct(hy, 100)) };
  const chan = (h, s) => ({ mean: to100(s / n), p1: to100(pct(h, 1)), p99: to100(pct(h, 99)) });
  return {
    pixels: n, luma,
    red: chan(hr, sr), green: chan(hg, sg), blue: chan(hb, sb),
    clipped: { red: share(clipR), green: share(clipG), blue: share(clipB) },
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
    "clipped at 255: R " + m.clipped.red + "% G " + m.clipped.green + "% B " + m.clipped.blue + "%; at the luma floor " + m.crushed + "% (pure black " + m.pureBlack + "%)",
    "vectorscope: saturation median " + m.saturation.p50 + ", p99 " + m.saturation.p99 + " (% of a 127.5 Cb/Cr radius: pure red is about 103, pure green about 119); mean Cb " + m.cast.cb + ", Cr " + m.cast.cr + " (-50..50)",
    "reads: " + readings(m).join("; "),
  ].join("\n");
}

// The exported PNG as packed RGB24, at full resolution (clip and crush shares need every pixel).
function decodeRgb(png) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-i", png, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout || !r.stdout.length) throw new Error("ffmpeg could not decode the frame: " + String(r.stderr || "").trim().slice(0, 200));
  return r.stdout;
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

module.exports = { measure, readings, report, decodeRgb, renderScopes, CRUSH_PCT, CLIP_PCT, FLAT_RANGE, CAST };
