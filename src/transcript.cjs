// Premiere's own pause detection: gaps between transcript words >= minPause (Text panel default 0.75 s).
// The transcript comes from the saved .prproj (gzipped XML with base64 <TranscriptData> FlatBuffers
// blobs). Decoding the blob: src/transcript-blob.cjs (port of the cracked Python parser).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { decodeTranscriptBlob } = require("./transcript-blob.cjs");

const DEFAULT_MIN_PAUSE = 0.75;

// All transcript blobs in a project file, each with the owning master clip's name and media path.
// Chain (Premiere 26): <TranscriptData> inside ExternallyProvidedTranscriptDocument(id D)
//   <- <TranscriptTextSegments ObjectRef=D> inside TranscriptClip(id T)
//   <- <Clip ObjectRef=T> inside MasterClip(uid M): <Name> + sibling Audio/VideoClip -> Source -> Media ObjectURef -> Media <FilePath>.
// Falls back to the nearest preceding path/title when the chain is missing (older/smaller projects).
function listTranscripts(prprojPath) {
  const xml = zlib.gunzipSync(fs.readFileSync(prprojPath)).toString("latin1");
  const objs = [];
  for (const m of xml.matchAll(/<([A-Za-z:]+)[^>]*?Object(?:U?ID)="([^"]+)"/g)) objs.push({ i: m.index, tag: m[1], id: m[2] });
  const enclosing = (i) => { let lo = 0, hi = objs.length - 1, best = null; while (lo <= hi) { const mid = (lo + hi) >> 1; if (objs[mid].i < i) { best = objs[mid]; lo = mid + 1; } else hi = mid - 1; } return best; };
  const refTo = (tag, id) => { const m = new RegExp("<" + tag + "\\b[^>]*ObjectRef=\"" + id + "\"").exec(xml); return m ? m.index : -1; };
  const element = (tagPattern, attr, id) => {
    const m = new RegExp("<(" + tagPattern + ") " + attr + "=\"" + id + "\"[^>]*>").exec(xml);
    if (!m) return "";
    const end = xml.indexOf("</" + m[1] + ">", m.index);
    return xml.slice(m.index, end > 0 ? end : m.index + 8000);
  };
  const text = (seg, tag) => { const m = new RegExp("<" + tag + ">([^<]*)</" + tag + ">").exec(seg); return m ? m[1] : ""; };
  const out = [];
  const re = /<TranscriptData[^>]*Encoding="base64"[^>]*>([^<]+)<\/TranscriptData>/g;
  let m;
  while ((m = re.exec(xml))) {
    let mediaPath = "", title = "";
    const doc = enclosing(m.index);
    const tsi = doc ? refTo("TranscriptTextSegments", doc.id) : -1;
    const tclip = tsi >= 0 ? enclosing(tsi) : null;
    const ci = tclip ? refTo("Clip", tclip.id) : -1;
    const master = ci >= 0 ? enclosing(ci) : null;
    if (master && master.tag === "MasterClip") {
      const seg = element("MasterClip", "ObjectUID", master.id);
      title = text(seg, "Name");
      for (const c of seg.matchAll(/<Clip\b[^>]*ObjectRef="(\d+)"/g)) {
        if (c[1] === tclip.id) continue;
        const src = /<Source ObjectRef="(\d+)"/.exec(element("[A-Za-z]*Clip", "ObjectID", c[1]));
        const u = src && /<Media ObjectURef="([^"]+)"/.exec(element("[A-Za-z]*MediaSource", "ObjectID", src[1]));
        const media = u ? element("Media", "ObjectUID", u[1]) : "";
        mediaPath = text(media, "ActualMediaFilePath") || text(media, "FilePath");
        if (mediaPath) break;
      }
    }
    if (!mediaPath && !title) {
      const before = xml.slice(Math.max(0, m.index - 20000), m.index);
      const pathHit = [...before.matchAll(/<(?:ActualMediaFilePath|FilePath)>([^<]+)<\/(?:ActualMediaFilePath|FilePath)>/g)].pop();
      const titleHit = [...before.matchAll(/<Title>([^<]+)<\/Title>/g)].pop();
      mediaPath = pathHit ? pathHit[1] : ""; title = titleHit ? titleHit[1] : "";
    }
    out.push({ index: out.length, base64: m[1].trim(), mediaPath, title });
  }
  return out;
}

// Words [{text,start,end,duration,confidence}] in source seconds.
function decodeWords(base64) {
  return decodeTranscriptBlob(Buffer.from(base64, "base64")).filter((w) => w.duration > 0 || /\w/.test(w.text));
}

// Pauses = gaps between consecutive words >= minPause, in the words' own time base.
function pausesFromWords(words, minPause = DEFAULT_MIN_PAUSE) {
  const sorted = [...words].filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end)).sort((a, b) => a.start - b.start);
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].start - sorted[i - 1].end;
    if (gap >= minPause) out.push({ start: sorted[i - 1].end, end: sorted[i].start });
  }
  return out;
}

// Pick the transcript for a clip: by media path, else by title, else the only one.
function transcriptForClip(transcripts, clip) {
  if (!transcripts.length) return null;
  const base = path.basename(clip.mediaPath || "");
  return transcripts.find((t) => t.mediaPath && path.basename(t.mediaPath) === base)
    || transcripts.find((t) => t.title && (t.title === clip.name || t.title === base))
    || (transcripts.length === 1 ? transcripts[0] : null);
}

// Words -> readable lines [{start,end,text}] (offset shifts source seconds to timeline seconds).
// A line breaks at a gap >= maxGap, after sentence punctuation, or at maxWords.
function linesFromWords(words, offset = 0, maxGap = 0.6, maxWords = 14) {
  const sorted = [...words].filter((w) => Number.isFinite(w.start) && /\S/.test(w.text || "")).sort((a, b) => a.start - b.start);
  const lines = [];
  let cur = null;
  sorted.forEach((w) => {
    const end = Number.isFinite(w.end) ? w.end : w.start;
    if (cur && (w.start - cur.srcEnd >= maxGap || cur.n >= maxWords || /[.!?]$/.test(cur.last))) { lines.push(cur); cur = null; }
    if (!cur) cur = { start: w.start + offset, end: end + offset, text: "", n: 0, srcEnd: end, last: "" };
    cur.text += (cur.text ? " " : "") + w.text.trim(); cur.end = end + offset; cur.srcEnd = end; cur.n++; cur.last = w.text.trim();
  });
  if (cur) lines.push(cur);
  return lines.map(({ start, end, text }) => ({ start, end, text }));
}

const tc = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1); };

// Phrase search over words: case-insensitive, punctuation-insensitive, matches consecutive words.
// Returns [{start, end, text}] in the words' own time base (offset applied by the caller).
function findInWords(words, query, offset = 0, limit = 10) {
  const norm = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ").trim();
  const q = norm(query).split(" ").filter(Boolean);
  if (!q.length) return [];
  const sorted = [...words].filter((w) => Number.isFinite(w.start)).sort((a, b) => a.start - b.start);
  const toks = sorted.map((w) => norm(w.text));
  const out = [];
  for (let i = 0; i + q.length <= sorted.length && out.length < limit; i++) {
    let ok = true;
    for (let k = 0; k < q.length; k++) if (toks[i + k] !== q[k]) { ok = false; break; }
    if (ok) out.push({ start: sorted[i].start + offset, end: (sorted[i + q.length - 1].end ?? sorted[i + q.length - 1].start) + offset, text: sorted.slice(Math.max(0, i - 3), i + q.length + 3).map((w) => w.text).join(" ") });
  }
  return out;
}

// Complement of [{start,end}] within [0,total]: the parts to remove when keeping only the given ranges.
function complementRanges(keep, total) {
  const k = keep.map((r) => ({ start: Math.max(0, r.start), end: Math.min(total, r.end) })).filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out = []; let cur = 0;
  k.forEach((r) => { if (r.start > cur) out.push({ start: cur, end: r.start }); cur = Math.max(cur, r.end); });
  if (cur < total) out.push({ start: cur, end: total });
  return out;
}

module.exports = { complementRanges, findInWords, linesFromWords, tc, DEFAULT_MIN_PAUSE, decodeWords, listTranscripts, pausesFromWords, transcriptForClip };
