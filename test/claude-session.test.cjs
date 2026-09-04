const test = require("node:test");
const assert = require("node:assert/strict");
const { availableModels, buildArgs, fallbackModels, reduceStreamEvent, DISALLOWED_TOOLS } = require("../src/claude-session.cjs");

test("reduceStreamEvent maps stream-json lines to panel events", () => {
  assert.deepEqual(reduceStreamEvent({ type: "system", subtype: "init", session_id: "s1", model: "m" }), { kind: "ready", sessionId: "s1", model: "m" });
  assert.deepEqual(reduceStreamEvent({ type: "assistant", message: { content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "hi" }] } }), { kind: "batch", events: [{ kind: "text", text: "hi" }] });
  assert.deepEqual(reduceStreamEvent({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__premiere__run_extendscript", input: { code: "1" } }] } }),
    { kind: "batch", events: [{ kind: "tool_use", id: "t1", name: "mcp__premiere__run_extendscript", input: { code: "1" } }] });
  assert.equal(reduceStreamEvent({ type: "assistant", message: { content: [{ type: "thinking", thinking: "x" }] } }), null);
  assert.deepEqual(reduceStreamEvent({ type: "result", is_error: true, result: "bad", total_cost_usd: 0.1, session_id: "s1" }), { kind: "turn_done", isError: true, text: "bad", costUsd: 0.1, sessionId: "s1", modelsUsed: [] });
  assert.deepEqual(reduceStreamEvent({ type: "result", is_error: false, total_cost_usd: 0.2, session_id: "s1", modelUsage: { "claude-sonnet-5": {} } }).modelsUsed, ["claude-sonnet-5"]);
  assert.deepEqual(reduceStreamEvent({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "He" } } }), { kind: "delta", text: "He" });
  assert.equal(reduceStreamEvent({ type: "stream_event", event: { type: "content_block_start" } }), null);
  assert.equal(reduceStreamEvent({ type: "rate_limit_event" }), null);
  assert.equal(reduceStreamEvent(null), null);
});

test("buildArgs locks Claude to the premiere MCP tool only", () => {
  const args = buildArgs({ model: "m", mcpConfigPath: "/tmp/c.json", systemPrompt: "sp", resumeSessionId: "s9" });
  assert.ok(args.includes("--strict-mcp-config"));
  assert.equal(args[args.indexOf("--allowedTools") + 1], "mcp__premiere__*");
  assert.equal(args[args.indexOf("--disallowed-tools") + 1], DISALLOWED_TOOLS.join(","));
  assert.equal(args[args.indexOf("--resume") + 1], "s9");
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  assert.ok(!buildArgs({ model: "m", mcpConfigPath: "/tmp/c.json", systemPrompt: "sp" }).includes("--resume"));
});

test("buildArgs asks the CLI to fall back down the model tiers", () => {
  assert.deepEqual(fallbackModels("claude-opus-5"), ["claude-sonnet-5", "claude-haiku-4-5"]);
  assert.deepEqual(fallbackModels("claude-haiku-4-5"), []);
  const args = buildArgs({ model: "claude-fable-5-1", mcpConfigPath: "/tmp/c.json", systemPrompt: "sp" });
  assert.equal(args[args.indexOf("--fallback-model") + 1], "claude-opus-5,claude-sonnet-5,claude-haiku-4-5");
  assert.equal(buildArgs({ model: "claude-haiku-4-5", mcpConfigPath: "/tmp/c.json", systemPrompt: "sp" }).includes("--fallback-model"), false);
});

test("availableModels mirrors the CLI picker: extras, entitlement, org default", () => {
  const withFable = availableModels({ additionalModelOptionsCache: [{ value: "claude-fable-5-1[1m]", label: "Fable", description: "Fable 5.1 \u00b7 Most capable" }] });
  assert.deepEqual(withFable.models.map((m) => m.value), ["claude-fable-5-1", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]);
  assert.equal(withFable.models[0].label, "Fable 5.1");
  assert.equal(withFable.defaultModel, "claude-opus-5");
  const proOnly = availableModels({ modelAccessCache: [{ apiName: "claude-opus-5", entitled: false }] });
  assert.deepEqual(proOnly.models.map((m) => m.label), ["Sonnet 5", "Haiku 4.5"]);
  assert.equal(proOnly.defaultModel, "claude-sonnet-5");
  assert.equal(availableModels({ orgModelDefaultCache: { name: "claude-haiku-4-5" } }).defaultModel, "claude-haiku-4-5");
  assert.equal(availableModels(null).models.length, 3);
});

test("writeMcpConfig carries the bearer token and is private to the user", () => {
  const fs = require("node:fs");
  const { writeMcpConfig } = require("../src/claude-session.cjs");
  const file = writeMcpConfig("http://127.0.0.1:1/mcp", "tok");
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(cfg.mcpServers.premiere.headers.Authorization, "Bearer tok");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.unlinkSync(file);
});
