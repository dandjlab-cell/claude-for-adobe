const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The host script is ES3 that Premiere evaluates once at panel boot. If any exported name is not defined,
// PCX never initialises and every tool breaks. Parse it and check the export table against the definitions.
test("host/premiere.jsx parses and every exported host function is defined", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  assert.doesNotThrow(() => new Function(src), "host script must parse");
  const ret = /return \{([\s\S]*?)\};\s*\}\(\)\);/.exec(src);
  assert.ok(ret, "export table not found");
  const names = [...ret[1].matchAll(/(\w+):\s*(\w+)/g)].map((m) => m[2]);
  assert.ok(names.length > 10);
  const missing = names.filter((n) => !new RegExp("function " + n + "\\(").test(src));
  assert.deepEqual(missing, [], "exported but not defined");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const called = [...panel.matchAll(/host\("(\w+)"/g)].map((m) => m[1]);
  const unknown = [...new Set(called)].filter((n) => !names.includes(n));
  assert.deepEqual(unknown, [], "panel calls host functions that are not exported");
});
