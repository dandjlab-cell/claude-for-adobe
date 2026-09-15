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
const { FFMPEG, mediaDims } = require("./media.cjs");

// ponytail: ffmpeg only. Camera raw with no open decoder (.braw, .r3d, ProRes RAW) throws and names
// the fallback; BRAW's own SDK frame API is the upgrade path (direct per-frame decode proven in
// ASI-Evolve prototype-local/braw-smoke/braw_to_rgba.cpp against the installed SDK), and since that
// SDK is a separate EULA-gated install we must never bundle, it belongs in its own detect-and-use
// module rather than here.
const RAW_NO_DECODER = /\.(braw|r3d)$/i;

// Decoding 6K costs ~60 MB a frame and makes measure() crawl; 960 wide is plenty for shape. Scaling
// resamples, so exact clipped/crushed pixel SHARES shift a little - fine for iterating, which is why
// the exact reading comes from the real render. Pass maxWidth 0 for native size.
const DEFAULT_MAX_WIDTH = 960;

// file: media path. seconds: time in the SOURCE file (not the timeline - map it with sourceSeconds).
// Returns { rgb, width, height }, rgb packed RGB24: the shape scopes.measure() wants.
function frameRgb(file, seconds, { maxWidth = DEFAULT_MAX_WIDTH } = {}) {
  if (RAW_NO_DECODER.test(file)) throw new Error("no open decoder for " + base(file) + ": camera raw needs its vendor SDK (BRAW) or a Premiere frame export");
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

module.exports = { frameRgb, frameSize, sourceSeconds, DEFAULT_MAX_WIDTH };
