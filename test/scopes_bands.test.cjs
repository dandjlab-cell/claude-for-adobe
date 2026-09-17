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
  // warm (scene color), the RANK band says neutral (the blacks are black) - the canon reads the latter.
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

test("a channel on the floor is counted, so a curve that crushes two channels of a colored surface is seen", () => {
  const m = measure(frame([1000, 60, 0, 0], [1000, 120, 120, 120]));
  assert.equal(m.crushed, 0, "luma is not at the floor: red carries it");
  assert.ok(Math.abs(m.floor.green - 50) < 1 && Math.abs(m.floor.blue - 50) < 1 && m.floor.red === 0, JSON.stringify(m.floor));
  const { damage } = require("../src/grade.cjs");
  assert.ok(damage(m).crushed > 49, "and the guard treats it as crushed");
});

test("the whites reference is the brightest 1% when it has enough pixels, the 3% otherwise", () => {
  const { STATISTICS } = require("../src/grade.cjs");
  const { castAt } = require("../src/wheels.cjs");
  const f = { red: { p99: 90 }, green: { p99: 90 }, blue: { p99: 90 }, bands: { whites: { share: 3, rb: -14, g: 2.7 }, whites1: { share: 1, rb: -7.5, g: 1.2 }, blacks: { share: 3, rb: -30, g: -7 } } };
  assert.equal(STATISTICS.whitesRB(f), -7.5, "a specular reflects the light: the canon's reference");
  assert.deepEqual(castAt(f, "highlights"), [-7.5, 1.2]);
  const thin = { ...f, bands: { ...f.bands, whites1: { share: 0.2, rb: 30, g: 0 } } };
  assert.equal(STATISTICS.whitesRB(thin), -14, "too few pixels in the 1% band: the 3% is used");
  assert.deepEqual(castAt(f, "shadows"), [-30, -7], "the blacks stay at 3%");
});

// The paired bottoms: the darkest 3% as channel LEVELS on one set of pixels. bands.blacks gives the cast
// (a difference) from a sample that empties as a channel crushes; neutralBottoms needs levels, and a level
// is readable even at 0. Built from pixels whose answer is known by construction.
test("a band's levels are the median of each channel over the SAME pixels, clamped ones included", () => {
  const { measure } = require("../src/scopes.cjs");
  // 4% of the frame is a dark blue-lifted pixel (R 5, G 8, B 20), the rest mid grey. The darkest 3% can
  // only be drawn from the dark pixels, so the band's levels must be exactly those three values.
  const n = 10000, rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const dark = i < 400;
    rgb[i * 3] = dark ? 5 : 128; rgb[i * 3 + 1] = dark ? 8 : 128; rgb[i * 3 + 2] = dark ? 20 : 128;
  }
  const b = measure(rgb).bands.blacks;
  const to100 = (v) => Math.round(v / 255 * 1000) / 10;
  assert.deepEqual(b.levels, { red: to100(5), green: to100(8), blue: to100(20) }, "each channel's own median on the band's pixels");
  assert.ok(b.levels.blue - b.levels.red > 5, "and the blue lift is visible as a level gap, which is what a per-channel toe closes");
  assert.equal(b.readable, 100, "nothing is clamped here, so the cast statistic sees the whole band");
  assert.equal(b.rb, to100(20 - 5), "the cast agrees with the levels while nothing is on the floor");
});

test("levels survive the crush that blinds the cast - the curveToe survivorship trap", () => {
  const { measure } = require("../src/scopes.cjs");
  // Same frame, but blue has been crushed to 0 on the dark pixels: the cast histogram drops every one of
  // them, so `rb` is no longer about this band at all - while the levels still say blue is on the floor.
  const n = 10000, rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const dark = i < 400;
    rgb[i * 3] = dark ? 5 : 128; rgb[i * 3 + 1] = dark ? 8 : 128; rgb[i * 3 + 2] = dark ? 0 : 128;
  }
  const b = measure(rgb).bands.blacks;
  assert.equal(b.levels.blue, 0, "the level tells the truth: blue is at 0");
  assert.equal(b.readable, 0, "and says the cast figure has nothing left to stand on");
  assert.equal(b.rb, null, "which is exactly the x=0.2 row of curveToe");
});

// The cast statistic does not merely go blind as an end is crushed — it RECOVERS, and reports its
// cleanest number on the most damaged frame. Measured on C187 @22.02s across the Master toe
// (`curveToeC187`): readable 100 → 86 → 31 → 1 → 1 → 6 → 10 while blue's floor share runs
// 0 → 0.43 → 3.02 → 10.96 → 18.61 → 27.76 → 45.9, and the cast reads −29.8 → … → −6.7. Once blue is
// floored across half the dark pixels there is no blue left to differ from red. Anything gating on a
// small cast would rank the worst setting as the most neutral.
test("a destroyed parade end is refused, not reported as neutral", () => {
  const { verdict, castTrust } = require("../src/grade_rules.cjs");
  const frameAt = (rb, readable, floorBlue) => ({
    luma: { min: 1, p1: 4, p50: 52, p99: 91, max: 95 },
    red: { mean: 50, p1: 5, p99: 91 }, green: { mean: 50, p1: 5, p99: 91 }, blue: { mean: 50, p1: 0, p99: 91 },
    saturation: { p50: 20, p99: 40 }, cast: { cb: 0, cr: 0 }, clipped: { red: 0, green: 0, blue: 0 },
    floor: { red: 0, green: 0, blue: floorBlue }, crushed: 0,
    bands: { blacks: { share: 3, readable, rb, g: 0, levels: { red: 5, green: 5, blue: 5 } },
             whites: { share: 3, readable: 100, rb: 0, g: 0, levels: { red: 90, green: 90, blue: 90 } } },
  });
  // The real rows, with the real numbers. The x=0.35 row reads the SMALLEST cast of the three.
  const worst = frameAt(-6.7, 10, 45.9);   // x=0.35, 45.9% of blue gone
  const bad = frameAt(-31, 1, 10.96);      // x=0.2
  const ok = frameAt(-0.4, 100, 0);        // genuinely clean
  assert.equal(castTrust(worst, "shadows").trusted, false, "the flattering row is refused");
  assert.equal(castTrust(bad, "shadows").trusted, false);
  assert.equal(castTrust(ok, "shadows").trusted, true, "and a clean frame still reads normally");
  assert.equal(verdict(ok, "frame").balanced, true);
  for (const f of [worst, bad]) {
    const v = verdict(f, "frame");
    assert.equal(v.balanced, false, "a crushed end can never be balanced");
    assert.ok(v.notes.some((n) => /blacks cannot be read/.test(n)), v.notes.join(" | "));
    assert.ok(!v.notes.some((n) => /blacks (blue|warm) by/.test(n)), "and the untrustworthy number is not printed as if it meant something");
  }
  // A frame with no bands block at all is a different case - castAt falls back to channel percentiles,
  // which is cruder but not corrupted - and must not be caught by this guard.
  const noBands = { luma: { min: 1, p1: 4, p50: 52, p99: 91, max: 95 }, red: { mean: 50, p1: 5, p99: 90 },
    green: { mean: 50, p1: 5, p99: 90 }, blue: { mean: 50, p1: 5, p99: 90 }, saturation: { p50: 20 },
    cast: { cb: 0, cr: 0 }, clipped: { red: 0, green: 0, blue: 0 }, crushed: 0 };
  assert.equal(castTrust(noBands, "shadows").trusted, true);
  assert.equal(castTrust(noBands, "shadows").noBands, true);
});
