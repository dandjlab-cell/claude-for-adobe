# Brief for gpt-6-astra: replace the statistic-space chooser with pixel-evaluated choice

Date: 2026-09-18. You are running with this repository as your working directory and full write access.
This is an IMPLEMENTATION task, not a review. Last time you were asked for a design and you delivered one
(`docs/reviews/astra_headroom_answer.md`). This time the deliverable is working code, passing tests, and
a report. Nothing here asks for your opinion on whether to do it.

---

## 1. What the project is

A public, MIT-licensed Premiere Pro CEP panel. One of its tools, `grade_sequence` (panel.js, search
`async function gradeSequenceTool`), grades every clip on a track deterministically: it decodes one frame
per clip from the source file, computes scope statistics (`src/scopes.cjs` `measure()`), chooses Lumetri
control values, writes them through the QE/host layer, and confirms with a Premiere render. The owner's
words for the goal: "a robust, code driven color grading scheme", "deterministic", "we are creating rules,
not tuning to footage".

Read, in this order, before writing a line:

1. `CLAUDE.md` — hard rules (privacy, no absolute home paths, no client names).
2. `docs/findings-index.md` — one line per established fact and what each forecloses. Grep it before
   assuming anything about a control's behaviour.
3. `docs/color-full-table-plan.md` — the measurement programme the sweeps come from.
4. `docs/reviews/astra_headroom_answer.md` — your own prior answer. See §3 for what was and was not
   implemented from it.
5. `src/lumetri_sweeps.json` — **the numeric authority.** Every measured form lives here with provenance
   (`contrastRule`, `whitesRule`, `blacksRule`, `exposureRule`, `whiteBalanceRule`, `curveToe`,
   `channelToe`, `channelLift`, `highlightsForm`, `shadowsForm`, `castCoupling`, `commutation`, …).
   When code and this file disagree, this file wins.
6. `src/forward.cjs` — the forward model: `OPS`, `apply()`, `pipeline()`, `forward()`, `sample()`,
   `damageOf()`, `newlyRailed()`.
7. `src/grade.cjs` — `STATISTICS`, `PARAMS`, `planShot()` (the chooser + guard you are replacing).
8. `src/grade_model.cjs` — `predict()` and `solveKnob()`, the statistic-space model.
9. `src/grade_rules.cjs` — `temperatureFor`/`balanceAxis`, `bottomsFor`, `levelsFor`, `goalsFor`,
   `verdict`, `ACCEPT`, `SPREAD`, `BLACK_POINT`, `WHITE_POINT`.
10. `src/curves.cjs` (`levels`, `movesFor`, `neutralBottoms`, `predictLevels`, `predictBottoms`),
    `src/wheels.cjs` (`nudgePad`, `predictPads`), `src/scopes.cjs`.
11. `panel.js` from `async function gradeSequenceTool` to the end of its per-clip loop (~lines 1505–2140),
    especially `guardPixelsFor`, the `planGradeShot({...pixels})` call, and the `bpChain` / `MODEL OFF BY`
    reporting.
12. `test/forward.test.cjs`, `test/grade.test.cjs` and whichever tests cover `grade_rules` — read three
    existing tests before writing one.

---

## 2. The core defect you must fix

Every written slider value is chosen in STATISTIC SPACE. `solveKnob()` samples `predict()` at 41 points
across the knob's range and inverts it; `predict()` scales or offsets each tracked percentile of the
current reading by the ratio of the calibration clip's percentile at the two slider values. That is a
table of ANOTHER frame's percentiles transferred by proportion.

This is structurally wrong, not merely imprecise. Two images with identical percentiles respond
differently to the same control — a gain that clips one image's top 3% leaves another's untouched, a toe
that pulls one image's p1 by 4 IRE pulls another's by 1 depending on what sits under 23 IRE. A statistic
cannot predict its own evolution. You said exactly this in `astra_headroom_answer.md` §C: *"no predicted
statistic becomes accepted state. Only the fully transformed image supplies the acceptance decision."*
The top comment of `src/forward.cjs` says it too. But the CHOICE still comes from `predict()`.

Evidence from today's 18-clip run on the test project (sandbox footage; described, never named):

- Per-clip `MODEL OFF BY` (black point the chain predicted vs. what the render read), against a 0.4 IRE
  measurement noise floor: **12.9, 5.65, 4.4, −2.75, −2.5, 2.22, 1.64, 1.16** IRE.
- **4 of 18 clips balanced.** 4/18 is the standing baseline; matching it proves nothing.
- Two crushes of **13.01% and 6.54%** from `curve black` moves that no guard could see (see §5).

The machinery to do it right already exists and today's run proved it fires: on C209 the row said
`held by the pixels: 55.85 would clip 0.94%` — the forward guard in `planShot` evaluated Whites 55.85 on
the clip's own 120k-pixel sample, saw the clip, and backed it off. But a veto cannot make a grade good.
It can only stop a bad value from being written; it never picks a good one. **The values must be CHOSEN
on pixels.**

---

## 3. What was implemented from your last answer, and what was not

Implemented (2026-09-18):

- **Per-sample destruction against the source** — `forward.cjs` `newlyRailed(source, now)`: the share of
  channel samples that were strictly interior in the source and are on a rail now; cumulative because it
  is measured against the arriving sample, not the previous stage. `planShot` uses it alongside the
  aggregate shares (`damageOf(buf, op, v, extra, origin)` returns `newHigh`/`newLow`).
- **Frozen targets** — `wheels.cjs` `nudgePad` and the correction pass in panel.js measure a pad's
  residual against the target the first pass froze (`pads.targets[w]`), not against neutral, so a
  deliberately preserved half-cast is not driven out.
- **Curve toes as pivot-gains** — `OPS.masterToe`, `OPS.masterToeAnchored` (the four-point anchored
  spline `levels()` actually writes, measured `curveToe._anchored` to 0.24 IRE), `OPS.channelToe`,
  `OPS.channelLift`.
- The forward model as a **guard** in `planShot`, and the sample retained per clip (`preread[…].pixels`,
  `forward.sample`).

NOT implemented:

- **The chooser.** Every value is still `solveKnob()`/`predict()`; the pixels only refuse.
- **The lexicographic objective** (lexmin worst violation → sum of violations → distortion, violations
  quantised to bins) — not written anywhere.
- Your local linear programme (§C steps 4–6). Nothing of it exists. You are free to implement it or
  something simpler that meets §6; see §4 first, because the budget premise it was designed under was false.

---

## 4. BUDGET CORRECTION — the previous brief misled you

The previous brief told you "the arithmetic budget is single-digit milliseconds." **That was false**, and
it is the reason your §C limited itself to ONE candidate evaluation and called that "the weakest point."

The real numbers:

- One complete forward evaluation (`apply` + `measure`) on the 120k-pixel sample: **~6 ms.**
- One Premiere confirm render: **0.8–5 seconds** (handoff: renders crept from ~0.8 s to ~5 s in one
  session). The pass does roughly **50 renders per 18-clip run**, i.e. 40–250 s of render time.
- The pass's total wall-clock per clip is dominated by renders and the source decode, not by arithmetic.

So the budget for choosing values is not one evaluation. **Dozens of forward evaluations per control
per clip — a hundred per clip — cost under a second and are imperceptible against one render.** Design
for that budget: bracket-and-bisect on the measured statistic, a coarse grid then a fine one, evaluate
every candidate on the full sample, and never trust an interpolated statistic when the pixels are 6 ms
away. Do not build a proposal LP to save evaluations you do not need to save. If you keep a local
linearisation, keep it only as a starting bracket, and certify every accepted value with a full
evaluation.

Keep the evaluation count bounded and deterministic (a fixed grid or a fixed bisection depth, not a
convergence loop with data-dependent iteration counts) — the owner wants rules, and a run must produce
the same values on the same frame every time. Note the cost in the report.

---

## 5. Where the values are actually chosen today — read this carefully, the map is not what you might assume

There are TWO chooser sites, not one, and the curve writes are a third.

**(a) `planShot` in `src/grade.cjs`** chooses only the goals `goalsFor()` emits: `exposure` (face region
only), `shadows` (dark subject), `whites` and `highlights` (white point), `contrast` (spread or body),
`blacks` (crushed source). Temperature and tint are NOT chosen here.

**(b) `temperatureFor()` → `balanceAxis()` in `src/grade_rules.cjs`** chooses Temperature and Tint via
`solveKnob`/`predict`, with its own predict-based floor/ceiling/saturation hold-back loop. It runs
BEFORE `planShot` and its values are written before the sliders (panel.js: `tw.set(temp.value)`,
`tiw.set(temp.tint)`). `OPS.temperature` and `OPS.tint` exist in `forward.cjs` (`whiteBalanceRule`, per-
channel gains interpolated between the seven swept points). This site must be moved to pixel choice too.

**(c) The curve writes** — `bottomsFor()` (channel bottoms lined up: `movesFor` → `neutralBottoms`) and
`levelsFor()` (Master bottom point via `blackInFor`, anchored at clamp(p50/100, 0.3, 0.6), capped at
`LEVELS_CAP` 0.25 and by a channel-floor cap) — are computed from statistics (`predictBottoms`,
`predictLevels`) and written before `planShot`. Their forms ARE in OPS (`channelToe`, `channelLift`,
`masterToe`, `masterToeAnchored`). Today's crushes of 13.01% and 6.54% came from `curve black` moves.
`panel.js` `guardPixelsFor()` already REPLAYS these writes onto the sample (temperature, tint, channel
toes/lifts, the Master toe in its anchored form) so that `planShot`'s guard judges later sliders on the
right picture — but the replay happens AFTER the curve values were chosen, so it never protects the
curves themselves. And it returns `null` (no pixels at all) whenever a wheel pad or a Shadows-wheel lift
moved, because those have no pixel form.

Route (c) through pixel evaluation: choose `blackIn` (and the channel toe/lift amounts) by evaluating
candidates on the sample with `OPS.masterToeAnchored` / `OPS.channelToe` / `OPS.channelLift`, picking the
one whose measured frame `luma.p1` (and paired bottom levels, `bands.blacks.levels`, for `bottomsFor`)
lands closest to target subject to `newlyRailed` — or explain in the report precisely why a given piece
cannot be. Keep the existing meeting-level rule in `bottomsFor` (what level the three channels meet at)
and the anchor rule in `levelsFor` unchanged — those are separate decisions and out of scope; only the
AMOUNTS should become pixel-chosen.

### The code you are replacing in `planShot` (src/grade.cjs, current)

```js
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
    // A goal's own ceiling: a predicate on the predicted state the move must keep true ...
    if (g.ceiling && !g.ceiling(predicted)) {
      let v = value, tries = 0;
      while (!g.ceiling(predict(state, g.param, from, v)) && Math.abs(v - from) > 1 && tries++ < 12) v = from + (v - from) * 0.8;
      if (Math.abs(v - from) <= 1) { plan.push({ ...entry, skipped: "held: any move would pass its own ceiling" }); continue; }
      value = Math.round(v * 100) / 100; predicted = predict(state, g.param, from, value); note = (note ? note + "; " : "") + "held back at its ceiling";
    }
    // The forward guard. Judged on the frame's own pixels, composed with everything accepted so far.
    if (buf && FORWARD.OPS[g.param]) {
      const allow = allowance(baseline || damage(before), guard);
      let v = value, tries = 0, caught = null;
      for (;;) {
        const d = FORWARD.damageOf(buf, g.param, v, undefined, origin);
        if (!d) break;
        const shares = d.clipped <= allow.clipped && d.floored <= allow.crushed;
        const destroyed = d.newHigh === null ? false : (d.newHigh > allow.clipped || d.newLow > allow.crushed);
        if (shares && !destroyed) break;
        caught = d;
        if (Math.abs(v - from) <= 1 || tries++ >= 12) { v = from; break; }
        v = from + (v - from) * 0.8;
      }
      if (caught && Math.abs(v - value) > 1e-6) {
        const destroyedIt = caught.newHigh !== null && (caught.newHigh > allow.clipped || caught.newLow > allow.crushed);
        note = (note ? note + "; " : "") + "held by the pixels: " + round(value) + (destroyedIt
          ? " would destroy " + round(caught.newHigh) + "% at the top / " + round(caught.newLow) + "% at the bottom of pixels the source still had"
          : " would clip " + round(caught.clipped) + "% / floor " + round(caught.floored) + "%");
        value = Math.round(v * 100) / 100;
        predicted = predict(state, g.param, from, value);
      }
      if (Math.abs(value - from) > 1e-6) {
        try { buf = FORWARD.apply(buf, g.param, value) || null; } catch (_) { buf = null; }
      }
    } else if (buf && Math.abs(value - from) > 1e-6) {
      buf = null;
    }
    plan.push({ ...entry, value, predicted: round(readStat(predicted)), note });
    state = predicted;
```

Everything in this block that decides `value` goes through `solveKnob`/`predict`. Even after the guard
holds a value, `predicted` — the state the NEXT goal is solved on — comes from `predict()`, not from
`measure(buf)`. The only pixel-derived quantity is the damage share. That is what you are replacing.

Note the `state` handoff: `state = predicted` feeds the next goal, and `expected` (the final `state`)
is what panel.js compares against the confirm render to print `MODEL OFF BY`. When pixels are present,
`state` must become `measure(buf)` (with the `frame`/region shape preserved — see §7) so that the
reported expectation is the forward model's, not the table's.

---

## 6. What you must implement

1. **Pixel-chosen values in `planShot`** for every parameter with an `OPS` form: `temperature`, `tint`,
   `whites`, `contrast`, `exposure` (downward only — `OPS.exposure` throws above 0, deliberately, because
   the shoulder is unmeasured; do not model it), `blacks`. For each goal: generate candidates across the
   allowed range (the `PARAMS[..].range`, further limited by `g.cap`), apply each to `buf` (the sample
   composed with everything accepted so far), `measure()` the result, and pick the candidate whose
   measured `readStat` lands closest to `g.target` subject to the destruction constraint (`newlyRailed`
   against `origin`, plus the aggregate shares against `allowance(baseline)`). Bracket then bisect, or
   grid then refine — your choice, but bounded and deterministic. Round the chosen value the way the
   writer will serialise it (2 decimals, as the code already does) and evaluate THAT value, not the
   unrounded one.

2. **`predict()` stays only where there is no pixel form** — `shadows` and `highlights` — and must be
   labelled as such in the plan row (`how: "table"` or similar, surfaced in the panel's row text so the
   owner can see which values were chosen on pixels and which on the table). When a table-chosen knob
   moves, `buf` cannot be advanced (there is no form); keep the existing stand-down but make the row say
   so. Do NOT invent a form for shadows or highlights.

3. **Move `temperatureFor`/`balanceAxis` (src/grade_rules.cjs) to pixel choice** when a sample is
   available. `balanceAxis` currently solves with `solveKnob` and holds back with a predict-based loop on
   `channelFloor`/`channelTop`/saturation. Give it (and `temperatureFor`) an optional `pixels` argument
   (the arriving sample), and when present, choose the temperature and tint by evaluating candidates on
   the pixels with `OPS.temperature` / `OPS.tint` and measuring `STATISTICS.whitesRB` / `whitesG` (and
   the mixed-light mean when `mixed`), with the same hold-back conditions read from the MEASURED
   candidate rather than the predicted one. `temperatureFor` must keep returning `predicted` (callers
   chain on it) — make that `measure()` of the transformed sample when pixels are present. panel.js
   must pass the retained sample through (`preread[keyOf(c)].pixels` is available at that point; note it
   is only retained for ungraded clips — when absent, fall back to the table and label it).

4. **Route the curve amounts through pixels** (§5c): `levelsFor`'s `blackIn` and `bottomsFor`'s toe/lift
   amounts, chosen by evaluating `OPS.masterToeAnchored` / `OPS.channelToe` / `OPS.channelLift` on the
   sample. Both functions must keep their signatures working without pixels (tests and the graded-clip
   path depend on it); add an optional argument. If you conclude some piece genuinely cannot be pixel-
   chosen, say exactly why in the report — "out of time" is not a reason.

5. **The objective.** Implement the lexicographic acceptance you proposed —
   lexmin( worst violation, sum of violations, distortion ) with violations quantised to 0.4 IRE bins (the
   measurement noise floor) — as a pure function over a measured state, and use it to choose among
   candidates when a single goal's "closest to target" is not enough (e.g. a whites candidate that hits
   92 but pushes p1 past `ACCEPT.blackMax`). The criteria are `ACCEPT` in `src/grade_rules.cjs`
   (`blackMax: 6`, `whiteMin: 85`, `whiteMax: 95`; panel.js imports it as `GRADE_ACCEPT`), `SPREAD`
   (`flat: 55`, `harsh: 93`), `NEUTRAL` 1.5 on the parade ends, and destruction never beyond the source
   allowance. `verdict()` in grade_rules is the human-readable form of the same tests — keep the two
   consistent. Or argue for something better in the report — but implement whichever you argue for.

6. **Report the residual honestly.** When no candidate reaches the target without destruction, the row
   must say the chosen value, the measured statistic it lands at, and which constraint stopped it.
   Never "hit" a target the pixels did not reach.

---

## 7. Practical facts you will need

- `measure(rgb)` (`src/scopes.cjs`) takes a packed RGB `Buffer` (3 bytes per pixel, 0–255) and returns
  `{ luma: {p1,p10,p50,p90,p99,min,max}, red/green/blue: {p1,p99,mean}, clipped: {red,green,blue},
  crushed, floor: {red,green,blue}, saturation: {p50,p99}, cast: {cb,cr}, bands: {blacks, blacks1,
  whites, whites1, shadows, midtones, highlights → {rb, g, share, levels{red,green,blue}, readable}} }`.
  Read the function; the shape matters because `STATISTICS` reads `m.frame || m`.
- The reading `planShot` receives may be a REGION reading with `.frame` attached (a subject or face
  crop). The retained sample is of the FRAME. When you build `state` from `measure(buf)`, keep the
  region's own statistics where they exist (the subject's brightness for `exposure`/`shadows`) and put
  the frame measurement on `.frame`. The tonal ends, parade whites/blacks and damage are all read from
  the frame; brightness and skin from the region. If no region reading exists, `state = measure(buf)`.
- `sample()` takes every Nth pixel with a fractional stride; percentiles and shares survive it. It is
  ~6% of a 1080p frame. Do not enlarge it.
- `OPS.contrast` is APPROXIMATE (median residual up to 2.09 IRE, `contrastRule`). Choosing on pixels
  with an approximate form is still far better than the table — it composes correctly with clamping and
  with everything before it — but say in the report that contrast's form is the weakest.
- `OPS.blacks` is a toe (`blacksRule`, λ ≈ 23 IRE, 0.082 IRE of p1 per point on the calibration frame).
- The `commutation` entry in the sweeps says what order Lumetri applies things in; `SECTION_ORDER` in
  forward.cjs encodes it. Curves apply after the Basic sliders in Lumetri, but the pass WRITES the
  curves first and chooses the sliders on the state after them. That is the existing design and is
  correct as long as `buf` is built in pipeline order — check `guardPixelsFor` and `pipeline()`; if you
  find the composition order in `planShot` (sliders applied on top of a buffer that already has the
  curves baked in) disagrees with Lumetri's actual order, say so in the report and handle it by building
  the candidate through `pipeline()` with the stages in the right order.
- `test/forward.test.cjs` shows how to build synthetic frames for tests. Use synthetic frames; there is
  no footage in the repo and there must not be.

---

## 8. Hard rules

- `node --test test/*.test.cjs` must pass. It is currently 387 tests, 386 pass, 1 skipped. Write tests
  for what you change: at minimum, (i) a synthetic frame where the table would choose a value that
  clips and the pixel chooser lands the statistic within tolerance without clipping; (ii) the
  `newlyRailed` constraint rejecting a candidate that the aggregate share would pass; (iii) the fallback
  to `predict()` for `shadows`/`highlights` is labelled; (iv) `temperatureFor` with and without pixels;
  (v) the lexicographic objective's ordering on hand-built states; (vi) determinism — same input, same
  output, twice.
- **No absolute home paths in any file.** `test/privacy.test.cjs` and a pre-push hook enforce it.
  **No client names.** The test project is described ("18 clips of product/hands footage on one track"),
  never named.
- **Do not touch what reaches Premiere** — `lumetriWriter`, `curveWriter`, `wheelWriter`, `satWriter`,
  anything under the QE/host layer, `CSXS/`, `host/`. Change what values are chosen, not how they are
  written.
- **Do not add dependencies.** Node built-ins only.
- **Do not invent a form for `shadows` or `highlights`.** They are unmeasured as pixel maps. Use
  `predict()` there and label it.
- **Do not "fix" the black balance's meeting level or the shot-match path** (the `ref` branch in
  panel.js). Separate problems, out of scope.
- **Do not model Exposure above 0.** `OPS.exposure` throws there on purpose.
- Comment style: dense, explains WHY, names the evidence and the date. Read three existing functions
  before writing one. Every constant gets a sentence saying where its number came from.
- **Do not run Premiere.** Everything you do is offline arithmetic and tests. You cannot render; do not
  claim a result that would need one.
- **Commit nothing.** Leave the changes in the working tree.

---

## 9. Deliverables

1. Working code in the tree.
2. New and updated tests, passing.
3. `docs/reviews/astra_chooser_report.md`, stating:
   - exactly what changed, file by file, function by function;
   - what you deliberately did NOT do, and why;
   - **every place `predict()` or `solveKnob()` still decides a written value** (grep for both and list
     each call site with its reason);
   - the objective you implemented and why (or why you replaced the lexicographic one);
   - the evaluation count per clip and its cost;
   - what you are least confident about, and what one live run should look at first to test it
     (which row text, which statistic).

You have full write access to this repository. Implement it. Run the tests. Write the report.
