"use strict";
// The rules are the colourist canon (black point, white point, parade neutral via the wheels, contrast
// only when flat or harsh, skin on the vectorscope line), not invented bands. Checked against real
// frame readings from the 2026-09-15 live runs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { goalsFor, padsFor, temperatureFor, verdict, WHITE_POINT, SKIN_LUMA, TEMPERATURE_CAP } = require("../src/grade_rules.cjs");

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

test("a low white point is Whites, never Exposure and never a subject brightness", () => {
  // Clip 1 of the live run: whites at 73, a dark bottle as the subject. The canon sets the white point
  // with the white-point knob; the 18:03 run pushed Exposure two stops to force it and lifted the
  // blacks with it.
  const f = frame(5, 30, 73, [5, 5, 5], [73, 73, 73]);
  const g = goalsFor(withSubject(f, frame(7, 21, 51, [7, 7, 6], [57, 50, 51])), "subject");
  assert.deepEqual([...g].map((x) => x.param), ["shadows", "whites", "highlights"], "a dark subject is lifted with Shadows (2026-09-16), then Whites, then Highlights finishes what the +50 cap leaves");
  assert.ok([...g].every((x) => x.param !== "exposure"), "never Exposure for a subject: it lifts the blacks with it");
  assert.equal(g[1].cap, undefined, "no fixed cap: the slider runs to 100, the model's ceiling check and the clip guard decide (22:50)");
  assert.equal(g[2].cap, undefined);
  assert.equal(g[2].onlyIf(frame(5, 40, 90, [5, 5, 5], [90, 90, 90])), false, "Highlights is skipped once the white point is in the band");
  assert.equal(g[2].onlyIf(frame(5, 40, 80, [5, 5, 5], [80, 80, 80])), true);
});

test("a whole-shot plan skips a conditional goal the earlier knobs made unnecessary", async () => {
  const { planShot } = require("../src/grade.cjs");
  const sets = [];
  const m = frame(5, 40, 90, [5, 5, 5], [90, 90, 90]);
  const r = await planShot({ set: (v, p) => { sets.push(p); return v; }, measure: async () => m, measured: m, goals: [{ param: "highlights", target: 92, onlyIf: () => false }] });
  assert.equal(r.plan[0].skipped, "not needed after the knobs before it");
  assert.deepEqual(sets, [], "nothing written for a skipped goal");
});

test("the sliders compose: whites, contrast, then blacks last, solved on the predicted state", () => {
  const g = goalsFor(frame(14, 40, 65, [14, 14, 14], [65, 65, 65]), "frame"); // lifted, low, flat (spread 51)
  assert.deepEqual([...g].map((x) => x.param), ["whites", "highlights", "contrast"], "the black point is the curve's, written before these are solved");
});

test("white balance is Temperature only for a cast the whole parade shares, capped at half the slider", () => {
  const warmAll = frame(5, 40, 90, [12, 8, 4], [95, 90, 85]); // blacks warm -8, whites warm -10
  const t = temperatureFor(warmAll);
  assert.ok(t && t.value < 0, "warm both ends: cooler, got " + JSON.stringify(t && t.value));
  assert.ok(Math.abs(t.value) <= 100);
  assert.ok(Math.abs(t.predicted.blue.p99 - t.predicted.red.p99) < 10, "the prediction moves the whites toward neutral");
  const split = frame(5, 40, 90, [12, 8, 4], [85, 90, 95]); // warm bottom under blue tops: two lights
  assert.equal(temperatureFor(split), null, "not a white balance: the pads' job");
  const bottomOnly = frame(5, 40, 90, [12, 8, 4], [90, 90, 90]);
  assert.equal(temperatureFor(bottomOnly), null, "temperature acts on the whites; a shadow cast alone is the Shadows wheel");
});

test("a lifted black point is the curve's job: the Master bottom point, solved exactly, no slider guesswork", () => {
  const { levelsFor, LEVELS_CAP } = require("../src/grade_rules.cjs");
  const f = frame(10, 40, 90, [10, 10, 10], [90, 90, 90]);
  assert.equal([...goalsFor(f, "frame")].some((x) => x.param === "blacks" || x.param === "shadows"), false, "no slider is asked to find a black point it may not reach (12 -> 1 on one clip, 12 -> 10 on the next)");
  const lev = levelsFor(f);
  assert.equal(lev.anchor, 0.4, "pinned at the frame's median");
  assert.ok(lev && Math.abs(lev.blackIn - (40 * (10 - 4) / (40 - 4)) / 100) < 0.001, "x = A (p1 - 4) / (A - 4) below the anchor: " + lev.blackIn.toFixed(3));
  assert.ok(Math.abs(lev.predicted.luma.p1 - 4) < 0.01, "and the prediction lands on 4");
  assert.equal(lev.predicted.luma.p50, 40, "the median does not move: the curve is a toe pull, not a stretch");
  assert.equal(lev.predicted.luma.p99, 90);
  assert.deepEqual(lev.curves.Master, [[lev.blackIn, 0], [0.4, 0.4], [0.8, 0.8], [1, 1]], "four points: bottom, the median pin, the 0.8 pin, the top corner");
  const colouredShadow = frame(20, 45, 90, [30, 12, 4], [90, 90, 90]); // B-R -26 at the bottom: a red-orange surface, not a black
  assert.equal(levelsFor(colouredShadow), null, "a coloured dark surface is not put at 4: the curve would only crush its other two channels");
  const far = levelsFor(frame(40, 60, 90, [40, 40, 40], [90, 90, 90]));
  assert.equal(far.blackIn, LEVELS_CAP, "a black point of 40 is a picture with no black: the automatic pass stops at the cap");
  assert.equal(levelsFor(frame(5, 40, 90, [5, 5, 5], [90, 90, 90])), null, "already at the black point: no curve");
  const crushed = goalsFor(frame(0, 40, 90, [0, 0, 0], [90, 90, 90], { crushed: 4 }), "frame").find((x) => x.param === "blacks");
  assert.ok(crushed && crushed.target > 0, "crushed blacks are still lifted by Blacks");
});

test("the verdict checks what the footer promises: both cast axes and the spread, with the goals' thresholds", () => {
  const { ACCEPT } = require("../src/grade_rules.cjs");
  const green = verdict(frame(4, 40, 90, [4, 8, 4], [90, 90, 90]), "frame"); // blacks green by 4, B-R neutral
  assert.ok(green.notes.some((n) => /blacks green/.test(n)), "the green-magenta axis is judged too: " + green.notes);
  const flat = verdict(frame(4, 30, 50, [4, 4, 4], [50, 50, 50]), "frame");
  assert.ok(flat.notes.some((n) => /spread .* flat/.test(n)), flat.notes.join(" | "));
  assert.equal(verdict(frame(ACCEPT.blackMax, 40, ACCEPT.whiteMin, [6, 6, 6], [85, 85, 85]), "frame").balanced, true, "the accepted band is the printed one");
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
  assert.equal([...goalsFor(f, "frame")].some((x) => x.param === "temperature"), false);
  assert.equal(temperatureFor(f), null);
  const pads = padsFor(f).wheels;
  const sh = pads.shadows;
  assert.ok(sh && sh.sat > 0.1, "a pad move, sat " + (sh && sh.sat));
  assert.ok(sh.hue > 0 && sh.hue < 60, "toward orange against blue blacks, got " + sh.hue.toFixed(1));
  assert.equal(sh.luma, 0.5, "the wheel's luma slider stays centred: the sliders do the tonal work");
  assert.equal(pads.highlights, undefined, "the whites were neutral: the Highlights pad is left alone");
});

test("a whites cast is cancelled with the Highlights wheel's pad", () => {
  const f = frame(4, 40, 90, [4, 4, 4], [86, 88, 93]); // whites blue by 7
  const hi = padsFor(f).wheels.highlights;
  assert.ok(hi && hi.sat > 0.02 && hi.hue > 0 && hi.hue < 60, "warm pad on the Highlights wheel: " + JSON.stringify(hi));
});

test("a second pass adds to the pads' current position instead of restarting from neutral", () => {
  const f = frame(4, 40, 90, [4, 4, 4], [86, 88, 93]);
  const fresh = padsFor(f).wheels.highlights;
  const again = padsFor(f, { highlights: { hue: fresh.hue, sat: fresh.sat, luma: 0.5 } }).wheels.highlights;
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
  const seqTool = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.ok(seqTool.indexOf("ensureWorkingCopy") > 0 && seqTool.indexOf("ensureWorkingCopy") < seqTool.indexOf("readTransforms"), "the working copy is made before the clips are read from it");
  const iPads = seqTool.indexOf("gradePadsFor(afterTemp, currentWheels)"), iLev = seqTool.indexOf("gradeLevelsFor(afterBalance, currentCurves, m)"), iGoals = seqTool.indexOf("gradeGoalsFor(afterLevels, seen)");
  assert.ok(iPads > 0 && iPads < iLev && iLev < iGoals, "balance on the frame as read, the curve's black point on the balanced state, the sliders on the state after both");
  assert.match(seqTool, /if \(lev && h\.crushed > allow\.crushed\) \{ await cw\.write\(currentCurves \|\| \{\}\);/, "a crush rolls back the curve first, not the whole balance");
  assert.match(seqTool, /undone\.push\("half the white balance"\)/, "a clip rolls the white balance back to half its move, both axes, like the sliders");
  assert.match(seqTool, /if \(tint2 === null && !tintWrote && Math\.abs\(c1\[1\]\) > 1\.5\) \{/, "the correction can introduce Tint for a green residual that only appeared after the temperature move");
  assert.match(seqTool, /const tT = tempWrote \? scale1\(c0\[0\], c1\[0\]\) : null;/, "temperature is rescaled from blue-red alone, and only if the last write moved it");
  assert.ok(seqTool.indexOf("baseline = gradeDamage(m)") > 0 && /planGradeShot\(\{[^\n]*baseline \}\)/.test(seqTool), "the damage guard is the source's own, through every write");
  assert.match(seqTool, /measureSourceAt\(at, track, region, snap\)/, "one snapshot per run, not one per clip");
  assert.match(seqTool, /confirm && v\.balanced \? 1 : 0/, "an unconfirmed run never counts a clip as balanced");
  assert.match(seqTool, /if \(temp && !next\.highlights\) \{/, "the correction scales the white balance from the real reading, unless the Highlights pad was already corrected");
  // Shot match (2026-09-16): a later cut of a graded file takes the first cut's WHOLE grade; if it would
  // clip or crush under it, the shot's tone is backed off to half on every cut so they still match.
  assert.match(seqTool, /if \(ref\) \{[\s\S]*?await writeGradeState\(at, track, region, ref\);[\s\S]*?for \(const t of ref\.cuts\) await writeGradeState\(t, track, region, ref\);/, "a later cut takes the reference state; a backoff is written to every earlier cut too");
  assert.match(seqTool, /matched\[c\.name\] = \{ label, cuts: \[at\], temp: tempNow, tint: tintNow, wheels, curves, sat: satNow, sliders, hsl \};/, "the first cut records its whole state, the skin curve included");
  assert.match(seqTool, /const sk = gradeSkinFor\(skinNow, \{ saturation: 100 \}, key\.attenuation\);/, "skin is solved on the hand/face box of the confirmed frame, at the strength the key's selectivity allows");
  // 12:54: the key's Midtones wheel carries the skin rotation; the mask view is checked against Vision's
  // boxes first, and a key that took the room is tightened once, else skin is skipped on that clip.
  assert.match(panel, /const SKIN_WRITE = true;/, "skin writes are on");
  // Skin is corrected with a Hue vs Hue bump, not an HSL key: the colourists' hierarchy puts the curve
  // above the qualifier, and masks - the other candidate - have no scripting surface at all (15:30).
  assert.match(seqTool, /const hc = hueCurveWriter\(at, track, "Hue vs Hue"\);/, "the skin tool is the hue curve");
  // A hand can be hidden on the graded frame and open a second later (C228, 16:06), so a clip with no skin
  // on that frame is searched elsewhere - decoded from its own file, all candidates read in one Vision call.
  assert.match(seqTool, /const found = await timed\(\(\) => findSkinTime\(c\.start, c\.end, track, snap\), "read"\);/, "a clip with no skin on the graded frame is searched");
  assert.match(panel, /function visionAllMany\(files\)/, "several frames go to Vision in one call");
  assert.match(seqTool, /await hc\.write\(hueBump\(centre, shift\)\);/, "a bump on the skin's own hue, pinned back to zero either side");
  assert.match(seqTool, /further off than[\s\S]*?await hc\.write\(\[\]\)|await hc\.write\(\[\]\); best = 0;/, "a move that made it worse is removed");
  assert.match(panel, /if \(s\.hsl && s\.hsl\.hueCurve\) await hueCurveWriter\(at, track, "Hue vs Hue"\)/, "a matched cut takes the reference's skin curve");

  assert.doesNotMatch(seqTool, /hw\.tint\(/, "HSL Tint is never written for skin (a magenta wash, 12:21)");
  assert.match(seqTool, /readable\[Math\.floor\(\(readable\.length - 1\) \/ 2\)\]/, "a source cut more than once is graded from its median-whites cut");
  // The 18:18 live run died on "Assignment to constant variable": a per-clip const shadowed the tally.
  const loop = seqTool.slice(seqTool.indexOf("for (const c of clips)"));
  assert.doesNotMatch(loop, /\b(const|let) (balanced|touched|renders|lines|stopped)\b/, "no per-clip declaration shadows a tally the loop adds to");
  for (const tool of ["async function gradeTool", "async function gradeShotTool"]) {
    const body = panel.slice(panel.indexOf(tool), panel.indexOf("\n}\n", panel.indexOf(tool)));
    assert.ok(body.indexOf("ensureWorkingCopy") > 0, tool + " writes on the working copy");
  }
  assert.match(panel, /measureFrameAt\(at, \{ region, reuse, keepPlayhead: true \}\)/, "the confirm measures the read's pixels, and leaves the playhead on the clip");
  assert.match(panel, /finally \{ if \(playheadBefore !== null\) \{ try \{ await host\("playhead", playheadBefore\); \}/, "the playhead goes back to the editor's position once, when the run ends");
  assert.match(panel, /NEEDS: /, "what the panel cannot drive is said out loud");
  assert.match(panel, /wheelWriter\(at, track\)/, "the wheels are written from the sequence tool");
});

test("a parade end more than 20 off neutral is a coloured surface: no pad, no curve, said out loud", () => {
  const { levelsFor } = require("../src/grade_rules.cjs");
  const f = frame(22, 45, 90, [32, 12, 4], [90, 90, 90]); // B-R -28 at the bottom: a red-orange object in shadow
  const pads = padsFor(f);
  assert.equal(pads.wheels.shadows, undefined, "no Shadows pad on an object's colour");
  assert.ok(pads.needs.some((n) => /the scene's own colour/.test(n)), pads.needs.join(" | "));
  assert.equal(levelsFor(f, null, f), null, "and no black-point curve: it would only crush the other two channels");
});

test("the curve's bottom point never passes the lowest channel bottom: a channel a pad has taken to 3 is not crushed by the curve", () => {
  const { levelsFor } = require("../src/grade_rules.cjs");
  const f = frame(16, 45, 85, [3, 12, 14], [85, 85, 85]); // red at the bottom already at 3 (after a cyan pad); luma black point 16
  assert.equal(levelsFor(f), null, "x would have to be under 0.02: no curve, the black point is reported instead");
  const g = frame(16, 45, 85, [8, 12, 14], [85, 85, 85]);
  const lev = levelsFor(g);
  assert.ok(lev && Math.abs(lev.blackIn - 0.065) < 0.001, "held at (8 - 1.5) / 100: " + (lev && lev.blackIn));
  assert.match(lev.why, /held at the lowest channel bottom/);
});

test("the white balance has two axes: Temperature on blue-red, Tint on green-magenta, solved on the state temperature predicts", () => {
  const greenTop = frame(5, 40, 90, [5, 5, 5], [86, 92, 86]); // whites green by 6, B-R neutral
  const t = temperatureFor(greenTop);
  assert.ok(t && t.value === 0 && t.tint !== null && t.tint > 0, "green whites: positive Tint (toward magenta), no temperature: " + JSON.stringify(t && { value: t.value, tint: t.tint }));
  assert.ok(Math.abs(t.tint) <= 100);
  assert.ok(Math.abs(t.predicted.green.p99 - (t.predicted.red.p99 + t.predicted.blue.p99) / 2) < 3, "the prediction lines the green up: " + t.predicted.green.p99);
  const both = frame(5, 40, 90, [12, 8, 4], [96, 92, 84]); // warm at both ends and green on top
  const b = temperatureFor(both);
  assert.ok(b && b.value < 0 && b.tint !== null && b.tint > 0, "both axes move: " + JSON.stringify(b && { value: b.value, tint: b.tint }));
  assert.match(b.why, /temperature .*; whites green by .*: tint/);
});

const { satCurveFor } = require("../src/grade_rules.cjs");

test("the saturation roll-off skips a coloured end and a curve the clip already carries", () => {
  const neutral = frame(5, 45, 90, [5, 5, 5], [90, 90, 90]);
  const both = satCurveFor(neutral);
  assert.ok(both && both.points.length === 9 && /shadows and whites/.test(both.why));
  // C187 on the live runs: every dark band warm by 25-32 - the objects' colour, not to be drained.
  const warmBottom = frame(20, 45, 90, [30, 12, 5], [90, 90, 90]);
  const one = satCurveFor(warmBottom);
  assert.ok(one && /whites only/.test(one.why), one && one.why);
  assert.ok(one.points.every(([x, y]) => x > 0.2 || y === 0), "no shadow end: " + JSON.stringify(one.points));
  assert.equal(satCurveFor(neutral, [[0, -0.2], [1, 0]]), null, "left as found");
});

test("mixed light beyond the pads' reach: temperature splits the difference, the pads take each end", () => {
  // C227 @5.63, 2026-09-16: whites warm by 25, blacks blue by 5.5 - a specular-only balance went to -83,
  // and (13:15) the split went to -47 and the oak turned pale: a top beyond COLOURED over blacks leaning
  // the other way is an object's colour, no white balance. Mixed light is a top between the pads' reach
  // and COLOURED.
  const oak = temperatureFor(frame(12, 40, 68, [4, 7, 9.5], [80, 67.5, 55])); // blacks B-R +5.5, whites B-R -25, green neutral
  assert.ok(oak && oak.sceneColour && oak.value === 0 && /object's colour/.test(oak.why), JSON.stringify(oak && { v: oak.value, why: oak.why }));
  const f = frame(12, 40, 68, [4, 7, 9.5], [80, 72, 63]); // blacks B-R +5.5, whites B-R -17
  const t = temperatureFor(f);
  assert.ok(t && /mixed light/.test(t.why), t && t.why);
  assert.ok(t.value < 0 && t.value > -45, "cooler, but nowhere near the specular-only solution: " + t.value);
  const after = t.predicted, w = after.blue.p99 - after.red.p99, b = after.blue.p1 - after.red.p1;
  assert.ok(Math.abs(w + b) < 6, "the two ends end on opposite sides of neutral, about equally: whites " + w.toFixed(1) + ", blacks " + b.toFixed(1));
});

test("a frame warm at both ends by more than 20 is the scene's colour: no white balance, said out loud", () => {
  // C227 @4.44, 2026-09-16: an oak table and hands, whites -25 / blacks -27; -83 drained it.
  const f = frame(20, 45, 68, [31, 15, 4], [80, 66, 55]);
  const t = temperatureFor(f);
  assert.ok(t && t.sceneColour && t.value === 0 && t.tint === null, JSON.stringify(t && { v: t.value, s: t.sceneColour }));
  assert.match(t.why, /scene's own colour/);
});

test("skin inside the HSL key: the Midtones pad rotates the keyed hue onto the line, Saturation only when out of the band", () => {
  const { skinFor, SKIN_HUE } = require("../src/grade_rules.cjs");
  // C227's hands, 2026-09-16: Cb -4.9 / Cr 5.6 = 131 deg, saturation 19 - just off both.
  const hands = { luma: { min: 9.4, p1: 13.3, p50: 44.7, p99: 72.9, max: 75.3 }, red: { mean: 53.7, p1: 26.3, p99: 74.5 }, green: { mean: 43.1, p1: 10.6, p99: 72.2 }, blue: { mean: 35.8, p1: 1.6, p99: 78.4 }, saturation: { p50: 19, p99: 32 }, cast: { cb: -4.9, cr: 5.6 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0 };
  const sk = skinFor(hands);
  // The 12:54 calibration: the pad at 270 deg / 0.25 took these hands from 131 to 123 deg on the thin
  // eyedropper key; the pass's keys turn 2.5x as far, so about 0.1.
  assert.ok(sk && sk.pad && sk.pad.hue > 250 && sk.pad.hue < 300 && sk.pad.sat > 0.06 && sk.pad.sat < 0.16, "a small magenta-side pad: " + JSON.stringify(sk));
  const hue = Math.atan2(sk.predicted.cast.cr, sk.predicted.cast.cb) * 180 / Math.PI;
  assert.ok(hue >= SKIN_HUE[0] && hue <= SKIN_HUE[1], "predicted hue on the line: " + hue.toFixed(1));
  assert.equal(sk.saturation, null, "saturation 19 is a point under the band: not worth the knob");
  // C222, 14:45: Saturation 198 on a hand at 14 made it bright pink. Under the band is reported, not boosted.
  const pale = skinFor({ ...hands, saturation: { p50: 14, p99: 20 } });
  assert.equal(pale.saturation, null, "a pale hand is never boosted: " + JSON.stringify(pale));
  assert.ok(pale.why.some((w) => /under the band: left alone/.test(w)) && pale.pad, "it is said, and the hue is still put on the line");
  const loud = skinFor({ ...hands, saturation: { p50: 62, p99: 80 } });
  assert.ok(loud.saturation !== null && loud.saturation < 100 && loud.saturation >= 50, "over the band comes down: " + JSON.stringify(loud));
  const inBand = skinFor({ ...hands, saturation: { p50: 30, p99: 40 } });
  assert.ok(inBand.saturation === null && Math.abs(Math.hypot(inBand.predicted.cast.cr, inBand.predicted.cast.cb) - Math.hypot(5.6, 4.9)) < 0.01, "the pad alone is a rotation: the radius is kept");
  const far = { ...hands, cast: { cb: -28, cr: 4 } }; // 172 deg at four times the radius: beyond the pad's cap
  const fk = skinFor(far);
  assert.ok(fk.pad.sat === 0.3 && fk.why.some((w) => /as far as the pad goes/.test(w)), JSON.stringify(fk));
  const onLine = { ...hands, cast: { cb: -5.5, cr: 8.4 }, saturation: { p50: 30, p99: 40 } }; // 123 deg, 30
  assert.equal(skinFor(onLine), null, "nothing to do");
});

test("a dark subject is lifted with Shadows toward 40, capped by the frame's black point; the verdict names it", () => {
  const f = frame(5, 45, 90, [5, 5, 5], [90, 90, 90]);
  const hand = frame(12, 22, 48, [12, 12, 12], [48, 48, 48]); // the hand and cloth of C222 at 00:00:01:11
  const g = goalsFor(withSubject(f, hand), "subject");
  const sh = [...g].find((x) => x.param === "shadows");
  assert.ok(sh && sh.statistic === "brightness" && sh.target === 40 && typeof sh.ceiling === "function", JSON.stringify([...g]));
  assert.equal(sh.cap, 30, "never past +30: +51 flattened C220");
  assert.equal(sh.ceiling({ frame: { luma: { p1: 7, p99: 88 } } }), true);
  assert.equal(sh.ceiling({ frame: { luma: { p1: 9, p99: 88 } } }), false, "the black point");
  assert.equal(sh.ceiling({ frame: { luma: { p1: 7, p99: 58 } } }), false, "the spread");
  assert.ok(verdict(withSubject(f, hand), "subject").notes.some((n) => /subject luma 22 dark/.test(n)));
  assert.equal([...goalsFor(withSubject(f, frame(20, 45, 70, [20, 20, 20], [70, 70, 70])), "subject")].some((x) => x.param === "shadows"), false, "a subject at 45 is not dark");
});
