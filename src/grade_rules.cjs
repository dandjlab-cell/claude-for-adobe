// What to do to a shot, decided from its scopes by rule - the colorist canon, not invented numbers.
//
// The order and the targets are the industry's (Van Hurkman, Eagles, the broadcast conventions the
// scopes were built for; sources in the color skill): white balance the shot, set the black point and
// the white point, neutralise what is left of the casts by lining the parade up - blacks with the
// Shadows wheel, whites with the Highlights wheel - then saturation, then skin onto the vectorscope's
// skin line. Midtones of a product or a hand have no canonical number and are left to taste; only a
// face has a band.
//
// Why the balance is solved BEFORE the tonal sliders here, when a colorist sets the black point first:
// the pad model reads the parade's bottoms, and once Blacks has put the black point at 4 a warm
// bottom's blue channel is on the floor - the pad's response is then clamped, not linear. Read the casts
// where there is room (the frame as shot), cancel them, then move the ends with the tonal sliders,
// which are equal-channel operations. Equal-channel is not "cannot tint" - three independently taken
// percentiles need not be the same pixels - which is why the confirm reads the casts again.
"use strict";
const { STATISTICS, PARAMS, damage, allowance } = require("./grade.cjs");
const PIXELS = require("./grade_pixels.cjs");
const { solveKnob, predict } = require("./grade_model.cjs");
const { castAt, solveCast, predictPads, MAX_SAT } = require("./wheels.cjs");
const { levels, blackInFor, predictLevels, toesFor, movesFor, neutralBottoms, predictBottoms, satRolloff, ROLLOFF_DEPTH } = require("./curves.cjs");

const BLACK_POINT = [0, 5];      // luma p1 of the FRAME: sits here, not crushed flat
const WHITE_POINT = [88, 95];    // luma p99 of the FRAME: 90-95 with nothing true white; never clipped
// What the panel ACCEPTS as balanced - the canon's bands with the tolerance one render's reading has.
// One predicate for the goals, the verdict and the printed footer, so they cannot disagree.
const ACCEPT = { blackMax: BLACK_POINT[1] + 1, whiteMin: WHITE_POINT[0] - 3, whiteMax: WHITE_POINT[1] };
const SKIN_LUMA = [40, 70];      // a face: light skin 60-70, dark skin 40-60; alive around 60-65
// The vectorscope skin line is 123 deg on this scale (atan2(Cr, Cb); LOWER is redder, higher yellower).
// It is a corridor, not a hairline, and complexions sit above it as well as on it - the research's own
// words. On 2026-09-16 22:23 the pass took a fair face under warm kitchen light from 135 deg to 124 deg,
// twice, "to put it on the line", and the owner's verdict was "way too pink": the canon's number pulled
// her toward red because the target sat at the red end of the corridor. So: the band runs from the line
// up into the oranges, and skin is only ever brought TO the line from the red/magenta side. From the
// yellow side (past 140, a green cast) it comes down to the corridor's yellow end, never to the line.
// The corridor the pass leaves alone. The ceiling was 140 after a fair face went 135 -> 124 degrees and
// read "way too pink" (2026-09-16 22:23) - but the fault there was the TARGET, not the tool: everything
// aimed at 123, so that face was rotated 11 degrees toward red on purpose. The aim is asymmetric now
// (a correction from above lands on 132), so the same face moves 3.3 degrees rather than 11, and the
// ceiling comes back down to where skin that reads orange is actually worked on (the owner, 14:30).
const SKIN_HUE = [116, 132];
const SKIN_HUE_TARGET_LO = 123, SKIN_HUE_TARGET_HI = 132; // where a correction aims from below / from above
// Percent of the vectorscope radius; ~30 reads natural on Rec.709. The band is a rule of thumb for skin in
// general (hands are arguably the better reference: no makeup), and it is ASYMMETRIC in what it means. All
// skin tones differ "in saturation and brightness but not in hue" (Van Hurkman, Color Correction Handbook
// ch.5) - which is why one line serves every complexion, and why genuinely pale skin legitimately sits low
// on it. Under the band is therefore a reading, not a fault; over it is a fault. When pale skin IS wrong the
// order of remedy is white balance, then contrast (which raises perceived saturation without a saturation
// control), and saturation last and modestly - never a boost inside a key.
const SKIN_SAT = [20, 50];
// A hand or a product is what the shot is about: it has no canonical band, but a subject whose median
// luma sits under SUBJECT_DARK while the frame is balanced is "objectively very dark where it matters"
// (the owner, 2026-09-16 12:15, C222: the frame ticked, the hand and cloth sat at 15-30). Lifted with
// Shadows (a dark-areas control) toward SUBJECT_LUMA, capped where the frame's black point would pass 8.
const SUBJECT_DARK = 35, SUBJECT_LUMA = 40, SUBJECT_BLACK_MAX = 8, SUBJECT_SHADOWS_CAP = 30;
// harsh was 85 - which the targets themselves exceed (black 4, white 92 = 88), so Contrast -60 fired on
// five clips of the 21:05 run and lifted the black points the curve had just set. Harsh is past the
// canon's own range.
// `flat`/`harsh`/`target` judge the ends (p1-p99). `bodyFlat` judges the middle 80% of the picture, which
// is what "flat-ish" means to the eye: C193 @15.39 ended with its ends at 4.3 and 92.9 - a spread of 88,
// nominally perfect - while the body sat inside 40 points. A specular and a dark corner satisfy the ends.
const SPREAD = { flat: 55, harsh: 93, target: 70, bodyFlat: 45, bodyTarget: 52 };
const NEUTRAL = 1.5;             // parade ends within this of each other are neutral
const MIDTONE_CAST = 4;          // the middle band this far off neutral is a cast the eye sees as a tint (pink skin, green walls)
const TEMPERATURE_CAP = 50;      // a balance is not a look: half the slider
const PAD_REACH = 12;            // about what a pad at its cap (0.3) cancels, from the 21:00 sweep (6.5 per 0.15)
const COLORED = 20;             // a parade end this far off neutral is an object's color (a red-orange surface in shadow), not the light
// Blacks is a toe control ("black clipping", Adobe), not a lift: the sweep's p1 sits at 0 from -20 down,
// so nothing below -20 is calibrated and nothing above the toe is reached by it. The -20..0 slope (0.41
// per unit) is a lower bound taken on a clipped sample; an automatic pass never goes past -20 and says
// when the black point is beyond what that can do (the run of 18:03: -40 moved 22 -> 18).
const BLACKS_REACH = 20;
const BLACKS_SLOPE = 0.41;

const frameOf = (m) => m.frame || m;

// 2026-09-18: the quantitative form of verdict's frame tests, using its SAME thresholds and cast
// trust gate. A blind end has the worst possible IRE deficit (100), never a fictitious zero cast.
// Distortion is mean absolute RGB displacement in IRE, supplied by the pixel evaluator. The tuple is
// lexicographic: worst violation, total violations, distortion, all in the measured 0.4 IRE bins.
function objective(m, distortion = 0, targets = {}) {
  const f = frameOf(m), spread = STATISTICS.spread(m), body = STATISTICS.body(m);
  const errors = [f.luma.p1 - ACCEPT.blackMax, ACCEPT.whiteMin - f.luma.p99, f.luma.p99 - ACCEPT.whiteMax,
    SPREAD.flat - spread, spread - SPREAD.harsh];
  if (spread >= SPREAD.flat && spread <= SPREAD.harsh) errors.push(SPREAD.bodyFlat - body);
  for (const wheel of ["shadows", "highlights"]) {
    if (!castTrust(f, wheel).trusted) errors.push(100); // 100 IRE is the entire display container.
    else castAt(f, wheel).forEach((axis, i) => errors.push(Math.abs(axis - (targets[wheel] || [0, 0])[i]) - NEUTRAL));
  }
  const bins = errors.map(PIXELS.bin);
  return [Math.max(...bins), bins.reduce((a, b) => a + b, 0), PIXELS.bin(distortion)];
}

// 2026-09-18: acceptance comes first for Master and Basic choices. Inside equal acceptance bins, aim at the
// rule's frozen target before minimizing displacement; otherwise Whites would stop at 85, never 92.
function candidateScore(m, distortion, readStat, target, targets) {
  const o = objective(m, distortion, targets);
  return [o[0], o[1], PIXELS.bin(Math.abs(readStat(m) - target) - PIXELS.NOISE), o[2]];
}

// Log footage, recognised from the picture. A log encode has a black floor that never reaches the
// bottom (S-Log2/3 sit near 9-13 on this scale), a top that never reaches the top, and color at a
// fraction of a display picture's - measured 2026-09-16 23:10 on a Sony A7S II XAVC S file that declared
// nothing (no transfer tag, no sidecar): black 12.5-14.5, white 68-71, saturation p99 10-14 on three
// frames a quarter-hour apart, against 32-39 on the display-referred sandbox. Balancing that as a dull
// Rec.709 picture stretches the log curve instead of converting it; the pass stands down and says so.
// Saturation is the discriminator: a dark display picture can share the luma numbers, never the color.
// 23:23: a dim Blackmagic clip (black 9.8, white 61.6, color p99 18) tripped the first version at p99 18,
// so the color test is two-sided now - the log file read p99 10-14 AND median 3-4; a dim display picture
// keeps a colored median (C231 ~10). Both must be low.
const LOG_SIGNATURE = { blackMin: 8, whiteMax: 78, satMax: 15, satMedianMax: 6 };
function looksLikeLog(m) {
  const f = frameOf(m);
  if (!f || !f.luma || !f.saturation) return false;
  return f.luma.p1 >= LOG_SIGNATURE.blackMin && f.luma.p99 <= LOG_SIGNATURE.whiteMax && f.saturation.p99 <= LOG_SIGNATURE.satMax && f.saturation.p50 <= LOG_SIGNATURE.satMedianMax;
}

// White balance first: Temperature, for a cast the whole parade shares. It is a gain on red against
// blue, strongest at the top, so it is solved to line the WHITES up and only when the blacks lean the
// same way (a warm bottom under blue tops is two lights, not a white balance - that is the pads' job).
// Returns null when temperature is not the tool.
// A color move that puts a channel on the floor has crushed it: a -50 temperature on warm shadows takes
// red below zero (5.7% of C227's pixels on the 21:37 run). The model predicts the channel bottoms, so a
// move is scaled back until they stay off the floor.
const FLOOR_MIN = 1.5;
const channelFloor = (m) => { const f = frameOf(m); return Math.min(f.red.p1, f.green.p1, f.blue.p1); };
// One axis of the white balance: the knob value that lines the whites up on `stat`, capped at half the
// slider, scaled back until the predicted channel bottoms stay off the floor. null = no move.
// No fixed cap either: the slider runs to 100; the move is scaled back while the predicted channel
// bottoms would reach the floor or the predicted tops the ceiling (both sweeps clip past +50 on the
// calibration frame, which is what the old +-50 stood for).
const channelTop = (m) => { const f = frameOf(m); return Math.max(f.red.p99, f.green.p99, f.blue.p99, f.luma.max || 0); };
const TOP_MAX = 98.5;
// `satFloor` (0..1): stop the move where the predicted saturation would fall under that fraction of what
// the picture has - the scene-color case, where a full neutralisation drains the objects (C227's oak,
// 01:33) and none at all leaves an orange picture (the owner, 23:12: "it's not balanced").
function balanceAxis(m, param, from, stat, satFloor = 0, share = 1, pixels = null) {
  const px = PIXELS.context(pixels);
  if (px) {
    const sat0 = STATISTICS.saturation(m);
    const target = stat(m) * (1 - share);
    const r = PIXELS.choose({ pixels: px, reading: m, op: param, from, range: PARAMS[param].range,
      readStat: stat, target, allow: allowance(damage(px.baseline)),
      // WB's neutral/mixed-light target is a frozen policy, like the channel meeting below.
      // A deferred black-point deficit must not turn "split the two lights" into "neutralize whites".
      score: (s, d) => [PIXELS.bin(Math.abs(stat(s) - target) - PIXELS.NOISE), ...objective(s, d, px.targets)],
      constraint: (p) => channelFloor(p) < FLOOR_MIN && channelFloor(m) >= FLOOR_MIN ? "channel floor " + FLOOR_MIN
        : channelTop(p) > TOP_MAX && channelTop(m) <= TOP_MAX ? "channel ceiling " + TOP_MAX
        : satFloor > 0 && sat0 > 0 && STATISTICS.saturation(p) < sat0 * satFloor ? "saturation floor" : null });
    return { value: r.feasible ? r.value : from, predicted: r.feasible ? r.state : m, pixels: r.feasible ? r.pixels : px,
      how: "pixels", evaluations: r.evaluations, note: " (" + r.note + ")" };
  }
  const s = solveKnob(m, param, from, stat, stat(m) * (1 - share)); // share < 1: take out only that part of the cast
  if (!s || !s.helps) return null;
  let value = s.value, predicted = predict(m, param, from, value), held = null;
  const sat0 = STATISTICS.saturation(m);
  const unsafe = (p) => (channelFloor(p) < FLOOR_MIN && channelFloor(m) >= FLOOR_MIN) || (channelTop(p) > TOP_MAX && channelTop(m) <= TOP_MAX) || (satFloor > 0 && sat0 > 0 && STATISTICS.saturation(p) < sat0 * satFloor);
  while (unsafe(predicted) && Math.abs(value - from) > 2) { value = from + (value - from) * 0.8; predicted = predict(m, param, from, value); held = channelFloor(predicted) < FLOOR_MIN ? "floor" : channelTop(predicted) > TOP_MAX ? "ceiling" : "color"; }
  if (Math.abs(value - from) <= 2) return null;
  return { value, predicted, how: "table", note: " (table: no retained sample)" + (held === "color" ? " (held back: further would drain the objects' color)" : held ? " (held back: further would put a channel on the " + held + ")" : "") };
}
const SCENE_SAT_FLOOR = 0.7, SCENE_SHARE = 0.5; // the scene's own color: at most half of it, never past the saturation floor
// Temperature on blue-red, then Tint on green-magenta, solved on the state temperature predicts. Both
// are gains on the top, both clip past +50 (their sweeps), both are the white balance. `tint` is null
// when the green axis is already neutral.
function temperatureFor(m, from = 0, tintFrom = 0, pixels = null) {
  let px = PIXELS.context(pixels);
  // A raw retained source is neutral. A nonneutral caller needs explicit source operations, otherwise
  // taking the absolute slider value through already graded pixels would double-apply it.
  if (px && [["temperature", from], ["tint", tintFrom]].some(([op, v]) => v !== (px.operations.find(([name]) => name === op) || [null, 0])[1])) px = null;
  if (px) m = PIXELS.readingFor(px, m);
  const f = frameOf(m);
  const whites = STATISTICS.whitesRB(f), blacks = STATISTICS.blacksRB(f), whitesG = STATISTICS.whitesG(f);
  let temp = null;
  // Two lights (a warm top under blue blacks) are the pads' job - unless the whites' cast is more than
  // the Highlights pad can cover, when the white balance takes it and the Shadows pad mops up what
  // that does to the blacks (the 21:05 run left whites warm by 20 on two clips by skipping this).
  const twoLights = Math.abs(blacks) > NEUTRAL && Math.sign(whites) !== Math.sign(blacks) && Math.abs(whites) <= PAD_REACH;
  // Two lights beyond the pads' reach (C227, 2026-09-16 01:27: whites warm by 25, blacks BLUE by 5-8): a
  // temperature that lines the whites up alone pushes the whole frame blue (-83, whites +18 on a sibling
  // cut). Mixed light is split: temperature takes the part both ends share (the mean of the two casts to
  // zero), the pads take the opposite residuals, each now inside their reach.
  const mixed = Math.abs(blacks) > NEUTRAL && Math.sign(whites) !== Math.sign(blacks) && Math.abs(whites) > PAD_REACH;
  const meanRB = (x) => (STATISTICS.whitesRB(x) + STATISTICS.blacksRB(x)) / 2;
  // Both ends the same way by more than COLORED is the scene, not the light (an oak table and hands,
  // C227 @4.44, 2026-09-16 01:33: whites -25, blacks -27; a -83 temperature made the wood grey-beige
  // and the skin pale). The C187 rule, applied to the white balance as well: left alone, said out loud.
  // Whites beyond COLORED under blacks that lean the OTHER way are an object too (the oak's sheen over
  // a blue cloth, C227 @5.63, 13:15: "mixed light" split it to -47 and the whole shot went pale): only
  // blacks that lean the same way by less than COLORED make a warm top the light. The pads take the
  // blacks; a colored top gets no pad either.
  const sceneColor = Math.abs(whites) > COLORED && (Math.sign(whites) !== Math.sign(blacks) || Math.abs(blacks) > COLORED);
  // The scene-color rule explicitly preserves the red/blue cast; an unrelated Tint search must not
  // earn a better score by stripping it through coupled channel gains.
  if (px && sceneColor) px = { ...px, targets: { ...(px.targets || {}), shadows: [blacks, 0], highlights: [whites, 0] } };
  if (Math.abs(whites) > NEUTRAL && !twoLights && !sceneColor) temp = balanceAxis(m, "temperature", from, mixed ? meanRB : STATISTICS.whitesRB, 0, 1, px);
  // A picture warm at BOTH ends keeps its temperature: half the cast still solved to -49 on the oak-table
  // fixture, and the owner had called -47 pale (23:20). The scene's color comes out, when it does, through
  // the pads at half strength (padsFor) - which is what a warm bottom under neutral whites needs.
  const afterTemp = temp ? temp.predicted : m;
  if (temp && px) px = temp.pixels;
  const tint = Math.abs(STATISTICS.whitesG(frameOf(afterTemp))) > NEUTRAL ? balanceAxis(afterTemp, "tint", tintFrom, STATISTICS.whitesG, 0, 1, px) : null;
  if (tint && px) px = tint.pixels;
  const provenance = { how: px ? "pixels" : "table", pixels: px, evaluations: (temp ? temp.evaluations || 0 : 0) + (tint ? tint.evaluations || 0 : 0) };
  const sceneWhy = Math.sign(whites) === Math.sign(blacks) ? "whites and blacks both " + (whites > 0 ? "blue" : "warm") + " by " + round(Math.abs(whites)) + " / " + round(Math.abs(blacks)) + ": at this size that is the scene's own color, not the light" : "whites " + (whites > 0 ? "blue" : "warm") + " by " + round(Math.abs(whites)) + " over blacks that lean the other way: the brightest pixels are an object's color (a sheen, a lamp), not the light";
  if (!temp && !tint) return sceneColor ? { ...provenance, value: from, tint: null, predicted: m, why: sceneWhy + " - no white balance (neutralising it would drain the objects)", sceneColor: true } : null;
  if (temp && sceneColor) { const out = { value: temp.value, tint: tint ? tint.value : null, predicted: tint ? tint.predicted : temp.predicted, why: sceneWhy + ": partly neutralised, temperature " + round(temp.value) + temp.note + (tint ? "; tint " + round(tint.value) : ""), sceneColor: true, partial: true }; return out; }
  const why = [];
  if (temp) why.push(mixed ? "mixed light (whites " + (whites > 0 ? "blue" : "warm") + " by " + round(Math.abs(whites)) + ", blacks " + (blacks > 0 ? "blue" : "warm") + " by " + round(Math.abs(blacks)) + "): temperature " + round(temp.value) + " splits the difference, the pads take each end" + temp.note
    : "whites and blacks both " + (whites > 0 ? "blue" : "warm") + " (" + round(whites) + " / " + round(blacks) + "): temperature " + round(temp.value) + temp.note);
  if (tint) why.push("whites " + (whitesG > 0 ? "green" : "magenta") + " by " + round(Math.abs(whitesG)) + ": tint " + round(tint.value) + tint.note);
  return { ...provenance, value: temp ? temp.value : from, tint: tint ? tint.value : null, predicted: tint ? tint.predicted : afterTemp, why: why.join("; ") };
}

// The cast at the parade's BOTTOM, lined up per channel on the RGB curves instead of with the Shadows
// wheel. This is the colorist's black balance - watch the parade, bring the channel bottoms level - and
// per-channel curves sit near the top of the accepted hierarchy ("Primaries, Custom curves, Hue vs Hue
// curves, HSL qualifier" - Cullen Kelly). It differs from the manual version in one way, deliberately: a
// colorist has lift/offset and can move a channel either way, while this only ever moves the high channels
// DOWN onto the lowest. Lifting one would raise the black point the curve is about to set, and on the
// frame below red's bottom sitting 13 above blue's IS the cast - taking it out is not crushing red.
//
// Measured 2026-09-17 on C229 @9.42s, the owner's own 00:00:09:10 proof frame. Uncorrected, its paired
// black levels are R 21.6 / G 13.3 / B 8.6 - warm by 13. The pass answered with a Shadows pad at 204°, ran
// it to its 0.3 cap, spent both corrections on it (0.27 -> 0.4 -> 0.34), and finished at R 5.5 / G 8.2 /
// B 10.6: blue by 5.1, sign flipped, with 0.48% of red driven onto the floor. Its own verdict line read
// "blacks blue by 6.3 (Shadows wheel)". THE PASS WAS THE AUTHOR OF THE BLUE BLACKS.
//
// A wheel is a hue-and-saturation rotation of a whole tonal range: it cancels warm by ADDING BLUE, which
// lifts blue's floor, and cannot lower red without dragging the range with it. A channel toe lowers one
// channel and touches nothing else - measured isolated to the digit (`channelToe`: pairedRed and
// pairedGreen identical across six rows while blue moved 7.8 -> 0) and accurate to 0.15 IRE.
const TOE_MARGIN = 2; // measured (`channelToe._crushCap`): blue's own p1 at 2.7 left 0.02% on the floor, at 0.4 left 0.91%
function bottomsFor(m, current = null, pixels = null) {
  let px = PIXELS.context(pixels);
  if (px) m = PIXELS.readingFor(px, m);
  const f = frameOf(m);
  const lv = f.bands && f.bands.blacks && f.bands.blacks.levels;
  if (!lv || !isFinite(lv.red) || !isFinite(lv.green) || !isFinite(lv.blue)) return null;
  const floor = Math.min(lv.red, lv.green, lv.blue);
  const spread = Math.max(lv.red, lv.green, lv.blue) - floor;
  if (spread <= NEUTRAL) return null;
  // Over COLORED the bottom is an object's own color, not the light - the same call padsFor makes, and the
  // same answer: half of it comes out, the rest is the object's and is reported. Pulling a channel all the
  // way down on a saturated dark surface drains it (C228's blue cloth, 01:00).
  const scene = spread > COLORED;
  // The cap on a TOE is the channel's own p1: at x = 0.05 blue's paired bottom was a healthy 3.1 while its
  // own p1 was 0.4 and 0.91% of the frame had gone to the floor. The margin is not just the crush margin -
  // the Master curve has to set the black point AFTER this, and levelsFor needs floorCap >= 0.02, i.e. a
  // channel floor of at least FLOOR_MIN + 2. The 17:59 run is what taught this: red toed to its crush cap,
  // its own p1 landed on 2.0, floorCap came out 0.005 and NO black point was set at all.
  const MARGIN = Math.max(TOE_MARGIN, FLOOR_MIN + 2);
  const caps = {}; for (const ch of ["red", "green", "blue"]) caps[ch] = Math.max(0, (f[ch].p1 - MARGIN) / (100 - MARGIN));
  // WHERE the three should meet is solved, not assumed. Down-only forced it onto the lowest channel, which
  // is the most expensive choice for the highest one. A channel can only come down as far as its own cap
  // allows, so the meeting level is the lowest one EVERY channel can reach; anything sitting below it is
  // lifted up instead, which the sweep shows costs no floor at all (`channelLift._freeHeadroom`).
  const lowest = {}; for (const ch of ["red", "green", "blue"]) lowest[ch] = (lv[ch] - 100 * caps[ch]) / (1 - caps[ch]);
  const meet = Math.max(floor, lowest.red, lowest.green, lowest.blue);
  // An object's own color, not the light: only half of it comes out, so each channel goes half way to the
  // meeting level instead of all the way. Same call padsFor makes, same reason (C228's blue cloth, 01:00).
  const share = scene ? SCENE_SHARE : 1;
  const want = {}; for (const ch of ["red", "green", "blue"]) want[ch] = lv[ch] + (meet - lv[ch]) * share;
  if (px) {
    // 2026-09-18: keep the meeting level/half-colour policy above; choose only the writable AMOUNTS.
    // Channel maps are isolated, but paired-band membership is not. Each trial remeasures all pixels;
    // the final row states every remaining bottom error instead of claiming three scalar solves met.
    px = { ...px, targets: { ...(px.targets || {}), shadows: [want.blue - want.red, want.green - (want.red + want.blue) / 2] } };
    const moves = {}, rows = []; let state = m;
    for (const ch of ["red", "green", "blue"]) {
      const toe = lv[ch] > want[ch], op = toe ? "channelToe" : "channelLift";
      const r = PIXELS.choose({ pixels: px, reading: state, op, extra: ch, range: [0, toe ? Math.min(0.5, caps[ch]) : 0.5], // blackInFor/movesFor's existing .5 cap
        target: want[ch], readStat: (s) => frameOf(s).bands.blacks.levels[ch],
        // Meeting is a preceding policy decision (§5c of the brief). A lifted source black is
        // the NEXT stage's job: letting it veto these lifts silently changes the meeting rule.
        score: (s, d) => [PIXELS.bin(Math.abs(frameOf(s).bands.blacks.levels[ch] - want[ch]) - PIXELS.NOISE), ...objective(s, d, px.targets)],
        allow: allowance(damage(px.baseline)), discrete: true, rangeNote: toe ? "channel toe floor cap / serialization" : "channel lift cap / serialization" });
      const value = r.feasible ? r.value : 0;
      moves[ch] = { toe: toe ? value : 0, lift: toe ? 0 : value };
      if (r.feasible) { px = r.pixels; state = r.state; }
      rows.push({ channel: ch, value, note: r.note, evaluations: r.evaluations });
    }
    const curves = { ...(current || {}) };
    for (const [ch, name] of [["red", "Red"], ["green", "Green"], ["blue", "Blue"]]) curves[name] = [[moves[ch].toe, moves[ch].lift], [1, 1]];
    const actual = frameOf(state).bands.blacks.levels;
    return { how: "pixels", pixels: px, curves, toes: moves, meet: Math.round(meet * 10) / 10, predicted: state,
      targets: want, evaluations: rows.reduce((n, r) => n + r.evaluations, 0),
      needs: scene ? ["blacks: half of the scene's cast preserved by the frozen meeting targets"] : [],
      why: "pixels: meet at " + round(meet) + (scene ? "; half only, the rest is the scene's color" : "") + "; " +
        rows.map((r) => r.channel + " " + r.note).join("; ") + "; final paired bottoms " +
        ["red", "green", "blue"].map((ch) => ch + " " + round(actual[ch]) + " (target " + round(want[ch]) + ", residual " + round(actual[ch] - want[ch]) + ")").join(", ") };
  }
  const moves = movesFor(lv, caps, want);
  const moved = ["red", "green", "blue"].filter((ch) => moves[ch].toe > 0.002 || moves[ch].lift > 0.002);
  if (!moved.length) return null;
  const held = moved.filter((ch) => moves[ch].toe > 0 && moves[ch].toe >= caps[ch] - 1e-9);
  const lean = lv.blue > lv.red ? "blue" : "warm";
  // What the caps leave behind. MEASURED on C229 @9.57s (channelToeC229): paired R 21.2 against blue's
  // 8.2 needs x = 13/91.8 = 0.142 to meet, and the cap allows 0.107 - so the move lands red at 11.8 and
  // the frame stays 3.6 warm. The row said "red held at its own p1" but never said how much was left, and
  // a residual nobody states is a residual nobody corrects.
  const after = {}; for (const ch of ["red", "green", "blue"]) after[ch] = moves[ch].toe > 0 ? (lv[ch] - 100 * moves[ch].toe) / (1 - moves[ch].toe) : moves[ch].lift > 0 ? 100 * moves[ch].lift + lv[ch] * (1 - moves[ch].lift) : lv[ch];
  const left = Math.round((Math.max(after.red, after.green, after.blue) - Math.min(after.red, after.green, after.blue)) * 10) / 10;
  const say = (ch) => ch + (moves[ch].toe > 0.002 ? " down " + moves[ch].toe.toFixed(3) : " up " + moves[ch].lift.toFixed(3));
  return {
    how: "table", curves: neutralBottoms(current, lv, caps, want), toes: moves, meet: Math.round(meet * 10) / 10, predicted: predictBottoms(m, moves),
    needs: scene ? ["blacks " + lean + " by " + round(Math.abs(lv.blue - lv.red)) + ": at this size much of it is the scene's own color - half of it taken out, the rest is the objects"] : [],
    why: "blacks " + lean + " by " + round(Math.abs(lv.blue - lv.red)) + " (paired R " + round(lv.red) + " G " + round(lv.green) + " B " + round(lv.blue) + ")" +
      " → meet at " + round(meet) + ": " + moved.map(say).join(", ") + (scene ? "; half only, the rest is the scene's color" : "") +
      (held.length ? "; " + held.join(" and ") + " held at its own p1" + (left > 0.2 ? ", leaving the bottoms " + left + " apart" : " (the lift closes the rest)") : ""),
  };
}

// The cast left at the parade's TOP after white balance, neutralised with the Highlights wheel PAD, solved
// by inverting the wheel's calibrated response. No channel toe reaches the top, so the wheel keeps this
// end - and it is not where the trouble was: the same run that flipped the blacks left the whites at
// B-R -0.8. The wheel's luma slider stays where it is - the tonal work is the sliders' job, and a wheel
// luma pinned at its end is the wrong tool showing. `current` is where the pads are.
// The black point the Master curve could NOT reach, taken with the Shadows wheel's luma - Lumetri's Lift.
//
// The two controls are opposites, which is the point of having both (`shadowsWheelLuma`, swept on C220
// @0.5s 2026-09-17):
//   Master curve toe   holds the midtones (pinned at the median and at 0.8) and CLIPS: x=0.05 buys luma
//                      p1 8.2 -> 3.9 and puts 0.89% of blue on the floor.
//   Shadows wheel luma spares the shadows and DRAGS the midtones: 0.4 buys 8.2 -> 4.7 for 0.04% on the
//                      floor - about twenty times cheaper - but takes the median with it, near enough
//                      point for point (the 2026-09-15 `wheels` block: p50 41.6 -> 38.4 at luma 0.4).
// So the curve goes first, as far as its floor cap allows, and the wheel takes only what is left. On the
// ten clips of the 19:24 run that already reached target this changes nothing; on the four that printed
// "black point read X and left there: the lowest channel has no room under it" it is the difference
// between reporting a miss and closing it. Clipping cannot be undone, a dragged median can - Contrast and
// Shadows run after this.
//
// Interpolated from the swept rows, not fitted: six points, and the response tapers below 0.35. The
// slider is an OFFSET, so what transfers to another frame is how much it SUBTRACTS, not where it lands.
//
// TRANSFER, measured once (shadowsWheelLumaC187): this table is keyed on C220's luma p1 and it
// UNDER-states the offset on another picture - across 0.5 -> 0.25 luma p1 falls 6.6 on C220 and 9.4 on
// C187. So asking for N points of black point tends to deliver a little MORE than N, about 10% at the
// shallow end and up to 40% at the extreme. That direction is an overshoot, not a shortfall, which is why
// the floor cap below is not the only protection: the confirm render reads the real black point and the
// row's chain prints predicted against read, so an overshoot shows up as MODEL OFF BY rather than hiding.
// The paired bottoms transfer far better than luma p1 does (-6..-10 on both frames), which says luma p1
// is the wrong key and a paired-level key would be the better model. Not changed yet - one second frame
// is an observation, not a fit.
const WHEEL_LUMA_P1 = [[0.5, 8.2], [0.45, 6.3], [0.4, 4.7], [0.35, 3.1], [0.3, 2.4], [0.25, 1.6]];
const WHEEL_LUMA_FLOOR = 0.3; // under this the sweep starts putting blue on the floor (0.15% at 0.3, 0.35% at 0.25)
const wheelLumaP1 = (l) => {
  const t = WHEEL_LUMA_P1;
  if (l >= t[0][0]) return t[0][1];
  if (l <= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 0; i < t.length - 1; i++) { const [x0, y0] = t[i], [x1, y1] = t[i + 1]; if (l <= x0 && l >= x1) return y0 + (y1 - y0) * (x0 - l) / (x0 - x1); }
  return t[t.length - 1][1];
};
const wheelLumaOffset = (l) => WHEEL_LUMA_P1[0][1] - wheelLumaP1(l);
function shadowsLiftFor(m, current = null, target = BLACK_POINT[1] - 1, pixels = null) {
  const px = PIXELS.context(pixels);
  if (px) m = PIXELS.readingFor(px, m);
  const f = frameOf(m);
  const bp = f.luma.p1;
  if (!(bp > ACCEPT.blackMax)) return null;
  const want = bp - target;
  // 2026-09-18 16:40: chosen on pixels when the sample is there. The wheel luma has a measured pixel form
  // (`shadowsWheelLumaForm`, OPS.shadowsWheelLuma) - the same bump family as the Shadows slider - so the
  // luma is picked by trying positions on the frame's own pixels, and the pixel context CARRIES the move
  // instead of being dropped. On the chooser's third live run every MODEL OFF BY above 1.2 sat on a clip
  // whose chain had this step, because the step used to end pixel choice for everything after it. The
  // channel-floor guard below is kept as the constraint; the WHEEL_LUMA_P1 table stays as the fallback.
  if (px) {
    const WHEEL_FLOOR_PX = 0.5;
    const r = PIXELS.choose({ pixels: px, reading: m, op: "shadowsWheelLuma", from: 0.5, range: [WHEEL_LUMA_FLOOR, 0.5],
      target, readStat: STATISTICS.blackPoint, allow: allowance(damage(px.baseline)),
      score: (s, d) => candidateScore(s, d, STATISTICS.blackPoint, target, px.targets),
      constraint: (s) => channelFloor(s) < WHEEL_FLOOR_PX && channelFloor(m) >= WHEEL_FLOOR_PX ? "channel floor " + WHEEL_FLOOR_PX : null,
      rangeNote: "wheel luma floor " + WHEEL_LUMA_FLOOR + " / serialization" });
    if (!r.feasible || r.value >= 0.5 - 0.005) return null;
    const luma = Math.round(r.value * 1000) / 1000;
    const wheels = Object.assign({}, current || {});
    wheels.shadows = Object.assign({ hue: 0, sat: 0 }, wheels.shadows || {}, { luma });
    const after = frameOf(r.state).luma.p1;
    return { how: "pixels", pixels: r.pixels, wheels, luma, offset: round(bp - after), predicted: r.state, evaluations: r.evaluations,
      why: "black point " + round(bp) + " → " + round(after) + " with the Shadows wheel's luma at " + luma.toFixed(3) + " (" + r.note + ")" };
  }
  // An offset takes every channel down by the same amount, so the lowest channel decides how far it can go
  // - exactly the guard the curve has. Without it the dry run on C229 (red's own p1 already at 3.5 after
  // the black balance) asked for an offset of 5.58 and put red at 0.
  //
  // This is deliberately conservative, and the reason is worth knowing: the sweep says the wheel barely
  // floors anything in its whole range (blue 0.01% at neutral, still only 0.35% at 0.25), so its bottom is
  // SOFT and a straight offset overstates the damage. But that was measured on a frame whose lowest
  // channel started at 4.7. How it behaves when a channel is already near zero is NOT measured, and
  // guessing the second half is what got two changes reverted. Cap by the arithmetic until a frame with a
  // low channel has been swept.
  // How far down the lowest channel may go. FLOOR_MIN (1.5) is the guard for knobs that TRANSLATE; this
  // one compresses toward the floor instead, measured on two frames now: C220 took blue's own p1 4.7 ->
  // 0.4 for 0.35% on the floor, and C187 took it 10.6 -> 2.4 for 0.01%, with red and green flat at 0 all
  // the way. Both are well inside GUARD.crushed (1%). So the channel may be taken to 0.5 rather than 1.5 -
  // still conservative, since the offset is applied 1:1 to the channel p1 below while the measurements
  // show the channel moving LESS than the offset does (blue fell 4.3 for an offset of 6.6 on C220).
  const WHEEL_FLOOR = 0.5;
  const room = Math.max(0, Math.min(f.red.p1, f.green.p1, f.blue.p1) - WHEEL_FLOOR);
  const reach = Math.min(want, room);
  if (reach < 0.5) return null;
  let luma = 0.5;
  for (let l = 0.5; l >= WHEEL_LUMA_FLOOR - 1e-9; l -= 0.005) { luma = Math.round(l * 1000) / 1000; if (wheelLumaOffset(luma) >= reach) break; }
  if (0.5 - luma < 0.01) return null;
  const got = Math.min(wheelLumaOffset(luma), reach);
  const predicted = JSON.parse(JSON.stringify(m));
  for (const g of [predicted, predicted.frame].filter(Boolean)) {
    if (g.luma) { g.luma.p1 = Math.max(0, round(g.luma.p1 - got)); if (isFinite(g.luma.p50)) g.luma.p50 = round(g.luma.p50 - got * 0.9); }
    for (const ch of ["red", "green", "blue"]) if (g[ch]) g[ch].p1 = Math.max(0, round(g[ch].p1 - got));
    const lv = g.bands && g.bands.blacks && g.bands.blacks.levels;
    if (lv) for (const ch of ["red", "green", "blue"]) if (isFinite(lv[ch])) lv[ch] = Math.max(0, round(lv[ch] - got));
  }
  const wheels = Object.assign({}, current || {});
  wheels.shadows = Object.assign({ hue: 0, sat: 0 }, wheels.shadows || {}, { luma });
  return { how: "table", wheels, luma, offset: round(got), predicted,
    why: "black point " + round(bp) + " → " + round(bp - got) + " with the Shadows wheel's luma at " + luma.toFixed(3) +
      " (the curve had no room left; a lift clips about 20x less than a toe, at roughly a point of median each)" +
      (got < want - 0.2 ? (room < want ? "; only " + round(got) + " of " + round(want) + " - the lowest channel has no more room under it" : "; as far as the wheel goes before it crushes too") : "") };
}

function padsFor(m, current = null) {
  const f = frameOf(m), now = current || {}, wheels = {}, needs = [], targets = {};
  for (const [wheel, label] of [["highlights", "whites"]]) {
    const cast = castAt(f, wheel);
    if (Math.hypot(cast[0], cast[1]) <= NEUTRAL) continue;
    // A parade end this far off neutral after the white balance is an object's color, not the light:
    // a pad can only part-neutralise it and tints whatever the curve crushed under it (C187, 21:37: a
    // 0.45 cyan pad on a red-orange surface, a flat blue floor in the parade). No pad; said out loud.
    // 23:12: "left alone" read as an orange picture to the owner (a wire ring on a warm table, whites
    // neutral, blacks warm by 25). Half of it comes out, the floor guard below still holds the channels.
    const scene = Math.hypot(cast[0], cast[1]) > COLORED;
    if (scene) needs.push(label + " " + (cast[0] > 0 ? "blue" : "warm") + " by " + round(Math.abs(cast[0])) + " after the white balance: at this size much of it is the scene's own color - half of it taken out, the rest is the objects");
    // The cast this pad AIMS AT, frozen here from the reading as it stands. A scene-coloured end keeps
    // (1 - SCENE_SHARE) of its cast on purpose, so the target is not neutral - and the correction pass has
    // to be told, because left to itself it solves for 0 and drains the very half this rule preserves.
    targets[wheel] = scene ? [cast[0] * (1 - SCENE_SHARE), cast[1] * (1 - SCENE_SHARE)] : [0, 0];
    const r = solveCast(wheel, scene ? [-cast[0] * SCENE_SHARE, -cast[1] * SCENE_SHARE] : [-cast[0], -cast[1]]);
    if (!r) continue;
    const w = { ...(now[wheel] || { hue: 0, sat: 0, luma: 0.5 }), why: [] };
    const cx = w.sat * Math.cos(w.hue * Math.PI / 180) + r.sat * Math.cos(r.hue * Math.PI / 180);
    const cy = w.sat * Math.sin(w.hue * Math.PI / 180) + r.sat * Math.sin(r.hue * Math.PI / 180);
    w.sat = Math.min(MAX_SAT, Math.hypot(cx, cy)); w.hue = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
    // A Shadows pad that pulls red out of warm shadows can put red on the floor: scale it back until the
    // predicted channel bottoms stay off it.
    let floored = false;
    while (wheel === "shadows" && w.sat > 0.02 && channelFloor(m) >= FLOOR_MIN && channelFloor(predictPads(m, { [wheel]: w }, now)) < FLOOR_MIN) { w.sat *= 0.8; floored = true; }
    if (floored) w.why.push("held back: further would put a channel on the floor");
    w.why.push(label + " " + (cast[0] > 0 ? "blue" : "warm") + " by " + round(cast[0]) + (Math.abs(cast[1]) > NEUTRAL ? (cast[1] > 0 ? ", green" : ", magenta") + " by " + round(Math.abs(cast[1])) : "") + " → pad " + round(w.hue) + "° sat " + (Math.round(w.sat * 100) / 100) + (r.capped ? " (capped at " + MAX_SAT + ")" : ""));
    if (r.capped) needs.push(label + " cast " + round(Math.hypot(cast[0], cast[1])) + " is more than the pad model covers (" + MAX_SAT + "): the rest is reported, not chased");
    wheels[wheel] = w;
  }
  return { wheels, needs, targets };
}

// The black point, set EXACTLY with the Master curve's bottom point - a levels move, output = (in - x)
// / (1 - x), measured to within the toe's softness (src/curves.cjs). Solved on the balanced frame,
// written before the sliders, which are then solved on the state it predicts. An automatic pass stops
// at x = 0.25: a black point above ~28 is not a lifted black, it is a picture with no black in it.
const LEVELS_CAP = 0.25;
// The curve is pinned at the frame's median (kept inside 0.3..0.6) and at 0.8, so the move is a toe
// pull, not a global stretch: the midtones and the top stay where they are.
// `asRead` is the frame as read, before any predicted move: the colored-surface test must see the
// footage, not the state after a predicted pad has been subtracted from it (21:37: C227 and C187 got a
// curve because the predicted-after-pads cast was under 20).
function levelsFor(m, current = null, asRead = null, pixels = null) {
  const px = PIXELS.context(pixels);
  if (px) m = PIXELS.readingFor(px, m);
  const f = frameOf(m);
  const bp = f.luma.p1;
  if (!(bp > ACCEPT.blackMax)) return null;
  // The darkest pixels of a colored surface (a red-orange object in shadow: B-R -20 and more) are not a
  // black to be put at 4: a master curve cannot lower a luma that comes from one channel without crushing
  // the other two (C187, 21:26 - green and blue on the floor, red untouched, then the pad tinted the floor
  // blue). Until 19:40 that meant no curve at all, and C187 stayed at a black point of 23.5 and read flat
  // (the owner's parade: blue's bottom at 10, red's at 28, nothing under 10). The floor cap below is the
  // real protection - the bottom point never passes the lowest channel - so a colored bottom is now pulled
  // as far as that allows and no further, and the row says so.
  const cast = castAt(frameOf(asRead || m), "shadows");
  const colored = Math.hypot(cast[0], cast[1]) > COLORED;
  const target = BLACK_POINT[1] - 1;
  const anchor = Math.max(0.3, Math.min(0.6, f.luma.p50 / 100));
  const want = blackInFor(bp, target, anchor);
  // The bottom point maps every channel, so it cannot pass the lowest channel bottom of the state it is
  // written on: after a cyan pad has taken red at the bottom to 3, a curve at 0.13 puts it at 0 (C220,
  // 21:43 - restored by the guard every run). x <= (lowest channel p1 - margin); under 0.02 is no curve.
  const floorCap = Math.max(0, (channelFloor(m) - FLOOR_MIN) / 100);
  if (px) {
    const pin = Number(anchor.toFixed(2)); // curves.format rounds the anchor too; evaluate that spline.
    const r = PIXELS.choose({ pixels: px, reading: m, op: "masterToeAnchored", extra: pin,
      range: [0, Math.min(LEVELS_CAP, floorCap)], target, readStat: STATISTICS.blackPoint,
      score: (s, d) => candidateScore(s, d, STATISTICS.blackPoint, target, px.targets),
      constraint: (s, v) => v > 0 && v < 0.02 ? "below the existing 0.02 minimum curve move" : null,
      allow: allowance(damage(px.baseline)), discrete: true, rangeNote: "lowest channel floor cap / levels cap / serialization" });
    const blackIn = r.feasible ? r.value : 0;
    return { how: "pixels", held: blackIn < 0.02, blackIn, anchor: pin, target, curves: blackIn < 0.02 ? current : levels(blackIn, 1, current, pin),
      predicted: r.feasible ? r.state : m, pixels: r.feasible ? r.pixels : px, evaluations: r.evaluations,
      why: r.note + "; pinned at " + pin.toFixed(2) + (colored ? "; colored bottom, frozen policy unchanged" : "") };
  }
  const blackIn = Math.min(LEVELS_CAP, want, floorCap);
  if (blackIn < 0.02) return null;
  return {
    how: "table", blackIn, anchor, target, curves: levels(blackIn, 1, current, anchor), predicted: predictLevels(m, blackIn, 1, anchor),
    why: "black point " + round(bp) + " → " + target + ": curve bottom point at " + blackIn.toFixed(2) + ", pinned at " + anchor.toFixed(2) + (colored ? " (a colored bottom: only as far as its lowest channel allows)" : "") + (want > blackIn ? (floorCap < want && floorCap <= LEVELS_CAP ? " (held at the lowest channel bottom: further would put a channel on the floor)" : " (capped at " + LEVELS_CAP + ")") : ""),
  };
}

// The tonal sliders for one shot, on the balanced frame, plus the things it needs that the panel
// cannot drive yet (`needs`). `region` is what was measured for the subject; the tonal ends always
// read the frame. Each goal is solved on the state predicted after the goals before it (planShot).
function goalsFor(m, region = "frame") {
  const goals = [], needs = [];
  const f = frameOf(m);

  // 1. A face is exposed for its skin: the one canonical brightness band. Exposure is a gain on the
  //    whole picture and is used for nothing else - a frame whose brightest thing is a mid-grey wall
  //    has no white to put at 92, and two stops of gain to force one lifts the blacks with it.
  if (region === "face") {
    const luma = STATISTICS.brightness(m);
    if (luma < SKIN_LUMA[0] || luma > SKIN_LUMA[1]) goals.push({ param: "exposure", statistic: "brightness", target: luma < SKIN_LUMA[0] ? SKIN_LUMA[0] + 5 : SKIN_LUMA[1] - 5, why: "face luma " + round(luma) + " (40-70)" });
    const hue = STATISTICS.skinHue(m), sat = STATISTICS.saturation(m);
    if (hue < SKIN_HUE[0] || hue > SKIN_HUE[1]) needs.push("skin hue " + round(hue) + "° off the skin line (116-126): Midtones wheel");
    if (sat > SKIN_SAT[1]) needs.push("skin saturation " + round(sat) + "% (over the 20-50 band): Saturation");
    else if (sat < SKIN_SAT[0]) needs.push("skin saturation " + round(sat) + "% reads under the 20-50 band - pale skin sits low on the line legitimately, so this is a reading, not a fault; if it looks lifeless the tool is contrast in the skin's range, not saturation");
  }

  // 1b. A dark subject (a hand, a product) is lifted with Shadows - after the white point, on the
  //     state the sliders before it predict; the cap is the frame's black point.
  if (region === "subject" && m.frame && m.luma) {
    const luma = STATISTICS.brightness(m);
    // Shadows lifts every dark area: +51 on C220 (12:18) took the subject to 57 and the picture went flat
    // (the owner: "lost any dynamism"). The balance: never past +30, and scaled back while the frame's
    // spread would fall under the flat line or its black point past 8.
    if (luma < SUBJECT_DARK) goals.push({ param: "shadows", statistic: "brightness", target: SUBJECT_LUMA, cap: SUBJECT_SHADOWS_CAP, ceiling: (state) => { const f2 = frameOf(state); return f2.luma.p1 <= SUBJECT_BLACK_MAX && STATISTICS.spread(f2) >= SPREAD.flat; }, why: "subject luma " + round(luma) + " is dark where it matters → " + SUBJECT_LUMA + " with Shadows (≤ " + SUBJECT_SHADOWS_CAP + "; black point ≤ " + SUBJECT_BLACK_MAX + ", spread ≥ " + SPREAD.flat + ")" });
  }

  // 2. White point: Whites, then Highlights for what Whites leaves. Whites clips past about +50, so
  //    an automatic pass caps it there; Highlights (a bright-areas control that never clipped in its
  //    sweep, +100 = p99 75.7 -> 87.8) finishes, capped at 60 - a shot that needs more is a taste
  //    call (grade_shot), not a balance.
  // No fixed caps on Whites and Highlights (the owner, 22:50: "why are knobs reaching their cap?"): the
  // sliders run to 100, the model predicts the frame's white point and planShot stops a move at the
  // ceiling, and the guard backs off real clipping. A cap of 50 taken from one frame left C231 and
  // C233 at a white point of 80-85 with nothing clipping.
  const wp = f.luma.p99;
  const whiteLow = (state) => frameOf(state).luma.p99 < ACCEPT.whiteMin;
  // Fires within a point of the line too: C200 read 85.1, got no goal, and the curve left it at 84.7.
  if (wp < ACCEPT.whiteMin + 1) {
    goals.push({ param: "whites", statistic: "whitePoint", target: 92, why: "white point " + round(wp) + " → 92" });
    goals.push({ param: "highlights", statistic: "whitePoint", target: 92, onlyIf: whiteLow, why: "Highlights finishes what Whites leaves" });
  } else if (wp > ACCEPT.whiteMax) goals.push({ param: "whites", statistic: "whitePoint", target: 93, why: "white point " + round(wp) + " → 93" });

  // 3. Contrast, on the FRAME's spread, only when flat or harsh, never past +-60.
  const spread = STATISTICS.spread(f), body = STATISTICS.body(f);
  if (spread < SPREAD.flat || spread > SPREAD.harsh) goals.push({ param: "contrast", statistic: "spread", target: SPREAD.target, cap: 60, why: "frame spread " + round(spread) + " is " + (spread < SPREAD.flat ? "flat" : "harsh") });
  // Ends fine, middle compressed: the picture reads flat even though the black and white points are right.
  else if (body < SPREAD.bodyFlat) goals.push({ param: "contrast", statistic: "body", target: SPREAD.bodyTarget, cap: 40, why: "the ends are set (spread " + round(spread) + ") but the middle 80% of the picture spans only " + round(body) + ": it reads flat" });

  // 4. Black point: a LIFTED one is the curve's job (levelsFor, written before these sliders are
  //    solved), not a slider's - Blacks is a toe control and Shadows a dark-areas control, and which
  //    of them reaches a black point at 12 depends on what the darkest pixels are (the 20:05 run: the
  //    same move took one clip 12 -> 1 and the next 12 -> 10). Crushed blacks are still lifted by Blacks.
  const bp = f.luma.p1;
  if (f.crushed > 1 || bp < BLACK_POINT[0]) {
    goals.push({ param: "blacks", statistic: "blackPoint", target: BLACK_POINT[0] + 2, why: "blacks " + (f.crushed > 1 ? "crushed " + round(f.crushed) + "%" : "at " + round(bp)) + " → lifted to " + (BLACK_POINT[0] + 2) });
  }
  return Object.assign(goals, { needs, wheels: {} });
}

// After the confirm: balanced, or what is still off - in the canon's words. The same thresholds the
// goals use (ACCEPT), both cast axes the pads solve, and the spread the footer promises.
// A parade end's cast is only readable while that end still has pixels with all three channels off the
// rails: bands.*.rb drops any pixel with a channel at 0 or 255 (src/scopes.cjs). MEASURED on C187
// @22.02s (`curveToeC187`), and it is worse than blindness - the statistic RECOVERS as the picture is
// destroyed. Across the Master toe: readable 100 -> 86 -> 31 -> 1 -> 1 -> 6 -> 10 while blue's floor
// share goes 0 -> 0.43 -> 3.02 -> 10.96 -> 18.61 -> 27.76 -> 45.9, and the cast reads
// -29.8 -> -31 -> -32.2 -> -31 -> -13.7 -> -8.6 -> -6.7. Once blue is floored across half the dark pixels
// there is no blue left to differ from red, so the worst row in the sweep reports the CLEANEST cast and
// the highest readable of any damaged setting. Anything gating on a small cast waves it through.
//
// So the cast is trusted only while the end that produced it is intact: `readable` high AND that end's
// own damage share small. The thresholds are read off the same sweep - at 0.43% floored readable was
// still 86, at 3.02% it had fallen to 31.
// `readable` is the whole test, and the damage share is NOT a useful second condition - it was one until
// the C229 red-toe sweep separated them. Checked against eight rows across three frames, comparing the
// reported cast with the truth the paired LEVELS still carry:
//   readable >= 80 accepts exactly the accurate readings (error <= 1.9) and rejects every corrupt one.
//   a damage-share test rejects two ACCURATE readings (C229 red toe at 1.44% and 9.23% floored, both
//   within 0.5 of the truth) and accepts two CORRUPT ones (C187 Master at 0.15 and 0.35, off by 3.1 and
//   5.1 with almost nothing floored).
// The reason is that flooring a channel only corrupts the cast when it removes pixels from the BAND, and
// `readable` measures precisely that, while a frame-wide floor share does not. Keep the share for the
// message - it is informative - but never for the decision.
const CAST_READABLE = 80;   // percent of the band that still had a readable cast
function castTrust(f, wheel) {
  const b = f.bands && f.bands[wheel === "shadows" ? "blacks" : "whites"];
  // No bands block at all is a DIFFERENT case from a crushed one: castAt then falls back to the channel
  // percentiles, which is the older, cruder statistic but not a corrupted one. Leave that path alone -
  // this guard is about a band that WAS measured and has been destroyed.
  if (!b) return { readable: null, share: null, empty: false, noBands: true, trusted: true };
  const readable = isFinite(b.readable) ? b.readable : 100;
  const d = wheel === "shadows" ? f.floor : f.clipped;
  const share = d ? Math.max(d.red, d.green, d.blue) : 0;
  const empty = b.rb === null || b.rb === undefined;
  return { readable, share, empty, noBands: false, trusted: !empty && readable >= CAST_READABLE };
}

function verdict(after, region = "frame") {
  const notes = [], hints = [];
  const f = frameOf(after);
  if (f.luma.p1 > ACCEPT.blackMax) notes.push("black point " + round(f.luma.p1) + " lifted");
  if (f.luma.p99 < ACCEPT.whiteMin) notes.push("white point " + round(f.luma.p99) + " low");
  if (f.luma.p99 > ACCEPT.whiteMax) notes.push("white point " + round(f.luma.p99) + " near clipping");
  for (const [wheel, label] of [["shadows", "blacks"], ["highlights", "whites"]]) {
    // Never report a cast the reading cannot support, and never call a frame balanced on one. A crushed
    // end reads CLEANER than a damaged-but-intact one (see castTrust), so passing it through would rank
    // the most destroyed setting as the most neutral.
    const t = castTrust(f, wheel);
    if (!t.trusted) {
      notes.push(label + " cannot be read: " + (t.empty ? "no pixel at that end has all three channels off the rails"
        : "only " + t.readable + "% of the band has a readable cast" + (t.share > 0.01 ? " (" + round(t.share) + "% of the frame is " + (wheel === "shadows" ? "on the floor" : "at 255") + ")" : ""))
        + " — the cast statistic is not trustworthy here, and it reads cleaner the more is destroyed");
      continue;
    }
    const [rb, g] = castAt(f, wheel);
    if (Math.abs(rb) > NEUTRAL) notes.push(label + " " + (rb > 0 ? "blue" : "warm") + " by " + round(rb) + (wheel === "shadows" ? " (Shadows wheel)" : ""));
    if (Math.abs(g) > NEUTRAL) notes.push(label + " " + (g > 0 ? "green" : "magenta") + " by " + round(Math.abs(g)));
  }
  const spread = STATISTICS.spread(f), body = STATISTICS.body(f);
  if (spread < SPREAD.flat || spread > SPREAD.harsh) notes.push("spread " + round(spread) + " " + (spread < SPREAD.flat ? "flat" : "harsh"));
  else if (body < SPREAD.bodyFlat) notes.push("the middle of the picture spans only " + round(body) + " (ends are fine): reads flat");
  // The ends can be neutral while the middle is not: C198 @17.2 (the owner, 19:38, "she's too pink") ended
  // with whites 0.8 and blacks 4.7 and red above green and blue through the whole body of the parade. Named
  // here; the tool for it is the Midtones wheel, which has no calibration yet (What's Next 6).
  // 22:14: the band's median is the OBJECTS in the midtones - "warm by 53" was the oak, "34" the copper
  // pans - so it is a reading, not a verdict: it never fails the balance, and past COLORED it is the
  // scene and not said at all. Named in a hint, not a note, until a measure that separates a cast from
  // the objects exists (the midtone tint at the same luma across channels, judged on the subject).
  const mid = f.bands && f.bands.midtones;
  if (mid && mid.rb !== null && Math.max(Math.abs(mid.rb), Math.abs(mid.g)) > MIDTONE_CAST && Math.max(Math.abs(mid.rb), Math.abs(mid.g)) <= COLORED) hints.push("midtones " + (Math.abs(mid.rb) > MIDTONE_CAST ? (mid.rb > 0 ? "blue" : "warm") + " by " + round(Math.abs(mid.rb)) : "") + (Math.abs(mid.rb) > MIDTONE_CAST && Math.abs(mid.g) > MIDTONE_CAST ? ", " : "") + (Math.abs(mid.g) > MIDTONE_CAST ? (mid.g > 0 ? "green" : "magenta") + " by " + round(Math.abs(mid.g)) : "") + " (a reading of the middle band, objects included; not judged)");
  const clipped = Math.max(f.clipped.red, f.clipped.green, f.clipped.blue);
  if (clipped > 0.5) notes.push("clipped " + round(clipped) + "%");
  if (f.crushed > 1) notes.push("crushed " + round(f.crushed) + "%");
  if (region === "face") {
    const luma = STATISTICS.brightness(after), hue = STATISTICS.skinHue(after);
    if (luma < SKIN_LUMA[0] || luma > SKIN_LUMA[1]) notes.push("face luma " + round(luma) + " outside 40-70");
    if (hue < SKIN_HUE[0] || hue > SKIN_HUE[1]) notes.push("skin hue " + round(hue) + "° off the line");
  }
  if (region === "subject" && after.frame && after.luma && STATISTICS.brightness(after) < SUBJECT_DARK) notes.push("subject luma " + round(STATISTICS.brightness(after)) + " dark where it matters (under " + SUBJECT_DARK + ")");
  return { balanced: !notes.length, notes, hints };
}

// The colorists' cleanup, after the balance: saturation rolled off in the deepest shadows and the
// near-whites on Luma vs Sat. Never on a colored end (a parade end more than COLORED off neutral is an
// object's color, and rolling its saturation off drains it); a clip already carrying a Luma vs Sat
// curve keeps it. `current` is the curve as read (points). null = nothing to write.
function satCurveFor(m, current = null) {
  if (current && current.length) return null;
  const f = frameOf(m);
  const colored = (wheel) => { const c = castAt(f, wheel); return Math.hypot(c[0], c[1]) > COLORED; };
  const shadows = !colored("shadows"), whites = !colored("highlights");
  const points = satRolloff({ shadows, whites });
  if (!points) return null;
  const ends = shadows && whites ? "shadows and whites" : shadows ? "shadows only (whites are the scene's color)" : "whites only (blacks are the scene's color)";
  return { points, why: ends + " rolled off by " + ROLLOFF_DEPTH + " (Luma vs Sat)" };
}

// Skin, inside an HSL Secondary key (2026-09-16): the keyed pixels' hue onto the vectorscope's skin
// line with the key's own Midtones color wheel (a rotation of the keyed color; HSL Tint was a magenta
// wash over every keyed pixel - the owner, 12:21), their saturation into the canon's band with HSL
// Saturation. `m` is the measurement of the skin pixels (Vision's hand or face box on the confirmed
// render); `from.saturation` is where that knob is. null = already on the line.
//
// The wheel, measured 12:54 on C227's hands inside their key: the Midtones pad at saturation 0.25 on
// 0 / 90 / 180 / 270 deg moved the keyed mean (Cb, Cr) by (-0.3, +1.3) (-0.8, -0.3) (0, -0.9) (+0.8, +0.7)
// on the -50..50 scale: 0 deg is red (+Cr), 90 deg yellow (-Cb), a linear wheel under 2 points a channel.
// Per unit of pad saturation, with x = sat cos(hue), y = sat sin(hue): [dCb, dCr] = HSL_PAD.m · [x, y].
// That key was the thin eyedropper one (3-4% of the frame): on the pass's own keys, which cover the hand,
// the first live run (14:12) rotated 2.5-3x further per unit of pad on every clip (C223 0.23 for -5.7 deg
// got -14.5; C209 0.39 for -8.2 got -24), so the matrix is scaled by 2.5; the confirm's secant covers the rest.
// ponytail: one 2x2 from one key; the pad is absolute from neutral (the skin step never runs on a matched
// cut) - add `from.pad` if a second pass ever has to build on a first.
// Cap 0.3, not 0.6: at the cap, on a key that had caught only the rims of two hands, those rims went
// bright pink (the owner's mask screenshot, 14:50). A balance is not a look here either.
const HSL_PAD = { m: [[-1.5, -8.0], [11.0, -5.0]], cap: 0.3 };
// HSL Saturation inside a key: a straight gain (0.8 per 100 points, measured 14:12), and it is only ever
// allowed DOWN. Saturation 198 on a hand at 14 made it bright pink (the owner's screenshot, 14:45):
// amplifying a pale hand amplifies whatever tint it carries, and pale skin is an exposure and white-balance
// problem, not a saturation one. Under the band is reported, never boosted; over it is pulled back.
const HSL_SAT_GAIN = 0.8, HSL_SAT_RANGE = [50, 100];
const SKIN_SAT_TARGET = 25, SKIN_SAT_TOL = 3, SKIN_HUE_TARGET = SKIN_HUE_TARGET_LO;
const skinTargetFor = (hue) => (hue < SKIN_HUE[0] ? SKIN_HUE_TARGET_LO : SKIN_HUE_TARGET_HI);
// `attenuation` (0.25..1, from skin.cjs attenuationFor) is the spill rule: a key that also lights the room
// is usable, but not at full strength, because the wood and the cabinets swing with the skin. The comment
// above attenuationFor spells out the intent - "the spill scales the correction instead of vetoing it" -
// and it was NOT IN FORCE: panel.js passed key.attenuation as a third argument to a function that declared
// two, so JavaScript dropped it silently and every skin move ran at full strength through a leaky key.
// Found 2026-09-17 while mapping the controls. Restoring documented intent rather than inventing a model,
// and it can only ever REDUCE a move, which is the safe direction; the confirm still reads what happened.
function skinFor(m, from = { saturation: 100 }, attenuation = 1) {
  const att = isFinite(attenuation) && attenuation > 0 && attenuation <= 1 ? attenuation : 1;
  const hue = STATISTICS.skinHue(m), sat = STATISTICS.saturation(m);
  // Saturation gets a margin: the knob reaches 3 points on a hand at full slider (its sweep), so a 1-point
  // shortfall is not worth Saturation 200.
  const hueOff = hue < SKIN_HUE[0] || hue > SKIN_HUE[1], satOff = sat < SKIN_SAT[0] - SKIN_SAT_TOL || sat > SKIN_SAT[1] + SKIN_SAT_TOL;
  if (!hueOff && !satOff) return null;
  const out = { pad: null, saturation: null, why: [], predicted: m };
  let state = m;
  if (satOff && sat > SKIN_SAT[1]) {
    const v = Math.max(HSL_SAT_RANGE[0], Math.min(HSL_SAT_RANGE[1], 100 + ((SKIN_SAT[1] - 5) / Math.max(1, sat) - 1) / HSL_SAT_GAIN * 100));
    // Attenuated toward neutral (100): a leaky key desaturates the room along with the hand.
    out.saturation = Math.round((100 + (v - 100) * att) * 100) / 100;
    const satPredicted = sat * (1 + HSL_SAT_GAIN * (out.saturation - 100) / 100);
    state = { ...m, saturation: { ...m.saturation, p50: satPredicted } };
    out.why.push("saturation " + round(sat) + " → " + round(out.saturation) + (v === HSL_SAT_RANGE[0] ? " (as far as it goes: " + round(satPredicted) + ")" : "") + (att < 1 ? "; scaled to " + Math.round(att * 100) + "% - the key lights more than its subject" : ""));
  } else if (satOff) out.why.push("saturation " + round(sat) + " is under the band: left alone (boosting a pale hand only amplifies its tint)");
  // The pad is decided on the MEASURED hue (14:12: C222's pad was skipped because the saturation sweep's
  // predicted cast put the hue in the band; the render said 136.9 deg).
  const hueNow = hue;
  if (hueNow < SKIN_HUE[0] || hueNow > SKIN_HUE[1]) {
    // The same radius at the target angle; the pad that moves (Cb, Cr) there is the inverse of the wheel.
    const r = Math.hypot(state.cast.cb, state.cast.cr), t = skinTargetFor(hueNow) * Math.PI / 180;
    const d = [r * Math.cos(t) - state.cast.cb, r * Math.sin(t) - state.cast.cr];
    const [[a, b], [c, e]] = HSL_PAD.m, det = a * e - b * c;
    let x = (e * d[0] - b * d[1]) / det, y = (a * d[1] - c * d[0]) / det, padSat = Math.hypot(x, y), partial = false;
    if (padSat > HSL_PAD.cap) { partial = true; x *= HSL_PAD.cap / padSat; y *= HSL_PAD.cap / padSat; padSat = HSL_PAD.cap; }
    if (att < 1) { x *= att; y *= att; padSat *= att; }
    let padHue = Math.atan2(y, x) * 180 / Math.PI; if (padHue < 0) padHue += 360;
    out.pad = { hue: Math.round(padHue * 10) / 10, sat: Math.round(padSat * 1000) / 1000 };
    state = { ...state, cast: { cb: state.cast.cb + a * x + b * y, cr: state.cast.cr + c * x + e * y } };
    out.why.push("hue " + round(hueNow) + "° → Midtones pad " + round(padHue) + "°/" + padSat.toFixed(2) + (partial ? " (as far as the pad goes: " + round(STATISTICS.skinHue(state)) + "°)" : "") + (att < 1 ? "; scaled to " + Math.round(att * 100) + "% - the key lights more than its subject" : ""));
  }
  if (out.pad === null && out.saturation === null) return null;
  if (out.pad === null) out.why.length = out.why.length; // saturation-only is a real move; a why-only result is not
  out.predicted = state;
  return out;
}

const round = (n) => Math.round(Number(n) * 10) / 10;

module.exports = { objective, candidateScore, balanceAxis, looksLikeLog, LOG_SIGNATURE, skinFor, temperatureFor, bottomsFor, TOE_MARGIN, shadowsLiftFor, WHEEL_LUMA_FLOOR, padsFor, levelsFor, goalsFor, satCurveFor, verdict, castTrust, CAST_READABLE, ACCEPT, BLACK_POINT, WHITE_POINT, SKIN_LUMA, SKIN_HUE, SKIN_SAT, SKIN_HUE_TARGET, SKIN_SAT_TARGET, skinTargetFor, HSL_PAD, HSL_SAT_RANGE, SPREAD, TEMPERATURE_CAP, BLACKS_REACH, LEVELS_CAP, NEUTRAL, FLOOR_MIN };
