# claude-for-adobe — working agreement

A personal CEP panel for chatting with Claude Code (and later Codex) inside Adobe Premiere Pro 2026.

**Read `SPEC.md` before writing anything.** It names the reference implementation, the four ways
Premiere differs from After Effects, and the milestone order.

## Reference implementation

An After Effects sibling panel (separate, private repo) is the same product for After Effects, and it
works. Port it. Match its structure, naming, and test style. Deviate only where `SPEC.md` says
Premiere differs.

## Structure

```text
src/core.cjs         JSON-line parser, RPC peer, ExtendScript wrapper + guards
src/checkpoint.cjs   .prproj checkpoint create/list/revert (Premiere has no undo)
src/mcp-http.cjs     in-panel MCP server (JSON-RPC over HTTP) that Claude calls
src/claude-session.cjs  spawns the claude CLI with stream-json, system prompt
src/app-server.cjs   codex app-server session over JSON-RPC (not built yet)
panel.js             chat UI
index.html
CSXS/manifest.xml
scripts/install.sh
scripts/probe-claude.cjs
test/*.test.cjs
```

## Style

- CommonJS, `.cjs` for Node sources.
- Two-space indent, double quotes, semicolons, `camelCase`.
- `node:test` + `node:assert/strict`. Run: `node --test test/*.test.cjs`.
- **No runtime dependencies.** Node built-ins only. The reference has zero; keep it that way.

## Hard rules

- **`test/guards.test.cjs` is not yours to edit.** It was written before the implementation, on
  purpose. If a test in it seems wrong, stop and explain why — do not change it to pass.
- **Never claim undo.** Premiere's ExtendScript DOM has no undo-group API (verified: zero hits for
  `beginUndoGroup|undoGroup|app.undo` across every shipped Premiere CEP extension). Mutations are
  protected by file checkpoints. UI text and docs must say "checkpoint".
- **Never touch `~/.codex`.** That is the real Codex login. The isolated home only symlinks
  `auth.json` out of it.
- Do not launch Premiere, install the extension, or modify anything outside this repository.
- Pin to `codex-cli 0.149.x` and fail closed on any other version, exactly as the reference does.
- If the spec is wrong or something is impossible, **say so and stop**. Do not invent a workaround
  and carry on quietly. A surfaced blocker is worth more than a silent guess.

## Definition of done for a milestone

1. `node --test test/*.test.cjs` passes with no skips.
2. `node --check` passes on every `.js`/`.cjs` file you touched.
3. No file outside this repo was modified.
4. You can state, in one sentence per item, what you did and what you did not do.
