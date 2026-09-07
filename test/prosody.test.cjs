"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { frames, summarise, prosodyForRanges, deliveryScores } = require("../src/prosody.cjs");

function tone(seconds, hz, amp, rate = 16000) { const n = Math.round(seconds * rate); const s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate); return s; }
function wav(parts, rate = 16000) {
  const total = parts.reduce((n, p) => n + p.length, 0); const data = Buffer.alloc(total * 2); let k = 0;
  parts.forEach((p) => { for (let i = 0; i < p.length; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, p[i])) * 32767), k * 2); k++; } });
  const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pros-")), "t.wav"); fs.writeFileSync(f, Buffer.concat([h, data])); return f;
}

test("pitch and energy are measured", () => {
  const fr = frames(tone(1, 150, 0.3), 16000);
  const s = summarise(fr, 0, 1, 3);
  assert.ok(Math.abs(s.f0Median - 150) < 6, "f0 " + s.f0Median);
  assert.ok(s.energyDb > -16 && s.energyDb < -12, "energy " + s.energyDb);
  assert.strictEqual(s.pace, 3);
  assert.ok(s.voicedFraction > 0.9);
});
test("a louder take with more pitch movement scores higher delivery", () => {
  const quiet = tone(1, 140, 0.1), lively = new Float32Array(16000);
  for (let i = 0; i < 16000; i++) lively[i] = 0.3 * Math.sin((2 * Math.PI * (120 + 80 * (i / 16000)) * i) / 16000); // a sweep 120->200 Hz, louder
  const f = wav([quiet, tone(0.5, 0, 0), lively]);
  const sums = prosodyForRanges(f, [{ start: 0, end: 1, words: 4 }, { start: 1.5, end: 2.5, words: 4 }]);
  const d = deliveryScores(sums);
  assert.ok(d[1] > d[0], JSON.stringify({ sums, d }));
});
