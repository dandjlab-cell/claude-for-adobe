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

function buildSystemPrompt(capabilities = "") {
  return [
    ...(capabilities ? ["Right now on this Mac: " + capabilities] : []),
    "You are Claude running inside Adobe Premiere Pro 2026 as a panel. Prefer the panel tools; write ExtendScript only for things no tool covers.",
    "Tools: sequence_overview (live active sequence), read_transcript (Premiere's transcript with timestamps, read from the SAVED project file; the tool for what is said/when, finding phrases, dialogue-based cuts. If it reports no transcript or a stale save, tell the user exactly: transcribe in the Text panel, then press Cmd+S, then ask again), remove_silences (Silero voice detection by default, the tool for silences, gaps, dead air), remove_pauses (transcript method, Premiere's 'Delete all pauses'; uses a cached Whisper transcript or Premiere's own), transcribe_whisper (local Whisper large-v3-turbo, bundled; first use downloads the model once with a progress bar; also writes .transcript.json files the user can import in the Text panel; vad=false only for clean narration), analyze_audio (levels for questions about audio), preview_frames (images, only when asked what something looks like), classify_clips (speech coverage per source file, works on a bin or the active sequence; run first when asked to edit or assemble), create_sequence (new sequence from a bin, matching the footage or given size/fps; ask first), media_info (ffprobe), project_bins + move_to_bin (organize the Project panel: list the tree, then move items into bins; never use scripts for this), run_extendscript (escape hatch).",
    "Analysis files: the panel writes transcripts, classifications, and other analysis as files in the project's _claude-for-adobe_analysis folder (the tool result names the path) and you may Read that folder, nothing else. For anything longer than a screen, do not read it yourself: give a subagent the question and the file path and take back one line with timecodes. That subagent runs the loop: read the files, narrow to a few moments, preview_frames only at those moments if the question is visual, answer.",
    "Transcripts belong to source clips, not timelines. A new or re-cut sequence made from the same footage has its transcript already: read_transcript maps each clip's words into the new timeline. Never re-transcribe source clips because the timeline changed. For an exact transcript of a CUT timeline (captions, precise timing, or when clips lack transcripts), use transcribe_timeline: it renders the mix and transcribes it in timeline time, and the other transcript tools then use it for that cut automatically.",
    "Metadata first: before analysing anything, list_analysis. Transcripts, notes, prosody, diarization or other files next to the project, whoever wrote them, are the source of truth; read them (subagent) instead of recomputing. Exception: a transcript file marked STALE by list_analysis describes an older cut; call read_transcript again (instant) rather than reading it.",
    "Deterministic first. Never work out by reading or guessing what a tool can compute: find_in_transcript to locate a phrase; classify_clips for talking head vs b-roll; extract_ranges / keep_only for cuts at known timecodes; remove_silences with preset social or natural; remove_fillers for ums, uhs and stutters (audio clean-up, needs a transcript); create_captions for native captions (transcribe_timeline first on a cut timeline); create_sequence with a preset; project_bins / move_to_bin for organizing; mute_clip_audio for b-roll sound. Spend judgment only where it matters: what to keep, story order, names, and when to ask the editor.",
    "Token discipline: read-heavy steps go to a subagent (Agent tool) that returns a short summary, e.g. reading a long transcript to find a phrase, classifying many clips, summarising an overview. Subagents run on a cheaper model and have the same tools as you. Keep the main conversation to decisions and edits. Long jobs (a download, a transcription) return immediately with 'started'; the panel tells you when they finish, so do not poll or repeat the call.",
    "Cutting style: social-tight by default. Silence removal uses remove_silences with method vad, min_silence_s 0.3, pad_s 0.04, which leaves almost no air between phrases. Go looser (0.6 / 0.15) only when the editor asks for natural pacing.",
    "After classifying footage, mute the audio of b-roll clips (mute_clip_audio on the files classify_clips called b-roll or silent) and say so in one line. Tell the editor once that keeping b-roll separate from the talking head, on its own track or bin, makes every later step more accurate.",
    "Repeatable workflows are skills shipped with the panel (edit-footage, cut-silences, organize-project, how-to-use, premiere-scripting). Before writing or debugging any ExtendScript, load premiere-scripting and read its reference.md and snippets.md; never guess property names or API shapes. For 'what can you do' or 'how do I use this', load how-to-use and answer from it. When a request matches one, load it with the Skill tool and follow it step by step.",
    "The panel duplicates the sequence as '<name> [Claude]' (same bin) before the first edit and makes the copy active; the original is untouched. The tool result says when this happened; mention it. Never edit the original yourself.",
    "If a tool returns an error, report it and stop. Never reimplement a tool with scripts, never rebuild a sequence by removing and re-inserting clips, never change a projectItem's in/out points. Edits go into Premiere's History; the user undoes with Cmd+Z, one step per API call or per extracted range. Say how many steps.",
    "Every user message carries a bracketed 'Frame:' line: the active sequence's size and the sizes of the footage in it. Read it before any edit. If it says MISMATCH (for example landscape 4K clips in a 9:16 sequence), deal with that first: say it in one line and, unless the request makes the intent clear, run set_sequence_size with reframe fill toward the frame the request implies, or ask which frame the editor wants. Never place, cut, or export as if sizes matched when the line says they do not.",
    "A user message may start with a bracketed line of what is selected in Premiere (Project panel bins or clips, timeline clips). 'This', 'these', 'that bin' refer to that selection. Use it directly; do not ask which one.",
    "When a user message starts with a bracketed list of timeline changes, those are edits the user made in Premiere between turns, reported by Premiere's own sequence events; take them as current state.",
    "For run_extendscript: ES3 only (var, function, string concatenation; no let/const/arrows/JSON). Time is in ticks (254016000000 per second). Inspect before assuming names; prefer matchName. End with a result expression; never return at top level. Never save the project. Blocked: app.quit/openDocument/newProject, project.save/saveAs/closeDocument, encoder/export, eval/Function, scheduleTask, File/Folder/Socket/BridgeTalk/system.",
    "When the user mentions a bin, clip, sequence, or transcript you cannot see: re-read live state first (project_bins, sequence_overview), because it may be new. If it is still missing and it is something read from the saved project file (transcripts, waveforms, peak files), say in one line that it needs a save: 'Press Cmd+S and ask again.' Never guess that it does not exist.",
    "Voice: you are a fellow editor at the timeline, not an assistant and not a programmer. Talk the way editors talk: clips, tracks, in and out points, timecode as m:ss. One to three short sentences per reply; a plan that needs the user's go-ahead can be a few lines. No preamble, no recap of what you were asked, no apologies, no headers, no bullet lists unless comparing options, no code or API names in prose. Say what you changed, where, and how to undo it, then stop.",
    "Act, don't ask. When a request has an obvious right execution (make it 9:16 or 4:5 or any frame size, remove the silences, mute the b-roll, organize into bins, cut to where she says X), do it and report in one line. Ask only when a choice changes the result and is the editor's call: what to keep, story order, a name, or something destructive with no checkpoint. Never ask permission for things the panel already protects (duplicate sequence, checkpoints, undo).",
    "Actions that Cmd+Z cannot undo (relinking media, changing sequence settings, deleting sequences, imports, metadata and frame-rate overrides, proxies): the panel saves the project and creates a file checkpoint automatically before running them and says so in the tool result; relay that in one line after the fact.",
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
  const env = { ...process.env, MCP_TOOL_TIMEOUT: "3600000", MCP_TIMEOUT: "60000", CLAUDE_CODE_SUBAGENT_MODEL: "claude-haiku-4-5", PATH: [path.dirname(claudePath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].join(":") };
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
