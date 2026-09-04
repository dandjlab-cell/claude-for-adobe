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
