"use strict";
// The loop is driven against Premiere's REAL measured response: test/fixtures/lumetri_sweeps.json holds
// three live calibration sweeps, and the stand-in host below interpolates them. So these tests exercise
// bracketing, solving, writing and verifying against how Lumetri actually behaved on a BRAW frame -
// including the parts that are awkward (Exposure's highlight rolloff, a cast that crosses zero, a
// statistic that does not move) - without opening Premiere.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { steer, PARAMS, MAX_MEASURES } = require("../src/grade.cjs");

const SWEEPS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "lumetri_sweeps.json"), "utf8"));

// Piecewise-linear replay of a sweep: exact at every measured point, reasonable between them. Outside
// the swept range it clamps, which stands in for a parameter refusing to go further.
function premiereStandIn(name) {
  const s = SWEEPS[name];
  const lo = s.values[0], hi = s.values[s.values.length - 1];
  let current = 0, writes = 0, measures = 0;
  const pick = (key, value) => {
    const xs = s.values, ys = s[key];
    if (value <= xs[0]) return ys[0];
    if (value >= xs[xs.length - 1]) return ys[ys.length - 1];
    const i = xs.findIndex((x) => x > value) - 1;
    return ys[i] + (ys[i + 1] - ys[i]) * (value - xs[i]) / (xs[i + 1] - xs[i]);
  };
  return {
    set: (value) => { writes++; current = Math.min(hi, Math.max(lo, value)); return current; },
    measure: () => {
      measures++;
      const at = (k) => pick(k, current);
      return {
        luma: { min: at("min"), p1: at("p1"), p50: at("p50"), p99: at("p99"), max: at("max") },
        red: { mean: at("red") }, green: { mean: at("green") }, blue: { mean: at("blue") },
        saturation: { p50: at("sat") }, cast: { cb: at("cb"), cr: at("cr") },
      };
    },
    get counts() { return { writes, measures, current }; },
  };
}

test("steers Exposure to a brightness target and verifies it on the render", async () => {
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "exposure", target: 45 });
  assert.equal(r.hit, true, "achieved " + r.achieved + " after " + r.measures + " measures");
  assert.ok(Math.abs(r.achieved - 45) <= 0.5);
  assert.ok(r.value > 0 && r.value < 1, "45 sits between the readings at 0 (36.9) and 1 (47.5), got " + r.value.toFixed(2));
  assert.ok(r.measures <= 4, "took " + r.measures + " measures");
  assert.equal(r.reliable, true);
});

test("steers Contrast by the spread, which is the statistic it actually moves", async () => {
  const host = premiereStandIn("contrast");
  const r = await steer({ set: host.set, measure: host.measure, param: "contrast", target: 80 });
  assert.equal(r.hit, true, "achieved " + r.achieved);
  assert.ok(r.value > 20 && r.value < 60, "spread 80 sits between contrast 20 and 50, got " + r.value.toFixed(1));
});

test("steers Temperature through a cast that crosses zero", async () => {
  const host = premiereStandIn("temperature");
  const cool = await steer({ set: host.set, measure: host.measure, param: "temperature", target: 1.0 });
  assert.equal(cool.hit, true, "achieved " + cool.achieved + " at " + cool.value);
  assert.ok(cool.value < -50, "warmth 1.0 needs a strongly cool setting, got " + cool.value.toFixed(1));

  const warm = await steer({ set: host.set, measure: host.measure, param: "temperature", target: 11 });
  assert.equal(warm.hit, true, "achieved " + warm.achieved);
  assert.ok(warm.value > 50, "warmth 11 needs a warm setting, got " + warm.value.toFixed(1));
});

test("a target the parameter cannot reach ends honestly instead of looping", async () => {
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "exposure", target: 95 }); // the median tops out at 58.8
  assert.equal(r.hit, false);
  assert.ok(r.measures <= MAX_MEASURES, "bounded at " + r.measures + " measures");
  assert.ok(r.achieved <= 58.9, "got as close as the parameter allows: " + r.achieved);
});

test("steering by a statistic the parameter does not move does not fake a result", async () => {
  // Contrast pivots around the median: it moved 39.2 -> 36.1 across the entire range. An agent that
  // steers brightness with Contrast must be told it failed, not handed a confident number.
  const host = premiereStandIn("contrast");
  const r = await steer({ set: host.set, measure: host.measure, param: "contrast", statistic: "brightness", target: 50 });
  assert.equal(r.hit, false);
  assert.ok(r.measures <= MAX_MEASURES);
});

test("a parameter that will not take the value reports the clamp", async () => {
  const stuck = { set: () => 0, measure: () => premiereStandIn("exposure").measure() };
  const r = await steer({ set: stuck.set, measure: stuck.measure, param: "exposure", target: 45, start: 3 });
  assert.equal(r.hit, false);
  assert.match(r.problem, /clamped/);
});

test("every reading taken is returned, so the panel can show its work", async () => {
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "exposure", target: 45 });
  assert.ok(r.readings.length >= 2);
  for (const reading of r.readings) {
    assert.ok(isFinite(reading.value) && isFinite(reading.stat));
  }
  assert.equal(r.readings.length, r.measures);
});

test("the three swept parameters are marked tested and the rest are not", () => {
  assert.deepEqual(Object.keys(PARAMS).filter((k) => PARAMS[k].tested).sort(), ["contrast", "exposure", "temperature"]);
  assert.equal(PARAMS.shadows.tested, false, "reasoned from the control's purpose, not measured yet");
});

test("the tool is wired, and its schema cannot drift from the parameters it can actually drive", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const host = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  assert.match(panel, /TOOLS = \{[^}]*grade: gradeTool/, "grade is in the tool registry");
  assert.match(panel, /name: "grade", description:/, "grade has a definition the model can read");
  assert.match(panel, /host\("lumetriParam"/, "the tool writes through the host function");
  assert.match(host, /lumetriParam: lumetriParam/, "and that function is exported");

  // The enum in the tool schema is what the model is allowed to ask for; PARAMS is what the loop can
  // actually drive. A parameter added to one and not the other fails silently at the worst moment.
  const enumMatch = /enum: \[([^\]]*)\] \}, target:/.exec(panel);
  assert.ok(enumMatch, "found the parameter enum");
  const declared = enumMatch[1].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean);
  assert.deepEqual(declared.sort(), Object.keys(PARAMS).sort());
});

test("every parameter names a Lumetri property and a statistic that exists", () => {
  const { STATISTICS } = require("../src/grade.cjs");
  for (const [name, spec] of Object.entries(PARAMS)) {
    assert.ok(spec.lumetri, name + " needs the Lumetri displayName to write through");
    assert.ok(STATISTICS[spec.steer], name + " steers by an unknown statistic: " + spec.steer);
  }
});

test("unknown parameters and statistics are refused", async () => {
  const host = premiereStandIn("exposure");
  await assert.rejects(() => steer({ set: host.set, measure: host.measure, param: "curves", target: 1 }), /unknown parameter/);
  await assert.rejects(() => steer({ set: host.set, measure: host.measure, param: "exposure", statistic: "mood", target: 1 }), /unknown statistic/);
  await assert.rejects(() => steer({ set: host.set, measure: host.measure, param: "exposure", target: NaN }), /target must be a number/);
});
