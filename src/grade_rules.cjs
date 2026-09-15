// What to do to a shot, decided from its scopes by rule - the colourist canon, not invented numbers.
//
// The order and the targets are the industry's (Van Hurkman, Eagles, the broadcast conventions the
// scopes were built for; sources in the colour skill): set the black point and the white point, then
// neutralise the casts by lining the parade up - blacks with the Shadows wheel, whites with the
// Highlights wheel - then saturation, then skin onto the vectorscope's skin line. Midtones of a
// product or a hand have no canonical number and are left to taste; only a face has a band.
//
// In the lift/gamma/gain model, gain sets the white point and scales everything - that is Exposure -
// and lift sets the black point - that is the Blacks slider. Temperature/tint act on the white point
// only, so they are at best a small stand-in for the Highlights wheel and no use at all on a shadow
// cast; a shadow cast is reported as needing the wheel, never faked with a slider.
"use strict";
const { STATISTICS } = require("./grade.cjs");
const { castAt, solveCast } = require("./wheels.cjs");

const BLACK_POINT = [0, 5];      // luma p1 of the FRAME: sits here, not crushed flat
const WHITE_POINT = [88, 95];    // luma p99 of the FRAME: 90-95 with nothing true white; never clipped
const SKIN_LUMA = [40, 70];      // a face: light skin 60-70, dark skin 40-60; alive around 60-65
const SKIN_HUE = [116, 126];     // the vectorscope skin line, 123 at centre
const SKIN_SAT = [20, 50];       // percent of the vectorscope radius; ~30 reads natural on Rec.709
const SPREAD = { flat: 55, harsh: 85, target: 70 };
const NEUTRAL = 1.5;             // parade ends within this of each other are neutral

const frameOf = (m) => m.frame || m;

// One shot's goals in canon order, plus the things it needs that the panel cannot drive yet (`needs`).
// `region` is what was measured for the subject; parade and tonal ends always read the frame.
function goalsFor(m, region = "frame", current = null) {
  const goals = [], needs = [];
  const f = frameOf(m);
  const now = current || {};

  // 1. Black point (lift): the Blacks slider. Raising is calibrated and gentle; lowering is steep and
  //    the sweep floors at -20, so lowering uses the measured -20..0 slope (0.41 per unit) and never
  //    goes past -40 in an automatic pass - the confirm reports what it actually did.
  const bp = f.luma.p1;
  if (bp > BLACK_POINT[1] + 1) {
    const value = Math.max(-40, -(bp - (BLACK_POINT[1] - 1)) / 0.41);
    goals.push({ param: "blacks", statistic: "blackPoint", target: BLACK_POINT[1] - 1, value, why: "black point " + round(bp) + " → " + (BLACK_POINT[1] - 1) });
  } else if (f.crushed > 1 || bp < BLACK_POINT[0]) {
    goals.push({ param: "blacks", statistic: "blackPoint", target: BLACK_POINT[0] + 2, why: "blacks " + (f.crushed > 1 ? "crushed " + round(f.crushed) + "%" : "at " + round(bp)) + " → lifted to " + (BLACK_POINT[0] + 2) });
  }

  // 2. White point: a big deficit is Exposure's job first (a gain in stops, highlight-protected),
  //    then Whites finishes - solved on the state predicted after exposure. A small deficit, or too
  //    high, is Whites alone. Whites clips past about +50, so an automatic pass caps it there.
  const wp = f.luma.p99;
  if (wp < WHITE_POINT[0] - 3) {
    if (WHITE_POINT[0] - wp > 8) goals.push({ param: "exposure", statistic: "whitePoint", target: 92, why: "white point " + round(wp) + " → 92 (exposure first: " + round(92 - wp) + " points short)" });
    goals.push({ param: "whites", statistic: "whitePoint", target: 92, cap: 50, why: "white point → 92 (Whites finishes)" });
  } else if (wp > WHITE_POINT[1]) {
    goals.push({ param: "whites", statistic: "whitePoint", target: 93, cap: 50, why: "white point " + round(wp) + " → 93" });
  }

  // 3. Contrast, on the FRAME's spread, only when flat or harsh, never past +-60.
  const spread = STATISTICS.spread(f);
  if (spread < SPREAD.flat || spread > SPREAD.harsh) goals.push({ param: "contrast", statistic: "spread", target: SPREAD.target, cap: 60, why: "frame spread " + round(spread) + " is " + (spread < SPREAD.flat ? "flat" : "harsh") });

  // 4. Skin luma, on the face: exposure, if the white point allows.
  if (region === "face") {
    const luma = STATISTICS.brightness(m);
    if (luma < SKIN_LUMA[0] || luma > SKIN_LUMA[1]) goals.push({ param: "exposure", statistic: "brightness", target: luma < SKIN_LUMA[0] ? SKIN_LUMA[0] + 5 : SKIN_LUMA[1] - 5, why: "face luma " + round(luma) + " (40-70)" });
    const hue = STATISTICS.skinHue(m), sat = STATISTICS.saturation(m);
    if (hue < SKIN_HUE[0] || hue > SKIN_HUE[1]) needs.push("skin hue " + round(hue) + "° off the skin line (116-126): Midtones wheel");
    if (sat < SKIN_SAT[0] || sat > SKIN_SAT[1]) needs.push("skin saturation " + round(sat) + "% (20-50): Saturation");
  }
  return Object.assign(goals, { needs, wheels: {} });
}

// The casts, after the tonal sliders have landed: each end of the parade neutralised with that end's
// wheel PAD (Shadows for the blacks, Highlights for the whites), solved by inverting the wheel's
// calibrated response. The wheels' luma sliders stay where they are - the tonal work is the sliders'
// job, and a wheel luma pinned at its end is the wrong tool showing. `current` is where the pads are.
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
    w.sat = Math.min(0.5, Math.hypot(cx, cy)); w.hue = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
    w.why.push(label + " " + (cast[0] > 0 ? "blue" : "warm") + " by " + round(cast[0]) + (Math.abs(cast[1]) > NEUTRAL ? (cast[1] > 0 ? ", green" : ", magenta") + " by " + round(Math.abs(cast[1])) : "") + " → pad " + round(w.hue) + "° sat " + (Math.round(w.sat * 100) / 100) + (r.capped ? " (capped)" : ""));
    wheels[wheel] = w;
  }
  return { wheels, needs };
}

// After the confirm: balanced, or what is still off - in the canon's words.
function verdict(after, region = "frame") {
  const notes = [];
  const f = frameOf(after);
  if (f.luma.p1 > BLACK_POINT[1] + 1) notes.push("black point " + round(f.luma.p1) + " lifted");
  if (f.luma.p99 < WHITE_POINT[0] - 3) notes.push("white point " + round(f.luma.p99) + " low");
  if (f.luma.p99 > WHITE_POINT[1]) notes.push("white point " + round(f.luma.p99) + " near clipping");
  const blacks = STATISTICS.blacksRB(f), whites = STATISTICS.whitesRB(f);
  if (Math.abs(blacks) > NEUTRAL) notes.push("blacks " + (blacks > 0 ? "blue" : "warm") + " by " + round(blacks) + " (Shadows wheel)");
  if (Math.abs(whites) > NEUTRAL) notes.push("whites " + (whites > 0 ? "blue" : "warm") + " by " + round(whites));
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

module.exports = { goalsFor, padsFor, verdict, BLACK_POINT, WHITE_POINT, SKIN_LUMA, SKIN_HUE, SKIN_SAT, SPREAD };
