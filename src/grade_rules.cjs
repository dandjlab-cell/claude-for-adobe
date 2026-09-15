// What to do to a shot, decided from its scopes by rule - the colourist canon, not invented numbers.
//
// The order and the targets are the industry's (Van Hurkman, Eagles, the broadcast conventions the
// scopes were built for; sources in the colour skill): white balance the shot, set the black point and
// the white point, neutralise what is left of the casts by lining the parade up - blacks with the
// Shadows wheel, whites with the Highlights wheel - then saturation, then skin onto the vectorscope's
// skin line. Midtones of a product or a hand have no canonical number and are left to taste; only a
// face has a band.
//
// Why the balance is solved BEFORE the tonal sliders here, when a colourist sets the black point first:
// the pad model reads the parade's bottoms, and once Blacks has put the black point at 4 a warm
// bottom's blue channel is on the floor - the pad's response is then clamped, not linear. Read the casts
// where there is room (the frame as shot), cancel them, then move the ends with the tonal sliders,
// which are equal-channel operations. Equal-channel is not "cannot tint" - three independently taken
// percentiles need not be the same pixels - which is why the confirm reads the casts again.
"use strict";
const { STATISTICS } = require("./grade.cjs");
const { solveKnob, predict } = require("./grade_model.cjs");
const { castAt, solveCast, MAX_SAT } = require("./wheels.cjs");
const { levels, blackInFor, predictLevels } = require("./curves.cjs");

const BLACK_POINT = [0, 5];      // luma p1 of the FRAME: sits here, not crushed flat
const WHITE_POINT = [88, 95];    // luma p99 of the FRAME: 90-95 with nothing true white; never clipped
// What the panel ACCEPTS as balanced - the canon's bands with the tolerance one render's reading has.
// One predicate for the goals, the verdict and the printed footer, so they cannot disagree.
const ACCEPT = { blackMax: BLACK_POINT[1] + 1, whiteMin: WHITE_POINT[0] - 3, whiteMax: WHITE_POINT[1] };
const SKIN_LUMA = [40, 70];      // a face: light skin 60-70, dark skin 40-60; alive around 60-65
const SKIN_HUE = [116, 126];     // the vectorscope skin line, 123 at centre
const SKIN_SAT = [20, 50];       // percent of the vectorscope radius; ~30 reads natural on Rec.709
// harsh was 85 - which the targets themselves exceed (black 4, white 92 = 88), so Contrast -60 fired on
// five clips of the 21:05 run and lifted the black points the curve had just set. Harsh is past the
// canon's own range.
const SPREAD = { flat: 55, harsh: 93, target: 70 };
const NEUTRAL = 1.5;             // parade ends within this of each other are neutral
const TEMPERATURE_CAP = 50;      // a balance is not a look: half the slider
const PAD_REACH = 12;            // about what a pad at its cap (0.3) cancels, from the 21:00 sweep (6.5 per 0.15)
// Blacks is a toe control ("black clipping", Adobe), not a lift: the sweep's p1 sits at 0 from -20 down,
// so nothing below -20 is calibrated and nothing above the toe is reached by it. The -20..0 slope (0.41
// per unit) is a lower bound taken on a clipped sample; an automatic pass never goes past -20 and says
// when the black point is beyond what that can do (the run of 18:03: -40 moved 22 -> 18).
const BLACKS_REACH = 20;
const BLACKS_SLOPE = 0.41;

const frameOf = (m) => m.frame || m;

// White balance first: Temperature, for a cast the whole parade shares. It is a gain on red against
// blue, strongest at the top, so it is solved to line the WHITES up and only when the blacks lean the
// same way (a warm bottom under blue tops is two lights, not a white balance - that is the pads' job).
// Returns null when temperature is not the tool.
function temperatureFor(m, from = 0) {
  const f = frameOf(m);
  const whites = STATISTICS.whitesRB(f), blacks = STATISTICS.blacksRB(f);
  if (Math.abs(whites) <= NEUTRAL) return null;
  // Two lights (a warm top under blue blacks) are the pads' job - unless the whites' cast is more than
  // the Highlights pad can cover, when the white balance takes it and the Shadows pad mops up what
  // that does to the blacks (the 21:05 run left whites warm by 20 on two clips by skipping this).
  if (Math.abs(blacks) > NEUTRAL && Math.sign(whites) !== Math.sign(blacks) && Math.abs(whites) <= PAD_REACH) return null;
  const s = solveKnob(m, "temperature", from, STATISTICS.whitesRB, 0);
  if (!s || !s.helps) return null;
  const value = Math.max(-TEMPERATURE_CAP, Math.min(TEMPERATURE_CAP, s.value));
  return {
    value, predicted: predict(m, "temperature", from, value),
    why: "whites and blacks both " + (whites > 0 ? "blue" : "warm") + " (" + round(whites) + " / " + round(blacks) + "): white balance " + round(value) + (Math.abs(value) < Math.abs(s.value) - 1e-6 ? " (capped at ±" + TEMPERATURE_CAP + ")" : ""),
  };
}

// The casts left after white balance: each end of the parade neutralised with that end's wheel PAD
// (Shadows for the blacks, Highlights for the whites), solved by inverting the wheel's calibrated
// response. The wheels' luma sliders stay where they are - the tonal work is the sliders' job, and a
// wheel luma pinned at its end is the wrong tool showing. `current` is where the pads are.
function padsFor(m, current = null) {
  const f = frameOf(m), now = current || {}, wheels = {}, needs = [];
  for (const [wheel, label] of [["shadows", "blacks"], ["highlights", "whites"]]) {
    const cast = castAt(f, wheel);
    if (Math.hypot(cast[0], cast[1]) <= NEUTRAL) continue;
    const r = solveCast(wheel, [-cast[0], -cast[1]]);
    if (!r) continue;
    const w = { ...(now[wheel] || { hue: 0, sat: 0, luma: 0.5 }), why: [] };
    const cx = w.sat * Math.cos(w.hue * Math.PI / 180) + r.sat * Math.cos(r.hue * Math.PI / 180);
    const cy = w.sat * Math.sin(w.hue * Math.PI / 180) + r.sat * Math.sin(r.hue * Math.PI / 180);
    w.sat = Math.min(MAX_SAT, Math.hypot(cx, cy)); w.hue = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
    w.why.push(label + " " + (cast[0] > 0 ? "blue" : "warm") + " by " + round(cast[0]) + (Math.abs(cast[1]) > NEUTRAL ? (cast[1] > 0 ? ", green" : ", magenta") + " by " + round(Math.abs(cast[1])) : "") + " → pad " + round(w.hue) + "° sat " + (Math.round(w.sat * 100) / 100) + (r.capped ? " (capped at " + MAX_SAT + ")" : ""));
    if (r.capped) needs.push(label + " cast " + round(Math.hypot(cast[0], cast[1])) + " is more than the pad model covers (" + MAX_SAT + "): the rest is reported, not chased");
    wheels[wheel] = w;
  }
  return { wheels, needs };
}

// The black point, set EXACTLY with the Master curve's bottom point - a levels move, output = (in - x)
// / (1 - x), measured to within the toe's softness (src/curves.cjs). Solved on the balanced frame,
// written before the sliders, which are then solved on the state it predicts. An automatic pass stops
// at x = 0.25: a black point above ~28 is not a lifted black, it is a picture with no black in it.
const LEVELS_CAP = 0.25;
function levelsFor(m, current = null) {
  const f = frameOf(m);
  const bp = f.luma.p1;
  if (!(bp > ACCEPT.blackMax)) return null;
  const target = BLACK_POINT[1] - 1;
  const want = blackInFor(bp, target);
  const blackIn = Math.min(LEVELS_CAP, want);
  return {
    blackIn, curves: levels(blackIn, 1, current), predicted: predictLevels(m, blackIn, 1),
    why: "black point " + round(bp) + " → " + target + ": curve bottom point at " + blackIn.toFixed(2) + (want > blackIn ? " (capped at " + LEVELS_CAP + ")" : ""),
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
    if (sat < SKIN_SAT[0] || sat > SKIN_SAT[1]) needs.push("skin saturation " + round(sat) + "% (20-50): Saturation");
  }

  // 2. White point: Whites, then Highlights for what Whites leaves. Whites clips past about +50, so
  //    an automatic pass caps it there; Highlights (a bright-areas control that never clipped in its
  //    sweep, +100 = p99 75.7 -> 87.8) finishes, capped at 60 - a shot that needs more is a taste
  //    call (grade_shot), not a balance.
  const wp = f.luma.p99;
  const whiteLow = (state) => frameOf(state).luma.p99 < ACCEPT.whiteMin;
  if (wp < ACCEPT.whiteMin) {
    goals.push({ param: "whites", statistic: "whitePoint", target: 92, cap: 50, why: "white point " + round(wp) + " → 92" });
    goals.push({ param: "highlights", statistic: "whitePoint", target: 92, cap: 60, onlyIf: whiteLow, why: "Highlights finishes what Whites leaves" });
  } else if (wp > ACCEPT.whiteMax) goals.push({ param: "whites", statistic: "whitePoint", target: 93, cap: 50, why: "white point " + round(wp) + " → 93" });

  // 3. Contrast, on the FRAME's spread, only when flat or harsh, never past +-60.
  const spread = STATISTICS.spread(f);
  if (spread < SPREAD.flat || spread > SPREAD.harsh) goals.push({ param: "contrast", statistic: "spread", target: SPREAD.target, cap: 60, why: "frame spread " + round(spread) + " is " + (spread < SPREAD.flat ? "flat" : "harsh") });

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
function verdict(after, region = "frame") {
  const notes = [];
  const f = frameOf(after);
  if (f.luma.p1 > ACCEPT.blackMax) notes.push("black point " + round(f.luma.p1) + " lifted");
  if (f.luma.p99 < ACCEPT.whiteMin) notes.push("white point " + round(f.luma.p99) + " low");
  if (f.luma.p99 > ACCEPT.whiteMax) notes.push("white point " + round(f.luma.p99) + " near clipping");
  for (const [wheel, label] of [["shadows", "blacks"], ["highlights", "whites"]]) {
    const [rb, g] = castAt(f, wheel);
    if (Math.abs(rb) > NEUTRAL) notes.push(label + " " + (rb > 0 ? "blue" : "warm") + " by " + round(rb) + (wheel === "shadows" ? " (Shadows wheel)" : ""));
    if (Math.abs(g) > NEUTRAL) notes.push(label + " " + (g > 0 ? "green" : "magenta") + " by " + round(Math.abs(g)));
  }
  const spread = STATISTICS.spread(f);
  if (spread < SPREAD.flat || spread > SPREAD.harsh) notes.push("spread " + round(spread) + " " + (spread < SPREAD.flat ? "flat" : "harsh"));
  const clipped = Math.max(f.clipped.red, f.clipped.green, f.clipped.blue);
  if (clipped > 0.5) notes.push("clipped " + round(clipped) + "%");
  if (f.crushed > 1) notes.push("crushed " + round(f.crushed) + "%");
  if (region === "face") {
    const luma = STATISTICS.brightness(after), hue = STATISTICS.skinHue(after);
    if (luma < SKIN_LUMA[0] || luma > SKIN_LUMA[1]) notes.push("face luma " + round(luma) + " outside 40-70");
    if (hue < SKIN_HUE[0] || hue > SKIN_HUE[1]) notes.push("skin hue " + round(hue) + "° off the line");
  }
  return { balanced: !notes.length, notes };
}

const round = (n) => Math.round(Number(n) * 10) / 10;

module.exports = { temperatureFor, padsFor, levelsFor, goalsFor, verdict, ACCEPT, BLACK_POINT, WHITE_POINT, SKIN_LUMA, SKIN_HUE, SKIN_SAT, SPREAD, TEMPERATURE_CAP, BLACKS_REACH, LEVELS_CAP, NEUTRAL };
