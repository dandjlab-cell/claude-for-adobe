"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { measure, readings } = require("../src/scopes.cjs");

const frame = (px, fn) => { const b = Buffer.alloc(px * 3); for (let i = 0; i < px; i++) { const [r, g, bl] = fn(i); b[i * 3] = r; b[i * 3 + 1] = g; b[i * 3 + 2] = bl; } return b; };

test("a full 0-255 grey ramp is in range: full contrast, nothing clipped beyond the top step, no cast", () => {
  const m = measure(frame(256 * 40, (i) => { const v = Math.floor(i / 40); return [v, v, v]; }));
  assert.equal(m.luma.min, 0); assert.equal(m.luma.max, 100);
  assert.ok(m.luma.p99 - m.luma.p1 > 90);
  assert.equal(m.cast.cb, 0); assert.equal(m.cast.cr, 0);
  assert.ok(m.clipped.red < 0.5 && m.crushed < 3);
  assert.equal(m.saturation.p99, 0);
});
test("crushed blacks, clipped highlights and low contrast are named from the numbers", () => {
  const crushed = measure(frame(1000, (i) => i < 100 ? [0, 0, 0] : [120, 120, 120]));
  assert.ok(readings(crushed).some((r) => r.startsWith("luma floor: 10%")), readings(crushed).join(" | "));
  const blown = measure(frame(1000, (i) => i < 50 ? [255, 255, 255] : [0, 0, 0].map(() => 20 + (i % 200))));
  assert.ok(readings(blown).some((r) => /channel at 255: red 5%, green 5%, blue 5%/.test(r)), readings(blown).join(" | "));
  const flat = measure(frame(1000, (i) => { const v = 100 + (i % 60); return [v, v, v]; }));
  assert.ok(readings(flat).some((r) => r.startsWith("narrow tonal spread")));
});
test("the minimum is the darkest occupied level, and saturation is not capped at the red primary", () => {
  const grey = measure(frame(100, () => [128, 128, 128]));
  assert.equal(grey.luma.min, 50.2); assert.equal(grey.luma.max, 50.2);
  assert.ok(measure(frame(100, () => [0, 255, 0])).saturation.p50 > 110, "pure green sits outside the red radius");
  const red = measure(frame(100, () => [255, 0, 0])).saturation.p50;
  assert.ok(red >= 100 && red <= 106, "pure red sits on the ~103 radius: " + red);
});
test("a warm frame leans red, a cool frame leans blue, and a neutral one reads clean", () => {
  assert.ok(readings(measure(frame(1000, () => [180, 120, 90]))).some((r) => /leans red\/warm and yellow/.test(r)));
  assert.ok(readings(measure(frame(1000, () => [90, 120, 180]))).some((r) => /leans cyan and blue/.test(r)));
  const clean = readings(measure(frame(256 * 4, (i) => { const v = Math.floor(i / 4); return [v, v, v]; })));
  assert.ok(clean[0].startsWith("no endpoint pile-up"), clean.join(" | "));
});
test("a real PNG goes through ffmpeg: decoded at full size, measured, and drawn as one scope image", (t) => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { spawnSync } = require("node:child_process");
  const { FFMPEG } = require("../src/media.cjs"), { decodeRgb, renderScopes } = require("../src/scopes.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-scopes-")), png = path.join(dir, "f.png"), jpg = path.join(dir, "s.jpg");
  const made = spawnSync(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "color=c=0x806040:s=320x180", "-frames:v", "1", png]);
  if (made.status !== 0) { t.skip("ffmpeg not available"); return; }
  const rgb = decodeRgb(png);
  assert.equal(rgb.length, 320 * 180 * 3);
  assert.deepEqual([rgb[0], rgb[1], rgb[2]], [0x80, 0x60, 0x40]);
  assert.ok(readings(measure(rgb)).some((r) => /leans red\/warm and yellow/.test(r)));
  renderScopes(png, jpg);
  assert.ok(fs.statSync(jpg).size > 1000);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- measuring a region rather than the whole frame -------------------------------------------------------
const { maskRgb, decodeRgb, decodeGray } = require("../src/scopes.cjs");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { FFMPEG } = require("../src/media.cjs");

test("a mask keeps only the pixels it marks, and refuses to keep none", () => {
  const rgb = frame(4, (i) => [i * 10, 0, 0]);          // four pixels, red 0/10/20/30
  const keep = Buffer.from([0, 255, 255, 0]);           // keep the middle two
  const m = measure(maskRgb(rgb, keep));
  assert.equal(m.pixels, 2);
  assert.equal(Math.round(m.red.mean * 2.55), 15, "mean of red 10 and 20");
  assert.throws(() => maskRgb(rgb, Buffer.from([0, 0, 0, 0])), /keeps no pixels/);
  assert.throws(() => maskRgb(rgb, Buffer.from([255, 255])), /mask is 2 pixels, frame is 4/);
});

test("bin/ocr --subject finds a subject and its mask lines up with the frame", { skip: process.platform !== "darwin" ? "macOS Vision only" : false }, () => {
  const bin = path.join(__dirname, "..", "bin", "ocr");
  if (!fs.existsSync(bin)) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "subject-"));
  const png = path.join(dir, "frame.png");
  // A red square on grey: Vision's foreground segmentation picks the square out.
  spawnSync(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=640x360", "-vf", "drawbox=x=220:y=80:w=200:h=200:color=red:t=fill", "-frames:v", "1", png]);
  const out = spawnSync(bin, ["--subject", png], { encoding: "utf8" });
  const entry = JSON.parse(out.stdout.trim().split("\n").pop());
  assert.ok(entry.mask && fs.existsSync(entry.mask), "a mask file was written");
  assert.ok(Math.abs(entry.coverage - 0.174) < 0.02, "covers about the square's 17.4% of the frame, got " + entry.coverage);
  // The extent is reported top-left origin, as fractions: the square sits at x 220-420 of 640, y 80-280 of 360.
  assert.ok(Math.abs(entry.box[0] - 220 / 640) < 0.02 && Math.abs(entry.box[1] - 80 / 360) < 0.02, "box origin " + entry.box);
  const subject = measure(maskRgb(decodeRgb(png), decodeGray(entry.mask)));
  const whole = measure(decodeRgb(png));
  assert.ok(subject.red.mean > 95 && subject.green.mean < 3, "the subject measures as pure red, not the grey mix (" + subject.red.mean + "/" + subject.green.mean + ")");
  assert.ok(whole.red.mean < 70, "the whole frame is the mix");
  fs.rmSync(dir, { recursive: true, force: true });
});
