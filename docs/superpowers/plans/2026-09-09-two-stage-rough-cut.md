# Two-stage rough cut implementation plan

> **For agentic workers:** Use executing-plans to implement the tasks sequentially; run an independent safety review before live application.

**Goal:** A 9:16 request creates a silence-only Cleanup sequence and a separate Editorial copy. Spoken takes remain in Cleanup; editorial selection only edits Editorial.

**Architecture:** Extend the existing `roughCut` macro, reusing the measured PCM silence layer, `planCuts`, `applyCuts`, and native `cloneActive`. No new model, dependency, generic workflow engine or tool is needed. Render/transcribe the exact Editorial timeline after Cleanup; never transfer a transcript across sequence identities.

**Tech Stack:** CEP Node, ES3 Premiere host, existing Node tests.

**Spec:** User-approved conversation design: technical cleanup and initial framing first; editorial decisions, b-roll, final tracking and captions on a duplicate.

## Constraints

- Default cleanup: measured PCM at -35 dB, gaps >=1 s, .18 s speech padding; expose threshold/min-gap/padding as `rough_cut` parameters. Validate finite ranges before creating a sequence.
- Never classify thoughts or drop takes in Cleanup. Preserve short detected sounds; no transient absorption. Do not cut clips with no detected sound anywhere; stop on unreadable/mismatched render, failed Extract, cancellation, or clone mismatch.
- Use fresh mono16kPCM; verify snapshot identity and render duration. Also read each source clip's Premiere peak waveform (maximum across channels, no short-transient filter): every detected source sound vetoes a mixed-silence cut, guarding downmix cancellation. Missing/unreadable/all-quiet source evidence protects that entire clip, including overlaps. Save original cleanup render and diagnostic cuts beside the project before applying.
- Initial fill/face positions are static. Movement tracking stays after editorial selection.
- Each named sequence must be distinct. Native clone helper resolves name collisions with a numbered suffix. Keep existing project and source footage untouched.
- Compare Cleanup and clone clip geometry (every clip's track, media, trims, duration, dimensions; ignore new IDs). This does not independently certify effects, mute/gain, empty tracks or markers; duplication uses Premiere's native clone. Immediately refresh project state and assert its sequence ID before writing Editorial sidecars. Register the clone as editable; keep original/copy UI provenance and remove Cleanup from the panel-owned bypass. On clone failure/mismatch reopen Cleanup and report the created clone ID if known; delete nothing.
- Check cancellation after render/clone host calls and before transcription. A synchronous host call may finish after Stop, but no next processing stage runs.
- `rough_cut` returns both names/IDs and the Editorial indexed transcript. `audio_cut` is explicitly editorial. No Whisper setting changes, diarization integration, b-roll test, version bump, release, or deployment in this change.

## Task 1: Safety primitives and tests

- [x] Add failing behavior tests for a cleanup plan preserving a short sound between long pauses, protecting all-quiet source clips, rejecting invalid settings, and clone comparison rejecting changed source trims despite identical duration.
- [x] Add small `src/cleanup.cjs` functions `planCleanup(silences, snapshot, {minSilence, pad, sourceEvidence})` and `sameContents(a,b)`. `sourceEvidence` is an array of `{id, sound:[{start,end}]}` rows keyed by audio clip ID; missing/empty evidence protects the whole clip, nonempty sound ranges veto cuts. Reuse `silence.cjs` planning and complement helpers. Return cuts and protected clip labels for the report.
- [x] Add VM-based native clone/create tests: existing requested name yields a distinct name, active clone ID differs, original remains untouched. Use shared `uniqueSequenceName` in BOTH `cloneActive` and `createSequenceFromBin` before creating anything.
- [x] Run focused tests; inspect actual outputs.

## Task 2: Existing macro integration

- [x] Update `roughCut` to name the new assembly Cleanup, fill/face, render `.cleanup.mix.wav`, validate/measure/store `.cleanup.json`, then apply the silence-only ranges. Stop on error/cancel before clone/transcription.
- [x] Clone completed Cleanup via direct `host("cloneActive",...)` (never guarded `run_extendscript`), verify content equality and distinct IDs. Record provenance in `workingCopies`, add Editorial to `ownSequences`, remove Cleanup from `ownSequences`. This avoids automatic copy-of-copy behavior.
- [x] Render and transcribe Editorial using existing macro code and return its indexed transcript. Existing audio-cut apply edits this owned copy directly.
- [x] Add isolated macro behavior tests for stage order, stop-before-editorial on cleanup failure/cancel, one clone, and exact Editorial transcript identity. Mock only unavailable host/CEP operations; exercise the production macro body.
- [x] Update tool schema/description, edit-footage instructions and README to match the two-stage contract. Remove conflicting single-pass instructions for this path.

## Task 3: Review and live verification

- [x] Full `node --test test/*.test.cjs`, `node --check panel.js`, diff/privacy checks. Independent review of native host change and cut safety before loading in Premiere.
- [x] Reload dev panel in authorized sandbox and run a fresh two-stage 9:16 request. Verify Cleanup contains both original sources and only measured silence removed; verify distinct Editorial copy with matching content before apply.
- [ ] Apply an authored editorial report on Editorial, read back both sequence durations/contents to prove Cleanup unchanged. Check paired audio/video and vertical dimensions. Leave both sequences reviewable.
- [ ] Record evidence and limitations in handoff. Ship source only after review/checks; no release without user instruction.

## Review log

Round 1 (Terra): revised to add per-source waveform veto/protection (mixed audio alone cannot establish source silence), refresh/assert project sequence identity after clone, narrow clone comparison to exposed geometry, recover active Cleanup after clone failure, and add post-call cancellation checks. Host modifications will receive independent diff review before live use.

Round 2 (Terra): approved direction conditional on explicit source-evidence function input and collision handling for Cleanup creation too. Both corrections are now specified above; implement and test both.

Implementation review: three cold-read Codex/Opus rounds. Fixed video-only span deletion and stale-plan target race with failing regressions first, plus working-copy suffix recognition and render-end clamping. Round 3 both APPROVED; 168 tests / 167 pass / 1 online schema skip. Live comparison remains pending: desktop access returned with a different project open; awaiting the authorized test project. Changes are on the development branch and unreleased. See `docs/codex-review-log.md` for limitations.

Evening live result: nine directly selected clips required an additional source-routing fix (171 tests / 170 pass / 1 skip; independent host review approved). Waveform-ready Cleanup removed 338.34 seconds with 131 extracts; Editorial clone matched geometry. A bounded Editorial-only keep_only test removed one quiet source clip; fresh Cleanup fingerprint was exactly unchanged. This verifies stage isolation. The authored audio_cut report / source-specific MUST/SHOULD acceptance remains pending and is not replaced by that bounded test. Evidence and readiness limitation are in the handoff.
