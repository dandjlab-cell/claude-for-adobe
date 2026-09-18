"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { measure } = require("../src/scopes.cjs");
const { apply, pipeline, newlyRailed } = require("../src/forward.cjs");
const { planShot, STATISTICS, damage, allowance } = require("../src/grade.cjs");
const { temperatureFor, bottomsFor, levelsFor, objective } = require("../src/grade_rules.cjs");

// Synthetic only: a low black, broad body, white surface, and a tiny hotter specular. The table's
// railed calibration asks for too much gain; the pixel solution can reach 92 without losing the tail.
const frame = (n = 6000) => {
  const b = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const v = i < n * 0.03 ? 8 : i >= n * 0.992 ? 203 : Math.round(8 + 182 * (i / n));
    b.fill(v, i * 3, i * 3 + 3);
  }
  return b;
};
async function run(rgb, goals, options = {}) {
  const ops = [], writes = [];
  const r = await planShot({ measured: measure(rgb), pixels: rgb, goals,
    current: async () => 0,
    set: async (v, op) => { writes.push([op, v]); ops.push([op, v]); return v; },
    measure: async () => measure(pipeline(rgb, [ops.filter(([op]) => !["shadows", "highlights"].includes(op))])),
    ...options });
  return { ...r, writes };
}

test("pixel choice reaches a safe white target that the table overshoots, and is deterministic", async () => {
  const rgb = frame(), goals = [{ param: "whites", target: 92 }];
  const table = await run(rgb, goals, { pixels: null });
  assert.ok(measure(apply(rgb, "whites", table.writes[0][1])).clipped.red > 0.5);
  const a = await run(rgb, goals), b = await run(rgb, goals);
  assert.equal(a.plan[0].how, "pixels");
  assert.ok(Math.abs(a.plan[0].predicted - 92) <= 0.4, JSON.stringify(a.plan));
  assert.equal(a.clipped, 0);
  assert.deepEqual(a.plan, b.plan);
  assert.deepEqual(a.expected, a.after, "accepted state comes from transformed pixels");
  assert.ok(a.plan[0].evaluations <= 72);
});

test("newly railed rejects a candidate whose aggregate share fits the source allowance", () => {
  const { choose } = require("../src/grade_pixels.cjs");
  // 90% arrived at the top, 10% just below it. Clipping another 4% passes the aggregate 90.1%
  // allowance but destroys 40% of the only interior samples. Contrast pulls some old rails inward.
  const rgb = Buffer.alloc(3000, 255);
  for (let i = 0; i < 100; i++) rgb.fill(i < 4 ? 1 : 100, i * 3, i * 3 + 3);
  const m = measure(rgb), allow = allowance(damage(m));
  const bad = apply(rgb, "contrast", 100), mb = measure(bad);
  assert.ok(Math.max(...Object.values(mb.floor)) <= allow.crushed);
  assert.ok(newlyRailed(rgb, bad).low > allow.crushed);
  const r = choose({ pixels: rgb, reading: m, op: "contrast", range: [0, 100], target: 100,
    readStat: (x) => x.luma.p99 - x.luma.p1, allow });
  assert.ok(newlyRailed(rgb, r.rgb).low <= allow.crushed);
  assert.match(r.note, /newly railed/);
});

// This test has been rewritten twice today, and the history is the point. First it asserted a table Shadows
// stood the guard down for the Whites after it. Then the first live run (15:12) showed that cascade
// carrying three of the four worst MODEL OFF BY values, and planShot was changed to choose pixel-form goals
// first. Then the second run (15:31) showed the two table-only sliders owned EVERY remaining error, three
// sweeps were taken, and both got a measured form (`shadowsHighlightsForm`). So now every Basic slider the
// pass writes is chosen on pixels and nothing stands down. What has no form is the wheels and the curves.
test("Shadows and Highlights are chosen on pixels like every other Basic slider, so nothing stands down", async () => {
  for (const param of ["shadows", "highlights"]) {
    const r = await run(frame(), [{ param, target: param === "shadows" ? 8 : 92 }, { param: "whites", target: 92 }]);
    for (const p of r.plan) if (!p.skipped) assert.equal(p.how, "pixels", p.param + " should be pixel-chosen: " + JSON.stringify(p.note));
    assert.ok(!r.plan.some((p) => /stands down|no pixel form/.test((p.note || "") + (p.skipped || ""))), "no fallback anywhere in the plan");
  }
  // The genuinely unmodelled controls still refuse, so a form is never invented by omission.
  assert.throws(() => apply(frame(64), "vibrance", 50), /no measured form/);
});

test("candidate replay uses Basic before Master before every channel curve", async () => {
  const rgb = frame(), operations = [["channelToe", 0.01, "red"], ["masterToeAnchored", 0.01, 0.4], ["channelLift", 0.01, "blue"]];
  const before = measure(pipeline(rgb, [operations]));
  let written = 0;
  const r = await run(rgb, [{ param: "whites", target: 92 }], { measured: before,
    pixels: { source: rgb, operations },
    set: async (v) => (written = v),
    measure: async () => measure(pipeline(rgb, [[...operations, ["whites", written]]])) });
  const manual = apply(apply(apply(apply(rgb, "whites", written), "masterToeAnchored", 0.01, 0.4), "channelToe", 0.01, "red"), "channelLift", 0.01, "blue");
  assert.deepEqual(r.expected, measure(manual));
  assert.notDeepEqual(r.expected.luma, measure(apply(pipeline(rgb, [operations]), "whites", written)).luma);
});

test("frame pixels never replace a region's brightness or skin readings", async () => {
  const rgb = frame(), m = { ...measure(Buffer.from([190, 100, 75])), region: "face", frame: measure(rgb) };
  const r = await run(rgb, [{ param: "whites", target: 92 }], { measured: m });
  assert.deepEqual(r.expected.luma, m.luma);
  assert.deepEqual(r.expected.cast, m.cast);
  assert.notDeepEqual(r.expected.frame.luma, m.frame.luma);
});

test("downward exposure is pixel chosen and upward exposure never uses an invented form", async () => {
  const rgb = frame();
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.min(254, Math.round(rgb[i] * 1.25));
  const down = await run(rgb, [{ param: "exposure", target: 45 }]);
  assert.equal(down.plan[0].how, "pixels");
  assert.ok(down.plan[0].value < 0);
  const up = await run(rgb, [{ param: "exposure", target: 65 }]);
  assert.ok(up.writes.every(([, v]) => v <= 0));
  assert.match(up.plan[0].note || up.plan[0].skipped, /upward|above 0|shoulder/);
});

test("white balance measures both serialized pixel operations; no-pixel callers remain labelled table", () => {
  const rgb = frame();
  for (let i = 0; i < rgb.length; i += 3) { rgb[i] = Math.round(rgb[i] * 1.03); rgb[i + 1] = Math.round(rgb[i + 1] * 1.025); rgb[i + 2] = Math.round(rgb[i + 2] * 0.97); }
  const m = measure(rgb), p = temperatureFor(m, 0, 0, rgb), t = temperatureFor(m);
  assert.ok(p && t);
  assert.equal(p.how, "pixels"); assert.equal(t.how, "table");
  assert.ok(p.value < 0 && p.tint > 0);
  assert.deepEqual(p.predicted, measure(pipeline(rgb, [{ temperature: p.value, tint: p.tint }])));
  assert.ok(Math.abs(STATISTICS.whitesRB(p.predicted)) <= 1.5);
  assert.ok(Math.abs(STATISTICS.whitesG(p.predicted)) <= 1.5, "refine several basins: the green-neutral solution lies between worse coarse trials");
  assert.deepEqual(p, temperatureFor(m, 0, 0, rgb));
});

test("curve amounts are serialized pixel choices, preserving meeting and anchor rules", () => {
  const rgb = frame();
  for (let i = 0; i < rgb.length; i += 3) { rgb[i] = Math.min(240, rgb[i] + 25); rgb[i + 1] += 18; rgb[i + 2] += 12; }
  const m = measure(rgb), table = bottomsFor(m), bot = bottomsFor(m, null, rgb);
  assert.ok(bot && table);
  assert.equal(bot.how, "pixels");
  assert.equal(bot.meet, table.meet);
  for (const move of Object.values(bot.toes)) for (const v of Object.values(move)) assert.equal(v, Number(v.toFixed(2)));
  assert.deepEqual(bot.predicted, measure(pipeline(rgb, [bot.pixels.operations])));
  const lev = levelsFor(bot.predicted, bot.curves, m, bot.pixels);
  assert.ok(lev && lev.how === "pixels");
  assert.equal(lev.blackIn, Number(lev.blackIn.toFixed(2)));
  assert.equal(lev.anchor, Number(Math.max(0.3, Math.min(0.6, bot.predicted.luma.p50 / 100)).toFixed(2)));
  assert.deepEqual(lev.predicted, measure(pipeline(rgb, [lev.pixels.operations])));
  assert.ok(newlyRailed(rgb, pipeline(rgb, [lev.pixels.operations])).low <= allowance(damage(m)).crushed);
});

test("lexicographic objective minimizes worst violation, then sum, then distortion in noise bins", () => {
  const m = measure(frame());
  const clean = { ...m, luma: { ...m.luma, p1: 4, p99: 90, p10: 10, p90: 70 } };
  const state = (p1, p99) => ({ ...clean, luma: { ...clean.luma, p1, p99 } });
  assert.deepEqual(objective(clean, 0), [0, 0, 0]);
  assert.ok(objective(state(8, 80))[0] > objective(state(9, 83))[0], "5 IRE worst is worse than 3");
  assert.ok(objective(state(9, 82))[1] > objective(state(9, 85))[1], "tied worst: two deficits cost more than one");
  assert.deepEqual(objective(state(6.1, 90)), objective(state(6.2, 90)), "noise-scale differences do not pick a grade");
  assert.ok(objective(clean, 1.2)[2] > objective(clean, 0.4)[2]);
});

test("acceptance outranks reaching white 92 when the gain lifts the black point", async () => {
  const rgb = frame();
  for (let i = 0; i < rgb.length; i++) if (rgb[i] < 15) rgb[i] = 15;
  const r = await run(rgb, [{ param: "whites", target: 92 }]);
  assert.ok(r.expected.luma.p1 < 7.1, "minimax compromises near the accepted white band, before a full gain lifts black to 7.5");
  assert.ok(r.expected.luma.p99 >= 84.6);
  assert.ok(r.plan[0].predicted < 92 - 0.4);
  assert.match(r.plan[0].note, /acceptance objective/);
});

test("a final lift cannot hide a Master toe's intermediate rail damage", () => {
  const { choose } = require("../src/grade_pixels.cjs");
  const rgb = Buffer.alloc(3000, 100);
  for (let i = 0; i < 100; i++) rgb.fill(5, i * 3, i * 3 + 3);
  const operations = [["channelLift", 0.1, "red"], ["channelLift", 0.1, "green"], ["channelLift", 0.1, "blue"]];
  const m = measure(pipeline(rgb, [operations]));
  const r = choose({ pixels: { source: rgb, operations }, reading: m, op: "masterToeAnchored", extra: 0.4,
    range: [0, 0.15], target: 0, readStat: (s) => s.luma.p1, allow: allowance(damage(measure(rgb))), discrete: true });
  assert.ok(r.value < 0.02, "x=.02 would floor the source dark patch before the lifts");
  assert.match(r.note, /newly railed/);
  assert.equal(newlyRailed(rgb, r.rgb).low, 0, "final pixels alone cannot express the intermediate damage");
});

test("existing object-channel floor does not invalidate every candidate", () => {
  const { choose } = require("../src/grade_pixels.cjs");
  const rgb = frame();
  for (let i = 0; i < 168; i++) rgb[i * 3] = 0; // 2.8% red floor; damage() deliberately ignores it.
  const m = measure(rgb);
  const r = choose({ pixels: rgb, reading: m, op: "whites", range: [0, 100], target: 92,
    readStat: STATISTICS.whitePoint, allow: allowance(damage(m)) });
  assert.ok(r.feasible);
  assert.ok(r.value > 0);
  assert.equal(r.state.floor.red, 2.8);
  assert.equal(newlyRailed(rgb, r.rgb).low, 0);
});

test("a nonneutral current slider requires matching source operations", async () => {
  const rgb = frame();
  const r = await run(rgb, [{ param: "whites", target: 92 }], { current: async () => 20 });
  assert.equal(r.plan[0].how, "table");
  assert.match(r.plan[0].note, /absent from the source pipeline/);
  const operations = [["whites", 20]], m = measure(pipeline(rgb, [operations]));
  const p = await run(rgb, [{ param: "whites", target: 92 }], { pixels: { source: rgb, operations }, measured: m, current: async () => 20 });
  assert.equal(p.plan[0].how, "pixels");
  assert.ok(Math.abs(p.expected.luma.p99 - 92) <= 0.4);
});

test("region-only exposure is held rather than grading the frame's median as a face", async () => {
  const rgb = frame(), m = { ...measure(Buffer.from([210, 210, 210])), region: "face", frame: measure(rgb) };
  const r = await run(rgb, [{ param: "exposure", target: 65 }], { measured: m });
  assert.equal(r.writes.length, 0);
  assert.match(r.plan[0].skipped, /no region pixels/);
});

test("frozen half-cast targets do not reward stripping out the preserved scene colour", () => {
  const m = measure(frame());
  m.bands.blacks.rb = -10;
  m.bands.blacks.g = 0;
  const preserved = objective(m, 0, { shadows: [-10, 0] });
  const stripped = objective({ ...m, bands: { ...m.bands, blacks: { ...m.bands.blacks, rb: 0 } } }, 0, { shadows: [-10, 0] });
  assert.ok(preserved[1] < stripped[1]);
});

test("held pixel levels report a residual without manufacturing a four-point identity curve", () => {
  const rgb = frame();
  for (let i = 0; i < rgb.length; i += 3) { rgb[i] = 1; rgb[i + 1] = 30; rgb[i + 2] = 30; }
  const m = measure(rgb), r = levelsFor(m, null, m, rgb);
  assert.ok(r && r.held);
  assert.equal(r.blackIn, 0);
  assert.equal(r.curves, null);
  assert.deepEqual(r.predicted, m);
  assert.match(r.why, /residual.*cap/);
});

test("pixel expectation follows a writer's finite readback, including refused moves", async () => {
  const rgb = frame();
  for (const actual of [0, 7.25]) {
    const r = await run(rgb, [{ param: "whites", target: 92 }], {
      set: async () => actual, measure: async () => measure(apply(rgb, "whites", actual)) });
    assert.equal(r.plan[0].value, actual);
    assert.match(r.plan[0].note, /readback/);
    assert.deepEqual(r.expected, r.after);
  }
});


test("pixel channel amounts preserve the frozen meeting lifts before Master sets p1", () => {
  const n = 6000, rgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    let p;
    if (i < 180) p = [53, 33, 21];
    else if (i < 246) p = [26, 100, 100];
    else { const v = Math.round(40 + 190 * (i - 246) / (n - 246)); p = [v, v, v]; }
    rgb.set(p, i * 3);
  }
  const m = measure(rgb), table = bottomsFor(m), pixel = bottomsFor(m, null, rgb);
  assert.equal(pixel.meet, table.meet);
  assert.ok(pixel.toes.green.lift > 0 && pixel.toes.blue.lift > 0, "deferred p1 correction must not veto frozen meeting lifts");
  const lv = pixel.predicted.bands.blacks.levels;
  assert.ok(Math.max(lv.red, lv.green, lv.blue) - Math.min(lv.red, lv.green, lv.blue) <= 1.5, JSON.stringify(lv));
});


test("pixel white balance preserves the mixed-light mean instead of chasing a tonal deficit", () => {
  const n = 6000, rgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const v = Math.round(60 + 110 * i / n);
    rgb.set(i < 180 ? [50, 40, 30] : i >= n - 180 ? [180, 200, 220] : [v, v, v], i * 3);
  }
  const m = measure(rgb), r = temperatureFor(m, 0, 0, rgb);
  assert.match(r.why, /mixed light/);
  const mean = (STATISTICS.whitesRB(r.predicted) + STATISTICS.blacksRB(r.predicted)) / 2;
  assert.ok(Math.abs(mean) <= 0.4, "split target must survive unrelated lifted-black deficit: " + mean);
});

test("prefix destruction remembers both rails when the same sample reaches each in turn", () => {
  // 210, not 200: temperature +100 is a red gain of 1.244 (forward.cjs WB table), and 200 x 1.244 = 248.8
  // never reaches the rail, so the fixture as first written could not produce the high rail it asserts.
  // 210 x 1.244 = 261 clips; exposure -5 then takes everything to the floor, which is the point - the
  // witness has to remember the earlier high rail after a later low one erased it from the final image.
  const P = require("../src/grade_pixels.cjs"), rgb = Buffer.alloc(3000, 210), m = measure(rgb);
  const px = P.context({ source: rgb, operations: [["temperature", 100], ["exposure", -5], ["masterToeAnchored", 0.25, 0.4]] });
  const e = P.evaluate(px, m, { clipped: 0, crushed: 100 });
  assert.match(e.reasons.join("; "), /newly railed [1-9][\d.]*% high/);
  assert.equal(newlyRailed(rgb, e.rgb).high, 0, "final low samples must not erase their earlier high rail");
});

// The cascade the first live run exposed (2026-09-18 15:12): Shadows has no pixel form, and a table-chosen
// move ends pixel choice for every goal after it - so a Shadows goal listed BEFORE Whites forced Whites
// onto the table on four clips, which carried three of the four worst MODEL OFF BY values. Lumetri applies
// the sliders in its own fixed order regardless of write order, so choosing the pixel-form goals first
// costs nothing in what Premiere renders and keeps the pixels in play for the goals that can use them.
test("pixel-form goals are chosen before table-only ones, so a table Shadows cannot knock Whites off the pixels", async () => {
  const { planShot } = require("../src/grade.cjs");
  const n = 120000, rgb = Buffer.allocUnsafe(n * 3);
  for (let i = 0; i < n; i++) { const v = Math.round(20 + 150 * i / n); rgb[i * 3] = v; rgb[i * 3 + 1] = v; rgb[i * 3 + 2] = v; }
  const m = measure(rgb);
  const goals = [
    { param: "shadows", statistic: "blackPoint", target: 12, why: "a dark subject, listed first as goalsFor lists it" },
    { param: "whites", statistic: "whitePoint", target: 92, why: "the white point" },
  ];
  const r = await planShot({ set: async (v) => v, measure: async () => m, measured: m, current: async () => 0, goals, pixels: rgb });
  const whites = r.plan.find((p) => p.param === "whites"), shadows = r.plan.find((p) => p.param === "shadows");
  assert.equal(whites.how, "pixels", "whites keeps its pixels: " + JSON.stringify(whites.note));
  // Shadows gained a measured form at 16:10, so it is pixel-chosen too and the caller's order is kept
  // within the pixel half - the reorder only ever moves TABLE goals to the back.
  assert.equal(shadows.how, "pixels", "shadows is pixel-chosen now: " + JSON.stringify(shadows.note));
  assert.deepEqual(r.plan.map((p) => p.param), ["shadows", "whites"], "both pixel-form: the caller's order stands");
  // The reorder itself, exercised with a control that really has no form: vibrance goes to the back.
  const mixed = [{ param: "vibrance", statistic: "saturation", target: 30 }, ...goals];
  const r2 = await planShot({ set: async (v) => v, measure: async () => m, measured: m, current: async () => 100, goals: mixed, pixels: rgb });
  assert.deepEqual(r2.plan.map((p) => p.param), ["shadows", "whites", "vibrance"], "the no-form goal is chosen last");
  // Without pixels the caller's order is untouched - nothing to protect, and onlyIf chains stay as written.
  const t = await planShot({ set: async (v) => v, measure: async () => m, measured: m, current: async () => 0, goals });
  assert.deepEqual(t.plan.map((p) => p.param), ["shadows", "whites"]);
});

// The form itself, against the data it was NOT fitted on. Fitted on C202's +-100 rows pooled with C220's,
// so the interior rows (+-20, +-50, +30) of both frames are held out - and the frames are different
// pictures, which is what makes the second frame a transfer test rather than a refit.
test("the Shadows and Highlights bumps reproduce the held-out sweep rows on both frames within noise", () => {
  const sweeps = require("../src/lumetri_sweeps.json");
  const MAP = { lumaP1: "p1", lumaP50: "p50", lumaP99: "p99", lumaMax: "max", redP1: "redP1", greenP1: "greenP1", blueP1: "blueP1", redP99: "redP99", greenP99: "greenP99", blueP99: "blueP99" };
  const rowsOf = (b) => b.rows ? b.rows : b.values.map((v, i) => { const r = { value: v }; for (const [k, c] of Object.entries(MAP)) if (b[c]) r[k] = b[c][i]; return r; });
  const ire = (v) => v / 255 * 100, code = (ire) => ire / 100 * 255;
  for (const [op, blocks, worstAllowed] of [["shadows", ["shadowsC202", "shadows"], 1.6], ["highlights", ["highlightsC202", "highlights"], 1.8]]) {
    const errs = [];
    for (const key of blocks) {
      const rows = rowsOf(sweeps[key]), n = rows.find((r) => r.value === 0);
      for (const row of rows) {
        if (row.value === 0 || Math.abs(row.value) === 100) continue; // the +-100 rows built the table
        const f = require("../src/forward.cjs").OPS[op](row.value);
        for (const k of Object.keys(MAP)) if (k in n && k in row) errs.push(Math.abs(row[k] - ire(f(code(n[k])))));
      }
    }
    errs.sort((a, b) => a - b);
    const median = errs[Math.floor(errs.length / 2)], worst = errs[errs.length - 1];
    assert.ok(median <= 0.4, op + ": median held-out residual " + median.toFixed(2) + " IRE must sit inside the 0.4 noise floor");
    assert.ok(worst <= worstAllowed, op + ": worst held-out residual " + worst.toFixed(2) + " IRE over " + errs.length + " predictions");
    assert.ok(errs.filter((e) => e <= 1).length / errs.length >= 0.9, op + ": at least 90% of held-out predictions within 1 IRE");
  }
  // And the shape claims, on the pixels: Shadows +100 moves input 17 MORE than input 9 (a bump, not a lift),
  // and Highlights +100 leaves the very top almost alone (a band, not a gain).
  const { OPS } = require("../src/forward.cjs");
  const sh = OPS.shadows(100), hi = OPS.highlights(100);
  assert.ok(ire(sh(code(17.3))) - 17.3 > ire(sh(code(9))) - 9, "Shadows is a bump: the lift peaks above the darkest input");
  assert.ok(ire(hi(code(97.3))) - 97.3 < 1, "Highlights spares the top: " + (ire(hi(code(97.3))) - 97.3).toFixed(2));
  assert.ok(ire(hi(code(54.9))) - 54.9 > 10, "and moves the median by more than 10 at +100");
});
