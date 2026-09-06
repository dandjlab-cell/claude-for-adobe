// Rhythm rules for a cut, checked by the panel after every edit instead of trusted to whoever is editing.
// The editor's rules (2026-09-06): a gap of a few frames between b-roll reads as a flash, not a cut; a vertical
// video has to stop the scroll, so b-roll should land inside the first second; and the base track must not be
// left with holes between talking-head moments.
"use strict";

const FLASH = 0.5;      // a gap shorter than this between two b-roll clips is a flash: close it, never leave it
const MIN_SHOT = 1.0;   // b-roll on screen for less than this reads as a blink
const SCROLL_STOP = 1.0; // vertical: the first b-roll should be on by here
const HOLE = 0.05;      // more than about one frame of nothing on the base track is a hole, not rounding

function byStart(a, b) { return a.start - b.start; }
function track(snap, name) { return snap.clips.filter((c) => c.track === name).sort(byStart); }
const s = (n) => n.toFixed(2) + "s";

// Every rhythm problem in a sequence, worst first. Each issue carries the fix, so a report is actionable.
function rhythmIssues(snap, { portrait } = {}) {
  if (!snap || snap.error || !snap.clips) return [];
  const vertical = portrait === undefined ? snap.height > snap.width : portrait;
  const out = [];
  const base = track(snap, "V1");
  for (let i = 1; i < base.length; i++) {
    const gap = base[i].start - base[i - 1].end;
    if (gap > HOLE) out.push({ kind: "hole", at: base[i - 1].end, seconds: gap, text: "HOLE on V1: " + s(gap) + " of nothing at " + s(base[i - 1].end) + " between \"" + base[i - 1].name + "\" and \"" + base[i].name + "\". The picture goes black there. Close it (keep_only / extract_ranges leave no gaps) before anything else." });
  }
  const upper = snap.clips.filter((c) => /^V([2-9]|\d\d)$/.test(c.track)).sort(byStart);
  for (let i = 1; i < upper.length; i++) {
    const gap = upper[i].start - upper[i - 1].end;
    if (gap > 0.001 && gap < FLASH) out.push({ kind: "flash-gap", at: upper[i - 1].end, seconds: gap, text: "FLASH: only " + s(gap) + " of talking head between \"" + upper[i - 1].name + "\" and \"" + upper[i].name + "\" at " + s(upper[i - 1].end) + ". A gap under " + s(FLASH) + " reads as a flicker, not a cut. Extend the earlier clip to meet the next one, or hold the talking head for at least " + s(FLASH) + "." });
  }
  upper.forEach((c) => { const d = c.end - c.start;
    if (d < MIN_SHOT) out.push({ kind: "blink", at: c.start, seconds: d, text: "BLINK: \"" + c.name + "\" is on for " + s(d) + " at " + s(c.start) + ". Under " + s(MIN_SHOT) + " nobody reads it. Lengthen it or drop it." }); });
  if (vertical && upper.length && upper[0].start > SCROLL_STOP) out.push({ kind: "late-broll", at: upper[0].start, seconds: upper[0].start, text: "SCROLL STOP: this is vertical and the first b-roll is at " + s(upper[0].start) + ". Something has to move inside the first " + s(SCROLL_STOP) + ". Move a b-roll clip there, or say why the face alone holds the open." });
  return out.sort((a, b) => (a.kind === "hole" ? -1 : b.kind === "hole" ? 1 : a.at - b.at));
}

// One block for a tool result, or "" when the cut is clean.
function rhythmReport(snap, opts) {
  const issues = rhythmIssues(snap, opts);
  return issues.length ? "\nRHYTHM (checked automatically, " + issues.length + " issue" + (issues.length === 1 ? "" : "s") + "):\n" + issues.map((i) => "- " + i.text).join("\n") : "";
}

module.exports = { rhythmIssues, rhythmReport, FLASH, MIN_SHOT, SCROLL_STOP, HOLE };
