# The colour measurement programme

What is still unmeasured about the grade, in the order worth measuring it, with what each run
would settle and what would falsify the current belief. Written 2026-09-17 after the evening's
sweeps; every claim here is sourced from `src/lumetri_sweeps.json` or a dated run.

**The rule this list exists to serve:** anything that changes what the grade *writes* is swept
first. Two changes were reverted on 2026-09-17 for being reasoned instead of measured (the RGB
channel toes, 0.1.80/0.1.81; the black-point floor guard, 0.1.82/0.1.86), and both came back the
same evening once the sweep existed.

---

## How to run these

Each item is one or two tool calls in the panel. The panel must be the **dev** panel — its log line
reads `dev <sha>`, the installed one reads `installed 0.1.87` — and it must be **reloaded** after any
repo change, because it loads `panel.js` and `src/*.cjs` at panel load and caches them. The header
button reads `Reload panel` (or `Pull N commits & reload`).

Results go back into `src/lumetri_sweeps.json` as a named block with an `_source` line saying which
clip, which frame, which date. A negative result is still a measurement and still gets a block —
`satRolloffBlacks` is one.

---

## 1. Does the calibration transfer to a second frame? (highest value)

**The gap.** Every model in the pass is fitted on one frame: C220 at 0.5 s. Each block in
`lumetri_sweeps.json` declares it. Nothing has ever been swept anywhere else, and until
`slider_sweep` landed (4f3716a) nothing *could* be — `grade` and `grade_shot` steer a statistic to a
target, which is the opposite of what a sweep needs.

**Why it matters now.** The 19:24 whole-sequence run showed per-clip model error of about ±1 on ten
clips and +1.99 to +5.91 on four. `_blackPointResidual` eliminated every knob as the cause on the
calibration frame, which leaves "the model is fitted on one picture" as the explanation. That is a
hypothesis, not a measurement.

**Runs.** On a clip that is NOT C220 — C202 @23.94s and C200 @26.76s are good candidates (mid
brightness, no strong scene colour, both balanced cleanly):

```
slider_sweep at 23.94 seconds on contrast
slider_sweep at 23.94 seconds on shadows
slider_sweep at 23.94 seconds on whites
slider_sweep at 23.94 seconds on temperature
```

**Settles.** Compare each against the same-named block in `lumetri_sweeps.json`. If the slopes agree
within the sweep's own resolution, the models transfer and the residual is elsewhere. If they differ
materially, the one-clip calibration is the residual and every model needs either a second anchor or
a per-frame probe.

**Falsifies.** Contrast's effect on `luma p1` is the sharpest test: the C220 table says +40 moves it
about −2.9. If the second frame reads −1 or −6, transfer has failed.

---

## 1b. SETTLED, and it changed the picture — the calibration frame is the outlier

Item 2 below was run first, then extended to three frames. The result is worth stating before anything
else on this list, because it reframes item 1.

| frame | bottom | curve's clean ceiling | wheel's cost to go deeper |
|---|---|---|---|
| C220 @0.5s | mild, warm −1.6 | luma p1 3.9 for 0.89 % blue | 0.04 % |
| C187 @22.02s | strongly coloured, −29.8 | luma p1 18.8, then 3 % → 11 % blue | 0.01 % |
| C229 @9.57s | warm −12.5 | luma p1 11.0, then red floors | **zero, on every row** |

**C220 — the frame every model in `lumetri_sweeps.json` is fitted on — is the outlier of the three.**
Its "curve costs 0.89 %" is the cheapest case, and the ~20× wheel advantage it implied does not
generalise in either direction: on C187 the curve is three orders of magnitude worse, on C229 the
wheel's cost is exactly zero so there is no ratio at all.

Two further things that were assumed and are now known false:

- **Which channel pays is frame-dependent.** On C187 red and green never floored on any row and blue
  took everything; on C229 red floors first and overtakes blue (9.01 % against 7.14 % at x=0.2),
  because a warm bottom is red-dominant in its dark pixels. A solver must read all three.
- **The cast statistic inverts, not just shrinks.** On C229 `blacksRB` runs −12.5 → −14.1 → +4.3 → +0.4,
  reporting its *cleanest* number on the row with 9 % of red on the floor. `castTrust` now refuses any
  end whose band is empty, below 80 % readable, or over 1 % damaged, and the verdict says why rather
  than printing a number. Both the C187 and C229 rows are regression tests.

**What this does to item 1:** it is no longer "does the calibration transfer" but "the calibration is
fitted on the least representative of the three frames we have". Sweeping the sliders on a second frame
is still the right next run; the expectation should be that it disagrees.

---

## 2. What does the Shadows wheel luma do when a channel is ALREADY near zero?

**The gap.** `shadowsWheelLuma` was swept on a frame whose lowest channel started at 4.7, and it
barely floors anything across its whole range (blue 0.01 % at neutral, 0.35 % at 0.25) — its bottom
is soft. `shadowsLiftFor` therefore caps itself by a straight offset, which the sweep says
*overstates* the damage, because how the wheel behaves against a channel already near zero is not
measured. That cap is the difference between reaching the black point on the four outlier clips and
stopping short of it.

**Run.** On a clip whose lowest channel p1 is low — C227 @5.63s reads blue high and red low after its
balance; C187 @22.02s has red at 41.2 paired against a much lower own p1:

```
curve_sweep at 22.02 seconds on Shadows luma
```

(omit `points`; the default 0.5 → 0.25 is right, and the tool now refuses an all-below-neutral set)

**Settles.** Read `on the floor R/G/B %` against the C220 block. If the floor shares stay near zero
on a frame with a low channel too, `shadowsLiftFor`'s cap can come off the straight offset and use
the measured floor relation instead, and the outlier clips get their black point.

**Falsifies.** If floor share climbs steeply here where it did not on C220, the soft bottom is a
property of that picture, not of the control, and the conservative cap is correct as written.

---

## 3. Does the wheel luma's midtone drag come back?

**The gap.** The wheel luma is about twenty times cheaper than the curve toe on clipping but drags
the median with it, roughly point for point (`_caveat`; the 2026-09-15 `wheels` block has p50
41.6 → 38.4 at luma 0.4). Contrast and Shadows run *after* it in the pass. Whether they restore the
median, and at what cost, is not measured.

**Run.** Two reads around one grade on a clip where the lift fires:

```
scopes at <clip> seconds
Color correct → Selected clip
scopes at <clip> seconds
```

and read the `black point … → … read` chain plus the median in both scopes.

**Settles.** If the median lands within a point or two of where it started, the drag is free and the
wheel should be preferred over the curve rather than used only as a fallback. If it does not, the
current order (curve first, wheel for the remainder) is right.

---

## 4. The anchored curve above the black point

**The gap.** `curveToe._anchored` established that the anchor does not change the *black end* — the
anchored and unanchored sweeps agree to 0.24 IRE at the bottom. What the anchor does to the
**midtones and the top** is still only modelled analytically (`predictLevels`), and the 21:26 run's
C187 showed Premiere bowing a spline above the diagonal (whites 91.4 → 93.7 with nothing touching
them).

**Run.**

```
curve_sweep at 0.5 seconds on the Master curve, anchor 0.5
```

with the median and p99 columns that d02a414 added — the earlier anchored sweep predates them.

**Settles.** Whether `predictLevels`' anchored branch is right about p50 and p99, not just p1.

---

## 5. Second cuts of the same source (`C227 @4.44s`)

**The defect, already observed.** On the 19:24 run this row read
`black 24.7 / white 77.6 / blacks −35.3 / whites −20 / spread 52.9 flat` — the worst row of the
eighteen. It is not graded; it inherits the whole Lumetri state of `C227 @5.63s` through the
shot-match path, and that state was fitted to a different frame of the same clip whose readings
differ sharply (@4.44 reads blacks −27.1 / whites −25.1 against @5.63's +5.5 / −24.7).

**The tension.** The owner's rule of 2026-09-16 01:08 is that cuts seconds apart which look identical
must not differ — never shift colour between them; brightness may be balanced. So the fix is not
"grade each cut separately".

**Run.** `scopes` on both frames, source and rendered, and compare. Then decide whether the shot
reference should be the median-whites cut (as now) or the cut whose *black end* is most typical.

**Not yet attempted. No code written for it.**

---

## 6. The one-shot solve

**Not a measurement — the architecture the numbers point at.** The pass currently solves knobs
greedily in colorist order, each on the state predicted after the previous. It cannot trade one knob
against another: it has no way to say "take three points of black point from the wheel and one from
the curve so nothing clips". Every knob's response is now measured, so the black end at least can be
solved jointly under a no-clipping constraint in one step.

Depends on items 1 and 2: a joint solve amplifies model error into the wrong allocation, so it is
worth building only once transfer is known. The confirm render still catches it either way.

---

## What is already settled, so nobody re-measures it

| Question | Answer | Block |
|---|---|---|
| Master curve bottom point response | `(v − 100x)/(1 − x)`, within 0.6 IRE, always lands a touch high | `curveToe` |
| Does the Master toe change channel spacing? | No. Rigid translation — red-minus-blue held 4.70 → 4.80 | `curveToe._rigid` |
| Per-channel toe response | Same line, within 0.15 IRE on the paired statistic | `channelToe._model` |
| Does a channel toe move only one channel? | Yes, to the digit, across six rows | `channelToe._isolation` |
| What caps a channel toe? | Its own p1, not its paired level: `x ≤ (ownP1 − 2)/98` | `channelToe._crushCap` |
| Per-channel lift response | `100y + v(1 − y)`, within 0.3 IRE | `channelLift._model` |
| Does a lift cost floor headroom? | No. Zero floor at every swept setting | `channelLift._freeHeadroom` |
| Does the sat roll-off move the black end? | No. Flat to the digit through depth 0.2 | `satRolloffBlacks` |
| Does the anchor change the black end? | No — same curve, predicted to 0.24 | `curveToe._anchored` |
| Is `bands.blacks` trustworthy while crushing? | No. It drops clamped pixels; use `readable` | `curveToe._bandBlind` |
| Wheel luma vs curve toe, same black point | Wheel clips ~20× less, drags the median instead | `shadowsWheelLuma._headline` |
| Tint / Highlights wheel effect on the black point | None. Flat at every value and every hue | `_blackPointResidual._ruledOut` |
