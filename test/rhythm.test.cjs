"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { rhythmIssues, rhythmReport } = require("../src/rhythm.cjs");

const clip = (track, name, start, end) => ({ track, name, start, end, inPoint: 0, mediaPath: "/m/" + name + ".mp4", id: name + start });
const seq = (clips, width = 1080, height = 1920) => ({ name: "s", width, height, duration: 20, clips });

test("a six-frame gap between b-roll is a flash", () => {
  const r = rhythmIssues(seq([clip("V1", "head", 0, 20), clip("V2", "a", 2, 5), clip("V2", "b", 5.24, 8)]));
  const flash = r.filter((x) => x.kind === "flash-gap");
  assert.strictEqual(flash.length, 1);
  assert.ok(/0\.24s of talking head/.test(flash[0].text));
});
test("a real return to the face is not a flash", () => {
  const r = rhythmIssues(seq([clip("V1", "head", 0, 20), clip("V2", "a", 0.5, 5), clip("V2", "b", 7, 9)]));
  assert.deepStrictEqual(r.filter((x) => x.kind === "flash-gap"), []);
});
test("a blink is flagged by its own length", () => {
  const r = rhythmIssues(seq([clip("V1", "head", 0, 20), clip("V2", "a", 0.5, 1.2)]));
  assert.strictEqual(r.filter((x) => x.kind === "blink").length, 1);
});
test("vertical wants b-roll inside the first second", () => {
  const late = seq([clip("V1", "head", 0, 20), clip("V2", "a", 3, 6)]);
  assert.strictEqual(rhythmIssues(late).filter((x) => x.kind === "late-broll").length, 1);
  assert.deepStrictEqual(rhythmIssues(late, { portrait: false }).filter((x) => x.kind === "late-broll"), []);
  const early = seq([clip("V1", "head", 0, 20), clip("V2", "a", 0.4, 4)]);
  assert.deepStrictEqual(rhythmIssues(early).filter((x) => x.kind === "late-broll"), []);
});
test("holes on the base track come first and rounding does not count", () => {
  const r = rhythmIssues(seq([clip("V1", "a", 0, 5), clip("V1", "b", 5.9, 20), clip("V2", "c", 0.5, 4)]));
  assert.strictEqual(r[0].kind, "hole");
  assert.ok(/0\.90s of nothing/.test(r[0].text));
  const tight = rhythmIssues(seq([clip("V1", "a", 0, 5), clip("V1", "b", 5.02, 20), clip("V2", "c", 0.5, 4)]));
  assert.deepStrictEqual(tight.filter((x) => x.kind === "hole"), []);
});
test("a clean cut reports nothing", () => {
  assert.strictEqual(rhythmReport(seq([clip("V1", "head", 0, 20), clip("V2", "a", 0.4, 4), clip("V2", "b", 6, 9)])), "");
});
