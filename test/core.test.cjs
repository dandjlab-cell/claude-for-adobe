const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildExtendScriptWrapper,
  createJsonLineParser,
  createRpcPeer,
  inspectExtendScript,
} = require("../src/core.cjs");

test("JSONL parser preserves split lines and reports malformed input", () => {
  const messages = [];
  const malformed = [];
  const parser = createJsonLineParser(
    (message) => messages.push(message),
    (line) => malformed.push(line),
  );

  parser.push('{"id":1,"res');
  parser.push('ult":{}}\nnot-json\n');
  parser.finish();

  assert.deepEqual(messages, [{ id: 1, result: {} }]);
  assert.deepEqual(malformed, ["not-json"]);
});

test("RPC peer routes responses, notifications, requests, and shutdown", async () => {
  const sent = [];
  const requests = [];
  const notifications = [];
  const peer = createRpcPeer((line) => sent.push(JSON.parse(line)));
  peer.onRequest = (message) => requests.push(message);
  peer.onNotification = (message) => notifications.push(message);

  const pending = peer.request("initialize", { clientInfo: { name: "claude-for-adobe" } });
  peer.receive({ id: 1, result: { userAgent: "codex" } });
  assert.deepEqual(await pending, { userAgent: "codex" });

  peer.receive({ method: "turn/completed", params: { turn: { id: "turn-1" } } });
  peer.receive({ id: 9, method: "item/tool/call", params: { tool: "run_extendscript" } });
  assert.equal(notifications[0].method, "turn/completed");
  assert.equal(requests[0].id, 9);
  assert.deepEqual(sent[0], {
    id: 1,
    method: "initialize",
    params: { clientInfo: { name: "claude-for-adobe" } },
  });

  const abandoned = peer.request("thread/start", {});
  peer.rejectPending(new Error("closed"));
  await assert.rejects(abandoned, /closed/);
});

test("ExtendScript guards reject destructive static bracket access and shadow system", () => {
  const destructive = [
    'app["quit"]()',
    'app.project["save"]()',
    'app["encoder"]["encodeSequence"](seq, out, preset, 1, 1)',
    'app["qu" + "it"]()',
    'app.project["sa" + "ve"]()',
  ];

  for (const code of destructive) {
    assert.ok(inspectExtendScript(code).rejection, `must reject: ${code}`);
  }

  for (const code of [
    'system["callSystem"]("/bin/ls")',
    'system["call" + "System"]("/bin/ls")',
  ]) {
    assert.ok(inspectExtendScript(code).rejection, `shell access must be rejected outright: ${code}`);
  }
});

test("ExtendScript classifier treats bracket writes and delete as mutations", () => {
  const mutating = [
    'clip["name"] = "renamed";',
    "clips[0] = replacement;",
    "clip[propertyName]++;",
    "++clip[propertyName];",
    "delete app.project.activeSequence.customProperty;",
  ];

  for (const code of mutating) {
    assert.equal(inspectExtendScript(code).mutating, true, `must checkpoint: ${code}`);
  }
});

test("a capability refusal stops the turn; a form refusal can be rewritten", () => {
  const { isCapabilityRejection } = require("../src/core.cjs");
  const refused = (code) => inspectExtendScript(code).rejection;
  for (const code of ['var f = new Folder("/tmp");', "app.project.save();", "eval(1);", "app.quit();"]) assert.equal(isCapabilityRejection(refused(code)), true, code);
  for (const code of ["var nl = String.fromCharCode(10);", "var s = this.name;"]) assert.equal(isCapabilityRejection(refused(code)), false, code);
  // a direct computed call names a method at runtime, so it stops the turn like the capability it may reach
  for (const code of ["app.project[k]();", 'app.project["sa"+"ve"]();', "var k = m; app.project[ k ]();"]) {
    assert.ok(refused(code), "must be refused: " + code);
    assert.equal(isCapabilityRejection(refused(code)), true, code);
  }
  // when a script matches a form rule and the computed-call rule, the capability (computed call) is reported, not `this`
  assert.equal(isCapabilityRejection(refused("var s = this.name; app.project[k]();")), true);
  assert.equal(isCapabilityRejection(refused("var s = this.name; app.project.scheduleTask(1);")), true);
  // ordinary indexed reads, and calls whose result is indexed, are NOT refused (no false positives that would latch the turn)
  for (const code of ["var c = app.project.activeSequence.videoTracks[0].clips[1]; c.name;", "var x = tracks[i].clips.numItems;", "out.push(clips[i].name);", "if (clips[i]) alert(x);", "outer(inner(a[i]))(x);"]) assert.equal(refused(code), null, code);
  assert.equal(isCapabilityRejection(null), false);
});

// A slow projectInfo landing after a fast one used to overwrite the newer sequence name, so the panel
// reported the original while every read correctly hit the [AI] copy (the 18:36 log: 590ms and 3272ms in
// one burst, either side of the working copy being made active). Source assertion - panel.js has no module
// boundary to call across - but the three parts of the guard have to all be present for it to pass.
// Every function that awaits and then assigns to shared panel state has to take the ticket BEFORE the await
// and check it after, or a slow reply overwrites a newer one. These are the four that can be called
// concurrently (host-event bursts, the 2s selection poll, the 400ms snapshot debounce, the tool wrapper);
// the rest are serialized through toolQueue. Source assertions - panel.js has no module boundary to call
// across - but each needs all three parts present in the right order to pass.
test("every concurrently-callable refresh drops a reply it has been overtaken on", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  for (const [gen, fn, awaited, assigns] of [
    ["snapshotGen", "async function snapshotTimeline()", "await readSnapshot()", "timeline = next;"],
    ["selectionGen", "async function refreshSelectionLine()", 'await host("selectionInfo")', "lastSelection = sel;"],
    ["ledgerGen", "async function getLedger(", "await readTransforms()", "ledgerCache = built;"],
  ]) {
    const start = panel.indexOf(fn);
    assert.ok(start > 0, fn + " still exists");
    const body = panel.slice(start, start + 2200);
    const iGen = body.indexOf("const gen = ++" + gen + ";"), iAwait = body.indexOf(awaited), iCheck = body.indexOf("if (gen !== " + gen + ")"), iAssign = body.indexOf(assigns);
    assert.ok(iGen > 0, fn + ": takes a " + gen + " ticket");
    assert.ok(iGen < iAwait, fn + ": before the await, not after");
    assert.ok(iCheck > iAwait && iCheck < iAssign, fn + ": and checks it after the await, before assigning");
  }
});

test("refreshProject drops a reply a newer refresh has overtaken", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const fn = panel.slice(panel.indexOf("let projectGen = 0;"), panel.indexOf("async function refreshTimeline"));
  assert.match(fn, /const gen = \+\+projectGen;/, "a ticket is taken before the await");
  assert.ok(fn.indexOf("const gen = ++projectGen;") < fn.indexOf("await readProject()"), "and taken BEFORE it, not after");
  assert.match(fn, /if \(gen !== projectGen\) return;/, "and the reply is dropped if it was overtaken");
  assert.ok(fn.indexOf("if (gen !== projectGen) return;") < fn.indexOf("project = next;"), "before anything is assigned from it");
});
