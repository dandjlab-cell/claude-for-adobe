# Claude for Adobe — Session Handoff

**Repo:** https://github.com/dandjlab-cell/claude-for-adobe.git
**Worktree:** ~/DevApps/claude-for-adobe
**Date:** 2026-09-07 (night)
**Branch:** `main`
**Last commit:** `336637d` doubles fix (findRestarts) + place_broll by name/bin path + prompt rules (everything after v0.1.77 `a39b166`-era is unreleased main; see Current State)
**Role:** BUILDER (make changes, run tests, ship releases; VERIFIER = reproduce and confirm without editing. Default here is BUILDER; confirm with the user before a release.)

---

## What this project is

A public, MIT-licensed Adobe Premiere Pro CEP panel ("Claude for Premiere") that runs the user's own Claude Code (or Codex) inside Premiere. The editor clicks a folder or clips, says what they want, and the agent inspects footage, transcribes, cuts silences, fillers and repeated takes, reframes, lays b-roll, organizes bins, and makes captions, all through deterministic panel tools that print CHECK lines and keep a duplicate-sequence safety net. Users install a zip; the panel self-updates from GitHub Releases. Latest public release: **0.1.77 (2026-09-07)**.

## Where things stand (read this first)

**The product loop being built this weekend is "make this a 9x16 video" from a raw talking-head bin.** It ran end to end once tonight on the user's test project (a folder with a TALKING HEAD bin and a BROLL bin; two BRAW clips, 388 s raw, 748 words). Result: a 1080x1920 sequence, footage filled and face-centred with read-backs, transcript from Whisper, 52 model-authored thoughts, `audio_cut` kept 12 pieces (79.8 s) with CHECK PASS. The user's verdict: **"there are still double moments here."** The panel-side Claude blamed its own thought boundaries. That is half the story; the code side is in What's Next item 1.

**The cut pipeline now (0db65d6, 5bb9087):**
1. `rough_cut({bin, aspect|preset|width/height, language})`: creates `<folder> <shape>` in the bin's PARENT folder (never inside TALKING HEAD/BROLL), fills each clip to the frame (`fillFrame`: scale = 100 × max(W/srcW, H/srcH), centred, per-clip read-back) and centres the face (`focusFaces`, Vision faces via `bin/ocr --faces`), no tracking; renders the mix; transcript = Premiere's own per-clip transcript first (instant when the editor transcribed in the Text panel and saved), else Whisper with a `transcribing NN%` progress line in the job bar (`-pp`); hands back `transcript_index` (words as `i:word`, grouped by 0.6 s pauses) and STOPS.
2. The model authors thoughts as word-index ranges (kind answer/production, `retake_of`, label) and calls `audio_cut({thoughts})` for the report, then `audio_cut({thoughts, apply: true})`.
3. `src/thoughts_authored.cjs` (port of House Tour Cut's story harness): validates coverage/order, measures delivery per word from the render (`src/prosody.cjs`), picks each take by fluency = [restarts, pause total, −rate], cuts failed restarts inside a thought (`findRestarts`), trims yeah/okay crumbs only when acoustically out of register, merges kept pieces under the editors' rules (cut-in after ≥0.3 s pause, no cut removing ≤1.0 s of silence, 1–2 s pauses kept and flagged), one `keep_only`.
4. B-roll, tracking (`reframe` / Auto Reframe), frame checks and captions come after, on the survivors only. Order of operations is in `.claude/skills/edit-footage/SKILL.md`.

**Verified tonight from the run log:** `place_broll` failed with `ERR:no project item for v2.mov` (and with the full bin path) although `project_bins` lists the clip; the model then improvised an ad-hoc ExtendScript (bin walk with `getMediaPath()`), the guard refused it, the user declined, and the model reported the panel as hung. So b-roll from a bin path is broken for this project shape (What's Next item 2).

## What Was Done (2026-09-05 to 09-07)

- **Timeline wipe found and fixed** (three days, four wrong theories): `closeGaps` set an in point on a one-frame hole, Premiere reset it to zero, Extract ran from the head. `closeGaps` now extends the previous clip's `.end`, no in/out, a length change there is an error. Per-call trace lines (`extract a= b= in_read= out_read= end_before= end_after=`) go to the panel log and `<seq>.extract-trace.txt` next to the project. Lesson saved to memory: trace every host call before theorising.
- **Native mechanisms verified in Premiere 26.3.2** (rows in `.claude/skills/premiere-scripting/mechanisms.md`): `subject_path` (Auto Reframe keys), `scene_cuts`, `morph_cut` (QE `getVideoTransitionByName(name, true)` needs the MATCH name, map in `matchnames.md`), `multicam_switch` (QE `setMulticam(true)` → `multicam.enable()` → `changeCamera(n)`; the April "not exposed" note was wrong), `visible_at` ledger with per-file alpha settle, `sound_events` (calibrated: a runner-up label under speech is not an event; music/noise only as top label), `speaker_check` (faces; facing/tilt from landmarks), `premiere_shortcut` (reads the editor's .kys), rhythm monitor after every edit, media-analysis ask (Media Intelligence pref read/written like Adobe's Learn panel; decline remembered). All 1,231 command ids are NOT callable from a panel: keystroke or menu only. That includes Speech to Text (`cmd.clip.transcribeasset`), so the panel cannot make Premiere transcribe; it asks the editor or runs Whisper.
- **Eight lazy `require("./src/...")` calls failed silently in CEP** (panel URL carries `%20`); all absolute now, a test forbids the relative form, a button job that throws marks its card Failed.
- **Footage is footage by file type**: BRAW reports an Alpha flag and was treated as a graphic (kept at 100% in 9:16). Camera extensions are footage before the alpha check; adjustment layers excluded from cover. Source size from Premiere's Video Info first, ffprobe only as fallback.
- **Speed and control**: snapshot/ledger refresh suspended during cut loops (each range fired dozens of host events rebuilding the ledger); Stop ends Cut silences / Captions / rough_cut at the next range or step; job bar pinned above the chat (hidden attr fixed; chat view is a flex column so the bar no longer shifts rows onto the buttons); panel-made sequences skip the working copy; several selected bins resolve to their common parent.
- **Logs and reports**: full log kept in memory and appended to `~/Library/Logs/claude-for-adobe/panel-<date>.log`; Copy chat writes the whole chat as markdown to the clipboard and `chat-<date>.md` next to the project; Build bug report writes a redacted `bug-report-<stamp>.md` into the analysis folder (`src/redact.cjs`; never sent anywhere).
- **find_takes** cuts only groups whose weakest pairwise similarity is ≥0.8; the rest are listed with "drop?".
- **Release 0.1.77 published** (2026-09-07 16:14 UTC) after two independent reviews (`docs/codex-review-log.md`). Everything in the commits from `542edd9` through `5bb9087` (transcript rides along with cuts, job bar, bin parent, fill, thoughts, logs, Whisper progress) is **unreleased main**.
- premiere-map Round 249 (other repo) decoded the Media Intelligence embedding cache (`Analyzer Cache Files/*____Embedings.mfdc`: 512-d unit vectors, visual per sampled frame, audio per 0.3125 s); a `similar_shots` tool over it is a later build.

## Current State

- 145 tests, 144 pass, 1 skipped offline (`node --test test/*.test.cjs`). Privacy scan is part of the suite and the pre-push hook.
- Working end to end on the user's Mac (Apple Silicon, Premiere 26.3.2) on the dev panel: rough_cut to the indexed transcript, authored thoughts, audio_cut report and apply, Cut silences with the trace, morph_cut, multicam_switch, visible_at, sound_events, fill and face focus with read-backs, Copy chat, bug report, job bar, Stop.
- Not yet validated by the user: the doubles fix (written and unit/offline-tested, `336637d`), b-roll placement by clip name after rough_cut (written, untested in Premiere), Auto Reframe tracking pass on the survivors, captions on the 9:16 result, Codex agent inside the panel, caption band routes.

## Key Files

| Path | What |
|---|---|
| `panel.js` | Panel UI + all tools (TOOLS/TOOL_DEFS), session lifecycle, updater UI, buttons |
| `host/premiere.jsx` | ES3 host functions (export table at the bottom; must match `host("...")` calls) |
| `src/claude-session.cjs` | Spawns Claude CLI (stream-json), system prompt (all rules live here), model fallback tiers, MCP config, subagent model |
| `src/core.cjs` | ExtendScript guard: rejection/mutation/nonUndoable patterns, isReadOnlyScript, wrapper |
| `src/mcp-http.cjs` | Local MCP server with bearer token |
| `src/update.cjs` | Updater (GitHub Releases, checksum, safe install) |
| `src/whisper.cjs`, `src/vad.cjs`, `src/transcript*.cjs`, `src/captions.cjs`, `src/classify.cjs`, `src/silence.cjs`, `src/pek.cjs` | Engines: Whisper/VAD via bundled whisper.cpp, prproj transcript decode (JS FlatBuffers), cues/SRT, classification, cut planning, peak files |
| `.claude/skills/*/SKILL.md` | Workflows Claude loads; edit freely, no release needed for the dev panel |
| `scripts/package.sh`, `scripts/install.sh`, `Install.command` | Release build (refuses version mismatch), dev install, user installer |
| `docs/codex-review-log.md` | Full review trail |
| `docs/demo.gif`, `docs/demo-source.html` | Start-screen animation and its source |
| `~/DevApps/Brain/Projects/Claude for Adobe/Claude for Adobe — Architecture and Operations.md` | Vault architecture note (panel/host/MCP/guard summary); vault gotchas in `Knowledge/Premiere Internals/Premiere CEP Panel Gotchas 2026-09-04.md` |

## Memory notes (auto-loaded in this repo's scope; also readable by absolute path)

Private, per-machine notes under `~/.claude/projects/<this repo's scope>/memory/` (originals under the premiere-map scope). They are not in the repo on purpose:
- `project_premiere_claude_zip_distribution.md`: packaging, `bin/` bundling, the ggml Homebrew byte-patch (`GGML_BACKEND_PATH` is not a fix), `afconvert` flags, updater lessons (CEP Node `https` hangs; use the page's `fetch`), the stale-VPN DNS gotcha (`scutil --dns`). Read before touching `bin/`, packaging, or the updater.
- `feedback_release_chain_guard.md`: why `test/host.test.cjs` exists; edits, tests, publish as separate steps.
- `project_claude_in_premiere_panel.md`: architecture summary and the jobs-then-nudge pattern.

## Test project (the user's real sandbox for this work)

- The project path, the 9:16 test sequence name, and its analysis folder are in the private memory note `project_claude_for_adobe_test_project.md` (see Memory notes above). Never write them into the repo: it is public.
- The test sequence is 9:16 with a title graphic, a text-placement PNG, and captions. Working copies are named `<name> [Claude]`.
- Analysis outputs live next to the project in `_claude-for-adobe_analysis/` (transcripts, classification, SRT, `snapshots/<sequence>/` contact sheets).
- Re-test for item 1 (doubles): 1) footer shows the dev panel; 2) select the TALKING HEAD and BROLL bins in the Project panel; 3) say "make this a 9x16 video"; 4) the audio_cut report must list the four doubled spans (the "premier project / premiere project file" restart, the "reach which reach which" stutter, the trailing "and tight, which makes decisions" restart, and one of the two "room to grow" thoughts) under Dropped; 5) listen through the 12 kept pieces for anything said twice.
- Re-test for the 4:5 cover check (older item): 1) footer shows 0.1.68 or later; 2) open that sequence; 3) say "make it 4:5"; 4) the contact sheet must include a moment with the title fully on and one with a caption showing; 5) nothing covers the face, and Claude nudged rather than asked.

## Decisions Made

| Decision | Why |
|---|---|
| Deterministic tools first; Claude's judgment only for what to keep, order, names | Cheaper, repeatable, no API guessing |
| Long jobs (downloads, transcription) run outside the tool call; the panel nudges Claude via `session.send` | Claude Code's tool timeout; MCP_TOOL_TIMEOUT=1h is only a backstop |
| Graphics fit, footage fills on reframe | Titles blew past 4:5 edges when filled |
| Captions are plain native caption tracks (SRT import), not MOGRTs | User chose plain; Captioneer-style animated captions = AE milestone |
| Transcripts belong to clips; `transcribe_timeline` for an exact transcript of a cut | Re-cut timelines reuse clip transcripts; render-the-mix gives timeline time |
| Never publish from a chain gated only on tests that don't cover the edit | Two broken releases; see the memory note `feedback_release_chain_guard.md` under Key Files |
| `premiere-codex` is frozen | The public repo is canonical |

## What's Next

1. **RE-RUN THE 9:16 LOOP (needs the editor: Premiere control was declined for the agent).** Code for last night's two failures is written, tested and installed to the dev panel (`336637d`); the host script changed, so **restart Premiere first**. Then: footer shows the dev panel; select the TALKING HEAD and BROLL bins; say "make this a 9x16 video". Pass criteria: the audio_cut report lists the "premier project / premiere project file" restart, the "reach which reach which" stutter and the "and tight, which makes decisions…" restart under Dropped (verified offline on the run's real word timings: all three found, no false positives in the raw 726-word take series beyond genuine repeats), and the two "room to go / room to grow" thoughts are linked by `retake_of` so one is dropped (prompt rule; model behaviour, not yet observed). Listen through the kept pieces for anything said twice.
2. **Then b-roll, tracking, captions on the survivors** in the same session: `place_broll` now takes the clip name or `bin/path/name` as `project_bins` prints it (exact media path still wins; several matches is an error naming them), so "v2.mov" resolves. Then `reframe` (no bin) once for tracking, `seam_frames`/`layer_frames`, captions last. Wall time per step goes in the log. If place_broll still errors, the new prompt rule says the model reports it and stops; the error text is the bug report.
3. **Release beyond 0.1.77**: everything since `542edd9` is dev-only. Bump `CSXS/manifest.xml` + `package.json`, review the host-script changes (`closeGaps`, `isGraphicItem`, `createSequenceFromBin` parent bin, `clipTransforms` fields, `findItemByMedia`) under the AGENTS.md rule and log in `docs/codex-review-log.md`, then `sh scripts/package.sh` and `gh release create`. Never run `gh release create` without an explicit go from the user in this session.
4. **Keystroke doorbell decision** (needs the Accessibility permission): the only way to reach command ids (Speech to Text, etc.). The user has not decided; do not build without a yes.
5. **Default Media Scaling preference** (Preferences > Media): still unknown; needed to know what scale 100% means for fill on other machines.
6. Parked: `sound_events` on a cut with a real laugh; `similar_shots` over the embedding cache (audio record start field unpinned); masks in the cover model; caption band routes (track-style inheritance, import-a-sequence); Codex in the panel; After Effects panel; ZXP signing.

**findRestarts rules now (`src/thoughts_authored.cjs`):** tokens match fuzzily (one a prefix of the other, or edit distance 1, both ≥4 letters); an immediate repeat needs 2 words, a repeat with words between needs 4; a comma before the retake is not a list; a run opening on and/or/nor/but/so is a list only when 1–3 words sit between the attempts (the slot: "and we painted the WALLS and we painted the ceiling"); a retake preceded by and/or/nor is a list; with more than 3 words between and no pause marking the retake, the cut is exactly [first attempt, retake). Ceiling: a genuine list whose slot is 4+ words and whose repeated template is 4+ words reads as a restart.

## Known Issues

- The model, when a tool errors, improvises ExtendScript (tonight: a bin walk for media paths). The guard stops mutations, the user declines, and the model then reports Premiere as hung. Add the rule to the prompt with the place_broll fix (What's Next 2).
- Whisper on 6+ minutes of raw audio takes minutes; the job bar now shows its percentage, but Premiere's own transcript (Text panel > Transcribe, then Cmd+S) is the instant path and is picked up first.
- Privacy guard: `test/privacy.test.cjs` scans tracked files for home paths, `/Volumes/` paths (except the `/Volumes/X` fixture), emails, and any term listed in `~/.claude-for-adobe-private-words` (one per line, outside the repo on purpose). `.githooks/pre-push` runs it; `scripts/install.sh` sets `core.hooksPath`. Public repo history was rewritten on 2026-09-05 to remove client paths; GitHub may still serve the old commits by hash.
- Premiere keeps a closed panel alive; only reload (which updates do) or a Premiere restart loads new code. The dev panel needs close/reopen after edits, Premiere restart for host script changes.
- `overwriteClip`, `Track.setLocked`, `TrackItem.end`/`inPoint` assignments and `exportAsMediaDirect` are verified only in the user's Premiere 26.3.2; watch for version differences.
- Transitions are invisible to the panel (not in the ExtendScript surface we use).
- Caption position is a Premiere track setting; the panel can create the track but not move the band.
- Whisper cache key changed to `v4-whispercpp-fillers` (fillers kept); older caches recompute.
- The user's Mac has a Homebrew ggml; the byte-patched `bin/libggml.0.dylib` is what keeps the bundled backends in use. Re-apply the patch when upgrading whisper.cpp.
- `schemas.adobe.com` fetch in `test/whisper.test.cjs` skips offline, so the pass count is 74 or 75 depending on network.
- `AGENTS.md` was rewritten on 2026-09-05 to point here; the old prototype-era version (SPEC.md, Codex app-server) is gone. `docs/handoff.md` is canonical.

## Quick Start for Next Session

```bash
cd ~/DevApps/claude-for-adobe
git pull
node -e 'const {findRestarts}=require("./src/thoughts_authored.cjs");const mk=s=>s.split(" ").map((t,i)=>({text:t,start:i*0.3,end:i*0.3+0.25}));console.log(findRestarts(mk("and tight which makes decisions on what to keep and generates text on what parts and tight which makes decisions")))'  # prints one restart (cut 0 -> 4.5) since 336637d
gh auth status                          # must show dandjlab-cell before any release
claude --version                        # CLI present (the panel also accepts the desktop app's login)
node --test test/*.test.cjs            # 145 tests, 144 pass, 1 skips offline; privacy.test.cjs scans the tree
sh scripts/install.sh                   # also installs the pre-push privacy hook
# release: bump CSXS/manifest.xml AND package.json to X.Y.Z, then
sh scripts/package.sh && gh release create vX.Y.Z dist/ClaudeForAdobe-X.Y.Z.zip dist/ClaudeForAdobe.zip --title "Claude for Adobe X.Y.Z" --notes "..."
```

Requirements on the Mac: Apple Silicon, Premiere 25+, Claude desktop app signed in (Claude Code opened once) or the CLI; `gh` authenticated as dandjlab-cell for releases. No API keys anywhere; Claude runs under the user's own login.
