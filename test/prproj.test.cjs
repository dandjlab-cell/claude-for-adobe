const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { captionBlocks, captionStyle, setCaptionStyle, updateCaptionStyles, readProjectXml, writeProjectXml } = require("../src/prproj.cjs");

// Fixtures are real saved projects kept OUTSIDE the repo (they carry the editor's own text). The A/B set:
// default, caption dragged up, middle-zone button, font size 30. Tests skip when the folder is absent.
const FIX = process.env.CFA_PRPROJ_FIXTURES || path.join(os.homedir(), "DevApps", "ASI-Evolve", "experiments", "PREMIERE PROJECTS", "TESTS");
const have = (f) => fs.existsSync(path.join(FIX, f));

test("caption style fields read as located by the A/B diffs", { skip: !have("1 caption.prproj") }, () => {
  const style = (f) => captionStyle(captionBlocks(readProjectXml(path.join(FIX, f)))[0].b64);
  const base = style("1 caption.prproj");
  assert.equal(base.zone, "bottom"); assert.ok(Math.abs(base.y - -0.0528) < 0.001, String(base.y)); assert.equal(base.size, 50);
  if (have("1 caption_vertical.prproj")) { const up = style("1 caption_vertical.prproj"); assert.ok(up.y < -0.28 && up.y > -0.30, String(up.y)); assert.equal(up.zone, "bottom"); }
  if (have("1 caption_vertical ZONE middle.prproj")) assert.equal(style("1 caption_vertical ZONE middle.prproj").zone, "middle");
  if (have("1 caption_30 font.prproj")) assert.equal(style("1 caption_30 font.prproj").size, 30);
});

test("setCaptionStyle writes in place and reads back; only caption blocks change", { skip: !have("1 caption.prproj") }, () => {
  const xml = readProjectXml(path.join(FIX, "1 caption.prproj"));
  const blocks = captionBlocks(xml);
  assert.ok(blocks.length >= 1); // "1 caption" is one caption TRACK; every item on it is a caption block
  const b64 = setCaptionStyle(blocks[0].b64, { y: -0.2, size: 36 });
  assert.equal(b64.length, blocks[0].b64.replace(/\s+/g, "").length);
  assert.deepEqual(captionStyle(b64), { y: Math.fround(-0.2), zone: "bottom", size: 36 });
  const r = updateCaptionStyles(xml, { y: -0.25 });
  assert.equal(r.changed, blocks.length); assert.equal(r.skipped, 0);
  blocks.forEach((_, i) => assert.ok(Math.abs(captionStyle(captionBlocks(r.xml)[i].b64).y - -0.25) < 1e-6, "caption " + i));
  assert.equal((r.xml.match(/<FormattedTextData/g) || []).length, (xml.match(/<FormattedTextData/g) || []).length);
  assert.ok(Math.abs(captionStyle(captionBlocks(r.xml)[0].b64).y - -0.25) < 1e-6);
  // Everything outside the caption payloads is byte-identical (the style library and the rest of the project).
  const blank = (s) => { let out = s; captionBlocks(s).sort((a, b) => b.start - a.start).forEach((k) => { out = out.slice(0, k.start) + "#" + out.slice(k.end); }); return out; };
  assert.equal(blank(r.xml), blank(xml));
  // Round trip through gzip.
  const tmp = path.join(os.tmpdir(), "cfa-prproj-test-" + Date.now() + ".prproj");
  writeProjectXml(tmp, r.xml);
  assert.ok(Math.abs(captionStyle(captionBlocks(readProjectXml(tmp))[0].b64).y - -0.25) < 1e-6);
  fs.unlinkSync(tmp);
});
