const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// CEP hands back a file: URL with percent-encoding; require() needs a plain path.
const extensionRoot = decodeURIComponent(window.__adobe_cep__.getSystemPath("extension").replace(/^file:\/{0,2}/, ""));
const { buildExtendScriptWrapper, inspectExtendScript } = require(path.join(extensionRoot, "src", "core.cjs"));
const { createCheckpoint, createHoldingCopy, listCheckpoints, revertCheckpoint } = require(path.join(extensionRoot, "src", "checkpoint.cjs"));
const { createMcpServer } = require(path.join(extensionRoot, "src", "mcp-http.cjs"));
const { createClaudeSession, availableModels, readClaudeJson } = require(path.join(extensionRoot, "src", "claude-session.cjs"));
const { checkForUpdate, currentVersion, installUpdate } = require(path.join(extensionRoot, "src", "update.cjs"));
const { classifyMedia, formatClassification } = require(path.join(extensionRoot, "src", "classify.cjs"));
const vadModule = require(path.join(extensionRoot, "src", "vad.cjs"));
const { MAX_WINDOWS, audioLevels, formatPeakWindows, mediaInfo, resizeImage } = require(path.join(extensionRoot, "src", "media.cjs"));
const { findPeakFile, parsePeakFile, peakWindows } = require(path.join(extensionRoot, "src", "pek.cjs"));
const { diffSnapshots, formatSnapshot, parseSnapshot, summarizeChanges } = require(path.join(extensionRoot, "src", "timeline.cjs"));
const { loudIntervals, planCuts, silencesFrom, union } = require(path.join(extensionRoot, "src", "silence.cjs"));
const { DEFAULT_MIN_PAUSE, complementRanges, decodeWords, findInWords, linesFromWords, listTranscripts, pausesFromWords, tc, transcriptForClip } = require(path.join(extensionRoot, "src", "transcript.cjs"));
const { MODELS: WHISPER_MODELS, cachedWords, currentModel, ensureModel, installedModels, modelReady, setModel, toPremiereTranscript, transcribe } = require(path.join(extensionRoot, "src", "whisper.cjs"));
const vad = require(path.join(extensionRoot, "src", "vad.cjs"));

// VAD from Premiere's own waveform: speech regions of a whole media file (source seconds), padded.
function speechRegionsFor(mediaPath) {
  const rate = PEAK_RATES.find((r) => findPeakFile(mediaPath, r, project.path));
  const pek = rate && findPeakFile(mediaPath, rate, project.path);
  if (!pek) return null;
  const parsed = parsePeakFile(pek);
  const total = parsed.pairsPerChannel * parsed.samplesPerPair / rate;
  const loud = loudIntervals(peakWindows(parsed, rate, 0, total, 0.1, 0), 0.1);
  const pad = 0.4;
  return union(loud.map((r) => ({ start: Math.max(0, r.start - pad), end: Math.min(total, r.end + pad) }))).filter((r) => r.end - r.start >= 0.3);
}

const EXTENSION_ID = "com.claude-for-adobe.premiere";
const TOOL_TIMEOUT_MS = 180000; // a modal dialog in Premiere can hang evalScript forever; the turn must still finish
const PROJECT_POLL_MS = 1000;
const COL = "", ROW = "";
const HOST_EVENT = "com.claude-for-adobe.host";
const HOST_EVENTS = ["onActiveSequenceStructureChanged", "onActiveSequenceTrackItemAdded", "onActiveSequenceTrackItemRemoved",
  "onActiveSequenceSelectionChanged", "onSequenceActivated", "onActiveSequenceChanged", "onProjectChanged", "onItemsAddedToProjectSuccess"];
const PEAK_RATES = [48000, 44100, 96000, 32000];

const $ = (id) => document.getElementById(id);
const ui = { messages: $("messages"), input: $("input"), send: $("send"), stop: $("stop"), status: $("status"), project: $("project-name"), model: $("model"), restart: $("restart"), checkpoints: $("checkpoints"), log: $("log"), requireCheckpoint: $("require-checkpoint"), dupSequence: $("dup-sequence"), askScripts: $("ask-scripts"), attachments: $("attachments"), selectionChip: $("selection-chip"), modelState: $("model-state"), whisperModel: $("whisper-model"), btnWhisperModel: $("btn-whisper-model"), modelBar: $("model-bar"), versionRow: $("version-row"), checkUpdates: $("check-updates"), copies: $("copies"), btnCut: $("btn-cut"), cutMethod: $("cut-method"), minSilence: $("min-silence"), pad: $("pad") };

let session = null;
let sessionGen = 0;        // events from a stopped session are dropped (generation counter)
let restarting = null;     // single-flight restart
let mcp = null;
let project = { path: "", name: "", sequence: "", sequenceId: "" };
let liveMessage = null;    // assistant node receiving streamed deltas
let timeline = null;       // last snapshot of the active sequence (live model)
let pendingChanges = [];   // edits Premiere reported since Claude's last turn
let snapshotTimer = null;
const workingCopies = new Map(); // copyId -> { copyName, originalId, originalName }

// ---- host bridge --------------------------------------------------------------------------------

function evalScript(code) {
  return new Promise((resolve) => window.__adobe_cep__.evalScript(code, (result) => resolve(String(result == null ? "" : result))));
}

// Call a PCX host function (host/premiere.jsx). Arguments are passed as strings.
function host(fn, ...args) {
  return evalScript("PCX." + fn + "(" + args.map((a) => JSON.stringify(String(a))).join(",") + ")");
}

async function loadHostScript() {
  const out = await evalScript(fs.readFileSync(path.join(extensionRoot, "host", "premiere.jsx"), "utf8"));
  if (out !== "PCX loaded") throw new Error("host script failed to load: " + out);
  log("host script loaded");
}

// ---- ui helpers ---------------------------------------------------------------------------------

function log(text) {
  ui.log.textContent = (ui.log.textContent + "\n" + new Date().toLocaleTimeString() + " " + text).slice(-8000);
  ui.log.scrollTop = ui.log.scrollHeight;
}

const MODEL_FALLBACK = "claude-sonnet-5";
// Fill the model dropdown from the CLI's own account cache, so it matches what /model shows in Claude Code.
(function fillModels() {
  const { models, defaultModel } = availableModels(readClaudeJson());
  if (!models.length) return;
  ui.model.innerHTML = "";
  models.forEach((m) => { const o = document.createElement("option"); o.value = m.value; o.textContent = m.label; ui.model.appendChild(o); });
  ui.model.value = defaultModel;
})();
const modelLabel = (id) => { const o = [...ui.model.options].find((x) => x.value === id); return o ? o.text : id; };
let lastPayload = "";
let lastCopyId = null;        // working copy created by the most recent ensureWorkingCopy()
let allowScriptsThisSession = false; // set by "Run all this session"; cleared on New
function setStatus(text, cls) { ui.status.textContent = text; ui.status.className = cls || (/^(Ready|Starting)/.test(text) ? "" : "busy"); }
function setBusy(busy) { ui.send.disabled = busy || !session; ui.stop.disabled = !busy; if (!busy) ui.input.focus(); }

function addMessage(cls, text) {
  if (quietCard && !/error/.test(cls)) return document.createElement("div"); // a button run keeps notes inside its card
  const el = document.createElement("div");
  el.className = "message " + cls;
  el.textContent = text;
  ui.messages.appendChild(el);
  ui.messages.scrollTop = ui.messages.scrollHeight;
  return el;
}

// While a button runs, everything the tools would normally post (cards, muted notes) goes into this one card instead.
let quietCard = null;
function addTool(summary, code) {
  if (quietCard) return quietCard;
  const el = document.createElement("details");
  el.className = "tool";
  el.innerHTML = "<summary></summary><pre class=\"code\"></pre><div class=\"bar\" hidden><i></i><span></span></div><pre class=\"result muted\">Running…</pre>";
  el.querySelector("summary").textContent = "▸ " + summary;
  el.querySelector(".code").textContent = code;
  ui.messages.appendChild(el);
  ui.messages.scrollTop = ui.messages.scrollHeight;
  const bar = el.querySelector(".bar");
  return {
    el,
    open() { el.open = true; },
    progress(done, total, label) { bar.hidden = false; bar.querySelector("i").style.width = Math.round(100 * done / total) + "%"; bar.querySelector("span").textContent = (label || "") + done + " / " + total; },
    done(text, ok) { bar.hidden = true; const r = el.querySelector(".result"); r.textContent = text; r.className = "result " + (ok ? "ok" : "error"); },
  };
}

const err = (card, text) => { card.done(text, false); return { text: "CLAUDE_FOR_ADOBE_ERROR:" + text, isError: true }; };

// In-panel yes/no card (no system dialog). Used only for destructive actions: Revert, Discard copy.
// Resolves true / false, or the string "all" when an `allLabel` third button is offered and chosen.
function askInline(text, yesLabel = "Yes", noLabel = "Cancel", allLabel = "") {
  return new Promise((resolve) => {
    const el = addMessage("assistant muted", text + "\n");
    const row = document.createElement("div");
    row.className = "row";
    const yes = document.createElement("button"); yes.textContent = yesLabel;
    const no = document.createElement("button"); no.textContent = noLabel; no.className = "utility";
    const finish = (v) => { row.remove(); el.textContent += (v === "all" ? allLabel : v ? yesLabel : noLabel) + "."; resolve(v); };
    yes.onclick = () => finish(true); no.onclick = () => finish(false);
    row.append(yes, no);
    if (allLabel) { const all = document.createElement("button"); all.textContent = allLabel; all.className = "utility"; all.onclick = () => finish("all"); row.append(all); }
    el.appendChild(row);
    ui.messages.scrollTop = ui.messages.scrollHeight;
  });
}

// ---- project ------------------------------------------------------------------------------------

async function readProject() {
  const [projectPath = "", name = "", sequence = "", sequenceId = ""] = (await host("projectInfo")).split(COL);
  return { path: projectPath, name, sequence, sequenceId };
}

async function refreshProject() {
  const next = await readProject();
  const previousPath = project.path;
  const changed = next.path !== previousPath;
  project = next;
  ui.project.textContent = (project.name || "No project") + (project.sequence ? " · " + project.sequence : "");
  if (changed) { log("project: " + (project.path || "(none)")); renderCheckpoints(); if (session && !session.busy && previousPath) restartSession(session.sessionId); }
}

async function saveProject() {
  const out = await host("save");
  if (out !== "ok") throw new Error("Premiere refused to save the project: " + out);
}

async function openProject(file) {
  const out = await host("openProject", file);
  const [, active = ""] = out.split("|");
  if (out.indexOf("ERR:") === 0 || active !== file) throw new Error("Premiere did not open " + path.basename(file) + " (" + out + ")");
}

async function readSnapshot() { return parseSnapshot(await host("snapshot")); }

// ---- file checkpoints (opt-in) ------------------------------------------------------------------

function renderCheckpoints() {
  ui.checkpoints.innerHTML = "";
  let entries = [];
  try { entries = listCheckpoints(project.path); } catch (error) { log("checkpoint list failed: " + error.message); }
  entries.slice(-8).reverse().forEach((entry) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = new Date(entry.createdAt).toLocaleTimeString() + " · " + (entry.label || entry.id) + (entry.intact ? "" : " (corrupt)");
    const button = document.createElement("button");
    button.textContent = "Revert";
    button.disabled = !entry.intact;
    button.onclick = () => revert(entry.id);
    row.append(label, button);
    ui.checkpoints.appendChild(row);
  });
  if (!entries.length) ui.checkpoints.innerHTML = "<span class=\"muted\">None. Edits go to a duplicate sequence and are undone inside Premiere; enable the checkbox above to also keep file checkpoints.</span>";
}

// Restore sequence: save, keep a recovery copy, park Premiere on a holding project so the
// original path is not open, copy the checkpoint over it, reopen it, drop the holding project.
async function revert(id) {
  if (session && session.busy) { addMessage("assistant error", "Wait for Claude to finish (or press Stop) before reverting."); return; }
  if (!await askInline("Revert the project to this checkpoint? The current state is saved as a recovery checkpoint first.", "Revert")) return;
  const original = project.path;
  let holding = null;
  try {
    setStatus("Reverting…");
    await saveProject();
    createCheckpoint(original, "recovery before revert");
    holding = createHoldingCopy(original, id);
    await openProject(holding);
    revertCheckpoint(original, id);
    await openProject(original);
    await refreshProject();
    addMessage("assistant muted", "Reverted to checkpoint. A recovery checkpoint of the previous state was kept.");
    setStatus("Ready");
  } catch (error) {
    log("revert failed: " + error.message);
    addMessage("assistant error", "Revert failed: " + error.message + (holding ? " Premiere may be showing the holding copy; reopen your project from " + original : ""));
    setStatus("Revert failed", "error");
  } finally {
    if (holding) { try { fs.unlinkSync(holding); } catch (_) {} }
    renderCheckpoints();
  }
}

// ---- working copies (duplicate the sequence inside the project before editing it) ---------------

function renderCopies() {
  ui.copies.innerHTML = "";
  workingCopies.forEach((c, copyId) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = c.copyName + "  (original: " + c.originalName + ")";
    const back = document.createElement("button");
    back.textContent = "Open original";
    back.onclick = () => host("openSequence", c.originalId);
    const discard = document.createElement("button");
    discard.textContent = "Discard copy";
    discard.onclick = () => discardCopy(copyId);
    row.append(label, back, discard);
    ui.copies.appendChild(row);
  });
  if (!workingCopies.size) ui.copies.innerHTML = "<span class=\"muted\">None yet. Edits go to a duplicate sequence; the original is never touched.</span>";
}

async function discardCopy(copyId) {
  const c = workingCopies.get(copyId);
  if (!c || !await askInline("Delete \"" + c.copyName + "\" and open the original \"" + c.originalName + "\"?", "Discard")) return;
  log("discard copy: " + await host("deleteSequence", copyId, c.originalId));
  workingCopies.delete(copyId);
  renderCopies();
  addMessage("assistant muted", "Discarded \"" + c.copyName + "\"; \"" + c.originalName + "\" is active again.");
}

// Called before any mutation. Returns a note for Claude, or "" when the active sequence is already a working copy.
async function ensureWorkingCopy() {
  if (!ui.dupSequence.checked) return "";
  const p = await readProject();
  if (!p.sequenceId) throw new Error("no active sequence");
  if (workingCopies.has(p.sequenceId) || / \[Claude\]$/.test(p.sequence)) return "";
  const existing = [...workingCopies.entries()].find(([, c]) => c.originalId === p.sequenceId);
  if (existing) {
    await host("openSequence", existing[0]);
    timeline = await readSnapshot();
    return "[The panel switched to the existing working copy \"" + existing[1].copyName + "\"; \"" + p.sequence + "\" stays untouched.]\n";
  }
  const out = await host("cloneActive", p.sequence + " [Claude]");
  if (out.indexOf("ERR:") === 0) throw new Error(out.slice(4));
  const [copyId, copyName] = out.split("|");
  workingCopies.set(copyId, { copyName, originalId: p.sequenceId, originalName: p.sequence });
  lastCopyId = copyId;
  renderCopies();
  log("working copy created: " + copyName);
  addMessage("assistant muted", "Duplicated \"" + p.sequence + "\" as \"" + copyName + "\" (same bin) and made it active. The original is untouched; use Open original / Discard copy above to revert.");
  timeline = await readSnapshot();
  return "[The panel duplicated the sequence first: the active sequence is now \"" + copyName + "\" (a copy); \"" + p.sequence + "\" is untouched. Edits below apply to the copy.]\n";
}

// ---- live timeline (Premiere's own host events -> snapshot -> diff) -----------------------------

async function bindHostEvents() {
  log("host events bound: " + await host("bindEvents", HOST_EVENT, JSON.stringify(HOST_EVENTS), EXTENSION_ID));
  window.__adobe_cep__.addEventListener(HOST_EVENT, (evt) => onHostEvent(String(evt && evt.data || "")));
}

function onHostEvent(name) {
  log("host event " + name);
  if (/SelectionChanged/.test(name)) return; // selection is not timeline state
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => { snapshotTimeline().catch((e) => log("snapshot failed: " + e.message)); }, 400);
}

// Records changes only between Claude's turns; during a turn the edits are Claude's own.
async function snapshotTimeline() {
  const next = await readSnapshot();
  if (!(session && session.busy) && timeline) {
    const changes = diffSnapshots(timeline, next);
    if (changes.length) { pendingChanges.push(...changes); if (pendingChanges.length > 40) pendingChanges = pendingChanges.slice(-40); }
  }
  timeline = next;
  ui.status.textContent = ui.status.textContent.replace(/ · timeline changed \(\d+\)$/, "") + (pendingChanges.length ? " · timeline changed (" + pendingChanges.length + ")" : "");
}

// ---- tools ------------------------------------------------------------------------------------

async function runExtendScript({ summary = "", code = "" }) {
  const card = addTool(summary || "run_extendscript", code);
  setStatus("Running: " + (summary || "script"));
  const inspection = inspectExtendScript(code);
  if (inspection.rejection) return err(card, inspection.rejection);
  // Enforced human approval: the guard cannot prove ExtendScript safe, so anything that is not a plain read waits for a
  // click. "Run all this session" skips the click for undoable scripts until New is pressed; non-undoable ones always ask.
  if (!inspection.readOnly && (inspection.notUndoable.length || !(allowScriptsThisSession || !ui.askScripts.checked))) {
    const what = inspection.notUndoable.length ? "This cannot be undone with Cmd+Z (" + inspection.notUndoable.join(", ") + ")." : (inspection.mutating ? "This edits the project (Cmd+Z undoes it)." : "The guard could not prove this script is read-only.");
    const answer = await askInline("Claude wants to run a script: " + (summary || "(no summary)") + "\n" + what + " The code is in the card above.", "Run it", "Don't run", inspection.notUndoable.length ? "" : "Run all this session");
    if (!answer) return err(card, "The user declined to run this script. Ask before trying a different approach.");
    if (answer === "all") { allowScriptsThisSession = true; addMessage("assistant muted", "Scripts run without asking until you press New. Actions Cmd+Z can't undo will still ask."); }
  }
  let note = inspection.warnings.map((w) => "[warning] " + w).join("\n");
  let copyNote = "";
  let freshCopy = null;
  if (inspection.mutating) {
    lastCopyId = null;
    try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
    if (lastCopyId) freshCopy = { id: lastCopyId, before: formatSnapshot(timeline) };
    const forced = inspection.notUndoable.length ? inspection.notUndoable.join(", ") : "";
    if (ui.requireCheckpoint.checked || forced) {
      try {
        await saveProject(); // the .prproj on disk is only the last save; a checkpoint must capture the current state
        const entry = createCheckpoint(project.path, forced ? "before " + forced : summary);
        note += (note ? "\n" : "") + (forced
          ? "[" + forced + " cannot be undone with Cmd+Z, so the project was saved and file checkpoint " + entry.id + " was created first. Tell the user in one line: it is under File checkpoints in the panel.]"
          : "[project saved, checkpoint " + entry.id + " created]");
        if (forced) addMessage("assistant muted", "Cmd+Z can't undo " + forced + ", so a file checkpoint (" + entry.id + ") was saved first. It's under File checkpoints below.");
        renderCheckpoints();
      } catch (error) { return err(card, (forced ? forced + " blocked: it cannot be undone and a checkpoint was not possible: " : "Mutating script blocked, checkpoint not possible: ") + error.message); }
    }
  }
  const raw = await Promise.race([
    evalScript(buildExtendScriptWrapper(code)),
    new Promise((resolve) => setTimeout(() => resolve("CLAUDE_FOR_ADOBE_ERROR:Script did not return within " + TOOL_TIMEOUT_MS / 1000 + "s (a Premiere dialog may be open)."), TOOL_TIMEOUT_MS)),
  ]);
  const ok = raw.indexOf("CLAUDE_FOR_ADOBE_OK:") === 0;
  const body = raw === "EvalScript error." ? "ExtendScript host error (script could not be evaluated)"
    : raw.replace(/^CLAUDE_FOR_ADOBE_(?:OK|ERROR):/, "") || (ok ? "(empty result)" : "EvalScript returned nothing");
  if (freshCopy) {
    // The duplicate was made for this script only. If nothing changed, drop it so the project stays tidy.
    const after = await readSnapshot();
    if (formatSnapshot(after) === freshCopy.before) {
      const c = workingCopies.get(freshCopy.id);
      if (c) { try { await host("deleteSequence", freshCopy.id, c.originalId); } catch (_) {} workingCopies.delete(freshCopy.id); renderCopies(); }
      copyNote = "[The panel duplicated the sequence first, but this script changed nothing, so the duplicate was removed again; \"" + (c ? c.originalName : "the original") + "\" is active.]\n";
      addMessage("assistant muted", "No changes were made, so the duplicate was removed.");
    } else timeline = after;
  }
  card.done((note ? note + "\n" : "") + body, ok);
  setStatus("Thinking…");
  if (inspection.mutating) refreshProject();
  return { text: copyNote + (ok ? raw : "CLAUDE_FOR_ADOBE_ERROR:" + body) + (note ? "\n" + note : ""), isError: !ok };
}

async function sequenceOverview() {
  const card = addTool("sequence_overview", "");
  timeline = await readSnapshot();
  const text = formatSnapshot(timeline);
  card.done(text.split("\n").slice(0, 12).join("\n") + (timeline.clips.length > 10 ? "\n…" : ""), !timeline.error);
  return { text, isError: !!timeline.error };
}

// Renders frames of the active sequence via QE, downscales, returns them as images.
async function previewFrames({ seconds = [], max_px = 512 }) {
  const secs = [].concat(seconds).map(Number).filter((n) => n >= 0).slice(0, 6);
  if (!secs.length) return { text: "CLAUDE_FOR_ADOBE_ERROR:seconds[] required (up to 6 timeline positions)", isError: true };
  const base = path.join(os.tmpdir(), "claude-for-adobe-frame-" + Date.now().toString(36));
  const card = addTool("preview_frames at " + secs.map((n) => n + "s").join(", "), "");
  setStatus("Rendering " + secs.length + " frame(s)…");
  const raw = await host("frames", JSON.stringify(secs), base);
  if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
  const content = [];
  raw.split(ROW).forEach((row, i) => {
    const [b, ok, tc] = row.split(COL);
    const src = [b + ".png", b].find((f) => fs.existsSync(f));
    if (!src) { content.push({ type: "text", text: "frame " + i + " at " + secs[i] + "s: export failed (" + ok + ")" }); return; }
    try {
      const small = resizeImage(src, b + "_small.jpg", max_px);
      content.push({ type: "text", text: "frame " + i + ": timeline " + secs[i] + "s (timecode " + tc + ")" });
      content.push({ type: "image", data: fs.readFileSync(small).toString("base64"), mimeType: "image/jpeg" });
      fs.unlinkSync(small);
    } catch (error) { content.push({ type: "text", text: "frame " + i + ": " + error.message }); }
    fs.unlinkSync(src);
  });
  card.done(content.filter((c) => c.type === "text").map((c) => c.text).join("\n"), true);
  setStatus("Thinking…");
  return { content };
}

// Audio clips of the active sequence overlapping [a,b], with their peak file when Premiere has one.
async function audioClipsIn(a, b) {
  const snap = await readSnapshot();
  if (snap.error) throw new Error(snap.error);
  return { snap, clips: snap.clips.filter((c) => c.track[0] === "A" && c.end > a && c.start < b).map((c) => {
    const rate = PEAK_RATES.find((r) => findPeakFile(c.mediaPath, r, project.path));
    return { ...c, rate, pek: rate ? findPeakFile(c.mediaPath, rate, project.path) : null, s0: Math.max(a, c.start), s1: Math.min(b, c.end) };
  }) };
}

async function analyzeAudio({ start_seconds = 0, end_seconds, window_ms = 100 }) {
  const a = Math.max(0, Number(start_seconds)), b = Number(end_seconds);
  if (!(b > a)) return { text: "CLAUDE_FOR_ADOBE_ERROR:end_seconds must be greater than start_seconds", isError: true };
  if (b - a > 1800) return { text: "CLAUDE_FOR_ADOBE_ERROR:range too long; analyze at most 30 minutes per call", isError: true };
  const card = addTool("analyze_audio " + a + "s to " + b + "s", "");
  setStatus("Analyzing audio…");
  let clips;
  try { ({ clips } = await audioClipsIn(a, b)); } catch (error) { return err(card, error.message); }
  const lines = clips.map((c) => {
    const sourceStart = c.inPoint + (c.s0 - c.start), duration = c.s1 - c.s0;
    const label = c.track + " " + c.name + " (timeline " + c.s0.toFixed(2) + "-" + c.s1.toFixed(2) + "s)";
    if (!c.mediaPath) return c.track + " " + c.name + ": no source media path";
    if (c.pek) {
      try {
        let win = Number(window_ms) / 1000;
        if (duration / win > MAX_WINDOWS) win = duration / MAX_WINDOWS;
        return formatPeakWindows(peakWindows(parsePeakFile(c.pek), c.rate, sourceStart, duration, win, c.s0), win, label);
      } catch (error) { log("pek failed, falling back to ffmpeg: " + error.message); }
    }
    if (!fs.existsSync(c.mediaPath)) return c.track + " " + c.name + ": no peak file and source media offline (" + c.mediaPath + ")";
    try { return audioLevels({ file: c.mediaPath, sourceStart, duration, timelineStart: c.s0, windowMs: Number(window_ms), label }) + "\n(source: ffmpeg decode of the media file; no Premiere peak file found)"; }
    catch (error) { return c.track + " " + c.name + ": " + error.message; }
  });
  if (!lines.length) lines.push("No audio clips overlap " + a + "s to " + b + "s on the active sequence.");
  const text = lines.join("\n\n");
  card.done(text, true);
  setStatus("Thinking…");
  return { text };
}

// Shared apply step for both silence tools: duplicate first, then Premiere's Extract per range.
async function applyCuts(card, cuts, dryRun, summary) {
  const plan = cuts.length ? cuts.slice().reverse().map((c) => c.start.toFixed(2) + "-" + c.end.toFixed(2) + "s").join(", ") : "none";
  if (dryRun || !cuts.length) {
    card.done("PLAN: " + summary + "\n" + plan, true);
    return { text: "PLAN (nothing changed): " + summary + "\nranges: " + plan + (cuts.length ? "\nCall again with dry_run=false to apply. Each range becomes one Extract step in Premiere's History (Cmd+Z per range)." : "") };
  }
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  // Batches of 8, latest ranges first (earlier cuts must not shift later ones), with progress between batches.
  const ordered = cuts.slice().sort((a, b) => b.start - a.start);
  const BATCH = 8;
  let doneRanges = 0, ok = true, raw = "";
  const t0 = Date.now();
  for (let i = 0; i < ordered.length && ok; i += BATCH) {
    const batch = ordered.slice(i, i + BATCH);
    setStatus("Cutting " + Math.min(i + batch.length, ordered.length) + " / " + ordered.length + " ranges…");
    card.progress(i, ordered.length, "cutting ");
    raw = await host("extractRanges", JSON.stringify(batch.map((c) => [c.start, c.end])));
    ok = raw.indexOf("ERR:") !== 0 && raw !== "EvalScript error.";
    if (ok) doneRanges += batch.length;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  raw = (ok ? "extracted " + doneRanges + " range(s) in " + secs + "s" : raw);
  card.done(raw, ok);
  setStatus("Thinking…");
  timeline = await readSnapshot();
  return { text: copyNote + (ok ? raw + "\nUndo: Cmd+Z once per extracted range (" + cuts.length + " ranges). Nothing else was changed." : "CLAUDE_FOR_ADOBE_ERROR:" + raw), isError: !ok };
}

// Silence removal. method "vad" (default): Silero VAD finds speech on every audio clip; everything outside
// speech is a candidate cut. method "db": Premiere's peak-file waveform vs each clip's noise floor.
const CUT_PRESETS = { social: { min_silence_s: 0.3, pad_s: 0.04 }, natural: { min_silence_s: 0.6, pad_s: 0.15 } };
async function removeSilences({ start_seconds = 0, end_seconds, min_silence_s = 0.3, pad_s = 0.04, threshold_db, method = "vad", preset, dry_run = true }) {
  if (preset && CUT_PRESETS[preset]) ({ min_silence_s, pad_s } = CUT_PRESETS[preset]);
  const useVad = method !== "db" && vad.available();
  const card = addTool((dry_run ? "plan" : "remove") + "_silences (" + (useVad ? "voice: Silero VAD" : "dB") + ")", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(Math.max(0, Number(start_seconds)), end_seconds ? Number(end_seconds) : Infinity)); } catch (error) { return err(card, error.message); }
  const a = Math.max(0, Number(start_seconds)), b = Math.min(snap.duration, end_seconds ? Number(end_seconds) : snap.duration);
  const coverage = [], loud = [], skipped = [];
  clips.forEach((c) => {
    const offset = c.start - c.inPoint; // source seconds -> timeline seconds
    if (useVad) {
      if (!c.mediaPath || !fs.existsSync(c.mediaPath)) { skipped.push(c.track + " " + c.name + " (media offline)"); loud.push({ start: c.start, end: c.end }); return; }
      try {
        setStatus("Silero VAD: " + c.name + "…");
        const r = vad.speechSegments(c.mediaPath);
        coverage.push({ start: c.s0, end: c.s1 });
        r.segments.forEach((g) => { const st = g.start + offset, en = g.end + offset; if (en > c.s0 && st < c.s1) loud.push({ start: Math.max(c.s0, st), end: Math.min(c.s1, en) }); });
      } catch (error) { skipped.push(c.track + " " + c.name + " (" + error.message + ")"); loud.push({ start: c.start, end: c.end }); }
      return;
    }
    if (!c.pek) { skipped.push(c.track + " " + c.name + " (no waveform yet)"); loud.push({ start: c.start, end: c.end }); return; }
    coverage.push({ start: c.s0, end: c.s1 });
    try { loud.push(...loudIntervals(peakWindows(parsePeakFile(c.pek), c.rate, c.inPoint + (c.s0 - c.start), c.s1 - c.s0, 0.1, c.s0), 0.1, threshold_db === undefined ? undefined : Number(threshold_db))); }
    catch (error) { skipped.push(c.track + " " + c.name + " (" + error.message + ")"); loud.push({ start: c.start, end: c.end }); }
  });
  const cuts = planCuts(silencesFrom(coverage, loud, a, b), { minLen: Number(min_silence_s), pad: Number(pad_s), rangeStart: a, rangeEnd: b });
  const total = cuts.reduce((n, c) => n + (c.end - c.start), 0);
  const how = useVad ? "voice: Silero VAD speech regions, min " + min_silence_s + "s, pad " + pad_s + "s" : "waveform" + (threshold_db === undefined ? ", threshold auto = noise floor + 8 dB" : ", threshold " + threshold_db + " dBFS");
  const summary = cuts.length + " silent range(s), " + total.toFixed(1) + "s total, sequence " + snap.duration.toFixed(1) + "s -> " + (snap.duration - total).toFixed(1) + "s (method: " + how + ")"
    + (skipped.length ? " (never cut: " + skipped.join(", ") + ")" : "");
  return applyCuts(card, cuts, dry_run, summary);
}

// Transcript method: Premiere's own pauses = word gaps >= min_pause_s (Text panel default 0.75 s),
// read from the saved .prproj. Optional waveform veto so music or laughs under a gap are kept.
// Words for a clip: Whisper cache (source seconds) or Premiere's transcript from the saved .prproj.
function wordsForClip(c, source, transcripts) {
  if (source !== "premiere") {
    const w = c.mediaPath && cachedWords(c.mediaPath);
    if (w) return { words: w.words, from: "whisper" };
    if (source === "whisper") throw new Error("no Whisper transcript cached for " + c.name + "; run transcribe_whisper first");
  }
  const t = transcripts && transcriptForClip(transcripts, c);
  if (!t) throw new Error("no transcript for " + c.name);
  return { words: decodeWords(t.base64), from: "premiere" };
}

async function removePauses({ start_seconds = 0, end_seconds, min_pause_s = DEFAULT_MIN_PAUSE, pad_s = 0, require_quiet = true, source = "auto", dry_run = true }) {
  const card = addTool((dry_run ? "plan" : "remove") + "_pauses (transcript: " + source + ")", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(Math.max(0, Number(start_seconds)), end_seconds ? Number(end_seconds) : Infinity)); } catch (error) { return err(card, error.message); }
  const a = Math.max(0, Number(start_seconds)), b = Math.min(snap.duration, end_seconds ? Number(end_seconds) : snap.duration);
  let transcripts = [];
  if (source !== "whisper" && project.path) { try { transcripts = listTranscripts(project.path); } catch (error) { log("could not read project file: " + error.message); } }
  const anyWhisper = clips.some((c) => c.mediaPath && cachedWords(c.mediaPath));
  if (!transcripts.length && !anyWhisper) return err(card, "No transcript available. Either run transcribe_whisper (Whisper large-v3-turbo, local), or in Premiere: Text panel > Transcribe, then Cmd+S. (Or use remove_silences, the waveform method.)");
  const stale = project.path ? (Date.now() - fs.statSync(project.path).mtimeMs) / 60000 : 0;
  const coverage = [], gaps = [], loud = [], skipped = [], used = new Set();
  clips.forEach((c) => {
    let words;
    try { const r = wordsForClip(c, source, transcripts); words = r.words; used.add(r.from); }
    catch (error) { skipped.push(c.track + " " + c.name + " (" + error.message + ")"); loud.push({ start: c.start, end: c.end }); return; }
    coverage.push({ start: c.s0, end: c.s1 });
    const offset = c.start - c.inPoint; // source seconds -> timeline seconds
    pausesFromWords(words, Number(min_pause_s)).forEach((g) => { const s = g.start + offset, e = g.end + offset; if (e > c.s0 && s < c.s1) gaps.push({ start: Math.max(c.s0, s), end: Math.min(c.s1, e) }); });
    if (require_quiet && c.pek) { try { loud.push(...loudIntervals(peakWindows(parsePeakFile(c.pek), c.rate, c.inPoint + (c.s0 - c.start), c.s1 - c.s0, 0.1, c.s0), 0.1)); } catch (_) {} }
  });
  // Pause gaps, minus anything loud on any track (when require_quiet), padded.
  const gapUnion = union(gaps);
  const cuts = planCuts(require_quiet ? silencesFrom(gapUnion, loud, a, b) : gapUnion, { minLen: Number(min_pause_s), pad: Number(pad_s), rangeStart: a, rangeEnd: b });
  const total = cuts.reduce((n, c) => n + (c.end - c.start), 0);
  const from = [...used].join("+") || "none";
  const summary = cuts.length + " pause(s), " + total.toFixed(1) + "s total, sequence " + snap.duration.toFixed(1) + "s -> " + (snap.duration - total).toFixed(1) + "s (method: transcript word gaps >= " + min_pause_s + "s" + (require_quiet ? ", waveform veto on" : "") + "; transcript source: " + from + (used.has("premiere") ? ", project saved " + stale.toFixed(0) + " min ago" : "") + ")"
    + (skipped.length ? " (skipped: " + skipped.join(", ") + ")" : "");
  return applyCuts(card, cuts, dry_run, summary);
}

// Whisper large-v3-turbo on every audio clip's source in the active sequence. Cached per media file.
// Also writes Premiere-format transcript JSON files for Text panel > Import transcript.
// Premiere's transcript for the clips in range, as timestamped lines in sequence seconds. Read from the saved .prproj.
async function readTranscript({ start_seconds = 0, end_seconds, source = "auto" } = {}) {
  const card = addTool("read_transcript", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(Math.max(0, Number(start_seconds)), end_seconds ? Number(end_seconds) : Infinity)); } catch (error) { return err(card, error.message); }
  let transcripts = [];
  if (source !== "whisper" && project.path) { try { transcripts = listTranscripts(project.path); } catch (error) { log("could not read project file: " + error.message); } }
  const out = [], skipped = [], used = new Set();
  clips.forEach((c) => {
    let words;
    try { const r = wordsForClip(c, source, transcripts); words = r.words; used.add(r.from); }
    catch (error) { skipped.push(c.track + " " + c.name + " (" + error.message + ")"); return; }
    const lines = linesFromWords(words, c.start - c.inPoint).filter((l) => l.end > c.s0 && l.start < c.s1);
    out.push("## " + c.track + " " + c.name + " (" + tc(c.s0) + " - " + tc(c.s1) + ")");
    lines.forEach((l) => out.push("[" + tc(l.start) + "] " + l.text));
  });
  if (!out.length) return err(card, "No transcript available. In Premiere: Text panel > Transcribe, then Cmd+S (the transcript is read from the saved project file). Or run transcribe_whisper.");
  const stale = used.has("premiere") && project.path ? " (project saved " + ((Date.now() - fs.statSync(project.path).mtimeMs) / 60000).toFixed(0) + " min ago; edits since then are not visible until Cmd+S)" : "";
  const full = out.join("\n") + (skipped.length ? "\n(skipped: " + skipped.join(", ") + ")" : "") + "\n(source: " + [...used].join("+") + "; timestamps are sequence seconds" + stale + ")";
  const file = writeAnalysis((project.sequence || "sequence") + ".transcript.md", "# Transcript of \"" + (project.sequence || "sequence") + "\"\n\n" + full + "\n");
  card.done(full.split("\n").slice(0, 8).join("\n") + (out.length > 8 ? "\n…" : ""), true);
  if (out.length <= 40) return { text: full + "\n(also written to " + file + ")" };
  return { text: out.length + " lines of transcript written to " + file + ". First lines:\n" + out.slice(0, 6).join("\n") + "\n…\nFor questions about it (find a phrase, what is said at a time), give a subagent the question and that path." };
}

// Watches the project file; when it is saved and now carries a transcript, nudges Claude to continue (up to 30 min).
let saveWatcher = null;
function waitForSavedTranscript() {
  if (saveWatcher) clearInterval(saveWatcher);
  const p = project.path; if (!p) return;
  let last = 0; try { last = fs.statSync(p).mtimeMs; } catch (_) {}
  const started = Date.now();
  setStatus("Waiting for Text panel > Transcribe, then Cmd+S…");
  saveWatcher = setInterval(() => {
    if (Date.now() - started > 30 * 60 * 1000) { clearInterval(saveWatcher); saveWatcher = null; setStatus("Ready"); return; }
    let m = 0; try { m = fs.statSync(p).mtimeMs; } catch (_) { return; }
    if (m === last) return;
    last = m;
    let n = 0; try { n = listTranscripts(p).length; } catch (_) {}
    if (!n) return;
    clearInterval(saveWatcher); saveWatcher = null;
    addMessage("assistant muted", "Project saved with " + n + " transcript" + (n === 1 ? "" : "s") + ". Continuing.");
    if (session && !session.busy) { setBusy(true); setStatus("Thinking…"); try { session.send("[The user transcribed in Premiere and saved the project. Continue with the task using read_transcript.]"); } catch (_) { setBusy(false); } }
  }, 2000);
}

async function runTranscriptionJob(card, media, { language, vad, write_transcript_json, outDir }) {
  const lines = [];
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    if (!fs.existsSync(m)) { lines.push(path.basename(m) + ": media offline"); continue; }
    setStatus("Whisper: " + path.basename(m) + "…");
    card.progress(i, media.length, "transcribing " + path.basename(m) + " ");
    const t0 = Date.now();
    try {
      const r = await transcribe(m, { language, vad, onLog: log });
      let note = path.basename(m) + ": " + r.words.length + " words" + (r.cached ? " (cached)" : " (" + ((Date.now() - t0) / 1000).toFixed(0) + "s)");
      if (write_transcript_json) { fs.mkdirSync(outDir, { recursive: true }); const f = path.join(outDir, path.basename(m) + ".transcript.json"); fs.writeFileSync(f, JSON.stringify(toPremiereTranscript(r.words, r.language), null, 2)); note += " -> " + f; }
      const md = writeAnalysis(path.basename(m) + ".transcript.md", "# " + path.basename(m) + " (source seconds)\n\n" + linesFromWords(r.words, 0).map((l) => "[" + tc(l.start) + "] " + l.text).join("\n") + "\n");
      note += "; text: " + md;
      lines.push(note);
    } catch (error) { lines.push(path.basename(m) + ": " + error.message); }
  }
  card.done(lines.join("\n"), true);
  setStatus("Ready");
  if (session && !session.busy) { setBusy(true); setStatus("Thinking…"); try { session.send("[Transcription finished:\n" + lines.join("\n") + "\nContinue with the task; call transcribe_whisper again to read the cached results or use read_transcript with source=whisper.]"); } catch (_) { setBusy(false); } }
}

async function transcribeWhisper({ language = "en", write_transcript_json = true, vad = true } = {}) {
  const card = addTool("transcribe_whisper (" + currentModel() + ")", "");
  card.open();
  let snap;
  try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const media = [...new Set(snap.clips.filter((c) => c.track[0] === "A" && c.mediaPath).map((c) => c.mediaPath))];
  if (!media.length) return err(card, "no audio clips with source media in the active sequence");
  if (!modelReady()) {
    // The one big download is the user's call. It runs outside this tool call (which has a time limit): start it,
    // return now, and when it lands, nudge Claude to continue on its own.
    const go = await askInline("This needs a transcript. Either download Whisper (" + currentModel() + ", " + WHISPER_MODELS[currentModel()].mb + " MB, one time, runs on this Mac; change the model in Settings), or transcribe in Premiere's Text panel and press Cmd+S, and the panel will continue when the save lands.", "Download Whisper", "Not now", "Use Premiere's transcription");
    if (!go) return err(card, "The user chose neither for now. Do not transcribe; ask what they would like to do.");
    if (go === "all") {
      waitForSavedTranscript();
      card.done("waiting for Premiere's transcript", true);
      return { text: "The user will transcribe in Premiere's Text panel and press Cmd+S. Tell them in one line: Text panel > Transcribe, then Cmd+S, and that you will continue automatically once the save lands. Then stop." };
    }
    setStatus("Downloading the Whisper model (one time)…");
    downloadWhisperModel().then((ok) => {
      if (!ok || !session || session.busy) return;
      setBusy(true); setStatus("Thinking…");
      try { session.send("[The Whisper model finished installing. Continue with the transcription the user asked for.]"); } catch (_) { setBusy(false); }
    });
    card.done("download started", true);
    return { text: "Whisper model download started (" + WHISPER_MODELS[currentModel()].mb + " MB). Tell the user in one line that it is downloading in the Settings tab and that you will continue automatically when it is installed. Then stop; do not call transcribe_whisper again until then." };
  }
  const outDir = project.path ? path.join(path.dirname(project.path), "_claude-for-adobe_transcripts") : os.tmpdir();
  const allCached = media.every((m) => cachedWords(m));
  if (!allCached) {
    // Runs outside the tool call: start, return now, nudge Claude when every file is done.
    runTranscriptionJob(card, media, { language, vad, write_transcript_json, outDir });
    return { text: "Transcription started for " + media.length + " file(s) (" + currentModel() + "). Tell the user in one line that it is running with a progress bar in the chat and that you will continue automatically when it is done. Then stop; do not call transcribe_whisper again until then." };
  }
  const lines = [];
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    if (!fs.existsSync(m)) { lines.push(path.basename(m) + ": media offline"); continue; }
    setStatus("Whisper: " + path.basename(m) + "…");
    card.progress(i, media.length, "transcribing " + path.basename(m) + " ");
    const t0 = Date.now();
    try {
      const r = await transcribe(m, { language, vad, onLog: log });
      let note = path.basename(m) + ": " + r.words.length + " words" + (r.cached ? " (cached)" : " (" + ((Date.now() - t0) / 1000).toFixed(0) + "s)");
      if (write_transcript_json) {
        fs.mkdirSync(outDir, { recursive: true });
        const f = path.join(outDir, path.basename(m) + ".transcript.json"); // .json: Premiere routes it through TextSegments.importFromJSON
        fs.writeFileSync(f, JSON.stringify(toPremiereTranscript(r.words, r.language), null, 2));
        note += " -> " + f;
      }
      lines.push(note);
    } catch (error) { lines.push(path.basename(m) + ": " + error.message); }
  }
  const text = lines.join("\n") + (write_transcript_json ? "\nTo make it Premiere's own transcript: Text panel > ... menu > Import > Import transcript, pick the .transcript.json for the clip. read_transcript and remove_pauses can use these words directly (source=whisper)." : "");
  card.done(text, true);
  setStatus("Thinking…");
  return { text };
}

// ffprobe on a clip's source file. The path must belong to a project item.
// Project panel housekeeping without the script hatch. Moves are Premiere project actions (Cmd+Z undoes each).
async function projectBins() {
  const card = addTool("project_bins", "");
  const text = await host("listBins");
  card.done(text.split("\n").slice(0, 25).join("\n") + (text.split("\n").length > 25 ? "\n…" : ""), true);
  return { text: text || "(empty project)" };
}
async function moveToBin({ moves = [] } = {}) {
  const list = (Array.isArray(moves) ? moves : []).filter((m) => m && m.item && m.bin).map((m) => [String(m.item), String(m.bin)]);
  const card = addTool("move_to_bin (" + list.length + ")", list.map((m) => m[0] + " -> " + m[1] + "/").join("\n"));
  if (!list.length) return err(card, "moves must be a list of { item, bin }");
  const text = await host("moveToBin", JSON.stringify(list));
  const failed = /^(not found|no bin|failed)/m.test(text);
  card.done(text, !failed);
  refreshProject();
  return { text: text + "\nUndo: Cmd+Z once per move.", isError: false };
}

// Cheap pass over every source file in the sequence: speech coverage (Silero VAD; Premiere's waveform when the
// codec cannot be decoded here, e.g. BRAW), duration, transcript presence, naming. Frames only where it says so.
async function classifyClips({ bin = "" } = {}) {
  const card = addTool("classify_clips" + (bin ? " (bin: " + bin + ")" : ""), "");
  card.open();
  const byMedia = new Map();
  let footage = "";
  if (bin) {
    const raw = await host("binMedia", bin);
    if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
    const rows = raw ? raw.split("\u0003").map((r) => r.split("\u0002")) : [];
    rows.forEach(([name, mediaPath, , videoInfo, timebase, dur]) => { byMedia.set(mediaPath, { name, clipSeconds: parseDuration(dur), videoInfo, timebase }); });
    const kinds = new Map(); rows.forEach(([, , , vi, tb]) => { const k = (vi || "?").replace(/\s*\(.*$/, "") + " @ " + (tb || "?"); kinds.set(k, (kinds.get(k) || 0) + 1); });
    footage = [...kinds].map(([k, n]) => n + " x " + k).join(", ");
  } else {
    let snap;
    try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
    snap.clips.filter((c) => c.mediaPath).forEach((c) => { const m = byMedia.get(c.mediaPath) || { name: c.name, clipSeconds: 0 }; m.clipSeconds += c.end - c.start; byMedia.set(c.mediaPath, m); });
  }
  if (!byMedia.size) return err(card, bin ? "no media in bin " + bin : "no clips with source media in the active sequence");
  let transcripts = [];
  if (project.path) { try { transcripts = listTranscripts(project.path); } catch (_) {} }
  const rows = [];
  let i = 0;
  for (const [mediaPath, m] of byMedia) {
    card.progress(i++, byMedia.size, "listening ");
    let speechSeconds = 0, duration = 0, method = "vad";
    try {
      const r = vadModule.speechSegments(mediaPath, {});
      speechSeconds = r.segments.reduce((n, s) => n + (s.end - s.start), 0);
      duration = Math.max(m.clipSeconds, r.segments.length ? r.segments[r.segments.length - 1].end : 0, mediaDurationFromPeak(mediaPath) || 0);
    } catch (_) {
      method = "waveform";
      const regions = speechRegionsFor(mediaPath) || [];
      speechSeconds = regions.reduce((n, s) => n + (s.end - s.start), 0);
      duration = mediaDurationFromPeak(mediaPath) || m.clipSeconds;
    }
    const hasTranscript = !!transcriptForClip(transcripts, { mediaPath, name: m.name }) || !!cachedWords(mediaPath);
    rows.push(classifyMedia({ name: path.basename(mediaPath), duration, speechSeconds, hasTranscript, method }));
  }
  rows.sort((a, b) => b.ratio - a.ratio);
  const text = (footage ? "footage: " + footage + "\n" : "") + formatClassification(rows) + "\n(speech % = seconds of detected speech / file length; 'look at a frame' = use preview_frames on that clip before deciding)";
  writeAnalysis((bin ? bin.replace(/\//g, "_") : (project.sequence || "sequence")) + ".classification.md", "# Classification of " + (bin ? "bin " + bin : "sequence " + (project.sequence || "")) + "\n\n" + text + "\n");
  card.done(text, true);
  setStatus("Thinking…");
  return { text };
}
function mediaDurationFromPeak(mediaPath) {
  try { const rate = PEAK_RATES.find((r) => findPeakFile(mediaPath, r, project.path)); const pek = rate && findPeakFile(mediaPath, rate, project.path); if (!pek) return 0; const p = parsePeakFile(pek); return p.pairsPerChannel * p.samplesPerPair / rate; } catch (_) { return 0; }
}

// "00;01;23;12" / "00:01:23:12" / seconds -> seconds (approximate for drop-frame; only used for coverage ratios).
function parseDuration(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  if (/^[\d.]+$/.test(t)) return Number(t);
  const p = t.split(/[:;]/).map(Number);
  if (p.length === 4) return p[0] * 3600 + p[1] * 60 + p[2] + p[3] / 30;
  if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 30;
  return 0;
}

// New sequence from a bin. Premiere matches the footage unless width/height/fps are given. Becomes the active sequence.
const SEQUENCE_PRESETS = { match: {}, vertical: { width: 1080, height: 1920 }, hd: { width: 1920, height: 1080 }, uhd: { width: 3840, height: 2160 } };
async function createSequence({ name = "", bin = "", width, height, fps, preset, insert_clips = true } = {}) {
  if (preset && SEQUENCE_PRESETS[preset]) ({ width = width, height = height } = SEQUENCE_PRESETS[preset]);
  const card = addTool("create_sequence " + (name || "(unnamed)"), "");
  if (!name) return err(card, "name is required");
  const raw = await host("createSequenceFromBin", bin, name, width ? String(width) : "", height ? String(height) : "", fps ? String(fps) : "", insert_clips ? "true" : "false");
  if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
  const [id, seqName, size] = raw.split("|");
  await refreshProject();
  timeline = await readSnapshot().catch(() => timeline);
  const text = "created sequence \"" + seqName + "\" (" + size + ")" + (insert_clips ? " with the bin's clips laid in order" : " empty") + "; it is now the active sequence. Undo: Cmd+Z.";
  card.done(text, true);
  return { text };
}

// Mute the audio of clips by source file (typically everything classify_clips called b-roll). Works on the duplicate.
async function muteClipAudio({ media_paths = [] } = {}) {
  const list = (Array.isArray(media_paths) ? media_paths : []).map(String).filter(Boolean);
  const card = addTool("mute_clip_audio (" + list.length + " file(s))", list.map((p) => path.basename(p)).join("\n"));
  if (!list.length) return err(card, "media_paths must list the source files whose audio to mute (from classify_clips / sequence_overview)");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const raw = await host("muteAudioFor", JSON.stringify(list));
  const ok = raw.indexOf("ERR:") !== 0;
  card.done(raw, ok);
  timeline = await readSnapshot().catch(() => timeline);
  return { text: copyNote + raw + (ok ? "\nUndo: Cmd+Z once per clip." : ""), isError: !ok };
}

// Deterministic phrase search over the transcript (Premiere's from the saved project, or Whisper's cache).
async function findInTranscript({ query = "", source = "auto" } = {}) {
  const card = addTool("find_in_transcript \"" + query + "\"", "");
  if (!query.trim()) return err(card, "query is required");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(0, Infinity)); } catch (error) { return err(card, error.message); }
  let transcripts = [];
  if (source !== "whisper" && project.path) { try { transcripts = listTranscripts(project.path); } catch (_) {} }
  const hits = [];
  clips.forEach((c) => {
    let words; try { words = wordsForClip(c, source, transcripts).words; } catch (_) { return; }
    findInWords(words, query, c.start - c.inPoint, 20).filter((h) => h.end > c.s0 && h.start < c.s1).forEach((h) => hits.push({ ...h, clip: c.name, track: c.track }));
  });
  hits.sort((a, b) => a.start - b.start);
  const text = hits.length ? hits.slice(0, 20).map((h) => "[" + tc(h.start) + "-" + tc(h.end) + "] " + h.track + " " + h.clip + ": …" + h.text + "…").join("\n") + (hits.length > 20 ? "\n(+" + (hits.length - 20) + " more)" : "") : "no match for \"" + query + "\" (try fewer words)";
  card.done(text, true);
  return { text: text + "\n(timestamps are sequence seconds; use them directly with extract_ranges / keep_only)" };
}

// Deterministic timeline surgery, no scripts: remove exact ranges, or keep only the given ranges.
async function extractRanges({ ranges = [], dry_run = true } = {}) {
  const card = addTool((dry_run ? "plan" : "extract") + "_ranges (" + ranges.length + ")", "");
  const cuts = (Array.isArray(ranges) ? ranges : []).map((r) => Array.isArray(r) ? { start: Number(r[0]), end: Number(r[1]) } : { start: Number(r.start), end: Number(r.end) }).filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start).sort((a, b) => b.start - a.start);
  if (!cuts.length) return err(card, "ranges must be [[start,end], ...] in sequence seconds");
  const total = cuts.reduce((n, c) => n + (c.end - c.start), 0);
  return applyCuts(card, cuts, dry_run, cuts.length + " range(s), " + total.toFixed(1) + "s removed");
}
async function keepOnly({ ranges = [], dry_run = true } = {}) {
  const card = addTool((dry_run ? "plan" : "keep") + "_only (" + ranges.length + " range(s))", "");
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const keep = (Array.isArray(ranges) ? ranges : []).map((r) => Array.isArray(r) ? { start: Number(r[0]), end: Number(r[1]) } : { start: Number(r.start), end: Number(r.end) }).filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  if (!keep.length) return err(card, "ranges must be [[start,end], ...] in sequence seconds");
  const cuts = complementRanges(keep, snap.duration).filter((c) => c.end - c.start >= 0.05).sort((a, b) => b.start - a.start);
  const total = cuts.reduce((n, c) => n + (c.end - c.start), 0);
  return applyCuts(card, cuts, dry_run, "keep " + keep.length + " range(s): remove " + cuts.length + " gap(s), " + total.toFixed(1) + "s, " + snap.duration.toFixed(1) + "s -> " + (snap.duration - total).toFixed(1) + "s");
}

async function mediaInfoTool({ media_path = "" }) {
  const card = addTool("media_info " + path.basename(media_path), "");
  if ((await host("isMediaPath", media_path)) !== "ok") return err(card, media_path + " is not the media path of any project item (use sequence_overview)");
  try { const text = mediaInfo(media_path); card.done(text, true); return { text }; }
  catch (error) { return err(card, error.message); }
}

const TOOLS = { run_extendscript: runExtendScript, sequence_overview: sequenceOverview, preview_frames: previewFrames, analyze_audio: analyzeAudio, remove_silences: removeSilences, remove_pauses: removePauses, read_transcript: readTranscript, transcribe_whisper: transcribeWhisper, media_info: mediaInfoTool, project_bins: projectBins, move_to_bin: moveToBin, classify_clips: classifyClips, create_sequence: createSequence, mute_clip_audio: muteClipAudio, find_in_transcript: findInTranscript, extract_ranges: extractRanges, keep_only: keepOnly };

const TOOL_DEFS = [
  { name: "sequence_overview", description: "Live snapshot of the active sequence: name, frame size, duration, and every clip per track with timeline start/end, source in point, and media path. Call this before planning edits instead of probing with scripts.",
    inputSchema: { type: "object", properties: {} } },
  { name: "remove_silences", description: "Remove non-speech ranges from the active sequence with Premiere's own Extract (all tracks, linked video+audio together, one History step per range). Default method 'vad': Silero voice activity detection on every audio clip's source; a range is cut only where audio exists and no clip has speech. Method 'db' uses Premiere's peak-file waveform instead. The default for silences, gaps, dead air, pauses. Call with dry_run=true first, show the plan, then apply with dry_run=false.",
    inputSchema: { type: "object", properties: { preset: { type: "string", enum: ["social", "natural"], description: "social = 0.35 s min / 0.05 s pad (default style); natural = 0.6 / 0.15" }, start_seconds: { type: "number" }, end_seconds: { type: "number", description: "Default: end of sequence." }, min_silence_s: { type: "number", description: "Shortest non-speech gap to cut, after padding. Default 0.5." }, pad_s: { type: "number", description: "Air kept on each side of a cut. Default 0.1." }, method: { type: "string", enum: ["vad", "db"], description: "Default vad." }, threshold_db: { type: "number", description: "db method only: absolute threshold in dBFS peak; default auto." }, dry_run: { type: "boolean", description: "true = plan only (default)." } } } },
  { name: "read_transcript", description: "Premiere's own transcript (what the Text panel shows) for the clips in the active sequence, as timestamped lines in sequence seconds. Read from the saved project file: the user transcribes in the Text panel and presses Cmd+S. Use it to answer what is said and when, find a phrase, or choose cut points by dialogue (then remove_silences/run_extendscript with those times). Optional range.",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number" }, end_seconds: { type: "number" }, source: { type: "string", enum: ["auto", "premiere", "whisper"], description: "auto = Whisper cache if present, else Premiere's transcript." } } } },
  { name: "remove_pauses", description: "Transcript method, what Premiere's Text panel 'Delete all pauses' does: a pause is a gap between transcript words >= min_pause_s (Premiere default 0.75). Transcript source: a cached Whisper transcript (run transcribe_whisper) or Premiere's own from the saved project (Text panel > Transcribe, then Cmd+S). With require_quiet the waveform vetoes gaps that have sound. Same Extract apply as remove_silences. Use when the user says pauses.",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number" }, end_seconds: { type: "number" }, min_pause_s: { type: "number", description: "Default 0.75, Premiere's Text panel default." }, pad_s: { type: "number", description: "Default 0." }, require_quiet: { type: "boolean", description: "Default true." }, source: { type: "string", enum: ["auto", "premiere", "whisper"], description: "auto = Whisper cache if present, else Premiere's transcript." }, dry_run: { type: "boolean", description: "true = plan only (default)." } } } },
  { name: "transcribe_whisper", description: "Transcribe every audio clip's source media in the active sequence with Whisper large-v3-turbo locally (bundled whisper.cpp, word timestamps; the model downloads once on first use), cached per media file. Writes Premiere-format .transcript.json files the user can import in the Text panel (... menu > Import > Import transcript) so Premiere's own transcript features work on it. Use when the user asks for a Whisper transcript, or before remove_pauses when there is no transcript.",
    inputSchema: { type: "object", properties: { language: { type: "string", description: "ISO code like en; default auto-detect." }, write_transcript_json: { type: "boolean", description: "Default true." }, vad: { type: "boolean", description: "Default true: only decode speech regions found in Premiere's waveform (avoids hallucinated text in silence)." } } } },
  { name: "run_extendscript", description: "Execute ExtendScript inside the open Premiere Pro project and return the value of the final expression. Escape hatch for anything the other tools do not cover. Mutating scripts run on a duplicate sequence.",
    inputSchema: { type: "object", properties: { summary: { type: "string", description: "One line, shown to the user." }, code: { type: "string", description: "ES3 ExtendScript. End with a result expression." } }, required: ["summary", "code"] } },
  { name: "analyze_audio", description: "For every audio clip overlapping a timeline range of the active sequence: levels per window, a waveform sparkline, and silence ranges, in timeline seconds. Read from Premiere's own peak-file waveform cache. Use to answer questions about audio, not before remove_silences (it measures on its own).",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number" }, end_seconds: { type: "number" }, window_ms: { type: "number", description: "Window size, default 100 ms; auto-widened for long ranges." } }, required: ["end_seconds"] } },
  { name: "preview_frames", description: "Render up to 6 frames of the active sequence at the given timeline positions and return them as images. Only when the user asks what something looks like; never to verify edits.",
    inputSchema: { type: "object", properties: { seconds: { type: "array", items: { type: "number" } }, max_px: { type: "number", description: "Longest edge in pixels, default 512." } }, required: ["seconds"] } },
  { name: "find_in_transcript", description: "Deterministic search for a phrase in the transcript. Returns every match with sequence timecodes and a little context. Use this instead of reading the transcript to find where something is said.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, source: { type: "string", enum: ["auto", "premiere", "whisper"] } }, required: ["query"] } },
  { name: "extract_ranges", description: "Remove exact time ranges from the active sequence (all tracks, ripple), in sequence seconds. Deterministic; each range is one Cmd+Z step. Plan with dry_run=true first.",
    inputSchema: { type: "object", properties: { ranges: { type: "array", items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } }, dry_run: { type: "boolean" } }, required: ["ranges"] } },
  { name: "keep_only", description: "Keep only the given time ranges of the active sequence and remove everything else (a selects-based cut: 'keep 0:12-0:41 and 1:03-1:30'). Deterministic. Plan with dry_run=true first.",
    inputSchema: { type: "object", properties: { ranges: { type: "array", items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } }, dry_run: { type: "boolean" } }, required: ["ranges"] } },
  { name: "mute_clip_audio", description: "Disable (mute) the audio of every clip in the active sequence whose source file is listed. Use it on the files classify_clips called b-roll so their sound never fights the talking head. Undoable per clip.",
    inputSchema: { type: "object", properties: { media_paths: { type: "array", items: { type: "string" } } }, required: ["media_paths"] } },
  { name: "create_sequence", description: "Create a new sequence from the media in a bin (nested bins included). Without width/height/fps Premiere matches the first clip's settings; give width, height, fps to force e.g. 1080x1920 @ 23.976 for a vertical social cut. insert_clips=true lays the bin's clips in order as a starting assembly; false creates it empty. Becomes the active sequence. Ask the user for settings and name first.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, bin: { type: "string", description: "bin path; empty = project root" }, preset: { type: "string", enum: ["match", "vertical", "hd", "uhd"], description: "match = the footage; vertical = 1080x1920; hd = 1920x1080; uhd = 3840x2160" }, width: { type: "number" }, height: { type: "number" }, fps: { type: "number" }, insert_clips: { type: "boolean", description: "default true" } }, required: ["name"] } },
  { name: "classify_clips", description: "Cheap first pass over every source file in a bin (give bin) or in the active sequence: speech coverage (voice detection), length, whether a transcript exists, camera-original naming, footage sizes and frame rates, and a guess (talking head / b-roll / mixed / silent) with confidence. Run this first when asked to edit, assemble, or find the talking head. Only clips marked 'look at a frame' need preview_frames.",
    inputSchema: { type: "object", properties: { bin: { type: "string", description: "bin path like 'Footage/Day 2'; omit for the active sequence" } } } },
  { name: "project_bins", description: "The Project panel as a tree: bins (ending in /, with item counts) and the items inside them, including loose items at the root. Call before organizing.",
    inputSchema: { type: "object", properties: {} } },
  { name: "move_to_bin", description: "Move project items into bins, creating bins as needed. Use this for organizing the Project panel instead of scripts. Each move is one Cmd+Z step. item = name or bin/name path; bin = bin path like '_ASSETS' or 'Footage/Day 2'.",
    inputSchema: { type: "object", properties: { moves: { type: "array", items: { type: "object", properties: { item: { type: "string" }, bin: { type: "string" } }, required: ["item", "bin"] } } }, required: ["moves"] } },
  { name: "media_info", description: "ffprobe a clip's source file (media path from sequence_overview): container, duration, video resolution/fps, audio sample rate/channels.",
    inputSchema: { type: "object", properties: { media_path: { type: "string" } }, required: ["media_path"] } },
];

// ---- claude session ---------------------------------------------------------------------------

function onEvent(event) {
  if (event.kind === "ready") { log("claude session " + event.sessionId + " · " + event.model); if (event.model) setStatus("Ready · " + modelLabel(event.model)); }
  else if (event.kind === "delta") {
    if (!liveMessage) liveMessage = addMessage("assistant", "");
    liveMessage.textContent += event.text;
    ui.messages.scrollTop = ui.messages.scrollHeight;
  }
  else if (event.kind === "text") { if (liveMessage) { liveMessage.textContent = event.text; liveMessage = null; } else addMessage("assistant", event.text); }
  else if (event.kind === "tool_use") { liveMessage = null; log("tool_use " + event.name); }
  else if (event.kind === "turn_done") {
    liveMessage = null;
    readSnapshot().then((snap) => { timeline = snap; }).catch(() => {});
    const modelError = event.isError && /issue with the selected model|not have access|unrecognized_model|model .*not (found|available)/i.test(event.text || "");
    if (modelError && ui.model.value !== MODEL_FALLBACK && lastPayload) {
      addMessage("assistant muted", modelLabel(ui.model.value) + " isn't available on this account. Switching to " + modelLabel(MODEL_FALLBACK) + " and sending your message again.");
      ui.model.value = MODEL_FALLBACK;
      const payload = lastPayload;
      restartSession(event.sessionId).then(() => { if (session && !session.busy) { setBusy(true); setStatus("Thinking…"); session.send(payload); } });
      return;
    }
    if (event.isError) addMessage("assistant error", event.text || "Claude returned an error.");
    const used = (event.modelsUsed || []).map(modelLabel).join(" + ");
    setStatus("Ready" + (used ? " · " + used : "") + (event.costUsd ? " · $" + event.costUsd.toFixed(3) + " this session" : ""));
    setBusy(false);
  }
  else if (event.kind === "log") log(event.text);
  else if (event.kind === "exit") {
    const wasBusy = session && session.busy;
    const id = session && session.sessionId;
    session = null;
    liveMessage = null;
    log("claude exited " + event.code + (event.text ? ": " + event.text.slice(0, 300) : ""));
    if (event.text) addMessage("assistant error", event.text);
    if (wasBusy) addMessage("assistant error", "Claude exited mid-turn (" + event.code + "). Restarting with the conversation kept.");
    restartSession(id);
  }
}

function restartSession(resumeSessionId) {
  if (restarting) return restarting;
  restarting = (async () => {
    const old = session;
    session = null;
    sessionGen += 1;
    const gen = sessionGen;
    setStatus("Starting Claude…");
    setBusy(true);
    if (old) await old.stop();
    try {
      const next = createClaudeSession({
        mcpUrl: mcp.url, mcpToken: mcp.token, model: ui.model.value, resumeSessionId, cwd: extensionRoot, readPaths: [analysisDir()],
        capabilities: "Whisper model: " + whisperState() + (modelReady() ? "" : " (transcribe_whisper will ask the user to download it, " + WHISPER_MODELS[currentModel()].mb + " MB, one time; Premiere's own Transcribe + Cmd+S is the alternative)") + ". Voice silence detection: " + (process.arch === "arm64" ? "ready" : "unavailable on this Mac, level method only") + ".",
        onEvent: (event) => { if (gen === sessionGen) onEvent(event); },
      });
      if (gen !== sessionGen) { next.stop(); return; }
      session = next;
      setStatus("Ready · " + ui.model.value);
      setBusy(false);
    } catch (error) {
      setStatus(error.message, "error");
      addMessage("assistant error", error.message);
      setBusy(false);
    }
  })().finally(() => { restarting = null; });
  return restarting;
}

async function sendMessage() {
  const text = ui.input.value.trim() || (attachments.length ? "(see the attached image" + (attachments.length > 1 ? "s" : "") + ")" : "");
  if (!text || !session || session.busy) return;
  addMessage("user", text + (attachments.length ? "\n[" + attachments.length + " image" + (attachments.length > 1 ? "s" : "") + " attached]" : ""));
  ui.input.value = "";
  liveMessage = null;
  let payload = text;
  if (pendingChanges.length) {
    // Collapsed card in the panel, grouped summary for Claude; the raw list stays inside the card.
    const grouped = summarizeChanges(pendingChanges);
    const card = document.createElement("details"); card.className = "tool";
    card.innerHTML = "<summary></summary><pre class=\"result muted\"></pre>";
    card.querySelector("summary").textContent = "▸ " + pendingChanges.length + " timeline change" + (pendingChanges.length === 1 ? "" : "s") + " in Premiere since your last message";
    card.querySelector("pre").textContent = grouped.join("\n") + (grouped.length < pendingChanges.length ? "\n\nAll " + pendingChanges.length + ":\n" + pendingChanges.join("\n") : "");
    ui.messages.appendChild(card);
    payload = "[Timeline changes the user made in Premiere since your last turn, from Premiere's own sequence events; take them as current state and do not list them back:\n- " + grouped.join("\n- ") + "]\n\n" + text;
    pendingChanges = [];
  }
  // Attach what is highlighted in Premiere, so "this bin" / "these clips" needs no typing.
  try {
    const sel = await host("selectionInfo");
    log("selection: " + (sel ? sel.split("\u0003").join("; ") : "(none)"));
    if (sel && sel.indexOf("ERR:") !== 0) payload = "[Selected in Premiere right now: " + sel.split("\u0003").join("; ") + "]\n\n" + payload;
  } catch (_) {}
  lastPayload = payload;
  const images = attachments.splice(0).map((a) => ({ mediaType: a.mediaType, data: a.data }));
  renderAttachments();
  setBusy(true);
  setStatus("Thinking…");
  try { session.send(payload, images); } catch (error) { addMessage("assistant error", error.message); setBusy(false); }
}

async function boot() {
  try {
    await loadHostScript();
    mcp = await createMcpServer({ tools: TOOL_DEFS, onCall: (name, args) => TOOLS[name](args), onLog: log });
    log("mcp server at " + mcp.url);
    await refreshProject();
    setInterval(() => { refreshProject().catch(() => {}); }, PROJECT_POLL_MS);
    await bindHostEvents();
    await snapshotTimeline();
    renderCopies();
    await restartSession();
  } catch (error) {
    setStatus(error.message, "error");
    log("boot failed: " + error.message);
  }
}

// Buttons: the same scripts the tools run, with no model in the loop. Plan, confirm, apply.
async function runCutButton(tool, params, label) {
  if (session && session.busy) { addMessage("assistant error", "Wait for Claude to finish (or press Stop) first."); return; }
  ui.btnCut.disabled = true;
  const card = addTool(label, "");
  card.open();
  quietCard = card;
  try {
    card.progress(0, 1, "finding silences ");
    const plan = await tool({ ...params, dry_run: true });
    if (plan.isError) { card.done(plan.text.replace(/^CLAUDE_FOR_ADOBE_ERROR:/, ""), false); return; }
    const summary = plan.text.split("\n")[0].replace(/^PLAN \(nothing changed\): /, "");
    const m = /^(\d+) [^,]+, ([\d.]+)s total, sequence ([\d.]+)s -> ([\d.]+)s/.exec(summary);
    if (!m || m[1] === "0") { card.done("Nothing to cut. " + summary, true); return; }
    const result = await tool({ ...params, dry_run: false });
    const p = await readProject().catch(() => ({}));
    const where = p.sequence ? " on \"" + p.sequence + "\"" : "";
    card.done(result.isError
      ? result.text.replace(/^CLAUDE_FOR_ADOBE_ERROR:/, "")
      : m[1] + " silences removed, " + m[2] + "s cut, " + m[3] + "s -> " + m[4] + "s" + where + ". Cmd+Z undoes one range at a time.", !result.isError);
    setStatus("Ready");
  } finally { quietCard = null; ui.btnCut.disabled = false; }
}
ui.btnCut.onclick = () => runCutButton(removeSilences, { method: ui.cutMethod.value, min_silence_s: Number(ui.minSilence.value), pad_s: Number(ui.pad.value) }, "Cut silences " + (ui.cutMethod.value === "vad" ? "by voice" : "by level"));
// The bundled voice model is Apple Silicon only: on other Macs default to the level method and say why.
if (process.arch !== "arm64") { ui.cutMethod.value = "db"; ui.cutMethod.querySelector('[value="vad"]').disabled = true; ui.cutMethod.title = "Voice detection needs an Apple Silicon Mac; using the level method."; }

document.querySelectorAll("#starter [data-prompt]").forEach((b) => { b.onclick = () => { ui.input.value = b.dataset.prompt; ui.input.focus(); }; });
// Whisper model row: the one big download, visible and under the user's control. Also tells Claude what is available.
function whisperState() { const inst = installedModels(); return (modelReady() ? "ready (" + currentModel() + ")" : "not downloaded (" + currentModel() + " chosen)") + (inst.length && !modelReady() ? "; installed: " + inst.join(", ") : ""); }
function renderModelRow() {
  if (!ui.whisperModel.options.length) {
    Object.entries(WHISPER_MODELS).forEach(([k, m]) => { const o = document.createElement("option"); o.value = k; o.textContent = m.label; ui.whisperModel.appendChild(o); });
    try { setModel(localStorage.getItem("whisperModel") || currentModel()); } catch (_) {}
    ui.whisperModel.value = currentModel();
  }
  const ready = modelReady();
  ui.modelState.textContent = "Whisper: " + (ready ? "installed" : "not installed");
  ui.btnWhisperModel.hidden = ready;
  ui.btnWhisperModel.textContent = "Download (" + WHISPER_MODELS[currentModel()].mb + " MB)";
}
ui.whisperModel.onchange = () => { setModel(ui.whisperModel.value); try { localStorage.setItem("whisperModel", currentModel()); } catch (_) {} renderModelRow(); };
async function downloadWhisperModel() {
  ui.btnWhisperModel.disabled = true; ui.whisperModel.disabled = true; ui.modelBar.hidden = false;
  try {
    await ensureModel((got, total) => { ui.modelBar.querySelector("i").style.width = (total ? Math.round(100 * got / total) : 0) + "%"; ui.modelState.textContent = "Downloading " + currentModel() + ": " + Math.round(got / 1048576) + (total ? " / " + Math.round(total / 1048576) : "") + " MB"; });
    addMessage("assistant muted", "Whisper " + currentModel() + " installed. Transcription runs on this Mac.");
  } catch (error) { addMessage("assistant error", "Model download failed: " + error.message + ". Check your internet connection and try again."); }
  finally { ui.btnWhisperModel.disabled = false; ui.whisperModel.disabled = false; ui.modelBar.hidden = true; renderModelRow(); }
  return modelReady();
}
ui.btnWhisperModel.onclick = downloadWhisperModel;
renderModelRow();

// Update check: once per launch, and on demand. The bottom button IS the update: it turns into
// "Update to x.y.z" when a newer release exists and installs on click.
let pendingUpdate = null;
function setVersionRow(text) { ui.versionRow.firstChild.textContent = text + " "; }
async function checkUpdates(announce) {
  ui.checkUpdates.disabled = true; ui.checkUpdates.textContent = "Checking…";
  log("checking for updates (installed " + currentVersion(extensionRoot) + ")");
  let update = null;
  try { update = await Promise.race([checkForUpdate(extensionRoot), new Promise((_, rej) => setTimeout(() => rej(new Error("no answer from GitHub within 30 s")), 30000))]); }
  catch (error) { const why = /abort|no answer|ENOTFOUND|EAI_AGAIN|Failed to fetch|timeout/i.test(error.message) ? "no answer from GitHub. Check your internet connection or VPN, then try again." : error.message; log("update check skipped: " + error.message); ui.checkUpdates.textContent = "Check for updates"; ui.checkUpdates.disabled = false; if (announce) addMessage("assistant muted", "Could not check for updates: " + why); return; }
  ui.checkUpdates.disabled = false;
  if (!update) {
    pendingUpdate = null;
    tabSettings.textContent = "Settings"; tabSettings.classList.remove("attention");
    setVersionRow("v" + currentVersion(extensionRoot) + " · up to date");
    ui.checkUpdates.textContent = "Check for updates"; ui.checkUpdates.className = "utility";
    log("up to date (" + currentVersion(extensionRoot) + ")");
    return;
  }
  pendingUpdate = update;
  tabSettings.textContent = "Settings · update"; tabSettings.classList.add("attention");
  setVersionRow("v" + currentVersion(extensionRoot) + " · " + update.version + " available");
  ui.checkUpdates.textContent = "Update to " + update.version; ui.checkUpdates.className = "accent";
  ui.checkUpdates.title = "Downloads the release from GitHub, verifies its checksum, and installs it. " + update.notesUrl;
  if (announce) addMessage("assistant muted", "Version " + update.version + " is available. Use the Update button at the bottom.");
}
async function installPending() {
  const update = pendingUpdate; if (!update) return;
  ui.checkUpdates.disabled = true; ui.checkUpdates.textContent = "Updating…";
  try {
    const v = await installUpdate(update, extensionRoot);
    pendingUpdate = null;
    setVersionRow("v" + v + " installed, restarting");
    ui.checkUpdates.textContent = "Restarting…"; ui.checkUpdates.className = "accent"; ui.checkUpdates.disabled = true;
    // Reload the panel in place: stop the Claude process and the local server first so nothing is orphaned.
    try { if (session) await session.stop(); } catch (_) {}
    try { if (mcp) mcp.close(); } catch (_) {}
    setTimeout(() => location.reload(), 400);
  } catch (error) {
    ui.checkUpdates.disabled = false; ui.checkUpdates.textContent = "Update to " + update.version;
    addMessage("assistant error", "Update failed: " + error.message);
  }
}
setVersionRow("v" + currentVersion(extensionRoot));
ui.checkUpdates.onclick = () => (pendingUpdate ? installPending() : checkUpdates(true));
setTimeout(() => checkUpdates(false), 4000);
// Persistent choice: ask before scripts (default on).
try { ui.askScripts.checked = localStorage.getItem("askScripts") !== "no"; } catch (_) {}
ui.askScripts.onchange = () => { try { localStorage.setItem("askScripts", ui.askScripts.checked ? "yes" : "no"); } catch (_) {} };
// Live "what is selected in Premiere" line above the message box. Polled: the Project panel has no selection event.
let lastSelection = "";
async function refreshSelectionLine() {
  if (!document.getElementById("view-chat").classList.contains("active")) return;
  let sel = "";
  try { sel = await host("selectionInfo"); } catch (_) {}
  if (sel === lastSelection) return;
  lastSelection = sel;
  const chip = ui.selectionChip;
  if (!sel || sel.indexOf("ERR:") === 0) { chip.hidden = true; showAttachmentsRow(); return; }
  chip.innerHTML = "";
  const b = document.createElement("b"); b.textContent = "Selected";
  chip.append(b, document.createTextNode(sel.split("\u0003").join(" · ").replace(/^Project panel: /, "").replace(/; Timeline: /, " · ")));
  chip.hidden = false;
  showAttachmentsRow();
}
function showAttachmentsRow() { ui.attachments.style.display = (!ui.selectionChip.hidden || attachments.length) ? "flex" : "none"; }
setInterval(refreshSelectionLine, 800);
["mouseenter", "focus"].forEach((ev) => window.addEventListener(ev, refreshSelectionLine, true));

// Drops and pastes. Without this, dropping a file makes the embedded browser navigate to it and the panel is gone.
const attachments = []; // [{ name, mediaType, data }]
function renderAttachments() {
  [...ui.attachments.querySelectorAll(".chip:not(.sel)")].forEach((c) => c.remove());
  attachments.forEach((a, i) => {
    const chip = document.createElement("span"); chip.className = "chip";
    const img = document.createElement("img"); img.src = "data:" + a.mediaType + ";base64," + a.data; img.alt = a.name;
    const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.title = "Remove"; x.onclick = () => { attachments.splice(i, 1); renderAttachments(); };
    chip.append(img, document.createTextNode(a.name), x); ui.attachments.appendChild(chip);
  });
  showAttachmentsRow();
}
function addFiles(files) {
  [...files].forEach((file) => {
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      if (file.size > 20 * 1024 * 1024) { addMessage("assistant error", file.name + " is over 20 MB; not attached."); return; }
      const r = new FileReader();
      r.onload = () => { attachments.push({ name: file.name || "image", mediaType: file.type, data: String(r.result).split(",")[1] }); renderAttachments(); };
      r.readAsDataURL(file);
    } else if (/^text\/|\.(txt|srt|vtt|md|json|csv|edl|xml)$/i.test(file.type + " " + file.name)) {
      const r = new FileReader();
      r.onload = () => { ui.input.value += (ui.input.value ? "\n\n" : "") + "--- " + file.name + " ---\n" + String(r.result).slice(0, 200000); };
      r.readAsText(file);
    } else {
      const p = file.path || file.name;
      ui.input.value += (ui.input.value ? "\n" : "") + "File: " + p;
    }
  });
}
["dragenter", "dragover"].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); document.body.classList.add("dropping"); }));
["dragleave", "dragend"].forEach((ev) => document.addEventListener(ev, () => document.body.classList.remove("dropping")));
document.addEventListener("drop", (e) => { e.preventDefault(); document.body.classList.remove("dropping"); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); else { const t = e.dataTransfer && e.dataTransfer.getData("text"); if (t) ui.input.value += (ui.input.value ? "\n" : "") + t; } ui.input.focus(); });
ui.input.addEventListener("paste", (e) => { const files = e.clipboardData && [...e.clipboardData.files]; if (files && files.length) { e.preventDefault(); addFiles(files); } });
// Analysis files next to the project: what the tools write, what Claude (or its subagent) may read.
function analysisDir() { return project.path ? path.join(path.dirname(project.path), "_claude-for-adobe_analysis") : path.join(os.tmpdir(), "claude-for-adobe-analysis"); }
function writeAnalysis(name, text) {
  const dir = analysisDir(); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name.replace(/[\/\\:]/g, "_")); fs.writeFileSync(f, text); return f;
}
// Chat / Settings tabs.
const tabChat = document.getElementById("tab-chat"), tabSettings = document.getElementById("tab-settings");
function showView(which) {
  document.getElementById("view-chat").classList.toggle("active", which === "chat");
  document.getElementById("view-settings").classList.toggle("active", which === "settings");
  tabChat.classList.toggle("active", which === "chat"); tabSettings.classList.toggle("active", which === "settings");
  if (which === "chat") ui.input.focus();
}
tabChat.onclick = () => showView("chat"); tabSettings.onclick = () => showView("settings");
ui.send.onclick = sendMessage;
ui.input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
ui.stop.onclick = () => restartSession(session && session.sessionId);
ui.restart.onclick = () => { ui.messages.innerHTML = ""; allowScriptsThisSession = false; restartSession(); };
ui.model.onchange = () => restartSession(session && session.sessionId);

boot();
