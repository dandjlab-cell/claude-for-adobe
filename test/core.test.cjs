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
