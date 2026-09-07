// The audio cut at the level of thoughts. A cut that lands inside a sentence leaves a word hanging; a cut that
// lands between two complete thoughts leaves nothing. So: split the transcript into thoughts, drop fragments and
// false starts whole, drop the losing take of a repeated line whole, keep every complete thought in order with a
// little air on each side, and cut only between thoughts. One pass, one keep_only, no seams inside a sentence.
"use strict";
const { utterances, findTakes, SURE } = require("./takes.cjs");

const PAD = 0.18;        // air kept on each side of a thought (seconds)
const JOIN = 0.45;       // two kept thoughts closer than this stay joined (no micro-cut between them)
const RESTART_WITHIN = 2.5; // a fragment followed this soon by a line sharing its words is a false start

function contentOverlap(a, b) { const A = new Set(a.tokens); let n = 0; b.tokens.forEach((t) => { if (A.has(t)) n++; }); return n; }

// Every thought with a verdict: keep, or drop with a reason. `scoreGroup(candidates)` (optional) returns a delivery
// score per candidate of a take group, relative within the group (from src/prosody.cjs).
function planThoughts(words, { gap = 0.6, pad = PAD, join = JOIN, scoreGroup } = {}) {
  const us = utterances(words, gap).map((u, i) => ({ ...u, i, dur: u.end - u.start, complete: /[.?!]$/.test(u.text.trim()) || u.tokens.length >= 7 }));
  const verdict = us.map(() => null);
  // 1. losing takes of a repeated line (sure groups only)
  const groups = findTakes(words, { gap, minSim: 0.6, minTokens: 3 }).filter((g) => g.similarity >= SURE);
  const takeReason = new Map();
  for (const g of groups) {
    let keep = g.keep;
    if (scoreGroup) { const d = scoreGroup(g.candidates) || []; const scored = g.candidates.map((c, i) => c.score + 2 * (d[i] || 0)); keep = scored.reduce((b, v, i) => (v > scored[b] || (v === scored[b] && i > b) ? i : b), 0); }
    g.candidates.forEach((c, i) => { if (i !== keep) takeReason.set(c.start.toFixed(3), "a take of the same line; kept the " + (keep > i ? "later" : "earlier") + " one"); });
  }
  us.forEach((u) => { const r = takeReason.get(u.start.toFixed(3)); if (r) verdict[u.i] = { drop: r }; });
  // 2. fragments and false starts
  us.forEach((u, i) => {
    if (verdict[i]) return;
    const next = us[i + 1];
    const restart = !u.complete && next && next.start - u.end <= RESTART_WITHIN && contentOverlap(u, next) >= Math.max(1, Math.min(2, u.tokens.length));
    if (restart) { verdict[i] = { drop: "false start: the next line says it again" }; return; }
    if (u.tokens.length < 2 && !u.complete) { verdict[i] = { drop: "fragment: " + u.tokens.length + " content word(s), no ending" }; return; }
    if (u.dur < 0.8 && !u.complete) { verdict[i] = { drop: "fragment: under a second, no ending" }; return; }
    verdict[i] = { keep: true };
  });
  const keep = us.filter((u) => verdict[u.i].keep), drop = us.filter((u) => verdict[u.i].drop).map((u) => ({ start: u.start, end: u.end, text: u.text, reason: verdict[u.i].drop }));
  // 3. ranges: each kept thought with air, merged when they touch or nearly touch
  const ranges = [];
  keep.forEach((u) => {
    const r = { start: Math.max(0, u.start - pad), end: u.end + pad };
    const last = ranges[ranges.length - 1];
    if (last && r.start - last.end <= join) last.end = Math.max(last.end, r.end); else ranges.push(r);
  });
  return { thoughts: us.map((u) => ({ start: u.start, end: u.end, text: u.text, complete: u.complete, verdict: verdict[u.i].keep ? "keep" : verdict[u.i].drop })), keep: keep.map((u) => ({ start: u.start, end: u.end, text: u.text })), drop, ranges };
}

const f = (n) => n.toFixed(2) + "s";
function report(plan) {
  const kept = plan.keep.map((k, i) => (i + 1) + ". " + f(k.start) + "-" + f(k.end) + "  " + k.text);
  const dropped = plan.drop.map((d) => "  - " + f(d.start) + "-" + f(d.end) + "  " + d.reason + ": \"" + d.text.slice(0, 80) + (d.text.length > 80 ? "…" : "") + "\"");
  const total = plan.ranges.reduce((n, r) => n + (r.end - r.start), 0);
  return "Kept thoughts (" + plan.keep.length + ", " + total.toFixed(1) + "s in " + plan.ranges.length + " range(s), cuts only between thoughts):\n" + kept.join("\n") + (dropped.length ? "\nDropped (" + dropped.length + "):\n" + dropped.join("\n") : "\nDropped: nothing");
}

module.exports = { planThoughts, report, PAD, JOIN };
