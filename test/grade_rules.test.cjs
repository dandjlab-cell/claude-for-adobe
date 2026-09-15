"use strict";
// The decisions "grade this video" makes, as rules, checked against real subject readings from the
// 2026-09-15 live run - the run where the model's own decisions pushed a dark bottle up three stops.
const test = require("node:test");
const assert = require("node:assert/strict");
const { goalsFor, verdict, BANDS } = require("../src/grade_rules.cjs");

const m = (luma, red, green, blue, extra = {}) => ({
  luma: { min: luma[0] - 3, p1: luma[0], p50: luma[1], p99: luma[2], max: luma[2] + 5 },
  red: { mean: 0, p1: red[0], p99: red[1] }, green: { mean: 0, p1: green[0], p99: green[1] }, blue: { mean: 0, p1: blue[0], p99: blue[1] },
  saturation: { p50: 15 }, cast: { cb: 0, cr: 0 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0, ...extra,
});

test("a dark bottle is lifted into the product band, not to a face's brightness", () => {
  const bottle = m([7.1, 21.2, 51.4], [7.5, 57.3], [6.7, 50.6], [5.9, 51]);
  const g = goalsFor(bottle, "subject");
  const exp = g.find((x) => x.param === "exposure");
  assert.equal(exp.target, BANDS.subject[0] + 2, "just inside the band, got " + exp.target);
  assert.ok(exp.target < 53, "never a skin target for a product");
});

test("blue whites on the parade become a temperature goal of zero; aligned whites are left alone", () => {
  const blue = m([22.7, 45, 82], [14.5, 78], [23.5, 81], [31.8, 86]);
  const g = goalsFor(blue, "subject");
  assert.deepEqual(g.map((x) => x.param), ["temperature"], "only white balance is off here: " + JSON.stringify(g));
  assert.equal(g[0].target, 0);
  assert.match(g[0].why, /blue/);

  const neutral = m([14.1, 44.7, 71.8], [9.4, 72.5], [14.5, 71.8], [17.3, 72.5]);
  assert.deepEqual(goalsFor(neutral, "subject"), [], "a balanced shot gets no goals");
});

test("white balance reads the FRAME's whites when a subject was measured", () => {
  // A red product: its own brightest pixels are red. The frame's whites are neutral. No temperature goal.
  const redProduct = m([20, 45, 70], [30, 90], [20, 60], [15, 50], {
    frame: { luma: { p1: 5, p50: 40, p99: 88 }, red: { p1: 5, p99: 88 }, green: { p1: 5, p99: 88 }, blue: { p1: 5, p99: 88.5 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0 },
  });
  assert.equal(goalsFor(redProduct, "subject").some((x) => x.param === "temperature"), false, "the product's colour is not the light");
});

test("a face uses the skin band, and flat spread gets a contrast goal", () => {
  const face = m([12, 45, 62], [12, 62], [12, 62], [12, 62]);
  const g = goalsFor(face, "face");
  assert.equal(g.find((x) => x.param === "exposure").target, BANDS.face[0] + 2);
  assert.equal(g.find((x) => x.param === "contrast").target, 70, "spread 50 is flat");
  const harsh = m([2, 45, 95], [2, 95], [2, 95], [2, 95]);
  assert.equal(goalsFor(harsh, "frame").find((x) => x.param === "contrast").target, 70);
});

test("goals come in colourist order: white balance, exposure, contrast", () => {
  const messy = m([5, 20, 50], [5, 45], [5, 50], [5, 60]);
  assert.deepEqual(goalsFor(messy, "subject").map((x) => x.param), ["temperature", "exposure", "contrast"]);
});

test("the verdict names what is still off, in words, and is silent when balanced", () => {
  const good = m([10, 47, 80], [10, 80], [10, 80], [10, 80.5]);
  assert.deepEqual(verdict(good, "subject"), { balanced: true, notes: [] });
  const clipped = m([2, 47, 97], [2, 97], [2, 97], [2, 97], { clipped: { red: 3, green: 0, blue: 0 } });
  const v = verdict(clipped, "subject");
  assert.equal(v.balanced, false);
  assert.ok(v.notes.some((n) => /clipped 3/.test(n)) && v.notes.some((n) => /near clipping/.test(n)) && v.notes.some((n) => /near crushing/.test(n)), v.notes.join(" | "));
});

test("grade_sequence is wired and calls the rules, not the model", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  assert.match(panel, /grade_sequence: gradeSequenceTool/);
  assert.match(panel, /name: "grade_sequence", description:/);
  assert.match(panel, /gradeGoalsFor\(m, seen\)/, "goals come from grade_rules");
  assert.match(panel, /if \(cancelRequested\) \{ stopped = true; break; \}/, "Stop ends it after the current clip");
});
