"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildLedger, visibleAt } = require("../src/ledger.cjs");

const row = (o) => Object.assign({ track: "V1", name: "head", x: 0.5, y: 0.5, scale: 100, srcW: 1080, srcH: 1920, start: 0, end: 20, opacity: 100, mediaPath: "/m/head.mp4", alpha: false, masked: false, graphic: false, crop: null }, o);
const snapClip = (r) => ({ id: r.name + r.start, track: r.track, name: r.name, start: r.start, end: r.end, inPoint: 0, mediaPath: r.mediaPath });

test("ledger answers visibility by lookup and grades every cut", () => {
  const rows = [row({ end: 10 }), row({ name: "head2", start: 10, end: 20 }), row({ track: "V2", name: "broll", start: 8, end: 12, x: 0.25, scale: 50, srcW: 1080, srcH: 3840 })];
  const snap = { name: "s", width: 1080, height: 1920, duration: 20, clips: rows.map(snapClip) };
  const L = buildLedger(snap, { w: 1080, h: 1920, rows });
  assert.strictEqual(L.cover.length, 40);
  assert.ok(Math.abs(visibleAt(L, 9).hidden - 0.5) < 0.03, "half hidden by the side-by-side");
  assert.strictEqual(visibleAt(L, 2).hidden, 0);
  assert.strictEqual(L.cuts.length, 3, "V1 cut at 10 plus the b-roll edges at 8 and 12 change the picture");
  const at10 = L.cuts.find((c) => c.t === 10);
  assert.ok(at10.hiddenBefore >= 0.45 && at10.hiddenAfter >= 0.45);
  assert.deepStrictEqual(at10.by, ["V2 broll"]);
});
