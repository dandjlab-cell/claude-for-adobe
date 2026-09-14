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
