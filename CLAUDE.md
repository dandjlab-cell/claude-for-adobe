# CLAUDE.md — Claude for Adobe

> # 🟥 BEFORE YOU MEASURE, PROBE, OR BUILD ANYTHING
>
> **Read `docs/findings-index.md` first, and grep it before running any experiment.**
>
> It is one line per established fact, with **what each one forecloses**. It exists because on
> 2026-09-17 a session spent an evening re-deriving a finding that was three days old, then rebuilt a
> component that had already been built and cancelled for a stated reason — both recorded, both in the
> 478-line `docs/handoff.md`, neither findable.
>
> This is the same rule the sibling repo `premiere-map` puts at the top of its own instructions: *do not
> grep prose for orientation.* The index is the orientation surface. `docs/handoff.md` is the
> state-of-the-world; read it second, for what is in flight.

---

## What this is

A public, MIT-licensed Premiere Pro CEP panel that runs the editor's own Claude Code or Codex inside
Premiere. Deterministic panel tools do the work and print CHECK lines; the model routes and relays. Users
install a zip and it self-updates from GitHub Releases.

## Hard rules

**Privacy — non-negotiable, and enforced by the suite and a pre-push hook.**
- No absolute home paths in tracked files. Not in docs, not in review transcripts pasted from other tools.
  `node --test test/privacy.test.cjs` catches it; it caught a committed review on 2026-09-17.
- The test project's path, its sequence names and the analysis folder are **not** in this repo. They live
  in the private memory note `project_claude_for_adobe_test_project.md`, read by absolute path.
- Describe the test footage, never name the client or the project.

**Releases and pushes.**
- `git push` and `gh release create` need the owner's explicit go, each time. A previous "go ahead" does
  not carry over.
- Before any release: bump `CSXS/manifest.xml` **and** `package.json` (package.sh refuses a mismatch),
  `npm test`, `sh scripts/package.sh`, then **unzip the built zip and grep it for the change you just
  made**. Two releases shipped broken from a chain that failed silently.
- Releases are irreversible in practice — a public push is cached and indexed.

**Two panels exist.** The dev extension loads from this repo and logs `dev <sha>`; the installed one
updates from releases and logs `installed <version>`. Testing the wrong one wastes the run — the log line
says which. **The dev panel caches `panel.js` and `src/*.cjs` at load: after any code change it must be
reloaded** (the header button) or the change is not live.

**Anything that changes what the grade writes gets measured first.** Two changes were reverted on
2026-09-17 for being reasoned instead of swept. Both came back the same evening once the measurement
existed. The sweeps live in `src/lumetri_sweeps.json`, each block carrying its own provenance — and the
numbers there are the authority, not the prose in `docs/`.

**Sandbox only.** Grade tools work on a duplicated `<name> [AI]` sequence. Anything that touches a source
setting (colour-space override, Interpret Footage) **survives Discard** and must be asked about first.

## Where things are

| | |
|---|---|
| `docs/findings-index.md` | **Start here.** Established facts and what they foreclose. |
| `docs/handoff.md` | Session state, what is in flight, the archive of how each thing was found. |
| `src/lumetri_sweeps.json` | Live calibration data. Every block has `_source`; recent ones state their form, caveats and negative results. |
| `docs/color-control-map.md` | Per-control detail: what is measured, what is not. |
| `docs/color-full-table-plan.md` | The measurement programme, revision 2. |
| `src/forward.cjs` | The forward model — apply a control to pixels, then measure. |
| `.claude/skills/premiere-scripting/surface-26.3.2.md` | Premiere's scripting surface for this version. |
| `.claude/skills/color/` | The colorist canon the pass follows, and its sources. |
| Panel log | `~/Library/Logs/claude-for-adobe/panel-<date>.log` |

## Working with the panel

The panel runs its own Claude session inside Premiere. It appears in `ListAgents` as
`com-claude-for-adobe-premiere-dev-*` and can be driven with `SendMessage` — it runs the tools and reports
raw output back. That is the sanctioned door for live measurement; do not try to reach the panel's MCP
server directly (its bearer token exists precisely to stop that) and do not drive the UI.

Ask it for **raw tool output, never a summary**, and tell it to report anything that contradicts what you
said you expected. On 2026-09-17 it caught four separate errors in briefs it was given, including a
degenerate fit method that invalidated earlier work.

## Style

Commit messages say what the round **established**, not what was touched. One commit per unit of work.
Stage files by name. Record negative results — `satRolloffBlacks` is a block whose whole content is "this
control does nothing to the black end", and it closed a line of enquiry.
