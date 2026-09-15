"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { FFMPEG } = require("../src/media.cjs");
const { frameRgb, frameSize, sourceSeconds } = require("../src/source_frame.cjs");
const { measure } = require("../src/scopes.cjs");

// Synthesised clips, so the test carries its own footage: 2 s of pure mid-grey then 2 s of pure red.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srcframe-"));
const clip = path.join(dir, "clip.mov");
const made = (() => {
  const r = spawnSync(FFMPEG, ["-nostdin", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=0x808080:s=640x360:r=25:d=2",
    "-f", "lavfi", "-i", "color=c=red:s=640x360:r=25:d=2",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]",
    "-c:v", "prores_ks", "-profile:v", "0", clip]);
  return r.status === 0 && fs.existsSync(clip);
})();
const needsFfmpeg = { skip: made ? false : "ffmpeg could not synthesise the test clip" };

test("decodes the frame at a source time: grey early, red late", needsFfmpeg, () => {
  const m = measure(frameRgb(clip, 1.0).rgb);
  assert.ok(Math.abs(m.red.mean - m.blue.mean) < 2, "grey has no channel separation, got r " + m.red.mean + " b " + m.blue.mean);
  assert.ok(m.luma.p50 > 40 && m.luma.p50 < 60, "mid grey sits mid scale, got " + m.luma.p50);

  const red = measure(frameRgb(clip, 3.0).rgb);
  assert.ok(red.red.mean > red.blue.mean + 40, "the late frame is red, got r " + red.red.mean + " b " + red.blue.mean);
  assert.ok(red.cast.cr > 0, "a red frame leans warm");
});

test("the returned buffer is exactly width*height*3 and honours maxWidth", needsFfmpeg, () => {
  const small = frameRgb(clip, 1.0, { maxWidth: 320 });
  assert.equal(small.width, 320);
  assert.equal(small.rgb.length, small.width * small.height * 3);

  const native = frameRgb(clip, 1.0, { maxWidth: 0 });
  assert.deepEqual([native.width, native.height], [640, 360]);
  assert.equal(native.rgb.length, 640 * 360 * 3);
});

test("frameSize keeps aspect with an even height and never upscales", needsFfmpeg, () => {
  assert.deepEqual(frameSize(clip, 320), { width: 320, height: 180 });
  assert.deepEqual(frameSize(clip, 4000), { width: 640, height: 360 }, "a small source is left alone");
});

test("reading past the end of the clip fails loudly", needsFfmpeg, () => {
  assert.throws(() => frameRgb(clip, 99), /no frame at 99s|frame decode failed/);
});

test("camera raw without a decoder names the fallback instead of returning nothing", () => {
  assert.throws(() => frameRgb("/x/A001_C001.R3D", 1), /vendor SDK or a Premiere frame export/);
  // BRAW goes to the SDK helper; a file that does not exist fails there, loudly, never silently.
  assert.throws(() => frameRgb("/x/A001_C001.braw", 1), /BRAW (info failed|decoder)/);
});

test("timeline seconds map into the source through the clip's in point", () => {
  // A clip that starts 10 s into the timeline, taken from 4 s into its source.
  assert.equal(sourceSeconds(10, 10, 4), 4, "the clip's first frame is its in point");
  assert.equal(sourceSeconds(12.5, 10, 4), 6.5);
  assert.throws(() => sourceSeconds(9, 10, 4), /before the clip starts/);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
