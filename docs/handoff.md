# Claude for Adobe — Session Handoff

**Repo:** https://github.com/dandjlab-cell/claude-for-adobe.git
**Worktree:** ~/DevApps/claude-for-adobe (the privacy scan forbids absolute home paths in this public repo)
**Date:** 2026-09-18 (day session 08:00–19:40, plus the 20:00 verification session)
**Branch:** `main`
**Last commit:** `4070a16` — the pad form verified live (sixth run)
**Role:** BUILDER

---

## What this project is

A public, MIT-licensed Premiere Pro CEP panel that runs the editor's own Claude Code (or Codex) inside
Premiere. Deterministic panel tools do the work; the model routes and relays. The active work is the colour
pass — `grade_sequence` — which grades every clip on a track by rule from the scopes, with no model choosing
numbers. **The rule, restated by the owner all session: measure, don't reason; find the FORM of each control,
not a lookup table per frame; only ship what we know how it works.**

## Current state — verified now, not remembered

```
$ git log -1 --oneline
4070a16 the Highlights pad form is verified live: every chain pixels at every step, no [table] left
$ git status --porcelain
 M docs/handoff.md        # this file only, being written; committed as the handoff commit
$ node --test test/*.test.cjs
ℹ tests 413
ℹ pass 412
ℹ fail 0
ℹ skipped 1        # whisper.test.cjs skips when schemas.adobe.com is unreachable; 413/413 when it is
$ node --test test/privacy.test.cjs
ℹ pass 4
ℹ fail 0
$ git log --oneline origin/main..HEAD | wc -l
1                  # unpushed (origin/main is at b423992). Nothing released since 0.1.87; the installed panel has none of this.
```

**Pushing needs the owner's explicit go, each time** (CLAUDE.md). The pre-push hook runs the privacy scan on
the tree and on every commit in the range; a `git filter-branch` was needed once today to strip home paths
from an already-committed review file, so run `node --test test/privacy.test.cjs` before asking.

## What was done — the chooser

The single change that matters: **every value the pass writes is now chosen on the frame's own pixels, not
read from a table of another frame's percentiles.**

Until this morning, every number came from `solveKnob() → predict()` in `src/grade_model.cjs`, a statistic-
space model that scales percentiles from a swept table. Two images with identical percentiles respond
differently to the same control, so that cannot work; the live evidence was a per-clip `MODEL OFF BY` column
(predicted black point vs the render) of 12.9 / 5.65 / 4.4 / 2.75 / 2.5 / 2.22 IRE against a 0.4 IRE noise
floor. gpt-6-astra implemented the replacement from `docs/reviews/astra_chooser_brief.md` (with write access,
`codex exec -m gpt-6-astra -c 'model_reasoning_effort="xhigh"' --approve-for-me`); its report, completed by
me after it hit its quota, is `docs/reviews/astra_chooser_report.md`.

`src/grade_pixels.cjs` is the chooser. For each control with a measured pixel form it tries up to 72
candidate values on the clip's 120k-pixel sample (rebuilt from source in Lumetri's section order every
time — never layered onto a baked buffer), measures each, and keeps the one whose statistic lands closest to
target under a lexicographic objective (worst acceptance violation, sum, distance to the rule's frozen
target, distortion; 0.4 IRE bins). Every prefix is checked with a persistent rail witness so a later lift
cannot hide an earlier crush. Deterministic; ~9 ms per evaluation.

**Five live runs today measured it.** The split was clean every time: a clip whose black-point chain is
`pixels` at every step reads `MODEL OFF BY` none or ≤ 1.2; a clip with any table step reads 1.4–7.28. So the
work became: find a pixel form for every control the pass writes. As of `0780f24`, **every one has one**:

| control | form | source |
|---|---|---|
| Temperature, Tint | per-channel gains, linear in the slider | `whiteBalanceRule`, confirmed offline this morning |
| Whites ≡ Exposure↓ | gain `2^(pts/100/2.4)` — **exact on a second frame** | `whitesC231` |
| Contrast | gain about pivot 49.6 (approximate, 2.09) | `contrastRule` |
| Blacks | toe, λ 23 | `blacksRule` |
| **Shadows, Highlights** | **bumps over input level**, zero at both ends, peaking ~17 and ~75; amount exponent per direction | `shadowsHighlightsForm` — new today |
| channel curve toe / lift | gain about **100** (a toe and a lift are one control, k>1 / k<1) | `channelToe`, corrected today |
| Master curve, anchored | identity above the anchor, line below | `curveToe._anchored` |
| **Shadows wheel luma** | the same bump family, linear in (0.5−x) | `shadowsWheelLumaForm` — new today, from the two sweeps already on file |
| **Highlights wheel pad** | **per-channel GAIN about zero**, luma-preserving, linear in sat, hue table | `highlightsPad` — new today, 5 hues × 5 sats |

Three of those overturned recorded beliefs, each by the same test — overlay two frames' (input level →
delta) points on one axis and see if they trace one curve: the Shadows/Highlights sliders are bumps not
gains; the wheel luma "does not transfer" was a key error (compared at p1, a different level on each frame);
the "Highlights" pad is not a band at all — it scales the blacks by exactly the factor it scales the whites,
which is the whole mechanism of the blue blacks of 2026-09-17.

## What was done — everything else, in commit order

`git log --oneline f628129..7eac93c` is the list. The ones a next session must know:

- `bf3d822` **the shot-match cache was keyed by track and region with no sequence** — one cache served every
  working copy ever graded, so a fresh copy replayed a deleted copy's grades ("matched to <itself>").
- `9f900e5` damage is counted **per sample against the source**, not as an aggregate share (maskable).
- `74c0674` the correction pass **converges to the frozen target**, not neutral — `nudgePad` had no target
  parameter and was draining the half-cast the coloured-bottom rule deliberately preserves (9.5 IRE error).
- `e0e55a1` the privacy guard **knows what a credential looks like** (sk-, ghp_, z.ai forms).
- `fba52bc` planShot chooses **pixel-form goals first**; a formless goal goes to the back.
- `f29df22` the `grade_sequence` header opens `[dev <sha>]` / `[installed v…]` — the panel's own Claude
  cannot see its build otherwise.
- `7eac93c` the header counts clips that **already carried a grade** — see Known Issues #1.
- `ab1b6a8` `curve_sweep` gained `"Highlights pad"` / `"Shadows pad"` modes (`hue` param, sat points).
- `0264069` commutation of two pivot-gains is a closed form, `(kA−1)(kB−1)(PA−PB)`; `tools/commutation.cjs`.

## What's in progress or blocked — read this before running anything

**The pad form (`0780f24`) is verified live** (sixth run, 2026-09-18 20:01, build 7eac93c, fresh copy: header
`18 changed`, no pre-graded count). Every printed chain is pixels at every step; no `[table]` tag anywhere.
Record: `highlightsPad._verifiedLive` in the sweep file and Group 1g of `docs/color-sweep-queue.md`. Nothing
is blocked; the next items are measurement, in order below.

## What's Next (in order)

1. **Refit Contrast (queue item 9).** Eighth run (22:20, 133a9bf): 4/18 balanced, every chain pixels, worst
   MODEL OFF BY ±1.2. The wheel amount is settled as a footage property (C228 closed, C187 paid, ±0.4 between
   frames). The one residual with a named form is C227 @5.63: no lift, the sliders step predicted the black
   point down 0.8 under Contrast 22 and the render put it up 0.4, on a frame Whites rails 4.7%. `contrastRule`
   is the only form still marked approximate (gain about pivot 49.6, residual 2.09, signed and monotone).
   Sweep it on C202 @23.94s (unrailed) with `slider_sweep` at ±25 / ±50 / ±100, overlay against the C220 rows
   by input level, fit the pivot and the curvature, ship only if both frames trace one curve; then a live
   run. *Done when* C227's chain reads ≤1.0 or its residual is named as the rail interaction (13% clip under
   Whites), which is queue Group 3 item 13, the clamp model.

2. **Dark subjects are no longer lifted.** Shadows' goal steers on *subject brightness*, a region statistic;
   the frame sample has no region pixels, so the chooser refuses (`shadows [pixels] skipped (held: frame
   sample has no region pixels for brightness)` on 4 clips). Correct by Astra's rule; a behaviour regression
   against the table. Fix: in `panel.js` `prereadSources` (grep the name; line numbers drift — it is the
   function that decodes every clip's frame once and calls `visionForGradeMany`), retain a second sample
   cropped to Vision's subject box (the function already holds the whole-frame `rgb` and Vision's box), and
   let `planShot` use it for region statistics. Estimate is mine, unsourced: a couple of hours plus a run.

3. **C187's 1.5 and the wheel-luma amount curve.** On C187 the pixel-chosen wheel lift predicted 6.3 and read
   7.8 — on both the fifth and sixth runs, digit for digit, so it is deterministic, not noise (the first value
   in this project measured twice at one setting). C220's held-out rows run a uniform ~0.8 IRE under, and the
   third frame (C202, 20:35) agrees with C220. Folded into item 1: the sign says interaction, not amount curve. The two frames disagree on the amount exponent
   (`shadowsWheelLumaForm._heldOut`). Not refitted — that would break the exact frame. A third frame settles it.

4. **Runtime.** 105–135 s for 18 clips (was 90). The curve amounts enumerate every writable value; a
   coarse-then-refine pass on the curves would recover most of it. `GRID`/`CENTERS` in `grade_pixels.cjs`.

5. **Group 0 of `docs/color-sweep-queue.md`**: repeatability (nothing has ever been measured twice at one
   setting; the 0.4 IRE floor is inferred from one frame pair) and a held-out frame from a different camera.
   Every form above was fitted on the same shoot.

6. **The headroom allocation** — the genuinely unsolved problem. Astra's answer is
   `docs/reviews/astra_headroom_answer.md`; the lexicographic objective it proposed is implemented in
   `grade_rules.cjs objective()`. Its one-candidate method was weak because my brief told it the budget was
   single-digit ms; a forward evaluation is 9 ms and a render is 1–5 s. Not re-asked; Astra's weekly quota
   ran out at ~15:00 and GLM 5.3's (z.ai) at ~16:20 — both reset 2026-09-19 10:09.

## How Work Is Verified Here

No gates tool. The agreement is:

- `node --test test/*.test.cjs` — the suite, 413 tests. Must be green before any commit.
- `node --test test/privacy.test.cjs` — the tree scan; the pre-push hook (`.githooks/pre-push`) runs it and
  `scripts/scan-history.cjs` over every commit being pushed. Patterns in `scripts/privacy-patterns.cjs`.
- **Anything that changes what the grade writes gets a live run**, on a FRESH working copy, judged by the
  `MODEL OFF BY` column per clip and the `[pixels]`/`[table]` tag per decision — not by the balanced count
  alone, which fell 4 → 1 → 3 today while the pass got strictly more honest (it stopped buying black points
  with crushed pixels). **`balanced`** is the run footer's own definition: on the sampled frame, parade ends
  aligned on both axes, black point ≤ 6, white point 85–95, spread neither flat nor harsh, nothing clipped or
  crushed beyond what the source had (`ACCEPT` in `src/grade_rules.cjs`). It is a diagnostic, not a target.
- Findings live in `src/lumetri_sweeps.json` (every block has `_source`; negative results and retractions
  stay in with `CORRECTION`/`RETRACTED` keys) and are indexed in `docs/findings-index.md` and
  `docs/color-sweep-queue.md`. **The sweep file is the authority on any number; prose is secondary.**
- Commit messages say what the round *established*. Stage by name.

## Known Issues / Watch-outs

1. **A graded working copy silently disables the chooser.** On a clip that already carries any Lumetri
   state the source sample is withheld (its pixels no longer describe the picture), so every choice is the
   table's. Three runs today were misread because of this. Always delete `Prototype_TEST [AI]` before a
   measurement run; the header now says how many clips were pre-graded.
2. **The Discard copy button vanishes on reload.** `workingCopies` (`panel.js:71`) is an in-memory Map; a
   reload empties it and the row with the button is not drawn, though the sequence still exists. Deleting the
   sequence by hand is equivalent (`discardCopy` only deletes, reopens the original, clears the note).
   Rebuilding the registry from `[AI]`-tagged sequences on load is the fix; not done.
3. **The panel's Claude cannot press Reload or Discard, and cannot read its own sha from a tool result**
   other than the `grade_sequence` header. Every reload is the owner's click. Each reload spawns a new
   session id — `ListAgents` again before `SendMessage`.
4. **Wheel PADS are on pixels; wheel luma UPWARD (x > 0.5) is unswept** and `OPS.shadowsWheelLuma` refuses
   it. The pass only lowers it. `OPS.exposure` refuses upward for the same reason (shoulder unmeasured).
5. **`verdict` has no notion of the frozen cast target**, so a policy-preserved half-cast prints as a cast
   and fails `balanced`; the correction loop's early-out never fires on exactly the coloured shots.
6. **A second `grade_sequence` on the same clip** re-reads a preserved half-cast as ordinary and drains it.
7. **The z.ai key was printed into this session's transcript** by a `pgrep -fl` on 2026-09-18 (Cursor keeps
   it in helper-process environments). The owner was told to rotate it and read it from the keychain
   (`security find-generic-password -s GLM -w`) instead. Not confirmed done.
8. `steer()` (the single-knob `grade` tool) still uses the table; taste-only, out of scope.
9. The `explainer animation` (`docs/anim/forward-guard-brief.md`) was never produced: GLM's first output was
   corrupted by a second writer, the retry hit its quota. The brief is committed; one command when quota resets.

## Key Files Changed (this session)

| file | what |
|---|---|
| `tools/pixel_map.cjs` | **new** — per-pixel map between two kept renders (Master's form) |
| `src/curves.cjs` | `levelsPoints`, `levelsMap` (the natural-spline form), `blackInFor` solves on it, `predictLevels` uses it; `rgbLevels` — the black point as three channel curves |
| `src/forward.cjs` | `masterToeAnchored` evaluates `levelsMap`; `shadowsWheelLuma` pooled bump + amount table |
| `panel.js` (evening) | `curve_sweep`: `masterBlack` (wheel under the grade's curve), `keepFrames` (names carry clip time + anchor), `anchor` on channel curves, `curve: "RGB"` |
| `src/grade_pixels.cjs` | **new** — the chooser: `choose`, `evaluate` (prefix rail witness), `context`, `readingFor` |
| `src/forward.cjs` | OPS gained `shadows`, `highlights` (bumps), `shadowsWheelLuma`, `highlightsPad`, `masterToeAnchored`; `newlyRailed`; 256-entry LUT apply; tuple stages |
| `src/grade.cjs` | `planShot` chooses on pixels, pixel-form goals first, readback reconciled, `expected`/`expectedHow` |
| `src/grade_rules.cjs` | `objective`, `candidateScore`; `temperatureFor`/`balanceAxis`, `bottomsFor`, `levelsFor`, `shadowsLiftFor`, `padsFor` all take `pixels` and return `how` |
| `src/wheels.cjs` | `nudgePad(…, target)` — aims at the frozen target |
| `panel.js` | pixel context threaded through the whole clip; `graded` gate reads Basic sliders + hue curves; sequence-keyed match cache; `[dev sha]` header; pre-graded count; pad sweep mode; honest closing line |
| `src/lumetri_sweeps.json` | +`commutation`, `shadowsC202`, `highlightsC202`, `whitesC231`, `shadowsHighlightsForm`, `shadowsWheelLumaForm`, `highlightsPad`; corrections in `whiteBalanceRule`, `shadowsWheelLumaC187` |
| `docs/color-sweep-queue.md` | the 19-item queue, groups 0–5, with the day's five live runs recorded as 1b–1f |
| `docs/reviews/astra_*` | the two Astra briefs and answers, the chooser implementation report |
| `tools/commutation.cjs` | the closed form, verified against brute force |
| `scripts/privacy-patterns.cjs` | credential patterns |

## Decisions Made

| decision | why |
|---|---|
| The chooser picks on pixels; `predict()` survives only as a labelled fallback | a statistic cannot predict its own evolution; five runs showed the split is exact |
| Every candidate is rebuilt from the SOURCE in section order | layering a Basic move onto a baked curve buffer models a stack Premiere does not run |
| A form is shipped only when the two-frame overlay traces one curve | that test found three wrong beliefs in one afternoon; "does not transfer" had been a key error |
| Uniform-sign residuals are recorded, not refitted | refitting to one frame breaks the exact one (`_fitMethod` rule 5); the C220 wheel-luma residual is asserted *with its sign* in the test |
| Readings within a few codes of the rail are excluded from any gain fit | `_fitMethod`; red p99 at 98.8 under a gain that says 103.4 |
| The lift/pad/curve keep their POLICY (meeting level, half-colour rule, anchor); pixels choose only the AMOUNT | the policies are the canon's; the chooser is not asked to re-derive them |
| Astra ran with `workspace-write --approve-for-me`, never `--dangerously-bypass` | write access to the repo only; its diff was one reviewable change on top of a committed brief |
| Balanced count is not the metric | it fell while the pass stopped crushing pixels to reach black points |

## Where data lives

- **The test project's absolute path, sequence names and analysis folder are NOT in this repo** (privacy
  scan). They are in the private memory note
  `~/.claude/projects/-Users-dandj-DevApps-claude-for-adobe/memory/project_claude_for_adobe_test_project.md`.
  The sequence is 18 BRAW clips on V1 (~28.7 s); the frames used all day are C202 @23.94s (p1 14.5, p99 84.7,
  unrailed — every sweep today) and C231 @12.515s (source white 61.6).
- Panel log: `~/Library/Logs/claude-for-adobe/panel-<date>.log`. Chat exports: `_claude-for-adobe_analysis/`
  beside the project.
- Calibration: `src/lumetri_sweeps.json`. Sweep tools: `slider_sweep` (Basic sliders), `curve_sweep`
  (curves, `"Shadows luma"`, `"Highlights pad"`/`"Shadows pad"` with `hue`).
- Brain vault: `~/DevApps/Brain/Knowledge/Premiere Internals/` (`Findings/Lumetri Control Forms 2026-09-17.md`,
  `Methods/Measuring a Lumetri Control 2026-09-17.md`) and `~/DevApps/Brain/Projects/Claude for Adobe/`.

## Brain sync — pending the owner's go at handoff time

Both Premiere Internals notes are dated 2026-09-17 and **predate today's forms**. The sync proposed to the
owner (not yet written; do it if he agreed, skip if he struck it):

- `Findings/Lumetri Control Forms 2026-09-17.md` — Shadows/Highlights are bumps not gains; wheel luma is the
  same family and *transfers* (correct its "does not transfer" line: compared at p1, a different level per
  frame); the Highlights pad is a luma-preserving per-channel gain, not a band; toe and lift are one gain
  about 100; commutation closed form. Source blocks: `shadowsHighlightsForm`, `shadowsWheelLumaForm`,
  `highlightsPad`, `commutation` in `src/lumetri_sweeps.json`.
- `Methods/Measuring a Lumetri Control 2026-09-17.md` — the two-frame overlay as the transfer test; a plan
  row's *achieved* column is the plan's, not the knob's; a graded working copy silently disables pixel
  measurement.
- `Projects/Claude for Adobe/Claude for Adobe — Architecture and Operations.md` — the pixel chooser and its
  provenance tags; the sequence-keyed match cache; the Discard-on-reload loss; Codex/GLM CLI flags and quotas.

## Credentials / external setup

- No API keys in the repo. Claude runs under the owner's login. Codex CLI 0.153.4 (`codex exec -m gpt-6-astra`);
  GLM 5.3 via `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic ANTHROPIC_AUTH_TOKEN="$(security
  find-generic-password -s GLM -w)" claude -p … --model glm-5.3`. Both quotas exhausted until 2026-09-19 10:09.
- `gh` as dandjlab-cell. Blackmagic RAW SDK at `/Applications/Blackmagic RAW/` for source reads.

## Quick Start for Next Session

```bash
cd ~/DevApps/claude-for-adobe
git log --oneline -3          # main @ 4070a16, 2 unpushed
node --test test/*.test.cjs   # 412 pass / 1 skip (413 when schemas.adobe.com is reachable)
```

**Read in this order:** `CLAUDE.md` → `docs/findings-index.md` → this file → `docs/color-sweep-queue.md`
(groups 1b–1f are the day's runs) → `src/lumetri_sweeps.json` → `docs/reviews/astra_chooser_report.md`.

**Driving live measurement.** The panel's own Claude appears in `ListAgents` as
`com-claude-for-adobe-premiere-dev-*` (new id after every reload). `SendMessage` it; ask for raw tool output,
never a summary; tell it to flag anything contradicting what you said you expected — it caught the stale-copy
and stale-cache runs both times. Do not reach the MCP port or drive the UI. The owner clicks Reload and deletes
the `[AI]` copy; give him one code fence containing only the paste, nothing else in fences.

**Baseline to beat:** 4/18 balanced on a fresh copy, every chain pixels, worst MODEL OFF BY ±1.2 (133a9bf, 22:20).
The number that matters is `MODEL OFF BY` per pixel-chain row: ≤ 1.2 everywhere, or say which step is table.
