// Geometry of a clip's Motion transform. Position (x, y) = where the source's centre sits, as fractions of the
// sequence frame; scale = % of native size. Everything here is arithmetic on those numbers: no looking.
// A transform t = { srcW, srcH, frameW, frameH, x, y, scale }.

// Source pixel (u, v) -> frame pixel.
function toFrame(t, u, v) {
  const k = t.scale / 100;
  return { X: t.x * t.frameW + (u - t.srcW / 2) * k, Y: t.y * t.frameH + (v - t.srcH / 2) * k };
}

// The rectangle of SOURCE pixels currently visible in the frame (may extend past the source when there is blank canvas).
function visibleSourceRect(t) {
  const k = t.scale / 100;
  return {
    x0: t.srcW / 2 - (t.x * t.frameW) / k, y0: t.srcH / 2 - (t.y * t.frameH) / k,
    x1: t.srcW / 2 + (t.frameW - t.x * t.frameW) / k, y1: t.srcH / 2 + (t.frameH - t.y * t.frameH) / k,
  };
}

// Where a source rectangle (px) lands in the frame, as frame fractions.
function roiInFrame(t, roi) {
  const a = toFrame(t, roi.x0, roi.y0), b = toFrame(t, roi.x1, roi.y1);
  return { x0: a.X / t.frameW, y0: a.Y / t.frameH, x1: b.X / t.frameW, y1: b.Y / t.frameH };
}

const inside = (r, box, tol = 0.003) => r.x0 >= box.x0 - tol && r.y0 >= box.y0 - tol && r.x1 <= box.x1 + tol && r.y1 <= box.y1 + tol;

// Blank canvas: how much of the frame (fractions) shows nothing on each side.
function blankCanvas(t) {
  const a = toFrame(t, 0, 0), b = toFrame(t, t.srcW, t.srcH);
  return { top: Math.max(0, a.Y / t.frameH), bottom: Math.max(0, 1 - b.Y / t.frameH), left: Math.max(0, a.X / t.frameW), right: Math.max(0, 1 - b.X / t.frameW) };
}

// The one position and scale that put a source rectangle (roi, px) inside a target rectangle of the frame
// (fractions), centred in it, as large as the target allows up to maxScale, with a margin inside the target.
function fitRegion({ srcW, srcH, frameW, frameH, roi, target, maxScale = 100, margin = 0.03 }) {
  const tw = (target.x1 - target.x0) * frameW * (1 - 2 * margin), th = (target.y1 - target.y0) * frameH * (1 - 2 * margin);
  const rw = roi.x1 - roi.x0, rh = roi.y1 - roi.y0;
  let scale = Math.min(tw / rw, th / rh) * 100;
  if (maxScale) scale = Math.min(scale, maxScale);
  const k = scale / 100;
  const tcx = ((target.x0 + target.x1) / 2) * frameW, tcy = ((target.y0 + target.y1) / 2) * frameH;
  const x = (tcx - ((roi.x0 + roi.x1) / 2 - srcW / 2) * k) / frameW;
  const y = (tcy - ((roi.y0 + roi.y1) / 2 - srcH / 2) * k) / frameH;
  const t = { srcW, srcH, frameW, frameH, x, y, scale };
  const placed = roiInFrame(t, roi);
  return { x, y, scale, roiFrame: placed, fits: inside(placed, target, 0.005), blank: blankCanvas(t) };
}

module.exports = { toFrame, visibleSourceRect, roiInFrame, inside, blankCanvas, fitRegion };
