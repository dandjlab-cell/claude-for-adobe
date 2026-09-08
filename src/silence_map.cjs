"use strict";
// House Tour Cut c3ebf67: measure pauses separately; never rewrite Whisper words.
const fs = require("node:fs");
const { readWav } = require("./prosody.cjs");

function measureSamples(samples, rate, { noiseDb = -35, minSilence = .25 } = {}) {
  if (!Number.isFinite(noiseDb) || noiseDb < -100 || noiseDb > 0 || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(minSilence) || minSilence <= 0) throw new Error("invalid silence measurement settings");
  // Match silencedetect on PCM16: the amplitude threshold is quantized to an integer sample.
  const threshold = Math.floor(Math.pow(10, noiseDb / 20) * 32768) / 32768, silences = [];
  let start = null;
  for (let i = 0; i <= samples.length; i++) {
    if (i < samples.length && !Number.isFinite(samples[i])) throw new Error("invalid PCM sample");
    if (i < samples.length && Math.abs(samples[i]) < threshold) { if (start === null) start = i; }
    else if (start !== null) { if ((i - start) / rate >= minSilence) silences.push({ start: start / rate, end: i / rate }); start = null; }
  }
  return silences;
}

function measureWav(file, options = {}) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("silence analysis needs a PCM WAV render");
  let valid = false;
  for (let off = 12; off + 8 <= b.length;) {
    const size = b.readUInt32LE(off + 4);
    if (off + 8 + size > b.length) throw new Error("truncated WAV render");
    if (b.toString("ascii", off, off + 4) === "fmt " && size >= 16) valid = b.readUInt16LE(off + 8) === 1 && b.readUInt16LE(off + 10) === 1 && b.readUInt32LE(off + 12) === 16000 && b.readUInt16LE(off + 22) === 16;
    off += 8 + size + (size % 2);
  }
  if (!valid) throw new Error("silence analysis needs mono PCM16 at 16000 Hz");
  const { samples, rate } = readWav(file);
  if (!samples.length) throw new Error("empty audio render");
  return { schema: "cfa-silence", version: 1, method: "pcm-threshold-v1", noiseDb: options.noiseDb ?? -35, minSilence: options.minSilence ?? .25, duration: samples.length / rate, silences: measureSamples(samples, rate, options) };
}

function snapSpan(start, end, silences) {
  let a = start, b = end; const notes = [];
  for (const s of silences) {
    if (s.start - .2 <= start && start < s.end) {
      if (s.end - start <= 4) a = Math.max(a, s.end);
      else notes.push("cut-in inside silence exceeds the 4 s snap limit; listen before applying");
    }
    if (s.start < end && end <= s.end + .2) {
      if (end - s.start <= 4) b = Math.min(b, s.start);
      else notes.push("cut-out inside silence exceeds the 4 s snap limit; listen before applying");
    }
  }
  if (a >= b) return { start, end, notes: [...notes, "silence snap would erase the span; kept original boundaries, listen before applying"] };
  return { start: a, end: b, notes };
}

function pauseBefore(at, rawWordStart, silences) {
  let best = 0;
  for (const s of silences) if ((s.start <= at && at <= s.end + .05) || (rawWordStart - .5 <= s.end && s.end <= rawWordStart + .05)) best = Math.max(best, s.end - s.start);
  return best;
}

module.exports = { measureSamples, measureWav, snapSpan, pauseBefore };
