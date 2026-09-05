# Agent notes for this repo

Start with `docs/handoff.md` (current state, next actions, watch-outs) and `README.md`. The behaviour Claude shows
inside the panel is specified in `src/claude-session.cjs` (system prompt) and `.claude/skills/*/SKILL.md`.

Rules that hold:
- Do not edit `test/guards.test.cjs` except to record a deliberate policy change (see the header comment there).
- Keep edits, tests (`node --test test/*.test.cjs`), and publishing as separate steps. Never publish from a chain
  that can fail silently; `test/host.test.cjs` guards the host script's export table.
- Versions live in `CSXS/manifest.xml` and `package.json` and must match; `scripts/package.sh` refuses otherwise.
- Anything touching the installer, updater, or host script gets an independent review first (`docs/codex-review-log.md`).
- No client names, personal paths, or keys in the tree. Analysis files go next to the user's project, never in the repo.
