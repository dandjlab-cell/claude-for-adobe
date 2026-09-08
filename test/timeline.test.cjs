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
  const { isGuide } = require("../src/timeline.cjs");
  const g = snap([{ id: "m", track: "V4", name: "shape_mask_text_placement.png", start: 0, end: 20, inPoint: 0, mediaPath: "/m/mask.png" }, { id: "t", track: "V5", name: "title.png", start: 0, end: 3, inPoint: 0, mediaPath: "/m/title.png" }], ["Seq A", "id1", 1080, 1350, 20]);
  assert.equal(isGuide(g, g.clips[0]), true);
  assert.equal(isGuide(g, g.clips[1]), false);
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


test("seamVisible: b-roll over a cut hides it, graphics do not", () => {
  const { seamVisible } = require("../src/timeline.cjs");
  const clip = (track, name, start, end, mediaPath = "/m/" + name + ".mp4") => ({ id: name + start, track, name, start, end, inPoint: 0, mediaPath });
  const snap = { name: "s", width: 1080, height: 1920, duration: 30, clips: [
    clip("V1", "head a", 0, 10), clip("V1", "head b", 10, 20), clip("V1", "head c", 20, 30),
    clip("V2", "broll", 8, 12),                       // covers the 10 s cut on both sides
    clip("V2", "broll2", 20, 24),                     // starts exactly on the 20 s cut: covers the after side
    clip("V3", "title", 9, 11, "/g/title.aep"),       // AE comp over the 10 s cut: reported, not cover
  ] };
  const at10 = seamVisible(snap, "V1", 10);
  assert.strictEqual(at10.visible, false);
  assert.strictEqual(at10.cover, "V2 \"broll\"");
  assert.deepStrictEqual(at10.graphics, ["V3 \"title\""]);
  const at20 = seamVisible(snap, "V1", 20);
  assert.strictEqual(at20.visible, false);
  assert.strictEqual(at20.cover, "V2 \"broll2\"");
  const open = { ...snap, clips: snap.clips.filter((c) => c.track === "V1").concat([clip("V2", "over", 12, 18, "/g/over.png")]) };
  assert.strictEqual(seamVisible(open, "V1", 10).visible, true);
  assert.strictEqual(seamVisible(open, "V1", 20).visible, true);
});

test("analysis fingerprint notices source and trims beyond the first twelve clips", () => {
  const { fingerprint } = require("../src/timeline.cjs");
  const s = snap(Array.from({ length: 14 }, (_, i) => ({ id: String(i), track: "A1", name: "clip", start: i, end: i + 1, inPoint: 0, mediaPath: "/m/a.mov" })));
  for (const [key, value] of [["inPoint", 5], ["end", 15], ["mediaPath", "/m/b.mov"]]) {
    const changed = JSON.parse(JSON.stringify(s)); changed.clips[13][key] = value;
    assert.notEqual(fingerprint(s), fingerprint(changed));
  }
  assert.equal(fingerprint(s), fingerprint(JSON.parse(JSON.stringify(s))));
});
