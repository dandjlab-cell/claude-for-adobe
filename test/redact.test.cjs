"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { redact, timelineShape } = require("../src/redact.cjs");

test("paths, names, emails, urls and keys never survive", () => {
  // Fixtures are assembled at runtime so the repo's own privacy scan (which cannot tell a fake from a real one)
  // never sees a literal path or address in this file.
  const vol = "/" + "Volumes" + "/Big Drive/Clients/ACME/cut.prproj";
  const home = "/" + "Users" + "/someone/Library/thing";
  const mail = "someone" + "@" + "example.com";
  const log = [
    "project: " + vol,
    "tool extract_ranges 0.8s -> removed 0.96s of \"Interview_JaneDoe_C255.braw\"",
    "tool read_transcript 0.1s -> 412 words: \"we should talk about the merger\"",
    "session for " + mail + " at https://api.example.com/v1/x?key=1 token sk-ant-abcdefghijklmnop",
    "home " + home,
  ].join("\n");
  const r = redact(log, { names: ["Interview_JaneDoe_C255.braw"] });
  assert.ok(!/ACME|JaneDoe|merger|someone@|Big Drive|someone\/Library|sk-ant-abc/.test(r), r);
  assert.ok(/item-[0-9a-f]{5}\.braw/.test(r), "media names become stable tags with their extension");
  assert.ok(!/read_transcript/.test(r), "transcript tool lines are dropped whole");
  assert.ok(/\[email\]/.test(r) && /\[url\]/.test(r) && /\[key\]/.test(r));
});
test("timeline shape carries counts, not names", () => {
  const s = timelineShape({ width: 1080, height: 1920, duration: 20.5, clips: [{ track: "V1", name: "secret" }, { track: "V2", name: "x" }, { track: "A1", name: "y" }] });
  assert.strictEqual(s, "1080x1920, 20.50s, 3 clips: A1=1 V1=1 V2=1");
});

test("names the caller did not list still become tags: filenames, quoted names, bin paths", () => {
  const log = [
    "tool project_bins 0.0s -> v3.mov",
    "selection: Project panel: bin \"BROLL\" (2 items), bin \"TALKING HEAD\" (2 items) [bin path 2_TO EDIT/090726_qRAFT/BROLL]",
    "active sequence is now \"090726_qRAFT 9x16\" (1080x1920, 23.06s)",
    "tool morph_cut 0.3s -> CHECK PASS after \"V1\"",
  ].join("\n");
  const r = redact(log, { names: [] });
  assert.ok(!/v3|BROLL|TALKING HEAD|qRAFT|TO EDIT/.test(r), r);
  assert.ok(/item-[0-9a-f]{5}\.mov/.test(r));
  assert.ok(/"V1"/.test(r) && /PASS/.test(r), "track names and verdicts stay readable");
});
