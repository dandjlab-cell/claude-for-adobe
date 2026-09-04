// Premiere's own waveform: the .pek peak-file cache it writes on import and draws in the timeline.
// Format (cracked 2026-09-03 against ffmpeg-decoded PCM, r=0.99): 68-byte header, magic 0x67235411,
// uint32 channel count at 0x08, uint32 body length at 0x40; body is channel-sequential, one signed
// int16 (max, min) pair per 256 source samples. Pure Node, no ffmpeg.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAGIC = 0x67235411;
const HEADER = 0x44;
const SAMPLES_PER_PAIR = 256;

function peakDirs(projectPath) {
  const dirs = [];
  const common = path.join(os.homedir(), "Library", "Application Support", "Adobe", "Common", "Peak Files");
  if (fs.existsSync(common)) fs.readdirSync(common).forEach((d) => dirs.push(path.join(common, d)));
  if (projectPath) dirs.push(path.join(path.dirname(projectPath), "Adobe Premiere Pro Audio Previews"));
  return dirs.filter((d) => fs.existsSync(d));
}

// Newest "<media basename> <rate>[_n].pek" across the cache folders, or null.
function findPeakFile(mediaPath, sampleRate = 48000, projectPath = "") {
  const prefix = path.basename(mediaPath) + " " + sampleRate;
  let best = null;
  peakDirs(projectPath).forEach((dir) => {
    fs.readdirSync(dir).forEach((name) => {
      if (!name.startsWith(prefix) || !name.endsWith(".pek")) return;
      const rest = name.slice(prefix.length, -4);
      if (rest && !/^_\d+$/.test(rest)) return;
      const file = path.join(dir, name);
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    });
  });
  return best && best.file;
}

function parsePeakFile(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < HEADER || buf.readUInt32LE(0) !== MAGIC) throw new Error("Not a Premiere peak file: " + file);
  const channels = buf.readUInt32LE(8) || 1;
  const bytes = Math.min(buf.readUInt32LE(0x40), buf.length - HEADER);
  const pairsPerChannel = Math.floor(bytes / 4 / channels);
  const peaks = [];
  for (let c = 0; c < channels; c++) {
    const arr = new Int16Array(pairsPerChannel * 2);
    const base = HEADER + c * pairsPerChannel * 4;
    for (let i = 0; i < arr.length; i++) arr[i] = buf.readInt16LE(base + i * 2);
    peaks.push(arr);
  }
  return { channels, pairsPerChannel, samplesPerPair: SAMPLES_PER_PAIR, peaks };
}

// Max absolute peak (0..1) per window over a source range, all channels folded together.
function peakWindows(parsed, sampleRate, sourceStart, duration, windowSeconds, offsetSeconds = 0) {
  const pairsPerSecond = sampleRate / parsed.samplesPerPair;
  const first = Math.max(0, Math.floor(sourceStart * pairsPerSecond));
  const last = Math.min(parsed.pairsPerChannel, Math.ceil((sourceStart + duration) * pairsPerSecond));
  const per = Math.max(1, Math.round(windowSeconds * pairsPerSecond));
  const windows = [];
  for (let i = first; i < last; i += per) {
    let peak = 0;
    for (let j = i; j < Math.min(last, i + per); j++) {
      parsed.peaks.forEach((ch) => { const a = Math.max(Math.abs(ch[2 * j]), Math.abs(ch[2 * j + 1])); if (a > peak) peak = a; });
    }
    windows.push({ t: offsetSeconds + (i - first) / pairsPerSecond, peak: peak / 32768 });
  }
  return windows;
}

module.exports = { MAGIC, SAMPLES_PER_PAIR, findPeakFile, parsePeakFile, peakWindows };
