<!-- Review by GPT-6 Astra (Codex CLI, read-only) of the grade_sequence pipeline at 69a9f92, requested by the owner after the 18:03 run regressed. Brief: the four live run tables + the diff from 05a7a68. Acted on in the next commit; kept as the reference for those decisions. -->

# Review: why the grade regressed

**Run D regressed because the rewrite replaced a relatively effective tonal correction with an unreliable combination of Blacks, Exposure and Whites, then amplified cast errors with a mathematically incorrect nudge.** Changing the order alone does not fix that.

The current `69a9f92` fixes several D-era problems, particularly frame-versus-subject tonal measurements and Exposure being used to manufacture a white point. It still contains the pad-nudge defect, an unsupported Blacks slope, and a damage guard that starts too late.

No files were modified. Findings below distinguish observed results, reproducible code defects, and recommendations that still need live calibration.

## 1. Run C versus Run D, row by row

Numbers below are **final whole-frame readings**. `BP/WP` means black/white point; casts are blue minus red, so negative is warm and positive is blue.

| Clip @ seconds | Run C → Run D | What regressed or improved |
|---|---|---|
| C220 @0.5 | BP/WP **1.2/85.5 → 8.2/75.7**; black cast **+0.8 → +3.6** | D rolled all tonal knobs back after crushing. It lost C’s endpoint correction, then nudged shadows farther blue. White cast improved +5.1→+2.0. |
| C222 @1.645 | **4.3/86.7 → 6.3/87.8** | Lost balanced status solely through the lifted black point. D’s tonal confirm read 4.7, but the subsequent pads lifted the final BP to 6.3. |
| C223 @3.02 | **5.5/87.1 → 22.7/98.4** | Severe tonal regression despite neutral final casts. D applied Exposure **+2** plus Whites **+8.64** after Blacks. |
| C227 @4.44 | WP **80.8 → 67.8**; casts **−14.5/−25.9 → −2/+1.9** | Casts improved substantially; tone deteriorated. D rolled all tonal controls back after 1.72% clipping, leaving pads to handle color alone. |
| C227 @5.63 | **5.9/79.6 → 12.5/67.1**; casts **+1.2/−2.7 → +8.2/+6.2** | Both tone and color worsened. Tonal rollback followed by shadow-pad **0.16→0.32** and highlight-pad **0.29→0.37**. |
| C227 @6.65 | **5.5/80.8 → 18.4/94.9**; casts **+1.2/−10.6 → +6.7/+6.2** | White point improved, but Exposure **+2** and Whites **+34.27** left elevated blacks; pads crossed neutral. |
| C228 @7.735 | **5.1/85.5 → 18/88.2** | Strong evidence that replacing C’s shadow-luma move lost tonal authority: D used Blacks **−40**, with no Exposure or nudge, and still ended at BP 18. |
| C229 @9.57 | **5.5/87.1 → 21.2/98.8** | Exposure **+2**, Whites **+24.93**, then capped shadow pad. White cast improved +5.1→0, but both tonal endpoints deteriorated. |
| C233 @11.345 | **5.1/80.4 → 12.2/96.1** | Exposure **+2** and Whites **+27.23** overshot the top and lifted the bottom. Casts remained good. No nudge: this is independently a tonal failure. |
| C231 @12.515 | WP **77.3 → 97.6**; black cast **0 → +12.5** | D stacked Exposure **+2**, Whites **+50**, Contrast **+60**, then nudged shadows **0.30→0.50**. Its logged “blackPoint 25.1→63.5” was a subject statistic, not the final frame BP 10.6. |
| C193 @13.91 | **5.9/87.5 → 22.4/97.3** | Exposure **+2**, Whites **+23.29**; shadows **0.45→0.50**. Whites became neutral, but black cast changed −0.4→+7. |
| C193 @15.39 | **2/83.1 → 0.4/97.3** | Casts improved to zero; tone overshot both ends, with crushing reported. This is not a clean result. |
| C198 @17.225 | **3.5/92.9 → 14.1/93.7**; white cast **+4.3 → +7** | Little benefit at the top, major loss at the bottom. Highlight nudge **0.11→0.26** worsened the residual. |
| C209 @18.83 | **4.7/94.1 → 13.7/83.1**; casts **+0.8/+1.2 → +13.3/+9.4** | One of C’s successes became a major failure: tonal rollback, then pads **0.26→0.45** and **0.24→0.35**. |
| C209 @20.29 | **5.1/89 → 15.3/94.5**; casts **−0.4/+1.6 → +3.5/+7.1** | Exposure **+1.41** elevated tone; highlight nudge **0.08→0.21** amplified blue. |
| C187 @22.02 | **7.5/89.8 → 20.8/91.4** | Blacks **−40** did not replace C’s tonal correction. Shadow cast improved −16.4→−12.5, but highlights changed −1.2→+8.7 after a nudge. |
| C202 @23.94 | **4.7/90.6 → 12.2/91.4**; casts **0/0 → +11/+7.5** | No Exposure here. Blacks/Whites plus pad nudges destroyed a successful balance. Therefore Exposure cannot explain the entire regression. |
| C200 @26.76 | **4.3/83.1 → 10.2/85.1**; casts **+0.4/+0.8 → +12.2/+12.5** | Again no Exposure. Small white-point improvement bought at the cost of lifted, strongly blue blacks and whites. |

### What the totals actually say

- **All five C successes failed in D.**
- **17/18 D clips finished above the implemented black-point acceptance ceiling of 6.**
- **Six D clips finished above WP 95.**
- Four finished below the implemented low-white threshold of 85.
- D sometimes improved cast neutrality—especially C227 @4.44—but generally sacrificed tone or introduced opposite-sign casts.

The logs do **not** support the assistant’s claim that six D clips were “clean.” C228 ended at BP **18**, C233 at **12.2/96.1**, and C193 @15.39 at **0.4/97.3** with crushing.

### Which changes caused this?

**A. Wrong measurement domain.** D selected goals using frame endpoints but solved/reported tonal statistics from the subject. Current [grade.cjs:26](src/grade.cjs:26) correctly uses:

> `blackPoint: (m) => (m.frame || m).luma.p1`

Keep this fix. D’s per-knob arrows cannot be interpreted as isolated physical knob responses.

**B. Exposure used to fill a white-point deficit.** At `efe0a6a`, the trigger was:

> `if (WHITE_POINT[0] - wp > 8) goals.push({ param: "exposure", statistic: "whitePoint", target: 92, ... });`

That meant WP below **80** triggered Exposure, followed by Whites. Current face-only Exposure removes this failure.

**C. Blacks treated as a universal lift.** C used shadow-wheel luma; D substituted:

> `Math.max(-40, -(bp - 4) / 0.41)`

That slope came from a calibration endpoint already clamped to zero. It is not a transferable lift model.

**D. Larger pad excursions plus the new nudge.** Maximum saturation rose **0.3→0.5**; the nudge then increased saturation even after crossing neutral.

**E. Rollback removed every tonal correction.** Four D clips lost their Blacks correction because clipping at the other end triggered an all-tone reset. Current selective rollback improves this, but remains incomplete.

**Important chronology:** D represents the intermediate `efe0a6a` behaviour. It is not a live test of current `69a9f92`. The supplied logs cannot establish how much the latest fixes recover.

## 2. Should balance come before tone?

**For the existing endpoint-based pad model, reading casts before crushing the endpoints is sensible. Keep that immediate safeguard. It is not proof that the complete current sequence is correct.**

The claim in [grade_rules.cjs:14](src/grade_rules.cjs:14) is too strong:

> “Blacks, Whites and Contrast do not tint.”

An equal-channel tonal operation preserves an exactly neutral pixel. It does **not** preserve arbitrary differences between independently calculated channel percentiles. Nor does changing parameter write order change Lumetri’s internal processing order.

Consequently:

- Measuring an unclamped source cast is useful.
- Assuming it stays cancelled after nonlinear tone changes is unsafe.
- Measuring at p5 instead of p1 reduces floor sensitivity but does not resolve the underlying statistical problem.

### What I would do with these shots

Within the owner’s scopes-only workflow:

1. Establish white balance from a credible neutral reference, preserving actual product and skin color.
2. Correct broad exposure only when there is evidence that broad exposure is wrong.
3. Set supported tonal endpoints with Whites/Blacks; use a broader tonal control when the correction required is broader.
4. Correct residual shadow/highlight color using the same reference pixels.
5. Confirm the **complete** result, then permit one bounded correction or rollback.

Warm hands/products and a warm illuminant can produce similar global statistics. Same-sign endpoint casts are a useful clue, not proof of white balance. Adobe’s own white-balance procedure specifies sampling an area known to be white or neutral. [Adobe Basic Correction](https://helpx.adobe.com/au/premiere/desktop/correct-color/color-correction-fundamentals/basic-color-correction-options.html)

For now, keep balance-before-tone and stop the aggressive nudge. A larger ordering rewrite should wait for a cast measurement that remains meaningful through the tonal correction.

## 3. Pads: the definite bug and the underlying model limits

### The nudge loses the sign

[ wheels.cjs:121 ](src/wheels.cjs:121):

> `const b = Math.hypot(...), a = Math.hypot(...);`  
> `const removed = 1 - a / b;`  
> `const scale = 1 / removed;`

A cast changing **−10→+5** has crossed neutral. The code sees magnitudes **10→5**, concludes that only half was removed, and doubles the pad.

I executed:

```js
nudgePad({ hue: 220, sat: 0.2 }, [-10, 0], [5, 0])
// { hue: 220, sat: 0.4, capped: false }
```

Under an ideal linear response, the appropriate total move would be **two-thirds of 0.2**, approximately **0.133**, not 0.4.

**Smallest safe fix:** disable pad nudges until direction-aware correction is implemented. This preserves one-shot corrections and reports residuals.

### A robust bounded nudge

Let:

- `c0`, `c1`: before/after cast vectors.
- `u0`, `u1`: before/applied pad vectors.
- `d = c1 − c0`.

The least-squares scale along the observed response is:

```text
t = −dot(c0, d) / dot(d, d)
uNext = u0 + t × (u1 − u0)
```

This handles an overshoot by reducing the original move.

Guard it:

- Reject negligible or inconsistent response.
- Bound the correction distance.
- Scale the **applied delta**, not the entire existing pad.
- Skip a change that rounds to the same two-decimal serialized value.
- Use the final confirm to reject increased damage or a worse cast.

But two simultaneously changed pads plus Temperature do not provide isolated per-pad slopes. In the current combined pipeline, **one shared scale for the observed combined correction** is more defensible than pretending each wheel independently caused its endpoint’s entire change.

### The model already has error at saturation 0.15

The fitted shadow matrix is approximately:

```text
[ -40.67  -17.00 ]
[ -22.67   29.17 ]
```

On its own calibration rows:

| Shadow hue | Measured RB change | Matrix prediction |
|---|---:|---:|
| 90° | −1.20 | −2.55 |
| 270° | +3.90 | +2.55 |

The **1.35-point error at the calibration radius** is nearly the **1.5 neutrality threshold**. Raising the radius to 0.5 extrapolates to **3⅓ times** the sampled radius.

The highlight matrix fits those four calibration directions much better. That does not establish transfer to other shots or interaction with Shadows and Temperature.

**Immediate cap:** return **0.5→0.3** in both `solveCast` and pad composition. This restores C’s maximum excursion; it does not certify linearity at 0.3. A conservative validated-radius policy would use **0.15** until wider sweeps pass.

### Which source of nonlinearity matters?

| Suspect | Assessment |
|---|---|
| Floor clamp | Real risk, especially when individual channels approach zero. |
| Single-frame pad model | Demonstrably imperfect even on its own shadow calibration. |
| Independent channel p1/p99 | Fundamental ambiguity: the three percentiles need not describe the same pixels. |
| Subject region | Explains D’s tonal mismatch, but **not** its wheel-cast readings: `castAt` explicitly uses the frame. |
| Simultaneous controls | Changes cannot be attributed independently without accounting for cross-response. |
| Nudge | Definite mathematical defect, independently reproduced. |

A floor clamp is therefore **one contributor**, not an adequate diagnosis of all D failures. Many final D black points are far above the floor.

### Better cast statistic

Current [wheels.cjs:53](src/wheels.cjs:53):

> `return [f.blue[k] - f.red[k], f.green[k] - (f.red[k] + f.blue[k]) / 2];`

Replace differences of independent percentiles with **paired-pixel chroma measurements**:

- Select fixed shadow/highlight reference pixels from the source.
- As an initial engineering range, use luma ranks **5–20%** and **80–95%**.
- Exclude floor/ceiling pixels; flag insufficient surviving samples.
- Within credible neutral references, take robust medians of pixelwise `B−R` and `G−(R+B)/2`.
- Reuse the same pixels for confirms.
- Report sample count and dispersion.

Those percentile bands are proposed calibration settings, **not colorist-canon targets**. Without a credible neutral reference, report “neutrality unknown”; do not neutralize colored products because they occupy an endpoint.

Changing the statistic requires remeasuring the wheel calibration. The existing p1/p99 matrix cannot simply be reused.

## 4. Exposure: use it for exposure, not for inventing white

**Yes, Exposure belongs in balancing. No, every low p99 is not an exposure error.** The current removal of automatic product/hand Exposure is appropriate.

The transfer model in [grade_model.cjs:53](src/grade_model.cjs:53) uses:

> `cur * (b / a) : cur + (b - a)`

Its ratio-versus-offset choice comes from whichever interpolation fits the calibration sweep best. That does not establish which physical transfer law works across different clips.

The Exposure calibration has:

```text
Exposure:   0     +1     +2
p99:       85.9   96.1   99.6
p50:       36.9   47.5   58.8
```

At **+2**, the calibration white point is already compressed against the ceiling. Transferring that small remaining rise to a darker shot underestimates how far its highlights can travel.

### Would gamma 2.4 fix it?

For a verified simple gamma encoding and pure exposure gain:

```text
Δstops = γ × log2(target / current)
encodedNext = encodedCurrent × 2^(Δstops / γ)
```

That is a useful exposure estimate away from clipping. It is **not a faithful Lumetri positive-Exposure model**. The repo’s [grade_solve.cjs:5](src/grade_solve.cjs:5) explicitly records:

> “Premiere’s Exposure is ASYMMETRIC”

A fitted highlight-rolloff term from one frame would repeat the current transfer mistake. Use the actual color-space transfer function and validate a tone response across input levels before relying on it.

**Smallest practical correction:**

- Keep Exposure restricted to a valid exposure reference.
- Reject unreliable/flattened sweep solutions rather than automatically taking their endpoint.
- Retain the confirm and report residuals.
- Do not claim p99≤95 predicts channel clipping: one channel can clip while luma remains substantially lower.

Also, D’s “Exposure achieved 98” includes the other sliders in the same confirm. It is not an isolated Exposure measurement.

## 5. Blacks: the 0.41 slope is not established

The actual calibration is:

```text
Blacks:  −100  −50  −20    0    +20   +50  +100
p1:       0     0    0    8.2   12.2  16.1  20.4
```

The claimed slope is:

```text
(8.2 − 0) / 20 = 0.41
```

**The −20 sample is clipped.** It cannot establish the unclamped local derivative. Further, the model’s predicted p1 response is already flat below −20, while the custom rule extrapolates to −40. The solve and prediction disagree.

[grade_rules.cjs:104](src/grade_rules.cjs:104):

> `Math.max(-40, -(p1 - (BLACK_POINT[1] - 1)) / 0.41)`

It also ignores the current Blacks value. A second pass can calculate an absolute value as though starting from zero.

### What is Blacks doing?

Adobe describes Blacks as adjusting black clipping, Shadows as adjusting dark areas, and Contrast as affecting the midtone tonal separation. That supports treating Blacks as an endpoint/toe control, **not a constant additive lift**. Adobe does not publish the exact Lumetri transfer function. [Adobe tone controls](https://helpx.adobe.com/au/premiere/desktop/correct-color/color-correction-fundamentals/basic-color-correction-options.html)

The quoted “−40 moved 22→18 versus 14→4” is not a controlled comparison: D mixes regions and subsequent operations. Nevertheless, C228’s final BP 18 and C187’s 20.8 show that the substituted correction was inadequate.

### Smallest defensible repair

1. Remove the claim that `0.41` is a universal slope.
2. Calibrate smaller negative steps—**0, −5, −10, −15**—on an unclipped tonal ramp spanning relevant input levels.
3. Fit the endpoint response by input level; include current knob value.
4. Until that exists, cap unsupported negative extrapolation at **−20** and report the remainder.

That containment will **not** magically recover C’s deep blacks.

For a broad lifted shadow region at 20+, Shadows or a controlled curve may be the appropriate broader tonal operation; Contrast is appropriate when the whole tonal separation needs adjustment. **p1 alone cannot choose among them.** Keep these as explicit unsupported needs until calibrated, rather than silently substituting another unvalidated knob.

## 6. Speed: remove waste before removing evidence

D’s render count reconciles exactly:

```text
18 tonal confirms
 4 tonal rollback confirms
18 pad confirms
15 nudge confirms
─────────────────────────
55 renders
```

C used 20 renders. D added **35 renders** and **29.8 seconds**.

### Immediate savings

- **Disable the broken nudge:** removes 15 D renders, giving **40**, with the original confirms retained.
- **Skip unchanged capped pads:** several “nudges” wrote **0.50→0.50** and rendered again.
- **Use frame measurement for hands/products when no rule consumes their subject statistics.** Current automatic Exposure only runs for `region === "face"`. Subject masking adds work without providing that classification.
- **Reuse the timeline snapshot:** [panel.js:682](panel.js:682) calls `readSnapshot()` for every source frame even though the sequence loop already enumerated clips. Preserve identity/time-mapping checks.
- **Cache calibration-only calculations:** `scales()` repeatedly recomputes `pickSpace()` inside prediction and the 41-point solve. Cache per parameter/statistic; likewise cache wheel matrices.

### Host round trips

Current [panel.js:737](panel.js:737):

> `await host("lumetriParam", String(at), String(track), lumetriName, String(value))`

Batch:

1. One read of required scalar controls and wheels.
2. One validated write/readback of the chosen parameter set.
3. One final export.

Keep writes serial inside the existing host path. Concurrent host mutations are not the optimisation.

Any host change needs the repository-required independent review.

### The current flow exceeds the requested budget

Balance confirm + pad-nudge confirm + tonal confirm + possible rollback confirm means **up to four post-source renders**.

For the requested one-confirm/one-nudge contract, allocate the budget **per clip**, not per phase:

- Apply the initial complete correction.
- Confirm once.
- Spend one optional correction on either residual adjustment or safety rollback.
- Confirm that correction, then stop.

Combining phases safely requires accounting for their interaction. Do not simply delete the intermediate measurement while continuing to call an unmodelled state “predicted.”

## 7. Other important engineering and color flags

### P0: the damage baseline starts after color changes

The panel passes:

> `measured: state`

to `planShot`, where `state` is already temperature/pad-corrected. Then [grade.cjs:204](src/grade.cjs:204) uses:

> `const base = damage(before);`

Thus color-induced damage becomes the baseline allowance. If there are no tonal goals, that guard never runs.

**Fix:** carry one immutable initial damage baseline through the entire clip, including pad writes and nudges. Restore the last confirmed acceptable state when a correction damages it.

### P0: rollback means previous value, not zero

[grade.cjs:215](src/grade.cjs:215):

> `await set(spec.neutral || 0, p.param)`

The plan already records `p.from`. Restore **`p.from`**, not neutral. Otherwise rollback can erase an existing adjustment.

Likewise, failed wheel reads currently fall back to `null`; formatting missing wheels writes them neutral. A failed read must stop that clip rather than authorize overwriting unknown wheel state.

### P1: source pixels and current control state can disagree

Source-read parity is accepted for the verified clean setup. It does not mean ungraded source pixels describe an already graded clip.

Current code reads raw source pixels, reads existing controls, and composes additional pad offsets. On a rerun, those describe different states.

**Fix:** use the confirmed rendered state for existing grades, or reconstruct the complete existing transform with a validated model. The smallest reliable fallback is a Premiere baseline for nonneutral/effected clips.

### P1: fixed box is not fixed mask

[panel.js:643](panel.js:643) initially measures:

> `measureScopes(maskRgb(...))`

The confirm at line 632 measures:

> `measureScopes(decodeRgb(src, reuse.box))`

Those are different pixel populations. Reuse the actual mask whenever a subject statistic controls a decision. Current whole-frame tonal fixes make this less consequential for product shots, but the “same pixels” claim remains false.

### P1: verdict does not enforce its advertised contract

[grade_rules.cjs:119](src/grade_rules.cjs:119) checks:

> `const blacks = STATISTICS.blacksRB(f), whites = STATISTICS.whitesRB(f);`

It does not check the green–magenta axis used by `padsFor`. Nor does it check spread, despite the footer claiming it does.

Implemented endpoint acceptance is effectively **BP≤6, WP≥85**, not the advertised **0–5 / 88–95**. C’s successes at WP 86.7 and 87.1 reflect that.

**Fix:** one shared predicate for goals, verdict and printed thresholds. Include both cast axes. Separate “safe relative to baseline” from “meets balance targets.”

### P1: unconfirmed output can claim success from stale readings

With `confirm:false`, pads are not predicted into `state`; tonal measurement returns that same state. Balanced counts can therefore describe pre-change pixels.

**Fix:** never emit a verified balanced count without a confirm. Label it an unverified plan.

### P2: one frame validates one frame

One midpoint cannot establish the entire moving shot’s neutrality or clipping. Preserve the render budget, but phrase the result as **“sampled frame balanced”** unless broader temporal evidence exists.

## Priorities: the first three changes

| Priority | Exact change | Expected effect |
|---|---|---|
| **1. Stop pad amplification** | Disable `nudgePad` in automatic grading now; change both automatic saturation caps **0.5→0.3**; skip identical serialized writes. | Prevents the demonstrated overshoot-amplification mechanism. Particularly relevant to C227 @5.63, C209 @18.83, C202 and C200. Removes 15 renders from D’s execution pattern. Does not promise C’s exact color results. |
| **2. Keep the tonal fixes; remove unsupported extrapolation** | Keep frame-based endpoint statistics and face-only Exposure. Replace the universal **`/0.41`, minimum −40** rule with a calibrated input-level response; meanwhile limit unsupported lowering to **−20**, restoring from current values. | Removes D’s +2-stop white-point chase on C223/C229/C233/C231/C193. Stops pretending that −40 guarantees BP 4. Some lifted-black residuals will remain until calibration establishes a valid solve. |
| **3. Guard the whole clip against its initial state** | Pass the original damage baseline through every phase; restore previous controls rather than zero; use the single optional correction budget for rollback when needed. | Prevents color damage being accepted as baseline, protects existing grades, and addresses D’s rollback cases C220/C227/C209 without declaring newly damaged results acceptable. |

**Do not start by raising caps, loosening neutrality thresholds, or adding a guessed gamma/rolloff simulator. The immediate gains come from fixing direction, measurement consistency, and rollback.**

### Verification performed

Focused grading, rules, solver, wheels and scopes tests: **53 passed; two image tests blocked by read-only `mkdtemp` permissions**. The sign-losing nudge was reproduced directly, and shadow-matrix residuals were calculated from the stored sweep.

No live Premiere rerun was performed; predicted improvements above are mechanisms and expected effects, not claimed new grading results.
