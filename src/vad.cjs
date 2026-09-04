// Voice activity detection with Silero VAD (v6.2) through whisper.cpp's whisper-vad-speech-segments.
// Speech segments per media file, cached. This is the detector for "cut silences (voice)":
// everything outside speech is a candidate cut. No transcription involved.
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FFMPEG = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((p) => fs.existsSync(p)) || "ffmpeg";
// Bundled first (bin/ ships with the panel, Apple Silicon build), Homebrew as a dev fallback.
const VAD_BIN = process.env.PCX_VAD_BIN || [path.join(__dirname, "..", "bin", "whisper-vad-speech-segments"), "/opt/homebrew/bin/whisper-vad-speech-segments", "/usr/local/bin/whisper-vad-speech-segments"].find((p) => fs.existsSync(p)) || "";
const VAD_MODEL = process.env.PCX_VAD_MODEL || path.join(__dirname, "..", "assets", "silero-vad-v6.2.0-ggml.bin");
const CACHE_DIR = path.join(os.homedir(), "Library", "Caches", "claude-for-adobe", "vad");
const ENV = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", process.env.PATH || ""].join(":") };
// Silero knobs (whisper.cpp defaults): probability threshold, shortest speech kept, shortest gap that splits, padding.
const DEFAULTS = { threshold: 0.5, minSpeechMs: 250, minSilenceMs: 100, padMs: 30 };
const VERSION = "v1";

// 16 kHz mono PCM WAV for the VAD/Whisper binaries. macOS's built-in afconvert handles mp3/wav/aac/mov/mp4;
// ffmpeg (if installed) covers the rest (MXF, BRAW audio, ...).
function extractWav16k(mediaPath, wav) {
  const a = spawnSync("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", mediaPath, wav], { encoding: "utf8" });
  if (a.status === 0 && fs.existsSync(wav)) return;
  const x = spawnSync(FFMPEG, ["-v", "error", "-y", "-i", mediaPath, "-vn", "-ac", "1", "-ar", "16000", wav], { encoding: "utf8", env: ENV });
  if (x.status !== 0) throw new Error("audio extract failed (afconvert: " + (a.stderr || "").trim().slice(-120) + "; ffmpeg: " + (x.error ? x.error.message : (x.stderr || "").trim().slice(0, 200)) + ")");
}

function available() { return !!VAD_BIN && fs.existsSync(VAD_MODEL) && (process.arch === "arm64" || !VAD_BIN.includes(path.join("bin", "whisper-vad-speech-segments"))); } // bundled binary is Apple Silicon only

function cachePath(mediaPath, opts) {
  const st = fs.statSync(mediaPath);
  const key = crypto.createHash("sha1").update([VERSION, mediaPath, st.size, st.mtimeMs, JSON.stringify(opts)].join("|")).digest("hex").slice(0, 12);
  return path.join(CACHE_DIR, path.basename(mediaPath) + "." + key + ".vad.json");
}

// "Speech segment 3: start = 1555.00, end = 1677.00" -> seconds (the tool prints centiseconds).
function parseSegments(stdout) {
  const out = [];
  String(stdout).split("\n").forEach((line) => {
    const m = line.match(/Speech segment \d+: start = ([\d.]+), end = ([\d.]+)/);
    if (m) out.push({ start: Number(m[1]) / 100, end: Number(m[2]) / 100 });
  });
  return out;
}

// Speech segments [{start,end}] in source seconds for a whole media file.
function speechSegments(mediaPath, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!available()) throw new Error(process.arch !== "arm64" ? "Voice detection needs an Apple Silicon Mac (use the dB method)" : "Silero VAD unavailable (need whisper-vad-speech-segments and " + VAD_MODEL + ")");
  const cache = cachePath(mediaPath, opts);
  if (fs.existsSync(cache)) return { ...JSON.parse(fs.readFileSync(cache, "utf8")), cached: true };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const wav = path.join(os.tmpdir(), "pcx-vad-" + Date.now().toString(36) + ".wav");
  try {
    extractWav16k(mediaPath, wav);
    const args = ["-vm", VAD_MODEL, "-np", "-vt", String(opts.threshold), "-vspd", String(opts.minSpeechMs), "-vsd", String(opts.minSilenceMs), "-vp", String(opts.padMs), "-f", wav];
    let r = spawnSync(VAD_BIN, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: ENV });
    let segments = parseSegments(r.stdout);
    if (!segments.length && !/Detected 0 speech/.test(r.stdout)) {
      // some builds reject the tuning flags; retry with defaults
      r = spawnSync(VAD_BIN, ["-vm", VAD_MODEL, "-np", "-f", wav], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: ENV });
      segments = parseSegments(r.stdout);
      if (!segments.length && !/Detected 0 speech/.test(r.stdout)) throw new Error("VAD produced no segments: " + (r.stderr || r.stdout || "").trim().slice(-200));
    }
    const result = { segments, options: opts, model: path.basename(VAD_MODEL), createdAt: new Date().toISOString() };
    fs.writeFileSync(cache, JSON.stringify(result));
    return { ...result, cached: false };
  } finally { try { fs.unlinkSync(wav); } catch (_) {} }
}

module.exports = { extractWav16k, DEFAULTS, VAD_BIN, VAD_MODEL, available, parseSegments, speechSegments };
