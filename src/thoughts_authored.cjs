// The staged contract from House Tour Cut, ported: the MODEL authors thoughts as word-index ranges (recall first,
// every word assigned, a pointer when one thought is a retake of another); CODE validates coverage and order, fills
// times from the immutable words, measures delivery, chooses the take by fluency, cuts failed restarts inside a
// thought, trims edge crumbs only when the audio agrees, and applies the editors' rules: a cut-in follows a pause
// of 0.3 s or more, no cut that removes only a second of silence, no span that keeps both attempts of a line.
"use strict";

const { snapSpan, pauseBefore } = require("./silence_map.cjs");

const CRUMBS = new Set(["yeah", "yes", "yep", "okay", "ok", "cool", "great", "perfect", "right", "sure", "thanks", "thankyou"]);
const CUT_IN_PAUSE = 0.3;   // 82% of editors' cut-ins follow a pause of at least this
const CHEAP_CUT = 1.0;      // a cut removing only this much silence saves nothing and risks a pop: never made
const PACING_REVIEW = 2.0;  // silence between this and CHEAP_CUT is a finishing decision: kept, flagged
const PAD = 0.15;
const norm = (w) => String(w || "").toLowerCase().replace(/[^a-z0-9']/g, "");

// Self-repeats inside one authored thought: a run of words that recurs within 30 tokens. The FIRST attempt is the
// failed one. Returns [{cutStart, cutEnd, phrase}] in seconds (cut = [start of first attempt, start of the retake)).
// Port of story_harness._find_restarts, retuned on the 2026-09-07 run where it missed every real restart:
//   - tokens match fuzzily (one a prefix of the other, or edit distance 1): "premier" / "premiere";
//   - a comma before the retake no longer reads as a list: Whisper puts one at every retake inside a thought;
//   - a run opening on "and" is a list only when the words between the attempts are a short slot ("and we painted
//     the WALLS and we painted the ceiling"); a long first attempt restarted on "and" is a restart;
//   - an immediate repeat needs only 2 words ("reach which reach which"); a repeat with words between needs 4;
//   - a long stretch between the attempts is not a connector: the cut is exactly [first attempt, retake).
// A retake preceded by and/or/nor is still a list ("the walls and we painted the ceiling").
function same(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
function findRestarts(rows, silences) {
  const toks = rows.map((r) => norm(r.text));
  const out = [];
  let usedUntil = -1;
  for (let i = 0; i < toks.length - 1; i++) {
    if (i < usedUntil || !toks[i]) continue;
    for (let j = i + 2; j < Math.min(toks.length - 1, i + 30); j++) {
      if (!same(toks[i], toks[j])) continue;
      if (i > 0 && j > 0 && same(toks[i - 1], toks[j - 1])) continue;
      let length = 0;
      while (i + length < j && j + length < toks.length && same(toks[i + length], toks[j + length])) length++;
      const between = rows.slice(i + length, j);
      if (length < (between.length ? 4 : 2)) continue;
      if (between.length && ["and", "or", "nor"].includes(toks[j - 1])) continue;
      if (between.length && between.length <= 3 && ["and", "or", "nor", "but", "so"].includes(toks[i])) continue;
      let startI = i, secondI = j;
      if (between.length) {
        const phraseStart = (k) => { while (k > 0 && (silences !== undefined ? pauseBefore(rows[k].start, rows[k].start, silences) : rows[k].start - rows[k - 1].end) < 0.35 && rows[j].start - rows[k - 1].start <= 6) k--; return k; };
        const fs = phraseStart(i), ss = phraseStart(j);
        if (ss > fs && ss > i + length) { startI = fs; secondI = ss; }
        else if (between.length <= 3) { const changed = between.length; startI = Math.max(0, i - changed); secondI = Math.max(i + length, j - changed); }
      }
      out.push({ cutStart: rows[startI].start, cutEnd: rows[secondI].start, phrase: rows.slice(startI, j + length).map((r) => r.text).join(" ") });
      usedUntil = j + length;
      break;
    }
  }
  return out;
}

// Validate a model-authored draft against the words: spans in order, no overlaps, indices in range. Uncovered
// words are reported (recall matters) but do not fail. Returns { thoughts, problems, uncovered }.
function validateDraft(words, draft) {
  const problems = [], covered = new Array(words.length).fill(false);
  const list = Array.isArray(draft && draft.thoughts) ? draft.thoughts : [];
  const thoughts = [];
  list.forEach((t, n) => {
    const id = t.id || "thought_" + String(n + 1).padStart(3, "0");
    const spans = Array.isArray(t.spans) ? t.spans : [{ word_start_i: t.word_start_i, word_end_i: t.word_end_i }];
    const idx = [];
    for (const sp of spans) {
      const a = Number(sp.word_start_i), b = Number(sp.word_end_i);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= words.length || a > b) { problems.push(id + ": span " + JSON.stringify(sp) + " out of range (0.." + (words.length - 1) + ")"); continue; }
      for (let i = a; i <= b; i++) { if (covered[i]) problems.push(id + ": word " + i + " already belongs to another thought"); covered[i] = true; idx.push(i); }
    }
    if (!idx.length) return;
    idx.sort((x, y) => x - y);
    thoughts.push({ id, indices: idx, label: String(t.label || ""), kind: t.kind === "production" ? "production" : "answer", retake_of: t.retake_of || null, start: words[idx[0]].start, end: words[idx[idx.length - 1]].end, text: idx.map((i) => words[i].text).join(" ") });
  });
  thoughts.sort((a, b) => a.start - b.start);
  const uncovered = []; covered.forEach((c, i) => { if (!c) uncovered.push(i); });
  return { thoughts, problems, uncovered };
}

const stats = (xs) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return { median: null, iqr: null }; const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))]; return { median: q(0.5), iqr: q(0.75) - q(0.25) }; };
const z = (v, st) => (v === null || v === undefined || st.median === null || !st.iqr) ? 0 : (v - st.median) / (st.iqr / 1.349);
const isOutlier = (pw, base) => Math.abs(z(pw.energyDb, base.energyDb)) >= 2.5 || Math.abs(z(pw.f0Median, base.f0)) >= 2.5;

// Qualify one thought: trim edge crumbs (only when acoustically outside the performance register), cut failed
// restarts inside it, measure delivery. Returns { pieces: [{start,end,text}], restartCount, delivery, trimmed }.
function qualify(words, thought, perWord, baseline, silences) {
  let idx = thought.indices.slice();
  let trimmed = 0;
  const crumb = (i) => CRUMBS.has(norm(words[i].text)) && (!perWord || !baseline || isOutlier(perWord[i], baseline));
  for (let k = 0; k < 3 && idx.length > 1 && crumb(idx[0]); k++) { idx.shift(); trimmed++; }
  for (let k = 0; k < 3 && idx.length > 1 && crumb(idx[idx.length - 1]); k++) { idx.pop(); trimmed++; }
  const rows = idx.map((i) => words[i]);
  const restarts = findRestarts(rows, silences);
  const pieces = [];
  let cursor = 0;
  for (const r of restarts) {
    const first = rows.findIndex((w, i) => i >= cursor && w.start >= r.cutStart - 0.01);
    const second = rows.findIndex((w, i) => i >= Math.max(first, 0) && w.start >= r.cutEnd - 0.01);
    if (first > cursor) pieces.push({ startIndex: idx[cursor], endIndex: idx[first - 1], rawStart: rows[cursor].start, start: rows[cursor].start, end: rows[first - 1].end, text: rows.slice(cursor, first).map((w) => w.text).join(" ") });
    cursor = second < 0 ? rows.length : second;
  }
  if (cursor < rows.length) pieces.push({ startIndex: idx[cursor], endIndex: idx[idx.length - 1], rawStart: rows[cursor].start, start: rows[cursor].start, end: rows[rows.length - 1].end, text: rows.slice(cursor).map((w) => w.text).join(" ") });
  const span = silences !== undefined ? snapSpan(rows[0].start, rows[rows.length - 1].end, silences) : { start: rows[0].start, end: rows[rows.length - 1].end };
  const dur = Math.max(1e-9, span.end - span.start);
  const pauses = silences !== undefined ? silences.map(s => Math.max(0, Math.min(s.end, span.end) - Math.max(s.start, span.start))).filter(n => n > 0) : rows.slice(1).map((w, i) => Math.max(0, w.start - rows[i].end));
  const delivery = { rateWps: rows.length / dur, pauseTotal: pauses.reduce((a, b) => a + b, 0), pauseCount: pauses.filter((p) => p >= 0.25).length, energyDb: perWord ? stats(idx.map((i) => perWord[i].energyDb)).median : null, f0: perWord ? stats(idx.map((i) => perWord[i].f0Median)).median : null };
  return { pieces, restartCount: restarts.length, restarts, delivery, trimmed };
}

// Fluency order for takes: fewer restarts, less pause, faster (editors took the more fluent read 8/10, faster 9/10).
function fluency(q) { return [q.restartCount, q.delivery.pauseTotal, -q.delivery.rateWps]; }
function moreFluent(a, b) { const fa = fluency(a), fb = fluency(b); for (let i = 0; i < 3; i++) { if (fa[i] !== fb[i]) return fa[i] < fb[i]; } return false; }

// The plan: from validated thoughts, the ranges to keep and everything dropped with a reason, under the rules.
function planFromThoughts(words, thoughts, { perWord, silences } = {}) {
  const answers = thoughts.filter((t) => t.kind === "answer");
  const baseline = perWord ? { energyDb: stats(answers.flatMap((t) => t.indices.map((i) => perWord[i].energyDb))), f0: stats(answers.flatMap((t) => t.indices.map((i) => perWord[i].f0Median))) } : null;
  const qual = new Map(thoughts.map((t) => [t.id, qualify(words, t, perWord, baseline, silences)]));
  const drop = [], keep = [], snapNotes = [];
  // take groups: a thought and everything that points at it (or at the same target)
  const groupOf = new Map();
  thoughts.forEach((t) => { const key = t.retake_of && thoughts.some((x) => x.id === t.retake_of) ? t.retake_of : t.id; if (!groupOf.has(key)) groupOf.set(key, []); groupOf.get(key).push(t); });
  thoughts.forEach((t) => { if (t.retake_of && groupOf.has(t.retake_of) && !groupOf.get(t.retake_of).includes(t)) groupOf.get(t.retake_of).push(t); });
  const decided = new Set();
  for (const [, group] of groupOf) {
    const members = group.filter((t) => !decided.has(t.id)); if (!members.length) continue;
    members.forEach((t) => decided.add(t.id));
    if (members.length === 1) continue;
    let best = members[0];
    members.forEach((t) => { const a = qual.get(t.id), b = qual.get(best.id); if (moreFluent(a, b) || (!moreFluent(b, a) && t.start > best.start)) best = t; });
    members.forEach((t) => { if (t !== best) t.dropReason = "take of the same line; kept " + best.id + " (fewer restarts, less pause, faster)"; });
  }
  thoughts.forEach((t) => {
    const q = qual.get(t.id);
    if (t.kind === "production") { drop.push({ id: t.id, start: t.start, end: t.end, text: t.text, reason: "production: between-take chatter" }); return; }
    if (t.dropReason) { drop.push({ id: t.id, start: t.start, end: t.end, text: t.text, reason: t.dropReason }); return; }
    q.restarts.forEach((r) => drop.push({ id: t.id, start: r.cutStart, end: r.cutEnd, text: r.phrase, reason: "failed restart inside the thought (first attempt cut, retake kept)" }));
    q.pieces.forEach((p) => {
      const resolved = silences !== undefined ? snapSpan(p.start, p.end, silences) : { start: p.start, end: p.end, notes: [] };
      snapNotes.push(...resolved.notes.map(n => t.id + ": " + n));
      keep.push({ ...p, id: t.id, label: t.label, start: resolved.start, end: resolved.end, delivery: q.delivery });
    });
  });
  keep.sort((a, b) => a.start - b.start);
  // ranges under the editors' rules
  const ranges = [], notes = snapNotes;
  keep.forEach((k) => {
    const r = { start: Math.max(0, k.start - PAD), end: k.end + PAD };
    const last = ranges[ranges.length - 1];
    if (last) {
      const gap = r.start - last.end;
      if (gap <= CHEAP_CUT) { last.end = Math.max(last.end, r.end); return; } // never a cut that removes only a second of silence
      if (gap <= PACING_REVIEW) { notes.push("pause of " + gap.toFixed(1) + "s kept before " + k.start.toFixed(2) + "s (1-2 s silences are a finishing decision, not a rough-cut cut)"); last.end = Math.max(last.end, r.end); return; }
    }
    // Keep word provenance: a snapped boundary can move beyond that word's timestamp.
    const wi = k.startIndex;
    const pause = silences !== undefined ? pauseBefore(k.start, k.rawStart, silences) : (wi > 0 ? Math.max(0, k.start - words[wi - 1].end) : k.start);
    if ((silences !== undefined || wi > 0) && pause < CUT_IN_PAUSE) notes.push("cut-in at " + k.start.toFixed(2) + "s follows only " + pause.toFixed(2) + "s of pause; editors cut in after 0.3 s or more: listen to this seam");
    ranges.push(r);
  });
  return { keep, drop, ranges, notes, problems: [] };
}

const f = (n) => n.toFixed(2) + "s";
function report(plan) {
  const kept = plan.keep.map((k, i) => (i + 1) + ". " + f(k.start) + "-" + f(k.end) + "  [" + k.id + (k.label ? " " + k.label : "") + "]  " + k.text);
  const dropped = plan.drop.map((d) => "  - " + f(d.start) + "-" + f(d.end) + "  " + d.reason + ": \"" + d.text.slice(0, 80) + (d.text.length > 80 ? "…" : "") + "\"");
  const total = plan.ranges.reduce((n, r) => n + (r.end - r.start), 0);
  return "Kept (" + plan.keep.length + " piece(s), " + total.toFixed(1) + "s in " + plan.ranges.length + " range(s); failed restarts cut inside a thought, otherwise cuts only between thoughts):\n" + kept.join("\n") + (dropped.length ? "\nDropped (" + dropped.length + "):\n" + dropped.join("\n") : "\nDropped: nothing") + (plan.notes.length ? "\nListen to:\n  - " + plan.notes.join("\n  - ") : "");
}

module.exports = { findRestarts, validateDraft, qualify, planFromThoughts, report, CRUMBS, CUT_IN_PAUSE, CHEAP_CUT, PACING_REVIEW, PAD };
