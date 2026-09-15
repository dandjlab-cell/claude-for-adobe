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
const { steer, planShot, PARAMS, MAX_RENDERS } = require("../src/grade.cjs");

const SWEEPS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "lumetri_sweeps.json"), "utf8"));

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
        red: { mean: at("red"), p1: at("redP1"), p99: at("redP99") },
        green: { mean: at("green"), p1: at("greenP1"), p99: at("greenP99") },
        blue: { mean: at("blue"), p1: at("blueP1"), p99: at("blueP99") },
        saturation: { p50: at("sat") }, cast: { cb: at("cb"), cr: at("cr") },
        // Real clipping from the sweep: a channel piles into 255 as the picture is pushed up, and the
        // floor fills as it is pushed down. Modelled off the measured ends so the guard is exercised.
        clipped: { red: at("max") >= 99.5 ? 2 : 0, green: 0, blue: 0 },
        crushed: at("min") <= 0.5 ? 3 : 0,
      };
    },
    get counts() { return { writes, measures, current }; },
  };
}

test("a calibrated knob is set in ONE go: read, set from the model, confirm - two renders", async () => {
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "exposure", target: 45 });
  assert.equal(r.how, "model", "the value came from the calibration, not a search");
  assert.equal(r.renders, 2, "one render to read, one to confirm; took " + r.renders);
  assert.equal(r.hit, true, "achieved " + r.achieved + " (residual " + r.residual + ")");
  assert.equal(r.nudged, false);
  assert.ok(r.value > 0 && r.value < 1, "45 sits between the readings at 0 (36.9) and 1 (47.5), got " + r.value.toFixed(2));
});

test("white balance is read from the parade: temperature aligns the channels' whites", async () => {
  // At Temperature 0 the calibration clip's whites read B 86.3 / R 83.9: slightly blue. Neutral is a
  // small warm move, not the -72 the frame-average cast asked for on the same clip.
  const host = premiereStandIn("temperature");
  const r = await steer({ set: host.set, measure: host.measure, param: "temperature", target: 0 });
  assert.equal(r.statistic, "whitesRB");
  assert.equal(r.hit, true, "whites B-R achieved " + r.achieved);
  assert.ok(r.value > 0 && r.value < 15, "a small warm correction, got " + r.value.toFixed(1));
  assert.ok(r.renders <= 2);
});

test("contrast is set by the spread in one go", async () => {
  const host = premiereStandIn("contrast");
  const r = await steer({ set: host.set, measure: host.measure, param: "contrast", target: 80 });
  assert.equal(r.hit, true, "achieved " + r.achieved);
  assert.equal(r.renders, 2);
  assert.ok(r.value > 20 && r.value < 60, "spread 80 sits between contrast 20 and 50, got " + r.value.toFixed(1));
});

test("a knob never leaves its slider range, and a target past it is reported as a residual", async () => {
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "exposure", target: 95 }); // the median tops out at 58.8
  assert.equal(r.hit, false);
  assert.ok(r.value <= 5 && r.value >= -5, "stayed inside -5..5, got " + r.value);
  assert.ok(r.renders <= MAX_RENDERS);
  assert.ok(Math.abs(r.residual) > 30, "the residual is stated: " + r.residual);
});

test("an unswept knob gets one probe to measure its slope, then one write and the confirm", async () => {
  // No calibration for 'vibrance' in the fixture; stand in with the exposure response so there is a slope to find.
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "vibrance", statistic: "brightness", target: 45, tolerance: 2 });
  assert.match(r.how, /probe/);
  assert.ok(r.renders <= MAX_RENDERS, "took " + r.renders);
  assert.equal(r.tested, false);
});

test("a target only reachable by clipping is refused, judged on the whole frame", async () => {
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "exposure", target: 58.8 });
  assert.match(r.problem, /backed off/);
  assert.ok(r.clipped <= 0.5, "left clipping " + r.clipped + "%");
  assert.equal(host.counts.current, r.value, "the clip is left holding the safe value");
});

test("a whole shot in one go: every knob chosen from one reading, one confirm render for all of them", async () => {
  // A stand-in that responds to several knobs at once is beyond the one-knob fixtures; here the plan is
  // exercised on the exposure host with a single goal, and its shape and render count are the contract.
  const host = premiereStandIn("exposure");
  const r = await planShot({ set: host.set, measure: host.measure, goals: [{ param: "exposure", target: 45 }] });
  assert.equal(r.renders, 2);
  assert.equal(r.plan.length, 1);
  assert.equal(r.plan[0].hit, true, "predicted " + r.plan[0].predicted + " achieved " + r.plan[0].achieved);
  assert.ok(Math.abs(r.plan[0].predicted - r.plan[0].achieved) < 1.5, "the internal scopes agree with the real ones");
});

test("a plan skips a knob it has no calibration for, and says so, rather than guessing", async () => {
  const host = premiereStandIn("exposure");
  const r = await planShot({ set: host.set, measure: host.measure, goals: [{ param: "vibrance", target: 0 }, { param: "exposure", target: 45 }] });
  assert.match(r.plan[0].skipped, /no calibration/);
  assert.equal(r.plan[1].hit, true);
});

test("every reading taken is returned, so the panel can show its work", async () => {
  const host = premiereStandIn("exposure");
  const r = await steer({ set: host.set, measure: host.measure, param: "exposure", target: 45 });
  assert.equal(r.readings.length, r.renders);
  for (const reading of r.readings) assert.ok(isFinite(reading.value) && isFinite(reading.stat));
});

test("the eight swept parameters are marked tested and the rest are not", () => {
  assert.deepEqual(Object.keys(PARAMS).filter((k) => PARAMS[k].tested).sort(), ["blacks", "contrast", "exposure", "highlights", "shadows", "temperature", "tint", "whites"]);
  const { SWEEPS } = require("../src/grade_model.cjs");
  for (const k of Object.keys(PARAMS)) assert.equal(!!SWEEPS[k], !!PARAMS[k].tested, k + ": tested means swept, and swept means tested");
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

// --- the three bugs from the first live grade_sequence run (2026-09-15) -----------------------------
const { predict, solveKnob } = require("../src/grade_model.cjs");

// A subject reading with the whole frame attached, the way the panel measures a region.
function withFrame(m) {
  const frame = JSON.parse(JSON.stringify(m));
  frame.red.p99 = 84; frame.green.p99 = 85; frame.blue.p99 = 86; // whites blue by 2 on the frame
  return { ...m, frame };
}

test("the model predicts the FRAME as well as the subject, so white balance can be solved", () => {
  const m = withFrame(premiereStandIn("temperature").measure());
  const whitesRB = (x) => { const f = x.frame || x; return f.blue.p99 - f.red.p99; };
  const flat = whitesRB(predict(m, "temperature", 0, 50)) === whitesRB(m);
  assert.equal(flat, false, "the frame's whites must move with temperature; a flat curve sent every clip to +-100");
  const s = solveKnob(m, "temperature", 0, whitesRB, 0);
  assert.equal(s.bracketed, true);
  assert.ok(s.value > 0 && s.value < 15, "whites blue by 2 is a small warm move, got " + s.value.toFixed(1));
});

test("a target beyond the knob's range is flagged partial, not applied at the range end as if it were a hit", () => {
  const m = premiereStandIn("exposure").measure(); // brightness 36.9 at 0
  const s = solveKnob(m, "exposure", 0, (x) => x.luma.p50, 95);
  assert.equal(s.partial, true);
  assert.equal(s.helps, true, "the range end still moves the right way");
  assert.ok(s.predicted < 70, "and the model says honestly where it lands: " + s.predicted.toFixed(1));
});

test("a whole-shot plan backs the brightness knobs off when the confirm shows the frame clipped", async () => {
  // Stand-in whose confirm reports the frame clipped once the knob has moved: the plan must not leave
  // that on the clip.
  const base = premiereStandIn("exposure");
  let writes = [];
  const host = {
    set: (v) => { writes.push(v); return base.set(v); },
    measure: () => Object.assign(base.measure(), { clipped: { red: base.counts.current > 0 ? 40 : 0, green: 0, blue: 0 } }),
  };
  const r = await planShot({ set: host.set, measure: host.measure, goals: [{ param: "exposure", target: 45 }] });
  assert.equal(r.backedOff, true);
  const chosen = writes[0];
  assert.ok(Math.abs(r.plan[0].value - chosen / 2) < 0.01, "exposure went back to HALF its move, not to zero: " + r.plan[0].value + " of " + chosen);
  assert.match(r.plan[0].note, /backed off to half/);
  assert.equal(r.renders, 3, "safety spent the third render");
  assert.ok(Math.abs(writes[writes.length - 1] - chosen / 2) < 0.01, "the last thing written is the halved value");
});

test("damage the shot arrived with is allowed to stay: a source clipping 1.7% is not backed off for clipping 1.7%", async () => {
  // C227 of the 18:03 run: a heavily clipped window in the source, and every slider went to zero for it.
  const base = premiereStandIn("exposure");
  const host = { set: base.set, measure: () => Object.assign(base.measure(), { clipped: { red: 1.7, green: 0, blue: 0 } }) };
  const r = await planShot({ set: host.set, measure: host.measure, goals: [{ param: "exposure", target: 45 }] });
  assert.equal(r.backedOff, false);
  assert.ok(r.plan[0].value > 0, "the knob stayed where the model put it");
  assert.equal(r.unsafe, false);
});

test("only the knobs that push the offending end are backed off: a crushed bottom leaves Whites alone", async () => {
  const base = premiereStandIn("exposure");
  let n = 0;
  const host = { set: base.set, measure: () => Object.assign(base.measure(), { crushed: ++n > 1 ? 5 : 0 }) };
  const r = await planShot({ set: host.set, measure: host.measure, goals: [{ param: "whites", target: 92 }, { param: "blacks", value: -30, target: 4 }] });
  assert.equal(r.backedOff, true);
  assert.equal(r.plan.find((p) => p.param === "blacks").value, -15, "Blacks crushed it: back to half its move");
  assert.notEqual(r.plan.find((p) => p.param === "whites").value, 0, "Whites did not: left where it was");
});

test("the tonal ends are the frame's even when a subject was measured", () => {
  const { STATISTICS } = require("../src/grade.cjs");
  const subject = { luma: { p1: 25, p50: 40, p99: 63 }, frame: { luma: { p1: 10, p50: 35, p99: 88 } } };
  assert.equal(STATISTICS.blackPoint(subject), 10);
  assert.equal(STATISTICS.whitePoint(subject), 88);
  assert.equal(STATISTICS.spread(subject), 78);
  assert.equal(STATISTICS.brightness(subject), 40, "brightness is the subject's: that is what a face is exposed by");
});

test("a channel at 0 is damage as a floor, not as a saturated object's missing channel", () => {
  const { damage } = require("../src/grade.cjs");
  const base = { luma: { p1: 20, p50: 45, p99: 88 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0 };
  // C228: the red of a blue cloth at 0 on 2.8% of the frame - the object's colour, no damage.
  assert.equal(damage({ ...base, floor: { red: 2.77, green: 0, blue: 0 } }).crushed, 0);
  // C227 @5.63: blue at 0 across the parade bottom - a floor.
  assert.equal(damage({ ...base, floor: { red: 0, green: 0, blue: 56.74 } }).crushed, 56.74);
  // Luma crushed is damage at any share.
  assert.equal(damage({ ...base, crushed: 1.3, floor: { red: 0, green: 0, blue: 0 } }).crushed, 1.3);
});
