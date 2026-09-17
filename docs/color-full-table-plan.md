# The full relationship table — what exists, and the concrete plan to finish it

The goal: every control's effect on every part of the picture, and every interaction between them, so a
reading determines the moves and their order by calculation rather than by search. Written 2026-09-17.

---

## Part 1 — what already exists (no new runs needed)

### 1a. The first-order table

Extracted from the sweep blocks already in `src/lumetri_sweeps.json`. Slope at neutral, taken from the
−20/+20 rows so clipping at the extremes does not distort it.

| control | unit | black | mid | white | sat | Cb | Cr | selectivity |
|---|---|---|---|---|---|---|---|---|
| temperature | per 100 pts | 0 | 1 | 0 | 17.5 | −5 | 7 | **0.00** |
| tint | per 100 pts | 0 | 1 | 0 | 7.5 | 4.5 | 9.5 | **0.00** |
| blacks | per 100 pts | **30.5** | 3 | 1 | −5 | 2 | −1 | **0.13** |
| highlights | per 100 pts | 1 | 9.7 | 16.5 | 5 | −2.3 | 1.5 | 0.65 |
| whites | per 100 pts | 3 | 11.7 | 21.5 | 5 | −1.8 | 1.5 | 0.68 |
| exposure | per stop | 3.1 | 10.2 | 17.7 | 6 | −1.6 | 1.6 | 0.75 |
| shadows | per 100 pts | 6.8 | 11.7 | 3 | 0 | 1.3 | 0 | 0.84 |
| contrast | per 100 pts | −6.7 | −1.8 | 8 | 7.5 | −2.3 | 1 | 1.06 |

*selectivity = collateral on the other two tonal statistics ÷ effect on its largest. Lower is cleaner.*

Two facts in there that were never stated as measurements before:

- **Temperature and Tint are exactly tonally neutral.** Zero on black, zero on white, 1 on the median.
  This is the measured justification for white balance going first — it cannot disturb tone, so nothing
  tonal has to be re-solved after it.
- **Blacks is four times more selective than any other tonal control** (0.13 against 0.65 for the next
  best) and the pass refuses to use it, on the strength of a single unstable run.

### 1b. The seven known forms

`whitesRule`, `contrastRule`, `shadowsForm`, `curveToe`, `channelToe`, `channelLift`, `shadowsWheelLuma`.
See `docs/color-control-map.md`.

---

## Part 2 — the missing runs, in order

Each is one `slider_sweep` call on **C202 @23.94s**, the second anchor where Contrast, Whites and Shadows
already live, so all eight sliders end up on the same pair of frames.

| # | run | what it settles | expected form |
|---|---|---|---|
| 1 | `slider_sweep at 23.94 seconds on blacks` | Whether the most selective control has a clean form. If it does, it is the black-point tool the pass should be using. | toe about 0 |
| 2 | `slider_sweep at 23.94 seconds on highlights` | Whites and Highlights both steer the white point; nothing measures how they differ. | gain about a low-ish pivot |
| 3 | `slider_sweep at 23.94 seconds on temperature` | Confirms tonal neutrality on a second frame, and gives the per-channel gains. | per-channel gain |
| 4 | `slider_sweep at 23.94 seconds on tint` | As above, green–magenta axis. | per-channel gain |
| 5 | `slider_sweep at 23.94 seconds on exposure` | The most global control, and the one most likely to be a gain in **linear** light rather than in these 0–100 numbers. | gain, possibly non-linear |

**Fit procedure for each**, the same one that worked for Contrast and Whites: solve `out = P + (in − P)k`
from two well-separated statistics (p1 and p99), then check the prediction against the **median**, which
was not used in the fit. A residual under ~0.3 means the form holds; a signed, monotone residual means it
does not (that is how Shadows was caught).

---

## Part 3 — the interactions. Nobody has measured any of these.

This is the part that makes it a *relationship* table rather than eight independent rows. The question for
each pair: **does control B behave the same way when control A is already set?** If yes they are
separable and the whole grade is one linear solve. If no, there is an interaction term to carry.

The test is the same every time and needs no new tooling:

1. `grade` or a manual write to put control **A** at a known non-zero value.
2. `slider_sweep` control **B** across its range.
3. Compare B's slope row against its row from neutral in Part 1a.

Ordered by how much the pass depends on the answer:

| # | pair | why it matters | what would falsify separability |
|---|---|---|---|
| 1 | Whites, then **Contrast** | The pass writes Whites then Contrast on nearly every clip. | Contrast's pivot moves off 48, or its k changes |
| 2 | Shadows, then **the black point** | Shadows runs to +50 for dark subjects and lifts the black point the curve just set. | The curve's `(v−100x)/(1−x)` stops fitting |
| 3 | Temperature, then **Whites** | `castCoupling` shows tonal moves shifting the cast by up to 3.1× tolerance; this is the reverse direction. | Whites' k differs per channel after a temperature move |
| 4 | Contrast, then **Whites** | Order-dependence: does A→B equal B→A? | The two orders land on different numbers |
| 5 | The channel toes, then **the Master curve** | They compete for the same floor headroom; the composition is assumed linear and never checked. | The combined floor cost exceeds the sum |
| 6 | Whites, then **Highlights** | Both steer p99; the pass uses Highlights to finish what Whites leaves. | Highlights' effect on p99 changes after Whites |

**Pair 4 is the important one conceptually.** If A→B ≠ B→A for any pair, then order is not a convenience,
it is part of the answer, and the solve has to fix an order before it can compute values. If all pairs
commute, the whole grade is a single linear system and order only matters for the three constraints
already identified (collateral, readability, headroom).

---

## Part 4 — what to build once Parts 2 and 3 are in

1. **Replace the tables with forms** in `src/grade_model.cjs`. `predict()` currently moves each statistic
   by a table delta, which is why it gets the median's *direction* wrong under Contrast on any frame whose
   median sits above the pivot.
2. **Pre-compensate the cast coupling.** It is measured (Shadows shifts `blacksRB` by 3.1× tolerance) and
   currently discovered by a confirm render. Modelled, it is arithmetic.
3. **Solve the headroom allocation** instead of ordering it — the one genuinely unsolved problem.
4. **Then the render count falls.** Three per clip today: one to read, one to confirm, often one to
   correct. With forms and interaction terms the corrections become unnecessary and the confirm becomes a
   check rather than a search.

---

## Honest status

Seven of ~29 controls have a form. Eight have a first-order row. **Zero interactions have been measured.**
Part 3 is entirely unstarted and is the larger half of the work.
