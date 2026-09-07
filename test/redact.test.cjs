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
