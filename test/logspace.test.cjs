"use strict";
// Log conversion chosen from the picture: the 2026-09-17 10:15 sweep on a Sony A7S II file that declared nothing.
const test = require("node:test");
const assert = require("node:assert/strict");
const { cameraHint, candidates, score, pick } = require("../src/logspace.cjs");

const read = (p1, p10, p50, p90, p99, satMed, satP99, crushed = 0) => ({ luma: { min: 0, p1, p10, p50, p90, p99, max: 98 }, saturation: { p50: satMed, p99: satP99 }, clipped: { red: 0, green: 0, blue: 0 }, crushed, red: { mean: 40 }, green: { mean: 40 }, blue: { mean: 40 } });
const sweep = [
  ["Sony S-Log2/S-Gamut", read(21.6, 25.9, 38, 69, 83.9, 7, 22)],
  ["Sony S-Log3/S-Gamut3.Cine", read(9, 12.5, 23.5, 63.5, 85.1, 7, 29)],
  ["Sony S-Log3/S-Gamut3", read(9, 12.5, 23.5, 63.5, 84.7, 8, 30)],
  ["Sony S-Log/S-Gamut", read(18.4, 22.4, 33.3, 63.1, 79.6, 7, 21)],
  ["Canon Log3/Cinema Gamut", read(3.5, 15.7, 32.2, 68.6, 84.7, 11, 28, 0.28)],
  ["Panasonic V-Log/V-Gamut", read(2.4, 10.2, 21.2, 62.4, 85.1, 8, 31, 0.38)],
  ["ARRI LogC3/Wide Gamut3", read(9.8, 14.1, 25.5, 67.8, 87.8, 7, 29)],
  ["Fuji F-Log/Rec. 2020", read(8.2, 12.2, 22, 53.3, 74.1, 6, 21)],
].map(([name, m]) => ({ name, m }));

test("the container names the maker: XAVC is Sony, BRAW is Blackmagic, nothing is null", () => {
  assert.equal(cameraHint({ tags: { major_brand: "XAVC", compatible_brands: "XAVCmp42iso2" }, path: "/x/A.MP4" }), "sony");
  assert.equal(cameraHint({ tags: {}, path: "/x/A.braw" }), "blackmagic");
  assert.equal(cameraHint({ tags: { encoder: "Lavf" }, path: "/x/A.mp4" }), null);
});

test("candidates: the hinted maker's log spaces first, then the rest, never a display space", () => {
  const names = ["ACEScct", "Rec. 709", "Sony S-Log2/S-Gamut", "Canon Log3/Cinema Gamut", "Sony S-Log3/S-Gamut3.Cine", "sRGB", "P3-D65 PQ"];
  assert.deepEqual(candidates(names, "sony"), ["Sony S-Log2/S-Gamut", "Sony S-Log3/S-Gamut3.Cine", "Canon Log3/Cinema Gamut"]);
  assert.deepEqual(candidates(names, null).length, 3);
});

test("the A7S II sweep picks S-Log3/S-Gamut3.Cine: clean and Sony; S-Log2 lifted the floor, Canon and V-Log crushed, ARRI ties on numbers and loses on maker", () => {
  const r = pick(sweep, "sony");
  assert.equal(r.name, "Sony S-Log3/S-Gamut3.Cine", JSON.stringify(r.rows));
  const by = Object.fromEntries(r.rows.map((x) => [x.name, x.score]));
  assert.ok(by["Sony S-Log2/S-Gamut"] > by["Sony S-Log3/S-Gamut3.Cine"] + 10, "the wrong Sony curve is far behind");
  assert.ok(by["ARRI LogC3/Wide Gamut3"] > by["Sony S-Log3/S-Gamut3.Cine"], "the maker breaks the tie");
  const noHint = pick(sweep, null);
  assert.ok(["Sony S-Log3/S-Gamut3.Cine", "Sony S-Log3/S-Gamut3", "ARRI LogC3/Wide Gamut3"].includes(noHint.name), "without a hint, still a clean conversion: " + noHint.name);
});

test("a picture that is not log gets no conversion: every candidate scores past the acceptance line", () => {
  const bad = [{ name: "Sony S-Log2/S-Gamut", m: read(30, 35, 50, 70, 78, 12, 18) }, { name: "Canon Log3/Cinema Gamut", m: read(0, 2, 20, 60, 100, 15, 60, 4) }];
  assert.equal(pick(bad, "sony").name, null);
});

test("the grade wires the chooser: a log clip is converted through Premiere's list once per file, then graded from the render; the footer says the override is on the project item", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const seqTool = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seqTool, /conv = await chooseLogConversion\(at, track, c\.mediaPath, region, timed, \(\) => renders\+\+\);/);
  assert.match(seqTool, /logConverted\[c\.mediaPath\] = conv;/, "once per source file");
  assert.match(seqTool, /readFrom = "premiere";\s*const cm = conv\.m\.frame \|\| conv\.m;/, "the converted read comes from Premiere");
  assert.match(seqTool, /a fix to how the footage is read, not part of the grade[\s\S]*?stays when the copy is discarded/, "the footer says the interpretation stays: it is a fix to the footage, not part of the grade");
  assert.doesNotMatch(panel.slice(panel.indexOf("async function discardCopy"), panel.indexOf("async function discardCopy") + 1500), /setColorSpace/, "Discard copy leaves the interpretation alone");
  const { REGISTRY } = require("../src/luts.cjs");
  assert.ok(REGISTRY["sony-slog3-sgamut3cine-to-709"].url, "the one verified direct link");
});

test("nothing the clip loop uses is read before its declaration (10:34: the log row pushed to parts before parts existed)", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const loop = panel.slice(panel.indexOf("  for (const c of clips) {\n    if (cancelRequested)"), panel.indexOf("async function audioClipsIn"));
  for (const name of ["parts", "needs", "logPart", "goals", "state"]) {
    const decl = loop.search(new RegExp("\\b(?:const|let) " + name + "\\b"));
    const use = loop.search(new RegExp("\\b" + name + "\\.(?:push|length)\\b|\\b" + name + " = "));
    if (decl >= 0 && use >= 0) assert.ok(decl < use, name + " is used at " + use + " before its declaration at " + decl);
  }
});

test("the maker's LUT goes on the clip through Lumetri's own Input LUT (property 4 = path, 6 = flag), not the project item", () => {
  const fs = require("node:fs"), path = require("node:path");
  const host = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  assert.match(host, /function lumetriLUT\(seconds, track, lutPath\)/);
  assert.match(host, /props\[4\]\.setValue\(want, true\); props\[6\]\.setValue\(1, true\);/, "path then flag");
  assert.match(host, /props\[6\]\.setValue\(0, true\); props\[4\]\.setValue\("", true\);/, "clearing drops the flag first");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  assert.match(panel, /await host\("lumetriLUT", String\(seconds\), String\(track\), lutPath\)/);
  assert.match(panel, /on the clip in the working copy, so Discard copy removes it/);
});

test("log_lut use is one call: maker from the file, fetch if missing, apply, judge by the render, clean up if it did not take", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const tool = panel.slice(panel.indexOf("async function logLutTool"), panel.indexOf("// The skin key is learned"));
  assert.match(tool, /if \(action === "use"\)/);
  assert.match(tool, /const hint = logCameraHint\(\{ tags: mediaTags\(clip\.mediaPath\), path: clip\.mediaPath \}\)/, "the maker comes from the file, not the editor");
  assert.match(tool, /if \(!l\.here && \(!p \|\| !fs\.existsSync\(p\)\)\) \{\s*const r = await fetchLut\(l\.id\)/, "fetches only what is missing, and never for a LUT Premiere already ships");
  assert.match(tool, /const moved = Math\.abs\(after\.luma\.p1 - before\.luma\.p1\) > 1/, "judged by the render, not the read-back");
  assert.match(tool, /await host\(where === "source" \? "setInputLUT" : "lumetriLUT", String\(seconds\), String\(track\), ""\);/, "clears the slot it used when nothing worked");
  assert.match(tool, /where === "source" \? "setInputLUT" : "lumetriLUT"/, "clip = Lumetri's Input LUT, source = Interpret Footage");
  const skill = fs.readFileSync(path.join(__dirname, "..", ".claude", "skills", "colour", "SKILL.md"), "utf8");
  assert.match(skill, /`log_lut use` at the clip's time does the lot/, "the skill tells the panel to use the one-call form");
});

test("the grade never changes a source setting on its own: log asks with BUTTONS, two binary questions, and carries on in the same pass", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const seqTool = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(panel, /budget_seconds = 150, log: logArg = "ask" \} = \{\}\)/, "ask is the default");
  const ask = seqTool.slice(seqTool.indexOf("if (log === \"ask\") {"), seqTool.indexOf("if (/^(lut|builtin)(-source)?$/.test(log))"));
  assert.ok(ask, "the ask block is still there");
  assert.match(ask, /await askInline\(/g, "the question is buttons in the message stream, not a paragraph to read");
  assert.equal(ask.match(/await askInline\(/g).length, 3, "two questions reach the editor - where, and one of the two forms of which conversion (with a built-in to compare, or without)");
  assert.match(ask, /Which conversion\?/, "question 1 names the choice between the two LUTs");
  assert.match(ask, /Where does it go\?/, "question 2 is where it goes");
  assert.match(ask, /Source settings[\s\S]*?stays after Discard copy[\s\S]*?This clip[\s\S]*?goes with Discard copy/, "each destination's cost is on its own button");
  assert.match(ask, /Premiere ships no built-in conversion for/, "and it says so when there is no built-in to choose");
  assert.match(ask, /if \(!pick\) \{[\s\S]*?logSkipped\+\+;\s*continue;/, "declining leaves the clip as shot");
  assert.match(ask, /log = \(pick === "all" \? "builtin" : "lut"\) \+ \(where \? "-source" : ""\)/, "the answer sets the route for the rest of the run");
  assert.match(seqTool, /logLutTool\(\{ action: "use", seconds: at, track, where: toSource \? "source" : "clip", which \}\)/, "the LUT goes where the editor asked, from the source they asked for");
});

test("the built-in LUT is Premiere's own file, and it exists for Sony, ARRI and RED only", () => {
  const { builtinFor, BUILTIN } = require("../src/luts.cjs");
  assert.deepEqual(Object.keys(BUILTIN).sort(), ["arri", "red", "sony"]);
  for (const m of ["canon", "panasonic", "fuji", "nikon", "dji"]) assert.equal(builtinFor(m), null, m + " has no built-in conversion in Premiere");
  const sony = builtinFor("sony");
  if (sony) { // only on a machine with Premiere installed
    assert.match(sony.path, /Adobe Premiere Pro.*Lumetri\/LUTs\//, "it is the file inside the application, not a download");
    assert.match(sony.label, /built-in/);
    assert.match(builtinFor("sony", "Sony S-Log2/S-Gamut").path, /SLOG2/, "a declared S-Log2 file gets the S-Log2 profile");
  }
});

test("the file's own declaration comes first: a tagged log file needs no rendering to identify", () => {
  const { declaredSpace } = require("../src/logspace.cjs");
  assert.deepEqual(declaredSpace({ color_transfer: "arib-std-b67" }), null, "HLG is not a maker log space we convert");
  assert.deepEqual(declaredSpace({ color_transfer: "slog3" }), { space: "Sony S-Log3/S-Gamut3.Cine", maker: "sony" });
  assert.deepEqual(declaredSpace({ TAG: "V-Log" }), { space: "Panasonic V-Log/V-Gamut", maker: "panasonic" });
  assert.equal(declaredSpace({ major_brand: "XAVC", color_transfer: "unknown" }), null, "the A7S II file declares nothing");
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const fn = panel.slice(panel.indexOf("async function chooseLogConversion"), panel.indexOf("// The makers' official conversion LUTs"));
  assert.ok(fn.indexOf("const declared = logDeclaredSpace(tags);") < fn.indexOf("const all = logCandidates"), "declaration is read before any candidate is rendered");
  assert.match(fn, /return \{ name: declared\.space, m, rows: \[\], score: 0, tried: 0, declared: true/, "a declared space costs one render, not a sweep");
});
