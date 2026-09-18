# Pixel-evaluated chooser — implementation record

2026-09-18. Offline implementation by gpt-6-astra at xhigh reasoning, with write access to this repo; no
Premiere run and no commits by it. The specification was `docs/reviews/astra_chooser_brief.md`.

Astra hit its usage limit after the implementation was complete and the suite stood at 407 tests / 405
pass / 1 fail. The sections from "The one failure" onward were written by the Claude session that
commissioned it, from the diff and the log, because Astra ran out before recording them. Where a claim
below is Astra's it is marked; everything else was verified by reading the code or running it.

## Implementation sequence (Astra's plan, as executed)

- Add synthetic regressions for choice, source-relative destruction, pipeline order, region preservation,
  white balance, serialized curves, fallback labels, the objective, and determinism. Run them red.
- Add one bounded pixel-search helper and tuple stages in `forward.pipeline`; keep the measured OPS.
- Route `planShot`, `temperatureFor`/`balanceAxis`, `bottomsFor`, and `levelsFor` through that helper.
- Wire source/context propagation and visible provenance in the sequence loop, leaving writers unchanged.
- Run focused tests, independent review, the full suite, and an offline 120k-pixel benchmark.

Baseline in Astra's sandbox: 387 tests, 380 pass, 5 fail, 2 skipped — four `listen EPERM` and one
Vision mask write, all sandbox restrictions, none real. Outside the sandbox the baseline was 387 / 386 / 1
skip / 0 fail.

## The one failure, and the fix

`prefix destruction remembers both rails when the same sample reaches each in turn` filled a 3000-byte
buffer with 200 and expected `temperature +100` to rail red high. The WB table gives red a gain of 1.244
at +100; 200 × 1.244 = 248.8, which never reaches 255. The test could not produce the rail it asserted.
Changed to 210 (261 → clips), after which `exposure −5` takes every sample to the floor and the test does
what it says: the witness has to remember the earlier high rail after a later low one erased it from the
final image. Code unchanged; fixture corrected. Suite then **407 / 406 pass / 1 skip / 0 fail**.

## What changed, file by file

**`src/grade_pixels.cjs` — new, 137 lines. The chooser.**
`choose()` evaluates candidate values for one control on the frame's own pixels and returns the one whose
MEASURED statistic lands closest to the target, subject to constraints. Bounded, deterministic work: a
17-point coarse grid, then 2 refinement passes around up to 3 centres (nearest-to-target plus two
objective basins) of 9 points each — at most 72 full evaluations, no randomness. Curves use `discrete:
true` and enumerate every writable two-decimal amount instead. Every candidate is REBUILT FROM THE SOURCE
in Lumetri section order (`pipeline`), never layered onto a baked buffer — adding a Basic move to pixels
that already carry a curve models a stack Premiere does not run. `evaluate()` checks every prefix with a
persistent witness of rail events, so a later lift cannot conceal an earlier crush; aggregate shares and
source-interior destruction are separate constraints. Ranking is lexicographic in 0.4 IRE bins.

**`src/grade.cjs` — `planShot` rewritten around the chooser.**
When pixels and a measured form are present, the value comes from `PIXELS.choose`; `predict()` is used
only when they are not, and every plan row now carries `how: "pixels"` or `how: "table"`. A table-chosen
move invalidates the pixel context for the rest of the clip (`pixel choice stands down for later goals`)
rather than pretending the buffer advanced. Readback is reconciled: a clamped or refused write replaces the
operation used for the expectation, and a non-finite readback voids it. `expected` and `expectedHow` are
returned so the panel's MODEL OFF BY compares the render against what was actually written. Region
statistics (brightness, skin hue, saturation on a face/subject read) are refused for pixel choice because
the frame sample carries no region pixels — held, not guessed.

**`src/grade_rules.cjs` — the four choosing sites, and the objective.**
`objective(m, distortion, targets)` is the lexicographic tuple Astra proposed: worst acceptance violation,
sum of violations, distortion — all in 0.4 IRE bins, with a blind cast end scored as the full 100 IRE
container rather than a fictitious zero. `candidateScore` puts acceptance first and the rule's frozen
target second, so Whites aims at 92 rather than stopping at 85. `balanceAxis` (temperature/tint),
`bottomsFor` (channel toes/lifts) and `levelsFor` (anchored Master bottom point) each take `pixels` and
choose on them when present, keeping their existing POLICY — meeting level, half-colour rule, anchor,
floor caps — and choosing only the AMOUNTS. Scene-colour targets are threaded into the objective so a Tint
search cannot earn a better score by stripping a cast the rule deliberately preserves. Each returns `how`.

**`src/forward.cjs` — two changes.**
`apply()` builds three 256-entry lookup tables per call and maps through them, doing the expensive
`exp()`/gain work once per code rather than once per pixel — same rounding, same intermediate clamps.
`pipeline()` accepts a tuple list `[[op, amount, extra], …]` as a stage so three channel toes can live in
ONE Lumetri instance (separate objects would have modelled stacked instances, putting Master after the
channels instead of before), and takes an optional `visit` callback per op for the prefix witness.

**`panel.js` — provenance, the gate, and the pixel context.**
The `graded` gate now also reads the eight Basic sliders and four hue-vs curves; the old gate checked
curves, WB and wheels and missed an editor's Contrast or Whites, which would have certified another
image's pixels as the source. Any read failure withholds the source too — an unknown pipeline is not a
neutral one. `curvePixels` is threaded from `temperatureFor` through `bottomsFor` and `levelsFor` into
`planShot`, so the sliders are chosen on pixels that already carry the exact curves written. Every row
prints `[pixels]` or `[table]` per decision. MODEL OFF BY now compares against the plan confirm (before
corrections and skin), which is the state the expectation described. Wheel moves still stand the pixel path
down for the rest of the clip, with the reason printed.

**Tests.** `test/grade_pixels.test.cjs` new (choice reaches a safe target the table overshoots and is
deterministic; source-relative destruction; pipeline order; region preservation; white balance keeps the
mixed-light mean; curve amounts serialised and meeting/anchor rules preserved; fallback labels; the
objective's ordering; the prefix witness). `test/forward.test.cjs`, `test/grade.test.cjs`,
`test/grade_rules.test.cjs` updated where the old "guard only vetoes" contract was asserted — with
pixels, the value is now chosen on pixels and is at least as close to target as the table's.

## Benchmark

One `choose()` for Whites on a 120k-pixel sample of a synthetic 1080p frame (gradient, dark corner, bright
specular): **46 evaluations in 422 ms — 9.2 ms each** — landing p99 at 91.80 for a target of 92, inside
the noise floor. Roughly 0.4 s of arithmetic per control against 0.8–5 s per Premiere render. A clip with
three pixel-chosen controls plus curves spends about 1–1.5 s choosing; an 18-clip run gains 20–25 s. The
brief said dozens of evaluations were affordable and they are; if this ever matters, `GRID` and `CENTERS`
in `grade_pixels.cjs` are the knobs, at the cost of the Tint +5 case the refinement centres exist for.

## Where `predict()` / `solveKnob()` still decide a written value

All of these are labelled in the row output. None is hidden.

| site | when | label |
|---|---|---|
| `grade.cjs` planShot table branch (l.256–278) | no pixel context, or the control has no OPS form (`highlights`, `shadows`) | `[table]` with the reason |
| `grade.cjs` `steer()` (l.143) | the single-knob `grade` tool, which is taste-only and takes no pixels | unchanged, out of scope |
| `grade_rules.cjs` `balanceAxis` table branch (l.153–158) | temperature/tint with no pixels | `(table: no retained sample)` |
| `grade_rules.cjs` `shadowsLiftFor`, `padsFor`, `goalsFor`, `satCurveFor`, `skinFor` | always — no pixel form exists for a wheel pad, the Shadows wheel luma, Luma vs Sat or the HSL correction | untouched, out of scope by the brief |
| `panel.js` correction pass (l.1971, 1980, 1985) | the temperature/tint re-scale from two REAL renders, with the table only as a ceiling | `[render slope; table ceiling]`, `[table: no confirm sample]` |

Highlights and Shadows are the two Basic sliders the chooser cannot touch, and they are exactly the two
whose forms are unmeasured (queue items #7 and #8 in `docs/color-sweep-queue.md`). Shadows is what took
C228's black point from 3.5 to 11 on the 2026-09-18 run. Measuring it is the next thing that widens the
chooser's reach.

## Deliberately not done

- **The wheel pads and the Shadows wheel luma.** No measured pixel form; the luma's magnitude does not
  transfer between frames. The pixel path stands down when they move and prints why.
- **The meeting level and the shot match.** Out of scope by the brief; both are policy decisions the
  chooser now respects rather than re-derives.
- **Exposure upward.** The shoulder is unmeasured; `limit[1]` is clamped to 0 for exposure and the row
  says `downward range only; upward shoulder unmeasured`.
- **Any change to the QE/host write layer.** Values are chosen differently; nothing about how they reach
  Premiere changed.

## Least confident

- **The 0.4 IRE bin is a policy, not a measurement.** Repeatability has never been measured (queue #1);
  if the true floor is larger, the lexicographic ranking is distinguishing candidates it should call tied.
- **Region reads.** A face/subject read gets its brightness/skin statistics from the region and its
  frame statistics from the sample; the chooser refuses region-statistic goals rather than guess. On a
  `region: "face"` run that means Exposure for skin luma always falls to the table. Correct, but a gap a
  caller may not expect.
- **The `graded` gate's cost.** Twelve extra host reads per clip. Right in principle — a non-neutral Basic
  slider makes the source sample a lie — but it is the one change here that adds round-trips.
- **Live behaviour is unverified.** Everything above is offline arithmetic and 407 passing tests. The
  18-clip run against a fresh working copy is what decides whether MODEL OFF BY collapses. Nothing here
  should be believed until it does.
