const test = require("node:test");
const assert = require("node:assert/strict");
const { cuesFromWords, toSRT, wrap } = require("../src/captions.cjs");

test("cuesFromWords breaks at sentence ends and gaps, wraps to two lines, writes SRT", () => {
  const w = (text, start, end) => ({ text, start, end });
  const words = [w("Welcome", 0, 0.3), w("to", 0.3, 0.4), w("four", 0.5, 0.8), w("extraordinary", 0.8, 1.4), w("homes.", 1.4, 1.9), w("From", 3, 3.2), w("Buenos", 3.2, 3.5), w("Aires", 3.5, 3.9), w("to", 3.9, 4.0), w("Tokyo,", 4.0, 4.5), w("creativity", 4.6, 5.0), w("conquers", 5.0, 5.4), w("constraint.", 5.4, 6.0)];
  const cues = cuesFromWords(words, { maxWords: 0, maxLines: 2, maxSeconds: 5 });
  assert.equal(cues.length, 2);
  const few = cuesFromWords(words); // defaults: a few words per caption, one line
  assert.deepEqual(few.map((c) => c.lines.join(" ")), ["Welcome to four extraordinary", "homes.", "From Buenos Aires to", "Tokyo, creativity conquers", "constraint."]);
  assert.deepEqual(cues[0].lines, ["Welcome to four", "extraordinary homes."]);
  assert.equal(cues[0].start, 0); assert.equal(cues[0].end, 1.9);
  assert.equal(cues[1].start, 3);
  const srt = toSRT(cues);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,900\nWelcome to four\nextraordinary homes\.\n\n2\n00:00:03,000/);
  assert.deepEqual(wrap("a b c", 32, 2), ["a b c"]);
});

test("wrap honours maxLines above 2 and one-word cues never overlap", () => {
  const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen";
  const three = wrap(long, 32, 3);
  assert.equal(three.length, 3);
  three.forEach((l) => assert.ok(l.length <= 32, l));
  assert.equal(three.join(" "), long);
  assert.equal(wrap(long, 32, 1).length, 1);
  const w = (text, start, end) => ({ text, start, end });
  const cues = cuesFromWords([w("a", 0, 0.1), w("b", 0.1, 0.2), w("c", 0.2, 0.3), w("d", 0.3, 2)], { maxWords: 1 });
  assert.equal(cues.length, 4);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i - 1].end < cues[i].start, "cue " + i + " overlaps the previous one");
  assert.equal(cues[3].end, 2);
});
