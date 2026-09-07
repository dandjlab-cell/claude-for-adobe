const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createJsonLineParser } = require("./core.cjs");

const MCP_SERVER_NAME = "premiere";
const DEFAULT_MODEL = "claude-opus-5";
// Everything except our MCP tool. Claude runs headless inside Premiere; it must not touch the filesystem or shell.
const DISALLOWED_TOOLS = ["Bash", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch",
  "NotebookEdit", "EnterPlanMode", "ExitPlanMode", "AskUserQuestion", "TodoWrite", "TaskCreate", "TaskUpdate"]; // Skill stays: skills are the panel's repeatable recipes (.claude/skills)

// The Claude desktop app keeps a native CLI per version under its support folder; newest version wins.
function desktopAppClaude() {
  const dir = path.join(os.homedir(), "Library", "Application Support", "Claude", "claude-code");
  try {
    const versions = fs.readdirSync(dir).filter((v) => /^\d+\.\d+\.\d+$/.test(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return versions.reverse().map((v) => path.join(dir, v, "claude.app", "Contents", "MacOS", "claude"));
  } catch (_) { return []; }
}

const CLAUDE_CANDIDATES = [
  process.env.CLAUDE_PATH,
  path.join(os.homedir(), ".local", "bin", "claude"),
  path.join(os.homedir(), ".claude", "local", "claude"),
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  ...desktopAppClaude(),
].filter(Boolean);

function findClaude(candidates = CLAUDE_CANDIDATES) {
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Claude Code CLI not found. Install it (https://claude.com/claude-code) or set CLAUDE_PATH.");
  return found;
}

// One rulebook for every agent: Claude gets this as its system prompt, Codex reads it from AGENTS.md
// (src/codex-session.cjs), and both load the same .claude/skills files.
function buildSystemPrompt(capabilities = "", agentName = "Claude") {
  return [
    ...(capabilities ? ["Right now on this Mac: " + capabilities] : []),
    "You are " + agentName + ", an editor's colleague working inside Adobe Premiere Pro 2026 as a panel. Panel tools first; ExtendScript only for what no tool covers.",
    "Read the message header first. SOURCE: a Project panel selection means build from it, otherwise the open sequence; say which in your first line. Cuts, silences, captions, frame size and b-roll act on the open sequence, never on a sequence found in a bin; a selected bin scopes inspection and organizing. Ask which only when a bin is selected and the request says 'this' with no noun. Frame: on MISMATCH, fix the frame first (set_sequence_size, fill) or ask which frame. A bracketed list of timeline changes is what the editor did between turns.",
    "Rules that hold on every turn:",
    "- Plan first, visibly. Before more than two tool calls or any timeline change, one message: the source, the numbered steps naming their tools, what stays untouched. Then start in the same turn; the plan is not a permission request. Deviations in one line each, never a re-post.",
    "- Act, don't ask when the right execution is obvious. Ask only for the editor's calls: what to keep, story order, a name, anything destructive with no checkpoint. Never ask permission for what the panel protects (duplicate sequence, checkpoints, undo).",
    "- Report what CHECK says. Never claim success over a CHECK FAIL, never claim a result a tool did not verify.",
    "- A tool error is reported in one line, then you stop. Never search for what it could not find with run_extendscript, never retry with a guess, never rebuild a tool's job by hand or by script.",
    "- Never edit the original sequence: the panel works on the '<name> [Claude]' copy and says when it made it; mention it.",
    "- Never work out by eye or by guessing what a tool computes: where a phrase is, talking head vs b-roll, what covers what, cut points, placement.",
    "- Never guess that something does not exist. Re-read live state (project_bins, sequence_overview); anything read from the saved project file needs 'Press Cmd+S and ask again.'",
    "- Long jobs return 'started' and the panel tells you when they finish; never poll or repeat the call.",
    "- Read only the project's analysis folder; anything longer than a screen goes to a subagent that returns one line with timecodes. list_analysis first: files it marks RULE are this project's rules, returned in full.",
    "- A RHYTHM block in a tool result is work to do in the same turn, not a note.",
    "- Every edit is Cmd+Z steps (one per API call or extracted range) or the file checkpoint the tool result names; say which and how many.",
    "Procedure lives in the skills. When a request matches one, load it with the Skill tool and follow it step by step:",
    "- edit-footage: any cut or assembly from footage, a bin or clips, including 'make this a 9:16 video'.",
    "- reframe: a shape change or framing check on an open timeline is ONE reframe call, no skill needed first; load the skill for a named action ('make sure they see the dropdown') or when a graphic looks wrong after.",
    "- cut-silences: silences, gaps, pauses, dead air. organize-project: bins. how-to-use: 'what can you do', and bug reports.",
    "- premiere-scripting: before any ExtendScript, and before deciding how a job is done (mechanisms.md lists Premiere's own features by job; the ones a panel cannot trigger are the editor's click, named with their key).",
    "Voice: a fellow editor at the timeline, not an assistant and not a programmer. Clips, tracks, in and out points, timecode as m:ss. One to three short sentences per reply; a plan can be a few lines. No preamble, no recap, no apologies, no headers, no bullet lists unless comparing options, no code or API names in prose. Say what you changed, where, and how to undo it, then stop.",
  ].join("\n");
}

// Models this account can use, from the same cache the CLI's /model picker reads (~/.claude.json).
// Base tiers are always offered; additionalModelOptionsCache adds granted extras (e.g. Fable);
// modelAccessCache entries with entitled=false remove a model; orgModelDefaultCache picks the default.
const BASE_MODELS = [
  { value: "claude-opus-5", label: "Opus 5" },
  { value: "claude-sonnet-5", label: "Sonnet 5" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
];
function availableModels(claudeJson) {
  const j = claudeJson && typeof claudeJson === "object" ? claudeJson : {};
  const extras = (Array.isArray(j.additionalModelOptionsCache) ? j.additionalModelOptionsCache : [])
    .filter((o) => o && typeof o.value === "string" && !o.disabled)
    .map((o) => ({ value: o.value.replace(/\[1m\]$/, ""), label: String(o.description || o.label || o.value).split(" \u00b7 ")[0].trim() || o.value }));
  const denied = new Set((Array.isArray(j.modelAccessCache) ? j.modelAccessCache : []).filter((m) => m && m.entitled === false && typeof m.apiName === "string").map((m) => m.apiName.replace(/\[1m\]$/, "")));
  const seen = new Set();
  const models = [...extras, ...BASE_MODELS].filter((m) => !denied.has(m.value) && !seen.has(m.value) && seen.add(m.value));
  // Rank by capability tier; unknown extras first (they are granted upgrades).
  const rank = (v) => { const i = MODEL_TIERS.indexOf(v); return i < 0 ? -1 : i; };
  models.sort((a, b) => rank(a.value) - rank(b.value));
  const org = j.orgModelDefaultCache && typeof j.orgModelDefaultCache.name === "string" ? j.orgModelDefaultCache.name.replace(/\[1m\]$/, "") : null;
  const defaultModel = (org && models.find((m) => m.value === org)) ? org : (models.find((m) => m.value === DEFAULT_MODEL) ? DEFAULT_MODEL : (models[0] ? models[0].value : DEFAULT_MODEL));
  return { models, defaultModel };
}
function readClaudeJson() { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude.json"), "utf8")); } catch (_) { return {}; } }

// Tier order. When the chosen model is unavailable on the account (or overloaded), the CLI tries the next tiers.
const MODEL_TIERS = ["claude-fable-5-1", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];
const fallbackModels = (model) => { const i = MODEL_TIERS.indexOf(model); return i >= 0 ? MODEL_TIERS.slice(i + 1) : MODEL_TIERS.slice(2); };

function buildArgs({ model, mcpConfigPath, systemPrompt, resumeSessionId, readPaths = [] }) {
  const fallback = fallbackModels(model);
  // Read is allowed only inside the analysis folders the panel writes; in dontAsk mode everything else is denied.
  const allowed = ["mcp__" + MCP_SERVER_NAME + "__*", ...readPaths.map((p) => "Read(//" + String(p).replace(/^\/+/, "") + "/**)")];
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--verbose",
    "--model", model,
    ...(fallback.length ? ["--fallback-model", fallback.join(",")] : []),
    "--permission-mode", "dontAsk",
    "--allowedTools", allowed.join(","),
    "--disallowed-tools", DISALLOWED_TOOLS.join(","),
    "--mcp-config", mcpConfigPath,
    "--strict-mcp-config",
    "--setting-sources", "project",
    "--include-partial-messages",
    // A long editing session must never die at the context limit: auto-compaction on, whatever the user's own
    // settings say (this flag overrides settings.json for this invocation only).
    "--settings", JSON.stringify({ autoCompactEnabled: true }),
    "--system-prompt", systemPrompt,
  ];
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  return args;
}

function writeMcpConfig(mcpUrl, mcpToken) {
  const file = path.join(os.tmpdir(), "claude-for-adobe-mcp-" + process.pid + "-" + Date.now().toString(36) + ".json");
  const server = { type: "http", url: mcpUrl, ...(mcpToken ? { headers: { Authorization: "Bearer " + mcpToken } } : {}) };
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: server } }), { mode: 0o600 });
  return file;
}

// Reduces one stream-json line to a panel event, or null. Pure; tested.
function reduceStreamEvent(message) {
  if (!message || typeof message !== "object") return null;
  if (message.type === "system" && message.subtype === "init") return { kind: "ready", sessionId: message.session_id, model: message.model };
  if (message.type === "stream_event" && message.event && message.event.type === "content_block_delta" && message.event.delta && message.event.delta.type === "text_delta") {
    return { kind: "delta", text: message.event.delta.text };
  }
  if (message.type === "assistant" && message.message && Array.isArray(message.message.content)) {
    const events = message.message.content.map((block) => {
      if (block.type === "text" && block.text) return { kind: "text", text: block.text };
      if (block.type === "tool_use") return { kind: "tool_use", id: block.id, name: block.name, input: block.input };
      return null;
    }).filter(Boolean);
    return events.length ? { kind: "batch", events } : null;
  }
  if (message.type === "result") {
    return { kind: "turn_done", isError: !!message.is_error, text: message.is_error ? String(message.result || message.error || "") : "", costUsd: message.total_cost_usd, sessionId: message.session_id, modelsUsed: Object.keys(message.modelUsage || {}) };
  }
  return null;
}

// stream-json user turn. `images` = [{ mediaType, data (base64) }] become image blocks before the text.
function userMessage(text, images = []) {
  const blocks = images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.data } }));
  const content = blocks.length ? [...blocks, { type: "text", text: String(text) }] : String(text);
  return { type: "user", message: { role: "user", content } };
}


function createClaudeSession(options) {
  const { mcpUrl, mcpToken, onEvent, model = DEFAULT_MODEL, cwd = os.tmpdir(), claudePath = findClaude(), resumeSessionId, capabilities = "", readPaths = [] } = options;
  const mcpConfigPath = writeMcpConfig(mcpUrl, mcpToken);
  const args = buildArgs({ model, mcpConfigPath, systemPrompt: buildSystemPrompt(capabilities), resumeSessionId, readPaths });
  // Tool calls may run long (a transcription, hundreds of extracts): give them up to an hour before the CLI gives up.
  // ENABLE_TOOL_SEARCH=false: every panel tool is loaded up front, so the first turn never spends a round trip on
  // ToolSearch (the CLI defers large tool lists by default; the panel's list is small enough to send whole).
  const env = { ...process.env, MCP_TOOL_TIMEOUT: "3600000", MCP_TIMEOUT: "60000", CLAUDE_CODE_SUBAGENT_MODEL: "claude-haiku-4-5", ENABLE_TOOL_SEARCH: "false", PATH: [path.dirname(claudePath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].join(":") };
  const child = spawn(claudePath, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  let sessionId = resumeSessionId || null;
  let busy = false;
  let stderr = "";

  const parser = createJsonLineParser(
    (message) => {
      const event = reduceStreamEvent(message);
      if (!event) return;
      const emit = (e) => {
        if (e.kind === "ready" || e.kind === "turn_done") sessionId = e.sessionId || sessionId;
        if (e.kind === "turn_done") busy = false;
        onEvent(e);
      };
      if (event.kind === "batch") event.events.forEach(emit); else emit(event);
    },
    (line) => onEvent({ kind: "log", text: "unparsed: " + line.slice(0, 200) }),
  );
  child.stdout.on("data", (chunk) => parser.push(chunk));
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); onEvent({ kind: "log", text: String(chunk).trim() }); });
  child.on("error", (error) => onEvent({ kind: "exit", code: null, text: error.message }));
  child.on("exit", (code) => {
    busy = false;
    try { fs.unlinkSync(mcpConfigPath); } catch (_) {}
    onEvent({ kind: "exit", code, text: code ? stderr.trim() : "" });
  });

  return {
    get sessionId() { return sessionId; },
    get busy() { return busy; },
    send(text, images) {
      if (busy) throw new Error("Claude is still working on the previous message.");
      busy = true;
      child.stdin.write(JSON.stringify(userMessage(text, images)) + "\n");
    },
    // Graceful: SIGTERM, SIGKILL after 250ms, resolves once the process is gone (max 1s).
    stop() {
      return new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode) return resolve();
        const done = () => { clearTimeout(kill); clearTimeout(give); resolve(); };
        child.once("exit", done);
        const kill = setTimeout(() => { try { child.kill("SIGKILL"); } catch (_) {} }, 250);
        const give = setTimeout(done, 1000);
        try { child.stdin.end(); child.kill("SIGTERM"); } catch (_) {}
      });
    },
  };
}

module.exports = { userMessage, writeMcpConfig, BASE_MODELS, MODEL_TIERS, availableModels, fallbackModels, readClaudeJson, DEFAULT_MODEL, DISALLOWED_TOOLS, MCP_SERVER_NAME, buildArgs, buildSystemPrompt, createClaudeSession, findClaude, reduceStreamEvent };
