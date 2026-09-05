// Words -> caption cues -> SRT. Cues break at sentence ends, gaps, a character budget, or a max duration.
const MAX_CHARS = 32, MAX_LINES = 1, MAX_SECONDS = 3, MAX_WORDS = 4, GAP = 0.7;

function cuesFromWords(words, { maxChars = MAX_CHARS, maxLines = MAX_LINES, maxSeconds = MAX_SECONDS, maxWords = MAX_WORDS, gap = GAP } = {}) {
  const sorted = [...words].filter((w) => Number.isFinite(w.start) && /\S/.test(w.text || "")).sort((a, b) => a.start - b.start);
  const cues = [];
  let cur = null;
  const budget = maxChars * maxLines;
  sorted.forEach((w) => {
    const text = String(w.text).trim();
    const end = Number.isFinite(w.end) ? w.end : w.start;
    const wouldBe = cur ? cur.text + " " + text : text;
    const breakHere = cur && (w.start - cur.end >= gap || wouldBe.length > budget || end - cur.start > maxSeconds || /[.!?]$/.test(cur.last) || (maxWords > 0 && cur.n >= maxWords));
    if (breakHere) { cues.push(cur); cur = null; }
    if (!cur) cur = { start: w.start, end, text, last: text, n: 1 };
    else { cur.text = wouldBe; cur.end = end; cur.last = text; cur.n++; }
  });
  if (cur) cues.push(cur);
  // Minimum on-screen time, but never past the next cue's start (one-word cues would otherwise overlap).
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const limit = i + 1 < cues.length ? cues[i + 1].start - 0.001 : Infinity;
    c.end = Math.min(Math.max(c.end, c.start + 0.8), Math.max(limit, c.start + 0.001));
    c.lines = wrap(c.text, maxChars, maxLines);
  }
  return cues.map(({ start, end, lines }) => ({ start, end, lines }));
}

// Balanced wrap: when a cue needs two lines, split at the word boundary that makes the lines most even
// (broadcast style), rather than filling the first line and leaving a stub on the second.
function wrap(text, maxChars, maxLines) {
  const words = text.split(" ");
  if (text.length <= maxChars || maxLines <= 1 || words.length < 2) return [text];
  const most = Math.min(maxLines, words.length);
  let best = null;
  for (let k = 2; k <= most; k++) {
    const lines = k === 2 ? bestSplit(words) : evenLines(words, k);
    const longest = Math.max(...lines.map((l) => l.length));
    const score = longest + (longest > maxChars ? 1000 : 0) + k; // fewest lines that fit, then the most even
    if (!best || score < best.score) best = { score, lines };
  }
  return best.lines;
}
function bestSplit(words) {
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" "), l2 = words.slice(i).join(" ");
    const score = Math.max(l1.length, l2.length) + Math.abs(l1.length - l2.length) * 0.25;
    if (!best || score < best.score) best = { score, lines: [l1, l2] };
  }
  return best.lines;
}
// k lines of roughly equal length, filled left to right; every line gets at least one word.
function evenLines(words, k) {
  const target = words.join(" ").length / k, lines = [];
  let i = 0;
  for (let l = 0; l < k; l++) {
    let line = words[i++];
    while (i < words.length && words.length - i > k - l - 1 && (line.length + 1 + words[i].length) - target < target - line.length) line += " " + words[i++];
    lines.push(line);
  }
  while (i < words.length) lines[lines.length - 1] += " " + words[i++];
  return lines;
}

const srtTime = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0") + "," + String(r).padStart(3, "0"); };
function toSRT(cues) { return cues.map((c, i) => (i + 1) + "\n" + srtTime(c.start) + " --> " + srtTime(c.end) + "\n" + c.lines.join("\n") + "\n").join("\n") + "\n"; }

module.exports = { MAX_CHARS, MAX_LINES, MAX_SECONDS, MAX_WORDS, cuesFromWords, toSRT, wrap };
