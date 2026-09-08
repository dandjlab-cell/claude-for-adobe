"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { measureSamples, snapSpan, pauseBefore } = require("../src/silence_map.cjs");
const A = require("../src/thoughts_authored.cjs");

test("measured quiet runs include file edges and preserve a short sound", () => {
  const samples = new Float32Array(3000);
  samples.fill(.1, 0, 1000); samples.fill(.1, 2000, 2050);
  assert.deepEqual(measureSamples(samples, 1000), [{ start: 1, end: 2 }, { start: 2.05, end: 3 }]);
  assert.deepEqual(measureSamples(new Float32Array(1000).fill(.1), 1000), []);
  assert.throws(() => measureSamples(samples, 1000, { noiseDb: NaN }));
});

test("snaps glued pause edges, caps movement at four seconds, and refuses inverted spans", () => {
  const silence = [{ start: 1, end: 4 }];
  assert.deepEqual(snapSpan(2, 5, silence), { start: 4, end: 5, notes: [] });
  assert.deepEqual(snapSpan(0, 3, silence), { start: 0, end: 1, notes: [] });
  const cap = snapSpan(0, 6.5, [{ start: 1, end: 6.4 }]);
  assert.equal(cap.end, 6.5); assert.ok(cap.notes.some(n => /4/.test(n)));
  const crossed = snapSpan(2, 3, silence);
  assert.equal(crossed.start, 2); assert.equal(crossed.end, 3); assert.ok(crossed.notes.length);
  assert.equal(pauseBefore(4, 2, silence), 3);
  assert.equal(pauseBefore(4, 2, []), 0);
});

test("authored edit boundaries and delivery use audio pauses without rewriting words", () => {
  const words = [{ text: "First", start: 0, end: .5 }, { text: "thought.", start: .5, end: 4 }, { text: "Next", start: 4, end: 5 }, { text: "thought.", start: 5, end: 6 }];
  const raw = JSON.stringify(words);
  const thoughts = A.validateDraft(words, { thoughts: [{ id: "a", word_start_i: 0, word_end_i: 1 }, { id: "b", word_start_i: 2, word_end_i: 3 }] }).thoughts;
  const plan = A.planFromThoughts(words, thoughts, { silences: [{ start: 1, end: 4 }] });
  assert.equal(plan.keep[0].end, 1);
  assert.equal(plan.keep[1].start, 4);
  assert.equal(plan.ranges.length, 2);
  assert.ok(!plan.notes.some(n => /cut-in at 4.00s follows only/.test(n)));
  assert.equal(JSON.stringify(words), raw);
  const whole = A.validateDraft(words, { thoughts: [{ word_start_i: 0, word_end_i: 3 }] }).thoughts[0];
  assert.equal(A.qualify(words, whole, null, null, [{ start: 1, end: 4 }]).delivery.pauseTotal, 3);
});

test("an explicitly empty audio layer never invents pauses from word gaps", () => {
  const words = [{ text: "First", start: 0, end: 1 }, { text: "second", start: 4, end: 5 }];
  const thought = A.validateDraft(words, { thoughts: [{ word_start_i: 0, word_end_i: 1 }] }).thoughts[0];
  assert.equal(A.qualify(words, thought, null, null, []).delivery.pauseTotal, 0);
  assert.equal(A.qualify(words, thought, null, null).delivery.pauseTotal, 3);
});

test("restart phrase boundaries use a measured pause hidden inside the previous word", () => {
  const words = "Well we painted the walls blue then we painted the walls green".split(" ").map((text, i) => ({ text, start: i * .3 + (i >= 7 ? 3 : 0), end: (i + 1) * .3 + (i >= 6 ? 3 : 0) }));
  const measured = A.findRestarts(words, [{ start: 2.1, end: 5.1 }]);
  assert.equal(measured.length, 1);
  assert.equal(measured[0].cutEnd, words[7].start);
  assert.notEqual(A.findRestarts(words)[0].cutEnd, measured[0].cutEnd);
});

test("PCM16 threshold matches integer silencedetect at the noise-floor boundary", () => {
  const samples = new Float32Array(1000); samples[300] = 582 / 32768;
  assert.deepEqual(measureSamples(samples, 1000), [{ start: 0, end: .3 }, { start: .301, end: 1 }]);
});

test("WAV measurement accepts the render format and rejects wrong or truncated PCM", () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { measureWav } = require("../src/silence_map.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-silence-test-")), file = path.join(dir, "render.wav");
  try {
    const wav = Buffer.alloc(44 + 32000);
    wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(32000, 40);
    fs.writeFileSync(file, wav);
    assert.deepEqual(measureWav(file).silences, [{ start: 0, end: 1 }]);
    wav.writeUInt16LE(3, 20); fs.writeFileSync(file, wav);
    assert.throws(() => measureWav(file), /PCM16/);
    fs.writeFileSync(file, wav.subarray(0, 40));
    assert.throws(() => measureWav(file), /PCM16|data|truncated/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
