"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parseKys, keyName, findShortcuts } = require("../src/kys.cjs");
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");

const XML = `<?xml version="1.0"?><PremiereData Version="3"><shortcuts Version="5"><platform>macintosh</platform>
<context.global Version="1"><itemcount>3</itemcount>
<item.0 Version="1"><virtualkey>2147483738</virtualkey><modifier.command>true</modifier.command><modifier.opt>false</modifier.opt><modifier.shift>false</modifier.shift><modifier.ctrl>false</modifier.ctrl><commandname>cmd.edit.undo</commandname></item.0>
<item.1 Version="1"><virtualkey>2147483865</virtualkey><modifier.command>false</modifier.command><modifier.opt>false</modifier.opt><modifier.shift>false</modifier.shift><modifier.ctrl>false</modifier.ctrl><commandname>cmd.sequence.extract</commandname></item.1>
<item.2 Version="1"><virtualkey></virtualkey><modifier.command>false</modifier.command><modifier.opt>false</modifier.opt><modifier.shift>false</modifier.shift><modifier.ctrl>false</modifier.ctrl><commandname>cmd.sequence.autoframesequence</commandname></item.2>
</context.global>
<context.timeline Version="1"><itemcount>1</itemcount>
<item.0 Version="1"><virtualkey>35</virtualkey><modifier.command>false</modifier.command><modifier.opt>false</modifier.opt><modifier.shift>true</modifier.shift><modifier.ctrl>false</modifier.ctrl><commandname>cmd.edit.ripple.delete</commandname></item.0>
</context.timeline></shortcuts></PremiereData>`;

test("parses contexts, keys and unbound commands", () => {
  const rows = parseKys(XML);
  assert.deepStrictEqual(rows.map((r) => [r.command, r.context, r.key]), [
    ["cmd.edit.undo", "global", "Cmd+Z"], ["cmd.sequence.extract", "global", "'"], ["cmd.sequence.autoframesequence", "global", ""], ["cmd.edit.ripple.delete", "timeline", "Shift+ForwardDelete"]]);
});
test("keyName", () => { assert.strictEqual(keyName(0x80000000 + 83, { command: true }), "Cmd+S"); assert.strictEqual(keyName(7, {}), "F1"); assert.strictEqual(keyName(null, {}), ""); });
test("findShortcuts across sets", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "kys-")); const f = path.join(d, "English.kys"); fs.writeFileSync(f, XML);
  const r = findShortcuts("edit", [f]);
  assert.deepStrictEqual(r.map((x) => x.command), ["cmd.edit.ripple.delete", "cmd.edit.undo"]);
  assert.deepStrictEqual(r[0].keys, { English: ["Shift+ForwardDelete (timeline)"] });
  assert.deepStrictEqual(findShortcuts("autoframe", [f])[0].keys, {});
});
