"use strict";
// The rules are the colorist canon (black point, white point, parade neutral via the wheels, contrast
// only when flat or harsh, skin on the vectorscope line), not invented bands. Checked against real
// frame readings from the 2026-09-15 live runs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { goalsFor, padsFor, bottomsFor, temperatureFor, verdict, WHITE_POINT, SKIN_LUMA, TEMPERATURE_CAP } = require("../src/grade_rules.cjs");

const frame = (p1, p50, p99, rgbP1, rgbP99, extra = {}) => ({
  luma: { min: p1 - 3, p1, p50, p99, max: p99 + 3 },
  red: { mean: 40, p1: rgbP1[0], p99: rgbP99[0] }, green: { mean: 40, p1: rgbP1[1], p99: rgbP99[1] }, blue: { mean: 40, p1: rgbP1[2], p99: rgbP99[2] },
  saturation: { p50: 25 }, cast: { cb: -6, cr: 7 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0, ...extra,
});
const withSubject = (f, subject) => ({ ...subject, frame: f });
// The darkest 3% as channel LEVELS on one set of pixels - the paired statistic (src/scopes.cjs). The
// helper above carries only the three independent percentiles, which is precisely the statistic that must
// never drive a channel toe: 0.1.80 fed it to neutralBottoms and the grade got worse. bottomsFor reads
// `levels` and nothing else, so a frame without this block gets no black balance at all - by design.
const withBlacks = (f, red, green, blue) => ({ ...f, bands: { ...(f.bands || {}),
  blacks: { share: 3, readable: 100, rb: Math.round((blue - red) * 10) / 10, g: Math.round((green - (red + blue) / 2) * 10) / 10, levels: { red, green, blue } } } });

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
  const coloredShadow = frame(20, 45, 90, [30, 12, 4], [90, 90, 90]); // B-R -26 at the bottom: a red-orange surface, not a black
  // 19:40: a colored bottom is no longer refused outright (C187 stayed at 23.5 and read flat); it is pulled
  // as far as its lowest channel allows - here blue's bottom at 4 leaves no room at all, so still no curve.
  const lev1 = levelsFor(coloredShadow);
  assert.ok(!lev1 || lev1.blackIn <= 0.03, "a colored dark surface whose lowest channel is already near the floor gets at most a token curve: " + JSON.stringify(lev1 && lev1.blackIn));
  const room = frame(24, 45, 90, [32, 16, 8], [90, 90, 90]); // C187-like: warm bottom (B-R -24), but blue has room down to 4
  const lev2 = levelsFor(room);
  assert.ok(lev2 && lev2.blackIn > 0.02 && /colored bottom/.test(lev2.why), "a colored bottom with room is pulled as far as its lowest channel allows: " + JSON.stringify(lev2 && { b: lev2.blackIn, why: lev2.why }));
  assert.ok(lev2.blackIn <= (8 - 1.5) / 100 + 1e-9, "and never past the lowest channel");
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

// Was "cancelled with the Shadows wheel's pad" until 2026-09-17, when the wheel was measured doing the
// opposite on the owner's own proof frame (C229 @9.42s: warm by 13 in, blue by 5.1 out, red on the floor).
// A wheel cancels warm by ADDING BLUE. The instrument changed; the two things this test always guarded -
// never reach for temperature, never touch the neutral end - did not.
test("a shadow cast is cancelled with the channel toes, never with temperature or the Shadows wheel", () => {
  const f = withBlacks(frame(4, 40, 90, [14.5, 23.5, 31.8], [90, 90, 90]), 14.5, 23.5, 31.8); // blacks blue by 17, whites neutral
  assert.equal([...goalsFor(f, "frame")].some((x) => x.param === "temperature"), false);
  assert.equal(temperatureFor(f), null);
  assert.equal(padsFor(f).wheels.shadows, undefined, "the Shadows wheel is out of the blacks entirely");
  assert.equal(padsFor(f).wheels.highlights, undefined, "the whites were neutral: the Highlights pad is left alone");
  const bot = bottomsFor(f);
  assert.ok(bot, "the toes take it");
  assert.ok(bot.toes.blue.toe > bot.toes.green.toe && bot.toes.green.toe > 0, "blue is highest so it is pulled furthest DOWN: " + JSON.stringify(bot.toes));
  assert.equal(bot.toes.red.toe + bot.toes.red.lift, 0, "red is already the floor and every channel can reach it, so it is not moved at all");
  assert.deepEqual(bot.curves.Red, [[0, 0], [1, 1]]);
  assert.ok(bot.predicted.bands.blacks.levels.blue - bot.predicted.bands.blacks.levels.red < 0.2, "and the paired bottoms end level");
});

test("a channel toe is NEVER driven by the independent percentiles - the 0.1.80 defect, structurally", () => {
  // The same frame without the paired block: the channel p1s alone say "blue by 17" just as loudly, and
  // that is the reading that made the grade worse. No levels, no black balance.
  assert.equal(bottomsFor(frame(4, 40, 90, [14.5, 23.5, 31.8], [90, 90, 90])), null);
  // And a frame whose percentiles differ while the PAIRED bottoms are level is left alone, which is the
  // whole point: percentile spread is distribution, not cast.
  assert.equal(bottomsFor(withBlacks(frame(4, 40, 90, [2, 9, 16], [90, 90, 90]), 8, 8.4, 8.2)), null);
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
  const iPads = seqTool.indexOf("gradePadsFor(afterTemp, currentWheels)"), iBot = seqTool.indexOf("gradeBottomsFor(afterPads, currentCurves, curvePixels)"),
    iLev = seqTool.indexOf("gradeLevelsFor(afterBalance, bot ? bot.curves : currentCurves, m, curvePixels)"), iGoals = seqTool.indexOf("gradeGoalsFor(afterLevels, seen)");
  assert.ok(iPads > 0 && iPads < iBot && iBot < iLev && iLev < iGoals, "balance on the frame as read, then the black balance, then the curve's black point on a bottom that is already level, then the sliders on the state after all of it");
  assert.match(seqTool, /if \(lev\) await cw\.write\(lev\.curves\); else if \(bot\) await cw\.write\(bot\.curves\);/, "the channel toes reach Premiere even when there is no black point to set");
  assert.match(seqTool, /if \(lev && h\.crushed > allow\.crushed\) \{ await cw\.write\(currentCurves \|\| \{\}\);/, "a crush rolls back the curve first, not the whole balance");
  assert.match(seqTool, /undone\.push\("half the white balance"\)/, "a clip rolls the white balance back to half its move, both axes, like the sliders");
  assert.match(seqTool, /if \(tint2 === null && !tintWrote && Math\.abs\(c1\[1\]\) > 1\.5\) \{/, "the correction can introduce Tint for a green residual that only appeared after the temperature move");
  assert.match(seqTool, /const tT = tempWrote \? scale1\(c0\[0\], c1\[0\]\) : null;/, "temperature is rescaled from blue-red alone, and only if the last write moved it");
  assert.ok(seqTool.indexOf("baseline = gradeDamage(m)") > 0 && /planGradeShot\(\{[^\n]*\bbaseline\b[^\n]*\}\)/.test(seqTool), "the damage guard is the source's own, through every write");
  // The forward guard is only worth anything if a caller supplies the pixels; it shipped inert once.
  assert.match(seqTool, /planGradeShot\(\{[^\n]*pixels: guardPixelsFor\(\)/, "planShot is given this clip's own pixels, not only another frame's percentile table");
  // A pad has no pixel form and still drops the pixels. The Shadows-wheel LIFT gained one at 16:40 and is
  // now chosen on pixels, so only a lift that fell to the table (a pad in play) drops them.
  assert.match(seqTool, /if \(!pixels \|\| padMoves\.length \|\| \(lift && lift\.how !== "pixels"\)\) return null;/, "no pixels when a move with no measured pixel form was written: a guard on the wrong picture is worse than none");
  assert.match(seqTool, /gradeShadowsLiftFor\(beforeLift, currentWheels, undefined, padMoves\.length \? null : curvePixels\)/, "the lift is chosen on pixels unless a pad moved");
  assert.match(seqTool, /if \(lift && lift\.pixels\) curvePixels = lift\.pixels;/, "and the context carries the lift forward to the sliders");
  assert.match(seqTool, /measureSourceAt\(at, track, region, snap, visible\)/, "one snapshot per run, and every source read cropped to what the timeline shows");
  assert.match(seqTool, /"saturation", "vibrance"/, "existing saturation controls also invalidate raw source pixels");
  assert.match(seqTool, /value !== \(GRADE_PARAMS\[param\].neutral \|\| 0\)/, "Saturation's neutral is 100, not zero");
  assert.match(seqTool, /"Hue vs Hue", "Hue vs Sat", "Hue vs Luma", "Sat vs Sat"/, "existing hue curves invalidate source pixels too");
  assert.match(seqTool, /const lev = levelChoice && !levelChoice.held/, "a held curve produces a row, never an identity-curve write");
  // Motion scale and position decide which source pixels are on screen: a clip past 100% hides some.
  assert.match(seqTool, /const visible = visibleFor\(c\);/, "each clip's visible window is computed once");
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
  // Skin is corrected with a Hue vs Hue bump, not an HSL key: the colorists' hierarchy puts the curve
  // above the qualifier, and masks - the other candidate - have no scripting surface at all (15:30).
  assert.match(seqTool, /const hc = hueCurveWriter\(at, track, "Hue vs Hue"\);/, "the skin tool is the hue curve");
  // A hand can be hidden on the graded frame and open a second later (C228, 16:06), so a clip with no skin
  // on that frame is searched elsewhere - decoded from its own file, all candidates read in one Vision call.
  assert.match(seqTool, /const found = await timed\(\(\) => findSkinTime\(c\.start, c\.end, track, snap, visible\), "read"\);/, "a clip with no skin on the graded frame is searched");
  assert.match(panel, /function visionForGradeMany\(files\)/, "several frames go to Vision in one call");
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

test("a parade end more than 20 off neutral is a colored surface: no pad, no curve, said out loud", () => {
  const { levelsFor } = require("../src/grade_rules.cjs");
  const f = frame(22, 45, 90, [32, 12, 4], [90, 90, 90]); // B-R -28 at the bottom: a red-orange object in shadow
  // 23:12: "left alone" read as an orange picture; half of an object's color still comes out - through the
  // channel toes now, not the Shadows pad.
  const bot = bottomsFor(withBlacks(f, 32, 12, 4));
  assert.ok(bot && bot.toes.red.toe > 0, "half a pull on an object's color: " + JSON.stringify(bot && bot.toes));
  // Half, said on the frame itself: red's paired bottom is 32 over a floor of 4, and it must land about
  // halfway (18), not on the floor. A full pull here would drain the object it belongs to.
  const landed = bot.predicted.bands.blacks.levels;
  assert.ok(landed.red > 15 && landed.red < 21, "red lands halfway, not on the floor: " + landed.red);
  assert.ok(landed.red - landed.blue > 10, "so most of the object's own color is still there: " + JSON.stringify(landed));
  assert.ok(bot.needs.some((n) => /the scene's own color - half of it/.test(n)), bot.needs.join(" | "));
  const lev = levelsFor(f, null, f);
  assert.ok(!lev || lev.blackIn <= 0.03, "and at most a token black-point curve when its lowest channel is already at 4");
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

test("the saturation roll-off skips a colored end and a curve the clip already carries", () => {
  const neutral = frame(5, 45, 90, [5, 5, 5], [90, 90, 90]);
  const both = satCurveFor(neutral);
  assert.ok(both && both.points.length === 9 && /shadows and whites/.test(both.why));
  // C187 on the live runs: every dark band warm by 25-32 - the objects' color, not to be drained.
  const warmBottom = frame(20, 45, 90, [30, 12, 5], [90, 90, 90]);
  const one = satCurveFor(warmBottom);
  assert.ok(one && /whites only/.test(one.why), one && one.why);
  assert.ok(one.points.every(([x, y]) => x > 0.2 || y === 0), "no shadow end: " + JSON.stringify(one.points));
  assert.equal(satCurveFor(neutral, [[0, -0.2], [1, 0]]), null, "left as found");
});

test("mixed light beyond the pads' reach: temperature splits the difference, the pads take each end", () => {
  // C227 @5.63, 2026-09-16: whites warm by 25, blacks blue by 5.5 - a specular-only balance went to -83,
  // and (13:15) the split went to -47 and the oak turned pale: a top beyond COLORED over blacks leaning
  // the other way is an object's color, no white balance. Mixed light is a top between the pads' reach
  // and COLORED.
  const oak = temperatureFor(frame(12, 40, 68, [4, 7, 9.5], [80, 67.5, 55])); // blacks B-R +5.5, whites B-R -25, green neutral
  assert.ok(oak && oak.sceneColor && oak.value === 0 && /object's color/.test(oak.why), JSON.stringify(oak && { v: oak.value, why: oak.why }));
  const f = frame(12, 40, 68, [4, 7, 9.5], [80, 72, 63]); // blacks B-R +5.5, whites B-R -17
  const t = temperatureFor(f);
  assert.ok(t && /mixed light/.test(t.why), t && t.why);
  assert.ok(t.value < 0 && t.value > -45, "cooler, but nowhere near the specular-only solution: " + t.value);
  const after = t.predicted, w = after.blue.p99 - after.red.p99, b = after.blue.p1 - after.red.p1;
  assert.ok(Math.abs(w + b) < 6, "the two ends end on opposite sides of neutral, about equally: whites " + w.toFixed(1) + ", blacks " + b.toFixed(1));
});

test("a frame warm at both ends by more than 20 is the scene's color: no white balance, said out loud", () => {
  // C227 @4.44, 2026-09-16: an oak table and hands, whites -25 / blacks -27; -83 drained it.
  const f = frame(20, 45, 68, [31, 15, 4], [80, 66, 55]);
  const t = temperatureFor(f);
  assert.ok(t && t.sceneColor && t.value === 0 && t.tint === null, JSON.stringify(t && { v: t.value, s: t.sceneColor }));
  assert.match(t.why, /scene's own color/);
});

test("skin: the corridor runs from the line up into the oranges; only skin on the red side is brought to the line, skin past the corridor comes down to its yellow end", () => {
  const { skinFor, SKIN_HUE } = require("../src/grade_rules.cjs");
  // C227's hands, 2026-09-16: Cb -4.9 / Cr 5.6 = 131 deg, saturation 19. 22:23: 131 is NATURAL skin under
  // warm light - a fair face taken from 135 to 124 "to sit on the line" read "way too pink" to the owner.
  const hands = { luma: { min: 9.4, p1: 13.3, p50: 44.7, p99: 72.9, max: 75.3 }, red: { mean: 53.7, p1: 26.3, p99: 74.5 }, green: { mean: 43.1, p1: 10.6, p99: 72.2 }, blue: { mean: 35.8, p1: 1.6, p99: 78.4 }, saturation: { p50: 19, p99: 32 }, cast: { cb: -4.9, cr: 5.6 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0 };
  assert.equal(skinFor(hands), null, "131 deg at saturation 19 is left alone");
  const red = { ...hands, cast: { cb: -3, cr: 7 } }; // 113 deg: on the red/magenta side of the line
  const sk = skinFor(red);
  assert.ok(sk && sk.pad, "red-side skin gets a correction: " + JSON.stringify(sk));
  const hue = Math.atan2(sk.predicted.cast.cr, sk.predicted.cast.cb) * 180 / Math.PI;
  assert.ok(hue >= SKIN_HUE[0] && hue <= SKIN_HUE[1], "predicted hue on the line: " + hue.toFixed(1));
  assert.equal(sk.saturation, null, "saturation 19 is a point under the band: not worth the knob");
  // C222, 14:45: Saturation 198 on a hand at 14 made it bright pink. Under the band is reported, not boosted.
  const pale = skinFor({ ...red, saturation: { p50: 14, p99: 20 } });
  assert.equal(pale.saturation, null, "a pale hand is never boosted: " + JSON.stringify(pale));
  assert.ok(pale.why.some((w) => /under the band: left alone/.test(w)) && pale.pad, "it is said, and the hue is still put on the line");
  const loud = skinFor({ ...hands, saturation: { p50: 62, p99: 80 } });
  assert.ok(loud.saturation !== null && loud.saturation < 100 && loud.saturation >= 50, "over the band comes down: " + JSON.stringify(loud));
  const inBand = skinFor({ ...red, saturation: { p50: 30, p99: 40 } });
  assert.ok(inBand.saturation === null && Math.abs(Math.hypot(inBand.predicted.cast.cr, inBand.predicted.cast.cb) - Math.hypot(7, 3)) < 0.01, "the pad alone is a rotation: the radius is kept");
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

test("a long grade returns: it pauses at a time budget and says how to continue, and the shot match survives the pause", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const seqTool = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seqTool, /if \(budget_seconds > 0 && \(Date\.now\(\) - t0\) \/ 1000 > budget_seconds\) \{ resumeAt = /, "the loop stops at the budget");
  assert.match(seqTool, /if \(c\.start \+ 0\.001 < Number\(start_at \|\| 0\)\) continue;/, "a resumed run skips what is done");
  assert.match(seqTool, /call grade_sequence again with start_at=/, "the result says exactly how to continue");
  assert.match(panel, /const gradeMatched = new Map\(\);/, "the shot match is kept between calls, or a resumed run regrades a later cut from scratch");
  // ...but kept PER SEQUENCE, which the comment claimed and the key did not do. Without the sequence in it,
  // one cache served every sequence the panel had ever graded: on a brand-new working copy, 14 of 18 clips
  // reported "matched to <itself>" and replayed the values a DELETED copy's run had solved, so the solver -
  // and everything downstream of it, the forward guard included - was never asked (measured 2026-09-18).
  assert.match(seqTool, /const matchKey = \(\) => \(project\.sequenceId \|\| project\.sequence \|\| "\?"\) \+ "\|V" \+ track \+ "\|" \+ region;/,
    "the shot-match cache is keyed by the SEQUENCE, so a fresh working copy starts clean");
  const key = (sequenceId, track, region) => (sequenceId || "?") + "|V" + track + "|" + region;
  assert.equal(key("seq-A", 1, "subject"), key("seq-A", 1, "subject"), "a resumed run on one sequence keeps its matches");
  assert.notEqual(key("seq-A", 1, "subject"), key("seq-B", 1, "subject"), "a new working copy does NOT inherit the old one's grades");
  assert.notEqual(key("seq-A", 1, "subject"), key("seq-A", 2, "subject"), "tracks stay separate");
});

test("nothing the grade footer reads is declared inside the clip loop's try block (22:08: 'resumeAt is not defined' killed a run before a write)", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const t = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  const tryIdx = t.indexOf("  try {\n  for (const c of clips) {"), finIdx = t.indexOf("} finally { if (playheadBefore !== null)");
  assert.ok(tryIdx > 0 && finIdx > tryIdx, "the loop's try/finally is where expected");
  const inside = t.slice(tryIdx, finIdx), after = t.slice(finIdx);
  const declared = [...inside.matchAll(/^\s{2}(?:let|const) (\w+)/gm)].map((m) => m[1]);
  const leaked = declared.filter((n) => new RegExp("\\b" + n + "\\b").test(after));
  assert.deepEqual(leaked, [], "declared at the try's top level and read after it: " + leaked.join(", "));
});

test("log footage is recognised from the picture and never balanced as if it were display-referred", () => {
  const { looksLikeLog } = require("../src/grade_rules.cjs");
  // A Sony A7S II XAVC S file that declared nothing (23:10): black 12.5, white 70.6, saturation p99 10.
  const log = frame(12.5, 26.7, 70.6, [13.3, 12.5, 12.2], [71.4, 70.2, 70.2], { saturation: { p50: 3, p99: 10 } });
  assert.equal(looksLikeLog(log), true);
  const darkDisplay = frame(9.8, 40, 66.7, [10, 10, 10], [67, 67, 67], { saturation: { p50: 18, p99: 34 } }); // C233: dim, but colored
  assert.equal(looksLikeLog(darkDisplay), false, "a dim display picture shares the luma, never the color");
  const dimmer = frame(9.8, 40, 61.6, [10, 10, 10], [62, 62, 62], { saturation: { p50: 10, p99: 18 } }); // C231, 23:23: tripped the first version
  assert.equal(looksLikeLog(dimmer), false, "a dim, muted display picture is still not log: its median color is not near zero");
  const graded = frame(18, 58.4, 82.4, [18, 18, 18], [82, 82, 82], { saturation: { p50: 17, p99: 39 } });
  assert.equal(looksLikeLog(graded), false);
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const seqTool = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seqTool, /gradeLooksLikeLog\(m\)\) \{[\s\S]*?reads as LOG[\s\S]*?logSkipped\+\+;\s*continue;/, "a log clip is named and skipped, not stretched");
});

// A color read asks Vision for three things: the faces and hands a row names, and the subject's mask the
// grade measures through. It used to take two bin/ocr launches to get them - the default mode (522ms on a
// 1536x864 frame: text recognition and person segmentation nobody here reads, and a subject pass that
// segments the frame then throws the mask away) followed by --subject, which segments it AGAIN. One
// --grade launch returns the same three answers in 354ms, measured on the same frame (2026-09-17 13:36).
test("a color read costs ONE bin/ocr launch, and the mode does no work it does not use", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const region = panel.slice(panel.indexOf("function measureRegion("), panel.indexOf("function visionForGrade("));
  assert.equal((region.match(/execFileSync\(OCR_BIN/g) || []).length, 0, "measureRegion itself launches nothing");
  assert.match(region, /const vision = region === "frame" \? null : \(seen !== undefined \? seen : visionForGrade\(src\)\);/,
    "one launch when it has to look itself, none when a batched read already looked");
  assert.match(region, /const found = vision && vision\.subjectMask;/, "the mask comes from that one call, not a second segmentation");
  assert.doesNotMatch(panel, /subjectMask\(src\)|= visionAll\(/, "the two-launch path is gone, not left beside the new one");
  const swift = fs.readFileSync(path.join(__dirname, "..", "src", "ocr.swift"), "utf8");
  assert.match(swift, /case "grade": parts = \[faces\(cg, file\), hands\(cg, file\), subject\(cg, file, writeMask: true\)\]/);
  assert.doesNotMatch(swift.slice(swift.indexOf('case "grade"'), swift.indexOf('default: parts')), /text\(|person\(/, "no text or person work in the color mode");
  // The shipped binary must actually have the mode, or every subject read silently falls back to the frame.
  const ocr = path.join(__dirname, "..", "bin", "ocr");
  if (fs.existsSync(ocr)) {
    const out = require("node:child_process").spawnSync(ocr, ["--grade", "/nonexistent.png"], { encoding: "utf8" });
    assert.match(out.stdout || "", /"error":"unreadable"/, "bin/ocr is stale: rebuild it (swiftc -O -o bin/ocr src/ocr.swift -framework Vision -framework AppKit; codesign -s - bin/ocr)");
  }
});

// "Couldn't it export the pngs it needs in one go?" (the owner, 13:42). For the FIRST read of every clip,
// yes: those frames are already files on disk, and Vision's launch is most of its cost - 18 frames in one
// bin/ocr call take 1.28s where one at a time take 7.0s. For the confirms, no: each one has to wait for
// the knobs written after the one before it. So the source reads batch and the renders stay sequential.
test("every clip's first read is one batched pass, bounded in memory", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const fn = panel.slice(panel.indexOf("const PREREAD_BATCH"), panel.indexOf("const round2 ="));
  assert.match(fn, /visionForGradeMany\(pngs\)/, "one Vision launch for the batch, not one per clip");
  assert.match(fn, /const PREREAD_BATCH = 24;/);
  assert.match(fn, /for \(let from = 0; from < list\.length; from \+= PREREAD_BATCH\)/, "a long sequence is read in bounded batches");
  assert.match(fn, /got\.f = null;/, "decoded pixels are released once the PNG is written");
  assert.match(fn, /fs\.rmSync\(s\.png/, "and the PNGs are cleaned up per batch");
  const seq = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seq, /const preread = read === "premiere" \? \{\} : await prereadSources\(timelineOrder,/, "every clip, not just the multi-cut ones");
  assert.doesNotMatch(seq, /preread\[keyOf\(c\)\] = \{ m: await measureSourceAt/, "the per-clip preread loop is gone");
});

// The frame handed to Vision is a temp file read once and deleted. It was a PNG, and PNG's compression cost
// 352ms a frame against BMP's 18ms - on 18 clips, 6 of the preread's 11.5 seconds, for a file nobody keeps.
// Vision returns identical faces, hands and subject coverage from either (measured 2026-09-17 13:47).
test("a frame written for Vision is cheap to write, and its pixels are not decoded back out again", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const w = panel.slice(panel.indexOf("function writeFrameImage("), panel.indexOf("async function measureSourceAt("));
  assert.match(w, /\.bmp"/, "BMP, not PNG: twenty times the write speed for a file read once");
  assert.doesNotMatch(panel, /writeFramePng/, "one writer, not two");
  // The caller already holds the pixels and the frame numbers; measureRegion must be able to take them.
  const region = panel.slice(panel.indexOf("function measureRegion("), panel.indexOf("function visionForGrade("));
  assert.match(region, /const pixels = \(\) => \(have && have\.rgb\) \|\| decodeRgb\(src\);/);
  assert.match(region, /const frame = \(have && have\.frame\) \|\| measureScopes\(pixels\(\)\);/);
  assert.doesNotMatch(region, /maskRgb\(decodeRgb\(src\)/, "the subject is masked through the pixels in hand");
  const pre = panel.slice(panel.indexOf("const PREREAD_BATCH"), panel.indexOf("const round2 ="));
  assert.match(pre, /measureRegion\(s\.png, region, null, vision, \{ rgb: s\.rgb, frame: s\.got\.whole \}\)/);
  assert.match(pre, /s\.rgb = null;/, "and released right after, so a batch holds one clip's pixels at a time");
});

// The black-point correction obeys the same channel guard as the first write. It did not, and that is how
// a channel ends up under zero: C229 on the 2026-09-17 14:52 run was held at 0.06 by the first write ("held
// at the lowest channel bottom"), then the correction chased the LUMA black point to 0.14 and 0.17 with no
// guard at all - red under zero, blue floating at +8, which is what the owner's parade showed at 09:10.
// Guarded again 2026-09-17 18:20, on the two conditions this test held it to. 0.1.82's version froze the
// correction on almost every clip (balanced 7 -> 4; C220 lost a black point of 4.3 it had reached safely)
// because it was DERIVED and because the first write had already spent the headroom it measured. Both are
// now answered: curveToe swept the Master bottom point live, and bottomsFor deliberately leaves the Master
// its room. Without the guard the 18:13 run drove the curve 0.02 -> 0.09 -> 0.15 chasing a black point the
// frame has no room for and put 3.13% of blue on the floor.
test("the black-point correction obeys the same floor guard as the first write, on the swept model", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const seq = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seq, /const xAdd = Math\.min\(xWant, room\);/, "the correction's move is capped by the room actually left");
  assert.match(seq, /Math\.min\(fr\.red\.p1, fr\.green\.p1, fr\.blue\.p1\) - GRADE_FLOOR_MIN/, "and the room is the lowest channel's, read AFTER the first write - the post-curve domain, not mapped back through it");
  assert.match(seq, /`curveToe` has since swept the Master bottom point live/, "the note says which sweep licenses it");
  // The precondition that made 0.1.82 fail must still hold, or the guard has nothing to cap against.
  const rules = fs.readFileSync(path.join(__dirname, "..", "src", "grade_rules.cjs"), "utf8");
  assert.match(rules, /levelsFor needs floorCap >= 0\.02/, "bottomsFor leaves the Master curve its room rather than spending it");
  assert.ok(require("../src/lumetri_sweeps.json").curveToe, "and the sweep it rests on is in the file");
});

// And the correction must write onto the curves the black balance produced, not the clip's originals:
// curveLevels replaces Master only, so passing currentCurves silently discards the channel toes. That is
// what happened on the 18:13 run - the bottoms were levelled by the first write and wiped by the first
// correction.
test("the black-point correction keeps the channel toes instead of writing over them", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const seq = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seq, /await cw\.write\(curveLevels\(curve2, 1, lev\.curves, lev\.anchor\)\)/, "composed onto the first write, which carries the toes");
  assert.doesNotMatch(seq, /curveLevels\(curve2, 1, currentCurves/, "never onto the clip's originals");
});

test("the deterministic pass can grade one clip, and the skill sends single-shot work there", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  assert.match(panel, /log: logArg = "ask", seconds \} = \{\}\)/, "grade_sequence takes a position");
  const seq = panel.slice(panel.indexOf("async function gradeSequenceTool"), panel.indexOf("async function audioClipsIn"));
  assert.match(seq, /const one = timelineOrder\.filter\(\(c\) => at >= c\.start && at < c\.end\);/, "one clip, by timeline position");
  assert.match(seq, /no footage at " \+ at \+ "s on V"/, "and it says so when the position is off the track");
  assert.ok(seq.indexOf("timelineOrder = one;") < seq.indexOf("const preread ="), "the filter happens before the preread, so only that clip is read");
  const def = panel.slice(panel.indexOf('{ name: "grade_sequence"'), panel.indexOf('{ name: "audio_cut"'));
  assert.match(def, /never grade_shot, which takes goals YOU choose/, "the tool says why grade_shot is not the tool for a balance");
  const skill = fs.readFileSync(path.join(__dirname, "..", ".claude", "skills", "color", "SKILL.md"), "utf8");
  assert.match(skill, /`grade_sequence` with `seconds`/);
  assert.match(skill, /steered by YOU/, "and the skill says what grade_shot actually is");
});

// A button cannot mis-route. Twice on 2026-09-17 the model reached around the pass - once because the skill
// was not named in the prompt, once because no single-clip form existed - and both times it hand-rolled
// knobs the canon would never write. The button calls the pass directly, and only picks scope.
test("the Color correct button runs the deterministic pass, and only chooses scope", () => {
  const fs = require("node:fs"), path = require("node:path");
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const id of ["btn-color", "color-options", "btn-color-all", "btn-color-clip", "btn-cancel-color"]) assert.ok(html.includes('id="' + id + '"'), "missing " + id);
  const panel = fs.readFileSync(path.join(root, "panel.js"), "utf8");
  const fn = panel.slice(panel.indexOf("async function runColorButton("), panel.indexOf("async function runCaptionsButton("));
  assert.match(fn, /await gradeSequenceTool\(seconds === undefined \? \{\} : \{ seconds \}\)/, "the pass itself, whole or one clip - no knobs chosen here");
  assert.doesNotMatch(fn, /gradeTool|gradeShotTool/, "never the steered tools");
  assert.match(fn, /Select a clip on the timeline first/, "and it says what to do when nothing is selected");
  assert.match(panel, /ui\.btnColorAll\.onclick = \(\) => runColorButton\("all"\);/);
  assert.match(panel, /ui\.btnColorClip\.onclick = \(\) => runColorButton\("clip"\);/);
  // The button must be disabled while any job runs, like the others.
  assert.match(panel, /ui\.btnMakeCaptions, ui\.btnColor, ui\.btnColorAll, ui\.btnColorClip\]\.forEach\(\(b\) => \{ b\.disabled = true; \}\);/);
  const skill = fs.readFileSync(path.join(root, ".claude", "skills", "color", "SKILL.md"), "utf8");
  assert.match(skill, /Every color request goes through the pass\. The only question is scope\./);
  assert.match(skill, /Never assemble a grade out of single knobs/);
});

// The owner's own proof frame, as scopes actually read it at 17:21 on 2026-09-17. The pass that shipped
// that day answered its 13-point warm bottom with a Shadows pad at 204 degrees, ran the pad to its cap
// across both corrections, and finished at R 5.5 / G 8.2 / B 10.6 - blue by 5.1, the sign flipped, with
// 0.48% of red driven onto the floor. This is the regression test for that: same input, and the bottoms
// must come out level without the wheel being pointed at them.
test("the proof frame's warm bottom is levelled by the toes, and the Shadows wheel never touches it", () => {
  const { levelsFor } = require("../src/grade_rules.cjs");
  const m = { luma: { min: 11.4, p1: 14.1, p50: 52.9, p99: 75.7, max: 86.7 },
    red: { mean: 52.2, p1: 18.8, p99: 74.9 }, green: { mean: 49.7, p1: 12.9, p99: 76.5 }, blue: { mean: 45.1, p1: 8.2, p99: 78.4 },
    saturation: { p50: 9, p99: 24 }, cast: { cb: -2.6, cr: 1.5 }, clipped: { red: 0, green: 0, blue: 0 }, floor: { red: 0, green: 0, blue: 0 }, crushed: 0,
    bands: { blacks: { share: 3, readable: 100, rb: -12.9, g: -1.6, levels: { red: 21.6, green: 13.3, blue: 8.6 } },
             whites: { share: 3, readable: 100, rb: 7.8, g: 1.6, levels: { red: 71.8, green: 74.9, blue: 77.3 } },
             whites1: { share: 1, readable: 100, rb: 7.1, g: 1.2, levels: { red: 72, green: 75, blue: 77 } } } };
  assert.equal(padsFor(m).wheels.shadows, undefined, "the instrument that wrote the defect is not reached for");
  const bot = bottomsFor(m);
  assert.ok(bot, "the warm bottom is taken");
  assert.equal(bot.predicted.bands.blacks.rb, 0, "paired bottoms level: -13.0 in, 0 out (the shipped pass turned it into +5.1)");
  assert.ok(bot.toes.red.toe > bot.toes.green.toe && bot.toes.green.toe > 0, "red was 13 over the floor and comes DOWN furthest: " + JSON.stringify(bot.toes));
  // Read from the timeline render, red's own p1 is 18.8 and it has the headroom to come all the way down,
  // so they meet on the lowest channel and nothing is lifted. Down is the honest direction when it is free:
  // red's excess IS the cast, and lifting blue would only fake what was never recorded.
  assert.equal(bot.meet, 8.6, "every channel can reach the lowest, so that is where they meet");
  assert.equal(bot.toes.blue.lift, 0);
  // Nothing is driven onto the floor: every channel's own p1 clears the measured margin.
  for (const ch of ["red", "green", "blue"]) assert.ok(bot.predicted[ch].p1 >= 2, ch + " stays off the floor at p1 " + bot.predicted[ch].p1);
  // And the black point still gets set afterwards, on a bottom that is already level.
  const lev = levelsFor(bot.predicted, bot.curves, m);
  assert.ok(lev && lev.blackIn >= 0.02, "and a Master bottom point is actually SET - down-only left floorCap at 0.005 and set none at all: " + (lev && lev.blackIn));
  assert.deepEqual(lev.curves.Red, bot.curves.Red, "and it composes onto the toes rather than replacing them");
});

// The same frame as the pass itself reads it - from the SOURCE file, by subject region - where red's own
// p1 is 13.76 rather than 18.8. That is the run of 17:59: red's toe hit its cap, took red's own p1 to 2.0,
// left floorCap at 0.005 against the 0.02 levelsFor needs, and NO black point was set - the row read
// "black point 9.8 lifted". With the lift measured the meeting level rises instead and both numbers land.
test("when a channel cannot come all the way down, the others come UP to meet it and the black point survives", () => {
  const { levelsFor, FLOOR_MIN } = require("../src/grade_rules.cjs");
  const m = { luma: { min: 11, p1: 14.1, p50: 52.9, p99: 74.9, max: 86 },
    red: { mean: 52, p1: 0.120 * 98 + 2, p99: 74.9 }, green: { mean: 50, p1: 12.9, p99: 76.5 }, blue: { mean: 45, p1: 8.2, p99: 78.4 },
    saturation: { p50: 9, p99: 24 }, cast: { cb: -2.6, cr: 1.5 }, clipped: { red: 0, green: 0, blue: 0 }, floor: { red: 0, green: 0, blue: 0 }, crushed: 0,
    bands: { blacks: { share: 3, readable: 100, rb: -12.6, g: -1.6, levels: { red: 20.8, green: 12.9, blue: 8.2 } },
             whites: { share: 3, readable: 100, rb: 7.5, g: 1.6, levels: { red: 71, green: 74, blue: 78 } } } };
  const bot = bottomsFor(m);
  assert.ok(bot.meet > 8.2, "the meeting level rises off the lowest channel because red cannot reach it: " + bot.meet);
  assert.ok(bot.toes.blue.lift > 0, "so blue comes UP - the move the sweep shows costs no floor at all");
  assert.equal(bot.predicted.bands.blacks.rb, 0, "and the bottoms still end level");
  const floorCap = (Math.min(bot.predicted.red.p1, bot.predicted.green.p1, bot.predicted.blue.p1) - FLOOR_MIN) / 100;
  assert.ok(floorCap >= 0.02, "with the Master curve's room preserved: floorCap " + floorCap.toFixed(4) + " (down-only left 0.005)");
  assert.ok(levelsFor(bot.predicted, bot.curves, m), "so a black point is set at all, which is what the 17:59 run lost");
});

// panel.js is one 390KB scope and the tests read it as text, so a `const` used above its own declaration
// passes every assertion and throws at runtime - swallowed, in this case, by the row builder's own catch.
// That is exactly what the black-point chain did on its first edit: the shot-match row builder sits above
// the declaration and `continue`s before reaching it.
test("the black-point chain is never referenced above its own declaration", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const declared = panel.indexOf("const bpChain = [");
  assert.ok(declared > 0, "it is declared");
  let from = 0, uses = 0;
  for (;;) {
    const at = panel.indexOf("bpChain", from);
    if (at < 0) break;
    assert.ok(at >= declared, "bpChain used at " + at + ", declared at " + declared + " - a TDZ ReferenceError at runtime");
    from = at + 1; uses++;
  }
  assert.ok(uses >= 3, "declaration plus at least one real use");
});

// The one-clip calibration is the biggest declared limit in src/lumetri_sweeps.json, and until 2026-09-17
// nothing could even test it: no tool could set a raw slider value, because grade/grade_shot steer a
// statistic to a target. slider_sweep is that door, and it carries the two rules curve_sweep learned the
// hard way - the neutral value is always the baseline row, and the knob goes back afterwards.
test("slider_sweep sets raw values, always includes neutral, and restores the slider", () => {
  const fs = require("node:fs"), path = require("node:path");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const i = panel.indexOf("async function sliderSweepTool");
  assert.ok(i > 0, "the tool exists");
  const body = panel.slice(i, panel.indexOf("// A whole shot in one go", i));
  assert.match(body, /if \(!xs\.some\(\(v\) => Math\.abs\(v - neutral\) < 1e-9\)\) xs = \[neutral, \.\.\.xs\];/, "neutral is always the baseline row");
  assert.match(body, /await w\.set\(before\)/, "the slider goes back");
  assert.ok(body.indexOf("before = await w.read()") < body.indexOf("await w.set(v)"), "and it is read before anything is written");
  assert.match(body, /ensureWorkingCopy/, "it writes on the working copy like every other tool");
  assert.match(panel, /saturation: \[0, 50, 100, 150, 200\]/, "saturation's neutral is 100, not 0, so it gets its own steps");
  assert.match(panel, /const neutral = isFinite\(spec\.neutral\) \? spec\.neutral : 0;/, "and neutral comes from the param spec, not assumed to be zero");
  assert.match(panel, /slider_sweep: sliderSweepTool/, "registered");
  assert.equal(panel.match(/sliderSweepTool/g).length, 2, "defined and registered, nothing in the grade calls it");
});
