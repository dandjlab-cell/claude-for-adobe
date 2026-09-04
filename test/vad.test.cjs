const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSegments, available } = require("../src/vad.cjs");

test("parseSegments reads whisper.cpp VAD output in centiseconds", () => {
  const out = "\nDetected 2 speech segments:\nSpeech segment 0: start = 346.00, end = 441.00\nSpeech segment 1: start = 499.00, end = 864.00\nnoise\n";
  assert.deepEqual(parseSegments(out), [{ start: 3.46, end: 4.41 }, { start: 4.99, end: 8.64 }]);
  assert.deepEqual(parseSegments("Detected 0 speech segments:"), []);
});

test("Silero VAD binary and model are available on this machine", () => { assert.equal(available(), true); });
