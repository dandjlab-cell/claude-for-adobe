"use strict";
// Every ExtendScript snippet the skills hand the model must pass the script guard. On 2026-09-14 the scripting skill
// told the model to build newlines with String.fromCharCode, which the guard had refused since 2026-09-05, so the
// model followed the documentation straight into a refusal.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { inspectExtendScript } = require("../src/core.cjs");

test("every fenced javascript snippet in the skills passes the guard (guard compatibility, not an ES3 or run check)", () => {
  const dir = path.join(__dirname, "..", ".claude", "skills");
  const refused = [];
  let seen = 0;
  for (const skill of fs.readdirSync(dir)) {
    const sd = path.join(dir, skill);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const f of fs.readdirSync(sd).filter((n) => n.endsWith(".md"))) {
      const md = fs.readFileSync(path.join(sd, f), "utf8");
      for (const m of md.matchAll(/```[ \t]*(?:js|javascript|jsx|extendscript)[ \t]*\r?\n([\s\S]*?)```/g)) {
        seen++;
        const r = inspectExtendScript(m[1]).rejection;
        if (r) refused.push(skill + "/" + f + ": " + r + " :: " + m[1].trim().split("\n")[0].slice(0, 80));
      }
    }
  }
  assert.ok(seen >= 10, "found only " + seen + " snippets: the fence pattern no longer matches the skills");
  assert.deepEqual(refused, []);
});
