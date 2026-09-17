# The full relationship table — plan, revision 2

**Revised 2026-09-17 after an independent review found the first version unsound.** What that review
changed is recorded at the bottom; every correction below was re-verified against the raw rows before
being accepted. Read `docs/color-control-map.md` for the per-control detail and
`src/lumetri_sweeps.json` for the evidence — **the numbers are the authority, this document is not.**

The goal: every control's effect on every part of the picture, and every interaction between them, so a
reading determines the moves and their order by calculation rather than by search.

---

## 0. The noise floor — read this before believing any accuracy claim

All values are read from 8-bit frames, so one code is **0.392 IRE**, and the file's own adjacent-frame
pair (C222 at 1:08 against 1:09) shows about **0.4 IRE** of drift on p1/p50/p99 between two frames of the
same shot a second apart.

**So 0.4 IRE is the floor, and every accuracy in this repo at or below it — 0.15, 0.2, 0.24, 0.3 — means
"indistinguishable from the measurement", not "this precise".** Nothing has been measured twice at the
same setting, so there is no empirical repeatability figure at all. That is a gap.

A form is **accepted** when its out-of-sample residual stays under ~0.5 IRE, and **downgraded to
approximate** when the residual is signed and monotone and exceeds it. Applied symmetrically — which, on
being applied symmetrically, demoted Contrast.

---

## 1. What is known

### 1a. Forms — computable on footage nobody has swept

| control | form | worst out-of-sample residual | status |
|---|---|---|---|
| **Whites** | `out = in × k`, no pivot | 0.27 (p1, median; k fitted on p99 alone) | **exact** |
| **Exposure** ↓ | linear-light gain, γ 2.4: `100·((v/100)^2.4 · 2^stops)^(1/2.4)` | 0.3 on p1+median+p99 together, one parameter | **exact, downward only** |
| **Channel toe** | `(v − 100x)/(1 − x)` | 0.153 | **exact** |
| **Channel lift** | `100y + v(1 − y)` | 0.28 | **exact** |
| **Master curve toe** | same line as the channel toe | 0.53 | **exact** |
| **Blacks** | a toe, exponential in level, λ ≈ 23 IRE | median/black ratio 0.13–0.20 against 0.427 for a gain | **form confirmed, constant from one frame** |
| **Contrast** | gain about a pivot ≈ 49.6 | **2.09**, signed and monotone | **approximate** |
| **Shadows** | dark-end control, spares the top | **1.7**, signed and monotone | **approximate** |
| **Highlights** | band centred in the upper midtones | median beats p99 (+12.6 vs +7.8) — no gain can | **form identified, not parameterised** |

**Exposure upward is not solved** — Premiere tone-maps the highlights (plain gain predicts p99 99.2 at
+0.5 stops against 91.8 measured). The sibling premiere-map repo reached the same conclusion in Round 250.

`shadowsWheelLuma` is **not** in this table. Its own row says its magnitude does not transfer (6.6 against
9.4 IRE for the same move), which by the definition above disqualifies it as a form.

### 1b. What is *not* a form

**Temperature, Tint** — first-order rows only. Likely per-channel gains; the existing C220 block can
probably confirm that on three independent statistics without a render, and that should be tried before
one is spent.

**The wheel pads**, the **HSL** scalars, global **Saturation** and **Vibrance**, the **Master curve top
point**, three of the five hue curves, the **HSL key** — nothing.

### 1c. Retracted from revision 1

- **The Part 1a slope table is withdrawn as a cross-control comparison.** It mixed frames: exposure,
  temperature and contrast come from a frame with p99 ≈ 85.5, the other five from p99 75.7 — a ~13 % bias
  every gain-type row inherits. The claim that "all eight sliders end up on the same pair of frames" was
  false.
- **The blacks slope of 30.5 was taken across the clip point.** `blacks.p1` is **0** at −20, −50 *and*
  −100 on that frame. The clean right-hand slope is ~20 per 100. Blacks has no single slope at neutral.
- **"Selectivity" is not a property of the control.** Recomputed per frame it moves substantially — whites
  0.69 → 0.84, shadows 0.83 → 0.94 between C220 and C202 — which is larger than the gaps the revision-1
  table asked you to read (0.63 / 0.68 / 0.75). Once forms are known, collateral is *computable per frame*
  from the form plus the histogram, so it is not a constraint at all.
- **"Temperature and Tint are exactly tonally neutral"** was a first-order claim stated as exact. At the
  ends temperature takes p99 85.5 → 83.1 and tint takes max 91.4 → 83.1; `blueP99` rails at 100 by −50.
  The pass runs a −83 temperature in the field, i.e. exactly where the claim fails.

---

## 2. What still needs a render — two, not five

| run | why |
|---|---|
| `slider_sweep at 23.94 seconds on temperature` | Confirm the per-channel-gain form and that its constants transfer. Try the offline fit from the C220 block **first**; if it holds, this becomes a confirmation rather than a discovery. |
| `slider_sweep at 23.94 seconds on tint` | As above, green–magenta axis. |

**Exposure needs no render** — solved above. **Highlights and Blacks are already swept** on C202.

**Fit procedure**, corrected: fit against **all** recorded statistics (min, p1, p10, p50, p90, p99, max,
six channel ends), not two, so the fit is overdetermined and cannot be zero-residual by construction.
Choose the functional family **per control** — a pivot-gain, a linear-light gain, a band weighting, a toe
— rather than forcing one family on everything, which would have mislabelled Exposure. Then check against
a statistic held out of the fit.

**And never fit a pivot from p1 and p99 when p99 barely moves.** That solve is degenerate: if the control
spares p99 then `P = p99` satisfies it for any k, so the "pivot" just reports p99 back. Blacks returned
P = 84.7 at every setting, stable to 0.1, with p99 = 84.7 — a perfect-looking fit for a control that is
not a gain at all. This also means Shadows' quoted P of 95–100 is ill-determined and must not be used.

---

## 3. Interactions

### 3a. Already measured — revision 1's "zero interactions" was wrong

- `castCoupling` — the tonal sliders move the cast the white balance just set: **3.1×** tolerance under
  Shadows, 1.5× under Whites, 1.1× under Contrast.
- `channelToe._isolation` — the three channel toes compose exactly, identical to the digit on six rows.
  That is a three-way separability *proof*, and it is the only one in the file.
- `curveToe._anchored` — the anchor does not interact with the black end (0.24 IRE).
- `blackEndC229` — the curve and the wheel drawing on one floor budget.

### 3b. The one that is a live bug — fix before measuring anything else

**The Shadows wheel luma changes channel spacing, and it runs after the black balance.** Paired
red-minus-blue from neutral to x=0.25: C220 **2.4 → 0.8**, C229 **13.0 → 9.8**, C187 29.4 → 30.6. Up to
**3.2 IRE**, direction frame-dependent. `bottomsFor` sets the spacing at step 3; `shadowsLiftFor` writes
this wheel at step 5; nothing re-reads in between. At the live C229 setting it removes ~1.5 IRE of
red-minus-blue — **the entire tolerance the black balance was solved to.** The lift is partly undoing the
balance it exists to complete.

### 3c. Commutation — analytic, no render required

For two pivot-gains, `f∘g − g∘f = (kA − 1)(kB − 1)(PA − PB)`, constant in v. Whites has P = 0 and Contrast
P ≈ 49.6, so they **provably do not commute**: whites+50 against contrast+50 differ by **−0.75 IRE**,
whites−50 against contrast+100 by **+1.27 IRE**. Revision 1 proposed a render for this; it is arithmetic.

Revision 1 also claimed that if everything commutes the grade is "a single linear system". That is a
non-sequitur — all gammas commute and none is linear. What actually breaks composability is **clamping**.

### 3d. The remaining tests, corrected

Revision 1's test — set A, sweep B, compare B's **IRE slope** — is confounded: B's slope changes whenever
A changes B's input, even under perfect composition. It cannot distinguish "the operator changed" from
"the input changed". **Compare B's fitted form parameters (k, P, λ) instead**, with a tolerance no tighter
than the 0.4 IRE floor.

Ordered by what the pass already depends on:

1. **Shadows wheel luma × the black balance** — §3b, a live bug.
2. **Pre-compensating `castCoupling`** — measured, currently discovered by a render.
3. **Channel toes × the Master curve** — they share floor headroom; composition assumed, never checked.
4. **Whites × Highlights** — both steer p99, and they are now known to be different families.

---

## 4. Missing entirely — and one of these is the real work

1. **A clamp model.** Every form here is an unclamped map, but the operator is `clamp(f(v), 0, 100)` **per
   channel, before the percentile is taken** — and percentiles of railed histograms are not railed
   percentiles. Clamping is what actually ends every form (blacks at −20, whites at +50, temperature at
   ±50, contrast at +100), it is irreversible, and **it is the thing that genuinely fixes an order.**
   Not mentioned in revision 1 at all.
2. **Band-membership shift.** `bands.shadows/midtones/highlights` are defined by luma *level*, so every
   tonal move reclassifies pixels between bands. Distinct from the documented `readable` survivorship,
   and unmeasured.
3. **Repeatability.** Nothing is measured twice at one setting, so §0's threshold has no empirical basis.
4. **A held-out frame.** Every frame used has been fitted on. Both anchors are the same camera and shoot,
   so any common-mode error in Premiere's BRAW handling is invisible to us.
5. **The objective for the headroom allocation** — what is minimised, and subject to what. This is the
   actual unsolved problem and revision 1 gave it one line.

---

## 5. Ordering — the taxonomy was wrong

Revision 1 said: collateral (a ranking), readability (a partial order), headroom (an allocation).
Collateral is **not** a constraint — it is computable per frame once the form is known. The real list:

| constraint | kind | why |
|---|---|---|
| **Irreversibility** | hard order | Clipping and flooring destroy information. The only constraint that truly fixes an order. |
| **Readability** | partial order | Do not blind a statistic before reading it — `castTrust`, and the cast that *inverts* as an end is crushed. |
| **Data dependency** | DAG | Contrast's target is `p99 − p1`, so it cannot be solved before the black and white points. Not collateral — a dependency. |
| **Non-commutation** | computable | Closed form in §3c, ~1.3 IRE at realistic gains. Compute it, do not order around it. |
| **Headroom** | allocation | The genuinely unsolved one. |

---

## What the review changed

An independent Opus reviewed revision 1 against the raw rows and found it not sound. Verified and acted
on: the `contrast.p10/p90` data bug (p10 below p1 on every row, feeding `predict()` — removed);
`contrastRule` demoted to approximate under its own test; `curveToe._rigid`'s mechanism corrected (it is a
gain about 100 and *widens* spacing); Part 1a withdrawn as a cross-control comparison; the shadows-wheel
spacing interaction promoted to a live bug; Exposure derived from data already held; the commutation test
replaced by its closed form; the clamp model and the DAG added.

Status: **9 controls have a form** (6 exact, 3 approximate), **2 need a render**, **~14 have nothing**,
and the interaction work has one live bug at the front of it.
