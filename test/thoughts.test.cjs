"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { planThoughts, report } = require("../src/thoughts.cjs");

function say(lines, t0 = 0, gapBetween = 1.0) {
  const words = []; let t = t0;
  for (const line of lines) { for (const w of line.split(" ")) { words.push({ text: w, start: t, end: t + 0.3 }); t += 0.3; } t += gapBetween; }
  return words;
}

test("a false start is dropped whole and the complete line is kept", () => {
  const p = planThoughts(say(["So the thing about Premiere", "So the thing about Premiere is that it never tells you why.", "And that is the whole problem with it."]));
  assert.strictEqual(p.keep.length, 2);
  assert.strictEqual(p.drop.length, 1);
  assert.ok(/false start|take of the same line/.test(p.drop[0].reason), p.drop[0].reason);
  assert.ok(/never tells you why\./.test(p.keep[0].text));
});
test("cuts land only between thoughts, with air, and near neighbours stay joined", () => {
  const p = planThoughts(say(["First complete thought here.", "Second complete thought here."], 0, 0.3));
  assert.strictEqual(p.ranges.length, 1, "0.3 s apart: one range, no micro-cut");
  const q = planThoughts(say(["First complete thought here.", "Second complete thought here."], 0, 3.0));
  assert.strictEqual(q.ranges.length, 2);
  assert.ok(q.ranges[0].end > p.keep[0].end, "air after the thought");
  assert.ok(q.ranges[1].start < q.keep[1].start, "air before the next");
});
test("a losing take is dropped whole", () => {
  const p = planThoughts(say(["Premiere never tells you why the um extract failed", "Premiere never tells you why the extract failed.", "Moving on to the next section now."]));
  assert.strictEqual(p.keep.length, 2);
  assert.ok(/take of the same line/.test(p.drop[0].reason));
});
test("a one-word grunt is a fragment; a short complete answer is kept", () => {
  const p = planThoughts(say(["Yeah", "Yes, exactly that.", "We shot it on Tuesday."]));
  assert.ok(p.drop.some((d) => /fragment/.test(d.reason)));
  assert.ok(p.keep.some((k) => /exactly that/.test(k.text)));
  assert.ok(/Kept thoughts/.test(report(p)));
});
