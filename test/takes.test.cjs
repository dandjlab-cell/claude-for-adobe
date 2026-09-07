"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { findTakes, utterances, report } = require("../src/takes.cjs");

// words at 0.3 s each, gap of 1 s between utterances
function say(lines, t0 = 0) {
  const words = []; let t = t0;
  for (const line of lines) { for (const w of line.split(" ")) { words.push({ text: w, start: t, end: t + 0.3 }); t += 0.3; } t += 1.0; }
  return words;
}

test("a restart and a clean retake form one group and the complete take is kept", () => {
  const words = say(["So the thing about um Premiere is that it", "So the thing about Premiere is that it never tells you why.", "Anyway let's move on to the next part."]);
  const g = findTakes(words);
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].candidates.length, 2);
  assert.strictEqual(g[0].keep, 1, "the finished, filler-free retake is kept");
  assert.strictEqual(g[0].remove.length, 1);
  assert.ok(/KEEP/.test(report(g)));
});
test("short natural repeats and unrelated lines are not takes", () => {
  const words = say(["Okay.", "Okay.", "We shot the interview on Tuesday.", "The weather was terrible all week."]);
  assert.deepStrictEqual(findTakes(words), []);
});
test("takes far apart are not grouped", () => {
  const words = say(["Premiere never tells you why the cut failed."]).concat(say(["Premiere never tells you why the cut failed."], 200));
  assert.deepStrictEqual(findTakes(words, { window: 90 }), []);
  assert.strictEqual(findTakes(words, { window: 300 }).length, 1);
});
test("utterances split at pauses and sentence ends", () => {
  const u = utterances(say(["Hello there.", "How are you"]));
  assert.strictEqual(u.length, 2);
});
