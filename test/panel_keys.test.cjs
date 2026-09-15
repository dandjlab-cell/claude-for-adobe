"use strict";
// Premiere owns the editing shortcuts until the extension asks for them, so Cmd+V in the chat box
// pasted onto the TIMELINE instead of into the text. The ask lives in index.html (before panel.js,
// so the first keystroke is covered) and there is nothing at runtime that would fail if it went
// missing - hence this guard. Live behaviour can only be confirmed in Premiere.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const block = /<script>([\s\S]*?registerKeyEventsInterest[\s\S]*?)<\/script>/.exec(html);

test("index.html asks Premiere for the text-editing keys", () => {
  assert.ok(block, "no registerKeyEventsInterest block in index.html");
  assert.ok(html.indexOf(block[0]) < html.indexOf('src="panel.js"'), "the ask must run before panel.js");
});

test("the registered set covers paste, copy, cut, select-all and undo on both modifiers", () => {
  let registered = null;
  const sandbox = { window: { __adobe_cep__: { registerKeyEventsInterest: (json) => { registered = JSON.parse(json); } } }, JSON };
  vm.runInNewContext(block[1], sandbox);
  assert.ok(Array.isArray(registered) && registered.length, "nothing was registered");

  // V C X A Z, each on Cmd (mac) and Ctrl (win): the text-editing set, nothing else.
  for (const keyCode of [86, 67, 88, 65, 90]) {
    assert.ok(registered.some((k) => k.keyCode === keyCode && k.metaKey), "missing Cmd for keyCode " + keyCode);
    assert.ok(registered.some((k) => k.keyCode === keyCode && k.ctrlKey), "missing Ctrl for keyCode " + keyCode);
  }
  assert.equal(registered.length, 10, "only the text-editing keys are taken from Premiere");
});

test("a host without the CEP hook does not break the panel", () => {
  const sandbox = { window: {}, JSON }; // no __adobe_cep__ at all
  assert.doesNotThrow(() => vm.runInNewContext(block[1], sandbox));
});
