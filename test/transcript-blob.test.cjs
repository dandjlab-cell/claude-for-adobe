const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeTranscriptBlob, TICKS_PER_SECOND } = require("../src/transcript-blob.cjs");

// Minimal V216-shaped blob: one Type A word table (vtable [6,7,8,12,16,24]) + one meta string.
function blob(words) {
  const parts = [];
  let pos = 0;
  const push = (b) => { parts.push(b); pos += b.length; return pos - b.length; };
  const str = (s) => { const b = Buffer.alloc(4 + s.length + 1); b.writeUInt32LE(s.length, 0); b.write(s, 4, "latin1"); return b; };
  push(str("en-us"));
  words.forEach((w) => {
    const vt = Buffer.alloc(4 + 6 * 2); vt.writeUInt16LE(vt.length, 0); vt.writeUInt16LE(32, 2);
    [6, 7, 8, 12, 16, 24].forEach((fo, i) => vt.writeUInt16LE(fo, 4 + i * 2));
    const vtOff = push(vt);
    const tbl = Buffer.alloc(32);
    const tblOff = pos;
    tbl.writeInt32LE(tblOff - vtOff, 0); tbl[6] = 1; tbl[7] = 1;
    tbl.writeFloatLE(w.confidence, 12);
    tbl.writeBigUInt64LE(BigInt(Math.round(w.start * 1e4)) * TICKS_PER_SECOND / 10000n, 16);
    tbl.writeBigUInt64LE(BigInt(Math.round(w.duration * 1e4)) * TICKS_PER_SECOND / 10000n, 24);
    const s = str(w.text);
    tbl.writeUInt32LE(32 - 8, 8); // string follows the table immediately
    push(tbl); push(s);
  });
  return Buffer.concat(parts);
}

test("decodeTranscriptBlob reads word tables and sorts by start", () => {
  const b = blob([{ text: "world", start: 1.5, duration: 0.25, confidence: 0.5 }, { text: "hello", start: 1.0, duration: 0.4, confidence: 1 }]);
  assert.deepEqual(decodeTranscriptBlob(b), [
    { text: "hello", start: 1.0, end: 1.4, duration: 0.4, confidence: 1 },
    { text: "world", start: 1.5, end: 1.75, duration: 0.25, confidence: 0.5 },
  ]);
});
