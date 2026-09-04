const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MAGIC, parsePeakFile, peakWindows, findPeakFile } = require("../src/pek.cjs");

function synthPek(channels, pairs, fill) {
  const buf = Buffer.alloc(0x44 + channels * pairs * 4);
  buf.writeUInt32LE(MAGIC, 0); buf.writeUInt32LE(channels, 8); buf.writeUInt32LE(channels * pairs * 4, 0x40);
  for (let c = 0; c < channels; c++) for (let i = 0; i < pairs; i++) {
    const [mx, mn] = fill(c, i);
    buf.writeInt16LE(mx, 0x44 + (c * pairs + i) * 4); buf.writeInt16LE(mn, 0x44 + (c * pairs + i) * 4 + 2);
  }
  return buf;
}

test("parses channel-sequential int16 pairs and windows them", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pek-"));
  const file = path.join(dir, "clip.mov 48000.pek");
  // 2 channels, 3 s at 48k = 562.5 pairs -> 562; loud in second 1..2 on channel 1 only
  fs.writeFileSync(file, synthPek(2, 562, (c, i) => (c === 1 && i >= 187 && i < 375 ? [16384, -16384] : [10, -10])));
  const p = parsePeakFile(file);
  assert.equal(p.channels, 2); assert.equal(p.pairsPerChannel, 562);
  const w = peakWindows(p, 48000, 0, 3, 0.5, 100);
  assert.equal(w.length, 6);
  assert.deepEqual(w.map((x) => Math.round(x.t * 10) / 10), [100, 100.5, 101, 101.5, 102, 102.5]);
  assert.ok(w[0].peak < 0.001 && w[2].peak > 0.49 && w[3].peak > 0.49 && w[4].peak < 0.001, JSON.stringify(w));
  assert.equal(findPeakFile("/x/clip.mov", 48000, path.join(dir, "none.prproj")), null);
  fs.mkdirSync(path.join(dir, "Adobe Premiere Pro Audio Previews"));
  fs.renameSync(file, path.join(dir, "Adobe Premiere Pro Audio Previews", "clip.mov 48000_2.pek"));
  assert.equal(findPeakFile("/x/clip.mov", 48000, path.join(dir, "p.prproj")), path.join(dir, "Adobe Premiere Pro Audio Previews", "clip.mov 48000_2.pek"));
});

test("rejects non-peak files", () => {
  const file = path.join(os.tmpdir(), "not-a-pek-" + Date.now() + ".pek");
  fs.writeFileSync(file, Buffer.alloc(100));
  assert.throws(() => parsePeakFile(file), /Not a Premiere peak file/);
});
