# The sweep queue — everything still missing from the full picture

Derived 2026-09-18 from `src/lumetri_sweeps.json` (what exists) against `docs/color-full-table-plan.md`
revision 2 (what is planned). **The sweep file is the authority on any number; this is the queue.**

Status today: **9 controls have a form** (6 exact, 3 approximate), **~14 have nothing**, **0 of 6 named
interactions measured**.

19 items. 11 need a render. 4 need nothing but arithmetic on data already held.

---

## Group 0 — validity. Nothing above this is trustworthy without it

| # | sweep | render |
|---|---|---|
| 1 | **Repeatability** — one control, one setting, measured 3× on 3 frames | ~9 |
| 2 | **A held-out frame from a different camera/shoot** — re-run 3 known forms on it | ~3 |

Every accuracy figure in the repo is judged against a 0.4 IRE noise floor inferred from *one*
adjacent-frame pair, and nothing has ever been measured twice at the same setting, so §0's threshold has
no empirical basis at all. Every frame used so far is the same camera and the same shoot, so any
common-mode error in Premiere's BRAW handling is invisible to us.

These two decide whether the other seventeen mean anything. Cheap.

---

## Group 1 — the pass writes these blind, today

| # | sweep | why urgent | render |
|---|---|---|---|
| 3 | **Highlights wheel pad (hue/sat)** | `padsFor` writes it on every clip. No form. | yes |
| 4 | **HSL Secondary correction scalars** | `skinFor` writes them. No form. | yes |
| 5 | **Luma-vs-Sat roll-off** | `satCurveFor` writes it. Only its *black-end* effect was measured, and that was a negative result (`satRolloffBlacks`). | yes |

The sharp end: three controls reach the picture on every run with nothing measured behind them.

---

## Group 1b — found by the chooser's first live run (2026-09-18 15:12)

| # | sweep | why | render |
|---|---|---|---|
| 5b | **Whites at large positive values on a LOW white-point frame** | On C231 (source p99 61.6) the pixel form predicted `whites 99.61 → 82.4` and the render read **90.2** — 8 IRE under, a gain of 1.46 where the form's maximum is 2^(1/2.4) = 1.33. Every other pixel-chosen Whites on the run landed within 0.4 (C193 86.7 vs 87.1, C198 91.8 vs 91.4, C202 91.8 vs 91.8, C209 85.9 vs 85.9) — all at 28–80 points. The +100 row that fixed the form was taken on a frame that **clipped 13.4 % of red**, so its p99 was pinned at 100 and the gain at the top of the range was never actually observed. The railed-table trap again, in a place the sweep file marks *exact*. Sweep Whites 60–100 on a frame whose p99 stays under ~75 so nothing rails. | yes |

**RETRACTED 2026-09-18 15:50 — the form is exact and the reading was mine.** The sweep (`whitesC231`) gives
p99 61.6 → 82.4 at +100, gain 1.338 against the form's 1.335, and 73.3 at +60 exactly as predicted. The
"90.2" was the plan row's *achieved* column, which is judged on the confirm render after **every** slider
and shared by all knobs — Highlights 75.49 ran after Whites and added the last 8. A per-knob prediction can
only be checked against a per-knob measurement. Kept here rather than deleted so the mistake is findable.

## Group 1c — Shadows and Highlights now own every remaining MODEL OFF BY (2026-09-18 15:31)

Second live run of the chooser, build fba52bc, with the pixel-form goals chosen first. Whites went from
6 pixel / 4 table to **9 pixel / 2 table**, and every unrailed pixel-chosen Whites landed within 0.4 of
its prediction (C220 91.8 → 92.2, C200 89.4 → 89.4, C198 91.8 → 91.4, C202 91.8 → 91.8, C209 85.9 →
85.9). **The MODEL OFF BY column did not follow the Whites tag, and it was wrong to expect it to.** MODEL
OFF BY is a *black-point* error, and on this footage the sliders that move the black point are Shadows
(+30 on five clips) and Highlights — both table-only. The split is now exact:

| sliders step | MODEL OFF BY |
|---|---|
| every slider pixel-chosen (C193, C198, C209, C202) | none, 1.2, none, 1.2 — reproduced from the first run |
| a table Shadows or Highlights ran (C220, C222, C223, C228, C229, C231, C200) | 1.7, 2.22, 2.58, **7.28**, 1.56, 1.4, 3.7 |

C228's 7.28 is Shadows +30; C223's 2.58 is Highlights 64.71 with Whites already pixel-exact. So **#7 and
#8 are not housekeeping: they are the whole of the remaining chooser error.** Sweep both on an unrailed
frame with the black point where it can be seen (C202 @23.94s: p1 14.5, p99 84.7), fit against every
statistic, hold one out, and mind the degenerate-pivot trap.

Also reproduced: #5b (Whites at 99.61 on C231 predicted 82.4, read 90.2).

## Group 1d — third live run of the chooser, with Shadows and Highlights on pixels (2026-09-18 16:31)

Build de8a502, fresh copy, 18 clips, 38 renders. **Balanced 3/18** (from 1). **Every clip whose black-point
chain is pixels at every step reads MODEL OFF BY ≤ 1.2 or none — 11 of 14 solved clips.** Highlights is
pixel-chosen wherever it runs (C223, C233, C231) and lands within 0.4 of prediction. The split is now:

| chain | MODEL OFF BY |
|---|---|
| every step pixels (C220, C222, C223, C233, C231, C193, C198, C209, C202, C200) | none ×8, 1.2, 1.2 |
| a **Shadows-wheel** step in the chain (C228, C229, C187) | **7.28**, 1.56, 2.9 |

So the last hole has a single name: **the Shadows wheel**. Its luma (the Lift half, `shadowsLiftFor`) and its
pad have no pixel form, so once either is written the pixel context is dropped and every slider after it
falls to the table — that is the whole of C228's 7.28 (`shadows lift 0.435` → `sliders table`), unchanged
across three runs. Queue #11 is no longer "why doesn't the magnitude transfer"; it is "find the wheel
luma's pixel form the way Shadows' was found" — overlay the two existing `shadowsWheelLuma` sweeps by input
level and see whether they trace one curve. Offline, no render.

Two costs of the run, recorded honestly:

- **Dark subjects are no longer lifted.** Shadows' goal steers on *subject brightness*, a region statistic,
  and the frame sample carries no region pixels — so the chooser refuses rather than guess, and prints
  `shadows [pixels] skipped (held: frame sample has no region pixels for brightness)` on C220, C222, C200.
  Correct by Astra's rule; a behaviour regression against the table, which used to lift them (C222 now
  ends "subject luma 32.5 dark where it matters"). Fix is mechanical: the preread has the whole frame and
  Vision's subject box, so retain a second sample cropped to the box and steer region goals on it.
- **Runtime 262 s for 17 clips against 133 s.** The `rest` column (chooser arithmetic) is 9–18 s a clip,
  not the ~1.5 s estimated: the curve amounts enumerate every writable value (51 × 3 channels + Master)
  and each candidate rebuilds from source. Acceptable for a first live version; a coarse-then-refine pass
  on the curves would recover most of it.

## Group 1e — fourth live run: the wheel luma on pixels (2026-09-18 17:17)

Build adfdd5a, fresh copy, 37 renders in 135 s, 3/18 balanced. **C228's 7.28 — unchanged across three runs —
is gone**: its chain now reads `6.3 curve 0.14 pixels → 3.1 shadows lift 0.350 pixels → 3.1 sliders pixels →
3.1 plan confirm`, black point 21.2 → 3.1 with no MODEL OFF BY at all. C187's 2.9 came down to 1.5 (lift
predicted 6.3, read 7.8 — the wheel moved less than the form says after a 0.09 anchored curve; one clip,
recorded not theorised). C229's 1.56 is identical: its lift still reads `[table]`.

**The remaining hole has one name: the wheel PADS.** C227 @5.63 and C229 are the only clips left with any
`[table]` tag, and both wrote a Highlights pad (hue/sat). A pad has no pixel form, so the lift and every
slider after it fall to the table. Everything else the pass writes is on pixels.

Still open from 1d: dark subjects not lifted (Shadows steers on subject brightness, no region pixels) — four
clips print `shadows [pixels] skipped (held: frame sample has no region pixels for brightness)`.

## Group 1f — the Highlights pad (2026-09-18 18:10): a GAIN, and every control the pass writes is now on pixels

Five hues at five sats on C202 (`highlightsPad`), hue 270 already on file from C220. The prediction — an
additive bump over the highlights — was wrong. Per row, `out/in` is one number per channel from the blacks to
the whites (within a code): **a per-channel gain about zero**, luma-preserving (Rec.709 sum = 1 ± 0.008),
linear in sat, one vector rotating in one plane with the wheel's angle warped ~4° (hue 45 sits at plane
angle 49, 135 at 130.5). A "Highlights" pad therefore tints the **blacks in the same proportion as the
whites** — the entire mechanism of the blue blacks of 2026-09-17, now measured. The shipped form interpolates
the measured hue table; a cos/sin model would miss by 0.78 IRE at sat 0.3. Constants transfer across frames
(C220 c(0) 0.387/−0.105/−0.105 vs C202 0.372/−0.108/−0.104).

`padsFor` chooses the pad's **sat** on pixels along the linear model's hue and carries it forward. With this,
**every control the pass writes has a pixel form** — white balance, channel curves, anchored Master, Shadows,
Highlights, Whites, Contrast, Blacks, wheel luma, wheel pad — and nothing stands down. Still table: the
correction pass's temperature re-scale (which uses two real renders, not a table), and Luma-vs-Sat / HSL /
skin hue-curve, which are chroma-only and do not enter the black-point chain. Unverified live.

## Group 1g — sixth live run: the pad on pixels, verified (2026-09-18 20:01)

Build 7eac93c, fresh copy (header says 18 changed, no pre-graded count), 38 renders in 143 s, 3/18 balanced.
**Every printed chain is pixels at every step, and no `[table]` tag remains anywhere.** Both pad clips read
`highlights pad [pixels]`. C229 (pad 29°/0.19) is now exact — its 1.56 is gone. C227 @5.63 (pad 211.5°/0.29)
reads MODEL OFF BY +1.6: its pad sits on the *mirrored* half of the hue table (180–225, mirror of 45) at the
sat cap, where the mirror is confirmed only at hue 270 / sat 0.15. The row cannot say which step lost the 1.6
— pad mirror, wheel-luma amount curve, or sliders on a frame that newly rails 4.7% — so it is recorded, not
theorised (`highlightsPad._verifiedLive`). C187 read +1.5 again, digit for digit the fifth run's value: the
first thing in this project measured twice at one setting, and it repeated. The only table text left is
C187's correction-pass temperature re-scale, outside the chain.

**Sweep done (20:14):** hues 211 and 225 at sat 0.2 / 0.3 on C202 (`highlightsPad.rows.hue211/hue225`,
`_mirrorVerifiedAtTheSatsThePassWrites`). Measured c per unit sat is within 0.016 of the mirrored table on
every channel at both hues; whites at sat 0.3 predicted within 0.5 IRE. **The mirror holds, so C227's +1.6
is not the pad.** Remaining candidates: the wheel-luma amount curve (C187 +1.5 at lift 0.30, deterministic;
C227 at lift 0.49) and the sliders on a frame that newly rails 4.7% high. Group 2's wheel-luma third frame is
the next measurement.

**Third frame swept (20:35):** `shadowsWheelLumaC202`. It reads like C220, not C187: 40 of 45 residuals
negative (the wheel moves the frame *more* than the pooled bump), median 0.58, worst 1.42, the sign present
even at x 0.25. Two of three frames now say "a little more than the bump"; not refitted (a ~0.4 IRE pooled
shift, at the floor, breaking the exact frame). **It does not explain the live residuals, which have the
opposite sign**: C187 +1.5 and C227 +1.6 both read the render moving *less* than the form, and both chains
had an anchored Master curve (0.09 / 0.02) under the wheel, where every sweep on file is on a bare clip.
The open question is therefore Group 4's curve→wheel interaction. `curve_sweep` gained `masterBlack` (with
`anchor`) to sweep the wheel under the grade's own curve; unverified live.

**Interaction measured (20:42, `shadowsWheelLumaUnderCurveC202`, the first of Group 4's six).** Curve then
wheel predicts every readable row within 0.9 IRE (22 of 27 within 0.5); wheel then curve misses by 1.5–2.7.
**Order proven, no interaction term beyond composition.** What the sweep exposed instead is the **curve**: the
0.5 row (anchored curve alone, 0.09 @ 0.55) reads 1.2 over the straight-line form on luma p1 and 1.9 on
green p1, largest nearest the bottom point — the same sign and size as C187's live +1.5 and the three
"darkest pixels do not respond to a levels move" lines. `curveToe._anchored`'s 0.24 was at X 0.02/0.05 on
C220. Next: Master sweep anchored at 0.55 on C202 at 0.02 / 0.05 / 0.09 / 0.12 / 0.15 — decides whether
Premiere's spline rounds the corner (a form change) or the frame differs.

**Anchored Master swept (21:11, `curveToeAnchoredC202`).** Not a rounded corner. **Red and blue follow the
line within 0.3 at every bottom point; green does not** (+1.0 / +1.9 / +2.9 at 0.05 / 0.09 / 0.12, and at
0.15 green reads 2.4 where the line says crushed, 0.28% on the floor). A monotone per-channel map cannot do
that, so either green's channel response differs, Master is not three identical curves, or it is this frame.
The 0.09 row repeated the 20:42 row digit for digit. This is the size and sign of every remaining live
MODEL OFF BY. Three sweeps, independent, placed in Group 0/2: Green alone and Red alone on C202 (same
points), Master anchored on C187 @22.02s.

**Placed (21:16).** Green alone: the line within 0.3. Red alone: the line within 0.1. Master anchored on
C187: blue (the lowest channel) on the line, red +1.0…+2.7, **green +1.9…+15.7 — at bottom point 0.20 the
line says green crushes and it reads 15.7 with 0.00% on the floor.** So **the Master curve is not three
identical channel curves** (`curveToe._modelCORRECTION`; `channelToeGreenC202`, `channelToeRedC202`,
`curveToeAnchoredC187`). Every prediction through `masterToeAnchored` / the anchored `predictLevels` branch
is wrong on any channel that is not the pixel's lowest. The form is unmeasured: percentiles cannot say
whether a channel's output depends on the other channels' input. `curve_sweep` gained `keepFrames` and
`tools/pixel_map.cjs` reads two kept renders pixel by pixel — that is the next measurement, and it gives
Master's form or rules the per-channel family out.

**Pixels read (21:23, `curveToeAnchoredC202._perPixel`).** Red and blue are 1-D maps of their own input (a
spline bowing up to 1.8 IRE above the chord, meeting it at the anchor). **Green is not 1-D**: at a fixed
green input its output rises with red input and with falling blue input, and it never crushes; the Green
curve alone shows none of it. A linear mix of the curved channels fits each bottom point but the weights
change with x, so it is not a matrix. Nine candidate mechanisms rejected on the pixels. **Master's form on
green is not found.** Next, independent: (a) the same on C187 (second frame), (b) Master *unanchored* on
C202 (is the anchor spline part of it?), (c) Red + Green + Blue toes at one x together (the per-channel
replacement the pass would write, checked pixel-exact).

**(b) and (c) read (21:35, `curveToeAnchoredC202._perPixelUnanchoredAndChannels`).** The bow was the
anchor: unanchored Master is the straight line on red and blue pixel-exact. Green's anomaly is Master's,
anchor or not, same x-dependent weights. Each channel toe alone is the line on its own channel pixel-exact
and moves the others by nothing — **three channel toes are the exact per-channel form**; their cost is no
anchor (Green 0.15 dropped p50 by 5.5 where anchored Master held it). (a) was lost to a filename collision
(fixed: names carry clip time and anchor) and is re-queued with the anchored-channel and RGB sweeps.

**(a) and the anchored channels read (21:42, `curveToeAnchoredC202._perPixelSpline`).** An anchored channel
curve is anchored Master minus the green anomaly — RGB anchored is pixel-identical to Master anchored on
red and blue, and each channel is a 1-D map. **The anchored form is Premiere's natural cubic spline through
the written points** (curves.cjs `spline`): red's per-code medians to 0.12–0.15 IRE where the chord missed
by 0.9–1.2. Wired into `levelsMap` / `predictLevels` / `masterToeAnchored`; `blackInFor` solves on it. On
C187's percentiles red is now within 0.4 at every x. Master's green anomaly repeats on C187's pixels. **The
design that follows:** write the black point as three anchored channel curves (RGB), one bottom point per
channel merging the black-balance toe and the black point — exact, 1-D, predictable — instead of Master.
**Built 21:50 (`rgbLevels`); the seventh live run verifies it.**

## Group 1h — seventh live run: the black point on channel curves (2026-09-18 22:00)

Build 0e6f6b5, fresh copy, 37 renders in 144 s, **4/18 balanced** (was 3). Every chain pixels, no `[table]`.
The Master residuals are gone: C198 +1.2 → none, C187 +1.5 → none, C202 +1.2 → none. Left: C227 @5.63
+1.2 (was +1.6) and C228 −1.1 (new). Both carry a Shadows-wheel lift; C228 read the wheel moving *more*
than the form — the sign C220 and C202 record for the bare wheel. Live and sweep now agree on the wheel's
sign (Master's anomaly had flipped it), so the wheel-luma amount refit on three frames is the next form
work, not a guess. Master identity not read back live (no curve-read tool); asserted by test.

## Group 2 — finish the nine forms that are half-done

| # | sweep | state | render |
|---|---|---|---|
| 6 | **Exposure upward — the shoulder** | 0.985 at p1, 0.971 median, 0.926 p99, 0.886 max at +0.5 stops. Unmeasured as a curve. The reverted white-point change is blocked on this. | yes |
| 7 | **Highlights — parameterise the band** | form identified (median +12.6 vs p99 +7.8 — no gain can), no parameters | yes |
| 8 | **Shadows — refit without the degenerate pivot** | quoted P of 95–100 is ill-determined and must not be used | yes |
| 9 | **Contrast — refit** | residual 2.09, signed and monotone → approximate | yes |
| 10 | **Blacks — λ and strength on a second frame** | form confirmed, constant from one frame only | yes |
| 11 | **Shadows wheel luma — why the magnitude does not transfer** | 6.6 vs 9.4 IRE for the same move; disqualifies it as a form | yes |

---

## Group 3 — no render needed. Do these first, they are free

| # | work |
|---|---|
| 12 | **Temperature + Tint per-channel-gain fit** — try offline against the existing C220 block before spending a render. If it holds, #12 replaces two sweeps. |
| 13 | **The clamp model** — `clamp(f(v), 0, 100)` per channel *before* the percentile is taken. Every form in the file is an unclamped map. Clamping is what actually ends every form (blacks at −20, whites at +50, temperature at ±50, contrast at +100), it is irreversible, and **it is the only thing that genuinely fixes an order.** |
| 14 | **Band-membership shift** — bands are defined by luma *level*, so every tonal move reclassifies pixels between them. Distinct from the documented `readable` survivorship. Unmeasured. |
| 15 | **Commutation** — closed form `(kA−1)(kB−1)(PA−PB)`, constant in v. Arithmetic, not a sweep. Whites (P=0) and Contrast (P≈49.6) provably do not commute: −0.75 IRE at +50/+50, +1.27 IRE at −50/+100. |

13 and 14 are what the plan calls the real work: they are what makes an *order* provable rather than chosen.

---

## Group 4 — interactions. Zero of six measured

| # | pair | note |
|---|---|---|
| 16 | **Shadows wheel luma × the black balance** | **a live bug.** The wheel moves channel spacing up to 3.2 IRE and runs at step 5; `bottomsFor` set the spacing at step 3 and nothing re-reads. At the live C229 setting it removes ~1.5 IRE of red-minus-blue — the entire tolerance the balance was solved to. |
| 17 | **Pre-compensating `castCoupling`** | measured (3.1× under Shadows, 1.5× Whites, 1.1× Contrast); currently *discovered* by a render instead of predicted |
| 18 | **Channel toes × the Master curve** | share floor headroom; composition assumed, never checked |
| 19 | **Whites × Highlights** | both steer p99, now known to be different families |

**Test method:** compare B's fitted *parameters* (k, P, λ) with A set and unset. NOT B's IRE slope — that
is confounded, because B's slope changes whenever A changes B's input even under perfect composition.
Tolerance no tighter than the 0.4 IRE floor.

---

## Group 5 — controls the pass does not write

No form for any of these. Only worth sweeping if the pass should reach for them.

Master curve **top** point · Shadows/Midtones wheel pads · Midtones/Highlights wheel **luma** · global
Saturation · Vibrance · three of the five hue-vs curves · the whole Creative section · Vignette.

---

## Standing rules for any sweep in this queue

From `Measuring a Lumetri Control 2026-09-17` in the Brain vault — each of these produced a confident
wrong answer before it was caught:

- **Include the control's neutral as a row**, taken from the parameter's own spec (saturation's neutral is
  100, a wheel luma's is 0.5). Two runs were wasted sweeping from 0 on a control whose neutral is 0.5.
- **Never fit a pivot from p1 and p99 when p99 barely moves** — degenerate: `P = p99` then satisfies it for
  any k. Blacks returned P = 84.7 with p99 = 84.7 and Blacks is not a gain at all.
- **Fit on all recorded statistics**, then check against one held out of the fit. Two points and two
  unknowns fit exactly by construction, so agreement on them is never evidence.
- **Never take a gain from a statistic near the rails — in any table you depend on**, not just the one
  being fitted. A railed exposure table is what took a run from 5/18 to 0/18.
- **A uniform-sign residual is noise in the extraction, not a model error.** Do not refit.
- **Guard a cast reading on `readable`, not on a damage share.** The cast statistic goes blind and can
  invert as an end is crushed.
