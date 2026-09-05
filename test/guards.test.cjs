/**
 * Acceptance tests for the ExtendScript safety boundary.
 *
 * Written before the implementation. Policy change 2026-09-04 (independent security review, see
 * docs/codex-review-log.md): engine capability globals are REJECTED outright instead of shadowed,
 * because shadowing is bypassable in ES3, and anything not provably read-only needs a user click.
 * Tests that encoded the old shadowing policy were rewritten to the new one; the rest are unchanged.
 *
 * Why this boundary matters more in Premiere than in After Effects: the AE
 * reference panel wraps every script in an undo group, so a bad mutation is one
 * Cmd+Z away. Premiere's ExtendScript DOM has no undo-group API at all (verified:
 * zero hits for beginUndoGroup/undoGroup/app.undo across every shipped Premiere
 * CEP extension). There is no safety net underneath this guard list.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { inspectExtendScript, buildExtendScriptWrapper } = require("../src/core.cjs");

/**
 * Categories that must be refused outright.
 *
 * These are the ones that CANNOT be removed as capabilities: `app` because every
 * script needs it, and `eval`/`Function` because the wrapper itself evaluates the
 * user source. Anything reachable through a removable global belongs in
 * MUST_SHADOW below instead — see SPEC.md §3a.
 */
const MUST_REJECT = [
  ["lifecycle: app.quit", "app.quit();"],
  ["lifecycle: app.openDocument", 'app.openDocument("/tmp/x.prproj");'],
  ["lifecycle: app.newProject", 'app.newProject("/tmp/y.prproj");'],
  ["persistence: project.save", "app.project.save();"],
  ["persistence: project.saveAs", 'app.project.saveAs("/tmp/z.prproj");'],
  ["persistence: closeDocument", "app.project.closeDocument();"],
  ["render: encoder", 'app.encoder.encodeSequence(seq, "/tmp/out.mp4", preset, 1, 1);'],
  ["render: renderQueue", "app.project.renderQueue.render();"],
  ["async: scheduleTask", 'app.scheduleTask("app.quit()", 1000, false);'],
  ["eval: eval()", 'eval("app.quit()");'],
  ["eval: Function()", 'new Function("return app")();'],
];

/**
 * Capabilities that are REMOVED rather than rejected: the wrapper shadows these
 * globals with nulls, so a script reaching for one gets a TypeError and fails
 * harmlessly. Removal beats pattern-matching because it survives aliasing and
 * every spelling trick. A warning is still raised so the operator sees the attempt.
 */
const MUST_SHADOW = ["File", "Folder", "Socket", "BridgeTalk", "system", "$"];

test("every destructive category is a hard rejection, not a warning", () => {
  for (const [label, code] of MUST_REJECT) {
    const result = inspectExtendScript(code);
    assert.ok(
      result.rejection,
      `${label} must be rejected outright — Premiere has no undo to fall back on. Got: ${JSON.stringify(result)}`
    );
    assert.equal(typeof result.rejection, "string", `${label} rejection must explain itself`);
    assert.ok(result.rejection.length > 0, `${label} rejection message must not be empty`);
  }
});

test("a rejected script cannot be wrapped for execution", () => {
  for (const [label, code] of MUST_REJECT) {
    assert.throws(
      () => buildExtendScriptWrapper(code),
      /.+/,
      `${label} must throw from buildExtendScriptWrapper, not be silently wrapped`
    );
  }
});

test("ordinary inspection is allowed and classified read-only", () => {
  const readOnly = [
    "app.project.activeSequence.name",
    "app.project.rootItem.children.numItems",
    "var s = app.project.activeSequence; s.videoTracks.numTracks",
    'app.project.activeSequence.getPlayerPosition().ticks',
  ];
  for (const code of readOnly) {
    const result = inspectExtendScript(code);
    assert.equal(result.rejection, null, `should be allowed: ${code}`);
    assert.equal(result.mutating, false, `should be classified read-only: ${code}`);
  }
});

test("mutations are allowed but classified mutating so a checkpoint is taken", () => {
  const mutating = [
    'app.project.activeSequence.markers.createMarker(0);',
    'clip.components[1].properties[0].setValue(0.5, true);',
    'app.project.rootItem.createBin("New Bin");',
    'seq.videoTracks[0].clips[0].name = "renamed";',
  ];
  for (const code of mutating) {
    const result = inspectExtendScript(code);
    assert.equal(result.rejection, null, `should be allowed: ${code}`);
    assert.equal(result.mutating, true, `must be classified mutating: ${code}`);
  }
});

test("QE DOM is allowed but always warned about", () => {
  const result = inspectExtendScript('app.enableQE(); qe.project.getActiveSequence().name');
  assert.equal(result.rejection, null, "QE is a legitimate tool, not a blocked one");
  assert.ok(
    result.warnings.some((w) => /qe/i.test(w)),
    `QE use must raise a visible warning. Got warnings: ${JSON.stringify(result.warnings)}`
  );
});

test("classification errs toward mutating when a script both reads and writes", () => {
  const result = inspectExtendScript(
    'var n = app.project.activeSequence.name; app.project.rootItem.createBin(n);'
  );
  assert.equal(result.mutating, true, "a script containing any mutation is mutating");
});

test("the wrapper never opens an undo group — Premiere has no such API", () => {
  const wrapped = buildExtendScriptWrapper("app.project.activeSequence.name");
  assert.ok(!/beginUndoGroup/.test(wrapped), "Premiere has no beginUndoGroup; it must not appear");
  assert.ok(!/endUndoGroup/.test(wrapped), "Premiere has no endUndoGroup; it must not appear");
});

test("the wrapper reports success and failure with distinguishable prefixes", () => {
  const wrapped = buildExtendScriptWrapper("1 + 1");
  assert.ok(wrapped.includes("CLAUDE_FOR_ADOBE_OK:"), "success prefix missing");
  assert.ok(wrapped.includes("CLAUDE_FOR_ADOBE_ERROR:"), "error prefix missing");
});

test("the wrapper pre-parses the script so syntax errors are caught before execution", () => {
  const wrapped = buildExtendScriptWrapper("not valid javascript {{{");
  assert.ok(
    /new Function\s*\(/.test(wrapped),
    "wrapper must attempt a parse before running, so a syntax error cannot half-execute"
  );
});

test("the wrapper embeds source safely, including line separators", () => {
  // U+2028/U+2029 are legal inside JSON strings but terminate a line in JS source.
  // Embedding them raw breaks out of the string literal the wrapper builds.
  const wrapped = buildExtendScriptWrapper("var a = 'x\u2028y\u2029z';");
  assert.ok(!wrapped.includes("\u2028"), "raw U+2028 must be escaped in the embedded source");
  assert.ok(!wrapped.includes("\u2029"), "raw U+2029 must be escaped in the embedded source");
});

test("the wrapper cannot be escaped with quotes or backslashes in the source", () => {
  const nasty = 'var s = "\\"; app.quit(); //";';
  // It may be rejected by the guard, or safely embedded — but never silently
  // concatenated in a way that would let the payload execute unwrapped.
  let wrapped = null;
  try {
    wrapped = buildExtendScriptWrapper(nasty);
  } catch (_) {
    return; // rejection is an acceptable outcome
  }
  const embedded = JSON.stringify(nasty);
  assert.ok(
    wrapped.includes(embedded.slice(1, -1)) || wrapped.includes(embedded),
    "source must be embedded via JSON string encoding, not raw concatenation"
  );
});

test("results are truncated so a huge dump cannot wedge the panel", () => {
  const wrapped = buildExtendScriptWrapper("app.project.rootItem");
  assert.ok(/6[45]\d{3}/.test(wrapped), "wrapper must apply a ~64KB truncation limit to results");
});

test("inspectExtendScript always returns the full documented shape", () => {
  for (const code of ["1 + 1", "app.quit();", 'app.enableQE();']) {
    const result = inspectExtendScript(code);
    assert.deepEqual(
      Object.keys(result).sort(),
      ["mutating", "notUndoable", "readOnly", "rejection", "warnings"],
      `shape must be exactly {mutating, notUndoable, readOnly, rejection, warnings} for: ${code}`
    );
    assert.ok(Array.isArray(result.warnings), "warnings must always be an array");
    assert.equal(typeof result.mutating, "boolean", "mutating must always be a boolean");
  }
});

/* ------------------------------------------------------------------------
 * Layered-guard acceptance tests (added after the first implementation
 * attempt shipped a catch-all that rejected 5 of 10 realistic scripts).
 * See SPEC.md §3. Usability is a security property: a guard that blocks
 * `var proj = app.project` gets switched off, and then protects nothing.
 * ---------------------------------------------------------------------- */

test("realistic Premiere scripts are not rejected", () => {
  const realistic = [
    ["alias the project — the most common idiom in the language", "var proj = app.project; proj.name"],
    ["alias the sequence", "var seq = app.project.activeSequence; seq.name"],
    ["iterate bins", "var root = app.project.rootItem; var n = root.children.numItems; n"],
    ["a variable that happens to be named project", "var project = 1; project"],
    ["a string that happens to mention project", 'var label = "project name"; label'],
    ["a regex that happens to contain a dollar sign", "var re = /foo$/; re.source"],
    ["a null check on app", 'if (app) { app.project.name } else { "none" }'],
    ["ticks arithmetic", "var t = 254016000000; t * 2"],
  ];
  const rejected = realistic.filter(([, code]) => inspectExtendScript(code).rejection);
  assert.deepEqual(
    rejected.map(([label]) => label),
    [],
    "these must all be allowed; over-blocking makes the panel useless and gets the guard disabled"
  );
});

test("dangerous globals are shadowed at runtime, not merely pattern-matched", () => {
  // Layer 1: capability removal. This is what makes aliasing survivable —
  // the name cannot reach the real global no matter how it is spelled.
  const wrapped = buildExtendScriptWrapper("1 + 1");
  for (const name of ["File", "Folder", "Socket", "BridgeTalk", "system"]) {
    assert.ok(
      new RegExp(`\\b${name}\\s*=`).test(wrapped),
      `${name} must be shadowed as a local inside the wrapper IIFE, not just regex-matched`
    );
  }
});

test("engine capability objects never reach the wrapper: they are rejected at inspection", () => {
  for (const code of ['new File("/tmp/x")', 'Folder.current', 'new Socket()', 'BridgeTalk.launch("x")', 'system.callSystem("ls")', '$.evalFile("/x.jsx")']) {
    assert.ok(inspectExtendScript(code).rejection, `must reject: ${code}`);
    assert.throws(() => buildExtendScriptWrapper(code));
  }
});

test("string-fragment and bracket obfuscation is still folded before matching", () => {
  for (const code of ['app["sa" + "ve"]();', 'app["quit"]();', 'app.project["save"]();']) {
    assert.ok(
      inspectExtendScript(code).rejection,
      `obfuscated destructive call must still be caught: ${code}`
    );
  }
});

test("every engine capability global is rejected, not merely shadowed", () => {
  for (const name of MUST_SHADOW) {
    const result = inspectExtendScript("var x = " + name + "; x");
    assert.ok(result.rejection, `${name} must be rejected outright (shadowing is bypassable in ES3). Got: ${JSON.stringify(result)}`);
  }
});

test("hard rejections are receiver-agnostic and cover engine escapes", () => {
  const { inspectExtendScript, isReadOnlyScript } = require("../src/core.cjs");
  for (const code of ['var p = app.project; p.save();', 'x.saveAs("/tmp/a.prproj")', 'this.File', '(function(){return this})().File', 'app.project.activeSequence.exportAsMediaDirect("/o.mp4", p, 1)', 'var f = \u0046ile', '#include "/etc/passwd"', 'a.constructor("x")()', '$.global.system', 'with (app) { quit() }', 'app.enableQE(); qe.project.save()']) {
    assert.ok(inspectExtendScript(code).rejection, "should reject: " + code);
  }
  assert.equal(inspectExtendScript("app.project.activeSequence.name").readOnly, true);
  assert.equal(inspectExtendScript("var s = app.project.activeSequence; s.getSelection().length").readOnly, true);
  assert.equal(inspectExtendScript("var t = app.project.activeSequence.videoTracks[0]; t.clips[i].name").readOnly, false, "computed index needs approval");
  assert.equal(inspectExtendScript("app.project.activeSequence.videoTracks[0].clips[0].name").readOnly, true);
  assert.equal(inspectExtendScript("app.project.activeSequence.setSelection([])").readOnly, false);
  assert.equal(isReadOnlyScript("a.name = 1"), false);
});

test("round-2 bypass probes are rejected or at least not read-only", () => {
  const { inspectExtendScript } = require("../src/core.cjs");
  for (const code of ['app.project["\\163ave"]()', 'app.project.activeSequence["\\143lone"]()', 'clips[0]["\\162emove"]()']) {
    assert.ok(inspectExtendScript(code).rejection, "octal escape must be rejected: " + code);
  }
  assert.ok(inspectExtendScript("var f = app.project.save; f()").rejection, "reference to save must be rejected");
  assert.ok(inspectExtendScript("var f = app.project.activeSequence.clone; f()").readOnly === false, "bare call of a saved reference is not read-only");
  assert.ok(inspectExtendScript("x.remove.call(y)").rejection, "call/apply must be rejected");
  assert.equal(inspectExtendScript("String(app.project.activeSequence.name)").readOnly, true);
});

test("round-3 probes: string tricks and comments never reach auto-run", () => {
  const { inspectExtendScript } = require("../src/core.cjs");
  for (const code of ['app.project["sa"+""+"ve"]()', 'app["qu"+""+"it"]()', 'app.project./*x*/save/*y*/()', 'app.project.activeSequence["exportAs"+""+"MediaDirect"]("/o.mov","/p.epr",1)']) {
    assert.ok(inspectExtendScript(code).rejection, "must be rejected: " + code);
  }
  for (const code of ['app.project.activeSequence.clone/*x*/()', 'app.project.activeSequence.name/*x*/="renamed"', 'var n = "x"; app.project.activeSequence.name', 'app.project.activeSequence.name // note']) {
    const r = inspectExtendScript(code);
    assert.equal(r.readOnly, false, "must need a click: " + code);
  }
  assert.equal(inspectExtendScript("app.project.activeSequence.videoTracks[0].clips.numItems").readOnly, true);
});

test("round-4 probes: every assignment operator and engine facility is kept off auto-run", () => {
  const { inspectExtendScript } = require("../src/core.cjs");
  for (const op of ["|=", "&=", "^=", "<<=", ">>=", ">>>=", "+=", "-=", "=", "*="]) {
    const r = inspectExtendScript("app.project.activeSequence.videoTracks[0].clips[0].disabled " + op + " 1");
    assert.equal(r.readOnly, false, "must not auto-run: " + op);
    assert.equal(r.mutating, true, "must count as mutating: " + op);
  }
  assert.equal(inspectExtendScript("app.project.activeSequence.videoTracks[0].clips[0].disabled++").readOnly, false);
  assert.ok(inspectExtendScript("app.reflect.properties").rejection, "reflection must be rejected");
  assert.ok(inspectExtendScript('new Window("dialog")').rejection, "ScriptUI must be rejected");
  assert.equal(inspectExtendScript("var n = app.project.activeSequence.videoTracks[0].clips.numItems; n").readOnly, true);
  assert.equal(inspectExtendScript("app.project.activeSequence.videoTracks[0].clips.numItems == 3").readOnly, true);
});

test("words inside string literals do not trip the keyword checks", () => {
  const { inspectExtendScript } = require("../src/core.cjs");
  const script = 'var it = findChild(root, "SOCIAL with CODEX.aep"); var f = findChild(root, "File 3 delete me.mov"); it.moveBin(dest);';
  const r = inspectExtendScript(script);
  assert.equal(r.rejection, null);
  assert.equal(r.mutating, true);
  assert.equal(r.readOnly, false);
  assert.ok(inspectExtendScript('with (app) { quit() }').rejection, "the real with statement is still refused");
  assert.ok(inspectExtendScript('app["qu" + "it"]()').rejection, "folded bracket access is still refused");
});

test("a rejection names the line and the offending text", () => {
  const { inspectExtendScript } = require("../src/core.cjs");
  const r = inspectExtendScript("var a = 1;\nvar b = 2;\napp.project.save();");
  assert.match(r.rejection, /line 3: `\.save`/);
});

test("round-5 probes: computed method names cannot smuggle save/quit/import past the name checks", () => {
  const { inspectExtendScript } = require("../src/core.cjs");
  const probes = [
    'var k = unescape("%73ave"); app.project[k]();',
    'app.project[["sa","ve"].join("")]();',
    'app[String.fromCharCode(113,117,105,116)]();',
    'app.project[unescape("%69mportFiles")](["/tmp/x.srt"]);',
    'var st = s.getSettings(); s[unescape("%73etSettings")](st);',
    'var k = "sa"; k = k + "ve"; app.project[k]();',
  ];
  for (const p of probes) assert.ok(inspectExtendScript(p).rejection, "not rejected: " + p);
  // Ordinary indexing and indexed reads stay allowed.
  const ok = inspectExtendScript("var t = app.project.activeSequence.videoTracks[0]; var c = t.clips[i]; c.name.length");
  assert.equal(ok.rejection, null);
});

test("editing verbs from the scripting skill (QE extract, razor, lift, rippleDelete, clone) are mutating", () => {
  const { inspectExtendScript } = require("../src/core.cjs");
  for (const s of [
    "app.enableQE(); qe.project.getActiveSequence().extract(); 1",
    "app.project.activeSequence.clone(); 1",
    'app.enableQE(); qe.project.getActiveSequence().getVideoTrackAt(0).razor("00:00:01:00"); 1',
    "app.enableQE(); qe.project.getActiveSequence().lift(); 1",
    "app.enableQE(); qe.project.getActiveSequence().rippleDelete(); 1",
  ]) { const r = inspectExtendScript(s); assert.equal(r.rejection, null, s); assert.equal(r.mutating, true, "not mutating: " + s); }
});
