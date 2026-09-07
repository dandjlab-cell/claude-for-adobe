const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSegments, available } = require("../src/vad.cjs");

test("parseSegments reads whisper.cpp VAD output in centiseconds", () => {
  const out = "\nDetected 2 speech segments:\nSpeech segment 0: start = 346.00, end = 441.00\nSpeech segment 1: start = 499.00, end = 864.00\nnoise\n";
  assert.deepEqual(parseSegments(out), [{ start: 3.46, end: 4.41 }, { start: 4.99, end: 8.64 }]);
  assert.deepEqual(parseSegments("Detected 0 speech segments:"), []);
});

test("Silero VAD binary and model are available on this machine", () => { assert.equal(available(), true); });

test("wavPeak tells a silent decode from a real signal", () => {
  const { wavPeak, SILENT_PEAK } = require("../src/vad.cjs");
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const mk = (samples) => { const data = Buffer.alloc(samples.length * 2); samples.forEach((v, i) => data.writeInt16LE(v, i * 2)); const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40); const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wav-")), "t.wav"); fs.writeFileSync(f, Buffer.concat([h, data])); return f; };
  assert.ok(wavPeak(mk(new Array(16000).fill(0))) < SILENT_PEAK);
  assert.ok(wavPeak(mk(Array.from({ length: 16000 }, (_, i) => Math.round(8000 * Math.sin(i / 10))))) > 0.2);
});
