// Decoder for Premiere's transcript blob (<TranscriptData>, SERIALIZED_TRANSCRIPT_FLAT_BUFFER V216).
// Port of our earlier Python decoder (reverse-engineered 2026-04-29).
// Word tables are FlatBuffers tables with a string uoffset, a float32 confidence, and two uint64 tick
// fields (start, duration); 1 s = 254,016,000,000 ticks. Storage is newest-first; output is sorted.
const TICKS_PER_SECOND = 254016000000n;
const META = new Set(["en-us", "Unknown", "filler"]);

const printable = (buf, a, b) => { for (let i = a; i < b; i++) { const c = buf[i]; if (c < 0x20 || c >= 0x7f) return false; } return true; }; // ponytail: ASCII only, as validated; UTF-8 words are skipped

// Length-prefixed, NUL-terminated strings: offset -> text.
function findStrings(buf, minLen = 1, maxLen = 60) {
  const out = new Map();
  for (let off = 0; off + 5 < buf.length; off++) {
    const len = buf.readUInt32LE(off);
    if (len < minLen || len > maxLen) continue;
    const end = off + 4 + len;
    if (end + 1 > buf.length || buf[end] !== 0 || !printable(buf, off + 4, end)) continue;
    out.set(off, buf.toString("latin1", off + 4, end));
  }
  return out;
}

function readVtable(buf, vt) {
  if (vt < 0 || vt + 4 > buf.length) return null;
  const size = buf.readUInt16LE(vt);
  if (size < 4 || size > 256 || size % 2 || vt + size > buf.length) return null;
  const n = (size - 4) / 2;
  if (n < 1) return null;
  const fields = [];
  for (let i = 0; i < n; i++) fields.push(buf.readUInt16LE(vt + 4 + i * 2));
  return fields;
}

// Table enclosing the string-uoffset field at refOff: try the known field positions.
function tableForStringRef(buf, refOff) {
  for (const fo of [4, 8, 6, 12, 16, 20]) {
    const start = refOff - fo;
    if (start < 0 || start + 4 > buf.length) continue;
    const vt = start - buf.readInt32LE(start);
    if (vt < 0 || vt >= buf.length) continue;
    const fields = readVtable(buf, vt);
    if (fields && fields.includes(fo)) return { start, fields };
  }
  return null;
}

function parseWordTable(buf, start, fields) {
  const fos = [...fields].sort((a, b) => a - b);
  const width = (i) => (i + 1 < fos.length ? fos[i + 1] - fos[i] : 8);
  let textOff = null, confOff = null, startOff = null, durOff = null;
  fos.forEach((fo, i) => {
    const w = width(i);
    if (w === 4 && textOff === null) textOff = fo;
    else if (w === 4 && confOff === null) confOff = fo;
    else if (w === 8 && startOff === null) startOff = fo;
    else if (w === 8 && durOff === null) durOff = fo;
  });
  if (textOff === null || startOff === null) return null;
  const tf = start + textOff;
  if (tf + 4 > buf.length) return null;
  const so = tf + buf.readUInt32LE(tf);
  if (so + 4 > buf.length) return null;
  const len = buf.readUInt32LE(so);
  if (len < 1 || len > 100 || so + 4 + len + 1 > buf.length || !printable(buf, so + 4, so + 4 + len)) return null;
  const text = buf.toString("utf8", so + 4, so + 4 + len);
  const confidence = confOff !== null && start + confOff + 4 <= buf.length ? buf.readFloatLE(start + confOff) : 0;
  if (start + startOff + 8 > buf.length) return null;
  const startS = Number(buf.readBigUInt64LE(start + startOff)) / Number(TICKS_PER_SECOND);
  const durS = durOff !== null && start + durOff + 8 <= buf.length ? Number(buf.readBigUInt64LE(start + durOff)) / Number(TICKS_PER_SECOND) : 0;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  return { text, start: r4(startS), end: r4(startS + durS), duration: r4(durS), confidence: r4(confidence) };
}

// Every word in the blob, sorted by start time.
function decodeTranscriptBlob(buf) {
  const strings = findStrings(buf);
  // One pass over the blob: the first uoffset that lands on each string offset is its reference.
  const refs = new Map();
  for (let f = 0; f + 4 <= buf.length; f++) {
    const v = buf.readUInt32LE(f);
    if (v > 0 && v < buf.length) { const t = f + v; if (strings.has(t) && !refs.has(t)) refs.set(t, f); }
  }
  const words = [];
  for (const [off, text] of strings) {
    if (META.has(text) || !refs.has(off)) continue;
    const t = tableForStringRef(buf, refs.get(off));
    if (!t) continue;
    const w = parseWordTable(buf, t.start, t.fields);
    if (w && w.text === text) words.push(w);
  }
  return words.sort((a, b) => a.start - b.start);
}

module.exports = { decodeTranscriptBlob, findStrings, TICKS_PER_SECOND };
