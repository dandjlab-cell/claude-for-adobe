// Words -> caption cues -> SRT. Cues break at sentence ends, gaps, a character budget, or a max duration.
const MAX_CHARS = 32, MAX_LINES = 2, MAX_SECONDS = 5, GAP = 0.7;

function cuesFromWords(words, { maxChars = MAX_CHARS, maxLines = MAX_LINES, maxSeconds = MAX_SECONDS, gap = GAP } = {}) {
  const sorted = [...words].filter((w) => Number.isFinite(w.start) && /\S/.test(w.text || "")).sort((a, b) => a.start - b.start);
  const cues = [];
  let cur = null;
  const budget = maxChars * maxLines;
  sorted.forEach((w) => {
    const text = String(w.text).trim();
    const end = Number.isFinite(w.end) ? w.end : w.start;
    const wouldBe = cur ? cur.text + " " + text : text;
    const breakHere = cur && (w.start - cur.end >= gap || wouldBe.length > budget || end - cur.start > maxSeconds || /[.!?]$/.test(cur.last));
    if (breakHere) { cues.push(cur); cur = null; }
    if (!cur) cur = { start: w.start, end, text, last: text };
    else { cur.text = wouldBe; cur.end = end; cur.last = text; }
  });
  if (cur) cues.push(cur);
  // Minimum on-screen time and no overlaps.
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.end - c.start < 0.8) c.end = c.start + 0.8;
    if (i + 1 < cues.length && c.end > cues[i + 1].start) c.end = Math.max(c.start + 0.3, cues[i + 1].start - 0.05);
    c.lines = wrap(c.text, maxChars, maxLines);
  }
  return cues.map(({ start, end, lines }) => ({ start, end, lines }));
}

// Balanced wrap: when a cue needs two lines, split at the word boundary that makes the lines most even
// (broadcast style), rather than filling the first line and leaving a stub on the second.
function wrap(text, maxChars, maxLines) {
  const words = text.split(" ");
  if (text.length <= maxChars || maxLines === 1 || words.length < 2) return [text];
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" "), l2 = words.slice(i).join(" ");
    const score = Math.max(l1.length, l2.length) + Math.abs(l1.length - l2.length) * 0.25;
    if (!best || score < best.score) best = { score, lines: [l1, l2] };
  }
  return best.lines;
}

const srtTime = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0") + "," + String(r).padStart(3, "0"); };
function toSRT(cues) { return cues.map((c, i) => (i + 1) + "\n" + srtTime(c.start) + " --> " + srtTime(c.end) + "\n" + c.lines.join("\n") + "\n").join("\n") + "\n"; }

module.exports = { MAX_CHARS, MAX_LINES, MAX_SECONDS, cuesFromWords, toSRT, wrap };
