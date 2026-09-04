// Eyes and ears for the panel: frame downscaling (sips, macOS built-in) and audio analysis
// (ffmpeg on the clips' source files). Pure Node; nothing here touches Premiere.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const FFMPEG = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((p) => fs.existsSync(p)) || "ffmpeg";
const FFPROBE = FFMPEG.replace(/ffmpeg$/, "ffprobe");
const SILENCE_DB = -40;
const MIN_SILENCE_S = 0.25;
const MAX_WINDOWS = 400;

function resizeImage(src, dst, maxPx = 512) {
  const fmt = /\.jpe?g$/i.test(dst) ? ["-s", "format", "jpeg", "-s", "formatOptions", "80"] : [];
  const r = spawnSync("/usr/bin/sips", [...fmt, "-Z", String(maxPx), src, "--out", dst], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("sips failed: " + (r.stderr || r.stdout));
  return dst;
}

function mediaInfo(file) {
  const r = spawnSync(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffprobe failed: " + (r.stderr || "").trim().slice(0, 300));
  const info = JSON.parse(r.stdout);
  const fmt = info.format || {};
  const streams = (info.streams || []).map((s) => s.codec_type === "video"
    ? `video ${s.codec_name} ${s.width}x${s.height} ${s.r_frame_rate} fps${s.display_aspect_ratio ? " DAR " + s.display_aspect_ratio : ""}${s.nb_frames ? " " + s.nb_frames + " frames" : ""}`
    : s.codec_type === "audio" ? `audio ${s.codec_name} ${s.sample_rate} Hz ${s.channels} ch${s.channel_layout ? " (" + s.channel_layout + ")" : ""}` : s.codec_type);
  return `${file}\nduration ${Number(fmt.duration || 0).toFixed(3)} s, ${fmt.format_name}, ${(Number(fmt.size || 0) / 1e6).toFixed(1)} MB\n` + streams.join("\n");
}

function decodePcm(file, startSeconds, durationSeconds, sampleRate = 8000) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-ss", String(Math.max(0, startSeconds)), "-t", String(durationSeconds), "-i", file, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + String(r.stderr || "").trim().slice(0, 300));
  return new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
}

const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -100);

// Per-window RMS/peak in dBFS plus silence ranges. `offsetSeconds` is where sample 0 sits on the timeline.
function analyzeLevels(samples, sampleRate, windowMs, offsetSeconds = 0) {
  const total = samples.length / sampleRate;
  let win = windowMs / 1000;
  if (total / win > MAX_WINDOWS) win = total / MAX_WINDOWS;
  const size = Math.max(1, Math.round(win * sampleRate));
  const windows = [];
  for (let i = 0; i < samples.length; i += size) {
    let sum = 0, peak = 0;
    const end = Math.min(samples.length, i + size);
    for (let j = i; j < end; j++) { const v = samples[j] / 32768; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    windows.push({ t: offsetSeconds + i / sampleRate, rmsDb: toDb(Math.sqrt(sum / (end - i))), peakDb: toDb(peak) });
  }
  const silences = [];
  let cur = null;
  windows.forEach((w, i) => {
    const quiet = w.rmsDb < SILENCE_DB;
    if (quiet && !cur) cur = { start: w.t };
    const last = i === windows.length - 1;
    if (cur && (!quiet || last)) { cur.end = quiet && last ? w.t + win : w.t; if (cur.end - cur.start >= MIN_SILENCE_S) silences.push(cur); cur = null; }
  });
  return { windows, silences, windowSeconds: win, durationSeconds: total };
}

function formatLevels(a, label) {
  const bars = " ▁▂▃▄▅▆▇█";
  const spark = a.windows.map((w) => bars[Math.max(0, Math.min(8, Math.round((w.rmsDb + 60) / 60 * 8)))]).join("");
  const loud = a.windows.filter((w) => w.rmsDb >= SILENCE_DB);
  const avg = loud.length ? loud.reduce((s, w) => s + w.rmsDb, 0) / loud.length : -100;
  const peak = Math.max(...a.windows.map((w) => w.peakDb), -100);
  const t0 = a.windows.length ? a.windows[0].t : 0;
  const lines = [
    `${label}: ${t0.toFixed(2)}s to ${(t0 + a.durationSeconds).toFixed(2)}s, ${a.windows.length} windows of ${(a.windowSeconds * 1000).toFixed(0)} ms, avg RMS ${avg.toFixed(1)} dBFS (non-silent), peak ${peak.toFixed(1)} dBFS`,
    `waveform (RMS, each char = ${(a.windowSeconds * 1000).toFixed(0)} ms): ${spark}`,
    `silences below ${SILENCE_DB} dB for >= ${MIN_SILENCE_S}s: ` + (a.silences.length ? a.silences.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)}s`).join(", ") : "none"),
  ];
  return lines.join("\n");
}

// Peak-file windows (max |peak| 0..1 per window) -> same report shape. Silence threshold adapts to the
// clip's own noise floor (10th percentile + 8 dB, clamped), and gaps under 150 ms are merged.
const MERGE_GAP_S = 0.15;
function peakSilenceThreshold(dbs) {
  const sorted = [...dbs].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -60;
  return Math.max(-60, Math.min(-30, floor + 8));
}
function formatPeakWindows(windows, windowSeconds, label) {
  const bars = " ▁▂▃▄▅▆▇█";
  const dbs = windows.map((w) => toDb(w.peak));
  const spark = dbs.map((d) => bars[Math.max(0, Math.min(8, Math.round((d + 60) / 60 * 8)))]).join("");
  const PEAK_SILENCE_DB = peakSilenceThreshold(dbs);
  const silences = [];
  let cur = null;
  windows.forEach((w, i) => {
    const quiet = dbs[i] < PEAK_SILENCE_DB, last = i === windows.length - 1;
    if (quiet && !cur) cur = { start: w.t };
    if (cur && (!quiet || last)) {
      cur.end = quiet && last ? w.t + windowSeconds : w.t;
      const prev = silences[silences.length - 1];
      if (prev && cur.start - prev.end < MERGE_GAP_S) prev.end = cur.end; else silences.push(cur);
      cur = null;
    }
  });
  for (let i = silences.length - 1; i >= 0; i--) if (silences[i].end - silences[i].start < MIN_SILENCE_S) silences.splice(i, 1);
  const t0 = windows.length ? windows[0].t : 0;
  return [
    `${label}: ${t0.toFixed(2)}s to ${(t0 + windows.length * windowSeconds).toFixed(2)}s, ${windows.length} windows of ${(windowSeconds * 1000).toFixed(0)} ms, peak ${Math.max(...dbs, -100).toFixed(1)} dBFS (source: Premiere peak file, the timeline waveform)`,
    `waveform (peak, each char = ${(windowSeconds * 1000).toFixed(0)} ms): ${spark}`,
    `silences below ${PEAK_SILENCE_DB.toFixed(0)} dBFS peak (noise floor + 8 dB) for >= ${MIN_SILENCE_S}s: ` + (silences.length ? silences.map((x) => `${x.start.toFixed(2)}-${x.end.toFixed(2)}s`).join(", ") : "none"),
  ].join("\n");
}

function audioLevels({ file, sourceStart, duration, timelineStart, windowMs = 100, label = file }) {
  const rate = 8000;
  const samples = decodePcm(file, sourceStart, duration, rate);
  return formatLevels(analyzeLevels(samples, rate, windowMs, timelineStart), label);
}

module.exports = { FFMPEG, MAX_WINDOWS, SILENCE_DB, analyzeLevels, audioLevels, decodePcm, formatLevels, formatPeakWindows, mediaInfo, resizeImage };
