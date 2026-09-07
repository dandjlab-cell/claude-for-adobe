"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { findRestarts, validateDraft, planFromThoughts, report } = require("../src/thoughts_authored.cjs");

function say(lines, t0 = 0, gapBetween = 1.0) {
  const words = []; let t = t0;
  for (const line of lines) { for (const w of line.split(" ")) { words.push({ text: w, start: t, end: t + 0.3 }); t += 0.3; } t += gapBetween; }
  return words;
}

test("a flubbed line restarted inside a thought: the first attempt is cut, the retake kept", () => {
  const rows = say(["it would have been such a shame to cut off but actually it would have been such a shame to kind of cut off the view."]);
  const r = findRestarts(rows);
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].cutStart < r[0].cutEnd);
  assert.ok(/such a shame to cut off/.test(r[0].phrase));
});
test("a parallel construction is not a restart", () => {
  const rows = say(["we painted the walls and we painted the ceiling and we painted the doors."]);
  assert.deepStrictEqual(findRestarts(rows), []);
});
test("the four restarts the 2026-09-07 run missed are found: fuzzy token, comma before the retake, run opening on and, two-word stutter", () => {
  const one = (line, re, si, ei) => { const w = say([line]); const r = findRestarts(w); assert.strictEqual(r.length, 1, line + " -> " + JSON.stringify(r)); assert.ok(re.test(r[0].phrase), r[0].phrase); assert.strictEqual(r[0].cutStart, w[si].start); assert.strictEqual(r[0].cutEnd, w[ei].start); };
  one("It creates a premier project, it creates a premiere project file", /^It creates a premier project,/, 0, 5);
  one("reach that has all the potential reach which reach which surfaces all the options for the editors", /^reach which reach which/, 6, 8);
  one("and tight, which makes decisions on what to keep, and generates on-screen text on what parts and tight, which makes editorial decisions", /^and tight, which makes decisions on what to keep/, 0, 16);
  one("and tight which makes decisions on what to keep and generates text on what parts and tight which makes decisions", /^and tight/, 0, 15);
  // still not a restart: a list joined by and, a single repeated word, unrelated words sharing four letters
  assert.deepStrictEqual(findRestarts(say(["and we painted the walls and we painted the ceiling"])), []);
  assert.deepStrictEqual(findRestarts(say(["I painted the walls and I painted the ceiling"])), []);
  assert.deepStrictEqual(findRestarts(say(["it was very very good"])), []);
  assert.deepStrictEqual(findRestarts(say(["the project projected a projection"])), []);
});
test("a draft is validated: overlaps fail, uncovered words are reported, times come from the words", () => {
  const words = say(["Hello there everyone.", "We shot it on Tuesday.", "Okay cool.", "We shot it on Tuesday, in the rain."]);
  const v = validateDraft(words, { thoughts: [
    { id: "t1", word_start_i: 0, word_end_i: 2, label: "greeting", kind: "production" },
    { id: "t2", word_start_i: 3, word_end_i: 7, label: "shoot day" },
    { id: "t3", word_start_i: 10, word_end_i: 17, label: "shoot day", retake_of: "t2" },
  ] });
  assert.deepStrictEqual(v.problems, []);
  assert.deepStrictEqual(v.uncovered, [8, 9]);
  assert.strictEqual(v.thoughts[1].start, words[3].start);
  const bad = validateDraft(words, { thoughts: [{ word_start_i: 0, word_end_i: 5 }, { word_start_i: 4, word_end_i: 7 }] });
  assert.ok(bad.problems.length >= 1);
});
test("the plan keeps the more fluent take, drops production, and never makes a cheap cut", () => {
  const words = say(["Hello there everyone.", "We um shot it on um Tuesday.", "Okay cool.", "We shot it on Tuesday, in the rain."], 0, 0.6);
  const v = validateDraft(words, { thoughts: [
    { id: "t1", word_start_i: 0, word_end_i: 2, kind: "production" },
    { id: "t2", word_start_i: 3, word_end_i: 9, label: "shoot day" },
    { id: "t3", word_start_i: 10, word_end_i: 11, kind: "production" },
    { id: "t4", word_start_i: 12, word_end_i: 19, label: "shoot day", retake_of: "t2" },
  ] });
  const p = planFromThoughts(words, v.thoughts);
  assert.strictEqual(p.keep.length, 1);
  assert.strictEqual(p.keep[0].id, "t4", "the take without ums and faster is kept");
  assert.ok(p.drop.some((d) => /take of the same line/.test(d.reason)));
  assert.ok(p.drop.some((d) => /production/.test(d.reason)));
  assert.strictEqual(p.ranges.length, 1);
  assert.ok(/Kept \(1 piece/.test(report(p)));
});
test("thoughts less than a second apart stay in one range; a 1.5 s pause is kept and flagged", () => {
  const words = say(["First complete thought here.", "Second complete thought here.", "Third complete thought here."], 0, 0.8);
  const v = validateDraft(words, { thoughts: [{ word_start_i: 0, word_end_i: 3 }, { word_start_i: 4, word_end_i: 7 }, { word_start_i: 8, word_end_i: 11 }] });
  const p = planFromThoughts(words, v.thoughts);
  assert.strictEqual(p.ranges.length, 1, "0.8 s gaps: one range, no cheap cuts");
  const w2 = say(["First complete thought here.", "Second complete thought here."], 0, 1.5);
  const p2 = planFromThoughts(w2, validateDraft(w2, { thoughts: [{ word_start_i: 0, word_end_i: 3 }, { word_start_i: 4, word_end_i: 7 }] }).thoughts);
  assert.strictEqual(p2.ranges.length, 1);
  assert.ok(p2.notes.some((n) => /finishing decision/.test(n)));
});
