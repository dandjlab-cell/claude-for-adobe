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
