"use strict";
// The skin key (HSL Secondary text) learned from the pixels in a hand box, and the mask-view read.
const test = require("node:test");
const assert = require("node:assert/strict");
const { hsl, skinKeyFrom, keyedPixels, formatKey } = require("../src/skin.cjs");

test("hsl: red is hue 0, cyan 0.5; grey has no saturation", () => {
  assert.deepEqual(hsl(255, 0, 0).map((v) => Math.round(v * 100) / 100), [0, 1, 0.5]);
  assert.equal(Math.round(hsl(0, 255, 255)[0] * 100) / 100, 0.5);
  assert.equal(hsl(120, 120, 120)[1], 0);
});

test("a skin box yields a tight key with outer >= inner on every axis; a grey ring in the box is ignored", () => {
  const w = 40, h = 40, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const ring = i % 7 === 0; // grey pixels sprinkled in, like the wire ring
    const r = ring ? 128 : 200 + (i % 9), g = ring ? 128 : 150 + (i % 5), b = ring ? 128 : 120 + (i % 3);
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  const k = skinKeyFrom(rgb, w, h, [{ x0: 0, y0: 0, x1: 1, y1: 1 }], { minPixels: 50 });
  assert.ok(k && k.pixels > 1000 && k.share > 80, JSON.stringify(k));
  for (const ax of ["H", "S", "L"]) { const [c, i, o] = k.key[ax]; assert.ok(o >= i && i > 0 && c >= 0 && c <= 1, ax + " " + k.key[ax]); }
  assert.ok(k.key.H[0] < 0.12, "skin hue near red-orange: " + k.key.H[0]);
  assert.match(k.text, /^H:\d\.\d\d,\d\.\d\d,\d\.\d\d;S:.*;L:.*$/);
  assert.equal(skinKeyFrom(rgb, w, h, [{ x0: 0, y0: 0, x1: 0.05, y1: 0.05 }]), null, "too few pixels: no key");
});

test("the mask view's grey is dropped, everything else is the selection", () => {
  const k = keyedPixels(Buffer.from([184, 184, 184, 183, 185, 184, 200, 150, 120, 10, 10, 10]));
  assert.equal(k.rgb.length / 3, 2);
  assert.equal(k.share, 50);
});
