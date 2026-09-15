"use strict";
// The rules are the colourist canon (black point, white point, parade neutral via the wheels, contrast
// only when flat or harsh, skin on the vectorscope line), not invented bands. Checked against real
// frame readings from the 2026-09-15 live runs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { goalsFor, verdict, WHITE_POINT, SKIN_LUMA } = require("../src/grade_rules.cjs");

const frame = (p1, p50, p99, rgbP1, rgbP99, extra = {}) => ({
  luma: { min: p1 - 3, p1, p50, p99, max: p99 + 3 },
  red: { mean: 40, p1: rgbP1[0], p99: rgbP99[0] }, green: { mean: 40, p1: rgbP1[1], p99: rgbP99[1] }, blue: { mean: 40, p1: rgbP1[2], p99: rgbP99[2] },
  saturation: { p50: 25 }, cast: { cb: -6, cr: 7 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0, ...extra,
});
const withSubject = (f, subject) => ({ ...subject, frame: f });

test("a shot with a good white point, neutral parade and normal spread is left alone", () => {
  const f = frame(5, 40, 89, [5, 5, 5], [89, 89, 89.5]);
  const g = goalsFor(f, "frame");
  assert.deepEqual([...g], []);
  assert.deepEqual(g.needs, []);
  assert.equal(verdict(f, "frame").balanced, true);
});

test("a low white point is lifted with the Highlights wheel's luma (gain), not by chasing a subject brightness", () => {
  // Clip 1 of the live run: whites at 73, a dark bottle as the subject. The canon sets the white point.
  const f = frame(5, 30, 73, [5, 5, 5], [73, 73, 73]);
  const g = goalsFor(withSubject(f, frame(7, 21, 51, [7, 7, 6], [57, 50, 51])), "subject");
  assert.ok(g.wheels.highlights, "the Highlights wheel is the tool");
  assert.ok(g.wheels.highlights.luma > 0.5, "luma up to lift the white point, got " + g.wheels.highlights.luma.toFixed(2));
  assert.match(g.wheels.highlights.why.join(" "), /white point 73/);
  assert.equal([...g].some((x) => x.param === "exposure"), false, "exposure is no longer the white-point tool");
  assert.equal([...g].some((x) => x.statistic === "brightness"), false, "no invented subject band");
});

test("a subject's own narrow spread is NOT a contrast goal; the frame's is", () => {
  const f = frame(8, 40, 90, [8, 8, 8], [90, 90, 90]); // frame spread 82: fine
  const bottle = frame(20, 30, 45, [20, 20, 20], [45, 45, 45]); // subject spread 25: naturally flat
  assert.equal(goalsFor(withSubject(f, bottle), "subject").some((x) => x.param === "contrast"), false);
  const flat = frame(20, 40, 65, [20, 20, 20], [65, 65, 65]); // frame spread 45
  const c = goalsFor(flat, "frame").find((x) => x.param === "contrast");
  assert.equal(c.cap, 60, "an automatic pass never slams contrast to its end");
});

test("a shadow cast is cancelled with the Shadows wheel's pad, never with temperature", () => {
  const f = frame(4, 40, 90, [14.5, 23.5, 31.8], [90, 90, 90]); // blacks blue by 17, whites neutral
  const g = goalsFor(f, "frame");
  assert.equal([...g].some((x) => x.param === "temperature"), false);
  const sh = g.wheels.shadows;
  assert.ok(sh && sh.sat > 0.1, "a pad move, sat " + (sh && sh.sat));
  assert.ok(sh.hue > 0 && sh.hue < 60, "toward orange against blue blacks, got " + sh.hue.toFixed(1));
  assert.equal(g.wheels.highlights, undefined, "the whites were neutral: the Highlights pad is left alone");
});

test("a whites cast is cancelled with the Highlights wheel's pad", () => {
  const f = frame(4, 40, 90, [4, 4, 4], [86, 88, 93]); // whites blue by 7
  const g = goalsFor(f, "frame");
  assert.equal([...g].some((x) => x.param === "temperature"), false, "temperature is not the tool any more");
  const hi = g.wheels.highlights;
  assert.ok(hi && hi.sat > 0.02 && hi.hue > 0 && hi.hue < 60, "warm pad on the Highlights wheel: " + JSON.stringify(hi));
});

test("a second pass adds to the wheels' current position instead of restarting from neutral", () => {
  const f = frame(4, 40, 90, [4, 4, 4], [86, 88, 93]);
  const fresh = goalsFor(f, "frame").wheels.highlights;
  const again = goalsFor(f, "frame", { highlights: { hue: fresh.hue, sat: fresh.sat, luma: 0.5 } }).wheels.highlights;
  assert.ok(again.sat > fresh.sat, "the same cast still showing means the pad moves further: " + fresh.sat.toFixed(3) + " -> " + again.sat.toFixed(3));
});

test("skin is judged on the face: luma into 40-70, hue against the skin line", () => {
  const f = frame(4, 40, 90, [4, 4, 4], [90, 90, 90]);
  const darkFace = frame(10, 30, 60, [10, 10, 10], [60, 60, 60], { cast: { cb: -6, cr: 9 } }); // hue ~124: on the line
  const g = goalsFor(withSubject(f, darkFace), "face");
  const exp = g.find((x) => x.param === "exposure" && x.statistic === "brightness");
  assert.equal(exp.target, SKIN_LUMA[0] + 5);
  assert.equal(g.needs.some((n) => /skin hue/.test(n)), false, "on the line: " + g.needs);
  const greenFace = frame(10, 55, 70, [10, 10, 10], [70, 70, 70], { cast: { cb: 2, cr: -5 } }); // hue ~292
  assert.ok(goalsFor(withSubject(f, greenFace), "face").needs.some((n) => /skin hue .* off the skin line/.test(n)));
});

test("the verdict speaks the canon", () => {
  const v = verdict(frame(9, 40, 97, [9, 9, 9], [95, 96, 99], { clipped: { red: 3, green: 0, blue: 0 } }), "frame");
  assert.equal(v.balanced, false);
  assert.ok(v.notes.some((n) => /black point .* lifted/.test(n)) && v.notes.some((n) => /near clipping/.test(n)) && v.notes.some((n) => /clipped 3/.test(n)), v.notes.join(" | "));
});

test("grade_sequence is wired, follows the rules, reuses the read's region on the confirm", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  assert.match(panel, /grade_sequence: gradeSequenceTool/);
  assert.match(panel, /gradeGoalsFor\(m, seen, currentWheels\)/);
  assert.match(panel, /measureFrameAt\(at, \{ region, reuse \}\)/, "the confirm measures the read's pixels");
  assert.match(panel, /NEEDS: /, "what the panel cannot drive is said out loud");
  assert.match(panel, /wheelWriter\(at, track\)/, "the wheels are written from the sequence tool");
});
