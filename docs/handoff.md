# Claude for Adobe — Session Handoff

**Repo:** https://github.com/dandjlab-cell/claude-for-adobe.git
**Worktree:** ~/DevApps/claude-for-adobe (the privacy scan forbids absolute home paths in this public repo)
**Date:** 2026-09-16 (00:30)
**Branch:** `fix/whisper-metal` (not merged to main, not released; the public zip is still **0.1.77**)
**Last commit:** see `git log -1` — the Luma vs Sat roll-off (code, tests, this file); **not yet run live inside the pass**
**Role:** BUILDER

This file is committed at the end of every session (`handoff: …`); docs-only commits need no go from the user, pushes and releases do.

---

## What this project is

A public, MIT-licensed Adobe Premiere Pro CEP panel ("Claude for Premiere") that runs the user's own Claude Code or Codex inside Premiere. The editor selects clips or a folder, says what they want, and the agent inspects footage, transcribes, cuts silences and repeated takes, reframes, lays b-roll, makes captions, and now **colour-balances a sequence** — all through deterministic panel tools that print CHECK lines and work on a duplicated "[Claude]" copy of the sequence. Users install a zip; the panel self-updates from GitHub Releases.

## What Was Done (2026-09-15, one long session on colour)

- **"Grade this video" is one deterministic tool call, `grade_sequence`.** The panel's AI decides nothing per shot; it calls the tool once and relays the table. Per clip: read the scopes from the clip's own file (no Premiere render), white-balance on both axes, cancel the residual casts at the parade's ends with the Shadows/Highlights wheel pads, set the black point with an anchored Master curve, lift the white point with Whites then Highlights, contrast only if the frame is flat or harsh, then confirm in Premiere and correct up to twice from the real readings, with (2026-09-16) saturation rolled off in the deepest shadows and near-whites on Luma vs Sat in the first batch. Three renders a clip at most.
- **Every knob it moves is calibrated from live sweeps on one sandbox frame** (`src/lumetri_sweeps.json`): Exposure, Contrast, Temperature, Tint, Highlights, Shadows, Whites, Blacks, the three wheels (pads fitted on paired-pixel bands), and the RGB curve end points (analytic levels move, verified live).
- **Reads come from paired pixels.** `src/scopes.cjs` reports casts by luma band: the darkest and brightest 1% and 3% of pixels as pixels (the parade's bottoms and tops), plus level bands. The white balance references the **brightest 1%** (a specular reflects the light; the brightest 3% can be a cream cabinet). A parade end more than 20 off neutral after the white balance is named the scene's own colour and left alone.
- **Ten of eighteen clips on the sandbox pass the strict balance test** on the final run (23:08); every other row prints the limit it hit (a coloured dark surface, a white point that clips before 85, or a residual within a step of the measurement).
- **Outside review used and acted on:** GPT-6 Astra via the Codex CLI reviewed the pipeline at its worst point (`docs/reviews/colour_grade_review_gpt6_astra_2026-09-15.md`); its three defects (a sign-blind pad nudge, a 0.5 pad cap extrapolating a 0.15 fit, a Blacks slope taken on a clipped sample) are fixed.
- **Also fixed on the way:** the playhead now follows the grade and returns once (host `frames(..., keep)` + `playhead()`); the Lumetri property walk stops at the first match (a 291 s run became 50 s); per-clip timing is printed in every row; grade tools always make the working copy first (the 18:03 run had written on the original).
- **Sibling repo `~/DevApps/premiere-map`** closed Rounds 250–252 earlier the same day: Premiere's own scopes have no readable numbers (Export Frame + our computation is the native path); the whole Lumetri grade decodes offline from a `.prproj` (`tools/parse_lumetri_prproj.py`); QE `getParamValue/setParamValue` reads and writes Lumetri's blob parameters as text (wheels, curves, HSL key) — dot decimals to write, commas on read.

## Current State

**Works end to end on the user's Mac** (Apple Silicon, Premiere 26.3.2, dev panel symlinked to this repo): `grade this video` on the 18-clip BRAW sandbox sequence, plus everything from earlier sessions (rough_cut → transcript → audio_cut, Cut silences, reframe, captions, morph_cut, multicam_switch, scopes).

**Suite:** `node --test test/*.test.cjs` → **298 tests, 297 pass, 1 skip** (`whisper.test.cjs` fetches `schemas.adobe.com`; the skip is counted, not a failure). The privacy scan is in the suite and in the pre-push hook.

**Not released.** Everything since `542edd9` is dev-only; 0.1.78 is gated on the 9:16 re-run (archive, What's Next 3) and an explicit go from the user.

**Colour pipeline, exactly (panel.js `gradeSequenceTool`, rules in `src/grade_rules.cjs`):**
1. `ensureWorkingCopy()` — the copy first, then the clips are read from it. One `readSnapshot()` per run.
2. Per clip: read wheels, Temperature, Tint, curves; a clip already carrying a balance is read from Premiere's render, otherwise from the source file (`src/source_frame.cjs`: BRAW via `bin/braw_to_rgba` + the Blackmagic SDK at `/Applications/Blackmagic RAW/…`, other codecs via ffmpeg; parity with Premiere's render verified on BRAW). Vision subject mask by default (`bin/ocr --subject`).
3. `temperatureFor` → Temperature on the whites' blue-red, then Tint on their green-magenta, each solved by the model (`src/grade_model.cjs`), no fixed cap, held back while a predicted channel bottom would reach the floor or a top the ceiling.
4. `padsFor` → Shadows/Highlights pads from a 2x2 model fitted on the band statistic (`wheelBands` sweep), pad ≤ 0.3; a bottom band > 20 off neutral gets no pad (scene colour).
5. `levelsFor` → Master curve bottom point x = A(p1−4)/(A−4) pinned at the frame's median and at 0.8; capped at 0.25 and at the lowest channel bottom; skipped on a coloured bottom.
6. `goalsFor` → Whites → Highlights (`onlyIf` still low) → Contrast (only < 55 or > 93 spread) → Blacks (lift crushed only) → Exposure (face skin luma only). `planShot` writes them, confirms once, backs a clipping knob off to half.
7. Correction passes (up to two): pads rescaled by direction-aware least squares, white balance rescaled per axis from its own move (only if the last write moved it), Tint introduced for a green residual, the curve re-solved from the black point actually read (unless the first move achieved < 25% of its prediction), all with ceiling checks relative to the current tops. A backoff counts as the first pass.
8. Verdict (`ACCEPT`: black ≤ 6, white 85–95, both cast axes within 1.5, spread 55–93, no new clipping/crushing); the footer states the same thresholds.

**What a grade row looks like** (one line per clip in the tool's result; names shortened here):

```
clip.braw @1.645s [subject] black 10.6 / white 87.8 / blacks 1.2 / whites 2.4 / spread 77.2 → white balance: temperature 4.8 (…why…) → curve black 0.06 (black point 10.6 → 4: curve bottom point at 0.06, pinned at 0.36) → whites 69.6 (whitePoint 75.7→92.5) → corrected: curve black 0.12 → 0.18 (black point read 11.4) → black 3.5 / white 92.5 / blacks -0.4 / whites 0.4 ✓ [3.3s: read 1.7, renders 1.6, 14 host calls, rest 0.1]
```

Read it left to right: the read (`black`/`white` = luma p1/p99 of the frame; `blacks`/`whites` = blue-minus-red at the parade's bottom/top, > 0 blue, < 0 warm), the moves in order, `corrected:` / `corrected again:` for the passes, the confirmed numbers, then `✓` or the residuals in the canon's words (`black point 8.2 lifted`, `whites green by 1.6`) and any `NEEDS:` note, and last the timing: total seconds, source read, Premiere renders, bridge calls, the rest.

## What's in progress or blocked

- **Nothing is blocked.** The colour pass is at its plateau on this footage; the remaining misses are named in each row.
- **Speed question CLOSED (2026-09-15, 23:58 run, after a Premiere restart): it was session state, not the effect stack.** 18 clips, 53 renders, 69.2 s total; per render **~0.7–0.85 s** on every row that can be divided out (C222 1 render 0.80 s; C233/C228/C223/C231 2 renders 0.70–0.85 s each; C198 4 renders 0.80 s each), and the source read back at 1.3–1.6 s from the 3 s it had reached. The heavier stack (curves + wheels + sliders) costs nothing measurable. Restart Premiere when a long grading session's renders creep past ~1.5 s.
- **Five clips on the ORIGINAL sequence still carry a Lumetri grade** — the same five as the 18:03 accident (C198, C209 ×2, C187, C202: every one printed "(read from Premiere: the clip already carries a balance)" with `read 0.0`). The strip did not stick. The 23:58 run scored **7/18 balanced against the 23:08 run's 10/18** with identical code, and three of the five contaminated clips are the near-misses (C202 blacks +2.4, C198 −2, C209 +5.9/+6.3). Strip Lumetri from those five on the original and re-run before reading any 7-vs-10 as a code regression.
- **The panel's own model refuses a `PCX.*` script** (correctly — the system prompt forbids reaching into the panel's internals through `run_extendscript`), and when asked, it confabulated an answer about the Hue Saturation curves ("all five read back as empty strings … decoded offline as 520-byte records") that contradicts premiere-map Round 252's live `Hue vs Sat` → `0:`. Probes pasted into the panel must use documented `app.*` / `qe.*` only, and the model's prose about internals is not evidence.
- **Luma vs Sat SOLVED and built (2026-09-16 00:10–00:30), not yet run inside the pass.** Seven live writes on clip 1 of the `[Claude]` copy (`_claude-for-adobe_analysis/chat-2026-09-15-22-15-24.md` and the next export): the QE text door writes all five Hue Saturation curves as `N:x,y,…,` with x the position 0–1 and **y a signed saturation offset, 0 neutral** (flat ±0.5 moved the saturation median 28 → 45 / 12); `0:` is the empty curve and restored the baseline every time; Premiere draws a **cubic spline** through the points — ends at −0.5 with zeros at 0.15/0.85 rendered as a flat +0.5 (natural spline peak +0.51), seven pinned points held the median at 28 while the ends desaturated. Built: `parseSingle`/`formatSingle`/`spline`/`satRolloff` in `src/curves.cjs`, `satCurveFor` in `src/grade_rules.cjs` (skips a coloured end, keeps a curve the clip carries), `satWriter` in `gradeSequenceTool` (a Luma vs Sat present counts as "graded"). **First live run (00:27) wrote it LAST, after the corrections, with its own confirm: every row carried `sat roll-off:`, but the blacks cast on the final read moved 1–3 points that nothing then corrected (C229 5.1→7.8, C202 2.4→4.7, C200 0.4→2.7 and C228 −0.8→−1.6 lost their ticks, C198 −2→−0.8 gained one): 6/18.** Moved into the first batch with the temperature, pads and curve (no extra render, three a clip again) so the corrections rescale from a reading that already carries it. Suite 298: 297 pass, 1 skip. **Next editor step: one `grade this video` run on the reordered pass; done when the balanced count is back at 7/18 or better on the same (still contaminated) footage and no row's final blacks cast is worse than the 23:58 run's.**

## What's Next (in order)

**Who does what:** anything that touches Premiere's GUI (restart, reload the panel, Discard copy, typing in the panel) is the editor's; the agent cannot drive Premiere (computer-use access was declined on 2026-09-08). Agent-doable without the editor: What's Next 2's code side (a read-only QE probe script the editor pastes), item 5's per-channel curve maths and its tests, and any docs. Everything else needs the editor's click and a pasted result.

1. ~~Timing run~~ **done 2026-09-15 23:58 — ~0.8 s a render, session state** (see the bullet above). Its successor: **strip the stale Lumetri off the five contaminated clips on the original and re-run once**, to confirm 10/18 still stands on clean footage. Done when: no row prints "the clip already carries a balance" and the balanced count is back at 10/18 or the difference is explained by something other than the stale grade.
2. ~~Luma vs Sat probe~~ **done and built 2026-09-16** (see the bullet above). Its successor: **run `grade this video` once with the roll-off in the pass** (same run as item 1's strip re-run is fine). Done when: touched rows carry `sat roll-off:`, no row's blacks/whites cast got worse than the line before it, and the median saturation on a spot-check `scopes` matches the pre-roll-off value. Probes pasted into the panel must be documented `app.*`/`qe.*` only — the panel's model refuses `PCX.*` — and the guard must be checked first (`inspectExtendScript`; a `for (…; i++)` with a `[i]` later on the line trips the mutation pattern). If yes, add the colourists' cleanup after the balance: roll saturation off in the deepest shadows and near-whites (Frame.io, the Resolve manual, a Premiere user's default preset). Never on a coloured surface — it drains it. Done when: a read-only QE probe (`getParamValue` on the Hue Saturation curve names) has confirmed or denied a text form, and if confirmed, one live write + scopes read shows the ends desaturating while the median saturation holds.
3. **Adjustment layers and LUTs** (the user's queued order: after clean footage grades well — it does): detect an adjustment layer above the clip, a Lumetri on it, an Input LUT / Look inside the clip's Lumetri, any other colour effect; when present read from Premiere's render, make the confirm mandatory, list them in the row, and say which layer's grade should be balanced. Pieces exist: components are enumerated per clip; the `visible_at` ledger knows what sits above. Done when: a sandbox run with an adjustment layer above V1 names the layer in every affected row, reads those clips from Premiere, and the tests cover the detection.
4. **Targeted balance / skin** (user, 21:58): HSL Secondary as the door (key blob via QE text; its own Temperature/Tint/Contrast/Saturation are scalars 101–105), measure inside the Vision mask, solve inside the key with the calibrated knobs, confirm inside the mask. Needs a face shot in the sandbox and one sweep of the HSL Secondary sliders inside a key. Lumetri's shape masks (pen/ellipse) are unprobed — a read-only probe of whether the mask path is scriptable comes first. Canon numbers: skin hue on the I-line ~123° (116–126), luma 40–70, saturation 20–50%. Done when: on a face shot, one call puts the face's hue within 116–126° and luma within 40–70 as measured inside the face box, with the rest of the frame's numbers unchanged.
5. **Pad overshoot on a bottom warm by 12–17** (C220, C229 end blue by 3–5): a smaller nudge cap than 0.5, or per-channel RGB curve end points as the exact parade-end tool (Wild Flour: "bring the blacks of the red curve down"; same levels maths per channel, no new sweep needed). Done when: those two rows end within 1.5 on the blacks axis without a new residual elsewhere.
6. **Midtones pad for skin** (needs a face shot + a band-statistic midtones sweep; `castMatrix('midtones')` is NaN today), then saturation calibration. Done when: the midtones 2x2 reproduces its sweep rows within ~1 point like the other two wheels, and Saturation has a seven-value sweep in `src/lumetri_sweeps.json`.
7. Older, unchanged: the 9:16 re-run, release 0.1.78 (gated), the keystroke doorbell decision — all in the archive below.

## Key Files Changed (this session)

| Path | What |
|---|---|
| `panel.js` | `gradeSequenceTool` (the whole pass, correction passes, timing, playhead), `grade`/`grade_shot` make the working copy, `curveWriter`, `wheelWriter`, `lumetriWriter`, `measureSourceAt(…, snapshot)`, `host()` logs slow bridge calls |
| `host/premiere.jsx` | `frames(json, base, solo, keep)`, `playhead(value)`, `lumetriParam` stops at the first property match, `lumetriQE` (QE text door by name) |
| `src/grade_rules.cjs` | The canon as rules: `temperatureFor` (both axes, `balanceAxis`), `padsFor`, `levelsFor`, `goalsFor`, `verdict`, `ACCEPT`, `COLOURED`, `FLOOR_MIN` |
| `src/grade.cjs` | `STATISTICS` (tonal ends on the frame; whites on the brightest 1%), `PARAMS` (eight tested), `planShot` (`onlyIf`, `solve`, `baseline`, half backoff), `damage`/`allowance` (channel floor counts as crushed) |
| `src/grade_model.cjs` | `predict`/`solveKnob` from the sweeps; `coupleBands` moves the band casts by the channel-end deltas |
| `src/wheels.cjs` | pad model on `wheelBands`, `castAt` (bands, 1% whites), `nudgePad` (direction-aware), `predictPads`, `MAX_SAT` 0.3 |
| `src/curves.cjs` | RGB Curves text parse/format, `levels` (anchored), `blackInFor`, `predictLevels` |
| `src/scopes.cjs` | casts by luma band from paired pixels (rank 1%/3% + level bands), channel-at-0 shares |
| `src/lumetri_sweeps.json` | every live sweep: exposure, temperature, contrast, blacks, whites, shadows, highlights, tint, wheels (luma rows), wheelBands (pads) |
| `.claude/skills/colour/SKILL.md` | the canon with sources, the tool table, "grade this video" = one call |
| `docs/reviews/colour_grade_review_gpt6_astra_2026-09-15.md` | the outside review |
| tests | `grade`, `grade_rules`, `wheels`, `curves`, `scopes_bands`, `source_frame` |

## Decisions Made

| Decision | Why |
|---|---|
| Deterministic code grades; the model only relays | "Does it need to be a model or can it be code?" — code; repeatable, no guessing per shot |
| Rules from the colourist canon only, never from the user's own grades | User: "I'm not a colorist"; sources in the colour skill |
| Read the footage from its source file; confirm with Premiere's render | No render for the read (parity verified on BRAW); the confirm is the only way to see what Lumetri did — Premiere's scopes have no readable numbers (premiere-map Round 250) |
| Parade ends read as pixels (darkest/brightest 1–3%), not independent channel percentiles | Once a knob puts a channel on the floor the percentiles are different pixels; a 5–30 level band read scene colour as a cast |
| White balance on the brightest 1% | A specular reflects the illuminant (the canon's reference); the brightest 3% was cream cabinets on C187 |
| Black point with the Master curve's bottom point, anchored at the median and 0.8 | Blacks is a toe control, Shadows a dark-areas control — neither lands a black point; a two-point line is a global stretch; the 0.8 pin went in only after a confirm showed the spline bowing |
| No fixed caps on Whites/Highlights/Temperature/Tint | They were the author's, from one frame, and left white points at 80–85 with nothing clipping; the predicted ceiling/floor and the clip guard decide |
| A bottom band > 20 off neutral after the white balance is left alone | Every band of C187 read warm by 25–32 with only the speculars neutral: the scene's colour, not the light; neutralising drains the objects |
| Balance (temperature, pads) before the tonal sliders | The pad model reads the bottoms; a black point at 4 puts a warm bottom's blue channel on the floor where nothing reads linearly |
| Up to two correction passes, three renders a clip | User: perfect over instant; each pass scales from what the previous one actually wrote |
| Nothing unmeasured goes in | Every change this session traces to a row in a live run, a sweep, or a screenshot from the user |

## Known Issues / Watch-outs

- **The Lumetri panel's wheel widget does not redraw after a QE write** (the curve widget does); the effect and the render carry the value. Read back through QE or the scopes, not the wheel picture.
- **Lumetri has two properties named "Tint"** (Basic Correction at index 15, HSL Secondary at 102). `lumetriParam` takes the first; scripts that walk properties by name must too.
- **Lumetri applies curves before the wheels.** A curve that crushes pixels to 0 followed by a Shadows pad paints the crushed pixels with the pad's colour (a flat blue floor in the parade). The pass avoids this (no curve or pad on a coloured bottom; curve capped at the lowest channel bottom).
- **Source decode and Premiere's render agree on the parade and the median but not on the 1% tail**, which the curve is solved from; hence the curve re-solve from the confirmed black point.
- **The green axis residuals of 1.6–2.0 are within a step of an 8-bit render** (~0.4 per code); the line is 1.5 and was not moved.
- **A working copy is made for every grade run**; the user discards it each time. Do not write on the original (the 18:03 run did, and five clips carried a stale Blacks −40 / Temperature −25 until stripped).
- **Private data:** the sandbox is on an external drive; its path and clip names must never enter this public repo. `test/privacy.test.cjs` scans every tracked file for home paths, `/Volumes/` paths, emails and every term listed in `~/.claude-for-adobe-private-words` (a plain text file, one word per line, kept outside the repo on purpose — add a client or project name there and the scan and the `.githooks/pre-push` hook refuse any commit or push that contains it). Never bundle the Blackmagic RAW SDK (EULA-gated); `bin/braw_to_rgba` is built locally and absent from the zip.
- **Never push or release without an explicit go in the session** (two broken releases shipped from a chain that skipped the check).
- Older issues (transitions invisible, caption band position, Whisper timing, Homebrew ggml byte-patch) are in the archive's Known Issues.

## Where data lives

- Panel log: `~/Library/Logs/claude-for-adobe/panel-<date>.log` (host events, tool results truncated to one line, per-clip grade timing, slow bridge calls). Chat exports and bug reports go to `_claude-for-adobe_analysis/` beside the project.
- Calibration: `src/lumetri_sweeps.json` (in the repo). Sweep prompts are in the chat log of 2026-09-15 and reproducible: "On clip 1 at 0.5s … set <Slider> to -100, -50, -20, 0, 20, 50, 100, measuring scopes (whole frame) after each, then back to 0."
- The premiere-map side: `~/DevApps/premiere-map/reports/round250..252/`, `tools/parse_lumetri_prproj.py`; vault notes under `~/DevApps/Brain/Knowledge/Premiere Internals/`.
- Private memory notes: `~/.claude/projects/-Users-dandj-DevApps-claude-for-adobe/memory/` (packaging, the test project's path, release-chain guard). Read by absolute path from any cwd.

## Credentials / external setup

- No API keys. Claude runs under the user's own Claude Code login; Codex under the user's Codex login (`codex` CLI 0.153.4 installed; `codex exec -m gpt-6-astra -s read-only` was used for the review).
- `gh` authenticated as dandjlab-cell for releases. Blackmagic RAW SDK installed at `/Applications/Blackmagic RAW/` for BRAW source reads (optional; the pass falls back to a Premiere render).

## Quick Start for Next Session

```bash
cd ~/DevApps/claude-for-adobe
git status --short && git log --oneline -3      # clean after the handoff commit; latest on fix/whisper-metal
node --test test/*.test.cjs                      # 294: 293 pass, 1 whisper skip
sh scripts/install.sh                            # (only if the dev panel is missing) symlinks this repo into
                                                 # ~/Library/Application Support/Adobe/CEP/extensions/ and installs the pre-push privacy hook;
                                                 # because it is a symlink, src/ and the skills are always current - reload the panel after edits,
                                                 # restart Premiere only when host/premiere.jsx changed
# Premiere: restart it (host/premiere.jsx changed today: frames keep, playhead), open the dev panel
# (Window > Extensions > the dev "Claude for Premiere"); footer must read "dev <sha> (fix/whisper-metal)".
# Discard the previous working copy: the panel shows a bar above the chat listing "<name> [Claude]" copies
# with "Open original" / "Discard copy" buttons - click Discard copy (it asks to confirm). Then type in the panel:
#   grade this video
# Read the timing column in each row; then start What's Next 2 (Luma vs Sat probe).
```

---

# Archive — earlier workstreams on this branch (unchanged today; canonical for their own topics)

The sections below predate the colour work. Their test counts and "last commit" lines are stale; the header above is canonical on anything numeric.

## Colour / scopes + lost-Claude fixes (2026-09-14, commits 2cd371b + dab2098)

The editor asked the panel to "see the scopes" to colour footage, and it got lost (loaded a skill, sent a subagent to read the panel's own source, tried a disk walk). Root cause was no capability map and no colour tool, not a prompt failure. What landed, each Codex-approved (trail in `docs/codex-review-log.md`):
- **`scopes` tool**: Lumetri-style scopes as NUMBERS for up to 3 timeline positions, from Premiere's own full-res Export Frame (grade included), read as SDR Rec.709 — luma percentiles 0-100, RGB parade means/ranges, clipped/crushed shares, vectorscope saturation and whole-frame cast, plus one scope picture drawn through an explicit Rec.709 conversion so it agrees with the numbers. `src/scopes.cjs`. VERIFIED live against Lumetri Scopes on colour bars in a sandbox: luma waveform, vectorscope and parade values all match.
- **Capability map in the prompt/tools**: preview_frames says it is Premiere's own full-res render; the scripting skill names the tools that export; the prompt's error rule leads with "your tools are your whole capability list ... never read the panel's code or send a subagent to learn what a tool does".
- **Script guard split**: CAPABILITY refusals latch the turn; FORM refusals return how to rewrite and allow a retry.
- **`run_extendscript` never deletes its working copy**; **abandoned tool calls cancel** (the MCP server aborts a call whose request closes).

**Native scopes readback — settled 2026-09-15 (premiere-map Round 250):** Premiere's scopes are GPU-resident intermediates drawn straight to the panel; no reader for scope values surfaced in any searchable layer. Export Frame + our own computation IS the native path. The native door that IS open: Lumetri parameters via the DOM (`property.setValue`) and, for the blob parameters, QE `setParamValue` by name (Round 252).

**Exposure calibration (2026-09-15) cancelled the offline Lumetri simulator:** Premiere's Exposure is asymmetric (a clean gamma-2.4 gain downwards, a highlight-protecting tone map upwards); no static curve reproduces both. Measure-and-interpolate from live sweeps replaced it (`src/grade_solve.cjs`, `src/grade_model.cjs`).

**Queued adjustment-layer/LUT detection** — now What's Next 3 above.

## Cut silences button native rebuild (2026-09-10)

- Button now detects once and builds a separate native sequence in batches of up to eight linked V1/A1 pairs (default later raised to 24 with verified fallback to 16 then 8). Existing chat/editorial extraction paths are unchanged. Host reads back source and destination ranges, links, static intrinsic effects and original geometry; no QE extraction in this button path.
- Supported: contiguous, source-aligned normal-speed V1/A1, at most 300 source pairs (600 snapshot rows). Other populated tracks, transitions, nests/multicam, sequence markers and animated/nonintrinsic effects are refused. CEP cannot enumerate caption tracks: an explicit per-run no-captions acknowledgement is required.
- Source project-item marks restore before yielding, with exact verification and retained recovery state on failure. Stop leaves a named INCOMPLETE copy and reopens the original after successful mark recovery.
- Actual source/original/new sequence ranges are saved in `.silence-rebuild.json` beside the project.
- Live: 144.31 s rebuilt into 76.99 s, 36 linked pairs; larger trials at 8/16/24 batch sizes completed 360 pairs (135–192 s host work), mapping rows identical; 32 was too unresponsive and was stopped. Default 24 with fallback; ETA shown from the last three batches.

## Scoped analysis lookup (2026-09-10)

- `list_analysis` uses direct selected Project clips, otherwise individually selected bins, otherwise the fresh active timeline; full inventory requires explicit `all:true`. Matching legacy filenames are candidates, not proof of cache identity.

## Speaker-check crash and duration workflow (2026-09-10)

- Host `frames` prepends a SOLO status row; `speakerCheck` had treated it as a frame (`Cannot read properties of undefined (reading 'toFixed')`). Filter the exact SOLO+column header before mapping frames.
- Duration-limited requests: choose the short story from the audio_cut report's resolved kept ranges and plan/apply only that subset via `keep_only`. Dry-run output labels extracted intervals REMOVE.

## Intact dialogue and optional speaker annotations (2026-09-10)

- `src/transcript_presentation.cjs`: whole punctuation-delimited dialogue first, optional speaker runs and measured pause/pitch/level observations, then unchanged global index:word mappings. Prosody from a fresh Premiere mono PCM16/16 kHz render; derived cache bound to word hash, timeline fingerprint, WAV SHA-256, schema/version and silence settings. Optional exact-word diarization sidecars reject identity/alignment errors as a whole.

## Sequence folder placement and selected-clips startup (2026-09-09)

- Sequences created from selected clips land in the source items' common folder, preferring the nearest unambiguous Sequences/Timelines/Cuts/Edits bin; never project root. Direct selected clips take precedence over selected bins; empty selection cannot widen creation.
- Live: nine selected clips classified in 9 s; the two-stage macro created two 1080x1920 sequences of 1223.18 s and an Editorial transcript of 2087 words in 45.6 s; the waveform-ready second run removed 338.34 s in 131 extracts with all nine sources retained.

## Two-stage rough cut (2026-09-09)

- Technical Cleanup (measured silence, −35 dBFS, min 1 s, 0.18 s padding, source-waveform vetoes, all takes preserved), then a native Editorial copy for take and story decisions; only silence overlapping an audio clip is eligible; guarded cleanup checks expected snapshots in the panel and inside native Extract. Plan: `docs/superpowers/plans/2026-09-09-two-stage-rough-cut.md`.

## Local metadata feasibility benchmark (2026-09-09)

- M4 Max: MLX Whisper large-v3-turbo + Pyannote 3.1 on MPS + NumPy prosody on 387.9 s: 37.7–45.6 s a pass; the MLX transcript had 608 words against the panel's 752 (repeated/incomplete attempts lost — do not replace the panel's Whisper path for speed). Local metadata is practical on this Mac; it is not a fully offline editing agent.

## Measured pause layer and foundations (2026-09-08)

- `src/silence_map.cjs` measures quiet PCM16 runs (default −35 dB / 0.25 s) from the freshly rendered timeline; `audio_cut` snaps edit boundaries to measured silence (0.2 s tolerance / 4 s max) and writes `.silence.json` beside the project. 153 pauses matched FFmpeg `silencedetect` within 0.0000005 s.
- Whisper attaches pauses to neighbouring words: keep raw words, resolve boundaries with measured silence. Applied foundation test: 387.89 s → 61.02 s, CHECK PASS; one remaining repeat deferred by the user to story work.
- Mac acceleration: ggml Metal plugin bundled; Whisper on Metal with one CPU thread: 387.9 s of audio transcribed in 35.2 s (752 words); the CPU fallback is 100x slower. `node scripts/check-whisper-metal.cjs <wav>` reproduces.
- The 9:16 loop ran end to end once on 2026-09-07; its doubles were three `findRestarts` bugs (fixed, tested offline, not yet re-run live); `place_broll` by clip name fixed; system prompt cut to 696 words (cap 700 in `test/codex-session.test.cjs`).

## The cut pipeline (0db65d6, 5bb9087)

1. `rough_cut({bin, aspect|preset|width/height, language})`: creates `<folder> <shape>` in the bin's PARENT folder, fills each clip to the frame and centres the face (Vision faces via `bin/ocr --faces`), renders the mix, transcript = Premiere's own per-clip transcript first, else Whisper; hands back `transcript_index` and STOPS.
2. The model authors thoughts as word-index ranges and calls `audio_cut({thoughts})` for the report, then `audio_cut({thoughts, apply: true})`.
3. `src/thoughts_authored.cjs` picks each take by fluency, cuts failed restarts inside a thought (`findRestarts`), merges kept pieces under the editors' rules, one `keep_only`.
4. B-roll, tracking (`reframe` / Auto Reframe), frame checks and captions come after, on the survivors only. Order of operations in `.claude/skills/edit-footage/SKILL.md`.

## Older Key Files

| Path | What |
|---|---|
| `src/claude-session.cjs` | Spawns Claude CLI (stream-json), system prompt (all rules live here), model fallback, MCP config |
| `src/core.cjs` | ExtendScript guard: rejection/mutation/nonUndoable patterns, `isReadOnlyScript`, wrapper |
| `src/mcp-http.cjs` | Local MCP server with bearer token |
| `src/update.cjs` | Updater (GitHub Releases, checksum, safe install) |
| `src/whisper.cjs`, `src/vad.cjs`, `src/transcript*.cjs`, `src/captions.cjs`, `src/classify.cjs`, `src/silence.cjs`, `src/pek.cjs` | Engines |
| `scripts/package.sh`, `scripts/install.sh`, `Install.command` | Release build (refuses version mismatch), dev install, user installer |
| `docs/codex-review-log.md` | Review trail |
| `~/DevApps/Brain/Projects/Claude for Adobe/Claude for Adobe — Architecture and Operations.md` | Vault architecture note (2026-09-05; numbers stale) |

## Older What's Next (unchanged)

1. **Re-run the 9:16 loop** (needs the editor): drive mounted, dev panel, select the TALKING HEAD and BROLL bins, say "make this a 9x16 video". MUST: the audio_cut report lists the three restarts under Dropped. SHOULD: the two "room to go / room to grow" thoughts are linked by `retake_of`. Replay a span through `findRestarts` with the run's real word timings before changing any rule:
   ```bash
   cd ~/DevApps/claude-for-adobe && node -e 'const {findRestarts}=require("./src/thoughts_authored.cjs");const w=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).words;const [a,b]=[Number(process.argv[2]),Number(process.argv[3])];console.log(findRestarts(w.filter(x=>x.start>=a&&x.end<=b)))' "<analysis>/<sequence>.timeline.json" 160 175
   ```
2. B-roll, tracking, captions on the survivors (`place_broll` by clip name; `reframe` once; `seam_frames`/`layer_frames`; captions last).
3. **Release 0.1.78, gated on the re-run passing and an explicit go.** Bump `CSXS/manifest.xml` AND `package.json`, review host changes under the AGENTS.md rule, `sh scripts/package.sh && gh release create vX.Y.Z dist/ClaudeForAdobe-X.Y.Z.zip dist/ClaudeForAdobe.zip --title "…" --notes "…"`.
4. Keystroke doorbell decision (Accessibility permission; the only way to reach command ids such as Speech to Text) — no yes from the user yet.
5. Default Media Scaling preference — unknown; needed to know what scale 100% means on other machines.
6. Parked: `sound_events` on a cut with a real laugh; `similar_shots` over the Media Intelligence embedding cache; masks in the cover model; caption band routes; After Effects panel; ZXP signing.

## Older Known Issues

- The model, on a tool error, once improvised ExtendScript; the prompt rule against it shipped in `336637d` and is unvalidated in Premiere.
- Whisper on 6+ minutes of raw audio takes minutes; Premiere's own transcript (Text panel > Transcribe, then Cmd+S) is instant and is picked up first.
- Premiere keeps a closed panel alive; reload the panel after edits, restart Premiere for host script changes.
- `overwriteClip`, `Track.setLocked`, `TrackItem.end`/`inPoint` assignments and `exportAsMediaDirect` are verified only in Premiere 26.3.2.
- Transitions are invisible to the panel; caption position is a Premiere track setting the panel cannot move.
- The user's Mac has a Homebrew ggml; the byte-patched `bin/libggml.0.dylib` keeps the bundled backends in use. Re-apply the patch when upgrading whisper.cpp.
- All 1,231 Premiere command ids are NOT callable from a panel: keystroke or menu only (so the panel cannot make Premiere transcribe).

## Test project (the user's real sandbox)

- Pre-flight: the external drive holding the project is mounted, and the panel footer starts with `dev <sha> (<branch>)` — a `v0.1.77` footer is the released panel without any of this branch. The project path, sequence names and analysis folder live in the private memory note `project_claude_for_adobe_test_project.md`; never in this repo.
- The colour sandbox is an 18-clip BRAW 1920x1080 sequence (product/hands footage, one face shot, warm-toned room); its working copies are `<name> [Claude]`, `[Claude] v2`, …
