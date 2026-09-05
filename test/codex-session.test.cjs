const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildCodexArgs, codexModels, prepareWorkspace, reduceCodexEvent, CODEX_NOTES } = require("../src/codex-session.cjs");
const { buildSystemPrompt } = require("../src/claude-session.cjs");

// Recorded from a real `codex exec --json` run against the panel's MCP server (2026-09-05).
const RECORDED = [
  { type: "thread.started", thread_id: "01a0716b-6fe5-7111-abe7-c8bd773d79ba" },
  { type: "turn.started" },
  { type: "item.started", item: { id: "item_0", type: "command_execution", command: "/bin/zsh -lc 'find /private/tmp -name AGENTS.md -print'", status: "in_progress" } },
  { type: "item.completed", item: { id: "item_0", type: "command_execution", command: "/bin/zsh -lc 'find /private/tmp -name AGENTS.md -print'", exit_code: 0, status: "completed" } },
  { type: "item.started", item: { id: "item_1", type: "mcp_tool_call", server: "premiere", tool: "ping", arguments: {}, result: null, error: null, status: "in_progress" } },
  { type: "item.completed", item: { id: "item_1", type: "mcp_tool_call", server: "premiere", tool: "ping", arguments: {}, result: { content: [{ type: "text", text: "pong-4242 from ping" }] }, error: null, status: "completed" } },
  { type: "item.completed", item: { id: "item_2", type: "agent_message", text: "pong-4242 from ping" } },
  { type: "turn.completed", usage: { input_tokens: 65530, cached_input_tokens: 51456, output_tokens: 416 } },
];

test("reduceCodexEvent maps the recorded stream to panel events", () => {
  const events = RECORDED.map(reduceCodexEvent).filter(Boolean);
  assert.deepEqual(events.map((e) => e.kind), ["ready", "log", "tool_use", "text", "turn_done"]);
  assert.equal(events[0].sessionId, "01a0716b-6fe5-7111-abe7-c8bd773d79ba");
  assert.equal(events[2].name, "mcp__premiere__ping");
  assert.equal(events[3].text, "pong-4242 from ping");
  assert.equal(events[4].isError, false);
  assert.equal(reduceCodexEvent({ type: "item.completed", item: { type: "mcp_tool_call", tool: "ping", status: "failed", error: { message: "MCP tool call requires approval, but approval policy is never" } } }).kind, "log");
  assert.equal(reduceCodexEvent({ type: "turn.failed", error: { message: "boom" } }).isError, true);
  assert.equal(reduceCodexEvent(null), null);
});

test("buildCodexArgs: read-only sandbox, tools auto-approved on the panel's server, prompt on stdin, resume before it", () => {
  const args = buildCodexArgs({ model: "gpt-6-astra", mcpUrl: "http://127.0.0.1:5/mcp", workDir: "/tmp/w", resumeSessionId: "abc", images: ["/tmp/w/i.png"] });
  assert.equal(args[0], "exec");
  assert.ok(args.includes("--json") && args.includes("--skip-git-repo-check") && args.includes("--ignore-user-config"));
  assert.equal(args[args.indexOf("-s") + 1], "read-only");
  assert.equal(args[args.indexOf("-m") + 1], "gpt-6-astra");
  assert.equal(args[args.indexOf("-C") + 1], "/tmp/w");
  assert.ok(args.includes('mcp_servers.premiere.url="http://127.0.0.1:5/mcp"'));
  assert.ok(args.includes('mcp_servers.premiere.bearer_token_env_var="PREMIERE_MCP_TOKEN"'));
  assert.ok(args.includes('mcp_servers.premiere.default_tools_approval_mode="approve"'));
  assert.ok(args.includes("mcp_servers.premiere.tool_timeout_sec=3600"));
  assert.equal(args[args.indexOf("-i") + 1], "/tmp/w/i.png");
  assert.deepEqual(args.slice(-3), ["resume", "abc", "-"]);
  assert.ok(!args.join(" ").includes("dangerously"));
  assert.equal(buildCodexArgs({ model: "m", mcpUrl: "u", workDir: "/w" }).includes("resume"), false);
});

test("codexModels: the catalog cache wins, review models are hidden, config.toml picks the default", () => {
  const cache = { models: [{ slug: "gpt-6-astra", display_name: "GPT-6-Astra" }, { slug: "codex-auto-review", display_name: "Auto" }, { slug: "gpt-5.6-luna", display_name: "GPT-5.6-Luna" }, { slug: "hidden", visible: false }] };
  const r = codexModels(cache, 'foo = 1\nmodel = "gpt-5.6-luna"\n');
  assert.deepEqual(r.models.map((m) => m.value), ["gpt-6-astra", "gpt-5.6-luna"]);
  assert.equal(r.defaultModel, "gpt-5.6-luna");
  assert.equal(codexModels(null, "").defaultModel, "gpt-6-astra");
  assert.equal(codexModels(null, 'model = "nope"').defaultModel, "gpt-6-astra");
});

test("prepareWorkspace writes the shared rulebook as AGENTS.md and links the same skills", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-codex-test-"));
  const skills = path.join(root, "skills"); fs.mkdirSync(path.join(skills, "reframe"), { recursive: true }); fs.writeFileSync(path.join(skills, "reframe", "SKILL.md"), "# r");
  const prompt = buildSystemPrompt("", "Codex") + "\n" + CODEX_NOTES;
  const dir = prepareWorkspace({ systemPrompt: prompt, skillsDir: skills, root });
  const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
  assert.match(agents, /^You are Codex running inside Adobe Premiere Pro/m);
  assert.match(agents, /Reframe order of operations/);
  assert.equal(fs.readFileSync(path.join(dir, ".agents", "skills", "reframe", "SKILL.md"), "utf8"), "# r");
  // Claude's prompt is the same text with the other name: one rulebook.
  assert.equal(buildSystemPrompt("", "Claude").replace("You are Claude", "You are Codex"), buildSystemPrompt("", "Codex"));
  fs.rmSync(root, { recursive: true, force: true });
});
