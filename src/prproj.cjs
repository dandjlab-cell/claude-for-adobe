// The project file as a third way into Premiere. A .prproj is gzipped XML; captions keep their style in a
// FlatBuffers block per caption. Fields were located by A/B diffs of saved projects (2026-09-05): move a caption
// up -> one float changes; press the middle zone button -> one int changes (and the table is re-laid out);
// font size 50 -> 30 -> one float. Writes are in place, same byte length, so the layout never moves.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const MAGIC = 0x11223344; // 8-byte size prefix, then this, then the FlatBuffer

function readProjectXml(file) { return zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"); }
function writeProjectXml(file, xml) {
  const tmp = file + ".claude-tmp";
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(xml, "utf8"), { level: 6 }));
  fs.renameSync(tmp, file);
}

// Caption blocks: CaptionDataClipTrackItem -> BlockVector -> BlockVectorItem ObjectRef -> Block/FormattedTextData.
function captionBlocks(xml) {
  const out = [];
  const items = xml.matchAll(/<CaptionDataClipTrackItem\b[^>]*>([\s\S]*?)<\/CaptionDataClipTrackItem>/g);
  for (const it of items) {
    for (const ref of it[1].matchAll(/BlockVectorItem Index="\d+" ObjectRef="(\d+)"/g)) {
      const re = new RegExp('(<Block ObjectID="' + ref[1] + '"[^>]*>[\\s\\S]*?<FormattedTextData[^>]*>)([^<]+)(</FormattedTextData>)');
      const m = re.exec(xml);
      if (m) out.push({ id: ref[1], b64: m[2], start: m.index + m[1].length, end: m.index + m[1].length + m[2].length });
    }
  }
  return out;
}

// ---- FlatBuffers addressing: a path of vtable slots from the root; "[k]" steps into element k of a vector.
function rootTable(b) {
  if (b.readUInt32LE(8) !== MAGIC) throw new Error("not a Premiere text block");
  return 12 + b.readUInt32LE(12);
}
function fieldOffset(b, table, slot) {
  const vt = table - b.readInt32LE(table);
  const vs = b.readUInt16LE(vt);
  if (4 + 2 * slot + 2 > vs) return null;
  const off = b.readUInt16LE(vt + 4 + 2 * slot);
  return off ? table + off : null;
}
function resolve(b, pathSpec) {
  let at = rootTable(b);
  for (let i = 0; i < pathSpec.length; i++) {
    const step = pathSpec[i];
    if (typeof step === "string") { // vector element: `at` is the vector's uoffset field
      const vec = at + b.readUInt32LE(at); const k = Number(step.slice(1, -1));
      if (k >= b.readUInt32LE(vec)) return null;
      const e = vec + 4 + 4 * k; at = e + b.readUInt32LE(e); continue;
    }
    const f = fieldOffset(b, at, step);
    if (f === null) return null;
    if (i === pathSpec.length - 1) return f;
    const next = pathSpec[i + 1];
    at = typeof next === "string" ? f : f + b.readUInt32LE(f); // table reference, or leave for the vector step
  }
  return at;
}

const PATHS = { y: [0, 33, 2], zone: [0, 5], size: [0, 0, "[0]", 1, 1] };
const ZONES = { 0: "top", 1: "middle", 2: "bottom" };

function captionStyle(b64) {
  const b = Buffer.from(String(b64).replace(/\s+/g, ""), "base64");
  const y = resolve(b, PATHS.y), zone = resolve(b, PATHS.zone), size = resolve(b, PATHS.size);
  return { y: y === null ? null : b.readFloatLE(y), zone: zone === null ? null : ZONES[b.readInt32LE(zone)] || String(b.readInt32LE(zone)), size: size === null ? null : b.readFloatLE(size) };
}
// In-place: same bytes, new values. Returns the new base64 or null when a field is missing.
function setCaptionStyle(b64, { y, size } = {}) {
  const b = Buffer.from(String(b64).replace(/\s+/g, ""), "base64");
  if (y !== undefined && y !== null) { const o = resolve(b, PATHS.y); if (o === null) return null; b.writeFloatLE(Number(y), o); }
  if (size !== undefined && size !== null) { const o = resolve(b, PATHS.size); if (o === null) return null; b.writeFloatLE(Number(size), o); }
  return b.toString("base64");
}

// Apply a style change to every caption in the file's XML. Returns { xml, changed, skipped }.
function updateCaptionStyles(xml, change) {
  const blocks = captionBlocks(xml).sort((a, b) => b.start - a.start); // splice from the end so offsets hold
  let changed = 0, skipped = 0;
  for (const blk of blocks) {
    const next = setCaptionStyle(blk.b64, change);
    if (next === null) { skipped++; continue; }
    const lead = /^\s*/.exec(blk.b64)[0], trail = /\s*$/.exec(blk.b64)[0]; // keep Premiere's own line wrapping around the payload
    xml = xml.slice(0, blk.start) + lead + next + trail + xml.slice(blk.end);
    changed++;
  }
  return { xml, changed, skipped };
}

module.exports = { MAGIC, PATHS, ZONES, captionBlocks, captionStyle, setCaptionStyle, updateCaptionStyles, readProjectXml, writeProjectXml, resolve, rootTable };
