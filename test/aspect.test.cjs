const test = require("node:test");
const assert = require("node:assert/strict");
// sizeFromAspect lives in panel.js (browser context); mirror the rule here to pin it.
function sizeFromAspect(aspect) {
  const m = /^\s*([\d.]+)\s*[:x\/]\s*([\d.]+)\s*$/.exec(String(aspect || ""));
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]); if (!(a > 0 && b > 0)) return null;
  const even = (n) => Math.round(n / 2) * 2;
  return a < b ? { width: 1080, height: even(1080 * b / a) } : a === b ? { width: 1080, height: 1080 } : { width: 1920, height: even(1920 * b / a) };
}
test("aspect strings map to sensible frame sizes", () => {
  assert.deepEqual(sizeFromAspect("9:16"), { width: 1080, height: 1920 });
  assert.deepEqual(sizeFromAspect("4:5"), { width: 1080, height: 1350 });
  assert.deepEqual(sizeFromAspect("1:1"), { width: 1080, height: 1080 });
  assert.deepEqual(sizeFromAspect("16:9"), { width: 1920, height: 1080 });
  assert.deepEqual(sizeFromAspect("2.39:1"), { width: 1920, height: 804 });
  assert.equal(sizeFromAspect("wide"), null);
});
