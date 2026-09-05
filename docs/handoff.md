# Claude for Adobe — Session Handoff

**Repo:** https://github.com/dandjlab-cell/claude-for-adobe.git
**Worktree:** ~/DevApps/claude-for-adobe
**Date:** 2026-09-05
**Branch:** `main`
**Last commit:** see `git log -1` (0.1.68 was `ea7dd8d`; everything after it is unreleased main)
**Role:** BUILDER (make changes, run tests, ship releases; VERIFIER = reproduce and confirm without editing. Default here is BUILDER; confirm with the user before a release.)

---

## What this project is

A public, MIT-licensed Adobe Premiere Pro CEP panel ("Claude for Premiere") that runs the user's own Claude Code inside Premiere. The editor clicks a folder or clips, says what they want, and Claude inspects footage, transcribes, cuts silences and fillers, reframes, lays b-roll, organizes bins, and makes captions, all through deterministic panel tools with a duplicate-sequence safety net. Users install a zip; the panel self-updates from GitHub Releases. Shipped 68 releases on 2026-09-04 (0.1.0 to 0.1.68).

## What Was Done (2026-09-04 session, one very long day)

- Created the public repo from the private `premiere-codex` prototype (which is now superseded; do not edit it). Squashed history, MIT licence, third-party notices, no client data.
- Distribution: `scripts/package.sh` builds `dist/ClaudeForAdobe-<ver>.zip` plus a constant-name copy; `Install.command` (staged swap, quarantine clear, PlayerDebugMode); in-panel updater (`src/update.cjs`) with checksum, GitHub-only hosts, archive inspection, backup/rollback, self-reload; "Settings · update" marker; share link `https://github.com/dandjlab-cell/claude-for-adobe/releases/latest/download/ClaudeForAdobe.zip`.
- Security: four Codex review rounds plus a four-round release-process review (`docs/codex-review-log.md`). Script guard (`src/core.cjs`): hard rejections (save/export/quit/open, engine objects, eval, `this`, escapes, call/apply/bind), allowlist-based read-only auto-run, everything else needs the user's click ("Run it / Run all this session"); MCP server requires a per-session bearer token; Claude may Read only the project's `_claude-for-adobe_analysis` folder and the panel's `.claude/skills`.
- Bundled whisper.cpp (`bin/`): Silero VAD for silence cutting, and Whisper transcription with the model (best/fast/fastest) downloaded on first use into `~/Library/Caches/claude-for-adobe/models`. Audio extraction via macOS `afconvert`. ggml's compiled-in Homebrew path is byte-patched in `bin/libggml.0.dylib` (see the memory notes listed under Key Files).
- Tools (panel.js `TOOLS`/`TOOL_DEFS`, host in `host/premiere.jsx`): sequence_overview, classify_clips (bin or sequence, speech coverage, sizes/rates, talking head vs b-roll), create_sequence (from bin; preset/aspect), set_sequence_size (any aspect; footage fills, graphics fit; checkpoint first), nudge_clip, snapshot_moments (timeline-chosen key moments incl. graphics/captions, contact sheet saved), frames_across, preview_frames, read_transcript, find_in_transcript, transcribe_whisper (background job), transcribe_timeline (renders the mix with Premiere's `WAV_Mono_16bit_16kHz.epr`, exact timeline-time transcript), create_captions (SRT next to project, imported as a caption track), remove_silences (batched, presets social/natural), remove_fillers (ums, stutters, repeats), remove_pauses, extract_ranges, keep_only, place_broll (V2 overlay, other tracks locked, audio removed, fingerprint check), mute_clip_audio, project_bins, move_to_bin, list_analysis, save_notes, analyze_audio, media_info, run_extendscript (guarded).
- UI: VO Studio-derived dark style, Chat/Settings tabs, Cut silences and Captions buttons with option strips, live "Selected" line, start screen with wireframe GIF and three chips, footer with version/update button, Copy log.
- Skills shipped in `.claude/skills/`: edit-footage (the core workflow), cut-silences, organize-project, how-to-use, premiere-scripting (API can/cannot table + ES3 snippets). Subagents allowed (Haiku) for read-heavy steps.
- Every message to Claude carries: the Frame line (sequence size vs footage sizes, MISMATCH flag), the open timeline name, and the Project panel selection (bin path). Long jobs run outside tool calls and nudge Claude when done.
- Dev workflow: `sh scripts/install.sh` installs a side-by-side "Claude for Premiere (dev)" panel symlinked to the repo (own id, DevTools port 9296); the shipped copy comes from the zip.

## Current State

Working end to end on the user's Mac (Apple Silicon, Premiere 26.3.2): install, self-update, chat, cut silences, captions button, reframe with the look-fix-look loop, b-roll placement, organizing. 83 tests pass (`node --test test/*.test.cjs`), including a host-script integrity test that guards the export table (two releases shipped broken on 2026-09-04 before it existed; 0.1.45 and 0.1.46 were deleted).

**Codex as an alternative agent (2026-09-05, in main, untested in the panel).** `src/codex-session.cjs` gives the same session interface as the Claude module: one `codex exec --json` process per turn, `resume <thread>` for follow-ups, the panel's MCP server configured with `-c mcp_servers.premiere.url/bearer_token_env_var/default_tools_approval_mode="approve"/tool_timeout_sec=3600` (without the approval mode every tool call fails with "requires approval"), `-s read-only` sandbox, images via `-i`. One rulebook: `buildSystemPrompt(capabilities, agentName)` is Claude's system prompt and is written to `AGENTS.md` in a per-process temp folder that Codex uses as its cwd, with `.agents/skills` symlinked to the panel's `.claude/skills`, so both agents follow the same rules and skills. Agent dropdown next to the model dropdown; models come from `~/.codex/models_cache.json` and the default from `~/.codex/config.toml`. Verified outside Premiere with a standalone MCP server: skills listed, tool called, resumed turn remembered context. Codex also sees the user's global `~/.agents/skills` and runs read-only shell commands to read SKILL.md files (expected). Not yet exercised inside the panel.

Last observed run (0.1.66): 9:16 to 4:5 reframe worked, but the title graphic and captions still overlapped the face. 0.1.67 (graphic-aware snapshots, on-screen layer list per frame, "nothing covers a face" rule) and 0.1.68 (graphics fit instead of fill) address it but have NOT been re-tested by the user yet.

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

## Memory notes (auto-loaded in this repo's scope; also readable by absolute path)

Private, per-machine notes under `~/.claude/projects/<this repo's scope>/memory/` (originals under the premiere-map scope). They are not in the repo on purpose:
- `project_premiere_claude_zip_distribution.md`: packaging, `bin/` bundling, the ggml Homebrew byte-patch (`GGML_BACKEND_PATH` is not a fix), `afconvert` flags, updater lessons (CEP Node `https` hangs; use the page's `fetch`), the stale-VPN DNS gotcha (`scutil --dns`). Read before touching `bin/`, packaging, or the updater.
- `feedback_release_chain_guard.md`: why `test/host.test.cjs` exists; edits, tests, publish as separate steps.
- `project_claude_in_premiere_panel.md`: architecture summary and the jobs-then-nudge pattern.

## Test project (the user's real sandbox for this work)

- The project path, the 9:16 test sequence name, and its analysis folder are in the private memory note `project_claude_for_adobe_test_project.md` (see Memory notes above). Never write them into the repo: it is public.
- The test sequence is 9:16 with a title graphic, a text-placement PNG, and captions. Working copies are named `<name> [Claude]`.
- Analysis outputs live next to the project in `_claude-for-adobe_analysis/` (transcripts, classification, SRT, `snapshots/<sequence>/` contact sheets).
- Re-test steps for What's Next item 1: 1) footer shows 0.1.68 or later; 2) open that sequence; 3) say "make it 4:5"; 4) the contact sheet must include a moment with the title fully on and one with a caption showing; 5) nothing covers the face, and Claude nudged rather than asked.

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

1. **Re-test the 4:5 reframe on the DEV panel** (`sh scripts/install.sh`, restart Premiere: the host script changed) with a title and captions present. Two things changed on 2026-09-05: (a) review fixes (absolute graphics-fit scale; `nudge_clip` refuses ambiguous times); (b) the **reframe order of operations** the user specified after the 0.1.68 run framed the picture around the captions: picture first on visible frames only, then captions, then graphics. It lives in `.claude/skills/reframe/SKILL.md` and the system prompt, with three new tools: `snapshot_moments` now picks only moments where a shot is the visible picture and labels the PICTURE clip; `layer_frames` renders one video track alone (host `frames` gained a solo parameter: other video tracks muted for the render, restored after); `seam_frames` renders the frame before and after every cut where the picture changes. Confirm on the dev panel: Claude frames the talking head for itself (not to dodge the caption band), runs layer and seam checks, places V5 last, and passes a track to `nudge_clip`. Then bump to **0.1.69** (manifest + package.json), `sh scripts/package.sh`, `gh release create`.
1a. **Graphics after the first dev-panel reframe run (2026-09-05 afternoon).** The panel session wrote a developer handoff (in the test project's analysis folder, `reframe-graphics-and-titles-dev-handoff.md`) showing `set_sequence_size` had centred and rescaled the V5 title and the V4 guide, and the model then re-placed the title by eye over 25 calls. Done since (commit 7d42bcd): `set_sequence_size` keeps graphics (position fraction kept, scale × W_new/W_old) and lists before/after; `clip_transforms` tool (Motion Position/Scale per clip, active or named sequence); `nudge_clip` absolutes `x`/`y`/`scale_to`; solo renders report when other tracks could not be hidden; GUIDE clips flagged and never snapshotted; Read allowed on the skills folder's real path as well as the symlink (the dev panel's skills were denied because the Skill tool resolves the realpath); `reframe/graphics-and-titles.md` + prompt rule "graphics untouched unless the crop pushed them out of the safe zone". Still open from that handoff: `sequence_overview` cannot list caption tracks (no ExtendScript surface; see 1b), and skills cannot be written from the panel (deliberate).
1c. **Deterministic framing, built 2026-09-05 afternoon from two panel-session notes** (`9x16-safe-zone-measurements.md` by Codex, `9x16-screen-recording-reframe-procedure.md` by Claude, both in the test project's analysis folder): `reframe` (one call; Premiere's own `autoReframeSequence` by default, polls `isDoneAnalyzingForVideoEffects`, graphics restored to the editor's placement, static fill as fallback, raw footage from a bin goes into a matching sequence first); `fit_region` (source region + target band -> position/scale by arithmetic in `src/frame.cjs`, applied, read back, CHECK); `find_on_screen` (frames sampled, text read by `bin/ocr`, a 90 KB Swift helper built from `src/ocr.swift` with `swiftc -O -o bin/ocr src/ocr.swift -framework Vision -framework AppKit; codesign -s - bin/ocr`; Apple Silicon build, rebuild when Swift/macOS changes); `clip_transforms` reports source size and the visible source rectangle; `list_analysis` marks RULE files and prints their first line; post-condition CHECK lines in set_sequence_size, cuts, nudge_clip. None of it has run inside Premiere yet: the dev-panel test is "make it 4:5" (Auto Reframe path) and the screen-recording case ("find where it says Codex, fit the panel in the upper band").
1b. **Caption band position: decoded and writable through the project file (commit 3ffb487), verified live on a small project (the reopen works but drops Premiere to its Home screen while the project reloads, so it is NOT registered as a tool and not in 0.1.69).** Closed routes: QE DOM exposes no caption tracks (enumerated live 2026-09-05); TTML/DFXP import ignores region positions (tested live with `position-probe.xml`, captions landed at the default). Open routes: (a) track styles carry the position field (the track's template style decodes to the same zone/offset/size), so if a project's default track style is inherited by new caption tracks, `create_captions` inherits placement: test by setting a moved default style then pressing the Captions button; (b) import-a-sequence variant: write the restyled captions into a temp copy of the project and `importSequences` that one sequence back, no reopen; unknown whether media items get duplicated. `caption_style` (y offset, size) rewrites every caption's FlatBuffers style block in the saved `.prproj` (fields by vtable slot: y = root/0/33/2 float, zone = root/0/5 int with 0 top 1 middle 2 bottom, size = root/0/0/[0]/1/1 float), then host `reloadProject` closes and reopens the same project. A/B fixture projects live outside the repo in the ASI-Evolve tests folder; `test/prproj.test.cjs` runs against them when present. First live test: on the dev panel say "move the captions down to the safe zone"; watch that the project reopens with the same sequence active and that host events still arrive afterwards (if `pendingChanges` stop or double, re-bind events after reload). Zone changes relayout the table and are not written.
2. **Review follow-ups** (see the last entry in `docs/codex-review-log.md`): `create_captions` stacks a new caption track per run (needs a replace-or-skip rule); the caption band position is a Premiere track setting the panel cannot script (document in how-to-use). A Codex pass over the 2026-09-05 review fixes themselves is still owed under the AGENTS.md rule for host-script changes.
3. **Speaker separation** (sherpa-onnx, models on first use) and **prosody** (port VO Studio's per-word RMS/pitch/pause from `vo_engine/audio_prosody.py` to JS, summaries not raw numbers) so `list_analysis` files can carry them; the "metadata first" rule already reads whatever is there.
4. **B-roll analysis**: cheap motion/brightness pass from frame differencing, Apple Vision optical flow later (Swift helper).
5. **Codex in the panel**: test on the dev panel (agent dropdown, `codex login` present): a chat turn, a tool call, a second turn, an image attachment, Stop mid-turn. Then a Codex-specific pass over the rulebook voice (the system prompt was tuned against Claude). Codex has no subagents, so long transcripts are read by the main model.
6. **After Effects panel** (README promises it).
7. **ZXP signing** to drop the PlayerDebugMode requirement.
8. **(Different repo: premiere-map, not this one.)** Round 248 rev 6 is written in the ASI-Evolve harness and unclicked; write-up pending. Only pick this up if the user asks. See `~/DevApps/premiere-map/docs/handoff.md`.

## Known Issues

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
gh auth status                          # must show dandjlab-cell before any release
claude --version                        # CLI present (the panel also accepts the desktop app's login)
node --test test/*.test.cjs            # 75-76 pass; one whisper test skips offline; privacy.test.cjs scans the tree
sh scripts/install.sh                   # also installs the pre-push privacy hook
# release: bump CSXS/manifest.xml AND package.json to X.Y.Z, then
sh scripts/package.sh && gh release create vX.Y.Z dist/ClaudeForAdobe-X.Y.Z.zip dist/ClaudeForAdobe.zip --title "Claude for Adobe X.Y.Z" --notes "..."
```

Requirements on the Mac: Apple Silicon, Premiere 25+, Claude desktop app signed in (Claude Code opened once) or the CLI; `gh` authenticated as dandjlab-cell for releases. No API keys anywhere; Claude runs under the user's own login.
