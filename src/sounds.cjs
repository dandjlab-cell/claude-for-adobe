// Sound events on the timeline from Apple's built-in classifier (bin/ocr --sounds): laughter, applause, cheering,
// sighs, gasps, music, silence. Windows come in at one second with a half-second hop; this turns them into
// segments per label so a pause next to a laugh can be protected and a reaction can be a cut signal.
"use strict";

// The labels an editor cares about, grouped. Apple's identifiers on the left.
const GROUPS = {
  laughter: ["laughter", "belly_laugh", "chuckle_chortle", "giggling", "snicker", "baby_laughter"],
  applause: ["applause", "clapping", "cheering", "crowd"],
  reaction: ["sigh", "gasp", "breathing", "whispering", "shout", "yell"],
  music: ["music", "singing", "choir_singing"],
  noise: ["typing", "typing_computer_keyboard", "door", "door_slam", "knock", "cough"],
};
const MIN_CONF = 0.35; // below this the classifier is guessing; laughter under speech usually reads 0.35-0.7
// Calibrated 2026-09-07 on a talking head with no music: "music" read 0.38-0.58 in windows where "speech" read
// 0.8-0.9. A runner-up label is not an event. Music and noise count only as the strongest label in the window;
// laughter, applause and reactions count when strongest, or under speech only above a higher bar.
const RULES = { laughter: { top: 0.35, under: 0.55 }, applause: { top: 0.35, under: 0.55 }, reaction: { top: 0.35, under: 0.6 }, music: { top: 0.35, under: 1.01 }, noise: { top: 0.35, under: 1.01 } };

function groupOf(label) { for (const g in GROUPS) if (GROUPS[g].includes(label)) return g; return null; }

// Which groups a window supports: label at or above the group's bar for its rank (strongest label or not).
function hitsIn(window, minConf) {
  const labels = (window.labels || []).slice().sort((a, b) => b[1] - a[1]);
  const topConf = labels.length ? labels[0][1] : 0;
  const hit = {};
  for (const [id, conf] of labels) {
    const g = groupOf(id); if (!g) continue;
    const isTop = conf >= topConf - 1e-9;
    const bar = Math.max(minConf, isTop ? RULES[g].top : RULES[g].under);
    if (conf >= bar && (!hit[g] || conf > hit[g].conf)) hit[g] = { id, conf, top: isTop, dominant: labels[0][0] };
  }
  return hit;
}

// Parse the helper's output into windows [{t0, t1, labels: [[id, conf]...]}].
function parseWindows(text) {
  return String(text || "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter((w) => w && Number.isFinite(w.t0));
}

// Segments per group: consecutive windows where any label of the group is at or above MIN_CONF, merged when
// they touch, each with its peak confidence and the label that peaked.
function segments(windows, { minConf = MIN_CONF, offset = 0 } = {}) {
  const out = [];
  const open = {};
  for (const w of windows) {
    const hit = hitsIn(w, minConf);
    for (const g in GROUPS) {
      if (hit[g]) {
        if (open[g] && w.t0 <= open[g].end + 0.01) { open[g].end = w.t1; if (hit[g].conf > open[g].peak) { open[g].peak = hit[g].conf; open[g].label = hit[g].id; } }
        else { if (open[g]) out.push(open[g]); open[g] = { group: g, start: w.t0, end: w.t1, peak: hit[g].conf, label: hit[g].id }; }
      } else if (open[g] && w.t0 > open[g].end + 0.01) { out.push(open[g]); delete open[g]; }
    }
  }
  for (const g in open) out.push(open[g]);
  return out.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset, peak: Number(s.peak.toFixed(2)) })).sort((a, b) => a.start - b.start);
}

const f = (n) => n.toFixed(2) + "s";
function report(segs) {
  if (!segs.length) return "No laughter, applause, reactions or music found above " + MIN_CONF + " confidence.";
  const by = {};
  segs.forEach((s) => (by[s.group] = by[s.group] || []).push(s));
  return Object.keys(by).map((g) => g + " (" + by[g].length + "): " + by[g].map((s) => f(s.start) + "-" + f(s.end) + " " + s.label + " " + s.peak).join(", ")).join("\n");
}

module.exports = { GROUPS, MIN_CONF, RULES, parseWindows, segments, report, groupOf, hitsIn };
