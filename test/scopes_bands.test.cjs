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

// C229 @9.57s, the frame the pass actually grades, x=0.2 on the anchored Master toe (`blackEndC229`).
// The sharpest form of the defect: the cast does not just shrink as the end is destroyed, it CROSSES ZERO.
// -12.5 -> -13.3 -> -14.1 -> -12.2 -> +4.3 -> +0.4, and that last row has luma p1 0.8 with 9.01% of RED on
// the floor. Read naively it is the best-balanced setting in the sweep - better than neutral's -12.5.
test("the sign-flipped cast on a destroyed frame is refused, not ranked best", () => {
  const { verdict, castTrust } = require("../src/grade_rules.cjs");
  const destroyed = {
    luma: { min: 0, p1: 0.8, p50: 50.2, p99: 75.3, max: 88 },
    red: { mean: 50, p1: 0, p99: 75.3 }, green: { mean: 48, p1: 0.8, p99: 75.3 }, blue: { mean: 44, p1: 0, p99: 75.3 },
    saturation: { p50: 12, p99: 35 }, cast: { cb: -3, cr: 2 }, clipped: { red: 0, green: 0, blue: 0 },
    floor: { red: 9.01, green: 0.6, blue: 7.14 }, crushed: 0,
    bands: { blacks: { share: 3, readable: 4, rb: 0.4, g: 0, levels: { red: 2, green: 1.2, blue: 0 } },
             whites: { share: 3, readable: 100, rb: 0, g: 0, levels: { red: 75, green: 75, blue: 75 } } },
  };
  assert.equal(castTrust(destroyed, "shadows").trusted, false, "0.4 looks neutral and must not be believed");
  const v = verdict(destroyed, "frame");
  assert.equal(v.balanced, false);
  assert.ok(v.notes.some((n) => /blacks cannot be read/.test(n)), v.notes.join(" | "));
  assert.ok(!v.notes.some((n) => /blacks blue by 0\.4/.test(n)), "the flattering number is never printed as a cast");
  // The paired LEVELS still tell the truth on the same frame - red 2, green 1.2, blue 0 - which is why
  // bottomsFor reads those and not rb.
  const lv = destroyed.bands.blacks.levels;
  assert.ok(lv.red > lv.blue, "levels still show red above blue where rb claims near-neutral");
});

// Which signal actually predicts a corrupt cast. Eight rows across three frames, reported cast against the
// truth the paired LEVELS still carry. `readable` is a perfect classifier; the frame-wide damage share is
// worse than useless - it rejects accurate readings and accepts corrupt ones. Flooring a channel only
// corrupts the cast when it removes pixels from the BAND, which is what readable measures.
test("readable classifies a corrupt cast; the damage share does not", () => {
  const { castTrust, CAST_READABLE } = require("../src/grade_rules.cjs");
  // [name, readable, frame damage %, reported cast, true cast from the levels]
  const rows = [
    ["C229 Master x=0.10", 22, 0.01, -12.2, -14.1],
    ["C229 Master x=0.15", 7, 1.37, 4.3, -8.6],
    ["C229 Master x=0.20", 4, 9.01, 0.4, -2.0],
    ["C187 Master x=0.10", 86, 0, -33.7, -35.6],
    ["C187 Master x=0.15", 31, 0, -32.2, -35.3],
    ["C187 Master x=0.35", 10, 0.23, -6.7, -11.8],
    ["C229 Red    x=0.15", 98, 1.44, 1.2, 0.7],
    ["C229 Red    x=0.20", 84, 9.23, 5.9, 6.2],
  ];
  const frame = (readable, share, rb) => ({
    luma: { min: 0, p1: 5, p50: 50, p99: 75, max: 88 }, red: { mean: 50, p1: 2, p99: 75 },
    green: { mean: 48, p1: 5, p99: 75 }, blue: { mean: 44, p1: 2, p99: 75 }, saturation: { p50: 12 },
    cast: { cb: 0, cr: 0 }, clipped: { red: 0, green: 0, blue: 0 }, floor: { red: share, green: 0, blue: 0 }, crushed: 0,
    bands: { blacks: { share: 3, readable, rb, g: 0, levels: { red: 5, green: 5, blue: 5 } } },
  });
  // The asymmetry that matters: accepting a CORRUPT reading is the dangerous error - it is what let the
  // most destroyed frame rank as best-balanced. Refusing a reading that happens to be fine is only
  // caution. So the test is one-sided on readable, and two-sided on the share to show why it was dropped.
  let sharePositives = 0, refusedButFine = 0;
  for (const [name, readable, share, reported, truth] of rows) {
    const err = Math.abs(reported - truth);
    const trusted = castTrust(frame(readable, share, reported), "shadows").trusted;
    if (trusted) assert.ok(err <= 2, name + ": trusted a reading off by " + err.toFixed(1) + " - readable " + readable + " let a corrupt cast through");
    else if (err <= 2) refusedButFine++;
    if (share <= 1 && err > 2) sharePositives++;
  }
  assert.equal(sharePositives, 2, "a damage-share test would have ACCEPTED two corrupt readings (C187 at 0.15 and 0.35, off by 3.1 and 5.1 with almost nothing floored)");
  assert.equal(refusedButFine, 1, "readable refuses one reading that happened to be within 2 (C229 Master x=0.10) - conservative, and the safe direction");
  // And the two rows the share test would have wrongly refused are the ones that prove flooring a channel
  // does not by itself corrupt the cast: red 9.23% on the floor, reading within 0.3 of the truth.
  assert.equal(castTrust(frame(84, 9.23, 5.9), "shadows").trusted, true, "9% floored but the band is intact");
  assert.equal(CAST_READABLE, 80);
});
