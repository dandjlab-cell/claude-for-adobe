# Codex Review Log

Independent security and privacy review of this repository by the `codex` CLI (OpenAI), iterated until approval.

## Round 1 (2026-09-04)

Verdict: NOT APPROVED. 1 CRITICAL, 4 HIGH, 3 MEDIUM, 2 LOW.

| # | Severity | Finding | Response |
|---|---|---|---|
| C1 | CRITICAL | run_extendscript guard is regex + shadowing; `this.File`, aliases, escapes bypass it | Guard rewritten: receiver-agnostic hard rejections (save/export/quit/open, File/Folder/Socket/system/$/XML, eval/Function/constructor/callee/with, `this`, unicode escapes, preprocessor directives). Read-only is now proven by allowlist (no assignments, no delete, allowlisted call names, no computed non-numeric index). Anything not provably read-only requires a Run/Don't run click in the panel before it executes. |
| H1 | HIGH | MCP server accepts any local POST | Per-session bearer token (24 random bytes) required; requests with an Origin header, wrong path, or non-JSON content type are refused; mcp-config file written 0600; 4 MB body cap. |
| H2 | HIGH | "local-only" claim misleading | README now states what Claude reads is sent to Anthropic under the user's own Claude Code login. |
| H3 | HIGH | Updater could rsync --delete a dev checkout | Refuses symlinked roots, roots containing .git, and roots whose manifest is not this bundle id. |
| H4 | HIGH | Bundled licences not shipped; Adobe schema redistributed | `licenses/` ships upstream MIT/Apache texts; Adobe schema removed from the repo and the zip (tests fetch it at run time or skip). |
| M1 | MEDIUM | Updater fails open without digest; redirects unbounded; no archive containment | Digest now mandatory; asset name must match `ClaudeForAdobe-x.y.z.zip`; downloads only from GitHub hosts with 5-hop limit; unpacked tree rejected if it contains symlinks or non-file entries; bundle id checked; backup restored if the sync fails. |
| M2 | MEDIUM | Commit author email, author name in LICENSE, private project names in docs | History rewritten to the GitHub noreply identity; LICENSE holder is the GitHub account; SPEC.md removed; README/AGENTS/comments scrubbed. |
| M3 | MEDIUM | PlayerDebugMode is global; quarantine cleared recursively | Documented in README (scoped to the panel folder; ZXP signing would remove the need). |
| L1 | LOW | Whisper cache unencrypted, no cleanup | Follow-up. |
| L2 | LOW | README remove path wrong; package.json probe script wrong | Fixed. |

Status after Round 1: all CRITICAL/HIGH addressed in commit "Security pass after independent review"; sending Round 2.

## Round 2 (2026-09-04)

Verdict: NOT APPROVED. C1 and H4 open; H1, H2, H3, L2 resolved; M1, M2, M3 partial; one new MEDIUM.

| # | Severity | Finding | Response |
|---|---|---|---|
| C1 | CRITICAL | Octal escapes in bracket strings (`["\163ave"]`) and saved function references (`var f = app.project.save; f()`) were classified read-only | Any `\u`, `\x`, or octal escape is rejected; sensitive names are rejected on *reference*, not only on call; `call`/`apply`/`bind` rejected; a bare call of anything but a known global makes the script non-read-only (needs the click). |
| H4 | HIGH | Adobe schema still in git history | History squashed to a single fresh commit; release tag moved. |
| M1 | MEDIUM | Containment only after extraction; substring bundle check; rollback unchecked | Archive listing (`zipinfo`) is checked for symlinks, absolute and parent paths before extraction; bundle id matched exactly; rollback result checked and reported. |
| M2 | MEDIUM | Private project names in comments and history | Comments scrubbed; history squashed. |
| M3 | MEDIUM | PlayerDebugMode global | Accepted and documented; ZXP signing is the follow-up. |
| L1 | LOW | Whisper cache plaintext | Follow-up. |
| NEW | MEDIUM | LICENSE file empty; acceptance-test header claimed immutability | LICENSE rewritten (MIT); test header now records the policy change and points here. |

Status after Round 2: fixes applied, history squashed, sending Round 3.

## Round 3 (2026-09-04)

Verdict: none. Codex ran its probes, then OpenAI's content filter stopped it before it wrote a verdict. Its probes stand as findings:

| # | Severity | Finding | Response |
|---|---|---|---|
| C1c | CRITICAL | `"sa"+""+"ve"` (three-part concatenation), comments between tokens (`save/*y*/()`, `name/*x*/=`), and `["exportAs"+""+"MediaDirect"]` were classified read-only | Comments are stripped before matching; any string concatenation is folded, including empty pieces; and the read-only (auto-run) class now requires a script with no string literals, no comments, and no backslashes at all. Anything with a string in it waits for the click. |

Status after Round 3: fixes applied; Round 4 (final under the 4-round cap).

## Round 4 (2026-09-04, final under the 4-round cap)

Verdict: NOT APPROVED on one item; all Round 2 resolutions re-verified; privacy confirmed clean (history 2 commits, no private terms, no local paths).

| # | Severity | Finding | Response |
|---|---|---|---|
| C1d | CRITICAL | Compound bitwise assignments (`|=`, `&=`, `^=`, `<<=`, `>>=`, `>>>=`) counted as read-only | Read-only now means: no assignment or increment of any operator except `var name = ...` declarations (comparisons excluded first), plus `mutating:false` is required for auto-run. Mutation patterns cover the bitwise operators too. |
| M | MEDIUM | `app.reflect` and `new Window` (Reflection / ScriptUI) not in the engine-object list | Added: reflect, Reflection, Window, ScriptUI, Palette, Dialog are rejected. |

Status after Round 4: fix applied and verified locally against the Round 4 strings. The 4-round cap is reached; a confirmation round is the maintainer's call.

## Release process and new tools review, Round 1 (2026-09-04, separate track)

Scope: the zip and installer as a first-time user receives them, the update path end to end, and the tools added today. Verdict: NOT APPROVED, 0 CRITICAL, 5 HIGH, 4 MEDIUM. Zip contents, binaries, skills, licences, manifest and first-launch dependencies verified clean.

| # | Severity | Finding | Response |
|---|---|---|---|
| H1 | HIGH | set_sequence_size assigned a number to videoFrameRate (a Time), fps-only calls computed reframe from 0x0, EvalScript error read as success | Frame rate set through `.seconds`; fps-only keeps the current size and skips reframe; all inside try; panel treats EvalScript error / empty as failure. |
| H2 | HIGH | place_broll passed seconds to overwriteClip (ticks expected); in/out not restored on error; audio muted but not trimmed | Time built with `new Time().seconds`, `.ticks` passed; project item in/out saved and restored in every path; linked audio trimmed to the duration and muted. |
| H3 | HIGH | extract_ranges did not union overlapping ranges | Ranges unioned before cutting. closeGaps behaviour left as is (validated on silence cuts; follow-up). |
| H4 | HIGH | Update overwrote the live extension before stopping Claude/MCP; no busy guard | Refuses while Claude is busy; stops the session and the server before files change; then installs and reloads. |
| H5 | HIGH | Project switch while busy never refreshed readPaths | Switch during a turn sets a flag; the session restarts (new read path) when the turn ends. |
| M1 | MEDIUM | Installer deleted the old install before copying; could delete its own source | Copies to a staging folder first, swaps, refuses to run from the installed copy. |
| M2 | MEDIUM | create_sequence scanned direct children only; settings failure reported as success | Nested walk; settings failure is an error. |
| M3 | MEDIUM | Version discipline manual | package.sh refuses to build when manifest and package.json versions differ. |
| M4 | MEDIUM | Duplicate-sequence protection is optional but stated unconditionally | When the option is off, Claude's instructions carry a warning and it must confirm before edits. |

Status: fixes applied; Round 2 requested.

## Release process and new tools review, Round 2 (2026-09-04)

Verdict: NOT APPROVED, one HIGH partial (H2), all others RESOLVED, one new MEDIUM.

| # | Severity | Finding | Response |
|---|---|---|---|
| H2 | HIGH (partial) | overwriteClip given ticks while Adobe's sample passes seconds; project-item in/out restore used undocumented forms | overlayClip now mirrors the sample: overwriteClip(item, seconds), no project-item marks touched; the placed clip's inPoint/end are set afterwards (each in its own try, reported if it fails); linked audio trimmed and muted. |
| NEW | MEDIUM | A failed update left the panel with no session and no server | On failure the panel reports and reloads itself on the restored version. |

Status: fixes applied; Round 3 requested.

## Release process and new tools review, Round 3 (2026-09-04)

Verdict: NOT APPROVED. H2 and the update-failure MEDIUM RESOLVED; one NEW HIGH: the Round 2 fix accidentally removed the `resizeSequence` function while its export remained, so the host script failed to load in 0.1.45 (all tools broken).

| # | Severity | Finding | Response |
|---|---|---|---|
| H6 | HIGH | resizeSequence deleted but still exported; host script throws at load | First restore attempt failed silently and 0.1.46 shipped broken as well. Restored properly in 0.1.47 (function extracted by brace matching from the 0.1.44 commit). New test (test/host.test.cjs) parses the host script, checks every exported name is defined, and checks every host call from panel.js has an export. Releases 0.1.45 and 0.1.46 deleted. |

Status: fix applied with a regression test; Round 4 (final) requested.

## Release process and new tools review, Round 4 (2026-09-04, final)

Verdict: **APPROVED**. resizeSequence defined once and exported; host script parses; all 21 exports resolve; all 20 host calls map; export and function sets match the known-good 0.1.44. One LOW (test did not check uniqueness or a baseline) addressed: the test now rejects duplicate definitions and a shrinking export table.

**Final status:** 0.1.47 is the release to use. 0.1.45 and 0.1.46 were withdrawn.

## Post-0.1.47 tools review (2026-09-05, Claude code-review, 15 verifier agents; not a Codex round)

Scope: everything added after 0.1.47 (snapshot_moments, frames_across, nudge_clip, place_broll, transcribe_timeline, create_captions, remove_fillers, set_sequence_size graphics-fit), the script guard, the updater, and a private-data scan. Verdict: NOT APPROVED as shipped; 15 findings, 12 confirmed. All fixed the same day (commit "review fixes"); to ship as 0.1.69 once the user has re-run the 4:5 reframe on the dev panel (host script and scale math changed).

| # | Severity | Finding | Response |
|---|---|---|---|
| 1 | CRITICAL | Personal and client paths in `docs/handoff.md` on the public repo | History rewritten (two commits squashed, force-pushed); specifics moved to a private memory note; `test/privacy.test.cjs` + `.githooks/pre-push` refuse home paths, drive paths, emails, and terms from `~/.claude-for-adobe-private-words` |
| 2 | HIGH | Captions button hangs forever without the Whisper model (prompt rendered into a detached node under the quiet card) | `askInline` always renders; the quiet card is set only after the prompt |
| 3 | HIGH | `create_captions` skipped the working copy; non-undoable caption track landed on the original | `ensureWorkingCopy()` before the checkpoint, like every other mutator |
| 4 | HIGH | Guard bypass: `app.project[unescape("%73ave")]()` and friends classed as non-mutating | Hard rejections for computed method calls (`](`) and string-building functions; six probes in `test/guards.test.cjs` |
| 5 | HIGH | QE `extract`/`razor`/`lift`/`rippleDelete`/`clone` not classed as mutating | Added to the mutation verb list; test |
| 6 | HIGH | `transcribe_timeline` ran whisper via `spawnSync` before the MCP reply; panel froze; completion nudge dropped while Claude was busy | whisper.cpp spawned async; the job starts from a timer; nudges queue until `turn_done` |
| 7 | HIGH | Graphics-fit scale multiplied the current scale by a normaliser that assumed the old fill factor; extension-based graphic split misclassified nested sequences and alpha titles | Scale set absolutely (`100 × min/max(newW/srcW, newH/srcH)`); `isGraphicItem` uses `isSequence()`, the Video Info "Alpha" flag, then extension |
| 8 | HIGH | `nudge_clip` without a track took the first V1 clip, moving the subject instead of the graphic | Multiple clips at that time now return an error naming them; schema and system prompt say to pass the track |
| 9 | MEDIUM | Sequence names with `/` or `:` broke transcript, mix and SRT paths | One `seqFile()` helper for all five sites |
| 10 | MEDIUM | Cut silences and Captions could run concurrently and both owned the quiet card | `beginButtonJob`/`endButtonJob` mutual exclusion; chat waits too |
| 11 | MEDIUM | Caption wrap ignored `max_lines` above 2; one-word cues overlapped | N-line balanced wrap; end clamped to the next cue's start; test |
| 12 | MEDIUM | `applyCuts` reported the batch size and ignored `extracted=X/Y … ERRORS` | Parses the host count and stops on errors |
| 13 | LOW | Stale `.mix.wav` reused when a re-export failed silently | Unlinked before every export |
| 14 | LOW | Motion position unit heuristic flipped to pixels past 1.5 | Threshold 4, shared `isNormalized` |
| 15 | LOW | Updater: `zipinfo` regex could miss `..` in names with spaces; double failure deleted the only backup | Names from `zipinfo -1`; on double failure the backup is kept next to the install and named in the error |

Not fixed (follow-ups): a new caption track is stacked on every `create_captions` run (no lifecycle); the prompt cannot move the caption band.
