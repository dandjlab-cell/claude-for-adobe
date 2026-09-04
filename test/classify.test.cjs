const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyMedia, formatClassification } = require("../src/classify.cjs");

test("classifyMedia buckets by speech coverage and flags the ambiguous middle", () => {
  assert.equal(classifyMedia({ name: "A056_05042034_C180.braw", duration: 600, speechSeconds: 480, hasTranscript: true }).kind, "talking head / interview");
  assert.equal(classifyMedia({ name: "drone.mp4", duration: 60, speechSeconds: 1 }).kind, "b-roll / little dialogue");
  const mixed = classifyMedia({ name: "walk.mov", duration: 100, speechSeconds: 30 });
  assert.equal(mixed.kind, "mixed (dialogue + b-roll)"); assert.equal(mixed.lookAtFrame, true);
  assert.equal(classifyMedia({ name: "music.wav", duration: 30, speechSeconds: 0 }).kind, "silent / music");
  assert.equal(classifyMedia({ name: "A056_05042034_C180.braw", duration: 1 }).camera, true);
  assert.match(formatClassification([mixed]), /walk\.mov  1:40  speech 30% \(vad\)  -> mixed .* look at a frame/);
});
