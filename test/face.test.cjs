"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { readFrame, summarise, usable } = require("../src/face.cjs");

const face = (o = {}) => ({ faces: [Object.assign({ box: [0.3, 0.2, 0.7, 0.75], yaw: 0, pitch: null, roll: 0, quality: 0.5, eyes: 0.28, mouth: 0.1, facing: 0.01, tilt: 0.47 }, o)] });

test("reads a square, open-eyed frame as usable", () => {
  const r = readFrame(face(), 3);
  assert.ok(r.face && usable(r));
  assert.ok(r.notes.includes("looking at the lens"));
});
test("a turned head is not usable", () => {
  const r = readFrame(face({ facing: 0.14 }), 3);
  assert.ok(r.notes.includes("turned away"));
  assert.strictEqual(usable(r), false);
});
test("a blink and a poor frame are both caught", () => {
  assert.strictEqual(usable(readFrame(face({ eyes: 0.05 }), 1)), false);
  assert.strictEqual(usable(readFrame(face({ quality: 0.1 }), 1)), false);
});
test("the biggest face is taken as the speaker", () => {
  const two = { faces: [face().faces[0], Object.assign({}, face().faces[0], { box: [0.0, 0.0, 0.1, 0.1], facing: 0.4 })] };
  assert.ok(readFrame(two, 1).notes.includes("looking at the lens"));
});
test("no face is reported, not guessed", () => {
  const r = readFrame({ faces: [] }, 2);
  assert.strictEqual(r.face, false);
  assert.ok(/No face in any/.test(summarise([r]).text));
});
test("a span with nothing usable says to cover it", () => {
  const rows = [readFrame(face({ facing: 0.3 }), 1), readFrame(face({ eyes: 0.02 }), 2)];
  const s = summarise(rows);
  assert.strictEqual(s.usableShare, 0);
  assert.ok(/cover this line with b-roll/.test(s.text));
});
test("the best frame is the sharpest usable one", () => {
  const s = summarise([readFrame(face({ quality: 0.4 }), 1), readFrame(face({ quality: 0.9 }), 2)]);
  assert.strictEqual(s.best.t, 2);
});
