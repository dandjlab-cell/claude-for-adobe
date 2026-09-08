# Claude for Adobe — Session Handoff

**Repo:** https://github.com/dandjlab-cell/claude-for-adobe.git
**Worktree:** ~/DevApps/claude-for-adobe
**Date:** 2026-09-08
**Branch:** `main` (pushed to origin; `origin/main` == local `main`)
**Last commit:** `ec2670d` Codex review of the prompt restructure (APPROVED round 2). This session added four commits: `336637d` doubles + place_broll fixes, `547bc2f` handoff, `3049f17` prompt restructure, `ec2670d` review fix-up. All source is on GitHub; **the released zip is still 0.1.77, so none of it reaches installed panels until a release is cut** (see What's Next 3).
**Role:** BUILDER (make changes, run tests, ship releases; VERIFIER = reproduce and confirm without editing. Default here is BUILDER; confirm with the user before a release.)

---

## What this project is

A public, MIT-licensed Adobe Premiere Pro CEP panel ("Claude for Premiere") that runs the user's own Claude Code (or Codex) inside Premiere. The editor clicks a folder or clips, says what they want, and the agent inspects footage, transcribes, cuts silences, fillers and repeated takes, reframes, lays b-roll, organizes bins, and makes captions, all through deterministic panel tools that print CHECK lines and keep a duplicate-sequence safety net. Users install a zip; the panel self-updates from GitHub Releases. Latest public release: **0.1.77 (2026-09-07)**.

## Where things stand (read this first)

**The product loop being built this weekend is "make this a 9x16 video" from a raw talking-head bin.** It ran end to end once on 2026-09-07 on the user's test project (a folder with a TALKING HEAD bin and a BROLL bin; two BRAW clips, 388 s raw, 748 words). Result: a 1080x1920 sequence, footage filled and face-centred with read-backs, transcript from Whisper, 52 model-authored thoughts, `audio_cut` kept 12 pieces (79.8 s) with CHECK PASS. The user's verdict: **"there are still double moments here."**

**Both causes of that run's failures were found and fixed on 2026-09-08, in code.** Neither fix has been exercised in Premiere: there has been no `rough_cut`, `audio_cut` or `place_broll` call since 2026-09-07.

The prompt restructure is in a different position. The dev panel at `ec2670d` ran a live session on 2026-09-08 (08:28-12:39, framing work on a client project: 41 `nudge_clip`, 7 `preview_frames`, 2 `subject_path`, `project_bins`, `sequence_overview`, `media_info`, `clip_transforms`), with **zero tool errors and no improvised ExtendScript**. So the new prompt has one clean live session behind it; the doubles fix and `place_broll` do not. Evidence: `~/Library/Logs/claude-for-adobe/panel-2026-09-08.log`.

The single most important next action is the 9:16 re-run (What's Next 1), and it needs the editor: the agent was denied Premiere control on 2026-09-08.

**The cut pipeline now (0db65d6, 5bb9087):**
1. `rough_cut({bin, aspect|preset|width/height, language})`: creates `<folder> <shape>` in the bin's PARENT folder (never inside TALKING HEAD/BROLL), fills each clip to the frame (`fillFrame`: scale = 100 × max(W/srcW, H/srcH), centred, per-clip read-back) and centres the face (`focusFaces`, Vision faces via `bin/ocr --faces`), no tracking; renders the mix; transcript = Premiere's own per-clip transcript first (instant when the editor transcribed in the Text panel and saved), else Whisper with a `transcribing NN%` progress line in the job bar (`-pp`); hands back `transcript_index` (words as `i:word`, grouped by 0.6 s pauses) and STOPS.
2. The model authors thoughts as word-index ranges (kind answer/production, `retake_of`, label) and calls `audio_cut({thoughts})` for the report, then `audio_cut({thoughts, apply: true})`.
3. `src/thoughts_authored.cjs` (port of House Tour Cut's story harness): validates coverage/order, measures delivery per word from the render (`src/prosody.cjs`), picks each take by fluency = [restarts, pause total, −rate], cuts failed restarts inside a thought (`findRestarts`), trims yeah/okay crumbs only when acoustically out of register, merges kept pieces under the editors' rules (cut-in after ≥0.3 s pause, no cut removing ≤1.0 s of silence, 1–2 s pauses kept and flagged), one `keep_only`.
4. B-roll, tracking (`reframe` / Auto Reframe), frame checks and captions come after, on the survivors only. Order of operations is in `.claude/skills/edit-footage/SKILL.md`.

**Verified from the run log `~/Library/Logs/claude-for-adobe/panel-2026-09-07.log` (and the chat export `chat-2026-09-07-20-36-07.md` in the analysis folder):** `place_broll` failed with `ERR:no project item for v2.mov` (and with the full bin path) although `project_bins` lists the clip; the model then improvised an ad-hoc ExtendScript (bin walk with `getMediaPath()`), the guard refused it, the user declined, and the model reported the panel as hung. So b-roll from a bin path is broken for this project shape (What's Next item 2).

## What Was Done (2026-09-08, this session)

- **The doubles the 2026-09-07 cut left in** were three code bugs in `findRestarts` (`src/thoughts_authored.cjs`), not the model's thought boundaries. It now matches tokens fuzzily (prefix, or edit distance 1, both 4+ letters, so "premier" == "premiere"); a comma before the retake is no longer read as a list; a run opening on and/or/nor/but/so is a list only when 1-3 words sit between the attempts; an immediate repeat needs 2 words instead of 4 ("reach which reach which"); with a long stretch between attempts the cut is exactly [first attempt, retake). The four phrases from the run are a test in `test/thoughts_authored.test.cjs` (synthetic timings, which prove the token rules). Separately, an **ad-hoc replay, not committed** (it reads the test project's `timeline.json` on the external drive, which cannot live in a public repo) found all three restarts on the run's real word timings with no false positives beyond genuine repeats; reproduce it with the recipe in What's Next 1. The `report()` line that claimed cuts never happen inside a thought was wrong and is fixed.
- **`place_broll` could not find a clip by name.** `findItemByMedia` (`host/premiere.jsx`) compared only `getMediaPath()` by exact string. It now resolves a full media path (exact match wins and stops the walk), `bin/path/name` as `project_bins` prints it, the item name, or the file basename; several matches is an error naming them.
- **System prompt cut from ~3,200 words to 696** (`3049f17` landed 645; the Codex round-1 fixes in `ec2670d` rewrote four rules longer). See the dedicated section below. Reviewed by `codex` CLI, APPROVED in round 2, trail in `docs/codex-review-log.md`.
- **Prompt rules added at the two points that failed**: `retake_of` links two thoughts making the same point in other words (the "room to go"/"room to grow" semantic double); a tool error is reported in one line and then you stop, never scripted around with `run_extendscript` (the 2026-09-07 model improvised a bin walk, the guard refused it, and it then reported Premiere as hung).
- **Pushed to GitHub** (`e10ec5e..ec2670d` on `main`). Source only; no release.

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

- `node --test test/*.test.cjs` -> **145 tests, 144 pass, 1 skip** (`whisper.test.cjs`, which fetches `schemas.adobe.com`). That is the healthy result; treat any other count as a real break. The privacy scan is part of the suite and of the pre-push hook.
- Working end to end on the user's Mac (Apple Silicon, Premiere 26.3.2) on the dev panel: rough_cut to the indexed transcript, authored thoughts, audio_cut report and apply, Cut silences with the trace, morph_cut, multicam_switch, visible_at, sound_events, fill and face focus with read-backs, Copy chat, bug report, job bar, Stop.
- **Not yet run in Premiere at all** (all three landed 2026-09-08, offline only): the doubles fix (`336637d`, unit tests + a replay against the real run's word timings), `place_broll` by clip name (`336637d`, no live call), and the restructured system prompt (`3049f17`/`ec2670d`, no live session). The dev panel has them: its extension folder symlinks this repo, so `src/` and the skills are always current and need no reinstall. **Premiere was already restarted on 2026-09-08 at 08:28 with `host/premiere.jsx` at `ec2670d`** (`host script loaded` in that day's log), so the re-run just needs the panel opened. Restart again only if the host script changes.
- Also still unvalidated from before: Auto Reframe tracking pass on the survivors, captions on the 9:16 result, Codex agent inside the panel, caption band routes.
- Attempting to drive Premiere from the agent: the user declined the computer-use access request on 2026-09-08. Assume the re-run is the editor's click unless they say otherwise.

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
| `docs/codex-review-log.md` | Full review trail (Rounds 1-2 of 2026-09-08 cover the prompt restructure) |
| `~/Library/Logs/claude-for-adobe/panel-<date>.log` | The panel log every session appends to; `panel-2026-09-07.log` is the evidence for the doubles and the place_broll failure |
| `docs/demo.gif`, `docs/demo-source.html` | Start-screen animation and its source |
| `~/DevApps/Brain/Projects/Claude for Adobe/Claude for Adobe — Architecture and Operations.md` | Vault architecture note (panel/host/MCP/guard summary); vault gotchas in `Knowledge/Premiere Internals/Findings/Premiere CEP Panel Gotchas 2026-09-04.md`. **Both were written 2026-09-05: their test counts and version numbers are stale; this handoff is canonical on anything numeric.** |

## Memory notes (read them by absolute path; they are NOT in the repo)

Private, per-machine notes in `~/.claude/projects/-Users-<you>-DevApps-claude-for-adobe/memory/` (the scope folder is the repo path with slashes turned into dashes; `ls ~/.claude/projects | grep claude-for-adobe` finds it). They auto-load only when the session's working directory is `~/DevApps/claude-for-adobe`; from a git worktree or any other directory, read them by absolute path. They are out of the repo on purpose (it is public):
- `project_premiere_claude_zip_distribution.md`: packaging, `bin/` bundling, the ggml Homebrew byte-patch (`GGML_BACKEND_PATH` is not a fix), `afconvert` flags, updater lessons (CEP Node `https` hangs; use the page's `fetch`), the stale-VPN DNS gotcha (`scutil --dns`). Read before touching `bin/`, packaging, or the updater.
- `feedback_release_chain_guard.md`: why `test/host.test.cjs` exists; edits, tests, publish as separate steps.
- `project_claude_in_premiere_panel.md`: architecture summary and the jobs-then-nudge pattern.
- `project_claude_for_adobe_test_project.md`: **the test project's path, its 9:16 sequence name and its analysis folder** — the re-run in What's Next 1 needs this. Never copy those paths into this repo.
- `feedback_flag_private_data_before_push.md`: why the privacy test and the pre-push hook exist for public repos.
- `MEMORY.md` is the index of the folder; `ls` it for anything not listed here.

## Test project (the user's real sandbox for this work)

- **Pre-flight, both must be true before any re-run:** (1) the external drive holding the project is mounted (the project is not on the internal disk; the exact path is in the private memory note below, never in this repo) and (2) the panel footer starts with **`dev <sha> (<branch>)`**. If the footer reads **`v0.1.77`** you are in the released panel and none of this session's fixes exist there.
- The project path, the 9:16 test sequence name, and its analysis folder are in the private memory note `project_claude_for_adobe_test_project.md` (see Memory notes above). Never write them into the repo: it is public.
- The test sequence is 9:16 with a title graphic, a text-placement PNG, and captions. Working copies are named `<name> [Claude]`.
- Analysis outputs live next to the project in `_claude-for-adobe_analysis/` (transcripts, classification, SRT, `snapshots/<sequence>/` contact sheets).
- Re-test for item 1 (doubles): 1) footer shows the dev panel; 2) select the TALKING HEAD and BROLL bins in the Project panel; 3) say "make this a 9x16 video"; 4) the audio_cut report must list the four doubled spans (the "premier project / premiere project file" restart, the "reach which reach which" stutter, the trailing "and tight, which makes decisions" restart, and one of the two "room to grow" thoughts) under Dropped; 5) listen through the 12 kept pieces for anything said twice.
- Re-test for the 4:5 cover check (**older item, written against a released panel; its 0.1.68 footer requirement does NOT apply to the 9:16 re-run above, which needs the `dev` footer**): 1) footer shows 0.1.68 or later; 2) open that sequence; 3) say "make it 4:5"; 4) the contact sheet must include a moment with the title fully on and one with a caption showing; 5) nothing covers the face, and Claude nudged rather than asked.

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

## System prompt restructure (2026-09-08, Codex APPROVED round 2)

`buildSystemPrompt` went from 3,200 words / 32 paragraphs to **696 words** (`3049f17` landed 645; the Codex round-1 fixes in `ec2670d` rewrote four rules longer). The cap in `test/codex-session.test.cjs` is 700, so there are **4 words of headroom** — that is the forcing function working: the next rule goes in a skill, a tool description, a tool result or the guard, or the cap moves as a deliberate decision, not by accident: header parsing, one-line rules that bind on turn one (plan first, act don't ask, CHECK, stop on a tool error, never edit the original, never guess, long jobs, reading, RHYTHM, undo), a skill index by job, and the voice. Procedure moved to where it binds: edit-footage (authoring semantics, b-roll bin rule, transcripts belong to clips, Premiere first, subagents), reframe (looking loop, visible_at, reframe-is-a-loop, "check the framing" starts with snapshot_moments), how-to-use (bug reports), rough_cut's result text (retake_of), the RHYTHM header (fix in this turn), the snapshot_moments result (graphics usually untouched). `reframe` now REFUSES a bin (raw footage is rough_cut's job; the old bin branch and `name` parameter are gone). The cap is enforced by `test/codex-session.test.cjs`: when a rule is needed, put it in a skill, a tool description, a tool result, or the guard, not the prompt. Review trail: `docs/codex-review-log.md` Rounds 1-2 (2026-09-08). Not yet run against Premiere: the first live session on the new prompt is the re-run in What's Next 1.

## What's Next

1. **RE-RUN THE 9:16 LOOP (needs the editor: Premiere control was declined for the agent).** Code for the 2026-09-07 failures is written, tested and live in the dev panel (Premiere was restarted on 2026-09-08 with this host script; restart again only if `host/premiere.jsx` changes). Then: drive mounted, panel open, footer reads `dev …`, select the TALKING HEAD and BROLL bins, say "make this a 9x16 video".
   - **MUST (code; verified offline by the ad-hoc replay below, which is NOT a committed test):** the audio_cut report lists all three restarts under Dropped: the "premier project / premiere project file" one, the "reach which reach which" stutter, and the "and tight, which makes decisions…" one.
   - **SHOULD (model behaviour, never yet observed):** the two "room to go / room to grow" thoughts are linked by `retake_of` so one is dropped. A run that hits MUST but misses SHOULD is a **partial pass**: record what happened by editing this item in this handoff before committing it, keep going with item 2, and treat the `retake_of` prompt rule as the thing to tune.
   - **Also watch:** the model must report any tool error in one line and stop, never improvise ExtendScript (that is the 2026-09-07 failure this session wrote a rule against). Listen through the kept pieces for anything said twice.
   - **If doubles remain:** click Build bug report (writes a redacted `bug-report-<stamp>.md` into the analysis folder), keep the audio_cut report text, and replay the failing span through `findRestarts` with that run's REAL word timings before changing any rule. The timings are the `words` array of `<sequence>.timeline.json` in the analysis folder (`list_analysis` prints the folder; each entry is `{text, start, end}` in timeline seconds, and that file is what `transcript_index` and `audio_cut` both read). The filename sanitizes `/ \ :` to `_`, so a sequence called `9/16 social` is `9_16 social.timeline.json`. Replay one span (start and end in timeline seconds):
     ```bash
     cd ~/DevApps/claude-for-adobe && node -e 'const {findRestarts}=require("./src/thoughts_authored.cjs");const w=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).words;const [a,b]=[Number(process.argv[2]),Number(process.argv[3])];console.log(findRestarts(w.filter(x=>x.start>=a&&x.end<=b)))' "<analysis>/<sequence>.timeline.json" 160 175
     ```
     Synthetic `i*0.3` timings (as in the Quick Start one-liner) prove the token rules only; the pause-based phrase-start logic needs real gaps. The current semantics are in the findRestarts block at the end of this section; its known ceiling is a genuine list whose slot is 4+ words and whose repeated template is 4+ words.
2. **Then b-roll, tracking, captions on the survivors** in the same session: `place_broll` now takes the clip name or `bin/path/name` as `project_bins` prints it (exact media path still wins; several matches is an error naming them), so "v2.mov" resolves. Then `reframe` (no bin) once for tracking, `seam_frames`/`layer_frames`, captions last. Wall time per step goes in the log. If place_broll still errors, the new prompt rule says the model reports it and stops; the error text is the bug report.
3. **Release 0.1.78, gated on the re-run passing** (do not cut a release on unvalidated code; that is how two broken releases shipped): everything since `542edd9` is dev-only. Bump both `CSXS/manifest.xml` and `package.json` to 0.1.78 (they must match or `scripts/package.sh` refuses), review the host-script changes (`closeGaps`, `isGraphicItem`, `createSequenceFromBin` parent bin, `clipTransforms` fields, `findItemByMedia`) under the AGENTS.md rule and log in `docs/codex-review-log.md`, then `sh scripts/package.sh` and `gh release create`. Never run `gh release create` without an explicit go from the user in this session.
4. **Keystroke doorbell decision** (needs the Accessibility permission): the only way to reach command ids (Speech to Text, etc.). The user has not decided; do not build without a yes.
5. **Default Media Scaling preference** (Preferences > Media): still unknown; needed to know what scale 100% means for fill on other machines.
6. Parked: `sound_events` on a cut with a real laugh; `similar_shots` over the embedding cache (audio record start field unpinned); masks in the cover model; caption band routes (track-style inheritance, import-a-sequence); Codex in the panel; After Effects panel; ZXP signing.

**findRestarts rules now (`src/thoughts_authored.cjs`):** tokens match fuzzily (one a prefix of the other, or edit distance 1, both ≥4 letters); an immediate repeat needs 2 words, a repeat with words between needs 4; a comma before the retake is not a list; a run opening on and/or/nor/but/so is a list only when 1–3 words sit between the attempts (the slot: "and we painted the WALLS and we painted the ceiling"); a retake preceded by and/or/nor is a list; with more than 3 words between and no pause marking the retake, the cut is exactly [first attempt, retake). Ceiling: a genuine list whose slot is 4+ words and whose repeated template is 4+ words reads as a restart.

## Known Issues

- The model, when a tool errors, improvises ExtendScript (2026-09-07: a bin walk for media paths). The guard stops mutations, the user declines, and the model then reports Premiere as hung. **The prompt rule against this shipped in `336637d` and is unvalidated in Premiere: watch for the behaviour in the re-run.**
- Whisper on 6+ minutes of raw audio takes minutes; the job bar now shows its percentage, but Premiere's own transcript (Text panel > Transcribe, then Cmd+S) is the instant path and is picked up first.
- Privacy guard: `test/privacy.test.cjs` scans tracked files for home paths, `/Volumes/` paths (except the `/Volumes/X` fixture), emails, and any term listed in `~/.claude-for-adobe-private-words` (one per line, outside the repo on purpose). `.githooks/pre-push` runs it; `scripts/install.sh` sets `core.hooksPath`. Public repo history was rewritten on 2026-09-05 to remove client paths; GitHub may still serve the old commits by hash.
- Premiere keeps a closed panel alive; only reload (which updates do) or a Premiere restart loads new code. The dev panel needs close/reopen after edits, Premiere restart for host script changes.
- `overwriteClip`, `Track.setLocked`, `TrackItem.end`/`inPoint` assignments and `exportAsMediaDirect` are verified only in the user's Premiere 26.3.2; watch for version differences.
- Transitions are invisible to the panel (not in the ExtendScript surface we use).
- Caption position is a Premiere track setting; the panel can create the track but not move the band.
- Whisper cache key changed to `v4-whispercpp-fillers` (fillers kept); older caches recompute.
- The user's Mac has a Homebrew ggml; the byte-patched `bin/libggml.0.dylib` is what keeps the bundled backends in use. Re-apply the patch when upgrading whisper.cpp.
- One test skips offline: `test/whisper.test.cjs` fetches `https://schemas.adobe.com/transcript/v1.0.0`. A healthy full run is always **145 tests, 144 pass, 1 skip** (online or off; the skip is counted, not a failure). Any other number means something actually broke.
- `AGENTS.md` was rewritten on 2026-09-05 to point here; the old prototype-era version (SPEC.md, Codex app-server) is gone. `docs/handoff.md` is canonical.

## Quick Start for Next Session

**The one thing that matters: the 9:16 re-run, in Premiere, by the editor.** Everything below is setup for it.

```bash
cd ~/DevApps/claude-for-adobe
git status --short                      # expect clean (this handoff is committed at the end of every session; it only shows modified while one is being written)
git pull
sh scripts/install.sh                   # dev panel + pre-push privacy hook. The panel symlinks this repo, so src/ and skills are always current;
                                        # restart Premiere ONLY if host/premiere.jsx changed (it did not since the 2026-09-08 08:28 load)
node -e 'const {findRestarts}=require("./src/thoughts_authored.cjs");const mk=s=>s.split(" ").map((t,i)=>({text:t,start:i*0.3,end:i*0.3+0.25}));console.log(findRestarts(mk("and tight which makes decisions on what to keep and generates text on what parts and tight which makes decisions")))'  # prints one restart (cut 0 -> 4.5) since 336637d
gh auth status                          # must show dandjlab-cell before any release
claude --version                        # CLI present (the panel also accepts the desktop app's login)
node --test test/*.test.cjs            # 145 tests, 144 pass, 1 skips offline; privacy.test.cjs scans the tree
# release: bump CSXS/manifest.xml AND package.json to X.Y.Z, then
sh scripts/package.sh && gh release create vX.Y.Z dist/ClaudeForAdobe-X.Y.Z.zip dist/ClaudeForAdobe.zip --title "Claude for Adobe X.Y.Z" --notes "..."
# end of every session: commit this file, so the next one on any machine reads the current state
git add docs/handoff.md && git commit -m "docs: session handoff <date>" && git push
```

Then, in Premiere: the footer must read `dev <sha> (<branch>)` and NOT `v0.1.77`; select the TALKING HEAD and BROLL bins in the Project panel; say "make this a 9x16 video". Pass criteria (MUST vs SHOULD) in What's Next 1.

Requirements on the Mac: Apple Silicon, Node 24 (`node --version` -> v24.1.0 on this Mac), Premiere 25+, Claude desktop app signed in (Claude Code opened once) or the CLI; `gh` authenticated as dandjlab-cell for releases. **The test project lives on an external drive that must be mounted before any re-run** (path in the private memory note `project_claude_for_adobe_test_project.md`; never write it into this repo). Whisper's model downloads once on first use. **Budget for the re-run: several minutes.** Whisper on 6+ minutes of raw audio takes minutes (the job bar shows a percentage); if the editor transcribed in the Text panel and pressed Cmd+S first, `rough_cut` picks up Premiere's own transcript instead and that step is instant. Put the wall time per step in the log. No API keys anywhere; Claude runs under the user's own login.
