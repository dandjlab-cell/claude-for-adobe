// What to do to a shot, decided from its scopes by rule - no judgement, no model, no search.
//
// Balancing is mechanical: whites line up (white balance), the subject sits in the band for the kind
// of thing it is (exposure), the spread is neither flat nor harsh (contrast), and nothing clips or
// crushes. A colourist's taste comes AFTER this, on top of a balanced base. The first live run of
// "grade this video" (2026-09-15) let the model decide per shot and it forced every subject to one
// brightness - +3 stops on a dark bottle. These rules do not have that option.
"use strict";
const { STATISTICS } = require("./grade.cjs");

// Brightness bands by what the subject is. A face sits where broadcast puts skin (IRE 55-70 → 53-66
// here); hands, products and rooms sit lower. Inside the band, exposure is left alone.
const BANDS = { face: [53, 66], subject: [40, 55], frame: [40, 55] };
const SPREAD = { flat: 55, harsh: 85, target: 70 };
const WHITES_TOLERANCE = 1.5;   // whites within this of aligned are aligned
const WHITE_CEILING = 92;       // luma p99 above this is heading for a clip
const BLACK_FLOOR = 4;          // luma p1 below this is heading for a crush

// One shot's goals, in colourist order, from its measurement and which region it is. Each goal names
// the knob, the statistic and the target the way grade_shot wants them, plus why.
function goalsFor(m, region = "frame") {
  const goals = [];
  // White balance is read from the FRAME's whites even when a subject was measured: the brightest
  // pixels of a red product are red, which is its colour, not the light. The room's highlights -
  // white surfaces, specular hits - are what a parade lines up. Exposure, below, is the subject's.
  const whites = STATISTICS.whitesRB(m.frame || m);
  if (Math.abs(whites) > WHITES_TOLERANCE) {
    goals.push({ param: "temperature", statistic: "whitesRB", target: 0, why: "whites are " + (whites > 0 ? "blue" : "warm") + " by " + round(whites) });
  }

  const band = BANDS[region] || BANDS.frame;
  const bright = STATISTICS.brightness(m);
  if (bright < band[0] || bright > band[1]) {
    // Into the band by the smallest move, not to its centre: the shot keeps its own character.
    const target = bright < band[0] ? band[0] + 2 : band[1] - 2;
    goals.push({ param: "exposure", statistic: "brightness", target, why: region + " brightness " + round(bright) + " is outside " + band.join("-") });
  }

  const spread = STATISTICS.spread(m);
  if (spread < SPREAD.flat || spread > SPREAD.harsh) {
    goals.push({ param: "contrast", statistic: "spread", target: SPREAD.target, why: "spread " + round(spread) + " is " + (spread < SPREAD.flat ? "flat" : "harsh") });
  }
  return goals;
}

// After the confirm: is the shot balanced, and what is still off? Plain words for the report.
function verdict(after, region = "frame") {
  const notes = [];
  const f = after.frame || after;
  const whites = STATISTICS.whitesRB(f);
  if (Math.abs(whites) > WHITES_TOLERANCE) notes.push("whites still " + (whites > 0 ? "blue" : "warm") + " by " + round(whites));
  const band = BANDS[region] || BANDS.frame;
  const bright = STATISTICS.brightness(after);
  if (bright < band[0] - 1 || bright > band[1] + 1) notes.push(region + " brightness " + round(bright) + " outside " + band.join("-"));
  if (f.luma.p99 > WHITE_CEILING) notes.push("white point " + round(f.luma.p99) + " near clipping");
  if (f.luma.p1 < BLACK_FLOOR) notes.push("black point " + round(f.luma.p1) + " near crushing");
  const clipped = Math.max(f.clipped.red, f.clipped.green, f.clipped.blue);
  if (clipped > 0.5) notes.push("clipped " + round(clipped) + "%");
  if (f.crushed > 1) notes.push("crushed " + round(f.crushed) + "%");
  return { balanced: !notes.length, notes };
}

const round = (n) => Math.round(Number(n) * 10) / 10;

module.exports = { goalsFor, verdict, BANDS, SPREAD };
