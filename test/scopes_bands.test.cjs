"use strict";
// Casts by luma band come from PAIRED pixels: the same pixel's B-R, not the difference of two channels'
// separately taken percentiles. The 2026-09-15 grade runs read a warm bottom getting warmer after a
// correct Shadows pad because Blacks had put the blue channel on the floor; a clamped pixel is left out.
const test = require("node:test");
const assert = require("node:assert/strict");
const { measure } = require("../src/scopes.cjs");

const frame = (...regions) => { const px = []; for (const [count, r, g, b] of regions) for (let i = 0; i < count; i++) px.push(r, g, b); return Buffer.from(px); };

test("a warm dark region and a blue bright region read as a warm shadows band and a blue highlights band", () => {
  const m = measure(frame([1000, 50, 35, 25], [1000, 195, 205, 215]));
  assert.ok(m.bands.shadows.rb < -5, "shadows B-R warm: " + m.bands.shadows.rb);
  assert.ok(m.bands.highlights.rb > 5, "highlights B-R blue: " + m.bands.highlights.rb);
  assert.equal(m.bands.midtones.rb, null, "nothing in the midtones band");
  assert.ok(Math.abs(m.bands.shadows.share - 50) < 1 && Math.abs(m.bands.highlights.share - 50) < 1);
});

test("pixels with a channel on the floor or at the ceiling carry no cast and are left out of the bands", () => {
  const clean = measure(frame([1000, 40, 40, 40]));
  const withFloor = measure(frame([1000, 40, 40, 40], [1000, 60, 40, 0])); // blue crushed: warm-looking, but unreadable
  assert.equal(clean.bands.shadows.rb, 0);
  assert.equal(withFloor.bands.shadows.rb, 0, "the crushed pixels did not drag the band warm: " + withFloor.bands.shadows.rb);
  assert.ok(withFloor.bands.shadows.share < clean.bands.shadows.share, "and they are not counted in the band");
  const withCeiling = measure(frame([1000, 200, 200, 200], [1000, 255, 200, 200]));
  assert.equal(withCeiling.bands.highlights.rb, 0);
});

test("rank bands read the parade's bottoms and tops: the darkest and brightest few percent as pixels", () => {
  // Mostly a warm mid-dark surface, with a small truly dark region that is neutral: the LEVEL band says
  // warm (scene colour), the RANK band says neutral (the blacks are black) - the canon reads the latter.
  const m = measure(frame([3000, 60, 45, 35], [100, 6, 6, 6], [1000, 200, 200, 200]));
  assert.ok(m.bands.shadows.rb < -5, "the 5-30 band is the warm surface: " + m.bands.shadows.rb);
  assert.equal(m.bands.blacks.rb, 0, "the darkest 3% are the neutral blacks");
  assert.equal(m.bands.whites.rb, 0);
  assert.ok(m.bands.blacks.share > 2 && m.bands.blacks.share < 4, "about 3% of the pixels: " + m.bands.blacks.share);
});

test("the green-magenta axis is read the same way", () => {
  const m = measure(frame([1000, 40, 50, 40]));
  assert.ok(m.bands.shadows.g > 3, "green shadows: " + m.bands.shadows.g);
  assert.equal(m.bands.shadows.rb, 0);
});
