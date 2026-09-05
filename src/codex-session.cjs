// Codex as the agent behind the panel. Same seam as Claude: the panel's MCP server for tools, one rulebook
// (buildSystemPrompt) written to AGENTS.md in a private working folder, the same .claude/skills files linked
// in as .agents/skills. Codex's non-interactive mode is one process per turn (`codex exec`, then
// `codex exec ... resume <thread>`), streaming JSONL events; this module makes that look like the Claude session.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createJsonLineParser } = require("./core.cjs");
const { buildSystemPrompt, MCP_SERVER_NAME } = require("./claude-session.cjs");

const CODEX_CANDIDATES = [
  process.env.CODEX_PATH,
  "/opt/homebrew/bin/codex",
  "/usr/local/bin/codex",
  path.join(os.homedir(), ".codex", "bin", "codex"),
  path.join(os.homedir(), ".local", "bin", "codex"),
].filter(Boolean);
function findCodex(candidates = CODEX_CANDIDATES) {
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Codex CLI not found. Install it (npm i -g @openai/codex) and run `codex login`, or set CODEX_PATH.");
  return found;
}

const DEFAULT_CODEX_MODEL = "gpt-6-astra";
const BASE_CODEX_MODELS = [
  { value: "gpt-6-astra", label: "GPT-6 Astra" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
];
// Models from Codex's own catalog cache (~/.codex/models_cache.json); the default from ~/.codex/config.toml.
function codexModels(catalog, configToml) {
  const fromCache = catalog && Array.isArray(catalog.models)
    ? catalog.models.filter((m) => m && typeof m.slug === "string" && m.visible !== false && !/auto-review/.test(m.slug)).map((m) => ({ value: m.slug, label: m.display_name || m.slug }))
    : [];
  const models = fromCache.length ? fromCache : BASE_CODEX_MODELS;
  const m = /^\s*model\s*=\s*"([^"]+)"/m.exec(String(configToml || ""));
  const defaultModel = m && models.some((x) => x.value === m[1]) ? m[1] : (models.some((x) => x.value === DEFAULT_CODEX_MODEL) ? DEFAULT_CODEX_MODEL : models[0].value);
  return { models, defaultModel };
}
function readCodexCatalog() { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".codex", "models_cache.json"), "utf8")); } catch (_) { return null; } }
function readCodexConfig() { try { return fs.readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8"); } catch (_) { return ""; } }

const CODEX_NOTES = [
  "You are Codex, not Claude: there is no Agent tool and no Skill tool. The workflows are the SKILL.md files under .agents/skills in this folder (edit-footage, reframe, cut-silences, organize-project, how-to-use, premiere-scripting); read the matching one before starting a workflow, and premiere-scripting's reference.md and snippets.md before any ExtendScript.",
  "Where the rules say to hand a long file to a subagent, read it yourself and keep what you quote short. The shell is read-only and only for reading analysis files; never write files or run anything else. Every Premiere action goes through the premiere tools.",
].join("\n");

// Codex reads its instructions from AGENTS.md in the working folder and skills from .agents/skills there.
function prepareWorkspace({ systemPrompt, skillsDir, root = os.tmpdir() }) {
  const dir = path.join(root, "claude-for-adobe-codex-" + process.pid);
  fs.mkdirSync(path.join(dir, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(dir, "AGENTS.md"), systemPrompt + "\n", { mode: 0o600 });
  const link = path.join(dir, ".agents", "skills");
  try { fs.rmSync(link, { recursive: true, force: true }); } catch (_) {}
  if (skillsDir && fs.existsSync(skillsDir)) fs.symlinkSync(skillsDir, link);
  return dir;
}

// `-c` values are TOML: strings quoted, numbers bare. The prompt comes on stdin ("-" as the last argument).
function buildCodexArgs({ model, mcpUrl, workDir, resumeSessionId, images = [] }) {
  const c = (key, value) => ["-c", "mcp_servers." + MCP_SERVER_NAME + "." + key + "=" + value];
  // --ignore-user-config: the panel is self-contained; the user's own config.toml (its MCP servers, hooks) would
  // otherwise start on every turn (measured: 3 s of a 7 s turn). Login (auth.json) is separate and still used.
  const args = [
    "exec", "--json", "--skip-git-repo-check", "--ignore-user-config", "-s", "read-only", "-C", workDir, "-m", model,
    ...c("url", JSON.stringify(mcpUrl)),
    ...c("bearer_token_env_var", "\"PREMIERE_MCP_TOKEN\""),
    ...c("default_tools_approval_mode", "\"approve\""),
    ...c("tool_timeout_sec", "3600"),
    ...images.flatMap((f) => ["-i", f]),
  ];
  if (resumeSessionId) args.push("resume", resumeSessionId);
  args.push("-");
  return args;
}

// One JSONL event -> panel event (same kinds as the Claude session), or null. Pure; tested.
function reduceCodexEvent(m) {
  if (!m || typeof m !== "object") return null;
  const item = m.item || {};
  if (m.type === "thread.started") return { kind: "ready", sessionId: m.thread_id };
  if (m.type === "item.started" && item.type === "mcp_tool_call") return { kind: "tool_use", id: item.id, name: "mcp__" + item.server + "__" + item.tool, input: item.arguments || {} };
  if (m.type === "item.started" && item.type === "command_execution") return { kind: "log", text: "codex shell: " + item.command };
  if (m.type === "item.completed") {
    if (item.type === "agent_message" && item.text) return { kind: "text", text: item.text };
    if (item.type === "error") return { kind: "log", text: "codex: " + item.message };
    if (item.type === "mcp_tool_call" && item.status === "failed") return { kind: "log", text: "codex tool " + item.tool + " failed: " + (item.error && item.error.message) };
    return null;
  }
  if (m.type === "turn.completed") return { kind: "turn_done", isError: false, text: "", usage: m.usage || null };
  if (m.type === "turn.failed" || m.type === "error") return { kind: "turn_done", isError: true, text: (m.error && m.error.message) || m.message || "Codex error" };
  return null;
}

function createCodexSession(options) {
  const { mcpUrl, mcpToken, onEvent, model = DEFAULT_CODEX_MODEL, resumeSessionId, capabilities = "", skillsDir, codexPath = findCodex() } = options;
  const workDir = prepareWorkspace({ systemPrompt: buildSystemPrompt(capabilities, "Codex") + "\n" + CODEX_NOTES, skillsDir });
  const env = { ...process.env, PREMIERE_MCP_TOKEN: mcpToken, PATH: [path.dirname(codexPath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].join(":") };
  let sessionId = resumeSessionId || null;
  let busy = false;
  let child = null;
  setTimeout(() => onEvent({ kind: "ready", sessionId, model }), 0);

  return {
    get sessionId() { return sessionId; },
    get busy() { return busy; },
    send(text, images = []) {
      if (busy) throw new Error("Codex is still working on the previous message.");
      busy = true;
      const files = images.map((img, i) => {
        const f = path.join(workDir, "image-" + Date.now().toString(36) + "-" + i + (/png/.test(img.mediaType) ? ".png" : ".jpg"));
        fs.writeFileSync(f, Buffer.from(img.data, "base64"));
        return f;
      });
      const args = buildCodexArgs({ model, mcpUrl, workDir, resumeSessionId: sessionId, images: files });
      let stderr = "", turnDone = false;
      const finish = (event) => { if (turnDone) return; turnDone = true; busy = false; onEvent({ ...event, sessionId, modelsUsed: [model] }); };
      const parser = createJsonLineParser(
        (message) => {
          const event = reduceCodexEvent(message);
          if (!event) return;
          if (event.kind === "ready") { sessionId = event.sessionId || sessionId; return; }
          if (event.kind === "turn_done") { finish(event); return; }
          onEvent(event);
        },
        (line) => onEvent({ kind: "log", text: "codex: " + line.slice(0, 200) }),
      );
      child = spawn(codexPath, args, { cwd: workDir, env, stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => parser.push(chunk));
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-4000);
        const t = String(chunk).trim();
        if (t && !/failed to load skill|Reading additional input/.test(t)) onEvent({ kind: "log", text: t.slice(0, 300) });
      });
      child.on("error", (error) => finish({ kind: "turn_done", isError: true, text: error.message }));
      child.on("exit", (code) => {
        parser.finish();
        files.forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
        finish({ kind: "turn_done", isError: !!code, text: code ? "Codex exited " + code + (stderr.trim() ? ": " + stderr.trim().slice(-300) : "") : "" });
      });
      child.stdin.end(String(text));
    },
    stop() {
      return new Promise((resolve) => {
        const p = child;
        if (!p || p.exitCode !== null || p.signalCode) return resolve();
        const done = () => { clearTimeout(kill); clearTimeout(give); resolve(); };
        p.once("exit", done);
        const kill = setTimeout(() => { try { p.kill("SIGKILL"); } catch (_) {} }, 250);
        const give = setTimeout(done, 1000);
        try { p.kill("SIGTERM"); } catch (_) {}
      });
    },
  };
}

module.exports = { BASE_CODEX_MODELS, CODEX_NOTES, DEFAULT_CODEX_MODEL, buildCodexArgs, codexModels, createCodexSession, findCodex, prepareWorkspace, readCodexCatalog, readCodexConfig, reduceCodexEvent };
