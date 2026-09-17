# Findings index — read this before measuring anything

**Why this file exists.** On 2026-09-17 a session spent an evening establishing that Premiere's Exposure
is a clean gamma-2.4 gain downward and tone-maps upward, and recorded it as a new finding. It was already
in `handoff.md` — search *"Exposure calibration"*, dated 2026-09-15. The same session then built an offline Lumetri simulator without
knowing one had been built and cancelled for a stated reason. Neither mistake was carelessness — the
findings are real and recorded, in a 500+ line prose handoff with no index.

The sibling repo `premiere-map` solved this with a queryable graph and a rule at the top of its CLAUDE.md:
*query the graph, do not grep markdown for orientation.* This is the cheap version of that. **Grep this
file before running an experiment.**

Citations are quoted phrases, never line numbers: `handoff.md` grows every session and line references rot
within a day. An index whose citations do not resolve teaches the next session to stop trusting the index.

One line per established fact: what is known, when, where the evidence lives, and — the part that matters
— **what it forecloses**, so the next session does not re-open it.

---

## Colour management — the layer above Lumetri

| finding | date | evidence | forecloses |
|---|---|---|---|
| Premiere applies the full colour-space transform (primaries + transfer) **before any effect**, so Lumetri always grades converted pixels | 2026-09-17 | `handoff.md` — search *"the gamut question is answered"* | Any model that treats Lumetri as operating on camera-native values |
| The sequence carries `autoToneMapEnabled` and `autoInputGamutCompressionEnabled`, both **true** by default, and both scriptable | 2026-09-17 | `handoff.md` — search *"both log doors probed live"*; memory `project_premiere_colour_management_scriptable` | Treating highlight roll-off as a property of Lumetri rather than a setting |
| **With the tone mapper off, log footage clips** — whites to 100, 5–11 % per channel. "Log holds highlights above display white; the tone mapper is what rolls them off" | 2026-09-17 | `handoff.md` — search *"the three Sony overrides with the tone mapper OFF"* | The theory that the clipping seen in sweeps is Lumetri's own |
| `setOverrideColorSpace` works per project item; 34 spaces listed. Restore with `getOriginalColorSpace()` — the empty object is not writable back | 2026-09-17 | `handoff.md` — search *"both log doors probed live"* | Needing a plugin for gamut |
| The override lives on the **project item**, shared with the original sequence — Discard does not undo it | 2026-09-17 | `handoff.md` — search *"both log doors probed live"*, `:371` | Assuming the working copy isolates colour-space changes |
| The maker's LUT applies by writing Lumetri **property 4** (the .cube path) then **property 6 = 1**. Verified against the render: 4.7 / 92.2 / 27 against a software prediction of 4.7 / 92.2 / 24 | 2026-09-17 | `handoff.md` — search *"the maker's LUT goes on the CLIP"* | The belief that the Input LUT slot is not scriptable (it is, by index, not by name) |
| Premiere's own scopes have **no readable values** — GPU intermediates. Export Frame plus our own computation is the native path | 2026-09-15 | `handoff.md` — search *"Native scopes readback"*; premiere-map Round 250 | Any further search for a scope readback API |

## Lumetri behaviour

| finding | date | evidence | forecloses |
|---|---|---|---|
| **Exposure is asymmetric**: a clean gamma-2.4 gain downward, a highlight-protecting tone map upward. No static curve fits both | 2026-09-15 | `handoff.md` — search *"Exposure calibration"*; `exposureRule` | Fitting one curve to Exposure across its range |
| That asymmetry **cancelled an offline Lumetri simulator** and was replaced by measure-and-interpolate | 2026-09-15 | `handoff.md` — search *"Exposure calibration"* | Rebuilding an offline simulator *without addressing the asymmetry* — see the note below |
| Lumetri processes **top-down**: Basic and Creative, then RGB Curves, then hue/sat curves, then wheels and HSL — regardless of write order | Adobe docs, confirmed 2026-09-17 | `docs/reviews/codex_deterministic_grading_2026-09-17.md` | Believing that writing a parameter last makes it apply last |
| **Multiple Lumetri instances can be stacked**, each a full pipeline, so any operation order is reachable | 2026-09-17 (owner) | `src/forward.cjs` `pipeline()` | Treating Lumetri's fixed section order as a constraint on achievable order |
| QE `getParamValue`/`setParamValue` read and write the blob parameters as text — wheels, curves, HSL key. Dots to write, commas on read | 2026-09-16 | premiere-map Round 252 | Searching for a numeric API for the blob parameters |

## The forms (see `src/lumetri_sweeps.json` for the evidence and the caveats)

| control | form | status |
|---|---|---|
| Whites | **is Exposure in other units** — 100 points = 1 stop, both `2^(stops/2.4)` | exact; confirmed on two frames, bit-identical on one |
| Exposure ↓ | same gain as Whites | exact; **upward rolls off — Lumetri's own shoulder, not the sequence tone mapper**, and the shoulder is unmeasured |
| Temperature / Tint | per-channel gains; T is R-vs-B, Tint is R+B-vs-G | **family identified, constants provisional** — the three estimates disagree by up to 0.059 (Tint −20 blue), never tested on a second frame |
| Blacks | toe, exponential, λ ≈ 23 IRE | form confirmed; negative side limited by the **lowest channel's** p1 |
| Master / channel curve toe | `(v − 100x)/(1 − x)` — fixed point at the **top**, lowers all levels below it, widens spacing by 1/(1−x) | exact |
| Channel lift | `100y + v(1 − y)` | exact |
| Contrast | gain about a pivot ≈ 49.6 | **approximate** — median residual 2.09 |
| Shadows | dark-end control, spares the top | **approximate** — residual 1.7; its quoted pivot is ill-determined |
| Highlights | band in the upper midtones — *not* a gain, clips nothing at any setting | form identified, not parameterised |

## Measurement traps, learned the hard way

| trap | evidence |
|---|---|
| **A gain is dimensionless; the noise floor is in IRE.** They cannot be compared. A gain uncertainty of 0.02 is 1.6 IRE at an input of 80 — four times the floor. Convert to output units at the level it will be applied, then judge | `whiteBalanceRule._overdeterminedCORRECTED` |
| **The noise floor is 0.4 IRE** — one 8-bit code is 0.392, and two frames of one shot a second apart differ by that much. Accuracies below it are meaningless | `color-full-table-plan.md` §0 |
| **A pivot fit from p1 and p99 is degenerate when p99 barely moves** — `P` just reports p99 back. Blacks returned a "stable" pivot of 84.7 with p99 = 84.7 | `_fitMethod` |
| **`bands.*.rb` excludes pixels with a channel at 0 or 255**, so the cast goes blind — and *inverts* — as an end is crushed. It read +0.4 on a frame with 9 % of red floored | `curveToe._bandBlind`, `blackEndC229._castSignFlip` |
| **A channel's independent p1 is not a cast.** Feeding them to `neutralBottoms` in 0.1.80 made the grade worse | `curves.cjs` note |
| **`curves.format()` rounds writes to 2 dp** — a solved toe of 0.10632 is written 0.11, a 0.37 IRE error, larger than most accuracy claims here | `docs/reviews/codex_…` |
| **C220 @0.5s is the outlier**, not the typical frame — and it is the frame nearly every model is fitted on | `blackEndC229._c220IsTheOutlier` |
| **A uniform-sign residual is noise, not a model error.** A wrong exponent biases gains above and below 1 in opposite directions, so it would flip sign across zero. Whites' six residuals are all negative against gamma 2.4 — keep 2.4 | `whitesRule._doNotRefit24` |
| **Do not take a gain from a statistic near the rails** — and check EVERY table you rely on, not just the one you are fitting. Whites' p99 reaches 99.6 on C220. **Exposure's whole upward half is railed there** (max 91.4 at neutral), which is why routing the white point through it took the sequence 5/18 → 0/18 on 2026-09-17 | `whitesRule._doNotRefit24`, `exposureRule._REVERTED_upwardTableIsRailed` |
| A sweep without its **own baseline row** is not a sweep; two Shadows-luma runs were wasted on a 0.5-neutral slider swept from 0 | `curve_sweep` guard |

---

## The open question this index raised — ANSWERED, within the hour, NO

Putting those two lines next to each other produced a hypothesis: the offline simulator was cancelled
because Exposure is asymmetric, and that asymmetry might be `autoToneMapEnabled` — a sequence setting, on
by default. If so, a cancelled approach had been cancelled over a checkbox.

**It is not, and no setting had to be touched to find out.** Whites turns out to be *Exposure in different
units* — 100 Whites points = 1 stop, both a gamma-2.4 gain, confirmed on two frames and bit-identical
field-for-field on one. Downward they are the same operation exactly. **Upward they split: at the same
gain, Whites clips 2.74 % of red while Exposure rolls off and clips nothing.** A sequence-level tone
mapper acts on the composited result and cannot know which slider produced a value — if it were doing the
roll-off, Whites would roll off too. So the shoulder is inside Lumetri's Exposure, `handoff.md` — search *"Exposure calibration"*
stands, and the non-undoable `setSettings` write was never needed.

**What the hypothesis bought anyway**, which is why it was worth forming: it produced the comparison that
found Whites and Exposure to be one control, and that the pass has the wrong one banned. Raising the white
point with Whites clips; raising it with Exposure does not. The pass refuses Exposure upward and reaches
for Whites — exactly backwards if the goal is not to blow the top out.

---

## Provenance — there were two panel sessions, not one

Most of tonight's live measurement came from the Claude running inside the panel, and it was **two
different sessions** split by the extension reload onto `9bfa7de`. Anyone reading a commit message that
says "the panel's Claude" should know which, because they do not share context and the second cannot
answer for the first.

**Before the reload** (the curve-sweep session): the Shadows wheel luma on C187 and C229, the Master toe
on C187 unanchored and anchored, the knee past x=0.2, the channel toe on C229, and the identification of
both proof frames. It found the non-monotonic `readable` — the cast statistic recovering as the picture is
destroyed — the `points` signature default that had silently swept the wrong range, and it stopped three
briefs of mine that were wrong: an unanchored sweep asked for an anchored claim, a comparison at equal x
where equal black point was the question, and an arithmetic slip about where red would land.

**After the reload** (the slider-sweep session): Contrast, Whites, Shadows, Blacks, Highlights and
Exposure on C202. It found the **degenerate pivot fit** that invalidated the Shadows result and retro-
applied to earlier work, the **pipeline-position hole** in the forward-model validation plan (`F` on an
8-bit export sits at a different point in the chain than the thing it models), and the **Whites ≡
Exposure** identity. It also declined the non-undoable `setSettings` write when the result no longer
justified it, and stopped rather than routing around an approval it could not get.

It corrected this attribution itself, unprompted, when I credited the whole list to it.

---

## Doors tried — API probes, expensive to re-test

Each of these cost a live probe. The `forecloses` column is the point: do not spend another one.

| door | result | date | forecloses |
|---|---|---|---|
| Premiere's scope values via any API | **No readback.** GPU-resident intermediates drawn straight to the panel; nothing surfaced in any searchable layer | 2026-09-15 | Any further search for a scopes API. Export Frame + our own computation is the native path |
| Lumetri Input LUT by **name** (`setParamValue("Input LUT", path)`) | Returns true, changes nothing | 2026-09-17 | The "not scriptable" conclusion — it is, just not by name |
| Lumetri Input LUT by **property index** | **Works.** Property 4 = the .cube path as ASCII, property 6 = 1 for the custom flag. Clear with 6→0, 4→"" | 2026-09-17 | Needing the .prproj patch route, a restart, or a menu entry |
| Lumetri Input LUT **menu** | Lists only the 8 cubes inside the app bundle; a cube in `~/Library/…/LUTs/Input` appears after restart but **reverts on selection** — wrong slot | 2026-09-17 | The menu route entirely |
| `setOverrideColorSpace` | **Works**, 34 spaces. Restore with `getOriginalColorSpace()` — the empty "no override" object is not writable back | 2026-09-17 | Needing a native plugin for gamut |
| Colour Space Transform effect | Adds by name, 9 properties, but **SCS/TCS are driven by two Arb Data blobs that QE returns empty** — render did not change | 2026-09-17 | Driving it without decoding the blob from the .prproj |
| QE `getParamValue`/`setParamValue` on blob params (wheels, curves, HSL key) | **Works as text.** Dots to write, commas on read | 2026-09-16 | Searching for a numeric API for the blob parameters |
| `SequenceSettings.setSettings` | Works and is **NOT undoable** — checkpoint before using | 2026-09-17 | Assuming Cmd+Z covers a sequence-setting change |
| `preview_frames` | Returns the image **inline with no path**; writes nothing durable that the caller can locate | 2026-09-17 | Using it to get pixels on disk — it needs a keep/save option first, which we own |
| Panel's `run_extendscript` gate | Refuses anything starting with `.export` or `.encode`, deliberately | 2026-09-17 | Script-side frame export; `preview_frames` is the sanctioned path |
| A native plugin for the program-monitor feed | Still the only route for a **live** feed (Transmit interface) — but not needed for gamut | 2026-09-17 | Reaching for a plugin before trying colour management |
