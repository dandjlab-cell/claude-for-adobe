// Grading a shot the way a colourist does: read the scopes once, know what each knob will do, set the
// knobs, glance at the scopes to confirm. One render before, one after. No searching.
//
// The knowledge of what a knob does is src/grade_model.cjs (the internal scopes, built from the live
// calibration sweeps). What talks to Premiere is injected (`set` writes a parameter and returns what it
// reads back; `measure` renders and measures), so all of this runs and is tested without Premiere.
//
// Why a confirm render at all: the model composes one-knob-at-a-time calibrations, and Premiere's tone
// mapping depends on the picture, so the prediction is close rather than exact. The confirm is the
// colourist looking at the scopes after the move. If it shows a residual beyond tolerance, ONE nudge
// is computed from the two real readings (a measured local slope, not a guess), then it stops and
// reports whatever residual is left. Three renders is the ceiling; two is the norm.
"use strict";
const { solveFor } = require("./grade_solve.cjs");
const { predict, solveKnob, SWEEPS } = require("./grade_model.cjs");

// Statistics a grade is read from and steered by. The parade ones are what white balance IS on a
// scope: the three channels' whites line up when the picture is neutral, whatever colour the subject
// is - a tomato does not fool the parade the way it fools a frame-average cast.
const whitesBand = (f) => {
  if (!f.bands) return null;
  const one = f.bands.whites1, three = f.bands.whites;
  if (one && one.rb !== null && one.rb !== undefined && one.share >= 0.5) return one;
  return three && three.rb !== null && three.rb !== undefined ? three : null;
};
const STATISTICS = {
  brightness: (m) => m.luma.p50,
  // The tonal ends are the FRAME's, like the parade whites below: the canon's black point is the
  // darkest thing in the shot and the white point the brightest, not a subject's own extremes. The run
  // of 2026-09-15 18:03 set goals from the frame but solved and judged on the subject - "black point
  // 25 → 63" was a hand's, and Blacks was pulled against a number it could never reach.
  blackPoint: (m) => (m.frame || m).luma.p1,
  whitePoint: (m) => (m.frame || m).luma.p99,
  spread: (m) => { const f = m.frame || m; return f.luma.p99 - f.luma.p1; },
  // The parade-whites statistics read the WHOLE FRAME even when a subject was measured (`frame` is
  // attached by the panel): a red product's brightest pixels are red, which is its colour, not the
  // light. White surfaces and specular hits anywhere in the room are what line up when it is neutral.
  // From PAIRED pixels when the measurement carries the bands (the brightest / darkest 3% of pixels,
  // scopes.cjs); the separately taken channel percentiles are the fallback for older readings.
  // The whites reference is the brightest 1% when it has enough pixels: a specular is the reflection
  // of the light itself, the canon's white-balance reference, where the brightest 3% can be a cream
  // cabinet (C187, 22:38: brightest 1% -7.5, brightest 3% -14, every other band -25..-32 - a warm room
  // under a mildly warm light; the 3% reference cooled it by 29 and had to give half back for clipping).
  whitesRB: (m) => { const f = m.frame || m; const b = whitesBand(f); return b ? b.rb : f.blue.p99 - f.red.p99; },        // > 0 blue, < 0 warm
  whitesG: (m) => { const f = m.frame || m; const b = whitesBand(f); return b ? b.g : f.green.p99 - (f.red.p99 + f.blue.p99) / 2; },
  blacksRB: (m) => { const f = m.frame || m; const b = f.bands && f.bands.blacks; return b && b.rb !== null ? b.rb : f.blue.p1 - f.red.p1; },
  red: (m) => m.red.mean, green: (m) => m.green.mean, blue: (m) => m.blue.mean,
  warmth: (m) => m.cast.cr, tintCast: (m) => m.cast.cb,
  saturation: (m) => m.saturation.p50,
  // Skin on the vectorscope: the angle of the mean chroma. Our Cb is the x axis and Cr the y axis, so
  // skin - red with a yellow lean, Cr > 0 and Cb < 0 - lands between 90 and 180 degrees, and the
  // industry's skin line (the NTSC +I axis) is 123 degrees, 116-126 across vendors. Judge on a face.
  skinHue: (m) => { const a = Math.atan2(m.cast.cr, m.cast.cb) * 180 / Math.PI; return a < 0 ? a + 360 : a; },
};

// Which knob moves which statistic, its slider range in Premiere's UI (the loop never leaves it - the
// run of 2026-09-15 showed Premiere accepting contrast -142 and temperature +195, which are destroyed
// shots, not grades), and whether it was swept live. Unswept knobs have no model: they get one probe
// render to measure their local slope, then one write, then the confirm - same ceiling.
const PARAMS = {
  temperature: { lumetri: "Temperature", steer: "whitesRB", range: [-100, 100], step: 25, tested: true },
  tint: { lumetri: "Tint", steer: "whitesG", range: [-100, 100], step: 25, tested: true },        // whites G-mid +29 -> -32 across the range; clips past +50 like temperature
  exposure: { lumetri: "Exposure", steer: "brightness", range: [-5, 5], step: 0.5, tested: true },
  contrast: { lumetri: "Contrast", steer: "spread", range: [-100, 100], step: 25, tested: true },
  highlights: { lumetri: "Highlights", steer: "whitePoint", range: [-100, 100], step: 25, tested: true }, // p99 58.8 -> 87.8, peak 95.7 at +100: never clips
  shadows: { lumetri: "Shadows", steer: "blackPoint", range: [-100, 100], step: 25, tested: true },     // dark areas: p1 4.7 -> 17.6, but the median moves 31 -> 52.9 with it
  whites: { lumetri: "Whites", steer: "whitePoint", range: [-100, 100], step: 25, tested: true },   // p99 56.5 -> 99.6; clips past +50
  blacks: { lumetri: "Blacks", steer: "blackPoint", range: [-100, 100], step: 25, tested: true },   // p1 0 -> 20.4; crushes below -20
  saturation: { lumetri: "Saturation", steer: "saturation", range: [0, 200], step: 20, tested: false, neutral: 100 },
  vibrance: { lumetri: "Vibrance", steer: "saturation", range: [-100, 100], step: 25, tested: false },
};

// Hitting the number is not the job: a grade that reaches it by blowing highlights or crushing blacks
// has destroyed picture. Judged on the WHOLE frame even when steering by the subject - pushing a small
// subject up two stops blows the room behind it, and a subject-only reading would never see that.
const GUARD = { clipped: 0.5, crushed: 1.0 };
const damage = (m) => {
  const f = m.frame || m; // measureRegion attaches the whole-frame numbers when a region was measured
  const floor = f.floor ? Math.max(f.floor.red, f.floor.green, f.floor.blue) : 0; // a channel at 0 is crushed too (C187, 21:26)
  return { clipped: Math.max(f.clipped.red, f.clipped.green, f.clipped.blue), crushed: Math.max(f.crushed, floor) };
};
const unsafe = (d, guard) => d.clipped > guard.clipped || d.crushed > guard.crushed;
// Damage the shot arrived with is not the grade's doing: a source that already clips 1.7% of a window
// is allowed to keep clipping 1.7% (plus a little, for the read's resampling), never more.
const allowance = (base, guard = GUARD) => ({ clipped: Math.max(guard.clipped, base.clipped + 0.1), crushed: Math.max(guard.crushed, base.crushed + 0.2) });
const clampTo = ([lo, hi], v) => Math.max(lo, Math.min(hi, v));
const MAX_RENDERS = 3;

// One knob, one go. { set, measure, param, target, statistic?, start?, tolerance?, guard?, measured? }
// `measured` is a reading already taken at `start`, so a caller that has just read the scopes does
// not render again to begin.
async function steer({ set, measure, param, target, statistic, start = 0, tolerance = 0.5, guard = GUARD, measured = null }) {
  const spec = PARAMS[param];
  if (!spec) throw new Error("unknown parameter: " + param);
  const statName = statistic || spec.steer;
  const readStat = STATISTICS[statName];
  if (!readStat) throw new Error("unknown statistic: " + statName);
  if (!isFinite(target)) throw new Error("target must be a number");

  const readings = [];
  let renders = 0;
  const at = async (value) => {
    const v = clampTo(spec.range, value);
    const readBack = Number(await set(v));
    const known = readings.find((r) => Math.abs(r.value - readBack) < 1e-6);
    if (known) return { ...known, repeat: true };
    renders++;
    const m = await measure();
    const r = { value: readBack, stat: readStat(m), ...damage(m), m };
    readings.push(r);
    return r;
  };

  // 1. Read the scopes (or take the reading the caller already has).
  let first;
  if (measured) { first = { value: start, stat: readStat(measured), ...damage(measured), m: measured }; readings.push(first); }
  else first = await at(start);

  // 2. Choose the value. Calibrated knob: the model says where. Unswept knob: one probe render to
  //    measure the local slope, then the same solve on the two real points.
  let chosen = null, how = "";
  if (SWEEPS[param]) {
    const s = solveKnob(first.m, param, first.value, readStat, target);
    if (s) { chosen = s.value; how = "model"; }
  }
  if (chosen === null) {
    const probe = await at(first.value + (target > first.stat ? spec.step : -spec.step));
    const s = solveFor(readings, target);
    if (!s) return done("could not solve from " + readings.length + " readings");
    chosen = clampTo(spec.range, s.value); how = probe.repeat ? "probe (range end)" : "probe";
  }

  // 3. Set it. 4. Confirm. One nudge from the two real readings if the confirm is off, then stop.
  let applied = await at(chosen);
  let nudged = false;
  if (!applied.repeat && Math.abs(applied.stat - target) > tolerance && renders < MAX_RENDERS) {
    const local = solveFor([first, applied], target);
    if (local && Math.abs(local.value - applied.value) > 1e-6) {
      const r = await at(local.value);
      if (!r.repeat) { applied = r; nudged = true; }
    }
  }

  // 5. Never leave damage on the clip: fall back to the closest safe reading and say so.
  let backedOff = null;
  if (unsafe(applied, guard)) {
    const safe = readings.filter((r) => !unsafe(r, guard)).sort((a, b) => Math.abs(a.stat - target) - Math.abs(b.stat - target))[0];
    backedOff = "backed off: " + round(applied.value) + " would clip " + round(applied.clipped) + "% / crush " + round(applied.crushed) + "% of the frame";
    if (safe) { await set(safe.value); applied = safe; }
  }
  return done(backedOff, applied, how, nudged);

  function done(problem, best = readings[readings.length - 1], how = "", nudged = false) {
    const residual = best ? best.stat - target : null;
    return {
      param, statistic: statName, target, value: best ? best.value : start, achieved: best ? best.stat : null,
      residual: residual === null ? null : round(residual),
      hit: best ? Math.abs(residual) <= tolerance : false,
      how, nudged, renders, readings: readings.map(({ m, ...r }) => r),
      clipped: best ? best.clipped : null, crushed: best ? best.crushed : null,
      problem: problem || null, tested: spec.tested, measurement: best ? best.m : null,
    };
  }
}

// A whole shot in one go: read the scopes once, choose every knob from the model, write them all, then
// ONE confirm render for the lot. goals: [{ param, target, statistic? }] in the order a colourist works
// (white balance, then exposure, then contrast). Each knob is solved on the state predicted after the
// knobs before it. A target the knob cannot reach inside its calibrated range is taken as far as the
// knob goes only if that helps, and reported as partial - never mistaken for a hit. A brightness move
// that the model says will push the FRAME's white point past the ceiling is capped there before it is
// written. If the confirm still shows the frame clipped or crushed, the brightness knobs are backed off
// to neutral and confirmed once more - safety spends the third render, not a nudge.
const WHITE_CEILING = 95; // the sweep clipped nothing until p99 reached 99.6; 92 blocked moves that were safe
const BRIGHTNESS_KNOBS = new Set(["exposure", "contrast", "highlights", "whites", "shadows", "blacks"]);
// `baseline` is the damage the shot ARRIVED with (clipped/crushed of the untouched read); without it
// the reading passed in is taken as the baseline, which is wrong once colour writes precede the plan.
async function planShot({ set, measure, goals, guard = GUARD, tolerance = 1.0, measured = null, current = null, baseline = null }) {
  const before = measured || await measure(); // a caller that has just read the scopes passes the reading
  let renders = measured ? 1 : 2;
  let state = before;
  const plan = [];
  const frameWhite = (m) => (m.frame || m).luma.p99;
  for (const g of goals) {
    const spec = PARAMS[g.param];
    if (!spec) throw new Error("unknown parameter: " + g.param);
    const statName = g.statistic || spec.steer;
    const readStat = STATISTICS[statName];
    if (!readStat) throw new Error("unknown statistic: " + statName);
    // Solve from where the knob actually is: an editor's earlier move, or a previous grade, is the
    // starting point, not zero. Assuming neutral would compound on top of whatever is already set.
    // A goal can be conditional on the state the knobs before it predict: Highlights finishes a white
    // point only if Whites left it low, Shadows precedes Blacks only if the black point is still lifted.
    if (g.onlyIf && !g.onlyIf(state)) { plan.push({ param: g.param, statistic: statName, target: g.target, before: round(readStat(state)), skipped: "not needed after the knobs before it" }); continue; }
    const from = current ? Number(await current(g.param)) : (spec.neutral || 0);
    const entry = { param: g.param, statistic: statName, target: g.target, before: round(readStat(state)), from };
    // A caller may bring its own solve (from a measured slope the sweep cannot give, like lowering
    // Blacks): a function gets the state predicted after the knobs before it, a value is taken as is.
    const own = g.solve ? g.solve(state, from) : g.value;
    const s = own !== undefined
      ? { value: own, bracketed: true, partial: false, helps: true }
      : (SWEEPS[g.param] ? solveKnob(state, g.param, from, readStat, g.target) : null);
    if (!s) { plan.push({ ...entry, skipped: SWEEPS[g.param] ? "no solution" : "no calibration for " + g.param }); continue; }
    if (s.partial && !s.helps) { plan.push({ ...entry, skipped: "beyond the knob's range and the range end does not help" }); continue; }
    const limit = g.cap ? [Math.max(spec.range[0], -g.cap), Math.min(spec.range[1], g.cap)] : spec.range;
    let value = clampTo(limit, s.value), note = s.partial ? "partial: as far as the knob goes" : (Math.abs(value - s.value) > 1e-6 ? "capped at " + g.cap + ": a balance is not a look" : "");
    let predicted = predict(state, g.param, from, value);
    // Cap a brightness move by where the model says the frame's white point lands.
    if (BRIGHTNESS_KNOBS.has(g.param) && frameWhite(predicted) > WHITE_CEILING && frameWhite(state) <= WHITE_CEILING) {
      const cap = solveKnob(state, g.param, from, frameWhite, WHITE_CEILING);
      if (cap && cap.bracketed && Math.abs(cap.value - from) < Math.abs(value - from)) {
        value = clampTo(limit, cap.value); predicted = predict(state, g.param, from, value);
        note = "capped: the white point would have passed " + WHITE_CEILING;
      }
    }
    plan.push({ ...entry, value, predicted: round(readStat(predicted)), note });
    state = predicted;
  }
  for (const p of plan) if (p.value !== undefined) p.readBack = Number(await set(p.value, p.param));
  let after = await measure();
  const judge = (m) => { for (const p of plan) if (p.value !== undefined) { p.achieved = round(STATISTICS[p.statistic](m)); p.residual = round(p.achieved - p.target); p.hit = Math.abs(p.achieved - p.target) <= tolerance; } };
  judge(after);
  // Damage the shot arrived with is not the grade's doing: a source that already clips 1.7% of a window
  // is allowed to keep clipping 1.7% (plus a little, for the read's resampling), never more.
  const allow = allowance(baseline || damage(before), guard);
  let harm = damage(after), backedOff = false;
  if (unsafe(harm, allow)) {
    // Never leave damage: the knobs that push the offending end go back to where they WERE (an editor's
    // own setting, not zero), the confirm is repeated. Clipping is the top's knobs; crushing is the
    // bottom's; contrast and exposure are both.
    const culprits = new Set();
    if (harm.clipped > allow.clipped) for (const k of ["exposure", "contrast", "highlights", "whites"]) culprits.add(k);
    if (harm.crushed > allow.crushed) for (const k of ["exposure", "contrast", "shadows", "blacks"]) culprits.add(k);
    // Half the move, not none of it: a white point that clipped 0.6% at +50 keeps most of its gain at
    // +25 (the 21:37 run left four white points at 82 by going back to zero). Still one render.
    for (const p of plan) if (p.value !== undefined && culprits.has(p.param)) {
      const half = round(p.from + (p.value - p.from) / 2);
      p.readBack = Number(await set(half, p.param)); p.value = half;
      p.note = "backed off to half: the frame clipped " + round(harm.clipped) + "% / crushed " + round(harm.crushed) + "%";
    }
    after = await measure(); renders++;
    judge(after); harm = damage(after); backedOff = true;
  }
  return { before, after, plan, renders, clipped: harm.clipped, crushed: harm.crushed, unsafe: unsafe(harm, allow), backedOff };
}

const round = (n) => Math.round(Number(n) * 100) / 100;

module.exports = { steer, planShot, STATISTICS, PARAMS, GUARD, MAX_RENDERS, damage, allowance, unsafe };
