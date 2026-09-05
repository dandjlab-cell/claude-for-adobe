const test = require("node:test");
const assert = require("node:assert/strict");
const { COL, ROW, TICKS, diffSnapshots, formatSnapshot, parseSnapshot } = require("../src/timeline.cjs");

const T = (s) => String(Math.round(s * TICKS));
const snap = (clips, seq = ["Seq A", "id1", 1080, 1920, 30]) => parseSnapshot([seq.map((v, i) => i === 4 ? T(v) : v).join(COL), ...clips.map((c) => [c.id, c.track, c.name, T(c.start), T(c.end), T(c.inPoint), c.mediaPath || ""].join(COL))].join(ROW));

test("parses and formats a snapshot", () => {
  const s = snap([{ id: "n1", track: "V1", name: "clip", start: 0, end: 5, inPoint: 2, mediaPath: "/m/a.mov" }]);
  assert.equal(s.name, "Seq A"); assert.equal(s.clips[0].end, 5); assert.equal(s.clips[0].inPoint, 2);
  assert.match(formatSnapshot(s), /V1:\n  0\.00s-5\.00s "clip" in 2\.00s <\/m\/a\.mov>/);
  assert.equal(parseSnapshot("ERR:no sequence").error, "ERR:no sequence");
});

test("diff reports add, remove, move, trim, sequence switch", () => {
  const a = snap([{ id: "n1", track: "V1", name: "one", start: 0, end: 5, inPoint: 0 }, { id: "n2", track: "A1", name: "two", start: 5, end: 8, inPoint: 1 }]);
  const b = snap([{ id: "n1", track: "V1", name: "one", start: 1, end: 6, inPoint: 0 }, { id: "n3", track: "V2", name: "three", start: 0, end: 2, inPoint: 0 }], ["Seq A", "id1", 1080, 1920, 31]);
  const d = diffSnapshots(a, b);
  assert.deepEqual(d, ['moved V1 "one" 0.00s-5.00s -> 1.00s-6.00s', 'added V2 "three" 0.00s-2.00s', 'removed A1 "two" 5.00s-8.00s', "sequence duration 30.00s -> 31.00s"]);
  const c = snap([{ id: "n1", track: "V1", name: "one", start: 0, end: 4, inPoint: 1 }]);
  assert.deepEqual(diffSnapshots(a, c), ['trimmed V1 "one" 0.00s-5.00s -> 0.00s-4.00s (in 1.00s)', 'removed A1 "two" 5.00s-8.00s']);
  assert.deepEqual(diffSnapshots(a, a), []);
  assert.deepEqual(diffSnapshots(a, snap([], ["Seq B", "id2", 1920, 1080, 10])), ['active sequence is now "Seq B" (1920x1080, 10.00s)']);
});

test("visibility: top footage, first visible time, seams between cuts", () => {
  const { topFootageAt, firstVisibleTime, seams, isGraphic } = require("../src/timeline.cjs");
  // V1 talking head 0-20, V2 b-roll 2-6 and 10-12, V3 title png 0-3 (graphics never hide footage)
  const s = snap([
    { id: "th", track: "V1", name: "head", start: 0, end: 20, inPoint: 0, mediaPath: "/m/head.mov" },
    { id: "b1", track: "V2", name: "broll1", start: 2, end: 6, inPoint: 0, mediaPath: "/m/b1.mov" },
    { id: "b2", track: "V2", name: "broll2", start: 10, end: 12, inPoint: 0, mediaPath: "/m/b2.mov" },
    { id: "ti", track: "V3", name: "title", start: 0, end: 3, inPoint: 0, mediaPath: "/m/title.png" },
  ], ["Seq A", "id1", 1080, 1350, 20]);
  assert.equal(isGraphic(s.clips[3]), true);
  assert.equal(topFootageAt(s, 1).id, "th");
  assert.equal(topFootageAt(s, 3).id, "b1");
  assert.equal(topFootageAt(s, 25), null);
  assert.equal(firstVisibleTime(s, s.clips[0]), 0.1);
  const buried = snap([{ id: "x", track: "V1", name: "x", start: 0, end: 4, inPoint: 0, mediaPath: "/m/x.mov" }, { id: "y", track: "V2", name: "y", start: 0, end: 4, inPoint: 0, mediaPath: "/m/y.mov" }]);
  assert.equal(firstVisibleTime(buried, buried.clips[0]), null);
  assert.deepEqual(seams(s).map((x) => [x.t, x.from, x.to]), [[2, 'V1 "head"', 'V2 "broll1"'], [6, 'V2 "broll1"', 'V1 "head"'], [10, 'V1 "head"', 'V2 "broll2"'], [12, 'V2 "broll2"', 'V1 "head"']]);
});

test("summarizeChanges folds repeated clip ranges into one line", () => {
  const { summarizeChanges } = require("../src/timeline.cjs");
  const lines = ['removed A1 "clip.braw" 374.92s-433.60s', 'removed A1 "clip.braw" 433.60s-466.59s', 'removed A1 "clip.braw" 700.00s-712.47s', 'added V2 "title" 1.00s-2.00s', 'sequence duration 800.00s -> 710.00s'];
  assert.deepEqual(summarizeChanges(lines), ['removed 3 ranges of A1 "clip.braw" (374.92s-712.47s)', 'added V2 "title" 1.00s-2.00s', 'sequence duration 800.00s -> 710.00s']);
});
