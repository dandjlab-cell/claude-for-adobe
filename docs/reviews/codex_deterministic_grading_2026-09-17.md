# Codex (GPT-6 Astra) review — deterministic colour grading architecture

**Date:** 2026-09-17, late evening. **Model:** `gpt-6-astra` via `codex exec -s read-only`.
**Brief:** unconstrained — "how do we build a robust, code-driven, deterministic colour grading scheme", pointed at the plan, the control map, the raw sweeps and the source.

**Note on staleness:** this review read the tree at roughly `9434670`. Corrections landed during and after the run (all eight sliders now have forms; `whiteBalanceRule` and `exposureRule` were derived offline), so a few of its "still unmeasured" remarks are already closed. Its architectural argument is unaffected by that and is the reason this is kept.

---

**The deterministic goal is achievable. The proposed “complete relationship table” is the wrong centre of the architecture.** Keep measuring controls, but use those measurements to build and validate a forward renderer for a small set of operations. Then solve the grading objectives jointly against that renderer.

The present system confuses three different problems:

1. What Premiere does to pixels.
2. What a particular image needs.
3. Which controls best produce that result.

Knowing the first perfectly does not solve the second. And the current percentile models do not yet describe the first reliably enough to solve the third.

I read the implementation and sweeps, and ran read-only numerical checks against the current predictors. The findings below distinguish measured evidence from architectural recommendations.

**The first change is to model images, not independently move scope readings.**

The formulation should be:

\[
I_{\text{out}} = F(I_{\text{in}},\theta,C),\qquad
m_{\text{out}} = S(I_{\text{out}})
\]

Here, \(F\) is the image-processing pipeline, \(\theta\) is the complete control state, \(C\) is the colour-management configuration, and \(S\) computes scopes.

The current implementation instead approximates:

\[
m_{\text{out}} \approx G(m_{\text{in}},\theta)
\]

That approximation is sometimes useful, but your measurement vector is not sufficient to predict its own evolution. Different images can have identical recorded percentiles and band medians, yet respond differently to channel transforms, clipping, and band selection.

This is visible in the code:

- `predict()` independently scales or offsets each statistic.
- `coupleBands()` estimates changes to **paired** band casts from **independently ranked** channel endpoints.
- `predictBottoms()` estimates a luma percentile change from weighted changes in band channel medians.
- `predictLevels()` maps channel means through a nonlinear/clamped function, although generally \(E[f(X)]\ne f(E[X])\).
- Several predictors leave damage shares and other affected measurements unchanged.

These are structural approximations, not missing calibration constants. A sequence of such predictions can produce a state that corresponds to no actual image. See [grade_model.cjs](./src/grade_model.cjs:45) and [curves.cjs](./src/curves.cjs:94).

Two numerical checks make the consequences concrete:

| Check against recorded sweeps | Current prediction | Recorded result |
|---|---:|---:|
| C202 Contrast +100, median initially 54.9 | 53.13 | 58.0 |
| C187 anchored Master toe, x=0.05, p1 initially 23.9 | 20.78 | 22.4 |
| C187 anchored Master toe, x=0.20 | 6.11 | 18.8 |

The extreme toe row is heavily floored, so it particularly exposes the missing clipping model. But the x=0.05 anchored row records **zero floor in all channels**, and already misses by 1.62.

Even the unanchored shared-channel formula is not established universally. C187 at x=0.05 takes green p1 from 19.2 to 16.9; the proposed line predicts 14.95. Red and blue fit much more closely on that same row. That requires investigation of the actual Master operation, not another assertion that it is exact. These rows are in [curveToeC187](./src/lumetri_sweeps.json:2960).

**Retain pixels—or a weighted joint RGB sample—as the prediction state.** Transform that state, then recompute every statistic from it. For pointwise operations, a weighted RGB distribution can be enough. For spatial masks, local processing, and temporal checks, retain coordinates and frame identity too.

A luminance histogram alone is insufficient. Three separate channel histograms are insufficient. You need the relationship between channels at the same pixels.

**Control identification is worthwhile, but “fit a form” needs a stricter meaning.**

The Whites evidence is good. On C202, +50 takes p99 from 84.7 to 97.6, approximately ×1.152; median moves 54.9→63.5, close to the corresponding prediction of 63.24. Meanwhile red clipping rises to 2.74%. At +100, red clipping reaches 13.42%. That is useful evidence for both gain behaviour and its usable limits. [whitesRule](./src/lumetri_sweeps.json:3650)

But a few matching quantiles do not identify the transform over RGB space. Nor does a held-out statistic from the fitted frame constitute held-out footage.

The downward Exposure equation also simplifies algebraically to:

\[
v_{\text{out}}=v_{\text{in}}\,2^{e/2.4}
\]

The recorded data support that encoded-value gain over the tested downward range. They do not independently establish Premiere’s internal implementation or prove transfer across colour pipelines. Keep the formula; narrow the claim.

Likewise, unchanged red and green medians during a blue-toe sweep are encouraging isolation evidence. They do not prove unchanged pixel membership or three-way separability. Membership can change while those medians remain constant. That distinction matters because the plan calls this a separability “proof.”

Use analytic forms where they survive pixel-level testing. Otherwise use a measured, interpolated response surface with a declared domain. A small lookup table can be deterministic and more faithful than an elegant but incorrect equation.

**The ordering problem is largely being framed at the wrong level.**

There are three orders:

- The order in which your code chooses parameters.
- The order in which it writes parameters.
- The order in which Premiere processes pixels.

The third is what the forward model must reproduce.

Adobe documents Lumetri processing top-down: Basic and Creative precede RGB Curves, followed by Hue/Saturation Curves; wheels and HSL follow those curves. It also documents that the hue/saturation curves sample their input in parallel. [Adobe’s processing description](https://helpx.adobe.com/ca/premiere/desktop/correct-color/add-color-effects/correct-color-using-hue-and-saturation-curves.html)

Your planning chain predicts white balance, wheel pads, channel curves, Master curve, wheel luma, **then Basic tonal sliders**. Writing those sliders last does not place them after the curves in the render graph. [panel.js](./panel.js:1752)

This is more consequential than finding the optimal “collateral ranking.”

First establish the actual graph, including ordering inside RGB Curves and Basic Correction where needed. Then evaluate every proposed parameter vector through that graph. Changing an upstream parameter must recompute downstream results from the baseline, not modify an already transformed summary as if the change happened last.

Solve parameters jointly. Contrast does not mathematically have to be solved after endpoints simply because its objective refers to them: endpoints are functions of the same candidate parameter vector. That dependency belongs inside the objective.

Keep sequential decisions only where they resolve genuine uncertainty—for example, establishing input colour space before permitting a grade.

**The larger obstacle is identifying what should be corrected.**

The current rules cannot safely infer all their objectives from unfamiliar footage.

A warm surface under neutral light and a neutral surface under warm light can produce the same RGB values. No amount of accurate Lumetri modelling removes that ambiguity.

The implementation substitutes thresholds for that missing information:

- `COLORED = 20` distinguishes object colour from illumination.
- Opposite casts at the ends imply mixed lighting.
- Brightest pixels become white-balance references.
- A dark subject is driven toward a fixed brightness.
- Low histogram spread becomes a contrast defect.

Those are scene priors. They are not physical laws.

C187 illustrates the problem. Its paired dark-band levels are 41.2 / 21.2 / 11.8. You can calculate exactly how to make those equal. The numbers do not tell you whether making them equal is desirable. Taking out half because the spread exceeds 20 is still a creative decision, now expressed as code.

There is also a direct policy contradiction: the comments acknowledge that a shot containing only a mid-grey wall has no white to place at 92, while `goalsFor()` uses low frame p99 to request a white point of 92 anyway. [grade_rules.cjs](./src/grade_rules.cjs:390)

I would separate three operating modes:

- **Technical normalization:** known input/output colour spaces, explicit preservation constraints, conservative adjustment.
- **Reference matching:** match identified neutral or subject regions to an approved reference under comparable lighting.
- **Declared look:** intentionally target a contrast, exposure, or colour treatment chosen by the owner.

Without a trustworthy reference, preserve more and correct less. “Insufficient evidence to neutralize this region” is a successful deterministic outcome.

This also changes the success label. “Meets the selected targets without detected damage” is defensible. “Balanced” is not an objective conclusion from these statistics alone.

**The solver I would build is small, joint, and constrained.**

Start with a restricted vocabulary: exposure, two white-balance dimensions, a low-dimensional tone shape, and saturation only when justified. Include another operation when a real acceptance case cannot be handled by that set.

Do not make all 29 controls available simultaneously. Redundant controls create multiple solutions with similar scope readings but different image consequences.

For retained sample pixels \(X_t\) from several frames:

\[
\theta^* =
\arg\min_\theta
\sum_t L\!\left(S(F(X_t,\theta,C)),T_t\right)
+\lambda R(\theta,\theta_0)
\]

subject to explicit damage and control-domain constraints.

In practical terms:

- \(T_t\) contains justified targets, not mandatory full-range endpoints.
- The loss penalizes departures from target **intervals**, avoiding needless chasing inside an acceptable range.
- Regularization prefers smaller departures from the existing approved state.
- Constraints limit newly clipped pixels, shadow compression, protected-region changes, and unsupported control settings.
- Identity is always a candidate.
- Stable tie-breaking selects the smallest sufficient change.

Use analytic inverses as initial guesses. Use deterministic bounded numerical optimization for the joint solve. Fixed initialization, candidate ordering, iteration limits, and tie-breaking preserve determinism.

**Optimization is not model guessing.** It is computation over explicit rules. Hundreds of evaluations of a small retained pixel sample do not require hundreds of Premiere renders.

A practical pass remains: baseline samples → local computation → one batched write → confirmation. Permit a bounded correction only when measured improvement and model validity justify it. Preserve the last verified acceptable state and restore it when a candidate fails.

If owning the transform is acceptable, a further simplification is possible: define your own compact colour transform and deliver it through a verified LUT/effect path. That replaces reverse-engineering many overlapping controls with validating one renderer. It requires proving LUT placement, input domain, interpolation, and delivery in this panel first; it is not a claim that the current LUT path is ready.

**Clamping belongs inside the forward evaluation, but first establish where it actually occurs.**

An 8-bit PNG at zero or 255 does not prove that every internal Lumetri stage clipped there. Export conversion can hide surviving internal headroom.

Use an overdrive-and-recovery experiment: push a known patch beyond range at one stage, attenuate at a later stage, and inspect whether distinctions return. Compare with attenuation placed before the overdrive. This distinguishes intermediate clipping from output clipping.

Once clamp locations are established, evaluate:

\[
x_{j+1}=\operatorname{clamp}(f_j(x_j,\theta_j))
\]

at those locations, on channel values, before recomputing luma, ranks, bands, and scopes. Do not introduce fictitious clamps merely because the export is bounded.

One mathematical correction matters here: for a scalar sample and monotone function, nearest-rank quantiles commute with that function, including a monotone clamp:

\[
Q_p(f(X))=f(Q_p(X))
\]

What fails in your case is treating RGB processing followed by luma calculation as a scalar function of the old luma, and trying to recover clipping shares from a handful of quantiles.

Clipping shares require the tails of the distribution. Channel p1 above a margin does not guarantee that no pixel clips; it leaves almost 1% of that channel’s population unconstrained.

Also track **newly clipped pixels**, not just the change in the total clipped percentage. A transform can unclip one region and destroy another while preserving the total.

Lifting a clipped channel away from zero does not recover its information. `readable` can return to 100% after a lift even though the underlying distinctions remain lost. Preserve baseline clipping provenance so “off the rail” cannot become “recovered.”

The file already demonstrates why: in `blackEndC229`, Master x=0.20 produces a cast reading of +0.4 while red floor share is 9.01% and readability is 4%. That is a measurement becoming misleading as the image is damaged, not successful neutralization. [blackEndC229](./src/lumetri_sweeps.json:3177)

**The minimum useful measurement programme should change immediately.**

Two more real-footage sweeps will not pin this down. There is no finite universal minimum without assumptions about locality, smoothness, and the supported colour pipeline. But there is a much more informative first programme:

| Experiment | What it establishes |
|---|---|
| Repeated exports of the exact same frame and state | Repeatability, stale renders, decoder/render variation |
| Neutral ramp and dense near-black/near-white ramps | Tonal response, shoulders, toes, clipping thresholds |
| RGB patch lattice, including saturated and near-neutral colours | Channel coupling and hue-dependent behaviour |
| Identical patches in different surrounds and frame histograms | Whether a control is pointwise or content-dependent |
| Selected control combinations | Whether identified single-control operators compose correctly |
| Unseen footage across cameras and lighting | Whether the whole policy and pipeline transfer |

For the first supported control set, a chart containing a modest RGB lattice—17³ points is a reasonable starting experiment—plus dense ramps can expose thousands of input/output correspondences in each render. Sample patch interiors to avoid edge/resampling contamination.

For each control, begin with neutral and a few settings spanning the intended operating range. Add samples where interpolation fails. Hold out both colours and slider settings. Store input/output pixels, exact serialized controls, complete pipeline settings, frame identity, and raw exports.

For interactions, compare the **rendered combined result** with the output predicted by composing the identified operators. Comparing fitted \(k,P,\lambda\) alone is insufficient if the family itself is wrong or the fit is poorly identified.

Choose combinations from the operations you actually intend to ship. You do not need an exhaustive encyclopedia of unused Lumetri features.

For production analysis, retain:

- A deterministic spatial sample of joint RGB values.
- Adequate tail sampling for clipping constraints.
- Fixed baseline regions for reference measurements.
- Recomputed output bands for diagnosis.
- Multiple deterministic frame samples per shot.

Fixed regions and recomputed bands serve different purposes: the first asks what happened to the same material; the second describes the final image distribution.

The 0.392 code step is a useful resolution limit for quantized pixel values, but the adjacent-frame difference is not a repeatability measurement. Means can also resolve sub-code differences through aggregation. Separate quantization, same-state repeatability, temporal variation, and model error rather than declaring one universal 0.4 tolerance.

The file already records matching opening/closing neutral readings in `wheelBands`, and matching baseline/restore readings for HSL Temperature. Preserve those checks and extend them into controlled repeats.

**Determinism needs a pipeline contract, not merely the absence of an LLM.**

Record and validate:

- Source decode and RAW settings.
- Input, working, and output colour spaces.
- Input/output tone mapping and gamut compression.
- Existing LUTs, effects, effect order, and keyframes.
- Premiere/effect version and relevant render configuration.
- Exact sampled frames and serialized parameter state.

Adobe explicitly says Lumetri adjustments are working-colour-space-specific. A setting calibrated in one working space is not promised to produce the same result in another. [Adobe’s colour-space documentation](https://helpx.adobe.com/premiere/desktop/correct-color/set-up-color-management/lumetri-enhancements.html)

The current source-file preread also needs a proven equivalence contract with the Premiere confirmation render. Otherwise their difference contains decoder, colour-management, scaling, or effect differences as well as the grade. Speeding up the first read is valuable only if it remains the same measurement domain.

Do not identify log encoding from picture statistics. A grey, foggy display-referred image can satisfy `looksLikeLog`; colourful log footage can fail it. Use metadata, configured source interpretation, or explicit user assignment. A heuristic may flag uncertainty, not authorize a conversion.

There are two additional implementation details worth fixing early:

- **Predict the serialized controls.** `curves.format()` rounds to two decimals: 0.107→0.11, 0.016→0.02, 0.036→0.04. Those differences are material beside sub-IRE accuracy claims. Quantize before evaluating candidates. [curves.cjs](./src/curves.cjs:38)
- **Define repeat-run behaviour.** Re-running should converge to the same state, not progressively regrade the previous output. Use a preserved baseline and an owned correction state.

One frame cannot establish safety across a shot. Sample temporal variation and constrain the grade against those samples. Otherwise a passing middle frame can hide clipped highlights, skin changes, or exposure transitions elsewhere.

**Rule-based and fitted-model passes fail differently; the proper system needs both.**

Rules fail through incorrect diagnosis, threshold discontinuities, contradictory priorities, and sequential controls undoing one another. A rule can deterministically neutralize the wrong thing.

Fitted models fail through extrapolation, hidden pipeline differences, insufficient state, and optimization exploiting inaccuracies. A model can accurately hit the wrong objective—or incorrectly predict that a destructive move is safe.

Use rules to define objectives, supported domains, and safety policy. Use a forward model to calculate consequences. Use real renders to validate those consequences. Neither component replaces the others.

**Several parts of the existing work are worth keeping intact.**

The paired-pixel cast measurements corrected a real conceptual mistake. The per-channel floor tracking is necessary. The render-confirmation loop is sound engineering. Preserving negative experiments and provenance is excellent practice.

The channel-toe evidence is useful: C229 red paired level 21.2→12.5 at x=0.10 agrees closely with 12.44 predicted. The wheel-versus-curve comparisons also reveal real tradeoffs: on C229, wheel luma 0.25 reaches p1 5.1 with zero recorded floor share, while Master x=0.15 reaches p1 4.7 with 1.37% red and 6.31% blue floored. That is exactly the kind of evidence a constrained solver should use.

What should be discarded is the leap from those observations to universal claims such as “free,” “exact,” or “computable on any footage.”

My implementation priority would be:

1. Establish one explicit supported colour pipeline and equivalent baseline/confirmation measurements.
2. Replace independent statistic updates with forward evaluation of retained joint RGB samples.
3. Identify and validate a small control set in Premiere’s actual processing order.
4. Replace unconditional endpoint normalization with explicit objectives and reference confidence.
5. Solve jointly, confirm, and retain only verified improvements.
6. Expand supported controls and pipelines when held-out failures justify it.

The owner is right that much of the push and pull can be calculated. The missing foundations are a faithful forward pipeline and justified targets—not the remaining entries in the control table.

