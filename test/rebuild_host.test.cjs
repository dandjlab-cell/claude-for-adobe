const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { rebuildSequence } = require("../src/silence-rebuild.cjs");

const T = 254016000000;
function list(items) { items.numItems = items.length; items.numSequences = items.length; return items; }
function time(ticks) { return { ticks: String(Math.round(Number(ticks))) }; }
function component(matchName, props = [{ displayName: "Value", value: 1 }]) {
  const values = list(props.map(p => ({ displayName: p.displayName, isTimeVarying: () => false, getValue: () => p.value, setValue(v) { p.value = v; } })));
  return { matchName, displayName: matchName, properties: values };
}
function track() { return { clips: list([]), transitions: { numItems: 0 }, isMuted: () => false, isLocked: () => false }; }
function fixture() {
  const item = {
    nodeId: "media-1", name: "source.mov", marks: { 1: ["-1", "-1"], 2: ["-1", "-1"] },
    getInPoint(k) { return time(this.marks[k][0]); }, getOutPoint(k) { return time(this.marks[k][1]); },
    setInPoint(s, k) { const n = Math.round(Number(s) * T); this.marks[k][0] = String(n < 0 ? n : n - (k === 1 ? T / 100 : T / 192000)); }, setOutPoint(s, k) { const n = Math.round(Number(s) * T); this.marks[k][1] = String(n < 0 ? n : n - (k === 1 ? T / 100 : T / 192000)); },
    clearInPoint(k) { this.clearCalls = (this.clearCalls || 0) + 1; if (this.failClear) { this.failClear--; throw new Error("injected restore failure"); } this.marks[k][0] = "-1"; }, clearOutPoint(k) { this.clearCalls = (this.clearCalls || 0) + 1; if (this.failClear) { this.failClear--; throw new Error("injected restore failure"); } this.marks[k][1] = "-1"; },
    getMediaPath: () => "/source.mov"
  };
  const componentsV = list([component("AE.ADBE Opacity"), component("AE.ADBE Motion", [{ displayName: "Position", value: [960, 540] }, { displayName: "Scale", value: 83 }])]);
  const componentsA = list([component("Internal Volume Stereo"), component("Internal Channel Volume Stereo")]);
  function clip(kind, start, end, inputStart) {
    return { nodeId: kind + "-clip", projectItem: item, name: item.name, start: time(start), end: time(end), inPoint: time(inputStart), outPoint: time(inputStart + end - start), components: kind.charAt(0) === "v" ? componentsV : componentsA, getSpeed: () => 1, isSpeedReversed: () => false, disabled: false };
  }
  const source = { sequenceID: "source", name: "Cleanup", end: 10 * T, timebase: T / 25, zeroPoint: 0, videoTracks: list([track()]), audioTracks: list([track()]), getSettings: () => ({ videoFrameWidth: 1920, videoFrameHeight: 1080 }), getInPoint: () => 0, getOutPoint: () => 0 };
  const v = clip("v", 0, 10 * T, 0), a = clip("a", 0, 10 * T, 0);
  v.getLinkedItems = () => list([v, a]); a.getLinkedItems = () => list([v, a]); source.videoTracks[0].clips = list([v]); source.audioTracks[0].clips = list([a]);
  const sequences = list([source]);
  const project = { activeSequence: source, sequences, openSequence(id) { this.activeSequence = sequences.find(s => s.sequenceID === id); } };
  source.clone = () => { const dst = { sequenceID: "copy", name: "copy", end: 0, timebase: source.cloneTimebase || source.timebase, zeroPoint: 0, videoTracks: list([track()]), audioTracks: list([track()]), getSettings: () => source.cloneSettings || source.getSettings(), getInPoint: () => 0, getOutPoint: () => 0 };
    dst.insertClip = (projectItem, at) => { const i = dst.videoTracks[0].clips.length, st = Number(at.ticks), vin = Number(projectItem.marks[1][0]), vout = Number(projectItem.marks[1][1]), ain = Number(projectItem.marks[2][0]), aout = Number(projectItem.marks[2][1]); const vc = clip("v" + i, st, st + vout - vin, vin), ac = clip("a" + i, st, st + aout - ain, ain); vc.nodeId = "dv" + i; ac.nodeId = "da" + i; vc.getLinkedItems = () => list([vc, ac]); ac.getLinkedItems = () => list([vc, ac]); dst.videoTracks[0].clips.push(vc); dst.audioTracks[0].clips.push(ac); list(dst.videoTracks[0].clips); list(dst.audioTracks[0].clips); dst.end = Math.max(dst.end, Number(vc.end.ticks)); };
    sequences.push(dst); list(sequences); return true; };
  return { project, source, item };
}
function load(f) { const context = vm.createContext({ app: { project: f.project }, Time: function () { this.ticks = "0"; } }); vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8"), context); return context; }

test("rebuildSilences clones retained linked pairs in batches and restores source marks", () => {
  const f = fixture(), ctx = load(f), snap = ctx.PCX.snapshot();
  assert.equal(typeof ctx.PCX.rebuildSilences, "function");
  assert.deepEqual(JSON.parse(ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 2, end: 4 }], expectedSnapshot: snap }))), { done: false, completed: 0, total: 2 });
  const stepped = ctx.PCX.rebuildSilences("step", "{}"); assert.match(stepped, /^\{/); assert.deepEqual(JSON.parse(stepped), { done: true, completed: 2, total: 2 });
  const out = JSON.parse(ctx.PCX.rebuildSilences("finish", "{}"));
  assert.equal(out.done, true); assert.equal(out.duration, 8); assert.equal(out.mapping.length, 2);
  assert.deepEqual(f.item.marks, { 1: ["-1", "-1"], 2: ["-1", "-1"] });
  assert.equal(f.project.activeSequence.sequenceID, "copy");
});

test("rebuildSilences refuses stale and unsupported source before cloning", () => {
  const f = fixture(), ctx = load(f);
  assert.match(ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [], expectedSnapshot: "stale" })), /^ERR:.*changed/);
  assert.equal(f.project.sequences.numItems, 1);
  const f2 = fixture(); const extra = track(); extra.clips.push({}); list(extra.clips); f2.source.videoTracks.push(extra); list(f2.source.videoTracks); const ctx2 = load(f2);
  assert.match(ctx2.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: ctx2.PCX.snapshot() })), /^ERR:.*V1\/A1/);
  assert.equal(f2.project.sequences.numItems, 1);
});

test("rebuildSilences cancel opens original and retains incomplete output", () => {
  const f = fixture(), ctx = load(f), snap = ctx.PCX.snapshot();
  ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap }));
  const cancelled = JSON.parse(ctx.PCX.rebuildSilences("cancel", "{}"));
  assert.equal(cancelled.done, false); assert.equal(cancelled.completed, 0); assert.equal(f.project.activeSequence.sequenceID, "source");
  assert.equal(f.project.sequences.numItems, 2);
});

test("rebuildSilences retains pending source marks after restore failure and cancel retries both", () => {
  const f = fixture(), ctx = load(f), snap = ctx.PCX.snapshot();
  ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap }));
  f.item.failClear = 4;
  assert.match(ctx.PCX.rebuildSilences("step", "{}"), /^ERR:.*source marks did not restore/);
  assert.equal(f.item.clearCalls, 6, "both marks were attempted despite the first restore failing");
  const cancelled = JSON.parse(ctx.PCX.rebuildSilences("cancel", "{}"));
  assert.equal(cancelled.cancelled, true); assert.equal(f.item.clearCalls, 10, "cancel retried both pending marks");
  assert.deepEqual(f.item.marks, { 1: ["-1", "-1"], 2: ["-1", "-1"] });
});

test("rebuildSilences rejects destination edits and unexpected native extra pairs", () => {
  const f = fixture(), ctx = load(f), snap = ctx.PCX.snapshot();
  ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap }));
  f.project.activeSequence.end = 99;
  assert.match(ctx.PCX.rebuildSilences("step", "{}"), /^ERR:.*destination changed/);
  ctx.PCX.rebuildSilences("cancel", "{}");
  const f2 = fixture(), ctx2 = load(f2), snap2 = ctx2.PCX.snapshot();
  ctx2.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap2 }));
  const dst = f2.project.activeSequence, insert = dst.insertClip; dst.insertClip = function (item, at) { insert.call(this, item, at); insert.call(this, item, at); };
  assert.match(ctx2.PCX.rebuildSilences("step", "{}"), /^ERR:.*unexpected V1\/A1 count/);
  ctx2.PCX.rebuildSilences("cancel", "{}");
});

test("rebuildSilences defaults to 24 and refuses ordinary step batch overrides", () => {
  const f = fixture(), ctx = load(f), snap = ctx.PCX.snapshot();
  const cuts = Array.from({ length: 70 }, (_, i) => ({ start: i * .12 + .04, end: i * .12 + .08 }));
  const begun = JSON.parse(ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts, expectedSnapshot: snap })));
  assert.ok(begun.total > 24);
  assert.match(ctx.PCX.rebuildSilences("step", JSON.stringify({ batchSize: 8 })), /^ERR:.*only after/);
  const first = JSON.parse(ctx.PCX.rebuildSilences("step", "{}"));
  assert.equal(first.completed, 24); assert.equal(first.done, false);
  ctx.PCX.rebuildSilences("cancel", "{}");
});

test("rebuildSilences rejects clone format mismatches before clearing", () => {
  for (const bad of [{ videoFrameWidth: 1280, videoFrameHeight: 1080 }, { videoFrameWidth: 1920, videoFrameHeight: 1080, videoPixelAspectRatio: 2 }]) {
    const f = fixture(); f.source.cloneSettings = bad; const ctx = load(f), snap = ctx.PCX.snapshot();
    assert.match(ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap })), /^ERR:.*clone format differs/);
    assert.equal(f.project.sequences.length, 2);
  }
  const f = fixture(); f.source.cloneTimebase = T / 30; const ctx = load(f), snap = ctx.PCX.snapshot();
  assert.match(ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap })), /^ERR:.*clone format differs/);
});

test("rebuildSilences makes only pristine native insert failures retryable", () => {
  const f = fixture(), ctx = load(f), snap = ctx.PCX.snapshot();
  ctx.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap }));
  const dst = f.project.activeSequence, insert = dst.insertClip;
  dst.insertClip = () => { throw new Error("native unavailable"); };
  const retry = JSON.parse(ctx.PCX.rebuildSilences("step", "{}"));
  assert.deepEqual(retry, { done: false, completed: 0, total: 2, retryable: true, retryBatchSize: 16, retryReason: "native insert failed before modifying destination" });
  assert.match(ctx.PCX.rebuildSilences("step", JSON.stringify({ batchSize: 8 })), /^ERR:.*24 to 16 to 8/);
  assert.match(ctx.PCX.rebuildSilences("step", "{}"), /^ERR:.*requires its explicit/);
  const retryAgain = JSON.parse(ctx.PCX.rebuildSilences("step", JSON.stringify({ batchSize: 16 })));
  assert.equal(retryAgain.retryBatchSize, 8);
  dst.insertClip = insert;
  assert.equal(JSON.parse(ctx.PCX.rebuildSilences("step", JSON.stringify({ batchSize: 8 }))).completed, 2);
  ctx.PCX.rebuildSilences("cancel", "{}");
  const f2 = fixture(), ctx2 = load(f2), snap2 = ctx2.PCX.snapshot();
  ctx2.PCX.rebuildSilences("begin", JSON.stringify({ cuts: [{ start: 1, end: 2 }], expectedSnapshot: snap2 }));
  const changed = f2.project.activeSequence, changedInsert = changed.insertClip;
  changed.insertClip = function (item, at) { changedInsert.call(this, item, at); throw new Error("native changed then failed"); };
  assert.match(ctx2.PCX.rebuildSilences("step", "{}"), /^ERR:.*ambiguous/);
  ctx2.PCX.rebuildSilences("cancel", "{}");
});

test('rebuild begins at 24 and retry overrides must follow 24 to 16 to 8',()=>{
  for (const size of [8,16,32,64,0,9,65]) {
    const f=fixture(),ctx=load(f),snap=ctx.PCX.snapshot();
    const cuts=Array.from({length:70},(_,i)=>({start:i*.12+.04,end:i*.12+.08}));
    const raw=ctx.PCX.rebuildSilences('begin',JSON.stringify({cuts,expectedSnapshot:snap,batchSize:size}));
    assert.match(raw,/^ERR:.*batch/);assert.equal(f.project.sequences.length,1);
  }
  const f=fixture(),ctx=load(f),snap=ctx.PCX.snapshot();
  assert.ok(ctx.PCX.rebuildSilences('begin',JSON.stringify({cuts:[{start:1,end:2}],expectedSnapshot:snap,batchSize:24})).startsWith('{'));
  assert.match(ctx.PCX.rebuildSilences('step',JSON.stringify({batchSize:16})),/^ERR:.*only after/);
  ctx.PCX.rebuildSilences('cancel','{}');
});

test("rebuildSequence drives the actual host through a pristine post-prefix retry and preserves Motion", async () => {
  const f = fixture(), ctx = load(f), snap = ctx.PCX.snapshot();
  const cuts = Array.from({ length: 70 }, (_, i) => ({ start: i * .12 + .04, end: i * .12 + .08 }));
  let inserts = 0, failed = false;
  const call = async (action, payload) => {
    const result = ctx.PCX.rebuildSilences(action, payload);
    if (action === "begin" && result.charAt(0) === "{") {
      const dst = f.project.activeSequence, nativeInsert = dst.insertClip;
      dst.insertClip = function (item, at) { if (inserts === 3 && !failed) { failed = true; throw new Error("pristine injected native insert failure"); } inserts++; return nativeInsert.call(this, item, at); };
    }
    return result;
  };
  const result = await rebuildSequence(call, { cuts, expectedSnapshot: snap }, () => false, () => {});
  assert.equal(result.initialBatchSize, 24); assert.equal(result.batchSize, 16);
  assert.deepEqual(result.fallbacks.map(x => [x.from, x.to, x.completed]), [[24, 16, 3]]);
  assert.equal(result.videoFrameWidth, 1920); assert.equal(result.videoFrameHeight, 1080); assert.equal(result.timebase, T / 25);
  assert.ok(result.mapping.length > 24);
  const motion = f.project.activeSequence.videoTracks[0].clips[0].components[1].properties;
  assert.deepEqual(Array.from(motion[0].getValue()), [960, 540]); assert.equal(motion[1].getValue(), 83);
  assert.equal(f.project.sequences.length, 2, "one clone only");
});
