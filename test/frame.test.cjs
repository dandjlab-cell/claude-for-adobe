const test = require("node:test");
const assert = require("node:assert/strict");
const { toFrame, visibleSourceRect, roiInFrame, inside, blankCanvas, fitRegion } = require("../src/frame.cjs");

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, a + " vs " + b);

test("visible source rect inverts toFrame at the frame edges", () => {
  const t = { srcW: 3024, srcH: 1964, frameW: 1080, frameH: 1920, x: 1.42, y: 0.585, scale: 100 };
  const v = visibleSourceRect(t);
  near(toFrame(t, v.x0, v.y0).X, 0); near(toFrame(t, v.x0, v.y0).Y, 0);
  near(toFrame(t, v.x1, v.y1).X, 1080); near(toFrame(t, v.x1, v.y1).Y, 1920);
  // At scale 100 a 1080-wide window of the 3024 source is visible.
  near(v.x1 - v.x0, 1080); near(v.y1 - v.y0, 1920);
});

test("fitRegion puts the panel's interaction row inside the upper safe band (the 2026-09-05 screen-recording case)", () => {
  // Safe rect from the project note, upper band, as frame fractions.
  const target = { x0: 0.037, y0: 0.1484, x1: 0.963, y1: 0.4385 };
  // Interaction row in source pixels: selector + model dropdown + open list.
  const roi = { x0: 27, y0: 270, x1: 1008, y1: 640 };
  const r = fitRegion({ srcW: 3024, srcH: 1964, frameW: 1080, frameH: 1920, roi, target, maxScale: 100 });
  assert.ok(r.fits, JSON.stringify(r.roiFrame));
  assert.ok(r.scale <= 100 && r.scale > 90, "scale " + r.scale);
  assert.ok(inside(r.roiFrame, target));
  // The frame shows blank canvas above the source when the row is that high: reported, not hidden.
  assert.ok(r.blank.top >= 0);
  // Centred in the band.
  near((r.roiFrame.x0 + r.roiFrame.x1) / 2, (target.x0 + target.x1) / 2, 1e-6);
  near((r.roiFrame.y0 + r.roiFrame.y1) / 2, (target.y0 + target.y1) / 2, 1e-6);
});

test("fitRegion caps the scale and reports when the region cannot fit", () => {
  const target = { x0: 0.037, y0: 0.1484, x1: 0.963, y1: 0.4385 };
  const r = fitRegion({ srcW: 1920, srcH: 1080, frameW: 1080, frameH: 1920, roi: { x0: 0, y0: 0, x1: 1920, y1: 1080 }, target, maxScale: 100 });
  assert.ok(r.scale < 100);
  assert.ok(r.fits);
  const big = fitRegion({ srcW: 1920, srcH: 1080, frameW: 1080, frameH: 1920, roi: { x0: 0, y0: 0, x1: 400, y1: 300 }, target, maxScale: 50 });
  assert.equal(big.scale, 50);
  assert.ok(big.fits);
  const tooBig = fitRegion({ srcW: 1920, srcH: 1080, frameW: 1080, frameH: 1920, roi: { x0: 0, y0: 0, x1: 1920, y1: 1080 }, target, maxScale: 100, margin: 0 });
  assert.ok(tooBig.fits);
  const forced = { ...tooBig, scale: 100 };
  const t = { srcW: 1920, srcH: 1080, frameW: 1080, frameH: 1920, x: forced.x, y: forced.y, scale: 100 };
  assert.equal(inside(roiInFrame(t, { x0: 0, y0: 0, x1: 1920, y1: 1080 }), target), false);
  assert.ok(blankCanvas({ srcW: 1920, srcH: 1080, frameW: 1080, frameH: 1920, x: 0.5, y: 0.5, scale: 56.25 }).top > 0.3);
});
