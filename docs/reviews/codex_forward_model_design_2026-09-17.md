# Codex (GPT-6 Astra) review, round 2 — stacking, and the forward model designed

**Date:** 2026-09-17, late. **Model:** `gpt-6-astra`, `codex exec -s read-only`, tree at `bb1a7fa`.
**Brief:** the corrections since round 1, the fact that Lumetri instances can be STACKED, and a request to design the forward model, sampling, solver and validation loop concretely.

---

**Stacking changes the available architecture, but it does not change the central recommendation: evaluate complete candidate grades on retained pixels, then solve jointly.** I would start with one explicitly addressed Lumetri instance in its native order. Add another instance only when a demonstrated result requires an order the first cannot express.

I reread the current tree at `bb1a7fa`. This is a design proposal; I did not change files or run new Premiere experiments.

**1. Corrections to the earlier review**

I withdraw the claim that those Basic controls still need their functional families discovered. The downward Exposure and white-balance findings substantially reduce that work. I also verified that `contrast.p10/p90` are absent, allowing the fallback again, and that Contrast’s approximate status is recorded.

Two qualifications remain:

- Downward Exposure simplifies to `out = in × 2^(stops/2.4)` in the measured encoding. That is the right initial predictor. These observations alone do not distinguish an internal linear-light implementation from an equivalent encoded-value gain.
- The white-balance evidence supports per-channel gains, but the wording “three independent ways agreeing to 0.02–0.03 at every setting” is too strong. Recomputing the tables, Tint −20 blue gives gain estimates **0.9412 from mean, 1.0000 from p1, 0.9382 from p99**. Low-end quantization plausibly explains that discrepancy; it does not invalidate the gain family. But gain uncertainty must be evaluated in output units: a gain difference of 0.02 means 1.6 IRE at an input of 80, not automatically less than 0.4.

Mean and two quantiles are useful consistency checks from the same image, rather than independent footage validation. The next measurement should test the proposed pixel transform and combinations, not rediscover the family. See [the new rules](./src/lumetri_sweeps.json:4001).

**2. What stacking changes**

You are right: **Basic-before-Curves is a per-instance restriction, not a restriction on the whole effect stack.** My earlier analysis should have made that distinction.

For a stack, the forward graph becomes:

\[
F(X,\theta,C)=E_C\!\left(L_N(\ldots L_2(L_1(X,\theta_1),\theta_2)\ldots,\theta_N)\right)
\]

Here `E` includes the remaining output conversion. Each `L` contains its own native section order. Adobe documents top-down section processing and that preceding effects affect the input to the current Lumetri instance. [Adobe processing description](https://helpx.adobe.com/ca/premiere/desktop/correct-color/add-color-effects/correct-color-using-hue-and-saturation-curves.html)

However, **one instance per conceptual stage is unnecessarily expensive as the default**. Use the minimum number needed for the chosen operation sequence:

- Basic → Curves → Wheels fits one.
- Curves → Basic needs two.
- Preserve an existing approved grade → append an owned correction may justify two for ownership, regardless of ordering.

Group consecutive operations that fit native order. Do not make instance count or stage ordering variables in the first optimizer.

| Vehicle | Advantage | Cost or uncertainty | Recommendation |
|---|---|---|---|
| One Lumetri | Existing controls, smallest state, easiest readback | Must model native composition | First implementation |
| Several Lumetris | Arbitrary section sequencing; separate ownership | More addressing, restoration and boundary behavior to validate | Add for a demonstrated need |
| Owned transform delivered as LUT | Exact definition of the intended transform; compact delivery | LUT placement, interpolation, domain and write path require validation | Strong alternative for global pointwise correction |

There is no mathematical reason to prefer my previous *decision order* as the processing order. With a joint solve, white balance, endpoints and contrast are properties of the same candidate. They do not need separate effects merely because the objectives are discussed in that order.

**Float precision does not answer the clamping question.** A float effect can still clamp or tone-map internally. Conversely, an 8-bit exported PNG does not establish 8-bit intermediates. Adobe describes high-bit-depth processing and configuration-dependent limitations, but that does not establish this particular stack’s behavior. [Adobe effect-processing documentation](https://helpx.adobe.com/sg/premiere/desktop/add-video-effects/types-of-effects/types-of-effects.html)

Before relying on stacking, measure:

1. One neutral instance versus two neutral instances.
2. A noncommuting pair in opposite orders, confirming actual addressing and ordering.
3. Overdrive followed by attenuation across an instance boundary. Use patches whose above-range distinctions should return if preserved.
4. The corresponding below-zero recovery experiment.
5. Playback/export cost for one, two and three instances on representative footage.

Use a higher-bit-depth reference export for the recovery experiment where available. Test actual supported renderer configurations. Do not infer the boundary from an ordinary PNG alone.

The existing addressing inconsistency is an immediate correctness issue: [parameter writes select the first instance](./host/premiere.jsx:788), while [LUT writes select the last](./host/premiere.jsx:945). Until explicit targeting exists, **reject ambiguous multiple-instance clips**.

Then give every read, write, LUT operation and restoration the same target: clip identity plus component position, checked against an effect-stack fingerprint. Revalidate before mutation; an ordinal alone becomes stale after insertion or reordering. Do not assume display names uniquely identify effects.

**Stacking does not replace the LUT argument.** A fixed composition of global pointwise operations is itself an RGB mapping, potentially representable by a 3D LUT within a measured interpolation error. A stack preserves editable native controls; an owned LUT avoids identifying all those controls. A LUT cannot represent spatial masks, temporal processing or arbitrary content-dependent behavior. Its delivery also needs validation: Adobe’s Creative Look path now includes color-space-aware interpretation, so Input LUT and Creative Look are not interchangeable insertion points. [Adobe LUT/color-space documentation](https://helpx.adobe.com/premiere/desktop/correct-color/set-up-color-management/lumetri-enhancements.html)

**3. The forward model I would implement**

The first supported domain should be **one verified SDR Rec.709 pipeline**, with static controls and an explicitly owned correction state.

The important boundary is:

\[
Y_\theta=E_C(G_\theta(U))
\]

`U` is the image entering the correction; `Y` is the exported measurement image. Today, retained pixels are effectively `X = E_C(U)`. Applying a model directly to `X` assumes that the export-domain mapping is sufficient to predict `Yθ`. That is not generally true when export has discarded headroom or applied nonlinear output tone mapping.

[The scopes module already acknowledges its SDR assumption](./src/scopes.cjs:1), and [decodeRgb returns RGB24](./src/scopes.cjs:144).

For the first implementation:

- Obtain baseline frames from Premiere with the owned correction neutralized.
- Preserve upstream approved processing.
- Require the tested color-management/export configuration.
- Exclude unsupported downstream effects, compositing and transitions.
- Treat rail pixels as having unknown lost information; never claim that lowering or lifting them recovered detail.
- Do not substitute the source-file preread until its equivalence to this baseline has been demonstrated.

If an exported baseline cannot predict the effect input adequately, the remedy is a higher-precision capture or a narrower supported domain—not another fitted percentile correction.

Use normalized encoded RGB, with JavaScript `Number`/Float64 arithmetic. Retain original RGB24 bytes and coordinates separately. **Do not round or clamp intermediate values unless that boundary has been measured.** Apply the verified export conversion and quantization at the output.

The initial operator set should be:

| Operation | Initial model | Allowed use |
|---|---|---|
| Temperature | Three interpolated channel gains | Within tested slider and RGB domains |
| Tint | Three interpolated channel gains | Same |
| Exposure | `v × 2^(e/2.4)` | Downward only |
| Tone shape, later | Measured response of a fixed curve family | Only after pixel/composition validation |

Initially use `θ = (temperature, tint, exposure)`. Suggested conservative search bounds are `[-50,50]`, `[-50,50]`, `[-2,0]`; these are proposed operating limits, not newly established accuracy claims.

For these three gains, multiplication would commute **if there are no intervening nonlinearities or clamps**. Test their combination before collapsing them into one diagonal gain.

For the next tonal extension, use two parameters: Master black-input and white-input, with the anchor and upper pin fixed from the baseline. This follows the existing [curve construction](./src/curves.cjs:58), but **does not assume its straight-line predictor matches Premiere’s spline**.

Measure the restricted curve family on ramps and colored patches. Use a sampled response table if necessary. A scalar response table is appropriate only if channel separability survives testing; otherwise use an RGB response or defer the operation. Do not add Contrast, Whites and several other redundant tone controls simultaneously.

For every candidate:

1. Serialize the parameters.
2. Parse that serialized state into the evaluator.
3. Transform original baseline pixels through the complete graph.
4. Recompute output luma, distributions, bands and damage.

The model must never start from the previously predicted candidate. The existing [sequential summary chain](./panel.js:1750) is what this replaces.

**4. How to validate those operators**

Use existing sweeps as hypotheses and regression evidence. Establish pixel fidelity with:

- A 17³ RGB patch lattice, neutral ramps and dense near-rail ramps.
- Patch interiors, avoiding scaling and edges.
- Repeated neutral exports.
- Isolated controls at selected settings.
- Held-out slider settings and held-out RGB values.
- Combined settings not used to identify individual operators.
- Identical patches placed in different surrounds and image histograms.
- Unseen real frames, including the known problematic shots.

The surround test matters: if the same input patch changes response with the surrounding image, a pointwise model is incomplete. Do not quietly fit that away.

Record raw paired exports, serialized controls, frame identity, pipeline configuration and renderer version. Fit gains from non-railed pixel pairs, not from clipped means. Reserve entire frames for validation.

Suggested initial acceptance gates, **to be tested rather than presented as measured tolerances**, are:

- Mean absolute channel error ≤ **0.5 code value**.
- 99th-percentile absolute channel error ≤ **2 code values**.
- Each scope statistic used by the solver within **0.8 IRE**.
- Newly railed pixel-share prediction within **0.05 percentage points**.
- No coherent residual pattern by channel, luminance or patch color.

Measure same-state repeatability first. If repeatability itself exceeds these gates, fix the capture path or narrow the contract. Do not automatically enlarge the allowed model error.

Keep separate error bounds for pixels, each objective statistic and clipping shares. Quantization, temporal change and model error are different quantities.

**5. Sampling: fast search, full-frame checks**

Retaining every decoded baseline frame is cheap relative to exporting it: a 4K RGB24 frame is approximately 25 MB. Keep those bytes. Subsample only for repeated optimization.

A concrete starting scheme:

- **16,384 spatially stratified pixels per frame**, one deterministic selection per cell in a 128×128 grid.
- Store pixel index, original RGB, frame identity and region membership.
- Weight cells by their pixel population where unequal.
- Use an additional independent deterministic sample of up to **4,096 pixels per protected/reference region**.
- Evaluate region objectives separately; do not mix oversampled regions into whole-frame statistics without weights.

Use a fixed integer hash of frame identity and cell index for selection. This avoids random runs and reduces regular-grid aliasing.

For temporal coverage, begin with the first and last unobstructed frames and the 25%, 50%, 75% positions. Deduplicate short shots. Add frames so unchecked gaps are no greater than one second. This is a starting policy, not proof that a flash between samples cannot be missed.

Where adjacent measurements disagree enough to change feasibility—exposure changes, highlight excursions or changing region visibility—bisect the interval. If coverage remains inadequate, report temporal uncertainty or split the shot’s treatment.

**No finite sparse sample guarantees whole-shot safety.** A strict all-frame guarantee requires checking every frame or a separately validated temporal bound.

Use the small samples to rank candidates. Then evaluate shortlisted candidates on **every retained pixel of every sampled frame**. This catches rare highlight and shadow damage missed by the search sample. Preserve per-pixel baseline rail provenance so newly damaged pixels can be counted directly.

If full-frame checks reject all candidates, retain the baseline for v1. Adaptive sample enrichment can come later.

A retained baseline is invalidated by changes to source interpretation, RAW settings, upstream effects/LUTs, effect order, time mapping, geometry, compositing, color management, proxy/decode path or export configuration. Changes to an owned candidate parameter do not invalidate it. Changed masks invalidate the region assignments; downstream changes invalidate the corresponding output prediction.

**6. The solver**

Use a deterministic bounded direct search; no new optimizer dependency is necessary.

Targets are explicit intervals on identified regions or declared look metrics. A dark or warm histogram alone must not authorize neutralization or full-range stretching.

For metric `j` on frame `t`, define:

\[
d_{tj}=
\frac{\operatorname{dist}(m_{tj}(\theta),[a_{tj},b_{tj}])}{s_j}
\]

Here `s_j` is a declared meaningful tolerance, independent of the model’s measured error.

A concrete initial objective is:

\[
J(\theta)=
\operatorname{mean}_t\sum_j w_jd_{tj}^{\,2}
+\max_{t,j}(w_jd_{tj}^{\,2})
+0.01\sum_i\left(\frac{\theta_i-\theta_{0i}}{r_i}\right)^2
\]

Use equal target weights initially unless the request specifies priorities. The maximum term prevents a good middle frame from hiding a poor sampled frame. The regularizer prefers smaller changes. Its coefficient is a proposed policy value to validate, not a property of color science.

Hard constraints:

- Parameters and input pixels stay within the validated model domain.
- No unsupported operation, keyframing or ambiguous effect ownership.
- Newly floored and newly ceiling-railed pixels are counted separately, per channel and frame.
- Proposed conservative default: each new-damage share ≤ **0.1 percentage points**; protected regions can require zero.
- Protected-region preservation limits are explicit, such as an allowed luma interval or maximum color change.
- Curve extensions must remain monotone and preserve declared shadow/highlight separation; merely moving clipped pixels off a rail is insufficient.

Apply measured model uncertainty conservatively. For example, accept a predicted damage share only if its upper error bound remains below the cap. A target is confidently met only when the predicted metric interval fits inside the requested interval. Do not let the optimizer exploit uncertain boundary behavior.

Search procedure:

1. Include baseline and an analytic gain-based seed.
2. Project both onto supported bounds and the exact write grid.
3. At each step, evaluate all single-coordinate ± moves and paired-coordinate ± moves in fixed order.
4. Select the best feasible candidate; repeat until no improvement.
5. Reduce step sizes and repeat, with a fixed evaluation limit.
6. Check finalists at full pixel resolution; choose the best verified feasible result.

For the three-control version, start with Temperature/Tint steps `20, 5, 1` and Exposure steps `0.5, 0.1, 0.01`. Restrict the final resolution if readback proves coarser. Pair moves matter because one control may compensate another.

Tie-break by objective rounded to a fixed comparison precision, then smallest normalized parameter change, then lexicographic serialized state. Deduplicate candidates by their serialized state. Use a fixed evaluation budget, for example 2,000 evaluations, rather than a time-based cutoff.

This is a bounded local search, **not a claim of a global optimum**. Identity remains available when nothing demonstrably improves the selected objectives.

For curves, the current grid is genuinely `0.01` because [format() writes two decimals](./src/curves.cjs:38). Evaluate `0.11`, not a fictional `0.107`. Higher precision is a separate write/readback/render experiment.

Pin the model, arithmetic path, sample order and configuration for repeatable decisions. Cross-machine GPU renders may still vary; distinguish deterministic parameter selection from bit-identical rendering.

**7. Confirmation and disagreement**

“One render” should mean **one confirmation round**, containing all sampled frames. One confirmed frame cannot validate a multi-frame solve.

After writing:

1. Read back every owned parameter and verify the effect-stack fingerprint.
2. Export the exact baseline frame positions.
3. Compare predicted and actual pixels and solver metrics.
4. Recheck all damage and protected-region constraints against the baseline.
5. Require actual objective improvement beyond measured uncertainty.

Handle failures separately:

| Failure | Action |
|---|---|
| Readback/state mismatch | Restore baseline; report write failure |
| Correct state, excessive prediction error | Restore; save the residual as a model counterexample |
| Model agrees, but targets remain unreachable | Return the best safe partial result with unmet targets named |
| Damage/protection constraint fails | Restore the last verified acceptable state |

For v1, allow **no automatic residual-chasing correction**. That would let the optimizer compensate for an unidentified model error. Verify restoration; if verification fails, report that explicitly rather than claiming recovery.

Persist the original baseline and owned state so rerunning solves the same problem rather than grading the last output again.

**8. The first milestone**

**Build one end-to-end pixel prediction test for combined Temperature, Tint and downward Exposure, on one explicitly addressed instance.**

This is more valuable than building the general optimizer or creating a stack now.

The milestone should:

- Capture baseline RGB and exact pipeline/control state.
- Evaluate serialized three-control settings on those pixels.
- Compare with Premiere’s combined render.
- Test held-out chart settings and unseen real frames.
- Include newly clipped-pixel accounting and a restore-to-baseline check.
- Produce a runnable regression test from the captured pairs.

The proof is specific: **parameters identified from isolated-control captures predict previously unseen combined-control renders within the stated gates, without refitting to those combined outputs.** Neutral restoration must also reproduce baseline within measured repeatability.

If that passes, you have established the representation, delivery path, composition and error budget needed by the solver. If it fails, the residual tells you whether the problem is gain identification, interaction, clipping or the exported-pixel boundary. Either outcome is substantially more useful than a solver that finds an excellent answer inside the wrong renderer.

