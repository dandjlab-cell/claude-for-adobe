"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parseWindows, segments, report } = require("../src/sounds.cjs");

const W = (t0, labels) => JSON.stringify({ t0, t1: t0 + 1, labels });
const text = [
  W(0.0, [["speech", 0.9]]),
  W(0.5, [["speech", 0.6], ["laughter", 0.42]]),
  W(1.0, [["speech", 0.8], ["laughter", 0.55]]),
  W(1.5, [["speech", 0.9], ["laughter", 0.14]]),
  W(4.0, [["applause", 0.7], ["clapping", 0.5]]),
  W(4.5, [["applause", 0.8]]),
  W(9.0, [["music", 0.5]]),
].join("\n");

test("windows become merged segments per group with a peak", () => {
  const segs = segments(parseWindows(text));
  const laugh = segs.find((s) => s.group === "laughter");
  assert.deepStrictEqual([laugh.start, laugh.end, laugh.peak, laugh.label], [1.0, 2.0, 0.55, "laughter"], "0.42 under speech at 0.6 is a runner-up, not a laugh; 0.55 under speech counts");
  const clap = segs.find((s) => s.group === "applause");
  assert.deepStrictEqual([clap.start, clap.end, clap.peak], [4.0, 5.5, 0.8]);
  assert.strictEqual(segs.filter((s) => s.group === "music").length, 1);
});
test("low confidence never makes a segment, and offset shifts to timeline time", () => {
  const segs = segments(parseWindows(W(0, [["laughter", 0.2]])));
  assert.deepStrictEqual(segs, []);
  const shifted = segments(parseWindows(W(0, [["laughter", 0.5]])), { offset: 10 });
  assert.strictEqual(shifted[0].start, 10);
});
test("report is one line per group", () => {
  assert.ok(/laughter \(1\): 1\.00s-2\.00s laughter 0\.55/.test(report(segments(parseWindows(text)))));
  assert.ok(/No laughter/.test(report([])));
});

test("a runner-up label under strong speech is not an event (music on a talking head)", () => {
  const t = [
    W(0.0, [["speech", 0.88], ["music", 0.58]]),
    W(0.5, [["speech", 0.9], ["music", 0.47]]),
    W(1.0, [["music", 0.62], ["speech", 0.2]]),
  ].join("\n");
  const segs = segments(parseWindows(t));
  assert.deepStrictEqual(segs.map((s) => [s.group, s.start]), [["music", 1.0]], "only the window where music is the strongest label");
});
test("a laugh under speech still counts above the higher bar", () => {
  const t = [W(0.0, [["speech", 0.8], ["laughter", 0.6]]), W(0.5, [["speech", 0.8], ["laughter", 0.4]])].join("\n");
  const segs = segments(parseWindows(t));
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0].end, 1.0, "0.6 under speech counts, 0.4 under speech does not");
});
