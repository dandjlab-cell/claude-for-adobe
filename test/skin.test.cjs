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

test("a tight key sits inside the loose one; the loose one reaches past the pixels' own range; saturation never keys below the floor; a key past 3x the boxes spills", () => {
  const { spills, SAT_FLOOR } = require("../src/skin.cjs");
  const w = 40, h = 40, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = 170 + (i % 40); rgb[i * 3 + 1] = 120 + (i % 20); rgb[i * 3 + 2] = 100 + (i % 10); }
  const box = [{ x0: 0, y0: 0, x1: 1, y1: 1 }];
  const loose = skinKeyFrom(rgb, w, h, box, { minPixels: 50 }), tight = skinKeyFrom(rgb, w, h, box, { minPixels: 50, tight: true });
  for (const ax of ["H", "S", "L"]) assert.ok(tight.key[ax][1] <= loose.key[ax][1] && tight.key[ax][2] <= loose.key[ax][2], ax + " tight " + tight.key[ax] + " loose " + loose.key[ax]);
  assert.ok(loose.key.S[0] - loose.key.S[2] >= SAT_FLOOR - 0.001, "sat feather floor: " + loose.key.S);
  const Ls = []; for (let i = 0; i < w * h; i++) Ls.push(hsl(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])[2]);
  assert.ok(loose.key.L[0] + loose.key.L[2] >= Math.max(...Ls) + 0.03, "the loose feather reaches past the brightest skin pixel by the margin: " + loose.key.L + " vs " + Math.max(...Ls).toFixed(3));
  assert.equal(spills(0.9999, 0.08), true, "13:15: every learned key lit the whole frame");
  assert.equal(spills(0.33, 0.0325), true, "C198 loose: the kitchen");
  assert.equal(spills(0.18, 0.0325), false, "C198 tightened: cabinets a point or two warmer under a small pad");
  assert.equal(spills(0.137, 0.063), false, "C227: skin and some oak");
});

test("a key's coverage in software: the skin it was learned from lights, a grey wall does not", () => {
  const { keyCoverage } = require("../src/skin.cjs");
  const w = 40, h = 40, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { const skin = i < w * h / 2; rgb[i * 3] = skin ? 200 : 120; rgb[i * 3 + 1] = skin ? 150 : 120; rgb[i * 3 + 2] = skin ? 120 : 122; }
  const k = skinKeyFrom(rgb, w, h, [{ x0: 0, y0: 0, x1: 1, y1: 0.5 }], { minPixels: 50 });
  const cov = keyCoverage(rgb, k.key, 1);
  assert.ok(cov > 0.45 && cov < 0.55, "half the frame is the skin: " + cov);
});

test("the mask view's grey is dropped, everything else is the selection", () => {
  const k = keyedPixels(Buffer.from([184, 184, 184, 183, 185, 184, 200, 150, 120, 10, 10, 10]));
  assert.equal(k.rgb.length / 3, 2);
  assert.equal(k.share, 50);
});
