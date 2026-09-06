// Reading a speaker from a frame, using only what macOS's Vision framework measures (bin/ocr --faces).
// Geometry and image quality, never emotion: whether the head is square to the lens, whether the eyes are open,
// whether the mouth is moving, how big the face is, and Apple's own face capture quality (sharpness, lighting,
// expression). Energy and conviction are not visible in a still; they come from the voice (analyze_audio) and
// from how the face changes across frames, which is why the summary reports movement rather than a mood.
"use strict";

// Thresholds calibrated 2026-09-06 against frames where Vision's own quantised yaw was 0 or +-45 degrees:
// facing read 0.004 and 0.037 when square to the lens, 0.076 and 0.140 when turned 45 degrees.
const SQUARE = 0.05;   // at or under: looking down the lens
const TURNED = 0.11;   // over: clearly turned away
const BLINK = 0.15;    // eye opening ratio under this is a blink or a squint
const TALKING = 0.20;  // mouth opening ratio over this is mid-word
const POOR = 0.30;     // Apple's capture quality under this is a soft, dim or awkward frame
const SMALL = 0.12;    // face narrower than this share of the frame is a wide shot

function faceOf(entry) {
  const list = (entry && entry.faces) || [];
  if (!list.length) return null;
  // The speaker is the biggest face in the frame.
  return list.slice().sort((a, b) => (b.box[2] - b.box[0]) - (a.box[2] - a.box[0]))[0];
}

// One frame's reading. Every field is measured; `notes` says what it means in plain words.
function readFrame(entry, t) {
  const f = faceOf(entry);
  if (!f) return { t, face: false, notes: ["no face found"] };
  const width = f.box[2] - f.box[0];
  const facing = Number.isFinite(f.facing) ? f.facing : null;
  const notes = [];
  if (facing === null) notes.push("head angle unreadable");
  else if (facing <= SQUARE) notes.push("looking at the lens");
  else if (facing <= TURNED) notes.push("slightly off the lens");
  else notes.push("turned away");
  if (f.eyes < BLINK) notes.push("eyes nearly closed");
  if (f.mouth > TALKING) notes.push("mid-word");
  if (f.quality !== null && f.quality < POOR) notes.push("poor frame (soft, dim or awkward)");
  if (width < SMALL) notes.push("wide shot");
  return { t, face: true, facing, tilt: f.tilt, eyes: f.eyes, mouth: f.mouth, quality: f.quality, width,
    centre: [(f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2], notes };
}

// Is this a moment to stay on the speaker? Only from what was measured.
function usable(r) { return r.face && r.facing !== null && r.facing <= TURNED && r.eyes >= BLINK && (r.quality === null || r.quality >= POOR); }

function summarise(rows) {
  const seen = rows.filter((r) => r.face);
  if (!seen.length) return { text: "No face in any of the " + rows.length + " frames. Either the shot is not a talking head, or the wrong track was read.", good: [], usableShare: 0 };
  const good = seen.filter(usable);
  const square = seen.filter((r) => r.facing !== null && r.facing <= SQUARE);
  const q = seen.filter((r) => r.quality !== null).map((r) => r.quality);
  const spread = (xs) => xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const movement = spread(seen.map((r) => r.centre[0])) + spread(seen.map((r) => r.centre[1]));
  const best = good.slice().sort((a, b) => ((b.quality || 0) - (a.quality || 0)) || (a.facing - b.facing))[0];
  const lines = [
    seen.length + " of " + rows.length + " frames have a face; " + good.length + " are usable to hold on.",
    square.length + " look straight down the lens" + (square.length ? " (" + square.slice(0, 6).map((r) => r.t.toFixed(2) + "s").join(", ") + (square.length > 6 ? "…" : "") + ")" : "."),
    q.length ? "Capture quality " + Math.min(...q).toFixed(2) + " to " + Math.max(...q).toFixed(2) + " (Apple's own measure of sharpness, lighting and expression; under " + POOR + " is a poor frame)." : "",
    best ? "Best frame to hold: " + best.t.toFixed(2) + "s (" + best.notes.join(", ") + ")." : "No frame here is usable to hold on: cover this line with b-roll.",
    "Head moves across " + movement.toFixed(2) + " of the frame over this span" + (movement < 0.02 ? ": very still, which reads as flat unless the voice carries it." : movement > 0.15 ? ": lively." : "."),
    "Energy and conviction are not measurable from a frame. Read the voice for that (analyze_audio) and the words themselves.",
  ].filter(Boolean);
  return { text: lines.join("\n"), good, usableShare: good.length / seen.length, best };
}

module.exports = { readFrame, summarise, usable, SQUARE, TURNED, BLINK, TALKING, POOR, SMALL };
