// One source frame, decoded OUTSIDE Premiere, as packed RGB24 for src/scopes.cjs measure().
// This is the read half of background colour work: the panel already knows which file and which
// source time a timeline position maps to, so the agent can measure and iterate a grade without
// asking Premiere to render anything (the editor keeps working; nothing opens, exports or switches).
//
// What this is NOT: Premiere's rendered output. No Lumetri grade, no sequence colour management and
// no source settings are applied here - these are the camera's own pixels. Use it to iterate; take
// the exact reading from a real Export Frame measure (scopes.cjs on a QE PNG) before quoting a
// final number.
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { FFMPEG, mediaDims } = require("./media.cjs");

// BRAW has no open decoder; it goes through Blackmagic's own SDK via bin/braw_to_rgba (source in
// src/braw_to_rgba.cpp; build line in its header). The SDK is a separate, EULA-gated install at
// /Applications/Blackmagic RAW, so the helper is built locally and never shipped in the zip: when it
// is missing, BRAW throws and names the fallback (a Premiere frame export). R3D and other raw formats
// still have no path here.
const BRAW = /\.braw$/i;
const RAW_NO_DECODER = /\.r3d$/i;
const BRAW_DECODER = process.env.BRAW_DECODER || path.join(__dirname, "..", "bin", "braw_to_rgba");
const BRAW_SDK = "/Applications/Blackmagic RAW/Blackmagic RAW SDK/Mac/Libraries";
const brawAvailable = () => fs.existsSync(BRAW_DECODER) && fs.existsSync(BRAW_SDK);

// One BRAW frame through the SDK: the decode is at the SDK's quarter resolution (1536x864 from 6K),
// which is plenty for scopes, and applies the clip's own colour science as shot. Whether that matches
// how Premiere interprets the same clip is checked once, live, against a Premiere export of the same
// frame - see the colour skill - not assumed.
function brawFrameRgb(file, seconds) {
  if (!brawAvailable()) throw new Error("no BRAW decoder: build bin/braw_to_rgba against the Blackmagic RAW SDK, or use a Premiere frame export");
  const info = spawnSync(BRAW_DECODER, ["--info", file], { encoding: "utf8", cwd: path.dirname(BRAW_DECODER) });
  const m = /width=(\d+) height=(\d+) fps=([\d.]+) frames=(\d+)/.exec(info.stdout || "");
  if (info.status !== 0 || !m) throw new Error("BRAW info failed: " + String(info.stderr || info.stdout || "").trim().slice(0, 200));
  const width = Number(m[1]), height = Number(m[2]), fps = Number(m[3]), frames = Number(m[4]);
  const index = Math.min(frames - 1, Math.max(0, Math.round(Number(seconds) * fps)));
  const r = spawnSync(BRAW_DECODER, ["--range", file, String(index), "1"], { maxBuffer: 1 << 28, cwd: path.dirname(BRAW_DECODER) });
  if (r.status !== 0 || !r.stdout || r.stdout.length !== width * height * 4) throw new Error("BRAW decode failed at frame " + index + ": " + String(r.stderr || "").trim().slice(0, 200));
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < r.stdout.length; i += 4, j += 3) { rgb[j] = r.stdout[i]; rgb[j + 1] = r.stdout[i + 1]; rgb[j + 2] = r.stdout[i + 2]; }
  return { rgb, width, height, frame: index, fps };
}

// Decoding 6K costs ~60 MB a frame and makes measure() crawl; 960 wide is plenty for shape. Scaling
// resamples, so exact clipped/crushed pixel SHARES shift a little - fine for iterating, which is why
// the exact reading comes from the real render. Pass maxWidth 0 for native size.
const DEFAULT_MAX_WIDTH = 960;

// file: media path. seconds: time in the SOURCE file (not the timeline - map it with sourceSeconds).
// Returns { rgb, width, height }, rgb packed RGB24: the shape scopes.measure() wants.
function frameRgb(file, seconds, { maxWidth = DEFAULT_MAX_WIDTH } = {}) {
  if (BRAW.test(file)) return brawFrameRgb(file, seconds);
  if (RAW_NO_DECODER.test(file)) throw new Error("no open decoder for " + base(file) + ": camera raw needs its vendor SDK or a Premiere frame export");
  const t = Math.max(0, Number(seconds) || 0);
  const { width, height } = frameSize(file, maxWidth);
  const scale = maxWidth > 0 ? ["-vf", "scale='min(" + maxWidth + ",iw)':-2"] : [];
  // -ss before -i seeks to the keyframe then decodes forward to the exact frame: fast and accurate.
  const args = ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", file, "-frames:v", "1", ...scale, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"];
  const r = spawnSync(FFMPEG, args, { maxBuffer: 1 << 28 });
  if (r.error) throw new Error("ffmpeg not runnable: " + r.error.message);
  if (r.status !== 0) throw new Error("frame decode failed at " + t + "s: " + String(r.stderr || "").trim().slice(0, 300));
  const rgb = r.stdout;
  if (!rgb || !rgb.length) throw new Error("no frame at " + t + "s (past the end of " + base(file) + "?)");
  // A truncated pipe would silently under-measure, so the pixel count must match the geometry.
  if (rgb.length !== width * height * 3) throw new Error("short frame: " + rgb.length + " bytes for " + width + "x" + height);
  return { rgb, width, height };
}

// Decoded size after scaling, from the file's own geometry (the filter keeps aspect, even height).
function frameSize(file, maxWidth = DEFAULT_MAX_WIDTH) {
  const d = mediaDims(file);
  if (!d) throw new Error("no video stream in " + base(file));
  if (!(maxWidth > 0) || d.w <= maxWidth) return { width: d.w, height: d.h };
  return { width: maxWidth, height: Math.round((d.h * maxWidth) / d.w / 2) * 2 };
}

// Timeline seconds -> seconds inside the clip's source file. The panel already reads these three
// numbers per clip: where it starts on the timeline, its in point in the source, and the media path.
function sourceSeconds(timelineSeconds, clipStart, clipInPoint) {
  const offset = Number(timelineSeconds) - Number(clipStart);
  if (!(offset >= 0)) throw new Error("timeline position is before the clip starts");
  return Number(clipInPoint) + offset;
}

const base = (f) => String(f).replace(/^.*\//, "");

module.exports = { frameRgb, frameSize, sourceSeconds, brawAvailable, DEFAULT_MAX_WIDTH };
