// Repeated takes: a speaker says a line, stumbles, says it again. The transcript shows it as two utterances close
// in time with mostly the same words. This finds them and picks the take to keep: the most complete one (most
// words, fewest fillers, a finished ending), later take on a tie because editors re-do what was worse.
// Words are timeline words {text, start, end}. Pure; the panel supplies the words and applies the cuts.
"use strict";
const { FILLERS } = require("./transcript.cjs");

const STOP = new Set(["the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at", "is", "it", "that", "this", "i", "you", "we", "they", "he", "she", "be", "was", "are", "for", "with", "as", "like", "just", "really", "very"]);
const norm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");
const isFiller = (t) => FILLERS.includes(norm(t));

// Utterances: runs of words split at pauses of `gap` seconds or more, or at a sentence-ending mark.
function utterances(words, gap = 0.7) {
  const out = [];
  let cur = null;
  for (const w of words) {
    const t = String(w.text || "");
    if (!cur || w.start - cur.end >= gap) { if (cur) out.push(cur); cur = { start: w.start, end: w.end, words: [] }; }
    cur.words.push(w); cur.end = Math.max(cur.end, w.end);
    if (/[.?!]$/.test(t.trim())) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((u) => ({ ...u, text: u.words.map((w) => w.text).join(" "), tokens: u.words.map((w) => norm(w.text)).filter((x) => x && !STOP.has(x) && !FILLERS.includes(x)), fillers: u.words.filter((w) => isFiller(w.text)).length }));
}

// Similarity of two utterances: overlap of content tokens over the smaller set (a restart is contained in the retake).
function similarity(a, b) {
  const A = new Set(a.tokens), B = new Set(b.tokens);
  if (!A.size || !B.size) return 0;
  let hit = 0; A.forEach((t) => { if (B.has(t)) hit++; });
  return hit / Math.min(A.size, B.size);
}

// Score a take for "most complete": content words, minus fillers, plus a finished ending.
function score(u) {
  const finished = /[.?!]$/.test(u.text.trim()) ? 2 : 0;
  return u.tokens.length - 2 * u.fillers + finished + (u.end - u.start > 1 ? 0 : -2);
}

// Groups of repeated takes: [{ candidates: [utterance+score], keep: index, remove: [{start,end,text}] }].
// An utterance joins a group when it is similar (>= minSim) to any member within `window` seconds and has at
// least `minTokens` content words (short phrases repeat naturally and are not takes).
function findTakes(words, { gap = 0.7, window = 90, minSim = 0.6, minTokens = 3 } = {}) {
  const us = utterances(words, gap).filter((u) => u.tokens.length >= minTokens);
  const groupOf = new Array(us.length).fill(-1);
  const groups = [];
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length && us[j].start - us[i].end <= window; j++) {
      if (similarity(us[i], us[j]) >= minSim) {
        let g = groupOf[i] >= 0 ? groupOf[i] : groupOf[j] >= 0 ? groupOf[j] : -1;
        if (g < 0) { g = groups.length; groups.push([]); }
        for (const k of [i, j]) if (groupOf[k] < 0) { groupOf[k] = g; groups[g].push(k); }
      }
    }
  }
  return groups.map((idx) => {
    const cands = idx.sort((a, b) => a - b).map((k) => ({ ...us[k], score: score(us[k]) }));
    let keep = 0;
    cands.forEach((c, i) => { if (c.score > cands[keep].score || (c.score === cands[keep].score && i > keep)) keep = i; });
    return { candidates: cands.map((c) => ({ start: c.start, end: c.end, text: c.text, words: c.words.length, fillers: c.fillers, score: c.score })), keep, remove: cands.filter((_, i) => i !== keep).map((c) => ({ start: c.start, end: c.end, text: c.text })) };
  }).filter((g) => g.candidates.length > 1);
}

const f = (n) => n.toFixed(2) + "s";
function report(groups) {
  if (!groups.length) return "No repeated takes found.";
  return groups.map((g, gi) => "Take group " + (gi + 1) + " (" + g.candidates.length + " takes):\n" + g.candidates.map((c, i) => "  " + (i === g.keep ? "KEEP  " : "drop  ") + f(c.start) + "-" + f(c.end) + " (" + c.words + " words, " + c.fillers + " fillers, score " + c.score + "): \"" + c.text.slice(0, 90) + (c.text.length > 90 ? "…" : "") + "\"").join("\n")).join("\n");
}

module.exports = { utterances, similarity, score, findTakes, report };
