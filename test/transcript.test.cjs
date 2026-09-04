const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { linesFromWords, listTranscripts, pausesFromWords, tc, transcriptForClip } = require("../src/transcript.cjs");

test("pausesFromWords uses Premiere's rule: word gaps >= minPause", () => {
  const words = [{ text: "a", start: 0.2, end: 0.5 }, { text: "b", start: 0.6, end: 1.0 }, { text: "c", start: 2.0, end: 2.4 }, { text: "d", start: 2.9, end: 3.1 }];
  assert.deepEqual(pausesFromWords(words, 0.75), [{ start: 1.0, end: 2.0 }]);
  assert.deepEqual(pausesFromWords(words, 0.5), [{ start: 1.0, end: 2.0 }, { start: 2.4, end: 2.9 }]);
});

test("listTranscripts finds blobs with nearby media path; transcriptForClip matches by basename", () => {
  const xml = '<Project><Media><ActualMediaFilePath>/Volumes/X/clip one.mov</ActualMediaFilePath><Title>clip one.mov</Title><TranscriptData Encoding="base64">AAAA</TranscriptData></Media>'
    + '<Media><ActualMediaFilePath>/Volumes/X/two.mp4</ActualMediaFilePath><TranscriptData Encoding="base64">BBBB</TranscriptData></Media></Project>';
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tr-")), "p.prproj");
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(xml)));
  const list = listTranscripts(file);
  assert.equal(list.length, 2);
  assert.equal(list[1].mediaPath, "/Volumes/X/two.mp4");
  assert.equal(transcriptForClip(list, { mediaPath: "/other/mount/two.mp4", name: "two.mp4" }).base64, "BBBB");
  assert.equal(transcriptForClip(list, { mediaPath: "/nowhere/three.mov", name: "three" }), null);
  assert.equal(transcriptForClip([list[0]], { mediaPath: "/nowhere/three.mov", name: "three" }).base64, "AAAA");
});

test("linesFromWords breaks at gaps and sentence ends, shifts to timeline seconds", () => {
  const words = [{ text: "Hi", start: 0.0, end: 0.2 }, { text: "there.", start: 0.3, end: 0.6 }, { text: "Next", start: 0.7, end: 0.9 }, { text: "line", start: 2.0, end: 2.3 }];
  assert.deepEqual(linesFromWords(words, 10), [{ start: 10.0, end: 10.6, text: "Hi there." }, { start: 10.7, end: 10.9, text: "Next" }, { start: 12.0, end: 12.3, text: "line" }]);
  assert.equal(tc(75.25), "1:15.3");
});
