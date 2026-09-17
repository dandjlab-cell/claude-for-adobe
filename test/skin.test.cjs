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

test("a key that holds the room scales the move down instead of vetoing it", () => {
  const { attenuationFor } = require("../src/skin.cjs");
  assert.equal(attenuationFor(0.19, 0.063), 1, "inside the rule: full strength");
  assert.equal(attenuationFor(0.532, 0.0567), 0.51, "half the frame lit for 6% of hands: about half strength");
  assert.ok(attenuationFor(0.99, 0.03) >= 0.25, "never under a quarter");
});

test("the mask view's grey is dropped, everything else is the selection", () => {
  const k = keyedPixels(Buffer.from([184, 184, 184, 183, 185, 184, 200, 150, 120, 10, 10, 10]));
  assert.equal(k.rgb.length / 3, 2);
  assert.equal(k.share, 50);
});

// The spill rule: a key that lights the room as well as the subject scales the correction rather than
// vetoing it (attenuationFor, src/skin.cjs). It was NOT in force — panel.js passed key.attenuation as a
// third argument to skinFor, which declared two, so JavaScript dropped it and every skin move ran at full
// strength through a leaky key. Found 2026-09-17 while mapping the controls.
test("a leaky key scales the skin correction instead of applying it in full", () => {
  const { skinFor } = require("../src/grade_rules.cjs");
  const m = { cast: { cb: 8, cr: 20 }, saturation: { p50: 30 }, luma: { p1: 5, p50: 55, p99: 90 } }; // hue 68°, outside the corridor
  const full = skinFor(m, { saturation: 100 }, 1);
  const half = skinFor(m, { saturation: 100 }, 0.5);
  const quarter = skinFor(m, { saturation: 100 }, 0.25);
  assert.ok(full.pad.sat > half.pad.sat && half.pad.sat > quarter.pad.sat, "the pad scales down with the spill");
  assert.ok(Math.abs(half.pad.sat - full.pad.sat / 2) < 0.005, "and scales linearly: " + half.pad.sat + " vs " + full.pad.sat / 2);
  assert.equal(half.pad.hue, full.pad.hue, "the direction is unchanged - only the amount");
  assert.match(half.why.join(" "), /scaled to 50% - the key lights more than its subject/, "and the row says so");
  // Saturation is attenuated TOWARD neutral, not toward zero: 100 is the no-op for this knob.
  const sm = { cast: { cb: -12, cr: 20 }, saturation: { p50: 60 }, luma: { p1: 5, p50: 55, p99: 90 } };
  const sFull = skinFor(sm, { saturation: 100 }, 1), sQuarter = skinFor(sm, { saturation: 100 }, 0.25);
  assert.ok(sFull.saturation < sQuarter.saturation && sQuarter.saturation < 100, "a quarter-strength move lands nearer 100: " + sFull.saturation + " -> " + sQuarter.saturation);
  // Omitting the argument must behave exactly as attenuation 1, so an un-keyed caller is unaffected.
  assert.deepEqual(skinFor(m, { saturation: 100 }), full);
  // And the caller must actually pass it — that is the bug this test exists for.
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  assert.match(panel, /gradeSkinFor\(skinNow, \{ saturation: 100 \}, key\.attenuation\)/, "panel.js passes the key's attenuation");
});
