// Prosody per range, ported from VO Studio's audio_prosody.py (NumPy) to plain Node: RMS energy and pitch by
// normalised autocorrelation on 30 ms frames of the 16 kHz mono render the panel already makes for Whisper.
// Cheap: a minute of audio is a few million multiply-adds. Summaries per take, never raw numbers to the model.
"use strict";
const fs = require("node:fs");

const FRAME = 480, HOP = 160, MIN_F0 = 75, MAX_F0 = 400, RMS_SILENCE = 0.01, VOICING = 0.3;

// 16-bit PCM mono WAV -> Float32Array in [-1, 1] and the sample rate.
function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12, rate = 16000, channels = 1, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4), len = b.readUInt32LE(off + 4);
    if (id === "fmt ") { channels = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); }
    if (id === "data") { data = [off + 8, Math.min(b.length, off + 8 + len)]; break; }
    off += 8 + len + (len % 2);
  }
  if (!data) throw new Error("no data chunk");
  const n = Math.floor((data[1] - data[0]) / 2 / channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = b.readInt16LE(data[0] + i * 2 * channels) / 32768;
  return { samples: out, rate };
}

// Per frame: rms and f0 (NaN when unvoiced). Frames start at multiples of HOP.
function frames(samples, rate) {
  const minLag = Math.floor(rate / MAX_F0), maxLag = Math.ceil(rate / MIN_F0);
  const out = [];
  const win = new Float32Array(FRAME); for (let i = 0; i < FRAME; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const x = new Float32Array(FRAME);
  for (let s = 0; s + FRAME <= samples.length; s += HOP) {
    let sum = 0, mean = 0;
    for (let i = 0; i < FRAME; i++) mean += samples[s + i];
    mean /= FRAME;
    for (let i = 0; i < FRAME; i++) { const v = samples[s + i] - mean; x[i] = v * win[i]; sum += samples[s + i] * samples[s + i]; }
    const rms = Math.sqrt(sum / FRAME);
    let f0 = NaN;
    if (rms >= RMS_SILENCE) {
      let best = 0, bestLag = 0;
      for (let lag = minLag; lag <= maxLag; lag++) {
        let num = 0, l = 0, r = 0;
        for (let i = 0; i + lag < FRAME; i++) { num += x[i] * x[i + lag]; l += x[i] * x[i]; r += x[i + lag] * x[i + lag]; }
        const d = Math.sqrt(l * r);
        const c = d > 0 ? num / d : 0;
        if (c > best) { best = c; bestLag = lag; }
      }
      if (best >= VOICING && bestLag) f0 = rate / bestLag;
    }
    out.push({ t: s / rate, rms, f0 });
  }
  return out;
}

const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// Summary of one time range: energy (dB), voiced fraction, median pitch and its spread, plus pace from words.
function summarise(fr, start, end, wordCount) {
  const inside = fr.filter((f) => f.t >= start && f.t < end);
  const loud = inside.filter((f) => f.rms >= RMS_SILENCE);
  const voiced = inside.filter((f) => !Number.isNaN(f.f0)).map((f) => f.f0);
  const rms = loud.length ? Math.sqrt(loud.reduce((s, f) => s + f.rms * f.rms, 0) / loud.length) : 0;
  return {
    energyDb: rms > 0 ? Number((20 * Math.log10(rms)).toFixed(1)) : -Infinity,
    voicedFraction: inside.length ? Number((voiced.length / inside.length).toFixed(2)) : 0,
    f0Median: voiced.length ? Number(median(voiced).toFixed(0)) : null,
    f0Range: voiced.length > 4 ? Number((pct(voiced, 0.9) - pct(voiced, 0.1)).toFixed(0)) : null,
    pace: end > start && wordCount !== undefined ? Number((wordCount / (end - start)).toFixed(2)) : null,
  };
}

// Prosody for several ranges of one WAV, computing the frames once.
function prosodyForRanges(wavFile, ranges) {
  const { samples, rate } = readWav(wavFile);
  const fr = frames(samples, rate);
  return ranges.map((r) => summarise(fr, r.start, r.end, r.words));
}

// Delivery score of a take within its group: louder, more pitch movement, not rushed or dragging, relative to
// the group's medians. Zero means average; each unit is roughly one "noticeably better" step.
function deliveryScores(summaries) {
  const e = summaries.map((s) => s.energyDb).filter(Number.isFinite), f = summaries.map((s) => s.f0Range).filter((x) => x !== null), p = summaries.map((s) => s.pace).filter((x) => x !== null);
  const me = median(e), mf = median(f), mp = median(p);
  return summaries.map((s) => {
    let d = 0;
    if (Number.isFinite(s.energyDb) && Number.isFinite(me)) d += Math.max(-1, Math.min(1, (s.energyDb - me) / 3));   // 3 dB louder = +1
    if (s.f0Range !== null && Number.isFinite(mf) && mf > 0) d += Math.max(-1, Math.min(1, (s.f0Range - mf) / mf)); // twice the pitch range = +1
    if (s.pace !== null && Number.isFinite(mp) && mp > 0) d -= Math.min(1, Math.abs(s.pace - mp) / mp);              // off the speaker's pace = penalty
    return Number(d.toFixed(2));
  });
}

module.exports = { readWav, frames, summarise, prosodyForRanges, deliveryScores, FRAME, HOP };
