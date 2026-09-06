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
  const dupes = names.filter((n) => (src.match(new RegExp("function " + n + "\\(", "g")) || []).length !== 1);
  assert.deepEqual(dupes, [], "exported function defined more than once");
  assert.ok(names.length >= 21, "export table shrank below the known-good baseline of 21");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const called = [...panel.matchAll(/host\("(\w+)"/g)].map((m) => m[1]);
  const unknown = [...new Set(called)].filter((n) => !names.includes(n));
  assert.deepEqual(unknown, [], "panel calls host functions that are not exported");
});

// place_broll must not warn about its own work. The overwrite adds the b-roll's audio, the host removes it, and
// Premiere may append an empty audio track to hold it: none of that is a sync problem. The warning fired on every
// placement until 2026-09-06 because it compared whole-timeline strings. Guard the shape of the new comparison.
test("overlayClip's sync check compares clips, not whole-timeline strings", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  const fn = /function overlayClip\([\s\S]*?\n  \}\n/.exec(src);
  assert.ok(fn, "overlayClip not found");
  const body = fn[0];
  assert.ok(!/after === before/.test(body), "must not compare fingerprints as one string");
  assert.ok(/lost\.length \?/.test(body), "warning must be driven by clips that went missing");
  assert.ok(/return out;\n    \}/.test(body), "fingerprint must return a list of clips");
});
