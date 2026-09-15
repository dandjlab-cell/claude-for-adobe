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

const BLACK_POINT = [0, 5];      // luma p1 of the FRAME: sits here, not crushed flat
const WHITE_POINT = [88, 95];    // luma p99 of the FRAME: 90-95 with nothing true white; never clipped
const SKIN_LUMA = [40, 70];      // a face: light skin 60-70, dark skin 40-60; alive around 60-65
const SKIN_HUE = [116, 126];     // the vectorscope skin line, 123 at centre
const SKIN_SAT = [20, 50];       // percent of the vectorscope radius; ~30 reads natural on Rec.709
const SPREAD = { flat: 55, harsh: 85, target: 70 };
const NEUTRAL = 1.5;             // parade ends within this of each other are neutral
const TEMPERATURE_STANDIN_CAP = 30; // beyond this a whites cast is a wheel job, not a slider job

const frameOf = (m) => m.frame || m;

// One shot's goals in canon order, plus the things it needs that the panel cannot drive yet (`needs`).
// `region` is what was measured for the subject; parade and tonal ends always read the frame.
function goalsFor(m, region = "frame") {
  const goals = [], needs = [];
  const f = frameOf(m);

  // 1. Black point (lift). The Blacks slider is the tool; it has no calibration yet, so this is a need.
  const bp = f.luma.p1;
  if (bp > BLACK_POINT[1] + 1) needs.push("black point " + round(bp) + " is lifted (milky): Blacks slider, uncalibrated");
  if (f.crushed > 1) needs.push("blacks crushed " + round(f.crushed) + "%: Blacks slider up, uncalibrated");

  // 2. White point (gain) = Exposure, calibrated. Only when it is clearly off; never above 95.
  const wp = f.luma.p99;
  if (wp < WHITE_POINT[0] - 3 || wp > WHITE_POINT[1]) {
    goals.push({ param: "exposure", statistic: "whitePoint", target: wp < WHITE_POINT[0] ? 92 : 93, why: "white point " + round(wp) + " (target 90-95)" });
  }

  // 3. Neutralise on the parade. Blacks: the Shadows wheel - report. Whites: the Highlights wheel;
  //    temperature stands in only for a modest cast, and is named as a stand-in.
  const blacks = STATISTICS.blacksRB(f), whites = STATISTICS.whitesRB(f);
  if (Math.abs(blacks) > NEUTRAL) needs.push("blacks are " + (blacks > 0 ? "blue" : "warm") + " by " + round(blacks) + ": Shadows wheel");
  if (Math.abs(whites) > NEUTRAL) {
    if (Math.abs(whites) <= TEMPERATURE_STANDIN_CAP) goals.push({ param: "temperature", statistic: "whitesRB", target: 0, why: "whites are " + (whites > 0 ? "blue" : "warm") + " by " + round(whites) + " (temperature standing in for the Highlights wheel)" });
    else needs.push("whites are " + (whites > 0 ? "blue" : "warm") + " by " + round(whites) + ": Highlights wheel (too far for temperature)");
  }

  // 4. Contrast, on the FRAME's spread, and only when it is flat or harsh. An automatic pass never
  //    goes past +-60: that is a look, not a balance.
  const spread = STATISTICS.spread(f);
  if (spread < SPREAD.flat || spread > SPREAD.harsh) goals.push({ param: "contrast", statistic: "spread", target: SPREAD.target, cap: 60, why: "frame spread " + round(spread) + " is " + (spread < SPREAD.flat ? "flat" : "harsh") });

  // 5. Skin, on the face only. Luma into its band with exposure if the white point allows; hue and
  //    saturation are Midtones-wheel work and are reported.
  if (region === "face") {
    const luma = STATISTICS.brightness(m);
    if (luma < SKIN_LUMA[0] || luma > SKIN_LUMA[1]) goals.push({ param: "exposure", statistic: "brightness", target: luma < SKIN_LUMA[0] ? SKIN_LUMA[0] + 5 : SKIN_LUMA[1] - 5, why: "face luma " + round(luma) + " (40-70)" });
    const hue = STATISTICS.skinHue(m), sat = STATISTICS.saturation(m);
    if (hue < SKIN_HUE[0] || hue > SKIN_HUE[1]) needs.push("skin hue " + round(hue) + "° off the skin line (116-126): Midtones wheel");
    if (sat < SKIN_SAT[0] || sat > SKIN_SAT[1]) needs.push("skin saturation " + round(sat) + "% (20-50): Saturation");
  }
  return Object.assign(goals, { needs });
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

module.exports = { goalsFor, verdict, BLACK_POINT, WHITE_POINT, SKIN_LUMA, SKIN_HUE, SKIN_SAT, SPREAD };
