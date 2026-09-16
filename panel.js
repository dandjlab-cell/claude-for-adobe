const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// CEP hands back a file: URL with percent-encoding; require() needs a plain path.
const extensionRoot = decodeURIComponent(window.__adobe_cep__.getSystemPath("extension").replace(/^file:\/{0,2}/, ""));
const { buildExtendScriptWrapper, inspectExtendScript, isCapabilityRejection } = require(path.join(extensionRoot, "src", "core.cjs"));
const { createCheckpoint, createHoldingCopy, listCheckpoints, revertCheckpoint } = require(path.join(extensionRoot, "src", "checkpoint.cjs"));
const { createMcpServer } = require(path.join(extensionRoot, "src", "mcp-http.cjs"));
const { createClaudeSession, availableModels, readClaudeJson } = require(path.join(extensionRoot, "src", "claude-session.cjs"));
const { createCodexSession, codexModels, readCodexCatalog, readCodexConfig } = require(path.join(extensionRoot, "src", "codex-session.cjs"));
const { checkForUpdate, currentVersion, installUpdate } = require(path.join(extensionRoot, "src", "update.cjs"));
const { classifyMedia, formatClassification } = require(path.join(extensionRoot, "src", "classify.cjs"));
const { cuesFromWords, toSRT } = require(path.join(extensionRoot, "src", "captions.cjs"));
const vadModule = require(path.join(extensionRoot, "src", "vad.cjs"));
const { MAX_WINDOWS, audioLevels, formatPeakWindows, mediaInfo, mediaDims, resizeImage, frameMatchShare } = require(path.join(extensionRoot, "src", "media.cjs"));
const { measure: measureScopes, report: scopeReport, decodeRgb, decodeGray, maskRgb, renderScopes } = require(path.join(extensionRoot, "src", "scopes.cjs"));
const { steer: steerGrade, planShot: planGradeShot, PARAMS: GRADE_PARAMS, STATISTICS: GRADE_STATS, damage: gradeDamage, allowance: gradeAllowance, unsafe: gradeUnsafe } = require(path.join(extensionRoot, "src", "grade.cjs"));
const { solveKnob: gradeSolveKnob, predict: gradePredict } = require(path.join(extensionRoot, "src", "grade_model.cjs"));
const { goalsFor: gradeGoalsFor, padsFor: gradePadsFor, temperatureFor: gradeTemperatureFor, levelsFor: gradeLevelsFor, satCurveFor: gradeSatCurveFor, skinFor: gradeSkinFor, SKIN_HUE: GRADE_SKIN_HUE, SKIN_SAT: GRADE_SKIN_SAT, SKIN_HUE_TARGET: GRADE_SKIN_HUE_TARGET, HSL_PAD: GRADE_HSL_PAD, verdict: gradeVerdict, ACCEPT: GRADE_ACCEPT, LEVELS_CAP: GRADE_LEVELS_CAP } = require(path.join(extensionRoot, "src", "grade_rules.cjs"));
const { parse: parseCurves, format: formatCurves, isIdentity: curvesIdentity, levels: curveLevels, parseSingle: parseSatCurve, formatSingle: formatSatCurve } = require(path.join(extensionRoot, "src", "curves.cjs"));
const { skinKeyFrom, keyedPixels, spills: skinSpills, EMPTY_KEY: EMPTY_HSL_KEY } = require(path.join(extensionRoot, "src", "skin.cjs"));
const { parse: parseWheels, format: formatWheels, castAt: wheelCastAt, nudgeLuma: wheelNudgeLuma, nudgePad: wheelNudgePad, predictPads: wheelPredictPads } = require(path.join(extensionRoot, "src", "wheels.cjs"));
const { frameRgb: sourceFrameRgb, sourceSeconds: toSourceSeconds } = require(path.join(extensionRoot, "src", "source_frame.cjs"));
const { FFMPEG } = require(path.join(extensionRoot, "src", "media.cjs"));
const { findPeakFile, parsePeakFile, peakWindows } = require(path.join(extensionRoot, "src", "pek.cjs"));
const { diffSnapshots, formatSnapshot, parseSnapshot, summarizeChanges, isGraphic, isGuide, topFootageAt, firstVisibleTime, seams } = require(path.join(extensionRoot, "src", "timeline.cjs"));
const { fitRegion, visibleSourceRect, roiInFrame, inside: rectInside } = require(path.join(extensionRoot, "src", "frame.cjs"));
const { captionBlocks, captionStyle, updateCaptionStyles, readProjectXml, writeProjectXml } = require(path.join(extensionRoot, "src", "prproj.cjs"));
const { loudIntervals, planCuts, silencesFrom, union } = require(path.join(extensionRoot, "src", "silence.cjs"));
const { DEFAULT_MIN_PAUSE, complementRanges, decodeWords, fillerRanges, findInWords, linesFromWords, listTranscripts, pausesFromWords, tc, transcriptForClip } = require(path.join(extensionRoot, "src", "transcript.cjs"));
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

const EXTENSION_ID = (() => { try { return window.__adobe_cep__.getExtensionId() || "com.claude-for-adobe.premiere"; } catch (_) { return "com.claude-for-adobe.premiere"; } })(); // the dev panel has its own id
const TOOL_TIMEOUT_MS = 180000; // a modal dialog in Premiere can hang evalScript forever; the turn must still finish
const PROJECT_POLL_MS = 1000;
const COL = "", ROW = "";
const HOST_EVENT = "com.claude-for-adobe.host";
const HOST_EVENTS = ["onActiveSequenceStructureChanged", "onActiveSequenceTrackItemAdded", "onActiveSequenceTrackItemRemoved",
  "onActiveSequenceSelectionChanged", "onSequenceActivated", "onActiveSequenceChanged", "onProjectChanged", "onItemsAddedToProjectSuccess"];
const PEAK_RATES = [48000, 44100, 96000, 32000];

const $ = (id) => document.getElementById(id);
const ui = { messages: $("messages"), input: $("input"), send: $("send"), stop: $("stop"), status: $("status"), project: $("project-name"), model: $("model"), agent: $("agent"), newChat: $("new-chat"), newClaude: $("new-claude"), newCodex: $("new-codex"), checkpoints: $("checkpoints"), log: $("log"), requireCheckpoint: $("require-checkpoint"), dupSequence: $("dup-sequence"), askScripts: $("ask-scripts"), attachments: $("attachments"), selectionBar: $("selection-bar"), modelState: $("model-state"), whisperModel: $("whisper-model"), btnWhisperModel: $("btn-whisper-model"), modelBar: $("model-bar"), versionRow: $("version-row"), checkUpdates: $("check-updates"), dumpSurface: $("dump-surface"), probeLeads: $("probe-leads"), bugReport: $("bug-report"), openIssues: $("open-issues"), jobBar: $("job-bar"), jobName: $("job-name"), jobLabel: $("job-label"), jobFill: $("job-fill"), copyChat: $("copy-chat"), copies: $("copies"), btnCut: $("btn-cut"), cutOptions: $("cut-options"), btnRunCut: $("btn-run-cut"), btnCancelCut: $("btn-cancel-cut"), btnCaptions: $("btn-captions"), captionOptions: $("caption-options"), btnMakeCaptions: $("btn-make-captions"), btnCancelCaptions: $("btn-cancel-captions"), capWords: $("cap-words"), capLines: $("cap-lines"), capSeconds: $("cap-seconds"), cutMethod: $("cut-method"), minSilence: $("min-silence"), pad: $("pad") };

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

// Keep the message list pinned to the newest message only while the reader is already at the bottom; once they
// scroll up to read, progress ticks and new cards must not drag the view back down.
// The document must never be the thing that scrolls (a focus() or scrollTop on a non-scrolling element can drift it
// and leave the whole panel offset). Any such drift is undone at once, and on every resize.
const resetPageScroll = () => { try { if (window.scrollX || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } } catch (_) {} };
window.addEventListener("scroll", resetPageScroll, { passive: true });
window.addEventListener("resize", resetPageScroll);
document.addEventListener("DOMContentLoaded", resetPageScroll);
setTimeout(resetPageScroll, 0);

// Keep the message list pinned to the newest message unless the reader has scrolled up to read. The decision is
// taken from the reader's last scroll position, never from the geometry after new content landed (measuring
// afterwards made any card taller than the margin stop the list from following, which read as "stuck").
let stickToBottom = true;
ui.messages.addEventListener("scroll", () => { stickToBottom = ui.messages.scrollHeight - ui.messages.scrollTop - ui.messages.clientHeight < 80; }, { passive: true });
function followBottom(el) { if (el !== ui.messages || stickToBottom) el.scrollTop = el.scrollHeight; }

function evalScript(code) {
  return new Promise((resolve) => window.__adobe_cep__.evalScript(code, (result) => resolve(String(result == null ? "" : result))));
}

// Call a PCX host function (host/premiere.jsx). Arguments are passed as strings.
function host(fn, ...args) {
  const t0 = Date.now();
  return evalScript("PCX." + fn + "(" + args.map((a) => JSON.stringify(String(a))).join(",") + ")").then((r) => {
    const ms = Date.now() - t0;
    hostTime.ms += ms; hostTime.calls++;
    if (ms >= 400) log("host " + fn + " took " + ms + "ms"); // slow bridge calls are where a long tool run goes
    return r;
  });
}
const hostTime = { ms: 0, calls: 0 }; // running totals: a tool can diff them to say what its bridge calls cost

async function loadHostScript() {
  const out = await evalScript(fs.readFileSync(path.join(extensionRoot, "host", "premiere.jsx"), "utf8"));
  if (out !== "PCX loaded") throw new Error("host script failed to load: " + out);
  log("host script loaded");
}

// ---- ui helpers ---------------------------------------------------------------------------------

// The full log lives in memory for the session and on disk (~/Library/Logs/claude-for-adobe/panel-<date>.log);
// the pane shows only the tail. Copy log and the bug report read the full log, never the pane.
const fullLog = [];
const LOG_DIR = path.join(os.homedir(), "Library", "Logs", "claude-for-adobe");
const LOG_FILE = path.join(LOG_DIR, "panel-" + new Date().toISOString().slice(0, 10) + ".log");
let logFileOk = null;
function log(text) {
  const line = new Date().toLocaleTimeString() + " " + text;
  fullLog.push(line);
  if (fullLog.length > 20000) fullLog.splice(0, fullLog.length - 20000);
  if (logFileOk !== false) { try { if (logFileOk === null) { fs.mkdirSync(LOG_DIR, { recursive: true }); logFileOk = true; } fs.appendFileSync(LOG_FILE, line + "\n"); } catch (_) { logFileOk = false; } }
  ui.log.textContent = (ui.log.textContent + "\n" + line).slice(-8000);
  ui.log.scrollTop = ui.log.scrollHeight;
}

const MODEL_FALLBACK = "claude-sonnet-5";
// Agent: Claude (default) or Codex. Same tools, same rulebook, same skills; only the process behind the chat differs.
const agentName = (v = ui.agent.value) => (v === "codex" ? "Codex" : "Claude");
try { const a = localStorage.getItem("agent"); if (a === "codex" || a === "claude") ui.agent.value = a; } catch (_) {}
// Fill the model dropdown from each CLI's own account cache, so it matches what the CLI's /model picker shows.
function fillModels() {
  const { models, defaultModel } = ui.agent.value === "codex" ? codexModels(readCodexCatalog(), readCodexConfig()) : availableModels(readClaudeJson());
  if (!models.length) return;
  ui.model.innerHTML = "";
  models.forEach((m) => { const o = document.createElement("option"); o.value = m.value; o.textContent = m.label; ui.model.appendChild(o); });
  ui.model.value = defaultModel;
}
fillModels();
const modelLabel = (id) => { const o = [...ui.model.options].find((x) => x.value === id); return o ? o.text : id; };
let lastPayload = "";
let pendingProjectRestart = false; // the project changed mid-turn: restart (new read path) when the turn ends
let lastCopyId = null;        // working copy created by the most recent ensureWorkingCopy()
let allowScriptsThisSession = false; // set by "Run all this session"; cleared on New
// A guard refusal ends scripting for the rest of that CLI turn in that chat. The rule "stop on a tool error" never
// reached the Haiku subagent that walked the disk with Folder on 2026-09-14 (subagents do not get the panel prompt),
// so the stop travels in the tool result and is enforced here for whoever calls, subagents included. Every send to the
// agent (the editor's message, a job-finished nudge, a model-fallback resend) goes through sendTurn and starts a turn.
let turnSeq = 0, scriptRefused = null; // { turn, chat, reason }
function sendTurn(...args) { turnSeq++; return session.send(...args); }
function setStatus(text, cls) { ui.status.textContent = text; ui.status.className = cls || (/^(Ready|Starting)/.test(text) ? "" : "busy"); }
function setBusy(busy) { ui.send.disabled = busy || (!session && !!activeChat); ui.stop.disabled = !busy; if (!busy) ui.input.focus(); } // no chat: Send opens one

function addMessage(cls, text) {
  if (quietCard && !/error/.test(cls)) return document.createElement("div"); // a button run keeps notes inside its card
  const el = document.createElement("div");
  el.className = "message " + cls;
  el.textContent = text;
  ui.messages.appendChild(el);
  followBottom(ui.messages);
  return el;
}

// While a button runs, everything the tools would normally post (cards, muted notes) goes into this one card instead.
let quietCard = null;
// The running job, pinned above the chat. One at a time (tools run in a queue); the last card to report owns it.
let jobOwner = "";
function showJob(name, label, fraction) { jobOwner = name; ui.jobName.textContent = name; ui.jobLabel.textContent = label; ui.jobFill.style.width = Math.round(100 * Math.max(0, Math.min(1, fraction || 0))) + "%"; ui.jobBar.hidden = false; }
function hideJob(name) { if (name && jobOwner && name !== jobOwner) return; jobOwner = ""; ui.jobBar.hidden = true; }

function addTool(summary, code) {
  if (quietCard) return quietCard;
  const el = document.createElement("details");
  el.className = "tool";
  el.innerHTML = "<summary></summary><pre class=\"code\"></pre><div class=\"bar\" hidden><i></i><span></span></div><pre class=\"result muted\">Running…</pre>";
  el.querySelector("summary").textContent = "▸ " + summary;
  el.querySelector(".code").textContent = code;
  ui.messages.appendChild(el);
  followBottom(ui.messages);
  const bar = el.querySelector(".bar");
  return {
    el,
    open() { el.open = true; },
    progress(done, total, label) { bar.hidden = false; bar.querySelector("i").style.width = Math.round(100 * done / total) + "%"; bar.querySelector("span").textContent = (label || "") + done + " / " + total; showJob(summary, (label || "") + done + " / " + total, done / total); },
    done(text, ok) { bar.hidden = true; const r = el.querySelector(".result"); r.textContent = text; r.className = "result " + (ok ? "ok" : "error"); hideJob(summary); },
  };
}

const err = (card, text) => { card.done(text, false); return { text: "CLAUDE_FOR_ADOBE_ERROR:" + text, isError: true }; };

// In-panel yes/no card (no system dialog). Used only for destructive actions: Revert, Discard copy.
// Resolves true / false, or the string "all" when an `allLabel` third button is offered and chosen.
function askInline(text, yesLabel = "Yes", noLabel = "Cancel", allLabel = "", signal = null) {
  return new Promise((resolve) => {
    // A question must always be visible, even while a button job is keeping notes inside its card.
    const q = quietCard; quietCard = null;
    const el = addMessage("assistant muted", text + "\n");
    quietCard = q;
    const row = document.createElement("div");
    row.className = "row";
    const yes = document.createElement("button"); yes.textContent = yesLabel;
    const no = document.createElement("button"); no.textContent = noLabel; no.className = "utility";
    let done = false;
    const finish = (v, label) => { if (done) return; done = true; row.remove(); el.textContent += (label || (v === "all" ? allLabel : v ? yesLabel : noLabel)) + "."; resolve(v); };
    yes.onclick = () => finish(true); no.onclick = () => finish(false);
    row.append(yes, no);
    if (allLabel) { const all = document.createElement("button"); all.textContent = allLabel; all.className = "utility"; all.onclick = () => finish("all"); row.append(all); }
    el.appendChild(row);
    // A call the agent abandoned (Stop, or it gave up waiting) must not stay clickable: a later click would act for nobody.
    if (signal) { if (signal.aborted) finish(false, "Cancelled: the call was abandoned"); else signal.addEventListener("abort", () => finish(false, "Cancelled: the call was abandoned"), { once: true }); }
    followBottom(ui.messages);
  });
}

// ---- project ------------------------------------------------------------------------------------

async function readProject() {
  const [projectPath = "", name = "", sequence = "", sequenceId = ""] = (await host("projectInfo")).split(COL);
  return { path: projectPath, name, sequence, sequenceId };
}

// Premiere's media analysis (Media Intelligence): with it on, Premiere embeds every clip it imports (visual and
// audio vectors in its analyzer cache) and the panel can read those instead of looking at frames. Ask once per
// session when it is off; the editor's answer is remembered for this panel. Declined = fall back to frames.
const MI_PREF = "BE.Prefs.MediaIntelligence.AnalyzeImportedMediaForMISO";
let mediaAnalysisState = "unknown"; // "on" | "off" | "declined"
async function checkMediaAnalysis() {
  try {
    const v = await host("getPref", MI_PREF);
    if (v === "true") { mediaAnalysisState = "on"; return; }
    if (mediaAnalysisState === "declined") return;
    let declined = false; try { declined = localStorage.getItem("mediaAnalysis.declined") === "1"; } catch (_) {}
    if (declined) { mediaAnalysisState = "declined"; return; }
    mediaAnalysisState = "off";
    const yes = await askInline("Premiere's media analysis is off. Turn it on? Premiere then analyses every clip it imports (visual and audio, on this Mac) and the panel can read that instead of rendering frames: similar shots, scene grouping, matching b-roll. It is the same switch as Preferences > Media & Transcription.", "Turn on", "Not now");
    if (yes) { const r = await host("setPref", MI_PREF, "true"); mediaAnalysisState = r === "true" ? "on" : "off"; addMessage("assistant muted", r === "true" ? "Media analysis is on. New imports are analysed automatically; existing clips can be analysed from the Project panel." : "Could not turn it on (" + r + "). Preferences > Media & Transcription has the switch."); }
    else { mediaAnalysisState = "declined"; try { localStorage.setItem("mediaAnalysis.declined", "1"); } catch (_) {} }
  } catch (_) {}
}

async function refreshProject() {
  const next = await readProject();
  const previousPath = project.path;
  const changed = next.path !== previousPath;
  project = next;
  ui.project.textContent = (project.name || "No project") + (project.sequence ? " · " + project.sequence : "");
  if (changed) { log("project: " + (project.path || "(none)")); renderCheckpoints(); if (session && previousPath) { if (session.busy) pendingProjectRestart = true; else restartSession(session.sessionId); } }
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
// Sequences the panel itself built this session: edits go straight on them, no working copy (a copy of a
// copy protected nothing and doubled the sequences in the bin).
const ownSequences = new Set();
async function ensureWorkingCopy() {
  if (!ui.dupSequence.checked) return "";
  const p = await readProject();
  if (!p.sequenceId) throw new Error("no active sequence");
  if (ownSequences.has(p.sequenceId)) return "";
  // A copy the editor renamed (no more "[Claude]") is theirs now: forget it, so the next edit gets a fresh copy.
  if (workingCopies.has(p.sequenceId) && !/ \[Claude\](?: v\d+)?$/.test(p.sequence)) { workingCopies.delete(p.sequenceId); renderCopies(); log("working copy renamed by the editor, released: " + p.sequence); }
  if (workingCopies.has(p.sequenceId) || / \[Claude\](?: v\d+)?$/.test(p.sequence)) return "";
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

// While a cut loop runs, Premiere fires dozens of change events per range; refreshing the snapshot and the ledger
// on each one competes with the cuts on the host's single thread and made Cut silences several times slower.
// The loop suspends refreshes and does one at the end.
let refreshSuspended = false;
function onHostEvent(name) {
  if (refreshSuspended) return;
  log("host event " + name);
  if (/SelectionChanged/.test(name)) return; // selection is not timeline state
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => { snapshotTimeline().catch((e) => log("snapshot failed: " + e.message)); }, 400);
}

// Frame facts (sequence size vs footage sizes) attached to every message. Recomputed only when they can change.
let frameNote = "", frameKey = "";
async function refreshFrameNote(snap) {
  try {
    if (!snap || snap.error) return;
    const key = snap.width + "x" + snap.height + "|" + [...new Set(snap.clips.filter((c) => c.mediaPath && c.track[0] === "V").map((c) => c.mediaPath))].sort().join(",");
    if (key === frameKey) return;
    frameKey = key;
    frameNote = await frameMismatchNote(snap);
  } catch (_) {}
}

// Records changes only between Claude's turns; during a turn the edits are Claude's own.
// The visibility ledger: what the viewer sees, computed once per timeline state from Premiere's own clip data
// (one host call) and written next to the project, so decisions are lookups. Keyed by the timeline fingerprint.
let ledgerCache = { key: "", ledger: null, transforms: null };
async function getLedger(snap) {
  snap = snap || timeline || (await readSnapshot().catch(() => null));
  if (!snap || snap.error) return null;
  const key = timelineFingerprint(snap) + "|" + snap.id;
  if (ledgerCache.key === key && ledgerCache.ledger) return ledgerCache;
  const transforms = await readTransforms();
  const ledger = require(path.join(extensionRoot, "src", "ledger.cjs")).buildLedger(snap, transforms);
  ledgerCache = { key, ledger, transforms };
  try { fs.mkdirSync(analysisDir(), { recursive: true }); fs.writeFileSync(seqFile(".visibility.json"), JSON.stringify({ timeline: key, ...ledger })); } catch (_) {}
  return ledgerCache;
}
let ledgerTimer = null;
function refreshLedgerSoon() { if (refreshSuspended) return; clearTimeout(ledgerTimer); ledgerTimer = setTimeout(() => { getLedger().catch((e) => log("ledger failed: " + e.message)); }, 800); }

async function snapshotTimeline() {
  const next = await readSnapshot();
  refreshFrameNote(next);
  if (!timeline || timelineFingerprint(timeline) !== timelineFingerprint(next) || (timeline && timeline.id !== next.id)) refreshLedgerSoon();
  if (!(session && session.busy) && timeline) {
    const changes = diffSnapshots(timeline, next);
    if (changes.length) { pendingChanges.push(...changes); if (pendingChanges.length > 40) pendingChanges = pendingChanges.slice(-40); }
  }
  timeline = next;
  ui.status.textContent = ui.status.textContent.replace(/ · timeline changed \(\d+\)$/, "") + (pendingChanges.length ? " · timeline changed (" + pendingChanges.length + ")" : "");
}

// ---- tools ------------------------------------------------------------------------------------

async function runExtendScript({ summary = "", code = "" }, { signal } = {}) {
  const card = addTool(summary || "run_extendscript", code);
  setStatus("Running: " + (summary || "script"));
  const myTurn = turnSeq, myChat = activeChat; // the turn this call belongs to, not whatever is current after a wait
  const abandonedErr = () => err(card, "This call was abandoned (Stop, or the agent stopped waiting) before it could run; nothing ran.");
  if (signal && signal.aborted) return abandonedErr();
  const latched = () => !!scriptRefused && scriptRefused.turn === myTurn && scriptRefused.chat === myChat;
  const refusedAgain = () => err(card, "No script runs for the rest of this turn: the guard refused one already (" + scriptRefused.reason + "). If a panel tool does the job, use it; otherwise tell the editor in one line what could not be done and stop. Never read the panel's code or hand the search to a subagent.");
  if (latched()) return refusedAgain();
  const inspection = inspectExtendScript(code);
  if (inspection.rejection && !isCapabilityRejection(inspection.rejection)) return err(card, inspection.rejection + " Only the form is refused, not the purpose: rewrite the script and run it again. Name every method directly (obj.method()), build text by pushing lines into an array and joining them with \" | \", and use no escape sequences or `this`.");
  if (inspection.rejection) { scriptRefused = { turn: myTurn, chat: myChat, reason: inspection.rejection }; return err(card, inspection.rejection + " This is the script guard, not a bug: no other script runs this turn. If a panel tool does the job, use it; otherwise tell the editor in one line what could not be done and stop."); }
  // Enforced human approval: the guard cannot prove ExtendScript safe, so anything that is not a plain read waits for a
  // click. "Run all this session" skips the click for undoable scripts until New is pressed; non-undoable ones always ask.
  if (!inspection.readOnly && (inspection.notUndoable.length || !(allowScriptsThisSession || !ui.askScripts.checked))) {
    const what = inspection.notUndoable.length ? "This cannot be undone with Cmd+Z (" + inspection.notUndoable.join(", ") + ")." : (inspection.mutating ? "This edits the project (Cmd+Z undoes it)." : "The guard could not prove this script is read-only.");
    const answer = await askInline("Claude wants to run a script: " + (summary || "(no summary)") + "\n" + what + " The code is in the card above.", "Run it", "Don't run", inspection.notUndoable.length ? "" : "Run all this session", signal);
    if (signal && signal.aborted) return abandonedErr();
    if (latched()) return refusedAgain(); // a parallel call was refused while this one waited for the click
    if (!answer) return err(card, "The user declined to run this script. Ask before trying a different approach.");
    if (answer === "all") { allowScriptsThisSession = true; addMessage("assistant muted", "Scripts run without asking until you open a new chat. Actions Cmd+Z can't undo will still ask."); }
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
  // Copy creation and the checkpoint save above are awaited, so re-check right before dispatch: a call abandoned
  // (Stop, or the agent gave up) during that preparation must not still run the script. Once dispatched a script
  // cannot be recalled; this only stops one that has not started.
  if (signal && signal.aborted) return abandonedErr();
  const raw = await Promise.race([
    evalScript(buildExtendScriptWrapper(code)),
    new Promise((resolve) => setTimeout(() => resolve("CLAUDE_FOR_ADOBE_ERROR:Script did not return within " + TOOL_TIMEOUT_MS / 1000 + "s (a Premiere dialog may be open)."), TOOL_TIMEOUT_MS)),
  ]);
  const ok = raw.indexOf("CLAUDE_FOR_ADOBE_OK:") === 0;
  const body = raw === "EvalScript error." ? "ExtendScript host error (script could not be evaluated)"
    : raw.replace(/^CLAUDE_FOR_ADOBE_(?:OK|ERROR):/, "") || (ok ? "(empty result)" : "EvalScript returned nothing");
  // The working copy is never deleted automatically. The timeline snapshot sees clips, not effects or parameters, so
  // "unchanged" cannot prove a script changed nothing: on 2026-09-14 a script that added Lumetri Color looked like a
  // no-op and its graded copy was deleted, and a script that edits an effect and then throws would lose the same way.
  // The editor removes a copy with Discard copy.
  if (freshCopy) timeline = await readSnapshot().catch(() => timeline);
  card.done((note ? note + "\n" : "") + body, ok);
  setStatus("Thinking…");
  if (inspection.mutating) refreshProject();
  return { text: copyNote + (ok ? raw : "CLAUDE_FOR_ADOBE_ERROR:" + body) + (note ? "\n" + note : ""), isError: !ok };
}

// "sequence 1080x1920; footage 3840x2160 (landscape)": says when clips and frame disagree, so Claude offers the reframe.
async function frameMismatchNote(snap) {
  try {
    if (!snap || !snap.width || !snap.height) return "";
    const paths = new Set(snap.clips.filter((c) => c.mediaPath && c.track[0] === "V").map((c) => c.mediaPath));
    if (!paths.size) return "";
    const raw = await host("mediaFrames", JSON.stringify([...paths]));
    const sizes = new Map();
    (raw && raw.indexOf("ERR:") !== 0 && raw ? raw.split("\u0003") : []).forEach((r) => { const [, vi] = r.split("\u0002"); const m = /(\d+)\s*x\s*(\d+)/.exec(vi || ""); if (m) sizes.set(m[1] + "x" + m[2], (sizes.get(m[1] + "x" + m[2]) || 0) + 1); });
    if (!sizes.size) return "";
    const seqPortrait = snap.height > snap.width;
    const parts = [...sizes].map(([k, n]) => { const [w, h] = k.split("x").map(Number); return n + " x " + k + (h > w ? " (portrait)" : w === h ? " (square)" : " (landscape)"); });
    const mismatch = [...sizes.keys()].some((k) => { const [w, h] = k.split("x").map(Number); return (h > w) !== seqPortrait || Math.abs(w / h - snap.width / snap.height) > 0.02; });
    return "Frame: sequence " + snap.width + "x" + snap.height + (seqPortrait ? " (portrait)" : snap.width === snap.height ? " (square)" : " (landscape)") + "; footage " + parts.join(", ") + (mismatch ? ". MISMATCH: clips do not match the frame (letterboxed or cropped). set_sequence_size with reframe fill, or ask which frame the editor wants." : ".");
  } catch (_) { return ""; }
}

async function sequenceOverview() {
  const card = addTool("sequence_overview", "");
  timeline = await readSnapshot();
  let text = formatSnapshot(timeline);
  text += "\n" + await frameMismatchNote(timeline);
  card.done(text.split("\n").slice(0, 12).join("\n") + (timeline.clips.length > 10 ? "\n…" : ""), !timeline.error);
  return { text, isError: !!timeline.error };
}

// Renders frames of the active sequence via QE, downscales, returns them as images.
// solo_track (1-based) renders that video track ALONE; labels[] name each frame in the result.
async function previewFrames({ seconds = [], max_px = 512, solo_track, labels = [], title = "preview_frames" }) {
  const secs = [].concat(seconds).map(Number).filter((n) => n >= 0).slice(0, 6);
  if (!secs.length) return { text: "CLAUDE_FOR_ADOBE_ERROR:seconds[] required (up to 6 timeline positions)", isError: true };
  const base = path.join(os.tmpdir(), "claude-for-adobe-frame-" + Date.now().toString(36));
  const solo = solo_track ? Number(solo_track) - 1 : -1;
  const card = addTool(title + (solo >= 0 ? " V" + (solo + 1) + " alone" : "") + " at " + secs.map((n) => n + "s").join(", "), "");
  setStatus("Rendering " + secs.length + " frame(s)…");
  const raw = await host("frames", JSON.stringify(secs), base, solo >= 0 ? String(solo) : "");
  if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
  const content = [];
  let rows = raw.split(ROW), soloNote = "";
  if (rows[0] && rows[0].indexOf("SOLO" + COL) === 0) {
    const [, hid, others] = rows.shift().split(COL);
    soloNote = Number(hid) === Number(others) ? "" : "SOLO NOT HONOURED: only " + hid + " of " + others + " other video tracks could be hidden, so these frames are (partly) composites. Do not conclude anything about other layers from them; read clip_transforms instead.";
  }
  rows.forEach((row, i) => {
    const [b, ok, tc] = row.split(COL);
    const src = [b + ".png", b].find((f) => fs.existsSync(f));
    if (!src) { content.push({ type: "text", text: "frame " + i + " at " + secs[i] + "s: export failed (" + ok + ")" }); return; }
    try {
      const small = resizeImage(src, b + "_small.jpg", max_px);
      content.push({ type: "text", text: (labels[i] ? labels[i] + ": " : "frame " + i + ": ") + "timeline " + secs[i] + "s (timecode " + tc + ")" + (solo >= 0 ? " [V" + (solo + 1) + " alone]" : "") });
      content.push({ type: "image", data: fs.readFileSync(small).toString("base64"), mimeType: "image/jpeg" });
      fs.unlinkSync(small);
    } catch (error) { content.push({ type: "text", text: "frame " + i + ": " + error.message }); }
    fs.unlinkSync(src);
  });
  if (soloNote) content.push({ type: "text", text: soloNote });
  content.push({ type: "text", text: "Captions are a caption track, not a video track: they appear in every render, solo or not. That is expected and says nothing about graphics." });
  card.done(content.filter((c) => c.type === "text").map((c) => c.text).join("\n"), true);
  setStatus("Thinking…");
  return { content };
}

// Lumetri Scopes as numbers, from Premiere's own full-resolution render of the frame (grade included), plus one scope
// picture. Added 2026-09-14 after the panel had no way to answer "is this exposed right" but eyeballing a thumbnail.
async function scopesTool({ seconds = [], solo_track, region = "frame", source = false, track = 1 } = {}) {
  if (source) {
    const secs = [].concat(seconds).map(Number).filter((n) => n >= 0).slice(0, 3);
    if (!secs.length) return { text: "CLAUDE_FOR_ADOBE_ERROR:seconds[] required", isError: true };
    const card = addTool("scopes from SOURCE at " + secs.map((n) => n + "s").join(", "), "");
    setStatus("Decoding " + secs.length + " source frame(s)…");
    const texts = [];
    for (const t of secs) {
      try {
        const m = await measureSourceAt(t, track, region);
        texts.push(scopeReport(m, "timeline " + t + "s from the SOURCE FILE (" + m.clip + " at " + round2(m.sourceSeconds) + "s, " + m.decoded + ")" + (m.region !== "frame" ? " — " + m.region.toUpperCase() + " only" : "") + (m.fellBack ? " (" + m.fellBack + ")" : "")));
      } catch (error) { texts.push("at " + t + "s: " + error.message); }
    }
    texts.push("Decoded from the camera file, NOT Premiere's render: no Lumetri, no sequence colour management. Compare with a plain scopes call at the same time once per footage type before trusting it for reads; never use it to confirm a grade.");
    card.done(texts.join("\n"), true);
    setStatus("Thinking…");
    return { text: texts.join("\n") };
  }
  const secs = [].concat(seconds).map(Number).filter((n) => n >= 0).slice(0, 3);
  if (!secs.length) return { text: "CLAUDE_FOR_ADOBE_ERROR:seconds[] required (up to 3 timeline positions)", isError: true };
  const base = path.join(os.tmpdir(), "claude-for-adobe-scopes-" + Date.now().toString(36));
  const solo = solo_track ? Number(solo_track) - 1 : -1;
  const where = (i, tc) => "timeline " + secs[i] + "s (" + tc + ")" + (solo >= 0 ? " V" + (solo + 1) + " alone" : "");
  const card = addTool("scopes" + (solo >= 0 ? " V" + (solo + 1) + " alone" : "") + " at " + secs.map((n) => n + "s").join(", "), "");
  setStatus("Measuring " + secs.length + " frame(s)…");
  const raw = await host("frames", JSON.stringify(secs), base, solo >= 0 ? String(solo) : "");
  if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
  const content = [];
  let rows = raw.split(ROW);
  if (rows[0] && rows[0].indexOf("SOLO" + COL) === 0) {
    const [, hid, others] = rows.shift().split(COL);
    if (Number(hid) !== Number(others)) content.push({ type: "text", text: "SOLO NOT HONOURED: only " + hid + " of " + others + " other video tracks could be hidden, so these numbers are (partly) the composite." });
  }
  let measured = 0;
  rows.forEach((row, i) => {
    const [b, ok, tc] = row.split(COL);
    const src = [b + ".png", b].find((f) => fs.existsSync(f)), jpg = b + "_scopes.jpg";
    try {
      if (!src) { content.push({ type: "text", text: "at " + secs[i] + "s: export failed (" + ok + ")" }); return; }
      const m = measureRegion(src, region);
      const label = where(i, tc) + (m.fellBack ? " — whole frame (" + m.fellBack + ")" : m.region !== "frame" ? " — " + m.region.toUpperCase() + " only" + (m.coverage ? " (" + Math.round(m.coverage * 100) + "% of the frame)" : "") : "");
      content.push({ type: "text", text: scopeReport(m, label) });
      measured++;
      renderScopes(src, jpg);
      content.push({ type: "image", data: fs.readFileSync(jpg).toString("base64"), mimeType: "image/jpeg" });
    } catch (error) { content.push({ type: "text", text: "at " + secs[i] + "s: " + error.message }); }
    finally { for (const f of [src, jpg]) { try { if (f) fs.rmSync(f, { force: true }); } catch (_) {} } }
  });
  const texts = () => content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  if (!measured) return err(card, "no position could be measured: " + texts());
  if (measured < rows.length) content.unshift({ type: "text", text: "Measured " + measured + " of " + rows.length + " positions; the rest failed, see below." });
  content.push({ type: "text", text: "Image: luma waveform and vectorscope on top, R G B parade below, from the same Rec.709 conversion as the numbers. Values read the exported 8-bit frame as SDR Rec.709 and are not calibrated against Lumetri, so compare shots with each other; a log, HDR or wide-gamut working space is not what Lumetri would show. Pixel counts are not a diagnosis: a letterbox fills the luma floor, a saturated title fills a channel at 255. The grade is the editor's Lumetri click." });
  card.done(texts(), true);
  setStatus("Thinking…");
  return { content };
}

// One frame measured the way `scopes` measures it, as numbers rather than a report: Premiere's own
// render of the composite at that time. The grade loop calls this after every write.
async function measureFrameAt(seconds, { region = "frame", reuse = null, keepPlayhead = false, keep = false } = {}) {
  const base = path.join(os.tmpdir(), "claude-for-adobe-grade-" + Date.now().toString(36));
  const raw = await host("frames", JSON.stringify([seconds]), base, "", keepPlayhead ? "1" : "");
  if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4));
  const rows = raw.split(ROW).filter((r) => r.indexOf("SOLO" + COL) !== 0);
  const [b, ok] = String(rows[0] || "").split(COL);
  const src = [b + ".png", b].find((f) => f && fs.existsSync(f));
  if (!src) throw new Error("frame export failed at " + seconds + "s (" + ok + ")");
  // One export, then decode as many regions as needed: a face or subject costs no extra render.
  try { return measureRegion(src, region, reuse); }
  finally { if (!keep) { try { fs.rmSync(src, { force: true }); } catch (_) {} } } // keep: the caller wants the PNG (the skin step learns its key from it) and removes it
}

// Measure a rendered frame by region. "frame" is the whole picture; "face" is Vision's biggest face box (skin
// without hair and clothes - the right thing for skin tone); "subject" is Vision's foreground mask, whatever
// the subject is - a face, hands, a product - which is the general answer to "the subject, not the room".
// Returns the measurement plus what was actually measured, since a region can fall back to the frame.
function measureRegion(src, region, reuse = null) {
  const frame = measureScopes(decodeRgb(src));
  frame.src = src; // the exported PNG: the skin step decodes it again for Vision's boxes
  // A region fixed by an earlier read (its box, as frame fractions): the same pixels, whatever Vision
  // would say about this render. Precision of a box against a mask is a fair trade for consistency.
  if (reuse && reuse.box && region !== "frame") return Object.assign(measureScopes(decodeRgb(src, reuse.box)), { region, box: reuse.box, reused: true, frame });
  // A region reading always carries the whole-frame numbers too (`frame`): clipping and crushing are
  // judged on the frame, because pushing a small subject up blows the room behind it.
  const vision = region === "frame" ? null : visionAll(src);
  // "keyed": the frame is Lumetri's HSL Secondary mask view (Show Mask on) - the selected pixels alone.
  if (region === "keyed") {
    const k = keyedPixels(decodeRgb(src));
    if (!k.rgb.length) return Object.assign(frame, { region: "frame", fellBack: "no keyed pixels (is Show Mask on, and does the key select anything?)", vision });
    return Object.assign(measureScopes(k.rgb), { region: "keyed", coverage: k.share / 100, frame, vision });
  }
  // "hands": the biggest hand box Vision found, on the picture as rendered (a corrected key shows here).
  if (region === "hands") {
    const hs = (vision && vision.hands) || [];
    if (!hs.length) return Object.assign(frame, { region: "frame", fellBack: "no hand found", vision });
    const big = hs.map((h) => ({ box: { x0: h.box[0], y0: h.box[1], x1: h.box[2], y1: h.box[3] }, area: (h.box[2] - h.box[0]) * (h.box[3] - h.box[1]) })).sort((a, b) => b.area - a.area)[0].box;
    return Object.assign(measureScopes(decodeRgb(src, big)), { region: "hands", box: big, hands: hs.length, frame, vision });
  }
  if (region === "face") {
    const box = biggestFaceBox(src);
    if (!box) return Object.assign(frame, { region: "frame", fellBack: "no face found", vision });
    return Object.assign(measureScopes(decodeRgb(src, box)), { region: "face", box, frame, vision });
  }
  if (region === "subject") {
    const found = subjectMask(src);
    if (!found) return Object.assign(frame, { region: "frame", fellBack: "no subject found", vision });
    try { return Object.assign(measureScopes(maskRgb(decodeRgb(src), decodeGray(found.mask))), { region: "subject", coverage: found.coverage, box: found.box, frame, vision }); }
    finally { try { fs.rmSync(found.mask, { force: true }); } catch (_) {} }
  }
  return Object.assign(frame, { region: "frame" });
}

// Vision's foreground-instance mask for a rendered frame (bin/ocr --subject): the mask file, how much of
// the frame it covers, and its extent. null when Vision sees no subject.
// Everything Vision sees in a frame, one call: faces, hands, the subject's and the person's extent, text.
// Attached to every region read as `vision`, so a row can say what was in the frame and the skin work can
// key inside the hands (the owner, 2026-09-16 01:50: "why are we limiting Apple Vision at all").
function visionAll(file) {
  if (!fs.existsSync(OCR_BIN)) return null;
  try {
    const out = require("node:child_process").execFileSync(OCR_BIN, [file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const v = JSON.parse(out.split("\n").filter(Boolean)[0] || "null");
    return v && !v.error ? v : null;
  } catch (_) { return null; }
}
// The skin key learned from the hand and face boxes on one exported frame (src/skin.cjs): each box is
// decoded as its own crop, so no frame geometry is needed - the crop IS the box.
function skinKeyFor(src, vision, opts = {}) {
  const boxes = vision ? [...((vision.faces || []).map((f) => f.box)), ...((vision.hands || []).map((h) => h.box))].map((b) => ({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] })) : [];
  if (!boxes.length) return null;
  try { const all = Buffer.concat(boxes.map((b) => decodeRgb(src, b))); return skinKeyFrom(all, all.length / 3, 1, [{ x0: 0, y0: 0, x1: 1, y1: 1 }], opts); } catch (_) { return null; }
}
function subjectMask(file) {
  let entry = null;
  try {
    const out = require("node:child_process").execFileSync(OCR_BIN, ["--subject", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    entry = JSON.parse(out.split("\n").filter(Boolean)[0] || "null");
  } catch (_) { return null; }
  if (!entry || !entry.mask || !(entry.coverage > 0)) return null;
  const b = entry.box || [0, 0, 1, 1];
  return { mask: entry.mask, coverage: entry.coverage, box: { x0: b[0], y0: b[1], x1: b[2], y1: b[3] } };
}

// The biggest face in a rendered frame, as fractions of the frame (origin top-left, as bin/ocr emits it).
function biggestFaceBox(file) {
  let entry = null;
  try {
    const out = require("node:child_process").execFileSync(OCR_BIN, ["--faces", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    entry = JSON.parse(out.split("\n").filter(Boolean)[0] || "null");
  } catch (_) { return null; }
  const faces = (entry && entry.faces) || [];
  if (!faces.length) return null;
  const f = faces.slice().sort((a, b) => (b.box[2] - b.box[0]) - (a.box[2] - a.box[0]))[0];
  return { x0: f.box[0], y0: f.box[1], x1: f.box[2], y1: f.box[3] };
}

// The same measurement WITHOUT Premiere: the clip under `seconds` on the track is decoded from its own
// source file (BRAW through the Blackmagic SDK, everything else through ffmpeg) at the matching source
// frame. Nothing renders, nothing moves. These are the camera's pixels as the decoder interprets them,
// not Premiere's render - no Lumetri, no sequence colour management - so it is the READ before a grade,
// never the confirm after one, and whether it agrees with Premiere's own render is checked once per
// footage type (scopes source:true against scopes at the same time) before it is trusted.
async function measureSourceAt(seconds, track = 1, region = "frame", snapshot = null) {
  const snap = snapshot || await readSnapshot(); // a sequence run passes its one snapshot: no re-read per clip
  if (snap.error) throw new Error(snap.error);
  const c = snap.clips.find((k) => k.track === "V" + track && seconds >= k.start && seconds < k.end && k.mediaPath);
  if (!c) throw new Error("no footage with a source file at " + seconds + "s on V" + track);
  const at = toSourceSeconds(seconds, c.start, c.inPoint, c.speed);
  const f = sourceFrameRgb(c.mediaPath, at, { maxWidth: 0 });
  const whole = measureScopes(f.rgb);
  Object.assign(whole, { region: "frame", source: true, clip: c.name, sourceSeconds: at, decoded: f.width + "x" + f.height + (f.frame !== undefined ? " frame " + f.frame : "") });
  if (region === "frame") return whole;
  // Regions need Vision, which wants an image file: write the decoded frame out once.
  const png = path.join(os.tmpdir(), "claude-for-adobe-source-" + Date.now().toString(36) + ".png");
  const w = require("node:child_process").spawnSync(FFMPEG, ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f.width + "x" + f.height, "-i", "-", png], { input: f.rgb, maxBuffer: 1 << 28 });
  if (w.status !== 0) return Object.assign(whole, { fellBack: "could not write the decoded frame for Vision" });
  try { const m = measureRegion(png, region); return Object.assign(m, { source: true, clip: c.name, sourceSeconds: at, decoded: whole.decoded }); }
  finally { try { fs.rmSync(png, { force: true }); } catch (_) {} }
}

const round2 = (n) => (isFinite(n) ? Math.round(Number(n) * 100) / 100 : n);

// Drive one Lumetri parameter until the picture measures what was asked for. The loop, the statistics
// and the accuracy limits live in src/grade.cjs; this is the part that talks to Premiere.
async function gradeTool({ parameter, target, statistic, seconds, track = 1, tolerance, region = "frame" } = {}) {
  const at = Number(seconds);
  if (!(at >= 0)) return { text: "CLAUDE_FOR_ADOBE_ERROR:seconds required (the timeline position to grade by)", isError: true };
  if (!GRADE_PARAMS[parameter]) return { text: "CLAUDE_FOR_ADOBE_ERROR:unknown parameter " + parameter + "; known: " + Object.keys(GRADE_PARAMS).join(", "), isError: true };
  if (!isFinite(Number(target))) return { text: "CLAUDE_FOR_ADOBE_ERROR:target required (the number the statistic should reach)", isError: true };
  const card = addTool("grade " + parameter + " → " + (statistic || GRADE_PARAMS[parameter].steer) + " " + target + " at " + at + "s", "");
  setStatus("Grading " + parameter + "…");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const { set, clipName, regionSeen } = lumetriWriter(at, track, GRADE_PARAMS[parameter].lumetri, region);
  let result;
  try { result = await steerGrade({ set, measure: regionSeen.measure, param: parameter, target: Number(target), statistic, tolerance }); }
  catch (error) { return err(card, error.message); }
  const lines = [
    (result.hit ? "CHECK PASS" : "CHECK MISS") + ": " + parameter + " = " + round2(result.value) + " on " + clipName() + " — " +
      result.statistic + " of the " + regionSeen.which() + " reads " + round2(result.achieved) + ", asked " + round2(Number(target)) +
      (result.hit ? "" : " (residual " + result.residual + ")"),
    "how: " + (result.how === "model" ? "set from the calibration model" : "one probe to measure the slope, then set") + (result.nudged ? ", one nudge from the real readings" : "") +
      "; " + result.renders + " render" + (result.renders === 1 ? "" : "s") + ": " + result.readings.map((r) => round2(r.value) + "→" + round2(r.stat)).join(", "),
  ];
  if (result.problem) lines.push(result.problem);
  if (regionSeen.fellBack()) lines.push(regionSeen.fellBack() + ", so this is the whole frame.");
  if (!result.tested) lines.push("NOTE: " + parameter + " has no calibration yet; its steering statistic is inferred. Trust the picture over the number.");
  lines.push("Set on the clip; Cmd+Z per write.");
  card.done(lines.join("\n"), true);
  setStatus("Thinking…");
  return { text: copyNote + lines.join("\n") };
}

// The Premiere side of a grade at one timeline position: a writer for one Lumetri parameter, a
// measurer for the chosen region, and what they saw.
function lumetriWriter(at, track, lumetriName, region) {
  let clip = "", seen = region, fell = null;
  const set = async (value) => {
    const raw = await host("lumetriParam", String(at), String(track), lumetriName, String(value));
    if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4));
    const [, readBack, clipName] = raw.split(COL);
    clip = clipName;
    return Number(readBack);
  };
  const measure = async () => { const m = await measureFrameAt(at, { region }); seen = m.region || region; fell = m.fellBack || null; return m; };
  const read = async () => { const raw = await host("lumetriParam", String(at), String(track), lumetriName, ""); if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4)); return Number(raw.split(COL)[1]); };
  return { set, read, clipName: () => clip, regionSeen: { measure, which: () => seen, fellBack: () => fell } };
}

// The colour wheels of the clip at one timeline position, through QE by name: read as {shadows,
// midtones, highlights} of {hue, sat, luma}; write the same shape (all three, dot decimals).
function wheelWriter(at, track) {
  const call = async (value) => {
    const raw = await host("lumetriQE", String(at), String(track), "Color Wheels & Match", value);
    if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4));
    const [, text, clipName] = raw.split(COL);
    return { wheels: parseWheels(text), text, clipName };
  };
  return { read: () => call(""), write: (wheels) => call(formatWheels(wheels)) };
}

// The RGB Curves of the clip at one timeline position, through QE by name: read as { Master, Red, Green,
// Blue } point lists; write the same shape (dot decimals). The Master end points are the levels tool.
function curveWriter(at, track) {
  const call = async (value) => {
    const raw = await host("lumetriQE", String(at), String(track), "RGB Curves", value);
    if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4));
    const [, text, clipName] = raw.split(COL);
    return { curves: parseCurves(text), text, clipName };
  };
  return { read: () => call(""), write: (curves) => call(formatCurves(curves)) };
}

// Luma vs Sat, the same door: read as a point list ([] = the empty curve "0:"), write the same shape.
function satWriter(at, track) {
  const call = async (value) => {
    const raw = await host("lumetriQE", String(at), String(track), "Luma vs Sat", value);
    if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4));
    const [, text, clipName] = raw.split(COL);
    return { points: parseSatCurve(text), text, clipName };
  };
  return { read: () => call(""), write: (points) => call(formatSatCurve(points)) };
}

// One Lumetri state (temperature, tint, wheels, curves, Luma vs Sat, the sliders) written to the clip at
// one timeline position: how a later cut of a graded file takes the first cut's grade.
async function writeGradeState(at, track, region, s) {
  await lumetriWriter(at, track, "Temperature", region).set(isFinite(s.temp) ? s.temp : 0);
  await lumetriWriter(at, track, "Tint", region).set(isFinite(s.tint) ? s.tint : 0);
  if (s.wheels) await wheelWriter(at, track).write(s.wheels);
  if (s.curves) await curveWriter(at, track).write(s.curves);
  await satWriter(at, track).write(s.sat || []);
  for (const [p, v] of Object.entries(s.sliders || {})) if (GRADE_PARAMS[p] && isFinite(v)) await lumetriWriter(at, track, GRADE_PARAMS[p].lumetri, region).set(v);
  if (s.hsl) { const h = hslWriter(at, track); await h.writeKey(s.hsl.key || EMPTY_HSL_KEY); await h.correction(hslPadText(s.hsl.pad)); if (isFinite(s.hsl.saturation)) await h.saturation(s.hsl.saturation); }
}
// The key's colour wheels as QE text (Round 253): the Midtones pad alone carries the skin rotation.
const hslPadText = (pad) => "Shadows:0.00,0.00,0.50;Midtones:" + (pad && pad.sat > 0 ? pad.hue.toFixed(2) + "," + pad.sat.toFixed(3) : "0.00,0.000") + ",0.50;Highlights:0.00,0.00,0.50";

function gradeStateSummary(s) {
  const pads = s.wheels ? Object.keys(s.wheels).filter((w) => s.wheels[w].sat > 0.005).map((w) => w + " " + round2(s.wheels[w].hue) + "°/" + round2(s.wheels[w].sat)) : [];
  return "temperature " + round2(s.temp) + ", tint " + round2(s.tint) + (pads.length ? ", " + pads.join(", ") : "") + (s.hsl && s.hsl.pad ? ", skin pad " + round2(s.hsl.pad.hue) + "°/" + s.hsl.pad.sat.toFixed(2) : "") + (s.curves && s.curves.Master && s.curves.Master[0][0] > 0.005 ? ", curve black " + s.curves.Master[0][0].toFixed(2) : "") + (s.sat && s.sat.length ? ", sat roll-off" : "") + Object.entries(s.sliders || {}).filter(([, val]) => Math.abs(val) >= 0.5).map(([p, val]) => ", " + p + " " + round2(val)).join("");
}

// Skin writes: the key's Midtones wheel, calibrated 2026-09-16 12:54 (HSL Tint was a wash toward magenta).
const SKIN_WRITE = true;
// HSL Secondary: the key and its wheels ("Correction") through QE by name, the scalars and Show Mask by
// property index.
function hslWriter(at, track) {
  const qe = async (name, value) => { const raw = await host("lumetriQE", String(at), String(track), name, value); if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4)); return raw.split(COL)[1]; };
  const idx = async (index, expect, value) => { const raw = await host("lumetriIndex", String(at), String(track), String(index), expect, value); if (raw.indexOf("ERR:") === 0) throw new Error(raw.slice(4)); return raw.split(COL)[1]; };
  return {
    readKey: () => qe("HSL Secondary", ""), writeKey: (text) => qe("HSL Secondary", text),
    readCorrection: () => qe("Correction", ""), correction: (text) => qe("Correction", text),
    tint: (v) => idx(102, "Tint", v === undefined ? "" : String(v)), saturation: (v) => idx(105, "Saturation", v === undefined ? "" : String(v)), temperature: (v) => idx(101, "Temperature", v === undefined ? "" : String(v)),
    showMask: (on) => idx(88, "Show Mask", on ? "true" : "false"),
  };
}

// A whole shot in one go: one render to read the scopes, every knob chosen from the calibration model,
// all written, one confirm render. goals arrive as [{parameter, target, statistic?}] in colourist order.
async function gradeShotTool({ goals = [], seconds, track = 1, region = "frame", tolerance } = {}) {
  const at = Number(seconds);
  if (!(at >= 0)) return { text: "CLAUDE_FOR_ADOBE_ERROR:seconds required", isError: true };
  if (!Array.isArray(goals) || !goals.length) return { text: "CLAUDE_FOR_ADOBE_ERROR:goals[] required: [{parameter, target}] in the order to apply", isError: true };
  for (const g of goals) {
    if (!GRADE_PARAMS[g.parameter]) return { text: "CLAUDE_FOR_ADOBE_ERROR:unknown parameter " + g.parameter, isError: true };
    if (!isFinite(Number(g.target))) return { text: "CLAUDE_FOR_ADOBE_ERROR:target required for " + g.parameter, isError: true };
    if (g.statistic && !GRADE_STATS[g.statistic]) return { text: "CLAUDE_FOR_ADOBE_ERROR:unknown statistic " + g.statistic, isError: true };
  }
  const card = addTool("grade shot at " + at + "s: " + goals.map((g) => g.parameter + "→" + g.target).join(", "), "");
  setStatus("Grading shot…");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  let clip = "", seen = region, fell = null;
  const writers = {};
  for (const g of goals) writers[g.parameter] = lumetriWriter(at, track, GRADE_PARAMS[g.parameter].lumetri, region);
  const measure = async () => { const m = await measureFrameAt(at, { region }); seen = m.region || region; fell = m.fellBack || null; return m; };
  // planShot names the knob it is writing, so each goes to its own Lumetri parameter.
  let result;
  try {
    const plan = goals.map((g) => ({ param: g.parameter, target: Number(g.target), statistic: g.statistic }));
    result = await planGradeShot({ set: (value, param) => writers[param].set(value), current: (param) => writers[param].read(), measure, goals: plan, tolerance });
  } catch (error) { return err(card, error.message); }
  for (const w of Object.values(writers)) if (w.clipName()) clip = w.clipName();
  const lines = [];
  for (const p of result.plan) {
    if (p.skipped) { lines.push("skipped " + p.param + ": " + p.skipped); continue; }
    lines.push((p.hit ? "PASS" : "MISS") + " " + p.param + " = " + round2(p.value) + " (" + p.statistic + " " + p.before + " → predicted " + p.predicted + ", reads " + p.achieved + ", asked " + p.target + (p.hit ? "" : ", residual " + p.residual) + ")");
  }
  lines.unshift("Shot at " + at + "s on " + clip + ", " + seen + (fell ? " (" + fell + ")" : "") + ": " + result.renders + " renders.");
  if (result.unsafe) lines.push("WARNING: the frame now clips " + round2(result.clipped) + "% / crushes " + round2(result.crushed) + "% — lower the white point or exposure goal.");
  lines.push("Set on the clip; Cmd+Z per knob.");
  card.done(lines.join("\n"), true);
  setStatus("Thinking…");
  return { text: copyNote + lines.join("\n") };
}
// The correction step is driven by a real reading, not the fitted line, so it may use the wheel's room
// past the model's cap (0.3): up to 0.5.
const NUDGE_MAX_SAT = 0.5;
// The whole job, deterministically: every footage clip on the track, read once, goals from the rules,
// knobs from the model. The agent calls this once and reports; it decides nothing per shot.
//
// Per clip the render budget is TWO: everything is decided from the one read (white balance, pads on
// the predicted state, sliders on the state predicted after both), written as one set, confirmed ONCE;
// then one correction - a rollback of whatever damaged the frame past what the source arrived with,
// or else a direction-aware pad nudge from the real reading - and one confirm of that. Then it stops
// and reports the residual. (The 18:03 run of 2026-09-15 spent up to four renders a clip and used a
// nudge that doubled a pad when the cast crossed neutral.)
async function gradeSequenceTool({ track = 1, region = "subject", tolerance, read = "auto", confirm = true } = {}) {
  const card = addTool("grade sequence V" + track + " (" + region + ")", "");
  setStatus("Grading sequence…");
  // The copy first, then the clips are read from it: the run of 2026-09-15 18:03 skipped this and
  // graded the original while its footer promised a working copy.
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  let tf; try { tf = await readTransforms(); } catch (error) { return err(card, error.message); }
  const snap = await readSnapshot(); // once for the run: the source reads map timeline time into each file through it
  if (snap.error) return err(card, snap.error);
  const timelineOrder = tf.rows.filter((c) => c.track === "V" + track && !c.graphic).sort((a, b) => a.start - b.start);
  if (!timelineOrder.length) return err(card, "no footage on V" + track);
  const midOf = (c) => Math.round(((c.start + c.end) / 2) * 1000) / 1000, keyOf = (c) => c.name + "@" + c.start;
  // A source cut more than once is graded ONCE, from the cut whose whites sit in the middle of the
  // shot (the 01:19 run took the first cut, whose whites read -25 against -16.5 on the third, and the
  // shared temperature left the third blue by 11 in the whites). Its cuts are read up front (a source
  // decode each, no render) and the reference is graded before its siblings; rows are re-sorted to
  // timeline order at the end.
  const preread = {}, clips = [], bySource = {};
  for (const c of timelineOrder) (bySource[c.name] = bySource[c.name] || []).push(c);
  for (const group of Object.values(bySource)) {
    if (group.length > 1 && read !== "premiere") {
      for (const c of group) { const s0 = Date.now(); try { preread[keyOf(c)] = { m: await measureSourceAt(midOf(c), track, region, snap), ms: Date.now() - s0 }; } catch (_) {} }
      const readable = group.filter((c) => preread[keyOf(c)]).sort((a, b) => GRADE_STATS.whitesRB(preread[keyOf(a)].m) - GRADE_STATS.whitesRB(preread[keyOf(b)].m));
      if (readable.length) { const r = readable[Math.floor((readable.length - 1) / 2)]; clips.push(r, ...group.filter((c) => c !== r)); continue; }
    }
    clips.push(...group);
  }
  const lines = [], t0 = Date.now();
  let renders = 0, balanced = 0, touched = 0, stopped = false;
  // The source decode is only a read of the timeline while it decodes the way Premiere does. On BRAW
  // that is the clip's own settings (Decode Using: Clip, the embedded LUT applied) - and the LUT is a
  // tick box (the owner, 2026-09-16 00:33). One render on the first clip read from source checks it;
  // a mismatch switches the run to Premiere reads and says so.
  let parity = null;
  const PARITY_MAX = 1.5; // verified 2026-09-15: parade identical, median within 0.4
  // Shot match: one grade per SOURCE file. The first cut of a file is graded; every later cut of the
  // same file gets the same Lumetri state and one confirm (the owner, 2026-09-16 00:52: C227's three
  // cuts had three grades, temperature -64 / -83 / -47, and "look very different").
  const matched = {};
  // The playhead follows the clip being graded and goes back to where the editor had it when the run
  // ends - not to the clip and back on every render, which read as a bug.
  let playheadBefore = null;
  try { const raw = await host("playhead", ""); if (raw.indexOf("OK") === 0) playheadBefore = raw.split(COL)[1]; } catch (_) {}
  try {
  for (const c of clips) {
    if (cancelRequested) { stopped = true; break; }
    const at = Math.round(((c.start + c.end) / 2) * 1000) / 1000;
    const label = c.name + " @" + at + "s";
    const clipT0 = Date.now(), host0 = { ...hostTime };
    let renderMs = 0, readMs = 0;
    const timed = async (fn, bucket) => { const s = Date.now(); try { return await fn(); } finally { if (bucket === "render") renderMs += Date.now() - s; else readMs += Date.now() - s; } };

    // Where the knobs are. A clip that already carries a balance (a temperature, a pad) is read from
    // Premiere's render, since its source pixels no longer describe it. A wheel read that fails means
    // the pads are left alone for this clip: writing "all neutral" over an unknown state is not a grade.
    const ww = wheelWriter(at, track), tw = lumetriWriter(at, track, "Temperature", region), tiw = lumetriWriter(at, track, "Tint", region), cw = curveWriter(at, track), sw = satWriter(at, track);
    const tookOf = () => { const totalMs = Date.now() - clipT0, hostCalls = hostTime.calls - host0.calls; return " [" + (totalMs / 1000).toFixed(1) + "s: read " + (readMs / 1000).toFixed(1) + ", renders " + (renderMs / 1000).toFixed(1) + ", " + hostCalls + " host calls, rest " + (Math.max(0, totalMs - readMs - renderMs) / 1000).toFixed(1) + "]"; };
    // A later cut of a file already graded gets the SAME grade (the owner, 01:08: cuts seconds apart
    // that look identical must not differ - "if you do, you can't be shifting the colour"). If this cut
    // would clip or crush under it, the shot's tone is backed off to half on every cut, so they still
    // match; the 00:58 run copied the state without that and clipped 4% / crushed 9.4%, the 01:10 run
    // matched the colour only and the per-cut tone and the clip guard pulled the cuts apart again.
    const ref = matched[c.name] || null;
    let currentWheels = null, wheelsErr = null, tempFrom = 0, tintFrom = 0, currentCurves = null, curvesErr = null, currentSat = null, satErr = null;
    try { currentWheels = (await ww.read()).wheels; } catch (error) { wheelsErr = error.message; }
    try { tempFrom = await tw.read(); if (!isFinite(tempFrom)) tempFrom = 0; } catch (_) { tempFrom = 0; }
    try { tintFrom = await tiw.read(); if (!isFinite(tintFrom)) tintFrom = 0; } catch (_) { tintFrom = 0; }
    try { currentCurves = (await cw.read()).curves; } catch (error) { curvesErr = error.message; }
    try { currentSat = (await sw.read()).points; } catch (error) { satErr = error.message; }
    let hslKeyed = false; try { const kt = String(await hslWriter(at, track).readKey()); hslKeyed = /:0,?[.,]?00,0,?[.,]?00;/.test(kt) === false && kt.indexOf(",0,00,0,00") < 0 && kt.indexOf(",0.00,0.00") < 0; } catch (_) { hslKeyed = false; }
    const graded = tempFrom !== 0 || tintFrom !== 0 || !!(currentWheels && Object.values(currentWheels).some((w) => w.sat > 0.005 || Math.abs(w.luma - 0.5) > 0.005)) || !!(currentCurves && !curvesIdentity(currentCurves)) || !!(currentSat && currentSat.length) || hslKeyed;

    let m, readFrom = read;
    // auto: decode the clip's own file (parity with Premiere's render verified on BRAW, 2026-09-15:
    // parade identical, median within 0.4) and fall back to a Premiere render only when that fails.
    try {
      if (preread[keyOf(c)] && !graded) { m = preread[keyOf(c)].m; readMs += preread[keyOf(c)].ms; readFrom = "source"; }
      else if ((read === "source" || read === "auto") && !graded) {
        try { m = await timed(() => measureSourceAt(at, track, region, snap), "read"); readFrom = "source"; }
        catch (error) { if (read === "source") throw error; m = await timed(() => measureFrameAt(at, { region, keepPlayhead: true }), "render"); renders++; readFrom = "premiere"; }
        if (readFrom === "source" && read === "auto" && parity === null) {
          const p = await timed(() => measureFrameAt(at, { region, keepPlayhead: true }), "render"); renders++;
          const a = m.frame || m, b = p.frame || p;
          const off = Math.max(Math.abs(a.luma.p50 - b.luma.p50), ...["red", "green", "blue"].map((ch) => Math.abs(a[ch].mean - b[ch].mean)));
          parity = { off: Math.round(off * 10) / 10, clip: c.name };
          if (off > PARITY_MAX) { read = "premiere"; m = p; readFrom = "premiere"; }
        }
      } else { m = await timed(() => measureFrameAt(at, { region, keepPlayhead: true }), "render"); renders++; readFrom = "premiere"; }
    } catch (error) { lines.push(label + ": could not measure (" + error.message + ")"); continue; }
    const seen = m.region || region;
    const sawV = m.vision ? [m.vision.faces && m.vision.faces.length ? m.vision.faces.length + " face" + (m.vision.faces.length > 1 ? "s" : "") : "", m.vision.hands && m.vision.hands.length ? m.vision.hands.length + " hand" + (m.vision.hands.length > 1 ? "s" : "") : ""].filter(Boolean).join(", ") : "";
    const f0 = m.frame || m;
    const baseline = gradeDamage(m); // what the shot arrived with: the guard for every write on this clip
    const before = "black " + round2(f0.luma.p1) + " / white " + round2(f0.luma.p99) + " / blacks " + round2(GRADE_STATS.blacksRB(m)) + " / whites " + round2(GRADE_STATS.whitesRB(m)) + " / spread " + round2(GRADE_STATS.spread(f0)) + (seen === "face" ? " / face " + round2(GRADE_STATS.brightness(m)) + " @" + round2(GRADE_STATS.skinHue(m)) + "°" : "") + (readFrom === "premiere" && graded ? " (read from Premiere: the clip already carries a balance)" : "");
    const reuse = m.region !== "frame" && m.box ? { box: m.box } : null;
    const parts = [], needs = [];
    if (ref) {
      const confirmRef = () => timed(() => measureFrameAt(at, { region, reuse, keepPlayhead: true }), "render");
      try {
        await writeGradeState(at, track, region, ref);
        let state = confirm ? await confirmRef() : m; if (confirm) renders++;
        parts.push("matched to " + ref.label + " (same source): " + ref.summary);
        // The shot backs off on damage, and on a white point past the accepted band (C193's sibling at
        // 97.6 under a shared Whites 100, 01:27: not clipped yet, not a picture either).
        const nearClip = confirm && (state.frame || state).luma.p99 > GRADE_ACCEPT.whiteMax;
        if (confirm && (gradeUnsafe(gradeDamage(state), gradeAllowance(baseline)) || nearClip)) {
          const h = gradeDamage(state), allow = gradeAllowance(baseline), changed = [];
          if (nearClip) h.clipped = Math.max(h.clipped, allow.clipped + 0.01);
          const half = (p) => { if (ref.sliders[p]) { ref.sliders[p] = Math.round(ref.sliders[p] / 2 * 100) / 100; changed.push(p + " → " + ref.sliders[p]); } };
          if (h.clipped > allow.clipped) for (const p of ["whites", "highlights", "exposure", "contrast"]) half(p);
          if (h.crushed > allow.crushed) {
            if (ref.curves && ref.curves.Master && ref.curves.Master[0][0] > 0.005) { ref.curves.Master[0][0] = Math.round(ref.curves.Master[0][0] / 2 * 100) / 100; changed.push("curve black → " + ref.curves.Master[0][0].toFixed(2)); }
            for (const p of ["blacks", "shadows", "contrast"]) half(p);
          }
          if (changed.length) {
            for (const t of ref.cuts) await writeGradeState(t, track, region, ref);
            await writeGradeState(at, track, region, ref);
            state = await confirmRef(); renders++;
            ref.summary = gradeStateSummary(ref);
            parts.push("shot backed off on all " + (ref.cuts.length + 1) + " cuts: " + changed.join(", ") + " (this cut " + (nearClip ? "reached white " + round2((state.frame || state).luma.p99) + ", " : "") + "clipped " + round2(gradeDamage(state).clipped) + "% / crushed " + round2(h.crushed) + "%; the earlier cuts carry the same grade and are not re-read)");
          }
        }
        ref.cuts.push(at);
        touched++;
        const v = gradeVerdict(state, state.region || seen), f1 = state.frame || state;
        balanced += confirm && v.balanced ? 1 : 0;
        const took = tookOf(); log("grade " + label + took);
        lines.push(label + " [" + seen + (sawV ? "; " + sawV : "") + "] " + before + " → " + parts.join(" → ") + " → black " + round2(f1.luma.p1) + " / white " + round2(f1.luma.p99) + " / blacks " + round2(GRADE_STATS.blacksRB(state)) + " / whites " + round2(GRADE_STATS.whitesRB(state)) + (v.balanced ? (confirm ? " ✓" : " (predicted)") : " — " + v.notes.join("; ")) + took);
      } catch (error) { lines.push(label + ": " + error.message); }
      continue;
    }

    // 1. Decide everything from the read. White balance (Temperature) for a cast the whole parade
    //    shares, then each end's wheel pad for what is left, solved on the state predicted after
    //    temperature. The casts are read here, before the tonal sliders, because a bottom pulled to the
    //    floor cannot be read. The sliders are solved on the state predicted after the pads.
    const temp = gradeTemperatureFor(m, tempFrom, tintFrom);
    const afterTemp = temp ? temp.predicted : m;
    const pads = wheelsErr ? { wheels: {}, needs: ["wheels not read (" + wheelsErr + "): pads left alone"] } : gradePadsFor(afterTemp, currentWheels);
    const padMoves = Object.keys(pads.wheels);
    const afterBalance = padMoves.length ? wheelPredictPads(afterTemp, pads.wheels, currentWheels) : afterTemp;
    // The black point: the Master curve's bottom point, a levels move that lands where it is asked
    // (src/curves.cjs); the sliders are then solved on the state it predicts.
    const lev = curvesErr ? null : gradeLevelsFor(afterBalance, currentCurves, m);
    if (curvesErr && (afterBalance.frame || afterBalance).luma.p1 > GRADE_ACCEPT.blackMax) needs.push("curves not read (" + curvesErr + "): the black point is left where it is");
    const afterLevels = lev ? lev.predicted : afterBalance;
    const goals = gradeGoalsFor(afterLevels, seen);
    needs.push(...pads.needs, ...goals.needs);
    if (temp && temp.sceneColour) parts.push("no white balance (" + temp.why + ")");
    else if (temp) parts.push("white balance: temperature " + round2(temp.value) + (temp.tint !== null ? ", tint " + round2(temp.tint) : "") + " (" + temp.why + ")");
    if (padMoves.length) parts.push(padMoves.map((w) => w + " pad " + round2(pads.wheels[w].hue) + "°/" + round2(pads.wheels[w].sat) + " (" + pads.wheels[w].why.join("; ") + ")").join("; "));
    if (lev) parts.push("curve black " + lev.blackIn.toFixed(2) + " (" + lev.why + ")");
    // The colourists' cleanup: saturation rolled off in the deepest shadows and the near-whites (Luma vs
    // Sat, the QE text door, probed 2026-09-16), never on a coloured end, judged on the frame as read.
    // Written with the first batch, not after the corrections: the 00:27 run wrote it last and the
    // blacks cast moved 1-3 points on the final read that nothing then corrected (C200 and C228 lost
    // their tick). In the batch, the corrections rescale from a reading that already carries it.
    const sat = satErr ? null : gradeSatCurveFor(m, currentSat);
    if (satErr) needs.push("Luma vs Sat not read (" + satErr + "): no saturation roll-off");
    else if (sat) parts.push("sat roll-off: " + sat.why);
    else if (currentSat && currentSat.length) parts.push("Luma vs Sat left as found (" + currentSat.length + " points)");

    if (!temp && !padMoves.length && !lev && !goals.length) {
      const v = gradeVerdict(m, seen);
      balanced += confirm && v.balanced ? 1 : 0;
      lines.push(label + " [" + seen + (sawV ? "; " + sawV : "") + "] " + before + " → left alone" + (v.notes.length ? " (" + v.notes.join("; ") + ")" : "") + (needs.length ? " NEEDS: " + needs.join("; ") : ""));
      continue;
    }

    // 2. Write the lot, confirm once, correct once. planShot writes the sliders and takes the confirm
    //    (with `measured` given it renders only after the writes); if that shows damage past the
    //    baseline it restores the sliders and confirms again - the clip's one correction. Otherwise
    //    the correction goes to the pads, if a cast is left and the real reading says how much.
    let state = afterLevels, applied = Object.assign({}, currentWheels || {}, pads.wheels), corrected = false, hsl = null, shadowsLifted = false;
    const confirmMeasure = confirm ? () => timed(() => measureFrameAt(at, { region, reuse, keepPlayhead: true }), "render") : async () => afterLevels;
    try {
      if (temp) { if (temp.value !== tempFrom) await tw.set(temp.value); if (temp.tint !== null) await tiw.set(temp.tint); }
      if (padMoves.length) await ww.write(applied);
      if (lev) await cw.write(lev.curves);
      if (sat) await sw.write(sat.points);
      if (goals.length) {
        const writers = {};
        for (const g of goals) writers[g.param] = lumetriWriter(at, track, GRADE_PARAMS[g.param].lumetri, region);
        const r = await planGradeShot({ set: (value, param) => writers[param].set(value), current: (param) => writers[param].read(), measure: confirmMeasure, goals, tolerance, measured: afterLevels, baseline });
        renders += confirm ? r.renders : 0; state = r.after; corrected = r.backedOff;
        shadowsLifted = r.plan.some((p) => p.param === "shadows" && p.value !== undefined);
        parts.push(r.plan.map((p) => p.skipped ? p.param + " skipped (" + p.skipped + ")" : p.param + " " + round2(p.value) + " (" + p.statistic + " " + p.before + "→" + p.achieved + (p.hit ? "" : ", asked " + p.target) + (p.note ? "; " + p.note : "") + ")").join("; "));
      } else if (confirm) { state = await confirmMeasure(); renders++; }
      else state = afterLevels;
      // Damage the balance writes caused (no sliders, or the sliders' rollback was not enough): the
      // likely culprit goes back first - a crush is the curve's (its bottom point clamps the tail),
      // a clip is the white balance's and the pads' - confirmed once. Not the whole balance: the
      // 21:26 run threw away a correct temperature over a curve that crushed 2.8%.
      if (confirm && gradeUnsafe(gradeDamage(state), gradeAllowance(baseline))) {
        const h = gradeDamage(state), allow = gradeAllowance(baseline), undone = [];
        if (lev && h.crushed > allow.crushed) { await cw.write(currentCurves || {}); undone.push("curve"); }
        if (h.clipped > allow.clipped || !undone.length) {
          // Half the move, like the sliders: C187 lost a whole -29 white balance over 0.51% against 0.5.
          if (temp) { await tw.set(Math.round((tempFrom + (temp.value - tempFrom) / 2) * 100) / 100); if (temp.tint !== null) await tiw.set(Math.round((tintFrom + (temp.tint - tintFrom) / 2) * 100) / 100); undone.push("half the white balance"); }
          if (padMoves.length) { applied = Object.assign({}, currentWheels || {}); await ww.write(applied); undone.push("pads"); }
          if (lev && undone.indexOf("curve") < 0) { await cw.write(currentCurves || {}); undone.push("curve"); }
        }
        state = await confirmMeasure(); renders++; corrected = true;
        parts.push("restored " + undone.join(" + ") + ": the frame clipped " + round2(h.clipped) + "% / crushed " + round2(h.crushed) + "% (source " + round2(baseline.clipped) + "% / " + round2(baseline.crushed) + "%)");
      }
      // The corrections, from the real reading: each pad rescaled from what it actually did, the
      // white balance rescaled on the whites it actually produced, and the curve's bottom point
      // re-solved from the black point it actually produced (the source decode and Premiere's render
      // agree on the parade and the median, not on the 1% tail). One write per pass, one confirm; a
      // second pass only if the confirm still shows a residual (the owner: perfect over instant), so
      // three renders a clip at most. Each pass scales from the values the previous pass wrote.
      // Two "before" states: the pads were solved against afterTemp (predicted), the white balance
      // against the frame as read - on the first pass each is judged against its own; from the
      // second pass on, both against the state before the last write.
      let padBase = Object.assign({}, currentWheels || {}), stateBefore = afterTemp, wbBefore = m, padSolved = pads.wheels;
      let tempNow = temp ? temp.value : tempFrom, tintNow = temp && temp.tint !== null ? temp.tint : tintFrom, tempBase = tempFrom, tintBase = tintFrom;
      let tempWrote = !!(temp && temp.value !== tempFrom), tintWrote = !!(temp && temp.tint !== null); // what the last write moved
      let curveNow = lev ? lev.blackIn : null, curveBaseP1 = lev ? (afterBalance.frame || afterBalance).luma.p1 : null, curvePredictedP1 = lev ? lev.predicted.luma.p1 : null;
      // A backoff (planShot's or the balance restore) spent one render: it counts as the first pass,
      // so one correction still follows it (22:51: C198 and C209 kept whites blue by 3.5-6.7 because the
      // whites backoff ended the clip).
      for (let pass = corrected ? 1 : 0; confirm && pass < 2; pass++) {
        if (gradeVerdict(state, state.region || seen).balanced) break;
        const fb = stateBefore.frame || stateBefore, fa = state.frame || state, next = {}, notes = [];
        for (const w of Object.keys(padSolved)) {
          const after = wheelCastAt(fa, w);
          if (Math.hypot(after[0], after[1]) <= 1.5) continue;
          const n = wheelNudgePad(padBase[w] || { hue: 0, sat: 0 }, applied[w], wheelCastAt(fb, w), after, NUDGE_MAX_SAT);
          if (n) {
            // The same floor guard as the first pad: a nudge must not put a channel bottom on the floor,
            // nor push one already there lower (C227 at 5.6 s, 00:48: an orange Shadows pad 0.21 -> 0.35
            // over a -83 temperature put blue on the floor across the whole parade bottom).
            const cand = { ...applied[w], hue: n.hue, sat: n.sat };
            const floorOf = (x) => { const f = x.frame || x; return Math.min(f.red.p1, f.green.p1, f.blue.p1); };
            const now = floorOf(state);
            let held = false, pf = floorOf(wheelPredictPads(state, { [w]: cand }, applied));
            while (cand.sat > 0.02 && pf < 1.5 && pf < now - 0.2) { cand.sat = Math.round(cand.sat * 0.8 * 1000) / 1000; held = true; pf = floorOf(wheelPredictPads(state, { [w]: cand }, applied)); }
            if (held && cand.sat <= (applied[w] ? applied[w].sat : 0) + 0.005 && cand.sat >= (applied[w] ? applied[w].sat : 0) - 0.005) notes.push(w + " pad held: further would put a channel on the floor");
            else { next[w] = cand; notes.push(w + " pad → " + round2(cand.hue) + "°/" + round2(cand.sat) + (n.capped ? " (cap)" : "") + (held ? " (held back: a channel bottom would reach the floor)" : "")); }
          }
          else notes.push(w + " pad is not the tool for what is left");
        }
        // The white balance, from the real reading: the temperature model transfers a little strong on
        // the -24..-37 moves (whites still blue by 3-5 on the 21:50 run). Same least-squares scale as
        // the pads, t = -c0.d / d.d on the whites' cast, applied to the move; skipped when the pads'
        // correction already touched the whites (two corrections on one end are a guess).
        let temp2 = null, tint2 = null;
        if (temp && !next.highlights) {
          // A mixed-light balance was solved on the mean of the two ends; its correction must read the
          // same statistic, or the rescale chases the whites alone and undoes the split.
          const mixedLight = /mixed light/.test(temp.why || "");
          const castFor = (x) => { const hi = wheelCastAt(x, "highlights"); if (!mixedLight) return hi; const lo = wheelCastAt(x, "shadows"); return [(hi[0] + lo[0]) / 2, hi[1]]; };
          const c0 = castFor(wbBefore.frame || wbBefore), c1 = castFor(fa);
          // Each axis scales its own knob from its own move, and only a knob the previous write
          // actually moved: the 22:28 run doubled a temperature to -55 because the pass before had
          // touched only the pad and the curve, the blue-red barely moved, and a 2-axis scale credited
          // a 0.4 change to temperature. A move under 1 point is not a slope to divide by.
          const scale1 = (before, after) => { const d = after - before; if (Math.abs(d) < 1 || Math.abs(after) <= 1.5) return null; const t = -before / d; return t > 0 && t < 3 ? t : null; };
          const tops = (x) => { const f = x.frame || x; return Math.max(f.red.p99, f.green.p99, f.blue.p99, f.luma.max || 0); };
          // Relative, like the floor check: a frame whose top already sits at 99 (Whites at +100) may still
          // be rescaled as long as the move does not push the tops higher (C193 at 15.4 s, 23:00: warm by
          // 5.9 left uncorrected because the absolute check saw "past the ceiling" before any move).
          const topLimit = Math.max(98.5, tops(state) + 0.5);
          const tT = tempWrote ? scale1(c0[0], c1[0]) : null;
          if (tT !== null) {
            // Same ceiling check as the initial white balance: a rescale after a whites backoff took C227
            // to -83 and clipped 1% (22:55). Scaled back while the predicted tops would pass the ceiling.
            let v = tempBase + tT * (tempNow - tempBase);
            while (Math.abs(v - tempNow) > 1 && tops(gradePredict(state, "temperature", tempNow, v)) > topLimit) v = tempNow + (v - tempNow) * 0.8;
            v = Math.round(v * 100) / 100;
            if (Math.abs(v - tempNow) >= 1 && Math.abs(v) <= 100) { temp2 = v; notes.push("temperature " + round2(tempNow) + " → " + round2(v) + " (whites read " + round2(c1[0]) + ")"); }
          }
          const tG = tintWrote ? scale1(c0[1], c1[1]) : null;
          if (tG !== null) { const tv = Math.round((tintBase + tG * (tintNow - tintBase)) * 100) / 100; if (Math.abs(tv - tintNow) >= 1 && Math.abs(tv) <= 100) { tint2 = tv; notes.push("tint " + round2(tintNow) + " → " + round2(tv) + " (whites G read " + round2(c1[1]) + ")"); } }
          // A green-magenta residual that only appeared after the temperature move (under the line at
          // read, 1.6-2.4 after): Tint is solved from the real reading, from the model, one write.
          if (tint2 === null && !tintWrote && Math.abs(c1[1]) > 1.5) {
            const st = gradeSolveKnob(state, "tint", tintNow, GRADE_STATS.whitesG, 0);
            if (st && st.helps) {
              // The correction's write takes the last render, so it checks the predicted ceiling itself:
              // Tint clips red or blue past +50 (its sweep), and C209 clipped 1.1% on the 22:17 run.
              let tv = Math.max(-100, Math.min(100, st.value));
              while (Math.abs(tv - tintNow) > 1 && tops(gradePredict(state, "tint", tintNow, tv)) > topLimit) tv = tintNow + (tv - tintNow) * 0.8;
              tv = Math.round(tv * 100) / 100;
              if (Math.abs(tv - tintNow) >= 1) { tint2 = tv; notes.push("tint " + round2(tv) + " (whites G read " + round2(c1[1]) + " after the temperature)"); }
            }
          }
        }
        let curve2 = null;
        if (lev && curveNow !== null) {
          const p1 = fa.luma.p1, target = lev.target, a = lev.anchor, A = a * 100;
          const predictedMove = curveBaseP1 - curvePredictedP1, actualMove = curveBaseP1 - p1;
          if ((p1 > GRADE_ACCEPT.blackMax || p1 < 1) && predictedMove > 0 && actualMove < predictedMove * 0.25 && !shadowsLifted) { // a Shadows lift for a dark subject raises the black point on purpose: re-solve, do not call the pixels unresponsive // 21:37: a 39% response re-solved to 4.3 the run before; 25% is the line between 'slow' and 'not a black'
            // The black point did not follow the curve: the darkest pixels are not a black (a coloured
            // surface keeps its luma in one channel while the curve crushes the other two). Pushing
            // further only crushes more - C187 on the 21:26 run went to the cap for nothing.
            if (pass === 0) notes.push("black point read " + round2(p1) + " after a curve predicted to reach " + round2(curvePredictedP1) + ": the darkest pixels do not respond to a levels move, left at " + curveNow.toFixed(2));
          } else if (p1 > GRADE_ACCEPT.blackMax || p1 < 1) {
            // Compose a second toe pull on the first, below the same anchor: the extra bottom point in
            // the post-curve domain is A (p1 - t) / (A - t); back through the first curve that is
            // x2 = x + xAdd * (a - x) / a.
            const xAdd = (A * (p1 - target) / (A - target)) / 100;
            const x2 = Math.max(0, Math.min(GRADE_LEVELS_CAP, curveNow + xAdd * (a - curveNow) / a));
            if (Math.abs(x2 - curveNow) >= 0.005) { curve2 = x2; notes.push("curve black " + curveNow.toFixed(2) + " → " + x2.toFixed(2) + " (black point read " + round2(p1) + ")"); }
          }
        }
        if (Object.keys(next).length || curve2 !== null || temp2 !== null || tint2 !== null) {
          stateBefore = state; wbBefore = state;
          tempWrote = temp2 !== null; tintWrote = tint2 !== null;
          if (temp2 !== null) { await tw.set(temp2); tempBase = tempNow; tempNow = temp2; }
          if (tint2 !== null) { await tiw.set(tint2); tintBase = tintNow; tintNow = tint2; }
          if (Object.keys(next).length) { padBase = Object.assign({}, applied); applied = Object.assign({}, applied, next); await ww.write(applied); }
          if (curve2 !== null) { await cw.write(curveLevels(curve2, 1, currentCurves, lev.anchor)); curveBaseP1 = fa.luma.p1; curvePredictedP1 = lev.target; curveNow = curve2; }
          state = await confirmMeasure(); renders++;
          parts.push((pass === 0 ? "corrected: " : "corrected again: ") + notes.join(", "));
        } else { if (notes.length && pass === 0) parts.push(notes.join(", ")); break; }
      }
      // 3. Skin, inside an HSL Secondary key (2026-09-16): the key learned from the hand/face boxes on
      //    the confirmed frame, HSL Tint solved to put the keyed hue on the line, HSL Saturation into the
      //    band, one confirm read on the hand/face box. Only when Vision saw skin; never on a matched cut
      //    (the reference's HSL state is copied).
      const seenVision = (m.frame || m).vision || m.vision;
      if (confirm && !ref && seenVision && ((seenVision.faces || []).length || (seenVision.hands || []).length)) {
        // One render of the confirmed picture, kept on disk: Vision's boxes on it, the key from them,
        // the skin pixels' own numbers (measureFrameAt deletes its PNG otherwise, and the key must be
        // learned from the frame the correction is judged on, not from the first read).
        const skinRegion = (seenVision.faces || []).length ? "face" : "hands";
        let skinNow = null;
        try { skinNow = await timed(() => measureFrameAt(at, { region: skinRegion, keepPlayhead: true, keep: true }), "render"); renders++; } catch (error) { needs.push("skin: " + error.message); }
        const src1 = skinNow && (skinNow.frame || skinNow).src, vis = skinNow && (skinNow.vision || (skinNow.frame && skinNow.frame.vision));
        const key = src1 && vis ? skinKeyFor(src1, vis) : null;
        const boxes = vis ? [...((vis.faces || [])), ...((vis.hands || []))] : [];
        if (skinNow && boxes.length && key) {
          try {
            if (skinNow.region === skinRegion) {
              const sk = gradeSkinFor(skinNow);
              const hueNow = Math.round(GRADE_STATS.skinHue(skinNow) * 10) / 10;
              if (!sk) parts.push("skin: " + skinRegion + " on the line (hue " + hueNow + "°, saturation " + round2(skinNow.saturation.p50) + ")");
              else if (!SKIN_WRITE) parts.push("skin: " + boxes.length + " " + skinRegion + " hue " + hueNow + "°, saturation " + round2(skinNow.saturation.p50) + " (off the line; skin writes are off - nothing written)");
              else {
                const hw = hslWriter(at, track);
                // The mask view against Vision's boxes before anything is corrected: a key that has taken the
                // room (C223, 12:18: the whole kitchen went pink) is tightened once, else skin is skipped here.
                const boxShare = boxes.reduce((sum, b) => sum + Math.max(0, b.box[2] - b.box[0]) * Math.max(0, b.box[3] - b.box[1]), 0);
                let keyText = key.text, spill = null;
                for (let pass = 0; pass < 2; pass++) {
                  await hw.writeKey(keyText); await hw.showMask(true);
                  let mv = null;
                  try { mv = await timed(() => measureFrameAt(at, { region: "keyed", keepPlayhead: true }), "render"); renders++; } finally { await hw.showMask(false); }
                  const cov = mv && mv.region === "keyed" ? mv.coverage : 0;
                  spill = skinSpills(cov, boxShare) ? "the key lights " + round2(cov * 100) + "% of the frame against " + round2(boxShare * 100) + "% of " + skinRegion + " boxes" : null;
                  if (!spill) break;
                  const tight = pass === 0 ? skinKeyFor(src1, vis, { tight: true }) : null;
                  if (!tight) break;
                  keyText = tight.text;
                }
                if (spill) { await hw.writeKey(EMPTY_HSL_KEY); needs.push("skin: " + spill + (keyText !== key.text ? " even tightened" : "") + "; skipped on this clip"); }
                else {
                  await hw.correction(hslPadText(sk.pad));
                  if (sk.saturation !== null) await hw.saturation(sk.saturation);
                  hsl = { key: keyText, pad: sk.pad, saturation: sk.saturation === null ? 100 : sk.saturation };
                  let after = await timed(() => measureFrameAt(at, { region: skinRegion, keepPlayhead: true }), "render"); renders++;
                  let hueAfter = Math.round(GRADE_STATS.skinHue(after) * 10) / 10, satAfter = round2(after.saturation.p50);
                  const hue0 = GRADE_STATS.skinHue(skinNow), target = GRADE_SKIN_HUE_TARGET;
                  const notes = [];
                  // One correction from the real move: the wheel was measured on one key, and another key's
                  // pixels turn more or less per unit of pad. The pad's saturation is rescaled by what this
                  // write actually rotated (the secant); a pad that turned the hue the wrong way comes off.
                  let pad2 = null, sat2 = null;
                  if (sk.pad && Math.abs(hueAfter - hue0) > 1 && (hueAfter < GRADE_SKIN_HUE[0] || hueAfter > GRADE_SKIN_HUE[1])) {
                    const k = (target - hue0) / (hueAfter - hue0);
                    if (k < 0) { pad2 = { hue: sk.pad.hue, sat: 0 }; notes.push("the pad turned the hue the wrong way (" + hue0.toFixed(1) + " → " + hueAfter + "°): off"); }
                    else { pad2 = { hue: sk.pad.hue, sat: Math.round(Math.min(GRADE_HSL_PAD.cap, sk.pad.sat * k) * 1000) / 1000 }; notes.push("pad " + sk.pad.sat.toFixed(2) + " → " + pad2.sat.toFixed(2) + " (hue read " + hueAfter + "°)"); }
                  }
                  if (confirm && gradeUnsafe(gradeDamage(after), gradeAllowance(baseline))) {
                    const h = gradeDamage(after);
                    if (pad2 === null && sk.pad) { pad2 = { hue: sk.pad.hue, sat: Math.round(sk.pad.sat / 2 * 1000) / 1000 }; notes.push("pad halved to " + pad2.sat.toFixed(2)); }
                    if (sk.saturation !== null) { sat2 = Math.round((100 + (sk.saturation - 100) / 2) * 100) / 100; notes.push("saturation halved to " + sat2); }
                    notes.push("the frame clipped " + round2(h.clipped) + "% / crushed " + round2(h.crushed) + "%");
                  }
                  if (pad2 !== null || sat2 !== null) {
                    if (pad2 !== null) { await hw.correction(hslPadText(pad2)); hsl.pad = pad2.sat > 0 ? pad2 : null; }
                    if (sat2 !== null) { await hw.saturation(sat2); hsl.saturation = sat2; }
                    after = await timed(() => measureFrameAt(at, { region: skinRegion, keepPlayhead: true }), "render"); renders++;
                    hueAfter = Math.round(GRADE_STATS.skinHue(after) * 10) / 10; satAfter = round2(after.saturation.p50);
                  }
                  const onLine = hueAfter >= GRADE_SKIN_HUE[0] && hueAfter <= GRADE_SKIN_HUE[1] && satAfter >= GRADE_SKIN_SAT[0] && satAfter <= GRADE_SKIN_SAT[1];
                  parts.push("skin: " + boxes.length + " " + skinRegion + " keyed " + keyText + (keyText !== key.text ? " (tightened)" : "") + " → " + sk.why.join(", ") + (notes.length ? " → corrected: " + notes.join(", ") : "") + " → hue " + hueAfter + "°, saturation " + satAfter + (onLine ? " ✓" : " (line 116-126°, 20-50)"));
                  state = after.frame ? { ...after.frame, region: "frame" } : state;
                }
              }
            }
          } catch (error) { needs.push("skin: " + error.message); }
          finally { if (src1) { try { fs.rmSync(src1, { force: true }); } catch (_) {} } }
        } else { if (src1) { try { fs.rmSync(src1, { force: true }); } catch (_) {} } if (skinNow && boxes.length && !key) needs.push("skin: " + skinRegion + " seen but too few skin-coloured pixels in the box to learn a key"); }
      }
    } catch (error) { lines.push(label + ": " + error.message); continue; }

    touched++;
    const v = gradeVerdict(state, state.region || seen);
    balanced += confirm && v.balanced ? 1 : 0;
    const f1 = state.frame || state;
    // What this cut ended with, read back from Premiere (no render), for the later cuts of the same file.
    try {
      const sliders = {};
      for (const g of goals) sliders[g.param] = await lumetriWriter(at, track, GRADE_PARAMS[g.param].lumetri, region).read();
      const wheels = wheelsErr ? null : (await ww.read()).wheels, curves = curvesErr ? null : (await cw.read()).curves, satNow = satErr ? [] : (await sw.read()).points;
      const tempNow = await tw.read(), tintNow = await tiw.read();
      matched[c.name] = { label, cuts: [at], temp: tempNow, tint: tintNow, wheels, curves, sat: satNow, sliders, hsl };
      matched[c.name].summary = gradeStateSummary(matched[c.name]);
    } catch (_) {}
    const took = tookOf();
    log("grade " + label + took);
    lines.push(label + " [" + seen + (sawV ? "; " + sawV : "") + "] " + before + " → " + parts.join(" → ") + " → black " + round2(f1.luma.p1) + " / white " + round2(f1.luma.p99) + " / blacks " + round2(GRADE_STATS.blacksRB(state)) + " / whites " + round2(GRADE_STATS.whitesRB(state)) + (v.balanced ? (confirm ? " ✓" : " (predicted)") : " — " + v.notes.join("; ")) + (needs.length ? " NEEDS: " + needs.join("; ") : "") + took);
  }
  } finally { if (playheadBefore !== null) { try { await host("playhead", playheadBefore); } catch (_) {} } }
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  lines.sort((a, b) => { const ta = /@([\d.]+)s/.exec(a), tb = /@([\d.]+)s/.exec(b); return (ta ? Number(ta[1]) : 0) - (tb ? Number(tb[1]) : 0); }); // ponytail: the reference cut was graded first; the reader wants timeline order
  lines.unshift("Graded V" + track + " by " + region + (read !== "premiere" ? ", read from the source files where possible" : "") + (confirm ? "" : ", NOT confirmed") + ": " + clips.length + " clips, " + touched + " changed, " + (confirm ? balanced + " balanced" : "balanced count withheld (unverified)") + ", " + renders + " Premiere renders in " + secs + "s" + (stopped ? " — STOPPED by the editor" : "") + "."
    + (parity ? (parity.off > PARITY_MAX ? " The source decode did NOT match Premiere's render on " + parity.clip + " (off by " + parity.off + "): the clip's source settings (Blackmagic RAW decode, LUT, colour space) differ from the decoder's, so every clip was read from Premiere instead." : " Source decode checked against Premiere's render on " + parity.clip + ": matched (within " + parity.off + ").") : ""));
  if (!confirm) lines.push("Unconfirmed: the knobs are the model's prediction and nothing was re-measured; every verdict above is a prediction. Run scopes on a couple of clips, or rerun with confirm on, before trusting any of it.");
  lines.push((ui.dupSequence.checked ? "Every change is on the working copy; Discard copy removes all of it." : "Duplicate-first is OFF: every change is on the active sequence itself, Cmd+Z per write.") + " Balanced means, on the sampled frame: parade ends aligned on both axes, black point ≤ " + GRADE_ACCEPT.blackMax + ", white point " + GRADE_ACCEPT.whiteMin + "-" + GRADE_ACCEPT.whiteMax + ", spread neither flat nor harsh, nothing clipped or crushed beyond what the source had.");
  card.done(lines.join("\n"), true);
  setStatus("Thinking…");
  return { text: copyNote + lines.join("\n") };
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
async function applyCuts(card, cuts, dryRun, summary, expectedSnapshot = null) {
  if (expectedSnapshot && timelineFingerprint(await readSnapshot()) !== timelineFingerprint(expectedSnapshot)) return err(card, "timeline changed before cleanup; nothing cut");
  const plan = cuts.length ? cuts.slice().reverse().map((c) => c.start.toFixed(2) + "-" + c.end.toFixed(2) + "s").join(", ") : "none";
  if (dryRun || !cuts.length) {
    card.done("PLAN: " + summary + "\nREMOVE: " + plan, true);
    return { text: "PLAN (nothing changed): " + summary + "\nREMOVE: " + plan + (cuts.length ? "\nCall again with dry_run=false to apply. Each range becomes one Extract step in Premiere's History (Cmd+Z per range)." : "") };
  }
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  // One range per host call, latest first (earlier cuts must not shift later ones); the duration is checked
  // after every range and the first mismatch stops the rest, so a misbehaving extract cannot empty a timeline.
  const ordered = cuts.slice().sort((a, b) => b.start - a.start);
  const BATCH = 1;
  let doneRanges = 0, ok = true, raw = "";
  const snapBefore = await readSnapshot().catch(() => ({ duration: NaN, error: "no snapshot" }));
  if (expectedSnapshot && timelineFingerprint(snapBefore) !== timelineFingerprint(expectedSnapshot)) return err(card, "timeline changed before cleanup; nothing cut");
  let expectedCut = expectedSnapshot;
  const durBefore = snapBefore.duration;
  const fpBefore = snapBefore.error ? "" : timelineFingerprint(snapBefore); // taken BEFORE any extract; the module timeline is refreshed by Premiere's events mid-cut and cannot be trusted for this
  const planned = cuts.reduce((s, c) => s + Math.max(0, Math.min(c.end, durBefore || c.end) - c.start), 0);
  const t0 = Date.now();
  refreshSuspended = true; clearTimeout(snapshotTimer); clearTimeout(ledgerTimer);
  for (let i = 0; i < ordered.length && ok; i += BATCH) {
    if (cancelRequested) { ok = false; raw = "stopped by the editor after " + doneRanges + " of " + ordered.length + " range(s); the rest were not cut (Cmd+Z per range undoes the done ones)"; break; }
    const batch = ordered.slice(i, i + BATCH);
    setStatus("Cutting " + Math.min(i + batch.length, ordered.length) + " / " + ordered.length + " ranges…");
    card.progress(i, ordered.length, "cutting ");
    let boundRaw = "";
    if (expectedCut) {
      boundRaw = await host("snapshot");
      if (timelineFingerprint(parseSnapshot(boundRaw)) !== timelineFingerprint(expectedCut)) { ok = false; raw = "timeline changed during cleanup; remaining cuts stopped"; break; }
    }
    raw = await host("extractRanges", JSON.stringify(batch.map((c) => [c.start, c.end])), boundRaw);
    // Every Extract the host performed, with what it asked for and what Premiere did, kept next to the project
    // and in the log: the evidence for any wipe is then already on disk.
    try { const tm = /TRACE\{([\s\S]*?)\}/.exec(raw); if (tm) { const lines = tm[1].split(" ;; "); fs.mkdirSync(analysisDir(), { recursive: true }); fs.appendFileSync(seqFile(".extract-trace.txt"), new Date().toISOString() + "\n" + lines.join("\n") + "\n"); lines.forEach((l) => log("extract " + l)); raw = raw.replace(tm[0], ""); } } catch (_) {}
    // The host reports "extracted=X/Y ... [ERRORS: ...]": count what it actually did, and stop on any error.
    const m = /extracted=(\d+)\/(\d+)/.exec(raw);
    ok = raw.indexOf("ERR:") !== 0 && raw !== "EvalScript error." && !!m && m[1] === m[2] && raw.indexOf(" ERRORS:") < 0;
    if (m) doneRanges += Number(m[1]);
    if (ok && Number.isFinite(durBefore)) {
      // Independent check from the panel side after every range: the timeline shortened by the ranges so far
      // and nothing else. The first mismatch stops the loop before it can compound.
      const current = await readSnapshot().catch(() => ({ duration: NaN }));
      if (expectedCut && (current.error || current.id !== expectedSnapshot.id || !Number.isFinite(current.duration))) { ok = false; raw = "active sequence changed during cleanup; remaining cuts stopped"; break; }
      expectedCut = expectedCut ? current : null;
      const now = current.duration;
      const plannedSoFar = ordered.slice(0, i + 1).reduce((s, c) => s + (c.end - c.start), 0);
      if (Number.isFinite(now) && Math.abs((durBefore - now) - plannedSoFar) > (i + 1) * 0.05 + 0.1) {
        ok = false;
        raw = "after range " + batch[0].start.toFixed(2) + "-" + batch[0].end.toFixed(2) + "s the timeline is " + now.toFixed(2) + "s, expected " + (durBefore - plannedSoFar).toFixed(2) + "s; stopped before the remaining " + (ordered.length - i - 1) + " range(s). Cmd+Z " + (i + 1) + " time(s) restores it.";
      }
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  raw = (ok ? "extracted " + doneRanges + " range(s) in " + secs + "s" : raw);
  setStatus("Thinking…");
  refreshSuspended = false;
  timeline = await readSnapshot();
  refreshLedgerSoon();
  // The exact timeline transcript rides along with the cut: words in the removed ranges go, the rest move
  // earlier, and it is re-stamped for the new timeline, so fillers, takes and captions after a cut stay exact.
  if (ok) { try { const tp = timelineTranscriptPath(); const j = JSON.parse(fs.readFileSync(tp, "utf8")); if (j.fingerprint === fpBefore) { const { remapWordsThroughCuts } = require(path.join(extensionRoot, "src", "transcript.cjs")); j.words = remapWordsThroughCuts(j.words, cuts); j.fingerprint = timelineFingerprint(timeline); j.remappedAt = new Date().toISOString(); fs.writeFileSync(tp, JSON.stringify(j)); } } catch (_) {} }
  // Post-condition: the sequence shortened by what was planned (each range lands on frame boundaries, so allow
  // one frame per range plus a little). A mismatch is reported as a FAIL the model must relay.
  let check = "";
  if (ok && Number.isFinite(durBefore) && Number.isFinite(timeline.duration)) {
    const removed = durBefore - timeline.duration, tol = cuts.length * 0.05 + 0.1;
    check = "\nCHECK " + (Math.abs(removed - planned) <= tol ? "PASS" : "FAIL") + ": sequence " + durBefore.toFixed(2) + "s -> " + timeline.duration.toFixed(2) + "s, removed " + removed.toFixed(2) + "s, planned " + planned.toFixed(2) + "s";
    if (Math.abs(removed - planned) > tol) ok = false;
  }
  card.done(raw + check, ok);
  return { text: copyNote + (ok ? raw + check + "\nUndo: Cmd+Z once per extracted range (" + cuts.length + " ranges). Nothing else was changed." : "CLAUDE_FOR_ADOBE_ERROR:" + raw + check), isError: !ok };
}

// Silence removal. method "vad" (default): Silero VAD finds speech on every audio clip; everything outside
// speech is a candidate cut. method "db": Premiere's peak-file waveform vs each clip's noise floor.
const CUT_PRESETS = { social: { min_silence_s: 0.3, pad_s: 0.04 }, natural: { min_silence_s: 0.6, pad_s: 0.15 } };
async function removeSilences({ start_seconds = 0, end_seconds, min_silence_s = 0.3, pad_s = 0.04, threshold_db, method = "vad", preset, dry_run = true, _planOnly = false }) {
  if (preset && CUT_PRESETS[preset]) ({ min_silence_s, pad_s } = CUT_PRESETS[preset]);
  const useVad = method !== "db" && vad.available();
  const card = addTool((dry_run ? "plan" : "remove") + "_silences (" + (useVad ? "voice: Silero VAD" : "dB") + ")", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(Math.max(0, Number(start_seconds)), end_seconds ? Number(end_seconds) : Infinity)); } catch (error) { return err(card, error.message); }
  const a = Math.max(0, Number(start_seconds)), b = Math.min(snap.duration, end_seconds ? Number(end_seconds) : snap.duration);
  const coverage = [], loud = [], skipped = [], covered = [];
  const CAMERA_RAW = /\.(braw|r3d|crm|arw)$/i; // ffmpeg cannot open these; Premiere's own waveform can
  const byWaveform = (c) => {
    if (!c.pek) { skipped.push(c.track + " " + c.name + " (no waveform yet)"); loud.push({ start: c.start, end: c.end }); return; }
    coverage.push({ start: c.s0, end: c.s1 }); covered.push(c);
    try { loud.push(...loudIntervals(peakWindows(parsePeakFile(c.pek), c.rate, c.inPoint + (c.s0 - c.start), c.s1 - c.s0, 0.1, c.s0), 0.1, threshold_db === undefined ? undefined : Number(threshold_db))); }
    catch (error) { skipped.push(c.track + " " + c.name + " (" + error.message + ")"); loud.push({ start: c.start, end: c.end }); }
  };
  clips.forEach((c) => {
    const offset = c.start - c.inPoint; // source seconds -> timeline seconds
    if (useVad && !CAMERA_RAW.test(c.mediaPath || "")) {
      if (!c.mediaPath || !fs.existsSync(c.mediaPath)) { skipped.push(c.track + " " + c.name + " (media offline)"); loud.push({ start: c.start, end: c.end }); return; }
      try {
        setStatus("Silero VAD: " + c.name + "…");
        const r = vad.speechSegments(c.mediaPath);
        coverage.push({ start: c.s0, end: c.s1 }); covered.push(c);
        r.segments.forEach((g) => { const st = g.start + offset, en = g.end + offset; if (en > c.s0 && st < c.s1) loud.push({ start: Math.max(c.s0, st), end: Math.min(c.s1, en) }); });
      } catch (error) {
        // Voice detection could not read it (silent decode, unsupported format): Premiere's waveform is the fallback, never "all silence".
        if (c.pek) { skipped.push(c.track + " " + c.name + " (voice detection: " + error.message.split(":")[0] + "; used Premiere's waveform)"); byWaveform(c); }
        else { skipped.push(c.track + " " + c.name + " (" + error.message + ")"); loud.push({ start: c.start, end: c.end }); }
      }
      return;
    }
    byWaveform(c);
  });
  // A clip with no speech or level anywhere in it is unreadable audio far more often than silence. It is never
  // cut whole from a silence pass (2026-09-07: two camera clips were removed entirely this way); it is dropped
  // from coverage and named, and the editor decides.
  const { unheardClips } = require(path.join(extensionRoot, "src", "silence.cjs"));
  const unheard = unheardClips(covered, loud);
  if (unheard.length) {
    const names = unheard.map((i) => covered[i]);
    names.forEach((c) => { const k = coverage.findIndex((x) => x.start === c.s0 && x.end === c.s1); if (k >= 0) coverage.splice(k, 1); loud.push({ start: c.start, end: c.end }); });
    skipped.push(...names.map((c) => c.track + " " + c.name + " (no speech or level found anywhere in it: treated as unreadable, NOT cut; check its audio)"));
  }
  const cuts = planCuts(silencesFrom(coverage, loud, a, b), { minLen: Number(min_silence_s), pad: Number(pad_s), rangeStart: a, rangeEnd: b });
  const total = cuts.reduce((n, c) => n + (c.end - c.start), 0);
  const how = useVad ? "voice: Silero VAD speech regions, min " + min_silence_s + "s, pad " + pad_s + "s" : "waveform" + (threshold_db === undefined ? ", threshold auto = noise floor + 8 dB" : ", threshold " + threshold_db + " dBFS");
  const summary = cuts.length + " silent range(s), " + total.toFixed(1) + "s total, sequence " + snap.duration.toFixed(1) + "s -> " + (snap.duration - total).toFixed(1) + "s (method: " + how + ")"
    + (skipped.length ? " (never cut: " + skipped.join(", ") + ")" : "");
  if (_planOnly) return { cuts, snap, summary };
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
const timelineFingerprint = require(path.join(extensionRoot, "src", "timeline.cjs")).fingerprint;

// Exact transcript of the CURRENT cut: render the sequence audio (Premiere's 16 kHz mono preset), transcribe it.
// Words are already in timeline time. Cached by timeline fingerprint next to the project.
// Premiere ships a 16 kHz mono WAV export preset; find it inside the installed app (any version) from the Node side.
function wavPreset() {
  const roots = ["/Applications"];
  for (const root of roots) {
    let apps = []; try { apps = fs.readdirSync(root).filter((d) => /^Adobe Premiere Pro/i.test(d)); } catch (_) {}
    for (const d of apps.sort().reverse()) {
      let bundles = []; try { bundles = fs.readdirSync(path.join(root, d)).filter((b) => b.endsWith(".app")); } catch (_) {}
      for (const b of bundles) {
        const p = path.join(root, d, b, "Contents", "Settings", "EncoderPresets", "WAV_Mono_16bit_16kHz.epr");
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return "";
}

// Every per-sequence analysis file goes through here so a name like "9/16 social" maps to the same path everywhere.
const seqFile = (suffix) => path.join(analysisDir(), (project.sequence || "sequence").replace(/[\/\\:]/g, "_") + suffix);
function timelineTranscriptPath() { return seqFile(".timeline.json"); }
// Nudges from background jobs (transcription, downloads, the save watcher) wait for Claude's turn to end.
const queuedNudges = [];
function nudge(text) {
  if (!session) return;
  if (session.busy) { queuedNudges.push(text); return; }
  setBusy(true); setStatus("Thinking…");
  try { sendTurn(text); } catch (_) { setBusy(false); }
}
function freshTimelineWords(snap) {
  try { const j = JSON.parse(fs.readFileSync(timelineTranscriptPath(), "utf8")); return j.fingerprint === timelineFingerprint(snap) ? j : null; } catch (_) { return null; }
}
// Transcribe an already rendered timeline mix and write the analysis files. Returns { words, md }.
async function transcribeRenderedTimeline(wav, snap, language, onProgress) {
  const r = await transcribe(wav, { language, vad: true, onLog: log, onProgress: (p) => { if (p && p.transcribing !== undefined) { setStatus("Whisper: " + p.transcribing + "%…"); if (onProgress) onProgress(p.transcribing); } } });
  const lines = linesFromWords(r.words, 0).map((l) => "[" + tc(l.start) + "] " + l.text);
  const md = writeAnalysis((project.sequence || "sequence") + ".timeline.transcript.md", "# Timeline transcript of \"" + (project.sequence || "sequence") + "\" (exact for this cut)\n<!-- timeline " + timelineFingerprint(snap) + " -->\n" + snap.duration.toFixed(1) + "s, " + snap.clips.length + " clips, " + r.words.length + " words, timestamps are sequence seconds.\n\n" + lines.join("\n") + "\n");
  fs.writeFileSync(timelineTranscriptPath(), JSON.stringify({ fingerprint: timelineFingerprint(snap), words: r.words, md, createdAt: new Date().toISOString() }));
  return { words: r.words, md };
}

async function transcribeTimeline({ language = "en" } = {}) {
  const card = addTool("transcribe_timeline", "");
  card.open();
  let snap;
  try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const fresh = freshTimelineWords(snap);
  if (fresh) { card.done("cached for this cut: " + fresh.words.length + " words", true); return { text: "Timeline transcript already exists for this exact cut (" + fresh.words.length + " words): " + fresh.md + ". Use read_transcript (source timeline) or find_in_transcript." }; }
  if (!modelReady()) {
    const go = await askInline("Transcribing the timeline needs the Whisper model (" + currentModel() + ", " + WHISPER_MODELS[currentModel()].mb + " MB, one time). Download it now?", "Download", "Not now");
    if (!go) return err(card, "The user chose not to download the Whisper model now.");
    downloadWhisperModel().then((ok) => { if (ok) nudge("[The Whisper model finished installing. Continue: transcribe_timeline.]"); });
    card.done("download started", true);
    return { text: "Whisper model download started; tell the user in one line and stop. You will be told when it is installed." };
  }
  const wav = seqFile(".mix.wav");
  fs.mkdirSync(analysisDir(), { recursive: true });
  try { fs.unlinkSync(wav); } catch (_) {} // never transcribe a stale render if the export fails silently
  card.progress(0, 3, "rendering timeline audio ");
  setStatus("Rendering timeline audio…");
  const preset = wavPreset();
  if (!preset) return err(card, "could not find Premiere's WAV export preset (WAV_Mono_16bit_16kHz.epr) under /Applications");
  const out = await host("exportSequenceAudio", wav, preset);
  if (out.indexOf("ERR:") === 0 || !fs.existsSync(wav)) return err(card, "audio render failed: " + out.replace(/^ERR:/, ""));
  try { fs.writeFileSync(seqFile(".mix.json"), JSON.stringify({ timeline: timelineFingerprint(snap) })); } catch (_) {}
  card.progress(1, 3, "transcribing ");
  setStatus("Whisper: timeline…");
  // Runs outside the tool call (a timer, so this reply reaches Claude first); nudges Claude when done.
  setTimeout(async () => {
    try {
      const { words, md } = await transcribeRenderedTimeline(wav, snap, language);
      card.done(words.length + " words -> " + md, true);
      setStatus("Ready");
      nudge("[Timeline transcription finished: " + words.length + " words, written to " + md + ". Timestamps are sequence seconds. Continue with the task; read_transcript / find_in_transcript / remove_fillers now use this exact transcript.]");
    } catch (error) { card.done("transcription failed: " + error.message, false); setStatus("Ready"); nudge("[Timeline transcription failed: " + error.message + "]"); }
  }, 0);
  return { text: "Timeline audio rendered; transcription started (" + currentModel() + "). Tell the user in one line and stop; you will be told when it is done." };
}

async function readTranscript({ start_seconds = 0, end_seconds, source = "auto" } = {}) {
  // source: auto = exact timeline transcript for this cut if present, else per-clip (Premiere's saved, or Whisper cache)
  const card = addTool("read_transcript", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(Math.max(0, Number(start_seconds)), end_seconds ? Number(end_seconds) : Infinity)); } catch (error) { return err(card, error.message); }
  let transcripts = [];
  if (source !== "whisper" && project.path) { try { transcripts = listTranscripts(project.path); } catch (error) { log("could not read project file: " + error.message); } }
  const out = [], skipped = [], used = new Set();
  const tl = source === "premiere" || source === "whisper" ? null : freshTimelineWords(snap);
  if (tl) { used.add("timeline"); const a = Math.max(0, Number(start_seconds)), b = end_seconds ? Number(end_seconds) : Infinity; linesFromWords(tl.words, 0).filter((l) => l.end > a && l.start < b).forEach((l) => out.push("[" + tc(l.start) + "] " + l.text)); clips = []; }
  clips.forEach((c) => {
    let words;
    try { const r = wordsForClip(c, source, transcripts); words = r.words; used.add(r.from); }
    catch (error) { skipped.push(c.track + " " + c.name + " (" + error.message + ")"); return; }
    const lines = linesFromWords(words, c.start - c.inPoint).filter((l) => l.end > c.s0 && l.start < c.s1);
    const span = words.length ? " [source words " + tc(Math.min(...words.map((w) => w.start))) + "-" + tc(Math.max(...words.map((w) => w.end))) + ", clip uses " + tc(c.inPoint) + "-" + tc(c.inPoint + (c.s1 - c.s0)) + "]" : "";
    if (!lines.length && words.length) out.push("## " + c.track + " " + c.name + " (" + tc(c.s0) + " - " + tc(c.s1) + ") NO WORDS IN RANGE" + span);
    else out.push("## " + c.track + " " + c.name + " (" + tc(c.s0) + " - " + tc(c.s1) + ")" + span);
    lines.forEach((l) => out.push("[" + tc(l.start) + "] " + l.text));
  });
  if (!out.length) return err(card, "No transcript available. In Premiere: Text panel > Transcribe, then Cmd+S (the transcript is read from the saved project file). Or run transcribe_whisper.");
  const stale = used.has("premiere") && project.path ? " (project saved " + ((Date.now() - fs.statSync(project.path).mtimeMs) / 60000).toFixed(0) + " min ago; edits since then are not visible until Cmd+S)" : "";
  const full = out.join("\n") + (skipped.length ? "\n(no transcript yet for: " + skipped.join(", ") + ". Only these need transcribing: transcribe_whisper skips clips already done, or Text panel > Transcribe on them, then Cmd+S.)" : "") + "\n(source: " + [...used].join("+") + "; timestamps are sequence seconds" + stale + ")";
  const fp = timelineFingerprint(snap);
  const file = writeAnalysis((project.sequence || "sequence") + ".transcript.md", "# Transcript of \"" + (project.sequence || "sequence") + "\"\n<!-- timeline " + fp + " -->\nSnapshot of the timeline at " + new Date().toISOString().slice(0, 16).replace("T", " ") + " (" + snap.duration.toFixed(1) + "s, " + snap.clips.length + " clips). After any cut, call read_transcript again; it is instant.\n\n" + full + "\n");
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
    nudge("[The user transcribed in Premiere and saved the project. Continue with the task using read_transcript.]");
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
  nudge("[Transcription finished:\n" + lines.join("\n") + "\nContinue with the task; call transcribe_whisper again to read the cached results or use read_transcript with source=whisper.]");
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
    downloadWhisperModel().then((ok) => { if (ok) nudge("[The Whisper model finished installing. Continue with the transcription the user asked for.]"); });
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
async function projectBins({ bin = "" } = {}) {
  if (!bin) bin = await selectedBin();
  const card = addTool("project_bins" + (bin ? " (" + bin + ")" : ""), "");
  const text = bin ? (await host("binMedia", bin, "true")).split("\u0003").filter(Boolean).map((r) => { const [name, , , vi, tb] = r.split("\u0002"); return name + (vi ? "  " + vi.replace(/\s*\(.*$/, "") : "") + (tb ? " @ " + tb : ""); }).join("\n") : await host("listBins");
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
// The bin the editor has selected in the Project panel (first one), as a path like "Footage/Day 2". "" when none.
// The selected bin as ONE source: a single bin is itself; several bins are their common parent (TALKING HEAD and
// BROLL selected together mean the project folder, and the builder lays the talking head and keeps b-roll out).
function commonParent(paths) {
  if (!paths.length) return "";
  if (paths.length === 1) return paths[0];
  const segs = paths.map((p) => p.split("/"));
  const out = [];
  for (let i = 0; i < segs[0].length; i++) { const seg = segs[0][i]; if (segs.every((x) => x[i] === seg)) out.push(seg); else break; }
  return out.join("/");
}
async function selectedBins() { try { const r = await host("selectedBinPaths"); return r && r.indexOf("ERR:") !== 0 ? r.split("\n").filter(Boolean) : []; } catch (_) { return []; } }
async function selectedBin() { return commonParent(await selectedBins()); }

async function classifyClips({ bin = "" } = {}) {
  const selected = bin ? "" : await host("binMedia", "", "true", "true");
  if (!bin && !selected) bin = await selectedBin();
  const sourceName = bin ? "bin " + bin : selected ? "selected Project clips" : "sequence " + (project.sequence || "");
  const card = addTool("classify_clips (" + sourceName + ")", "");
  card.open();
  const byMedia = new Map();
  let footage = "";
  if (bin || selected) {
    const raw = bin ? await host("binMedia", bin) : selected;
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
  const seqNote = timeline && timeline.width ? " (active sequence " + timeline.width + "x" + timeline.height + ")" : "";
  const text = (footage ? "footage: " + footage + seqNote + "\n" : "") + formatClassification(rows) + "\n(speech % = seconds of detected speech / file length; 'look at a frame' = use preview_frames on that clip before deciding)";
  writeAnalysis((bin ? bin.replace(/\//g, "_") : selected ? "selected-clips" : (project.sequence || "sequence")) + ".classification.md", "# Classification of " + sourceName + "\n\n" + text + "\n");
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
const SEQUENCE_PRESETS = { match: {}, vertical: { width: 1080, height: 1920 }, hd: { width: 1920, height: 1080 }, uhd: { width: 3840, height: 2160 }, square: { width: 1080, height: 1080 }, four_five: { width: 1080, height: 1350 } };
// "9:16", "4:5", "16:9", "1:1", "2.39:1" -> a frame size: portrait and square at 1080 wide, landscape at 1920 wide.
function sizeFromAspect(aspect) {
  const m = /^\s*([\d.]+)\s*[:x\/]\s*([\d.]+)\s*$/.exec(String(aspect || ""));
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]); if (!(a > 0 && b > 0)) return null;
  const even = (n) => Math.round(n / 2) * 2;
  return a < b ? { width: 1080, height: even(1080 * b / a) } : a === b ? { width: 1080, height: 1080 } : { width: 1920, height: even(1920 * b / a) };
}
async function createSequence({ name = "", bin = "", width, height, fps, preset, aspect, insert_clips = true } = {}) {
  if (!bin && !await host("binMedia", "", "false", "true")) bin = await selectedBin();
  if (preset && SEQUENCE_PRESETS[preset]) ({ width = width, height = height } = SEQUENCE_PRESETS[preset]);
  if (!(width && height) && aspect) { const sz = sizeFromAspect(aspect); if (sz) ({ width, height } = sz); }
  const card = addTool("create_sequence " + (name || "(unnamed)"), "");
  if (!name) return err(card, "name is required");
  const raw = await host("createSequenceFromBin", bin, name, width ? String(width) : "", height ? String(height) : "", fps ? String(fps) : "", insert_clips ? "true" : "false", bin ? "false" : "true");
  if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
  const [id, seqName, size, laid, brollSkipped] = raw.split("|");
  if (id) ownSequences.add(id); // the panel made it: edits go straight on it, no working copy
  await refreshProject();
  timeline = await readSnapshot().catch(() => timeline);
  const text = "created sequence \"" + seqName + "\" (" + size + ")" + (insert_clips ? " with " + (laid || "the bin's") + " clip(s) laid in order on V1" : " empty") + (Number(brollSkipped) ? "; " + brollSkipped + " clip(s) from a b-roll bin were NOT laid: place them over the talking head with place_broll after the cut" : "") + "; it is now the active sequence. Undo: Cmd+Z.";
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
  const tlf = source === "auto" ? freshTimelineWords(snap) : null;
  if (tlf) findInWords(tlf.words, query, 0, 20).forEach((h) => hits.push({ ...h, clip: "timeline", track: "" }));
  else clips.forEach((c) => {
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
  const raw = (Array.isArray(ranges) ? ranges : []).map((r) => Array.isArray(r) ? { start: Number(r[0]), end: Number(r[1]) } : { start: Number(r.start), end: Number(r.end) }).filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  const cuts = union(raw).sort((a, b) => b.start - a.start); // overlapping ranges count once
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

// B-roll over the talking head: one clip, one time, one duration, sound off. Deterministic; Cmd+Z per step.
async function placeBroll({ media_path = "", at_seconds, duration_seconds = 4, in_seconds = 0, track = 2 } = {}) {
  const card = addTool("place_broll " + path.basename(media_path) + " @" + Number(at_seconds).toFixed(2) + "s", "");
  if (!media_path || !Number.isFinite(Number(at_seconds))) return err(card, "media_path and at_seconds are required");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const raw = await host("overlayClip", media_path, String(at_seconds), String(duration_seconds), String(Math.max(0, Number(track) - 1)), String(in_seconds));
  const ok = raw.indexOf("ERR:") !== 0;
  card.done(raw, ok);
  timeline = await readSnapshot().catch(() => timeline);
  return { text: copyNote + raw, isError: !ok };
}

// What the viewer sees at a time, or at every cut, from the ledger.
// Fill the frame from the panel side: each footage clip's source size from Premiere's clip data, or from the file
// itself (ffprobe) when Premiere's Video Info is empty (seen on BRAW), scale = 100 x max(W/srcW, H/srcH), position
// centred, applied with a read-back. Independent of the host's fill, which had nothing to compute from.
async function fillFrame(track = 1) {
  let tf; try { tf = await readTransforms(); } catch (error) { return "fill skipped: " + error.message; }
  const clips = tf.rows.filter((c) => c.track === "V" + track && !c.graphic);
  const out = [];
  for (const c of clips) {
    let srcW = c.srcW, srcH = c.srcH, from = "Premiere";
    if (!srcW || !srcH) { const d = c.mediaPath ? mediaDims(c.mediaPath) : null; if (d) { srcW = d.w; srcH = d.h; from = "file"; } }
    if (!srcW || !srcH) { out.push(c.name + ": source size unknown, left as is"); continue; }
    const scale = Number((100 * Math.max(tf.w / srcW, tf.h / srcH)).toFixed(2));
    const t = Number(((c.start + c.end) / 2).toFixed(3));
    const res = await host("nudgeClip", String(t), String(track - 1), "0", "0", "1", "0.5", "0.5", String(scale), "true");
    out.push(c.name + ": " + srcW + "x" + srcH + " (" + from + ") -> scale " + scale + "% centred " + (res.indexOf("CHECK PASS") >= 0 ? "(read back)" : "(" + res.replace(/^ERR:/, "").slice(0, 80) + ")"));
  }
  return out.length ? out.join("; ") : "no footage clips on V" + track;
}

// Centre each footage clip on the face, statically: one Vision read at the clip's midpoint with the other tracks
// hidden, then the Motion position moved so the face sits at the frame's horizontal centre, within what the fill
// scale allows (no blank canvas). The cheap stand-in for tracking until reframe runs on the finished cut.
async function focusFaces(track = 1) {
  if (!fs.existsSync(OCR_BIN)) return ["face focus skipped: vision helper missing"];
  const { readFrame } = require(path.join(extensionRoot, "src", "face.cjs"));
  let tf; try { tf = await readTransforms(); } catch (error) { return ["face focus skipped: " + error.message]; }
  const clips = tf.rows.filter((c) => c.track === "V" + track && !c.graphic && c.x !== null).map((c) => { if (c.srcW && c.srcH) return c; const d = c.mediaPath ? mediaDims(c.mediaPath) : null; return d ? { ...c, srcW: d.w, srcH: d.h } : c; }).filter((c) => c.srcW && c.srcH);
  const out = [];
  for (const c of clips) {
    const t = Number(((c.start + c.end) / 2).toFixed(3));
    const dir = path.join(os.tmpdir(), "claude-for-adobe-focus-" + Date.now().toString(36));
    const raw = await host("frames", JSON.stringify([t]), dir, String(track - 1));
    const rows = raw.indexOf("ERR:") === 0 ? [] : raw.split(ROW).filter((r) => r.indexOf("SOLO") !== 0);
    const [f0] = (rows[0] || "").split(COL); const file = [f0 + ".png", f0].find((p) => p && fs.existsSync(p)) || null;
    if (!file) { out.push(c.name + ": no frame"); continue; }
    let entry = null;
    try { const o = require("node:child_process").execFileSync(OCR_BIN, ["--faces", file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); entry = JSON.parse(o.split("\n").filter(Boolean)[0] || "null"); } catch (_) {}
    try { fs.unlinkSync(file); } catch (_) {}
    const r = readFrame(entry, t);
    if (!r.face) { out.push(c.name + ": no face at " + t.toFixed(1) + "s, left centred"); continue; }
    const scaledW = c.srcW * c.scale / 100, maxShift = Math.max(0, (scaledW / tf.w - 1) / 2);
    const dx = Math.max(-maxShift, Math.min(maxShift, 0.5 - r.centre[0]));
    if (Math.abs(dx) < 0.02) { out.push(c.name + ": face already centred (" + Math.round(r.centre[0] * 100) + "% across)"); continue; }
    const res = await host("nudgeClip", String(t), String(track - 1), "0", "0", "1", String((c.x + dx).toFixed(4)), "", "", "true");
    out.push(c.name + ": face at " + Math.round(r.centre[0] * 100) + "% across, moved " + (dx > 0 ? "right" : "left") + " " + Math.round(Math.abs(dx) * 100) + "% " + (res.indexOf("CHECK PASS") >= 0 ? "(read back)" : "(" + res.slice(0, 80) + ")"));
  }
  return out.length ? out : ["no footage clips on V" + track];
}

// The rough cut as a script: fixed order, each step a tool that already exists, a stop only where judgement is
// needed. A prompt can drift; this cannot.
async function roughCut({ bin = "", aspect, preset, width, height, name = "", language = "en", silence_threshold_db = -35, min_silence_s = 1, pad_s = .18 } = {}) {
  const card = addTool("rough_cut " + (bin || "(selected footage)") + " " + (aspect || preset || (width && height ? width + "x" + height : "")), "");
  card.open();
  const steps = []; let snapAfter1 = null;
  const dur = async () => { const sn = await readSnapshot().catch(() => null); return sn && !sn.error ? sn.duration : NaN; };
  const first = (t) => String(t || "").replace(/^CLAUDE_FOR_ADOBE_ERROR:/, "").split("\n").find((l) => l.trim()) || "";
  const stop = (why) => { const text = steps.concat(["STOPPED: " + why]).join("\n"); card.done(text, false); return { text, isError: true }; };
  if (!Number.isFinite(silence_threshold_db) || silence_threshold_db < -100 || silence_threshold_db > 0 || !Number.isFinite(min_silence_s) || min_silence_s <= 0 || !Number.isFinite(pad_s) || pad_s < 0) return stop("invalid cleanup threshold, minimum silence or padding");
  // 1. the sequence at the shape, no tracking. The name is the macro's job: "<folder> <shape>".
  card.progress(0, 4, "sequence ");
  if (!bin && !await host("binMedia", "", "false", "true")) bin = await selectedBin();
  if (!bin) { const selected = await host("binMedia", "", "false", "true"); if (!selected || selected.indexOf("ERR:") === 0) return stop("select source clips or a talking-head bin in the Project panel, or pass bin"); }
  if (!name) name = (bin.split("/").pop() || "Selected clips") + " " + (aspect || preset || (width && height ? width + "x" + height : "9x16")).replace(/:/g, "x");
  const r1 = await createSequence({ bin, name: name + " Cleanup", aspect, preset, width, height, insert_clips: true });
  if (r1.isError) return stop("sequence: " + first(r1.text));
  // Fill the frame (a 16:9 or 4K shot in a 9:16 sequence must cover it), then centre each clip on the face.
  const fillRes = await fillFrame(1);
  const faces = await focusFaces(1);
  const d1 = await dur();
  steps.push("1. Sequence: " + first(r1.text) + " (" + d1.toFixed(1) + "s). Fill: " + first(fillRes).slice(0, 120) + ". Face focus: " + faces.join("; ") + ". Tracking deferred to the end.");
  if (cancelRequested) return stop("stopped by the editor");
  // Technical cleanup uses audio evidence only. No words, take selection or story decisions here.
  const C = require(path.join(extensionRoot, "src", "cleanup.cjs"));
  let cleanup, editorial;
  try {
    const before = await readSnapshot();
    const cleanupWav = seqFile(".cleanup.mix.wav"), presetPath = wavPreset();
    if (!presetPath) throw new Error("could not find Premiere's WAV export preset");
    fs.mkdirSync(analysisDir(), { recursive: true });
    if (fs.existsSync(cleanupWav)) fs.unlinkSync(cleanupWav);
    const rendered = await host("exportSequenceAudio", cleanupWav, presetPath);
    if (cancelRequested) return stop("stopped by the editor");
    if (rendered.indexOf("ERR:") === 0 || !fs.existsSync(cleanupWav)) throw new Error("cleanup audio render failed: " + rendered);
    const evidence = await audioClipsIn(0, before.duration);
    if (timelineFingerprint(evidence.snap) !== timelineFingerprint(before)) throw new Error("timeline changed during cleanup render");
    const measured = require(path.join(extensionRoot, "src", "silence_map.cjs")).measureWav(cleanupWav, { noiseDb: silence_threshold_db });
    if (Math.abs(measured.duration - before.duration) > .1) throw new Error("cleanup render duration does not match the sequence");
    // Source peaks veto downmix cancellation; missing/quiet source evidence protects the whole clip.
    const sourceEvidence = evidence.clips.map(c => {
      let sound = [];
      try {
        if (c.pek && fs.existsSync(c.mediaPath)) sound = loudIntervals(peakWindows(parsePeakFile(c.pek), c.rate, c.inPoint, c.end - c.start, .1, c.start), .1, silence_threshold_db, 0)
          .map(r => ({ start: Math.max(c.start, r.start), end: Math.min(c.end, r.end) })).filter(r => r.end > r.start);
      } catch (_) {}
      return { id: c.id, sound };
    });
    const plan = C.planCleanup(measured.silences.map(s => ({ start: s.start, end: Math.min(s.end, before.duration) })).filter(s => s.end > s.start), before, { minSilence: min_silence_s, pad: pad_s, sourceEvidence });
    if (cancelRequested) return stop("stopped by the editor");
    fs.writeFileSync(seqFile(".cleanup.json"), JSON.stringify({ ...measured, timeline: timelineFingerprint(before), audioSha256: require("node:crypto").createHash("sha256").update(fs.readFileSync(cleanupWav)).digest("hex"), min_silence_s, pad_s, sourceEvidence, ...plan }));
    const applied = await applyCuts(card, plan.cuts, false, "technical cleanup: measured silence only; preserve detected sound and every take", before);
    if (applied.isError) return stop("technical cleanup: " + applied.text);
    if (cancelRequested) return stop("stopped by the editor");
    cleanup = await readSnapshot();
    if (cleanup.error || cleanup.id !== before.id) throw new Error("active sequence changed during cleanup");
    steps.push("2. Cleanup: \"" + cleanup.name + "\" [" + cleanup.id + "], " + cleanup.duration.toFixed(2) + "s; " + applied.text + (plan.protectedClips.length ? "\nProtected (missing or quiet source waveform): " + plan.protectedClips.join(", ") : "") + "\nNo take, filler or story decisions were made.");
    // Direct native clone, not a guarded script: register it once so editorial tools do not clone again.
    ownSequences.delete(cleanup.id);
    let cloneId = "";
    try {
      const cloned = await host("cloneActive", name + " Editorial");
      if (cloned.indexOf("ERR:") === 0) throw new Error(cloned);
      const parts = cloned.split("|"); cloneId = parts[0];
      await refreshProject();
      if (cancelRequested) throw new Error("stopped by the editor after clone");
      editorial = await readSnapshot();
      if (!cloneId || cloneId === cleanup.id || editorial.id !== cloneId || project.sequenceId !== cloneId || !C.sameContents(cleanup, editorial)) throw new Error("Editorial clone does not match Cleanup clip geometry");
      ownSequences.add(cloneId);
      workingCopies.set(cloneId, { copyName: editorial.name, originalId: cleanup.id, originalName: cleanup.name });
      renderCopies();
      fs.writeFileSync(seqFile(".stages.json"), JSON.stringify({ cleanup: { id: cleanup.id, name: cleanup.name, fingerprint: timelineFingerprint(cleanup) }, editorial: { id: editorial.id, name: editorial.name, fingerprint: timelineFingerprint(editorial) } }));
    } catch (error) {
      await host("openSequence", cleanup.id); await refreshProject();
      throw new Error(error.message + (cloneId ? "; created copy " + cloneId + " left for review" : "") + "; Cleanup reopened, nothing deleted");
    }
    steps.push("3. Editorial: \"" + editorial.name + "\" [" + editorial.id + "]; native copy matches Cleanup clip geometry. All editorial edits go here; Cleanup is preserved.");
  } catch (error) { return stop(error.message); }
  // Render the exact Editorial timeline for transcription; never reuse raw or cross-sequence timestamps.
  if (cancelRequested) return stop("stopped by the editor");
  card.progress(1, 4, "render ");
  snapAfter1 = await readSnapshot().catch(() => null);
  if (!snapAfter1 || snapAfter1.error) return stop("could not read the new sequence");
  const wav = seqFile(".mix.wav");
  fs.mkdirSync(analysisDir(), { recursive: true });
  try { fs.unlinkSync(wav); } catch (_) {}
  const wavPresetPath = wavPreset();
  if (!wavPresetPath) return stop("could not find Premiere's WAV export preset");
  setStatus("Rendering timeline audio…");
  const rendered = await host("exportSequenceAudio", wav, wavPresetPath);
  if (cancelRequested) return stop("stopped by the editor");
  if (rendered.indexOf("ERR:") === 0 || !fs.existsSync(wav)) return stop("audio render failed: " + rendered.replace(/^ERR:/, ""));
  if (timelineFingerprint(await readSnapshot()) !== timelineFingerprint(snapAfter1)) return stop("Editorial timeline changed during audio render");
  try { fs.writeFileSync(seqFile(".mix.json"), JSON.stringify({ timeline: timelineFingerprint(snapAfter1) })); } catch (_) {}
  // 3. the transcript, one exact timeline transcript every step shares. Premiere's own first (instant, when the
  // clips were transcribed in the Text panel and the project saved), else Whisper on the render, with progress.
  if (cancelRequested) return stop("stopped by the editor");
  card.progress(2, 4, "transcript ");
  let transcriptFrom = "";
  try {
    const transcripts = project.path ? listTranscripts(project.path) : [];
    const { clips } = await audioClipsIn(0, Infinity);
    if (clips.length && clips.every((c) => { try { return !!transcriptForClip(transcripts, c); } catch (_) { return false; } })) {
      const words = [];
      clips.forEach((c) => { const t = transcriptForClip(transcripts, c); const off = c.start - c.inPoint; decodeWords(t.base64).forEach((w) => { const st = w.start + off, en = w.end + off; if (en > c.s0 && st < c.s1) words.push({ text: w.text, start: Number(st.toFixed(3)), end: Number(en.toFixed(3)) }); }); });
      words.sort((x, y) => x.start - y.start);
      if (words.length) { fs.writeFileSync(timelineTranscriptPath(), JSON.stringify({ fingerprint: timelineFingerprint(snapAfter1), words, from: "premiere", createdAt: new Date().toISOString() })); transcriptFrom = "Premiere's transcript (Text panel), " + words.length + " words, no Whisper needed"; }
    }
  } catch (_) {}
  if (!transcriptFrom) {
    if (!modelReady()) return stop("no Premiere transcript on these clips and the Whisper model is not installed: transcribe in the Text panel and save (instant next time), or run transcribe_timeline once (it offers the download)");
    setStatus("Whisper: timeline…");
    let r3; try { r3 = await transcribeRenderedTimeline(wav, snapAfter1, language, (pct) => card.progress(2, 4, "transcribing " + pct + "% ")); } catch (error) { return stop("transcription failed: " + error.message); }
    setStatus("Ready");
    transcriptFrom = "Whisper on the timeline render, " + r3.words.length + " words (transcribe in Premiere's Text panel and save to skip this next time)";
  }
  steps.push("4. Editorial transcript: " + transcriptFrom);
  // 4. hand over: the indexed transcript for the one model pass that must be recall-minded (author the thoughts)
  card.progress(3, 4, "index ");
  const idx = await transcriptIndex({});
  const d5 = await dur();
  const broll = /(\d+) clip\(s\) from a b-roll bin were NOT laid/.exec(r1.text || "");
  const text = steps.join("\n") + "\n\nTwo sequences: Cleanup keeps every detected spoken take after silence-only cleanup and initial framing. Editorial is active at " + d5.toFixed(1) + "s, ready for decisions. Original clips untouched." + (broll ? "\nB-roll: " + broll[1] + " clip(s) in a b-roll bin were kept out; place_broll after the story." : "") + "\n\nNOW: work only on Editorial. Author thoughts from the indexed transcript below (every word in exactly one thought, in order; label what was said; kind answer or production; retake_of for the same point, including paraphrases; do not pick winners), then audio_cut with thoughts (report) and review complete meaning. If the user specified a duration limit, choose the coherent short story now from the report: use only its resolved kept ranges for the selected complete lines, check their total with keep_only dry_run, then apply that selected keep_only directly. Do not apply the full take-cleanup report as an intermediate edit for a duration-limited video. Without a duration limit, audio_cut with the same thoughts and apply: true may apply the full report. Take and story decisions belong only here. After the story is at target length: speaker_check on the key line, place_broll, final reframe tracking once, captions last. The transcript below is already available; do not call transcript_index again unless the timeline or requested range changed. Never run another silence pass or edit Cleanup for editorial choices.\n\n" + String(idx.text || "");
  card.done(steps.join("\n") + "\n-> transcript indexed; author the thoughts next", true);
  return { text };
}

// The exact timeline transcript as indexed words, for authoring thoughts.
async function transcriptIndex({ start_seconds = 0, end_seconds } = {}) {
  const card = addTool("transcript_index", "");
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const tlw = freshTimelineWords(snap);
  if (!tlw) return err(card, "no transcript for this exact timeline: run transcribe_timeline (or rough_cut) first");
  const a = Math.max(0, Number(start_seconds) || 0), b = Number(end_seconds) > 0 ? Number(end_seconds) : Infinity;
  const P = require(path.join(extensionRoot, "src", "transcript_presentation.cjs"));
  const fingerprint = timelineFingerprint(snap), warnings = [];
  const wav = seqFile(".presentation.wav"), deliveryFile = seqFile(".delivery.json"), speakerFile = seqFile(".diarization.json");
  let perWord, diarization;
  try {
    // Geometry fingerprints cannot see gain/mute/effects: measure a fresh mix, never reuse .mix.wav.
    const preset = wavPreset();
    if (!preset) throw new Error("Premiere mono WAV preset unavailable");
    if (timelineFingerprint(await readSnapshot()) !== fingerprint) throw new Error("sequence changed before render");
    try { fs.unlinkSync(wav); } catch (_) {}
    const out = await host("exportSequenceAudio", wav, preset);
    if (out.indexOf("ERR:") === 0 || !fs.existsSync(wav)) throw new Error("audio render failed: " + out);
    if (timelineFingerprint(await readSnapshot()) !== fingerprint) throw new Error("sequence changed during render");
    perWord = P.delivery(wav, tlw.words, fingerprint, snap.duration, deliveryFile).perWord;
  } catch (error) { warnings.push("Delivery observations unavailable: " + error.message); }
  if (timelineFingerprint(await readSnapshot()) !== fingerprint) return err(card, "Sequence changed during transcript presentation; retry on the intended sequence");
  if (fs.existsSync(speakerFile)) {
    try {
      diarization = JSON.parse(fs.readFileSync(speakerFile, "utf8"));
      P.render(tlw.words, { timeline: fingerprint, diarization }); // all-or-nothing identity and alignment validation
    } catch (error) { diarization = undefined; warnings.push("Diarization annotations unavailable: " + error.message); }
  }
  let presentation;
  try { presentation = P.render(tlw.words, { timeline: fingerprint, perWord, diarization, start: a, end: b }); }
  catch (error) { return err(card, error.message); }
  const text = presentation + (warnings.length ? "\n" + warnings.join("\n") : "") + "\n\nAuthor thoughts: every word in exactly one thought, in order; label = what was said (a concrete action or idea, not a sentiment); kind = answer for a complete statement, or production for between-take chatter, greetings, crew talk and abandoned incomplete attempts; never let a cut-off fragment compete as an answer retake. retake_of = the id of the earlier thought that says the same thing. Do not choose which take wins: audio_cut measures that. Then audio_cut with thoughts (report); check every kept piece for complete meaning and re-author if fragments won. For a duration-limited video, select only the story ranges from that report and plan/apply them with keep_only; do not apply the whole report first. Otherwise use audio_cut apply: true.";
  card.done(tlw.words.length + " words; intact dialogue with available delivery observations", true);
  return { text };
}

// The thought-level audio cut: authored thoughts (validated, measured, ruled) or, without them, a split by pauses.
async function audioCut({ thoughts, apply = false, gap_seconds, pad_seconds, silence_threshold_db = -35 } = {}) {
  const card = addTool((apply ? "cut" : "plan") + "_thoughts" + (Array.isArray(thoughts) && thoughts.length ? " (" + thoughts.length + " authored)" : " (by pauses)"), "");
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const tlw = freshTimelineWords(snap);
  if (!tlw) return err(card, "no transcript for this exact timeline: run transcribe_timeline (or rough_cut) first");
  if (Array.isArray(thoughts) && thoughts.length) {
    const A = require(path.join(extensionRoot, "src", "thoughts_authored.cjs"));
    const v = A.validateDraft(tlw.words, { thoughts });
    if (v.problems.length) return err(card, "the thoughts do not fit the transcript:\n" + v.problems.slice(0, 12).join("\n") + "\nFix the indices (transcript_index) and call again; nothing was cut.");
    let perWord, silenceMap;
    // ponytail: export each pass; the host snapshot cannot fingerprint audio gain/mute/effects.
    const wav = seqFile(".silence.mix.wav");
    try {
      if (!Number.isFinite(silence_threshold_db) || silence_threshold_db < -100 || silence_threshold_db > 0) throw new Error("silence_threshold_db must be between -100 and 0");
      const preset = wavPreset();
      if (!preset) throw new Error("Premiere's mono 16 kHz WAV preset was not found");
      if (fs.existsSync(wav)) fs.unlinkSync(wav);
      setStatus("Measuring pauses from timeline audio…");
      const exported = await host("exportSequenceAudio", wav, preset);
      if (exported.indexOf("ERR:") === 0 || !fs.existsSync(wav)) throw new Error("audio render failed: " + exported);
      const after = await readSnapshot();
      if (timelineFingerprint(after) !== timelineFingerprint(snap)) throw new Error("timeline changed during audio render; retry the report");
      silenceMap = require(path.join(extensionRoot, "src", "silence_map.cjs")).measureWav(wav, { noiseDb: silence_threshold_db });
      if (Math.abs(silenceMap.duration - snap.duration) > .1) throw new Error("audio render duration does not match the sequence");
      silenceMap.timeline = timelineFingerprint(snap);
      silenceMap.audioSha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(wav)).digest("hex");
      fs.writeFileSync(seqFile(".silence.json"), JSON.stringify(silenceMap));
      perWord = require(path.join(extensionRoot, "src", "prosody.cjs")).prosodyPerWord(wav, tlw.words);
    } catch (error) { return err(card, "Cannot measure pauses: " + error.message + "; nothing was cut."); }
    const deliveryNote = "delivery from the timeline render; pauses measured from audio at " + silence_threshold_db + " dB (" + silenceMap.silences.length + " silences); edit boundaries snapped up to 4 s; raw words unchanged";
    const plan = A.planFromThoughts(tlw.words, v.thoughts, { perWord, silences: silenceMap.silences });
    const text = A.report(plan) + (v.uncovered.length ? "\nUnassigned words (" + v.uncovered.length + "): " + v.uncovered.slice(0, 20).join(",") + (v.uncovered.length > 20 ? "…" : "") + " (not kept; assign them if they belong to a thought)" : "") + "\n(" + v.thoughts.length + " authored thoughts; " + deliveryNote + ")";
    if (!apply || !plan.ranges.length) { card.done(text, true); return { text: text + (plan.ranges.length ? "\naudio_cut with the same thoughts and apply: true makes this cut as one keep_only." : "") }; }
    const res = await keepOnly({ ranges: plan.ranges.map((r) => [r.start, r.end]), dry_run: false });
    return { ...res, text: res.text + "\n" + text };
  }
  const { planThoughts, report, PAD } = require(path.join(extensionRoot, "src", "thoughts.cjs"));
  // Delivery per take group from the timeline render, when it matches this exact timeline.
  let scoreGroup;
  try {
    const wav = seqFile(".mix.wav"); const meta = JSON.parse(fs.readFileSync(seqFile(".mix.json"), "utf8"));
    if (fs.existsSync(wav) && meta.timeline === timelineFingerprint(snap)) {
      const { prosodyForRanges, deliveryScores } = require(path.join(extensionRoot, "src", "prosody.cjs"));
      scoreGroup = (cands) => deliveryScores(prosodyForRanges(wav, cands.map((c) => ({ start: c.start, end: c.end, words: c.words }))));
    }
  } catch (_) {}
  const plan = planThoughts(tlw.words, { gap: Number(gap_seconds) || 0.6, pad: Number.isFinite(Number(pad_seconds)) ? Number(pad_seconds) : PAD, scoreGroup });
  const text = report(plan) + "\n(from the exact timeline transcript, " + tlw.words.length + " words" + (scoreGroup ? "; take choice includes delivery from the timeline render" : "; no delivery data") + ")";
  if (!apply || !plan.ranges.length) { card.done(text, true); return { text: text + (plan.ranges.length ? "\naudio_cut with apply: true makes this cut as one keep_only." : "") }; }
  const res = await keepOnly({ ranges: plan.ranges.map((r) => [r.start, r.end]), dry_run: false });
  return { ...res, text: res.text + "\n" + text };
}

// Repeated takes on the timeline, from whatever transcript exists (the exact timeline transcript first, else per clip).
async function findTakesTool({ window_seconds = 90, min_similarity = 0.6, apply = false, apply_min, source = "auto" } = {}) {
  const card = addTool((apply ? "remove" : "find") + "_takes", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(0, Infinity)); } catch (error) { return err(card, error.message); }
  const { findTakes, report } = require(path.join(extensionRoot, "src", "takes.cjs"));
  let words = null, from = "";
  const tlw = source === "auto" ? freshTimelineWords(snap) : null;
  if (tlw) { words = tlw.words; from = "timeline transcript (exact for this cut)"; }
  else {
    let transcripts = []; if (source !== "whisper" && project.path) { try { transcripts = listTranscripts(project.path); } catch (_) {} }
    words = []; const skipped = [];
    clips.forEach((c) => { try { const r = wordsForClip(c, source, transcripts); const off = c.start - c.inPoint; r.words.forEach((w) => { const st = w.start + off, en = w.end + off; if (en > c.s0 && st < c.s1) words.push({ text: w.text, start: st, end: en }); }); from = from || r.from + " transcript per clip"; } catch (error) { skipped.push(c.name); } });
    words.sort((a, b) => a.start - b.start);
    if (!words.length) return err(card, "no transcript for this timeline" + (skipped.length ? " (" + skipped.join(", ") + ")" : "") + ": run transcribe_timeline, or transcribe in Premiere's Text panel and save");
  }
  let groups = findTakes(words, { window: Number(window_seconds) || 90, minSim: Number(min_similarity) || 0.6 });
  // Delivery, from the timeline render when it is fresh for this cut: energy, pitch movement and pace per take,
  // scored within each group and added to completeness. Louder, more pitch movement, on the speaker's pace wins.
  let delivery = "no delivery data (the timeline render is missing or stale; rough_cut and transcribe_timeline make it)";
  try {
    const wav = seqFile(".mix.wav"); const meta = JSON.parse(fs.readFileSync(seqFile(".mix.json"), "utf8"));
    if (fs.existsSync(wav) && meta.timeline === timelineFingerprint(snap) && groups.length) {
      const { prosodyForRanges, deliveryScores } = require(path.join(extensionRoot, "src", "prosody.cjs"));
      const ranges = groups.flatMap((g) => g.candidates.map((c) => ({ start: c.start, end: c.end, words: c.words })));
      const sums = prosodyForRanges(wav, ranges);
      let k = 0;
      groups = groups.map((g) => {
        const mine = g.candidates.map(() => sums[k++]);
        const d = deliveryScores(mine);
        const cands = g.candidates.map((c, i) => ({ ...c, delivery: d[i], energyDb: mine[i].energyDb, f0Range: mine[i].f0Range, pace: mine[i].pace, score: Number((c.score + 2 * d[i]).toFixed(2)) }));
        let keep = 0; cands.forEach((c, i) => { if (c.score > cands[keep].score || (c.score === cands[keep].score && i > keep)) keep = i; });
        return { candidates: cands, keep, remove: cands.filter((_, i) => i !== keep).map((c) => ({ start: c.start, end: c.end, text: c.text })) };
      });
      delivery = "delivery from the timeline render (energy dB, pitch range Hz, words/s; +2 x delivery in the score)";
    }
  } catch (_) {}
  const { SURE } = require(path.join(extensionRoot, "src", "takes.cjs"));
  const sureMin = Number.isFinite(Number(apply_min)) ? Number(apply_min) : SURE;
  const line = (g) => g.candidates.map((c, i) => "  " + (i === g.keep ? "KEEP  " : (g.similarity >= sureMin ? "drop  " : "drop? ")) + c.start.toFixed(2) + "s-" + c.end.toFixed(2) + "s (" + c.words + " words, " + c.fillers + " fillers" + (c.delivery !== undefined ? ", " + c.energyDb + " dB, pitch range " + (c.f0Range === null ? "?" : c.f0Range) + ", " + c.pace + " w/s, delivery " + (c.delivery >= 0 ? "+" : "") + c.delivery : "") + ", score " + c.score + "): \"" + c.text.slice(0, 90) + (c.text.length > 90 ? "…" : "") + "\"").join("\n");
  const text = (groups.length ? groups.map((g, gi) => "Take group " + (gi + 1) + " (" + g.candidates.length + " takes, similarity " + g.similarity + (g.similarity >= sureMin ? ", sure" : ", possible: a human decides") + "):\n" + line(g)).join("\n") : report(groups)) + "\n(from the " + from + "; " + delivery + ")";
  const sure = groups.filter((g) => g.similarity >= sureMin), possible = groups.length - sure.length;
  if (!apply || !sure.length) { card.done(text, true); return { text: text + (groups.length ? "\n" + (sure.length ? sure.length + " sure group(s) would be cut by apply: true; " : "") + (possible ? possible + " possible group(s) are suggestions only: use keep_only with your own choice." : "") : "") }; }
  const cuts = union(sure.flatMap((g) => g.remove).map((r) => ({ start: r.start, end: r.end }))).sort((a, b) => b.start - a.start);
  const total = cuts.reduce((n, c) => n + (c.end - c.start), 0);
  const res = await applyCuts(card, cuts, false, cuts.length + " dropped take(s) from " + sure.length + " sure group(s), " + total.toFixed(1) + "s, sequence " + snap.duration.toFixed(1) + "s -> " + (snap.duration - total).toFixed(1) + "s" + (possible ? "; " + possible + " possible group(s) left for a human" : ""));
  return { ...res, text: res.text + "\n" + text };
}

// Multicam angle switch through QE, verified by rendering the frame before and after.
async function multicamSwitch({ at_seconds, camera, record = false } = {}) {
  const card = addTool("multicam_switch @" + Number(at_seconds).toFixed(2) + "s -> camera " + camera, "");
  if (!Number.isFinite(Number(at_seconds)) || !Number.isFinite(Number(camera))) return err(card, "at_seconds and camera are required");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const t = Number(Number(at_seconds).toFixed(3));
  const dir = path.join(os.tmpdir(), "claude-for-adobe-mc-" + Date.now().toString(36));
  // Frames clearly inside each side of the cut (never on the cut itself: a frame on the boundary can fall on the
  // unchanged side after frame snapping, which read as "no change" on 2026-09-07 with two different angles).
  const probeTimes = [Number((t - 0.5).toFixed(3)), Number((t + 0.5).toFixed(3))].filter((x) => x >= 0);
  const files = (raw) => { if (raw.indexOf("ERR:") === 0) return []; return raw.split(ROW).filter((r) => r.indexOf("SOLO") !== 0).map((row) => { const [f] = row.split(COL); return [f + ".png", f].find((p) => p && fs.existsSync(p)) || null; }); };
  const beforeFrames = files(await host("frames", JSON.stringify(probeTimes), dir + "-a", ""));
  const raw = await host("multicamSwitch", JSON.stringify({ at: t, camera: Number(camera), record: !!record }));
  if (raw.indexOf("ERR:") === 0) return err(card, copyNote + raw.slice(4));
  const afterFrames = files(await host("frames", JSON.stringify(probeTimes), dir + "-b", ""));
  const sides = probeTimes.map((pt, i) => ({ t: pt, share: beforeFrames[i] && afterFrames[i] ? frameMatchShare(beforeFrames[i], afterFrames[i]) : null }));
  beforeFrames.concat(afterFrames).forEach((f) => { try { if (f) fs.unlinkSync(f); } catch (_) {} });
  const after = sides.find((x) => x.t > t) || sides[sides.length - 1], beforeSide = sides.find((x) => x.t < t);
  const share = after ? after.share : null;
  timeline = await readSnapshot().catch(() => timeline);
  const steps = raw.split(ROW).map((r) => r.split(COL).join(": "));
  const switched = /^switched: yes/m.test(steps.join("\n"));
  const accepted = /^changeCamera[^\n]*returned true/m.test(steps.join("\n"));
  const pictureChanged = share !== null && share < 0.9;
  // Premiere's own word is the verdict: changeCamera accepted and a new piece cut at the playhead is exactly what
  // the number key does. The frame comparison is supporting evidence only: two angles from the same file look
  // identical, and that says nothing about the switch.
  const ok = switched || (accepted && pictureChanged);
  const sideText = (x, label) => x ? label + " (" + x.t.toFixed(2) + "s): " + (x.share === null ? "could not render" : Math.round(x.share * 100) + "% identical before vs after" + (x.share < 0.9 ? ", picture changed" : ", same picture")) : "";
  const semantics = beforeSide && after && beforeSide.share !== null && after.share !== null ? (after.share < 0.9 && beforeSide.share >= 0.9 ? " -> the switch applies forward from the cut" : after.share < 0.9 && beforeSide.share < 0.9 ? " -> the whole clip switched, both sides" : after.share >= 0.9 && beforeSide.share < 0.9 ? " -> the switch applied to the piece BEFORE the cut" : " -> no picture change on either side (angles may share a source)") : "";
  const text = copyNote + steps.join("\n") + "\n" + [sideText(beforeSide, "before the cut"), sideText(after, "after the cut")].filter(Boolean).join("; ") + semantics + " | CHECK " + (ok ? "PASS: Premiere accepted the camera change and cut a new piece at the playhead" : accepted ? "FAIL: the call was accepted but no new piece appeared and the picture is unchanged" : "FAIL: changeCamera was not accepted in any argument shape");
  card.done(text, ok);
  return { text, isError: !ok };
}

// Settle moments by Premiere's renderer: composite vs base track alone, batched into two host calls for any number
// of moments; the matching share per moment is what the viewer sees of the base. Returns Map(t -> share).
async function settleMoments(times, baseIdx, card, label) {
  const out = new Map();
  const ts = [...new Set(times.map((t) => Number(t.toFixed(3))))];
  if (!ts.length) return out;
  const dir = path.join(os.tmpdir(), "claude-for-adobe-settle-" + Date.now().toString(36));
  const files = (raw) => { if (raw.indexOf("ERR:") === 0) return []; return raw.split(ROW).filter((r) => r.indexOf("SOLO") !== 0).map((row) => { const [f] = row.split(COL); return [f + ".png", f].find((p) => p && fs.existsSync(p)) || null; }); };
  if (card) card.progress(0, 2, label || "rendering composite ");
  const comp = files(await host("frames", JSON.stringify(ts), dir + "-c", ""));
  if (card) card.progress(1, 2, label || "rendering base alone ");
  const solo = files(await host("frames", JSON.stringify(ts), dir + "-s", String(baseIdx)));
  ts.forEach((t, i) => { const a = comp[i], b = solo[i]; if (a && b) { const sh = frameMatchShare(a, b); if (sh !== null) out.set(t, sh); } });
  comp.concat(solo).forEach((f) => { try { if (f) fs.unlinkSync(f); } catch (_) {} });
  return out;
}

// What an alpha layer (AE comp, MOGRT, alpha still) does to the picture under it is a property of the FILE, not of
// the cut: settle it once with one to three samples across the clip, cache the verdict next to the project by
// media path, and reuse it for every cut it sits over and every sequence it appears in.
function alphaCoverCache() { try { return JSON.parse(fs.readFileSync(path.join(analysisDir(), "alpha-cover.json"), "utf8")); } catch (_) { return {}; } }
async function settleAlphaLayers(L, baseIdx, card) {
  const cache = alphaCoverCache();
  const layers = L.clips.filter((c) => c.track !== L.base && c.cover === "alpha" && c.share > 0 && c.mediaPath);
  const need = [];
  for (const c of layers) if (!cache[c.mediaPath]) need.push(c);
  if (need.length) {
    const samples = [];
    need.forEach((c) => { const d = c.end - c.start; const rel = d > 4 ? [0.25, 0.5, 0.75] : [0.5]; rel.forEach((r) => samples.push({ path: c.mediaPath, t: c.start + d * r })); });
    const shares = await settleMoments(samples.map((x) => x.t), baseIdx, card, "settling " + need.length + " alpha layer(s) with " + samples.length + " frame pair(s) ");
    need.forEach((c) => {
      const mine = samples.filter((x) => x.path === c.mediaPath).map((x) => shares.get(Number(x.t.toFixed(3)))).filter((v) => v !== undefined);
      if (!mine.length) return;
      const baseVisible = Math.min(...mine);
      cache[c.mediaPath] = { baseVisible: Number(baseVisible.toFixed(2)), verdict: baseVisible < 0.35 ? "hides" : baseVisible > 0.65 ? "overlay" : "partial", samples: mine.length, settledAt: new Date().toISOString() };
    });
    try { fs.mkdirSync(analysisDir(), { recursive: true }); fs.writeFileSync(path.join(analysisDir(), "alpha-cover.json"), JSON.stringify(cache, null, 1)); } catch (_) {}
  }
  return cache;
}

async function visibleAtTool({ at_seconds, base_track = 1, settle = false } = {}) {
  const card = addTool("visible_at" + (Number.isFinite(Number(at_seconds)) ? " @" + Number(at_seconds).toFixed(2) + "s" : " (all cuts)") + (settle ? " settle" : ""), "");
  let L; try { L = (await getLedger()).ledger; } catch (error) { return err(card, error.message); }
  if (!L) return err(card, "no active sequence");
  const { visibleAt } = require(path.join(extensionRoot, "src", "ledger.cjs"));
  const base = "V" + base_track;
  // Settling: alpha layers are judged once per FILE (cached in alpha-cover.json next to the project), so a run
  // costs one to three frame pairs per distinct comp the first time and nothing after. A single moment asked for
  // explicitly is rendered directly.
  let cache = alphaCoverCache();
  const settled = new Map(); // t -> base-visible share, only for an explicit moment
  if (settle) {
    card.open();
    if (Number.isFinite(Number(at_seconds))) { const m = await settleMoments([Number(at_seconds)], base_track - 1, card, "rendering composite vs " + base + " alone "); m.forEach((v, k) => settled.set(k, v)); }
    else cache = await settleAlphaLayers({ ...L, base }, base_track - 1, card);
  }
  const layerVerdict = (mediaPath) => cache[mediaPath];
  const settledText = (t) => { const k = [...settled.keys()].find((x) => Math.abs(x - t) < 0.01); return k === undefined ? "" : " RENDERED: " + base + " is " + Math.round(settled.get(k) * 100) + "% of what the viewer sees"; };
  // Per cut: the alpha layers over it, with their cached verdicts when known.
  const layersOver = (t) => L.clips.filter((c) => c.track !== base && c.cover === "alpha" && c.share && c.start <= t && t < c.end);
  const cutVerdict = (c) => {
    const over = [...new Set(layersOver(c.t - 0.25).concat(layersOver(c.t + 0.25)))];
    if (!over.length) return "";
    const known = over.map((l) => ({ l, v: layerVerdict(l.mediaPath) }));
    if (known.some((k) => !k.v)) return settle ? " (could not settle: a render failed for " + known.filter((k) => !k.v).map((k) => "\"" + k.l.name + "\"").join(", ") + ")" : " (alpha layers not settled yet: call with settle: true)";
    const hides = known.filter((k) => k.v.verdict === "hides"), partial = known.filter((k) => k.v.verdict === "partial");
    if (hides.length) return " -> NOT SEEN: " + hides.map((k) => "\"" + k.l.name + "\" hides it (" + Math.round(k.v.baseVisible * 100) + "% of " + base + " shows through, rendered)").join(", ");
    if (partial.length) return " -> PARTLY SEEN: " + partial.map((k) => "\"" + k.l.name + "\" leaves " + Math.round(k.v.baseVisible * 100) + "% of " + base + " showing (rendered)").join(", ");
    return " -> SEAM SEEN: " + known.map((k) => "\"" + k.l.name + "\" is an overlay (" + Math.round(k.v.baseVisible * 100) + "% of " + base + " shows through, rendered)").join(", ");
  };
  let text;
  if (Number.isFinite(Number(at_seconds))) {
    const v = visibleAt({ ...L, base }, Number(at_seconds));
    text = base + " at " + Number(at_seconds).toFixed(2) + "s: hidden for certain " + Math.round(v.hidden * 100) + "% (footage over it); possibly up to " + Math.round(v.maybe * 100) + "% counting alpha layers" + (v.over.length ? "; over it: " + v.over.join(", ") : "") + "." + settledText(Number(at_seconds)) + (settle ? "" : " Alpha layers (AE comps, MOGRTs, alpha stills) may be full-frame or a lower third: geometry cannot tell; call again with settle: true to have Premiere's renderer decide. Masked = a mask on that clip, real cover unknown.");
  } else {
    const lines = L.cuts.map((c) => {
      const open = (c.maybeBefore || 0) > c.hiddenBefore + 0.01 || (c.maybeAfter || 0) > c.hiddenAfter + 0.01;
      const verdict = cutVerdict(c);
      return c.t.toFixed(2) + "s  " + c.edges.join(" | ") + "  hidden for certain: before " + Math.round(c.hiddenBefore * 100) + "% after " + Math.round(c.hiddenAfter * 100) + "%" + (open ? "; possibly up to " + Math.round(Math.max(c.maybeBefore || 0, c.maybeAfter || 0) * 100) + "% with alpha layers" : "") + (c.by.length ? "  over it: " + c.by.join(", ") : "") + verdict;
    });
    text = L.sequence + " " + L.frame.join("x") + ", " + L.cuts.length + " footage edge(s), cover of " + L.base + " at each (ledger built " + L.builtAt.slice(11, 19) + (settle ? ", alpha layers settled by Premiere's renderer" : "") + "):\n" + lines.join("\n") + "\n'Hidden for certain' counts footage over the track. Alpha layers (AE comps, MOGRTs, alpha stills) may be full-frame or a lower third: geometry cannot tell, so they are named and counted in 'possibly'" + (settle ? "; the renderer's verdict per layer is cached in alpha-cover.json next to the project and reused." : "; call again with settle: true to have Premiere's renderer decide each layer once (composite vs " + L.base + " alone, cached per file).") + " A cut hidden over 65% for certain on either side is not a seam the viewer sees.";
  }
  card.done(text, true);
  return { text };
}

// Sound events on the timeline (laughter, applause, reactions, music) from Apple's classifier over the rendered mix.
async function soundEvents({ start_seconds = 0, end_seconds, min_confidence } = {}) {
  const card = addTool("sound_events", "");
  if (!fs.existsSync(OCR_BIN)) return err(card, "sound helper missing (bin/ocr)");
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const { parseWindows, segments, report, MIN_CONF } = require(path.join(extensionRoot, "src", "sounds.cjs"));
  const wav = seqFile(".mix.wav");
  fs.mkdirSync(analysisDir(), { recursive: true });
  const fp = timelineFingerprint(snap);
  const cached = seqFile(".sounds.json");
  let windows = null;
  try { const j = JSON.parse(fs.readFileSync(cached, "utf8")); if (j.timeline === fp) windows = j.windows; } catch (_) {}
  if (!windows) {
    let fresh = false; try { fresh = fs.existsSync(wav) && JSON.parse(fs.readFileSync(seqFile(".mix.json"), "utf8")).timeline === fp; } catch (_) {}
    if (!fresh) {
      try { fs.unlinkSync(wav); } catch (_) {}
      card.progress(0, 2, "rendering timeline audio ");
      const preset = wavPreset();
      if (!preset) return err(card, "could not find Premiere's WAV export preset (WAV_Mono_16bit_16kHz.epr) under /Applications");
      const out = await host("exportSequenceAudio", wav, preset);
      if (out.indexOf("ERR:") === 0 || !fs.existsSync(wav)) return err(card, "audio render failed: " + out.replace(/^ERR:/, ""));
      try { fs.writeFileSync(seqFile(".mix.json"), JSON.stringify({ timeline: fp })); } catch (_) {}
    }
    card.progress(1, 2, "listening ");
    let out = "";
    try { out = require("node:child_process").execFileSync(OCR_BIN, ["--sounds", wav], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch (error) { return err(card, "sound classification failed: " + error.message); }
    windows = parseWindows(out);
    try { fs.writeFileSync(cached, JSON.stringify({ timeline: fp, windows })); } catch (_) {}
  }
  const a = Math.max(0, Number(start_seconds) || 0), b = Number(end_seconds) > 0 ? Number(end_seconds) : snap.duration;
  const segs = segments(windows, { minConf: Number(min_confidence) || MIN_CONF }).filter((s) => s.end > a && s.start < b);
  const text = "Sound events " + a.toFixed(2) + "-" + b.toFixed(2) + "s (Apple sound classifier, timeline seconds, peak confidence; cached for this cut):\n" + report(segs) + "\nRule: never cut a pause that touches a laughter or applause segment; a reaction here is a candidate cut point on the other camera.";
  card.done(text, true);
  return { text };
}

// What macOS can see of the speaker across a span: face geometry and capture quality per frame, with the other
// video tracks hidden so b-roll cannot cover the face being judged. Read-only; frames are deleted after reading.
const FACE_MAX_FRAMES = 24;
async function speakerCheck({ start_seconds, end_seconds, step_seconds = 0.5, track = 1 } = {}) {
  const card = addTool("speaker_check " + Number(start_seconds).toFixed(2) + "-" + Number(end_seconds).toFixed(2) + "s V" + track, "");
  if (!fs.existsSync(OCR_BIN)) return err(card, "vision helper missing (bin/ocr)");
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const a = Math.max(0, Number(start_seconds) || 0), b = Math.min(snap.duration, Number(end_seconds));
  if (!(b > a)) return err(card, "end_seconds must be greater than start_seconds");
  let step = Math.max(0.1, Number(step_seconds) || 0.5);
  if ((b - a) / step > FACE_MAX_FRAMES) step = Number(((b - a) / FACE_MAX_FRAMES).toFixed(2));
  const times = []; for (let t = a; t < b && times.length < FACE_MAX_FRAMES; t += step) times.push(Number(t.toFixed(3)));
  if (!times.length) return err(card, "empty range");
  card.open();
  const { readFrame, summarise } = require(path.join(extensionRoot, "src", "face.cjs"));
  const rows = [];
  for (let i = 0; i < times.length; i += 6) {
    const batch = times.slice(i, i + 6);
    card.progress(i, times.length, "reading the speaker ");
    const base = path.join(os.tmpdir(), "claude-for-adobe-face-" + Date.now().toString(36));
    const raw = await host("frames", JSON.stringify(batch), base, String(Math.max(0, Number(track) - 1)));
    if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
    const files = raw.split(ROW).filter((row) => row.indexOf("SOLO" + COL) !== 0).map((row) => { const [f] = row.split(COL); return [f + ".png", f].find((p) => fs.existsSync(p)) || null; });
    let out = "";
    try { out = require("node:child_process").execFileSync(OCR_BIN, ["--faces", ...files.filter(Boolean)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch (error) { return err(card, "face reading failed: " + error.message); }
    const byFile = new Map(out.split("\n").filter(Boolean).map((l) => { try { const j = JSON.parse(l); return [j.file, j]; } catch (_) { return [null, null]; } }));
    files.forEach((f, j) => { rows.push(readFrame(f ? byFile.get(f) : null, batch[j])); try { if (f) fs.unlinkSync(f); } catch (_) {} });
  }
  const sum = summarise(rows);
  const perFrame = rows.map((r) => r.face
    ? r.t.toFixed(2) + "s  facing " + (r.facing === null ? "?" : r.facing.toFixed(3)) + "  eyes " + r.eyes.toFixed(2) + "  mouth " + r.mouth.toFixed(2) + "  quality " + (r.quality === null ? "?" : r.quality.toFixed(2)) + "  face width " + r.width.toFixed(2) + "  " + r.notes.join(", ")
    : r.t.toFixed(2) + "s  no face").join("\n");
  const text = "V" + track + " alone, " + a.toFixed(2) + "-" + b.toFixed(2) + "s every " + step + "s (facing: 0 is square to the lens, over 0.11 is turned away)\n" + perFrame + "\n\n" + sum.text;
  card.done(text, true);
  return { text };
}

// A named transition (default Morph Cut) on cuts of one track, on the working copy, with a transition-count CHECK.
async function morphCut({ seams, all_seams = false, track = 1, transition = "Morph Cut", frames = 12 } = {}) {
  const card = addTool("morph_cut " + transition + " V" + track + (all_seams ? " all seams" : " @" + (seams || []).map((x) => Number(x).toFixed(2)).join(", ")), "");
  let list = Array.isArray(seams) ? seams.map(Number).filter(Number.isFinite) : [];
  if (all_seams) {
    const snap = await readSnapshot().catch(() => null);
    const clips = snap ? snap.clips.filter((c) => c.track === "V" + track).sort((a, b) => a.start - b.start) : [];
    for (let i = 1; i < clips.length; i++) if (Math.abs(clips[i].start - clips[i - 1].end) < 0.02) list.push(clips[i].start);
  }
  list = [...new Set(list.map((x) => Number(x.toFixed(3))))];
  if (!list.length) return err(card, all_seams ? "No cuts where two clips touch on V" + track : "seams is required (or all_seams)");
  // Only seams the viewer sees. Cover is a fraction from Premiere's own data for every clip above the track:
  // Motion position and scale, Opacity, source size, and the Alpha flag of stills. A side-by-side covers half,
  // a picture-in-picture a corner, a full-frame still with no alpha all of it; titles, MOGRTs and AE comps none.
  const { coverAt } = require(path.join(extensionRoot, "src", "cover.cjs"));
  let tf = null; try { tf = (await getLedger()).transforms; } catch (_) {}
  const hasAlpha = (p) => !!(tf && tf.rows.find((c) => c.mediaPath === p && c.alpha));
  const half = Math.max(0.1, Number(frames) / 25 / 2); // half the transition in seconds; 25 fps is close enough at any common rate for a visibility window
  const MAX_COVER = 0.65; // more than this hidden on either side of the cut and nobody sees the seam
  const skipped = [], visible = [];
  for (const t of list) {
    if (!tf) { visible.push({ t, note: "" }); continue; }
    const before = coverAt(tf.rows, tf.w, tf.h, "V" + track, t - half, hasAlpha), after = coverAt(tf.rows, tf.w, tf.h, "V" + track, t + half, hasAlpha);
    const worst = before.covered > after.covered ? before : after;
    const who = [...new Set(worst.by.map((b) => b.track + " \"" + b.name + "\" " + Math.round(b.share * 100) + "%" + (b.masked ? " (masked: real cover unknown)" : "")))].join(", ");
    if (worst.covered > MAX_COVER && worst.by.some((b) => b.masked)) visible.push({ t, note: "would be " + Math.round(worst.covered * 100) + "% hidden by " + who + " but a mask makes the real cover unknown; applied, confirm with seam_frames" });
    else if (worst.covered > MAX_COVER) skipped.push({ t, why: Math.round(worst.covered * 100) + "% hidden by " + who });
    else visible.push({ t, note: worst.covered > 0.02 ? Math.round(worst.covered * 100) + "% hidden by " + who : "" });
  }
  if (!visible.length) { const text = "No visible seam on V" + track + ": " + skipped.map((k) => k.t.toFixed(2) + "s " + k.why).join("; ") + ". Nothing applied; a transition the viewer cannot see is wasted analysis."; card.done(text, true); return { text }; }
  list = visible.map((v) => v.t);
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const raw = await host("addTransitions", JSON.stringify({ track: Number(track), seams: list, name: transition, frames: Number(frames) }));
  if (raw.indexOf("ERR:") === 0 || raw === "EvalScript error." || !raw) return err(card, copyNote + (raw.replace(/^ERR:/, "") || "no result"));
  const rows = raw.split(ROW).map((r) => r.split(COL));
  const [, name, before, after, dur] = rows[0];
  const results = rows.slice(1).map(([sec, clip, ok, e]) => Number(sec).toFixed(2) + "s " + (ok === "1" ? "applied after \"" + clip + "\"" : "FAILED" + (clip ? " on \"" + clip + "\"" : "") + (e ? ": " + e : "")));
  const applied = rows.slice(1).filter((r) => r[2] === "1").length;
  const delta = Number(after) - Number(before);
  const ok = applied > 0 && delta >= applied;
  timeline = await readSnapshot().catch(() => timeline);
  const under = visible.filter((v) => v.note).map((v) => v.t.toFixed(2) + "s " + v.note);
  const text = copyNote + name + " (" + dur + ") on V" + track + ": " + applied + " of " + list.length + " visible seam(s) applied" + (skipped.length ? ", " + skipped.length + " skipped as not visible" : "") + "\n" + results.join("\n") + (skipped.length ? "\nSkipped as not visible: " + skipped.map((k) => k.t.toFixed(2) + "s " + k.why).join("; ") : "") + (under.length ? "\nPartly covered but applied: " + under.join("; ") : "") + "\nTransitions on the track: " + before + " before, " + after + " after | CHECK " + (ok ? "PASS" : "FAIL: the track's transition count rose by " + delta + " for " + applied + " applied; read the frames at a seam") + (name === "Morph Cut" && ok ? ". Morph Cut analyses in the background; frames at a seam show a red bar until it is done." : "");
  card.done(text, ok);
  return { text, isError: !ok };
}

// Auto Reframe's subject path (and any other keyframes) on one track. Read-only.
async function subjectPath({ track = 1, max_keys = 40 } = {}) {
  const card = addTool("subject_path V" + track, "");
  const raw = await host("subjectPath", String(track), String(max_keys));
  if (raw.indexOf("ERR:") === 0 || raw === "EvalScript error." || !raw) return err(card, raw.replace(/^ERR:/, "") || "no result");
  const rows = raw.split(ROW).map((r) => r.split(COL));
  const [, name, w, h] = rows[0];
  if (rows[1] && rows[1][0] === "NONE") { const text = "No keyframes on any of the " + rows[1][1] + " clip(s) of V" + track + " in \"" + name + "\"" + (Number(rows[1][2]) ? " (" + rows[1][2] + " parameter(s) could not be read)" : "") + ". Auto Reframe has not run here, or its analysis is still going (reframe reports when it is done)."; card.done(text, true); return { text }; }
  // Verified 2026-09-05 on 26.3.2: Auto Reframe keys are on the "Auto Reframe" component (Position and Generated
  // Keyframes, identical), values are frame fractions, key times are SOURCE time (first key = in point + 5 frames).
  // Convert to timeline time so the agent never has to: seq = clipStart + (key - clipIn).
  let source = 0, sequence = 0;
  const lines = rows.slice(1).filter((r) => !/Generated Keyframes/.test(r[4])).map(([tr, idx, clip, comp, param, n, start, inPt, samples]) => {
    const st = Number(start), ip = Number(inPt);
    const pts = samples.split(" ").map((x) => { const [t, v] = x.split("="); return [Number(t), v]; }).filter((x) => Number.isFinite(x[0]));
    const first = pts.length ? pts[0][0] : NaN;
    const isSource = Number.isFinite(first) && Math.abs(first - ip) < 1 && !(Math.abs(first - st) < Math.abs(first - ip));
    if (isSource) source++; else sequence++;
    const out = pts.map(([t, v]) => (isSource ? st + (t - ip) : t).toFixed(2) + "s=" + v).join(" ");
    return tr + " clip " + idx + " \"" + clip + "\" (" + st.toFixed(2) + "s to timeline): " + comp + " > " + param + ", " + n + " keys, timeline time = x,y (frame fractions; 0.5,0.5 = centre)\n    " + out;
  });
  const text = name + " " + w + "x" + h + ", V" + track + ": " + lines.length + " keyframed parameter(s)\n" + lines.join("\n") + "\nCHECK key times: " + (source && !sequence ? "source time from Premiere, converted to timeline time above (PASS)" : !source && sequence ? "already timeline time (unexpected on this build; not converted)" : "mixed; converted only the source-time ones") + ". Where x stays 0.500 Auto Reframe moved the shot vertically only.";
  card.done(text, true);
  return { text };
}

// Premiere's Scene Edit Detection on one clip, on the working copy, with a clip-count CHECK.
async function sceneCuts({ at_seconds, track = 1, sensitivity = "medium" } = {}) {
  const card = addTool("scene_cuts V" + track + " @" + Number(at_seconds).toFixed(2) + "s " + sensitivity, "");
  if (!Number.isFinite(Number(at_seconds))) return err(card, "at_seconds is required");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const raw = await host("sceneCuts", String(track), String(at_seconds), String(sensitivity));
  if (raw.indexOf("ERR:") === 0 || raw === "EvalScript error." || !raw) return err(card, copyNote + (raw.replace(/^ERR:/, "") || "no result"));
  const [, name, before, afterNow, result, sens] = raw.split(COL);
  // The analysis can finish after the call returns: re-count for up to 90 s.
  let after = Number(afterNow); const t0 = Date.now();
  while (after <= Number(before) && Date.now() - t0 < 90000) { await new Promise((r) => setTimeout(r, 1500)); const snap = await readSnapshot().catch(() => null); if (!snap) continue; after = snap.clips.filter((c) => c.track === "V" + track).length; card.progress(Math.min(89, Math.round((Date.now() - t0) / 1000)), 90, "waiting for Premiere's analysis "); }
  timeline = await readSnapshot().catch(() => timeline);
  const ok = after > Number(before);
  const text = copyNote + "Scene Edit Detection (" + sens + ") on \"" + name + "\": V" + track + " had " + before + " clip(s), now " + after + (result && result !== "undefined" ? " (result " + result + ")" : "") + (ok ? " | CHECK PASS: " + (after - before) + " cut(s) added; run seam_frames to see them." : " | CHECK FAIL: no new clips after 90 s. Either no scene change was found at this sensitivity (try high), or the call did not run; the editor's route is right-click the clip > Scene Edit Detection.");
  card.done(text, ok);
  return { text, isError: !ok };
}

// Which key the editor has for a Premiere command, from their own shortcut sets (read-only).
async function premiereShortcut({ query = "" } = {}) {
  const card = addTool("premiere_shortcut " + query, "");
  if (!query.trim()) return err(card, "query is required");
  const { userKysFiles, findShortcuts } = require(path.join(extensionRoot, "src", "kys.cjs"));
  const major = (await evalScript("app.version").catch(() => "")).split(".")[0] || "26";
  const files = userKysFiles(major);
  const hits = findShortcuts(query, files).slice(0, 40);
  const text = !files.length ? "No shortcut sets found for Premiere " + major + " under Documents/Adobe/Premiere Pro."
    : !hits.length ? "No command id contains all of: " + query + ". Try fewer words; the full list is premiere-scripting/commands-26.md."
    : hits.map((h) => h.command + (Object.keys(h.keys).length ? "  " + Object.entries(h.keys).map(([set, k]) => set + ": " + k.join(", ")).join(" | ") : "  (unbound in every set)")).join("\n") + "\nSets: " + files.map((f) => path.basename(f, ".kys")).join(", ") + ". The active set is whichever the editor chose in Keyboard Shortcuts; [Custom] when they changed anything. Unbound means the editor must use the menu.";
  card.done(text, true);
  return { text };
}

// What analysis already exists for this project, from this panel or from anything else that wrote there.
async function listAnalysis({ all = false } = {}) {
  const card = addTool("list_analysis", ""), dir = analysisDir();
  const stems = new Set(), media = new Set();
  const safe = name => String(name || "").replace(/[\/\\:]/g, "_");
  const addMedia = (name, file) => {
    if (!file) return;
    media.add(file);
    for (const n of [name, path.basename(file)]) if (n) { stems.add(safe(n)); stems.add(safe(n.replace(/\.[^.]+$/, ""))); }
  };
  let scope = "no selected footage or active timeline", snap = null;
  if (all !== true) {
    try {
      const raw = await host("binMedia", "", "false", "true");
      if (raw.indexOf("ERR:") === 0 || raw === "EvalScript error.") throw new Error(raw);
      const bins = raw ? [] : await selectedBins();
      const sources = raw ? [raw] : [];
      for (const bin of bins) {
        const rows = await host("binMedia", bin, "false");
        if (rows.indexOf("ERR:") === 0 || rows === "EvalScript error.") throw new Error(rows);
        stems.add(safe(bin)); sources.push(rows);
      }
      for (const rows of sources) for (const row of rows.split("\u0003").filter(Boolean)) {
        const [name, file] = row.split("\u0002"); addMedia(name, file);
      }
      if (raw || bins.length) scope = media.size + " selected source clip(s)" + (bins.length ? " in " + bins.length + " bin(s)" : "");
      else {
        snap = await readSnapshot();
        if (snap && !snap.error && snap.name) {
          scope = "active timeline: " + snap.name; stems.add(safe(snap.name));
          for (const c of snap.clips || []) addMedia(c.name, c.mediaPath);
        }
      }
    } catch (error) { return err(card, "Cannot scope analysis: " + error.message); }
  } else scope = "whole project (explicit request)";
  const suffixes = [".transcript.md", ".timeline.transcript.md", ".classification.md", ".timeline.json", ".transcript.json", ".diarization.json", ".delivery.json", ".sounds.json", ".notes.md", ".selects.md"];
  const matches = f => [...stems].some(stem => suffixes.some(suffix => f === stem + suffix));
  const rows = [], guidance = [];
  try {
    for (const f of fs.readdirSync(dir).filter(f => !f.startsWith(".")).sort()) {
      const st = fs.statSync(path.join(dir, f)); if (!st.isFile()) continue;
      // ponytail: legacy files have no scope manifest; exact names are candidates, never proof of cache validity.
      const rule = /safe-zone|procedure|(?:^|[-_ ])rules?(?:[-_. ]|$)/i.test(f) && f.endsWith(".md");
      if (rule) {
        const title = fs.readFileSync(path.join(dir, f), "utf8").split("\n").find(l => l.trim()) || "";
        guidance.push(f + " — " + title.replace(/^#+\s*/, "").slice(0, 140));
      }
      if (all !== true && (!matches(f) || rule)) continue;
      let stale = "";
      if (snap && !snap.error && f.endsWith(".transcript.md")) {
        const m = /<!-- timeline ([^>]*) -->/.exec(fs.readFileSync(path.join(dir, f), "utf8").slice(0, 400));
        if (m && m[1] !== timelineFingerprint(snap)) stale = "  STALE for active timeline";
      }
      rows.push(f + "  " + Math.round(st.size / 1024) + " KB" + stale);
    }
  } catch (error) { if (error.code !== "ENOENT") return err(card, "Cannot list analysis: " + error.message); }
  const limit = all === true ? rows.length : 30;
  let text = "Analysis scope: " + scope + "\n" + dir + "\n" + (rows.length ? rows.slice(0, limit).join("\n") : "No matching analysis files. This does not mean the source clips have no cached transcripts.");
  if (rows.length > limit) text += "\n" + (rows.length - limit) + " more matches; use all:true only if the full listing is needed.";
  if (guidance.length) text += "\n\nProject guidance candidates (read only those applicable to this task; titles do not establish approval):\n" + guidance.slice(0, all === true ? guidance.length : 12).join("\n") + (all !== true && guidance.length > 12 ? "\nMore guidance files exist; request all:true to list them." : "");
  text += "\nReuse only analysis whose source/timeline identity matches. Other edits, chats, renders and debug files are omitted by default; do not expand to the whole project just because there are no matches.";
  card.done(text, true);
  return { text };
}

// Claude's own notes (shot descriptions, decisions) saved next to the project so later turns and sessions reuse them.
async function saveNotes({ name = "notes.md", text = "" } = {}) {
  const card = addTool("save_notes " + name, "");
  if (!text.trim()) return err(card, "text is required");
  const safe = String(name).replace(/[^\w.\- ]/g, "_").replace(/\.md$/i, "") + ".md";
  const f = writeAnalysis(safe, text.endsWith("\n") ? text : text + "\n");
  card.done("saved " + f, true);
  return { text: "saved " + f };
}

// Frame size change with automatic reframe. Not undoable, so the project is saved and checkpointed first, no question asked.
async function setSequenceSize({ preset, aspect, width, height, fps, reframe = "fill" } = {}) {
  if (preset && SEQUENCE_PRESETS[preset]) ({ width = width, height = height } = SEQUENCE_PRESETS[preset]);
  if (!(width && height) && aspect) { const sz = sizeFromAspect(aspect); if (sz) ({ width, height } = sz); }
  const card = addTool("set_sequence_size " + (width && height ? width + "x" + height : "") + (fps ? " @" + fps : "") + " (" + reframe + ")", "");
  if (!(width && height) && !fps) return err(card, "give preset (vertical/hd/uhd) or width+height, or fps");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  let cp = "";
  try { await saveProject(); const entry = createCheckpoint(project.path, "before sequence resize"); renderCheckpoints(); cp = " File checkpoint " + entry.id + " saved first (this is not undoable with Cmd+Z)."; }
  catch (error) { return err(card, "Resize blocked: it cannot be undone and a checkpoint was not possible: " + error.message); }
  const before = await readTransforms().catch(() => null);
  const raw = await host("resizeSequence", String(width || ""), String(height || ""), String(fps || ""), reframe);
  let ok = raw.indexOf("ERR:") !== 0 && raw !== "EvalScript error." && raw !== "";
  // Post-condition, computed, not believed: frame size as asked; every graphic's position fraction kept and its
  // scale followed the width; footage centred. The model reports what this says, not what it expects.
  let check = "";
  if (ok && before) {
    const after = await readTransforms().catch(() => null);
    if (after) {
      const fails = [];
      if (width && height && (after.w !== Number(width) || after.h !== Number(height))) fails.push("frame is " + after.w + "x" + after.h + ", asked " + width + "x" + height);
      const ratio = after.w / before.w;
      after.rows.forEach((r) => {
        const b = before.rows.find((x) => x.key === r.key); if (!b || !r.x) return;
        if (r.graphic) {
          if (Math.abs(r.x - b.x) > 0.002 || Math.abs(r.y - b.y) > 0.002) fails.push(r.track + " \"" + r.name + "\" moved " + b.x.toFixed(3) + "," + b.y.toFixed(3) + " -> " + r.x.toFixed(3) + "," + r.y.toFixed(3));
          if (reframe !== "none" && Math.abs(r.scale - b.scale * ratio) > Math.max(0.5, b.scale * 0.01)) fails.push(r.track + " \"" + r.name + "\" scale " + b.scale.toFixed(1) + " -> " + r.scale.toFixed(1) + ", expected " + (b.scale * ratio).toFixed(1));
        } else if (reframe !== "none" && (Math.abs(r.x - 0.5) > 0.002 || Math.abs(r.y - 0.5) > 0.002)) fails.push(r.track + " \"" + r.name + "\" not centred (" + r.x.toFixed(3) + "," + r.y.toFixed(3) + ")");
      });
      const graphics = after.rows.filter((r) => r.graphic).length;
      check = "\nCHECK " + (fails.length ? "FAIL: " + fails.join("; ") : "PASS: frame " + after.w + "x" + after.h + ", " + graphics + " graphic(s) kept in place, footage centred (read back from Premiere)");
      if (fails.length) ok = false;
    }
  }
  card.done(raw + check + cp, ok);
  timeline = await readSnapshot().catch(() => timeline);
  return { text: copyNote + raw + check + cp, isError: !ok };
}
// The one call for any shape request: "make it 9:16", "4:5 from this bin", "16:9 version". Creates the sequence
// from the bin (raw footage) or resizes the open one; footage fills, graphics stay; then the visible moments and
// the seams come back as frames with a checklist. The model's only work afterwards is judging and nudging.
async function reframeTool({ aspect, preset, width, height, fps, bin, reframe = "fill", motion, max = 8, max_px = 512 } = {}) {
  const parts = [], content = [];
  let step;
  // A bin here used to build a second sequence from raw footage; since rough_cut exists that is drift, so it is refused.
  if (bin) return { text: "CLAUDE_FOR_ADOBE_ERROR:reframe takes no bin. Raw footage in a bin is rough_cut's job (sequence at the shape, transcript, thoughts, audio_cut); run reframe without a bin on the cut it made for the tracking pass. Nothing was changed.", isError: true };
  if (motion === undefined) motion = "track";
  const target = targetSize({ aspect, preset, width, height });
  if (!target && !fps) return { text: "CLAUDE_FOR_ADOBE_ERROR:reframe needs the shape: aspect (9:16, 4:5, 1:1, 16:9), a preset (vertical, four_five, square, hd) or width+height. Nothing was changed.", isError: true };
  step = await setSequenceSize({ preset, aspect, width, height, fps, reframe });
  // A CHECK FAIL on the resize is reported, not fatal: the tracking and the frames below still run.
  if (step.isError && !/CHECK FAIL/.test(step.text || "")) return step;
  parts.push(step.text.replace(/^CLAUDE_FOR_ADOBE_ERROR:/, ""));
  if (motion === "track") {
    // Premiere's Auto Reframe as an effect on every footage clip: Premiere analyses each clip's SOURCE and pans
    // it inside the frame it is in. Fill first so the frame is covered; the effect follows the subject.
    const raw = await host("autoReframeClips");
    log("auto reframe effect: " + raw.slice(0, 200));
    if (raw.indexOf("ERR:") === 0 || raw === "EvalScript error." || !raw) parts.push("Auto Reframe effect not applied (" + raw.replace(/^ERR:/, "") + "); the footage is filled and centred (static).");
    else {
      const m = /footage=(\d+) verified=(\d+)/.exec(raw);
      const missing = m ? Number(m[1]) - Number(m[2]) : 0;
      parts.push("Premiere Auto Reframe on the footage (" + raw.replace(/ ERRORS:.*/, "") + ")\nCHECK " + (missing ? "FAIL: " + missing + " footage clip(s) without the effect" + (/ERRORS:/.test(raw) ? "; " + raw.replace(/[\s\S]*ERRORS: /, "") : "") : "PASS: every footage clip carries Auto Reframe (read back); graphics untouched"));
      let waited = 0, done = await host("analysisDone");
      while (done === "0" && waited < 120) { setStatus("Premiere is analysing the footage for Auto Reframe… " + waited + "s"); await new Promise((r) => setTimeout(r, 3000)); waited += 3; done = await host("analysisDone"); }
      if (done === "0") parts.push("Premiere was still analysing after 2 minutes; the frames below may not show the final tracking yet.");
    }
  }
  const snap = await snapshotMoments({ max, max_px });
  if (snap.isError) return snap;
  if (snap.content) content.push(...snap.content);
  const seam = await seamFrames({ max_px });
  if (seam.content) content.push(...seam.content); else if (seam.text) content.push({ type: "text", text: seam.text });
  content.unshift({ type: "text", text: parts.join("\n") + "\n\nReframe done and checked. Now judge the PICTURE in each moment for the shot alone (placed? head room? cropped?) and fix only those with nudge_clip and its track; then the seams. Captions and graphics were not touched: say in one line if a caption or title sits badly, do not move the subject for them. Finish with snapshot_moments once more." });
  return { content };
}
// Caption band position and size through the SAVED PROJECT FILE, the third way into Premiere: no panel API
// reaches caption style, but every caption keeps it in a block of the .prproj (fields located by A/B diffs).
// Save, checkpoint, rewrite in place, reopen the project, read the file back.
async function captionStyleTool({ y, size } = {}) {
  const wantY = y !== undefined && y !== null, wantSize = size !== undefined && size !== null;
  const card = addTool("caption_style" + (wantY ? " y " + y : "") + (wantSize ? " size " + size : ""), "");
  if (!project.path) return err(card, "no project file yet (save the project once)");
  const report = (xml) => { const blocks = captionBlocks(xml); if (!blocks.length) throw new Error("no captions in the saved project file (create_captions first, and the project must be saved)"); const s = captionStyle(blocks[0].b64); return { blocks, s, line: blocks.length + " caption(s); zone " + s.zone + ", y offset " + (s.y === null ? "?" : s.y.toFixed(3)) + " (fraction of frame height from the zone's line, negative = up; default -0.053), size " + (s.size === null ? "?" : s.size) }; };
  if (!wantY && !wantSize) {
    try { await saveProject(); const { line } = report(readProjectXml(project.path)); const text = line + ". Read from the saved file."; card.done(text, true); return { text }; } catch (error) { return err(card, error.message); }
  }
  if (session && session.busy && buttonJob) return err(card, "a button job is running");
  let cp = "", entry = null;
  try { await saveProject(); entry = createCheckpoint(project.path, "before caption style"); renderCheckpoints(); cp = " File checkpoint " + entry.id + " saved first (this is a file rewrite, not undoable with Cmd+Z)."; }
  catch (error) { return err(card, "Caption style blocked: a checkpoint was not possible: " + error.message); }
  let changed = 0;
  try {
    const xml = readProjectXml(project.path);
    report(xml);
    const r = updateCaptionStyles(xml, { y: wantY ? Number(y) : undefined, size: wantSize ? Number(size) : undefined });
    if (!r.changed) throw new Error("caption blocks found but none had the expected fields (a newer Premiere layout?)");
    changed = r.changed;
    writeProjectXml(project.path, r.xml);
  } catch (error) { return err(card, "could not rewrite the project file: " + error.message); }
  setStatus("Reopening the project…");
  const out = await host("reloadProject", project.sequenceId || "");
  if (out.indexOf("ERR:") === 0 || out === "EvalScript error.") return err(card, "file rewritten but the project did not reopen (" + out.replace(/^ERR:/, "") + "). Open it again from File > Open Recent; checkpoint " + (entry ? entry.id : "?") + " holds the previous version.");
  await refreshProject();
  timeline = await readSnapshot().catch(() => timeline);
  let back = null; try { back = report(readProjectXml(project.path)).s; } catch (_) {}
  const okY = !wantY || (back && back.y !== null && Math.abs(back.y - Number(y)) < 1e-4), okS = !wantSize || (back && back.size !== null && Math.abs(back.size - Number(size)) < 1e-3);
  const ok = okY && okS;
  const text = changed + " caption(s) restyled" + (wantY ? ", y offset " + Number(y).toFixed(3) : "") + (wantSize ? ", size " + size : "") + "; project reloaded from disk." + cp
    + "\nCHECK " + (ok ? "PASS: values read back from the file" : "FAIL: file reads " + JSON.stringify(back))
    + "\nMeasure where the band sits now: find_on_screen with a word from a caption (its box y is the band), or preview_frames at a caption time. Adjust once if needed.";
  card.done(text, ok);
  setStatus("Thinking…");
  return { text: ok ? text : "CLAUDE_FOR_ADOBE_ERROR:" + text, isError: !ok };
}

// Target aspect as a reduced ratio plus a label, from aspect / preset / width+height.
function targetSize({ aspect, preset, width, height }) {
  let w = width, h = height;
  if (preset && SEQUENCE_PRESETS[preset]) ({ width: w, height: h } = SEQUENCE_PRESETS[preset]);
  if (!(w && h) && aspect) { const sz = sizeFromAspect(aspect); if (sz) ({ width: w, height: h } = sz); }
  if (!(w && h)) return null;
  const g = (a, b) => (b ? g(b, a % b) : a), d = g(Number(w), Number(h));
  return { num: Number(w) / d, den: Number(h) / d, w: Number(w), h: Number(h), label: aspect || (Number(w) / d) + "x" + (Number(h) / d) };
}
// Motion Position/Scale of every video clip as numbers, keyed by track and index (see clipTransforms).
async function readTransforms(sequence = "") {
  const raw = await host("clipTransforms", sequence);
  if (raw.indexOf("ERR:") === 0 || raw === "EvalScript error.") throw new Error(raw);
  const rows = raw.split(ROW);
  const [, , w, h] = rows[0].split(COL);
  return { w: Number(w), h: Number(h), rows: rows.slice(1).map((r) => { const [track, idx, name, x, y, scale, graphic, a, b, srcW, srcH, opacity, mediaPath, alpha, crop, masked] = r.split(COL); const cr = crop ? crop.split("/").map(Number) : null; return { key: track + "#" + idx, track, name, x: x === "" ? null : Number(x), y: Number(y), scale: Number(scale), graphic: graphic === "1", start: Number(a), end: Number(b), srcW: Number(srcW) || null, srcH: Number(srcH) || null, opacity: opacity === "" || opacity === undefined ? 100 : Number(opacity), mediaPath: mediaPath || "", alpha: alpha === "1", crop: cr && cr.length === 4 && cr.some((v) => v > 0) ? { left: cr[0], top: cr[1], right: cr[2], bottom: cr[3] } : null, masked: masked === "1" }; }) };
}

// Place a region of a clip's SOURCE (the action: a control, a face, a panel) inside a target rectangle of the
// frame (a safe band) by arithmetic, apply it, and assert from what Premiere stored. No eye-work for placement.
async function fitRegionTool({ at_seconds, track, roi, roi_units = "px", target, max_scale = 100, margin = 0.03 } = {}) {
  const card = addTool("fit_region @" + Number(at_seconds).toFixed(2) + "s V" + track, JSON.stringify({ roi, target }));
  if (!Number.isFinite(Number(at_seconds)) || !track) return err(card, "at_seconds and track are required");
  if (!roi || [roi.x0, roi.y0, roi.x1, roi.y1].some((v) => !Number.isFinite(Number(v)))) return err(card, "roi {x0,y0,x1,y1} is required: source pixels, or fractions with roi_units 'fraction'");
  const tgt = target && Number.isFinite(Number(target.x0)) ? { x0: +target.x0, y0: +target.y0, x1: +target.x1, y1: +target.y1 } : { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 };
  let tr; try { tr = await readTransforms(); } catch (error) { return err(card, error.message); }
  const t0 = Number(at_seconds), row = tr.rows.find((r) => r.track === "V" + Number(track) && t0 >= r.start && t0 < r.end);
  if (!row) return err(card, "no clip on V" + track + " at " + t0.toFixed(2) + "s");
  if (!row.srcW || !row.srcH) {
    // Premiere's Video Info column is empty for some media; ask ffprobe instead of sending the model to media_info.
    try {
      const clip = (timeline && timeline.clips || []).find((c) => c.track === "V" + Number(track) && t0 >= c.start && t0 < c.end);
      const m = clip && clip.mediaPath ? /video \S+ (\d+)x(\d+)/.exec(mediaInfo(clip.mediaPath)) : null;
      if (m) { row.srcW = Number(m[1]); row.srcH = Number(m[2]); }
    } catch (_) {}
    if (!row.srcW || !row.srcH) return err(card, "no source size known for \"" + row.name + "\" (not footage, or media offline)");
  }
  const R = roi_units === "fraction" ? { x0: roi.x0 * row.srcW, y0: roi.y0 * row.srcH, x1: roi.x1 * row.srcW, y1: roi.y1 * row.srcH } : { x0: +roi.x0, y0: +roi.y0, x1: +roi.x1, y1: +roi.y1 };
  const fit = fitRegion({ srcW: row.srcW, srcH: row.srcH, frameW: tr.w, frameH: tr.h, roi: R, target: tgt, maxScale: Number(max_scale) || 0, margin: Number(margin) || 0 });
  let copyNote = ""; try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const out = await host("nudgeClip", String(t0), String(Number(track) - 1), "0", "0", "1", String(fit.x), String(fit.y), String(fit.scale));
  if (out.indexOf("ERR:") === 0 || out === "EvalScript error.") return err(card, out.replace(/^ERR:/, ""));
  let after; try { after = await readTransforms(); } catch (error) { return err(card, error.message); }
  const now = after.rows.find((r) => r.key === row.key) || row;
  const placed = roiInFrame({ srcW: row.srcW, srcH: row.srcH, frameW: after.w, frameH: after.h, x: now.x, y: now.y, scale: now.scale }, R);
  const ok = rectInside(placed, tgt, 0.005);
  const f = (r) => r.x0.toFixed(3) + "," + r.y0.toFixed(3) + " to " + r.x1.toFixed(3) + "," + r.y1.toFixed(3);
  const blank = Object.entries(fit.blank).filter(([, v]) => v > 0.005).map(([k, v]) => k + " " + Math.round(v * 100) + "%").join(", ");
  const capped = Number(max_scale) && fit.scale >= Number(max_scale) - 0.01;
  const text = copyNote + "fit_region V" + track + " \"" + row.name + "\": position " + now.x.toFixed(3) + "," + now.y.toFixed(3) + ", scale " + now.scale.toFixed(1) + (capped ? " (capped at " + max_scale + "%)" : "")
    + "\nregion now at frame " + f(placed) + "; target " + f(tgt)
    + "\nCHECK " + (ok ? "PASS: region inside the target (read back from Premiere)" : "FAIL: region outside the target; " + (fit.fits ? "Premiere stored something else" : "it does not fit at scale <= " + max_scale + "%: raise max_scale or tighten the roi"))
    + (blank ? "\nblank canvas: " + blank + " (disclose it to the editor)" : "")
    + "\nUndo: Cmd+Z. Confirm with frames_across at the moment; frames confirm, they do not measure.";
  card.done(text, ok);
  return { text: ok ? text : "CLAUDE_FOR_ADOBE_ERROR:" + text, isError: !ok };
}

// Where text appears on screen, from sampled frames read by macOS's built-in recognizer (bin/ocr). The
// on-screen twin of find_in_transcript: "when does 'Codex' show up" answered by timecodes, not by looking.
const OCR_BIN = path.join(extensionRoot, "bin", "ocr");
const OCR_MAX_FRAMES = 30; // each frame is a Premiere render (seconds at 4K): keep a call under a minute
async function findOnScreen({ text, texts, start_seconds = 0, end_seconds, step_seconds = 1 } = {}) {
  // Several words in one pass: every frame is rendered and read once, whatever the number of words.
  const needles = [].concat(texts || [], text || []).map((t) => String(t).trim()).filter(Boolean);
  const card = addTool("find_on_screen " + needles.map((n) => "\"" + n + "\"").join(", "), "");
  if (!needles.length) return err(card, "text (or texts[]) is required");
  if (!fs.existsSync(OCR_BIN)) return err(card, "text recognition helper missing (bin/ocr)");
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const a = Math.max(0, Number(start_seconds) || 0), b = Math.min(snap.duration, Number(end_seconds) > 0 ? Number(end_seconds) : snap.duration);
  let step = Math.max(0.2, Number(step_seconds) || 1);
  const widened = (b - a) / step > OCR_MAX_FRAMES;
  if (widened) step = Number(((b - a) / OCR_MAX_FRAMES).toFixed(2));
  const times = []; for (let t = a; t < b && times.length <= OCR_MAX_FRAMES; t += step) times.push(Number(t.toFixed(3)));
  if (!times.length) return err(card, "empty range");
  card.open();
  const hits = []; // { needle, t, box, seen }
  for (let i = 0; i < times.length; i += 6) {
    const batch = times.slice(i, i + 6);
    card.progress(i, times.length, "reading frames ");
    setStatus("Reading text on screen " + Math.min(i + 6, times.length) + " / " + times.length + "…");
    const base = path.join(os.tmpdir(), "claude-for-adobe-ocr-" + Date.now().toString(36));
    const raw = await host("frames", JSON.stringify(batch), base, "");
    if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
    const files = raw.split(ROW).map((row) => { const [f] = row.split(COL); return [f + ".png", f].find((p) => fs.existsSync(p)) || null; });
    let out = "";
    try { out = require("node:child_process").execFileSync(OCR_BIN, files.filter(Boolean), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); } catch (error) { return err(card, "text recognition failed: " + error.message); }
    const byFile = new Map(out.split("\n").filter(Boolean).map((l) => { try { const j = JSON.parse(l); return [j.file, j.items || []]; } catch (_) { return [null, []]; } }));
    files.forEach((f, j) => {
      const items = f ? byFile.get(f) || [] : [];
      needles.forEach((needle) => { const m = items.find((it) => String(it.text).toLowerCase().includes(needle.toLowerCase())); if (m) hits.push({ needle, t: batch[j], box: m.box, seen: m.text }); });
      try { if (f) fs.unlinkSync(f); } catch (_) {}
    });
  }
  const blocks = needles.map((needle) => {
    const spans = [];
    hits.filter((h) => h.needle === needle).forEach((h) => { const last = spans[spans.length - 1]; if (last && h.t - last.last <= step * 1.5) { last.last = h.t; last.n++; } else spans.push({ first: h.t, last: h.t, n: 1, box: h.box, seen: h.seen }); });
    return "\"" + needle + "\": " + (spans.length ? "\n" + spans.map((s) => "  " + tc(s.first) + " to " + tc(Math.min(b, s.last + step)) + " (seen \"" + s.seen + "\" at frame x " + s.box[0].toFixed(2) + "-" + s.box[2].toFixed(2) + ", y " + s.box[1].toFixed(2) + "-" + s.box[3].toFixed(2) + ")").join("\n") : "not found");
  });
  const result = "On screen, sampled every " + step + "s from " + tc(a) + " to " + tc(b) + " (" + times.length + " frames" + (widened ? "; step widened to keep it to " + OCR_MAX_FRAMES + " frames, narrow the range for finer steps" : "") + "):\n" + blocks.join("\n")
    + "\nTimes are timeline seconds; boxes are frame fractions, origin top-left. For the exact frame, call again with a small range around a span and a smaller step; put every word you need in texts[] so frames are read once.";
  card.done(result, true);
  setStatus("Thinking…");
  return { text: result };
}

// Basic audio clean-up from the transcript: ums, uhs, stutters, repeated words. Plan, then cut with the range engine.
async function removeFillers({ start_seconds = 0, end_seconds, repeats = true, source = "auto", dry_run = true } = {}) {
  const card = addTool((dry_run ? "plan" : "remove") + "_fillers", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(Math.max(0, Number(start_seconds)), end_seconds ? Number(end_seconds) : Infinity)); } catch (error) { return err(card, error.message); }
  let transcripts = [];
  if (source !== "whisper" && project.path) { try { transcripts = listTranscripts(project.path); } catch (_) {} }
  const found = [], skipped = [];
  const tlw = source === "auto" ? freshTimelineWords(snap) : null;
  const a0 = Math.max(0, Number(start_seconds)), b0 = end_seconds ? Number(end_seconds) : Infinity;
  if (tlw) fillerRanges(tlw.words, { repeats }).filter((r) => r.end > a0 && r.start < b0).forEach((r) => found.push(r));
  else clips.forEach((c) => {
    let words; try { words = wordsForClip(c, source, transcripts).words; } catch (error) { skipped.push(c.name); return; }
    fillerRanges(words, { repeats, offset: c.start - c.inPoint }).filter((r) => r.end > c.s0 && r.start < c.s1).forEach((r) => found.push(r));
  });
  if (!found.length) { card.done("nothing to clean" + (skipped.length ? " (no transcript for " + skipped.join(", ") + ")" : ""), true); return { text: "No fillers or repeats found" + (skipped.length ? "; no transcript for " + skipped.join(", ") + " (transcribe first)" : "") + "." }; }
  const cuts = union(found.map((r) => ({ start: r.start, end: r.end }))).sort((a, b) => b.start - a.start);
  const total = cuts.reduce((n, c) => n + (c.end - c.start), 0);
  const byReason = found.reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m; }, {});
  const summary = found.length + " flub(s) (" + Object.entries(byReason).map(([k, v]) => v + " " + k).join(", ") + "), " + total.toFixed(1) + "s, sequence " + snap.duration.toFixed(1) + "s -> " + (snap.duration - total).toFixed(1) + "s";
  const list = found.slice(0, 30).map((r) => "[" + tc(r.start) + "] " + r.reason + ": " + r.text).join("\n") + (found.length > 30 ? "\n…" : "");
  const res = await applyCuts(card, cuts, dry_run, summary);
  return { ...res, text: res.text + "\n" + list };
}

// Plain native captions from the transcript: cues -> SRT next to the project -> import -> caption track.
// Caption defaults from Settings (persisted). Claude's tool call can override per call.
function captionSettings() {
  return { max_words: Number(ui.capWords.value) || 4, max_lines: Number(ui.capLines.value) || 1, max_seconds: Number(ui.capSeconds.value) || 3 };
}
["capWords", "capLines", "capSeconds"].forEach((k) => { try { const v = localStorage.getItem("captions." + k); if (v) ui[k].value = v; } catch (_) {} ui[k].onchange = () => { try { localStorage.setItem("captions." + k, ui[k].value); } catch (_) {} }; });

async function createCaptions({ max_words, max_chars = 32, max_lines, max_seconds, source = "auto" } = {}) {
  const d = captionSettings(); if (max_words === undefined) max_words = d.max_words; if (max_lines === undefined) max_lines = d.max_lines; if (max_seconds === undefined) max_seconds = d.max_seconds;
  const card = addTool("create_captions", "");
  let snap, clips;
  try { ({ snap, clips } = await audioClipsIn(0, Infinity)); } catch (error) { return err(card, error.message); }
  let words = [];
  const tl = source === "auto" || source === "timeline" ? freshTimelineWords(snap) : null;
  if (tl) words = tl.words;
  else {
    let transcripts = []; if (source !== "whisper" && project.path) { try { transcripts = listTranscripts(project.path); } catch (_) {} }
    const missing = [];
    clips.forEach((c) => { try { const w = wordsForClip(c, source, transcripts).words; const off = c.start - c.inPoint; w.forEach((x) => { const st = x.start + off, en = x.end + off; if (en > c.s0 && st < c.s1) words.push({ text: x.text, start: st, end: en }); }); } catch (_) { missing.push(c.name); } });
    if (missing.length) return err(card, "no transcript for " + missing.join(", ") + ". Run transcribe_timeline for an exact transcript of this cut, then create_captions again.");
  }
  if (!words.length) return err(card, "no words to caption; run transcribe_timeline first");
  const cues = cuesFromWords(words, { maxChars: Number(max_chars), maxLines: Number(max_lines), maxSeconds: Number(max_seconds), maxWords: Number(max_words) });
  const srt = writeAnalysis((project.sequence || "sequence") + ".srt", toSRT(cues));
  // A caption track is not undoable, so like every other edit it lands on the working copy, then a checkpoint.
  let cp = "", copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before adding captions: " + error.message); }
  try { await saveProject(); const entry = createCheckpoint(project.path, "before caption import"); renderCheckpoints(); cp = " Checkpoint " + entry.id + " saved first (import is not undoable)."; }
  catch (error) { return err(card, "Caption import blocked: it cannot be undone and a checkpoint was not possible: " + error.message); }
  const raw = await host("importCaptions", srt);
  const ok = raw.indexOf("ERR:") !== 0 && raw !== "EvalScript error." && raw !== "";
  card.done((ok ? cues.length + " captions, " : "") + raw + cp, ok);
  timeline = await readSnapshot().catch(() => timeline);
  return { text: copyNote + (ok ? cues.length + " captions added as a caption track (from " + (tl ? "the exact timeline transcript" : "per-clip transcripts") + "). SRT: " + srt + "." : "CLAUDE_FOR_ADOBE_ERROR:" + raw) + cp, isError: !ok };
}

// Reframe check-and-fix: move a clip's picture by a fraction of the frame, optionally scale. Verify with preview_frames.
async function nudgeClip({ at_seconds, track, dx = 0, dy = 0, scale = 1, x, y, scale_to, same_source = true } = {}) {
  const abs = [x !== undefined ? "x " + x : "", y !== undefined ? "y " + y : "", scale_to !== undefined ? "scale " + scale_to : ""].filter(Boolean).join(" ");
  const card = addTool("nudge_clip @" + Number(at_seconds).toFixed(2) + "s " + (abs || "dx " + dx + " dy " + dy + (scale !== 1 ? " scale x" + scale : "")), "");
  if (!Number.isFinite(Number(at_seconds))) return err(card, "at_seconds is required");
  let copyNote = "";
  try { copyNote = await ensureWorkingCopy(); } catch (error) { return err(card, "Could not duplicate the sequence before editing: " + error.message); }
  const raw = await host("nudgeClip", String(at_seconds), String(track ? Number(track) - 1 : -1), String(dx), String(dy), String(scale), x === undefined ? "" : String(x), y === undefined ? "" : String(y), scale_to === undefined ? "" : String(scale_to), same_source ? "1" : "0");
  const ok = raw.indexOf("ERR:") !== 0 && raw !== "EvalScript error." && raw !== "";
  card.done(raw, ok);
  return { text: copyNote + raw + (ok ? "\nLook at preview_frames at this time to confirm before moving on." : ""), isError: !ok };
}

// Where every clip sits: Motion Position (frame fractions) and Scale, per video clip, for the active or a named
// sequence. The ground truth for placement; read it instead of estimating from a frame.
async function clipTransforms({ sequence = "" } = {}) {
  const card = addTool("clip_transforms" + (sequence ? " \"" + sequence + "\"" : ""), "");
  const raw = await host("clipTransforms", String(sequence || ""));
  if (raw.indexOf("ERR:") === 0 || raw === "EvalScript error.") return err(card, raw.replace(/^ERR:/, ""));
  const rows = raw.split(ROW);
  const [, name, w, h] = rows[0].split(COL);
  const lines = rows.slice(1).map((r) => {
    const [track, idx, clipName, px, py, sc, graphic, a, b, srcW, srcH] = r.split(COL);
    let vis = "";
    if (px && Number(srcW) && Number(srcH)) { const v = visibleSourceRect({ srcW: Number(srcW), srcH: Number(srcH), frameW: Number(w), frameH: Number(h), x: Number(px), y: Number(py), scale: Number(sc) }); vis = "; source " + srcW + "x" + srcH + ", visible source px x " + Math.round(v.x0) + "-" + Math.round(v.x1) + ", y " + Math.round(v.y0) + "-" + Math.round(v.y1); }
    return track + " #" + idx + " \"" + clipName + "\" " + tc(Number(a)) + "-" + tc(Number(b)) + (graphic === "1" ? " GRAPHIC" : " footage") + (px ? " position " + px + "," + py + " scale " + sc + vis : " (no Motion)");
  });
  const text = "\"" + name + "\" " + w + "x" + h + " (positions are frame fractions: 0.5,0.5 = centre; scale is % of native; 'visible source px' is the window of the source you can see, past the source edges = blank canvas)\n" + lines.join("\n");
  card.done(text, true);
  return { text };
}

// Snapshot pass: the timeline decides the moments (the first VISIBLE frame of every footage clip, midpoints of
// long ones, every graphic fully on), frames are rendered, saved next to the project as a contact sheet, and handed back.
// What is on screen at a moment: the visible picture first, then every other video-track clip, then our captions.
function layersAt(snap, t, cues) {
  const top = topFootageAt(snap, t);
  const on = snap.clips.filter((c) => c.track[0] === "V" && t >= c.start && t < c.end && (!top || c.id !== top.id)).sort((a, b) => a.track.localeCompare(b.track));
  const parts = [top ? "PICTURE " + top.track + " \"" + top.name + "\"" : "no picture"].concat(on.map((c) => c.track + " " + (isGuide(snap, c) ? "GUIDE " : isGraphic(c) ? "GRAPHIC " : "hidden ") + "\"" + c.name + "\""));
  const cue = cues && cues.find((q) => t >= q.start && t <= q.end);
  if (cue) parts.push("CAPTION \"" + cue.lines.join(" ") + "\"");
  return parts.join(" + ");
}
function keyMoments(snap, max = 12, cues = null) {
  const pts = [];
  snap.clips.filter((c) => c.track[0] === "V").sort((a, b) => a.start - b.start).forEach((c) => {
    if (isGuide(snap, c)) return; // the editor's safe-zone template, never judged as picture
    if (isGraphic(c)) pts.push({ t: Math.min(c.end - 0.05, c.start + Math.min(1.5, (c.end - c.start) / 2)), why: "graphic \"" + c.name + "\" (" + c.track + ") fully on" });
    else {
      // Only where this shot IS the picture; a talking head buried under b-roll is judged where it shows.
      const t0 = firstVisibleTime(snap, c);
      if (t0 === null) return;
      pts.push({ t: t0, why: (t0 > c.start + 0.2 ? "first visible frame of " : "start of ") + c.name + " (" + c.track + ")" });
      const mid = (c.start + c.end) / 2, topMid = topFootageAt(snap, mid);
      if (c.end - c.start > 15 && topMid && topMid.id === c.id) pts.push({ t: mid, why: "middle of " + c.name });
    }
  });
  if (cues && cues.length) cues.slice(0, 2).forEach((q, i) => pts.push({ t: (q.start + q.end) / 2, why: "caption on screen (" + (i + 1) + ")" }));
  const out = [];
  pts.sort((a, b) => a.t - b.t).forEach((p) => { if (!out.length || p.t - out[out.length - 1].t > 0.5) out.push(p); });
  if (out.length > max) { const step = out.length / max; return Array.from({ length: max }, (_, i) => out[Math.floor(i * step)]); }
  return out;
}
function captionCuesForSequence(snap) {
  try {
    const tl = freshTimelineWords(snap);
    const srt = seqFile(".srt");
    if (!fs.existsSync(srt)) return null;
    // parse our own SRT back into cues
    const cues = []; const blocks = fs.readFileSync(srt, "utf8").split(/\n\n+/);
    blocks.forEach((b) => { const m = /(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)\n([\s\S]*)/.exec(b.replace(/^\d+\n/, "")); if (m) cues.push({ start: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, end: +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000, lines: m[9].trim().split("\n") }); });
    return cues.length ? cues : null;
  } catch (_) { return null; }
}
// Frames are temporary: read, handed to the model, deleted. `save: true` keeps a contact sheet next to the project.
async function snapshotMoments({ max = 8, max_px = 512, save = false } = {}) {
  const card = addTool("snapshot_moments", "");
  card.open();
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return err(card, error.message); }
  const cues = captionCuesForSequence(snap);
  const moments = keyMoments(snap, Math.min(12, Math.max(1, Number(max))), cues);
  if (!moments.length) return err(card, "no video clips in the active sequence");
  const dir = save ? path.join(analysisDir(), "snapshots", (project.sequence || "sequence").replace(/[\/\\:]/g, "_")) : path.join(os.tmpdir(), "claude-for-adobe-snap-" + Date.now().toString(36));
  fs.mkdirSync(dir, { recursive: true });
  const content = [], index = [];
  for (let i = 0; i < moments.length; i += 6) {
    const batch = moments.slice(i, i + 6);
    card.progress(i, moments.length, "rendering ");
    const base = path.join(os.tmpdir(), "claude-for-adobe-snap-" + Date.now().toString(36));
    const raw = await host("frames", JSON.stringify(batch.map((m) => Number(m.t.toFixed(3)))), base);
    if (raw.indexOf("ERR:") === 0) return err(card, raw.slice(4));
    raw.split(ROW).forEach((row, j) => {
      const m = batch[j]; if (!m) return;
      const [b, ok, tcode] = row.split(COL);
      const src = [b + ".png", b].find((f) => fs.existsSync(f));
      if (!src) { content.push({ type: "text", text: tc(m.t) + " " + m.why + ": render failed (" + ok + ")" }); return; }
      try {
        const name = tc(m.t).replace(":", "-") + ".jpg";
        const file = path.join(dir, name);
        resizeImage(src, file, max_px);
        const layers = layersAt(snap, m.t, cues);
        index.push("- " + tc(m.t) + " (" + tcode + ") " + m.why + " | on screen: " + layers + " -> " + name);
        content.push({ type: "text", text: tc(m.t) + " " + m.why + " | on screen: " + layers });
        content.push({ type: "image", data: fs.readFileSync(file).toString("base64"), mimeType: "image/jpeg" });
        if (!save) { try { fs.unlinkSync(file); } catch (_) {} }
      } catch (error) { content.push({ type: "text", text: tc(m.t) + ": " + error.message }); }
      try { fs.unlinkSync(src); } catch (_) {}
    });
  }
  if (save) fs.writeFileSync(path.join(dir, "index.md"), "# Snapshots of \"" + (project.sequence || "sequence") + "\"\n<!-- timeline " + timelineFingerprint(snap) + " -->\n" + snap.width + "x" + snap.height + ", " + snap.duration.toFixed(1) + "s\n\n" + index.join("\n") + "\n");
  else { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  card.done(index.map((l) => l.replace(/ -> \S+$/, "")).join("\n") + (save ? "\nsaved in " + dir : ""), true);
  setStatus("Thinking…");
  content.push({ type: "text", text: "Frame " + snap.width + "x" + snap.height + "." + (save ? " Snapshots saved in " + dir + "." : "") + " Order of operations: 1) PICTURE: judge only the PICTURE clip named per moment, for the shot alone (placed? head room? cropped?); fix with nudge_clip and its track; layer_frames per footage track and seam_frames before moving on. Do not move the subject to dodge captions or graphics. 2) CAPTIONS: the band is a Premiere track setting the panel cannot move yet; if a caption covers the subject, say so in one line (bottom safe-zone line, as low as it fits) and never move the subject for it. 3) GRAPHICS, usually untouched: clip_transforms is where each one sits; move a graphic (nudge_clip with its track, absolute x/y) only if the crop pushed it out of the safe zone. A title over a face is the editor's call: say it in one line, do not move it unasked. Guides (mask, placement, safe-zone clips spanning the sequence) are never judged or moved. Then snapshot_moments again." });
  return { content };
}

// Look closer: N frames evenly across a time range (one clip, one graphic, one suspect moment). For the loop:
// question -> frames -> answer -> fix -> check.
async function framesAcross({ start_seconds, end_seconds, count = 4, max_px = 512, solo_track } = {}) {
  const a = Number(start_seconds), b = Number(end_seconds), n = Math.min(6, Math.max(2, Number(count) || 4));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return { text: "CLAUDE_FOR_ADOBE_ERROR:start_seconds and end_seconds (end > start) are required", isError: true };
  const secs = Array.from({ length: n }, (_, i) => Number((a + (b - a) * (i + 0.5) / n).toFixed(3)));
  return previewFrames({ seconds: secs, max_px, solo_track, title: "frames_across" });
}

// One layer alone: every clip on a video track rendered with the other video tracks hidden, so its own placement
// can be judged for the shot alone (step 1 of the reframe order for footage tracks, step 3 for graphic tracks).
async function layerFrames({ track, max_px = 512 } = {}) {
  const n = Number(track);
  if (!Number.isInteger(n) || n < 1) return { text: "CLAUDE_FOR_ADOBE_ERROR:track (1-based video track, e.g. 1 for V1) is required", isError: true };
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return { text: "CLAUDE_FOR_ADOBE_ERROR:" + error.message, isError: true }; }
  const clips = snap.clips.filter((c) => c.track === "V" + n).sort((a, b) => a.start - b.start);
  if (!clips.length) return { text: "CLAUDE_FOR_ADOBE_ERROR:no clips on V" + n, isError: true };
  const pts = [];
  clips.forEach((c) => {
    const t = isGraphic(c) ? Math.min(c.end - 0.05, c.start + Math.min(1.5, (c.end - c.start) / 2)) : c.start + Math.min(1, (c.end - c.start) / 2);
    pts.push({ t: Number(t.toFixed(3)), label: (isGraphic(c) ? "GRAPHIC " : "") + "\"" + c.name + "\"" });
  });
  const picked = pts.length > 6 ? Array.from({ length: 6 }, (_, i) => pts[Math.floor(i * pts.length / 6)]) : pts;
  const r = await previewFrames({ seconds: picked.map((p) => p.t), max_px, solo_track: n, labels: picked.map((p) => p.label), title: "layer_frames" });
  if (r.content) r.content.push({ type: "text", text: "V" + n + " alone (" + clips.length + " clip" + (clips.length === 1 ? "" : "s") + (pts.length > 6 ? ", 6 shown" : "") + "). Judge this layer's placement for the shot alone; captions still show because they are not a video track. Fix with nudge_clip track " + n + ". A frame that is empty here is a mask or hidden helper: leave it." });
  return r;
}

// The seams: the visible picture just before and just after every cut where it changes, in pairs. The subject
// must not jump across a cut. Up to 3 seams (6 frames) per call; pass from_seconds to continue.
async function seamFrames({ from_seconds = 0, max_px = 512 } = {}) {
  let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { return { text: "CLAUDE_FOR_ADOBE_ERROR:" + error.message, isError: true }; }
  const all = seams(snap), from = Number(from_seconds) || 0;
  const todo = all.filter((s) => s.t >= from).slice(0, 3);
  if (!all.length) return { text: "No cuts where the visible picture changes: one shot the whole way. Nothing to check across seams." };
  if (!todo.length) return { text: "No more seams after " + tc(from) + ". " + all.length + " in total, all checked." };
  const secs = [], labels = [];
  todo.forEach((s) => { secs.push(Number((s.t - 0.04).toFixed(3)), Number((s.t + 0.04).toFixed(3))); labels.push("OUT at " + tc(s.t) + " " + s.from, "IN at " + tc(s.t) + " " + s.to); });
  const r = await previewFrames({ seconds: secs, max_px, labels, title: "seam_frames" });
  const left = all.filter((s) => s.t > todo[todo.length - 1].t).length;
  if (r.content) r.content.push({ type: "text", text: "Pairs are the last frame before and the first frame after each cut. Compare subject position and size across each pair; fix the shot that is off (nudge_clip with its track), not both." + (left ? " " + left + " more seam" + (left === 1 ? "" : "s") + ": call seam_frames with from_seconds " + (todo[todo.length - 1].t + 0.1).toFixed(2) + "." : " That was the last seam.") });
  return r;
}

async function mediaInfoTool({ media_path = "" }) {
  const card = addTool("media_info " + path.basename(media_path), "");
  if ((await host("isMediaPath", media_path)) !== "ok") return err(card, media_path + " is not the media path of any project item (use sequence_overview)");
  try { const text = mediaInfo(media_path); card.done(text, true); return { text }; }
  catch (error) { return err(card, error.message); }
}

const TOOLS = { scopes: scopesTool, grade: gradeTool, grade_shot: gradeShotTool, grade_sequence: gradeSequenceTool, transcript_index: transcriptIndex, audio_cut: audioCut, rough_cut: roughCut, find_takes: findTakesTool, multicam_switch: multicamSwitch, visible_at: visibleAtTool, sound_events: soundEvents, speaker_check: speakerCheck, morph_cut: morphCut, subject_path: subjectPath, scene_cuts: sceneCuts, premiere_shortcut: premiereShortcut, run_extendscript: runExtendScript, sequence_overview: sequenceOverview, preview_frames: previewFrames, analyze_audio: analyzeAudio, remove_silences: removeSilences, remove_pauses: removePauses, read_transcript: readTranscript, transcribe_whisper: transcribeWhisper, media_info: mediaInfoTool, project_bins: projectBins, move_to_bin: moveToBin, classify_clips: classifyClips, create_sequence: createSequence, mute_clip_audio: muteClipAudio, find_in_transcript: findInTranscript, extract_ranges: extractRanges, keep_only: keepOnly, place_broll: placeBroll, list_analysis: listAnalysis, save_notes: saveNotes, set_sequence_size: setSequenceSize, remove_fillers: removeFillers, transcribe_timeline: transcribeTimeline, create_captions: createCaptions, nudge_clip: nudgeClip, clip_transforms: clipTransforms, reframe: reframeTool, fit_region: fitRegionTool, find_on_screen: findOnScreen, snapshot_moments: snapshotMoments, frames_across: framesAcross, layer_frames: layerFrames, seam_frames: seamFrames };

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
  { name: "scopes", description: "Lumetri Scopes as numbers (measure a person with region \"face\"; the `colour` skill says what the numbers mean) for up to 3 timeline positions, measured from Premiere's own full-resolution render with the grade: luma range and median (0-100), RGB parade means and ranges, clipped and crushed shares, vectorscope saturation and whole-frame cast, plus one scope image. The tool for any exposure, contrast or colour question, and for matching two shots across a cut: compare their numbers. Reads the exported 8-bit frame as SDR Rec.709, not calibrated against Lumetri's own readout. The grade itself is the editor's Lumetri click.",
    inputSchema: { type: "object", properties: { seconds: { type: "array", items: { type: "number" } }, region: { type: "string", enum: ["frame", "face", "subject", "hands", "keyed"], description: "\"subject\" measures only Vision's foreground subject, whatever it is - a face, hands, a product; \"face\" measures only the biggest face box (skin without hair and clothes, best for skin tone); \"hands\" the biggest hand box; \"keyed\" only the pixels Lumetri's HSL Secondary key selects (the clip must have Show Mask on: the rest of the frame is a flat grey and is left out). Use one of them whenever the shot has a subject: the background drags whole-frame numbers away from it. Says so when nothing is found." }, solo_track: { type: "number", description: "1-based video track to measure ALONE (other video tracks hidden). Default: the composite." }, source: { type: "boolean", description: "Decode the clip's own source file at the matching frame instead of rendering in Premiere: nothing renders, nothing moves. Camera pixels, not the grade - a read, never a confirm. Check it against a plain call once per footage type." }, track: { type: "number", description: "With source: which video track's clip, default 1." } }, required: ["seconds"] } },
  { name: "grade", description: "Load the `colour` skill before grading. Sets ONE Lumetri Color parameter on the clip at a timeline position so the scopes read what you asked, in one go: one render to read the scopes, the calibration model chooses the value, one render to confirm (one nudge from the two real readings if the confirm is off, then it stops and reports the residual). Never leaves the slider's range, never leaves the frame clipped or crushed. Give the number the statistic should reach, not the slider value. Defaults: temperature steers whitesRB (the parade's blue-minus-red whites; 0 = neutral whites), exposure steers brightness (luma median), contrast steers spread (luma p99-p1). For a whole shot use grade_shot instead: one render for all the knobs.",     inputSchema: { type: "object", properties: { parameter: { type: "string", enum: ["temperature", "tint", "exposure", "contrast", "highlights", "shadows", "whites", "blacks", "saturation", "vibrance"] }, target: { type: "number", description: "What the statistic should read (0-100 scale; parade differences and cast are signed)." }, seconds: { type: "number", description: "Timeline position: picks the clip and the frame that is measured." }, statistic: { type: "string", enum: ["brightness", "blackPoint", "whitePoint", "spread", "whitesRB", "whitesG", "blacksRB", "red", "green", "blue", "warmth", "tintCast", "saturation"], description: "Override the parameter's default statistic. Rarely needed." }, region: { type: "string", enum: ["frame", "face", "subject"], description: "What to read and steer by. \"subject\" = Vision's foreground subject; \"face\" = the biggest face box. Clipping is always judged on the whole frame." }, track: { type: "number", description: "1-based video track, default 1." }, tolerance: { type: "number", description: "How close counts as a hit, default 0.5." } }, required: ["parameter", "target", "seconds"] } },
  { name: "grade_sequence", description: "\"Grade this video\" / \"balance everything\": every footage clip on a track, deterministically, on the working copy. Per clip: the scopes read from the clip's own file (subject region by default), then the colourist canon by rule - white balance (Temperature, only for a cast the whole parade shares) and each end's colour-wheel pad for what is left, one confirm and one nudge; then the black point set exactly with the Master curve's bottom point (a levels move), Whites to the white point with Highlights finishing what its cap leaves, Contrast only if the frame is flat or harsh, Blacks only to lift crushed blacks, Exposure only for a face's skin luma - knobs from the calibration model, written as one set and confirmed ONCE, then one correction (a rollback of what clipped or crushed the frame beyond what the source had, else a direction-aware pad nudge) and one confirm of that. Two renders a clip. Never leaves a slider's range; residuals are reported, never chased. Graphics and generated layers are skipped. Returns one line per clip: what it read, what was set, whether it is balanced and why not if not. Call it ONCE for \"grade this video\"; use grade / grade_shot afterwards for taste (warmer, more contrast on the interview, match these two). Stop ends it after the current clip.",     inputSchema: { type: "object", properties: { track: { type: "number", description: "1-based video track, default 1." }, region: { type: "string", enum: ["frame", "face", "subject"], description: "What to read exposure by; default subject. White balance always reads the whole frame." }, tolerance: { type: "number", description: "Per-knob hit tolerance, default 1." }, read: { type: "string", enum: ["auto", "premiere", "source"], description: "Where the first reading comes from. Default auto: decode each clip's own file (no render, nothing moves; verified identical to Premiere's render on BRAW), falling back to a Premiere render if the file cannot be decoded here." }, confirm: { type: "boolean", description: "Re-measure in Premiere after the knobs are set (default true). Off = zero renders with source reads, and the result is the model's word only." } } } },
  { name: "grade_shot", description: "Grade a whole shot in ONE go: one render to read its scopes, the calibration model chooses every knob, all are written, one render confirms the lot. Two renders per shot. goals are applied in the order given - a colourist's order is white balance (temperature → whitesRB 0), then exposure (→ brightness), then contrast (→ spread). Each knob is solved on the state predicted after the ones before it. Reports, per knob: before, predicted, what the confirm actually read, the residual; and warns if the frame ended up clipped or crushed. Knobs without a calibration (anything but temperature, exposure, contrast) are skipped and named - set those with grade.",     inputSchema: { type: "object", properties: { goals: { type: "array", items: { type: "object", properties: { parameter: { type: "string", enum: ["temperature", "exposure", "contrast", "tint", "highlights", "shadows", "whites", "blacks", "saturation", "vibrance"] }, target: { type: "number" }, statistic: { type: "string" } }, required: ["parameter", "target"] }, description: "In the order to apply." }, seconds: { type: "number", description: "Timeline position: picks the clip and the frame." }, region: { type: "string", enum: ["frame", "face", "subject"], description: "What to read and steer by; clipping is judged on the whole frame regardless." }, track: { type: "number", description: "1-based video track, default 1." }, tolerance: { type: "number", description: "How close counts as a hit per knob, default 1." } }, required: ["goals", "seconds"] } },
  { name: "preview_frames", description: "Render up to 6 frames of the active sequence as images, from Premiere's own Export Frame with the grade applied; max_px at the frame's longest edge (1920 for HD, landscape or vertical) gives full detail. For what something looks like. Exposure and colour numbers: scopes. Checking edits: snapshot_moments.",
    inputSchema: { type: "object", properties: { seconds: { type: "array", items: { type: "number" } }, max_px: { type: "number", description: "Longest edge in pixels, default 512; the frame's longest edge for full detail." }, solo_track: { type: "number", description: "1-based video track to render ALONE (other video tracks hidden). Default: the composite." } }, required: ["seconds"] } },
  { name: "layer_frames", description: "One layer alone: every clip on a video track rendered with the other video tracks hidden, so that layer's own placement is judged for the shot alone. Reframe order: footage tracks in step 1 (picture), graphic tracks in step 3 (graphics). Fix with nudge_clip and the same track.",
    inputSchema: { type: "object", properties: { track: { type: "number", description: "1-based video track (1 = V1)" }, max_px: { type: "number" } }, required: ["track"] } },
  { name: "seam_frames", description: "The seams: the visible picture just before and just after every cut where it changes, in pairs. Run after the shots are framed (reframe step 1): the subject must not jump across a cut; fix the shot that is off. 3 seams per call; continue with from_seconds.",
    inputSchema: { type: "object", properties: { from_seconds: { type: "number", description: "Continue from this time (default 0)." }, max_px: { type: "number" } } } },
  { name: "find_in_transcript", description: "Deterministic search for a phrase in the transcript. Returns every match with sequence timecodes and a little context. Use this instead of reading the transcript to find where something is said.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, source: { type: "string", enum: ["auto", "premiere", "whisper"] } }, required: ["query"] } },
  { name: "extract_ranges", description: "Remove exact time ranges from the active sequence (all tracks, ripple), in sequence seconds. Deterministic; each range is one Cmd+Z step. Plan with dry_run=true first.",
    inputSchema: { type: "object", properties: { ranges: { type: "array", items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } }, dry_run: { type: "boolean" } }, required: ["ranges"] } },
  { name: "keep_only", description: "Keep only the given time ranges of the active sequence and remove everything else (a selects-based cut: 'keep 0:12-0:41 and 1:03-1:30'). Deterministic. Plan with dry_run=true first.",
    inputSchema: { type: "object", properties: { ranges: { type: "array", items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } }, dry_run: { type: "boolean" } }, required: ["ranges"] } },
  { name: "snapshot_moments", description: "The check pass. The timeline picks the moments (the first VISIBLE frame of every footage clip, midpoints of long ones, every graphic fully on), renders them and returns the images with what is on screen (PICTURE clip, hidden clips, GRAPHIC, CAPTION). Frames are temporary (deleted after you see them) unless save is true. Use after any reframe or b-roll placement, in the reframe order: picture first, then captions, then graphics.",
    inputSchema: { type: "object", properties: { max: { type: "number", description: "moments to render, default 8, max 12" }, max_px: { type: "number" }, save: { type: "boolean", description: "keep a contact sheet next to the project (default false)" } } } },
  { name: "frames_across", description: "Look closer: 2-6 frames evenly spaced across a time range (one clip, one graphic, the seconds around a suspect moment). Use when a snapshot leaves a question, e.g. is the head cropped for the whole clip or only at the start, does the graphic move, is the subject drifting. Answer the question from these frames before deciding.",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number" }, end_seconds: { type: "number" }, count: { type: "number", description: "default 4, max 6" }, max_px: { type: "number" }, solo_track: { type: "number", description: "1-based video track to render alone; default the composite." } }, required: ["start_seconds", "end_seconds"] } },
  { name: "nudge_clip", description: "Move or scale the video clip at a sequence time. Deltas: dx right, dy down as fractions of the frame (dx -0.1 = 10% left), scale as a multiplier (1.1 = 10% bigger). Absolutes: x, y as frame fractions (0.5,0.5 = centre) and scale_to as a percentage, for restoring a known placement in one call (from clip_transforms). Absolutes win over deltas. Undoable. Look (layer_frames for the layer alone, snapshot_moments for the composite), nudge, look again.",
    inputSchema: { type: "object", properties: { at_seconds: { type: "number" }, track: { type: "number", description: "1-based video track (V3 = 3). Required when more than one clip is at that time, e.g. a graphic over the subject; the tool lists them if you leave it out" }, dx: { type: "number" }, dy: { type: "number" }, scale: { type: "number" }, x: { type: "number", description: "absolute x, frame fraction" }, y: { type: "number", description: "absolute y, frame fraction" }, scale_to: { type: "number", description: "absolute scale, percent of native" }, same_source: { type: "boolean", description: "default true: the same placement goes to every clip on that track cut from the same source file (a take in pieces is one framing). false = this clip only" } }, required: ["at_seconds"] } },
  { name: "fit_region", description: "Place the action by arithmetic, not by eye: give a rectangle of the clip's SOURCE (the control, the panel, the face: source pixels, or fractions with roi_units 'fraction') and a target rectangle of the frame (a safe band from the project's safe-zone note; default the frame with a 5% margin). The tool computes the one position and scale that put the region inside the target (capped at max_scale, default 100 so text keeps its size), applies it, reads Premiere back and returns CHECK PASS/FAIL plus any blank canvas to disclose. Your judgment is only WHICH region; then frames_across to confirm.",
    inputSchema: { type: "object", properties: { at_seconds: { type: "number" }, track: { type: "number", description: "1-based video track" }, roi: { type: "object", properties: { x0: { type: "number" }, y0: { type: "number" }, x1: { type: "number" }, y1: { type: "number" } }, required: ["x0", "y0", "x1", "y1"] }, roi_units: { type: "string", enum: ["px", "fraction"] }, target: { type: "object", properties: { x0: { type: "number" }, y0: { type: "number" }, x1: { type: "number" }, y1: { type: "number" } }, description: "frame fractions, e.g. the upper safe band" }, max_scale: { type: "number", description: "default 100 (never enlarge)" }, margin: { type: "number", description: "breathing room inside the target, fraction of it; default 0.03" } }, required: ["at_seconds", "track", "roi"] } },
  { name: "find_on_screen", description: "The on-screen twin of find_in_transcript: when do words or labels appear on screen? Samples frames of the active sequence and reads their text with macOS's built-in recognizer; returns, per word, the spans (timeline seconds) where it is visible and where in the frame. Each frame is a Premiere render (seconds each), so: put EVERY word you need in texts[] (one pass reads them all), and narrow start/end before asking for a small step. At most 30 frames per call; the step widens to fit and the result says so.",
    inputSchema: { type: "object", properties: { texts: { type: "array", items: { type: "string" }, description: "all the words/labels to look for, in one pass" }, text: { type: "string", description: "a single word (or use texts)" }, start_seconds: { type: "number" }, end_seconds: { type: "number" }, step_seconds: { type: "number", description: "default 1; 0.2 minimum; widened automatically beyond 30 frames" } } } },
  // caption_style (captionStyleTool) is built and tested but not registered: it reopens the project, which is
  // wrong for big projects. It returns once captions can be placed on import (TTML) or without a reopen.
  { name: "clip_transforms", description: "Ground truth for placement: every video clip's Motion Position (frame fractions) and Scale (% of native), with GRAPHIC or footage per clip, for the active sequence or a named one (e.g. the untouched original). Read this instead of estimating from a frame; read it before and after set_sequence_size when graphics matter.",
    inputSchema: { type: "object", properties: { sequence: { type: "string", description: "sequence name; omit for the active one" } } } },
  { name: "reframe", description: "THE call for a shape change on an OPEN timeline: 'make it 9:16', '4:5', '16:9 version'. Never with a bin (refused): raw footage in a bin is rough_cut's job, and the tracking pass on its cut is this call without a bin. For 'check the framing' with no shape change use snapshot_moments, which moves nothing. One deterministic pass: the open timeline is resized on its working copy. Footage fills the frame and is centred, graphics/titles/guides keep their placement, then Premiere's own Auto Reframe effect goes on every footage clip (Premiere analyses each clip's SOURCE and follows the subject inside the frame). Returns the visible moments and the seams as frames with CHECK lines. Afterwards: judge the picture in each frame, nudge_clip (with track) only what is wrong, snapshot_moments once more. motion 'static' = fill-and-centre only, no tracking.",
    inputSchema: { type: "object", properties: { aspect: { type: "string", description: "9:16, 4:5, 1:1, 16:9, 2.39:1 ..." }, preset: { type: "string", enum: ["vertical", "hd", "uhd", "square", "four_five"] }, width: { type: "number" }, height: { type: "number" }, fps: { type: "number" }, motion: { type: "string", enum: ["track", "static"], description: "track (default): Premiere Auto Reframe follows the subject; static: fill and centre only" }, reframe: { type: "string", enum: ["fill", "fit", "none"], description: "static mode only: fill (default) or fit" }, max: { type: "number", description: "moments to render, default 8" } } } },
  { name: "set_sequence_size", description: "Lower-level than reframe (use reframe). Change the active sequence's frame size (any aspect: 9:16, 4:5, 1:1, 16:9, 2.39:1; or a preset; or width+height) and optionally fps, then reframe the FOOTAGE: fill (scale to cover, centred; the default), fit, or none. Graphics, titles and guides are NOT re-placed: they keep their position fraction and their proportion (scale follows the frame width); the result lists each one's before/after. The panel saves and checkpoints first. Just do it when asked, then follow the reframe skill: picture first on visible frames (snapshot_moments, nudge_clip footage only where the crop cuts something), seam_frames, captions, graphics last and only if the crop pushed one out of the safe zone.",
    inputSchema: { type: "object", properties: { preset: { type: "string", enum: ["vertical", "hd", "uhd", "square", "four_five"] }, aspect: { type: "string", description: "any ratio like 9:16, 4:5, 1:1, 16:9, 2.39:1" }, width: { type: "number" }, height: { type: "number" }, fps: { type: "number" }, reframe: { type: "string", enum: ["fill", "fit", "none"] } } } },
  { name: "place_broll", description: "Lay one b-roll clip over the talking head: on V2 (or given track) at a sequence time, for a duration; its audio is removed and every other track is locked during the overwrite so nothing shifts. media_path is the clip's file path, its name, or bin/path/name as project_bins lists it. If it returns an error, report the error to the editor and stop; never search the project for the clip with run_extendscript. The result says WARNING if anything else moved; then Cmd+Z. Deterministic. Use after you understand what each b-roll clip shows (preview_frames, save_notes) and where the words call for it.",
    inputSchema: { type: "object", properties: { media_path: { type: "string" }, at_seconds: { type: "number" }, duration_seconds: { type: "number", description: "default 4" }, in_seconds: { type: "number", description: "where in the source clip to start, default 0" }, track: { type: "number", description: "1-based video track, default 2" } }, required: ["media_path", "at_seconds"] } },
  { name: "transcript_index", description: "Intact dialogue from the exact timeline transcript, followed by qualitative measured delivery, optional identity-bound speaker runs, and unchanged index:word mappings. Whole punctuation-delimited passages are returned for intersecting time ranges; unavailable observations are explicit. The input for authoring thoughts: group every word into thoughts by word_start_i / word_end_i, label what was said, kind answer or production, retake_of when a thought says the same thing as an earlier one. Then audio_cut with those thoughts.",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number" }, end_seconds: { type: "number" } }, required: [] } },
  { name: "audio_cut", description: "The audio cut at the level of thoughts, one pass: the transcript is split into thoughts, fragments and false starts are dropped whole, the losing take of a repeated line is dropped whole (delivery measured from the timeline render, among complete answers you author), every complete thought is kept in order with a little air on each side, and the cut lands only between thoughts; the one cut inside a thought is a failed restart (first attempt out, retake kept). Report first (kept thoughts numbered with times and text, dropped ones with reasons); apply: true does it as one keep_only. Needs a transcript for this exact timeline (rough_cut and transcribe_timeline make it).",
    inputSchema: { type: "object", properties: { silence_threshold_db: { type: "number", minimum: -100, maximum: 0, description: "For authored thoughts: audio silence floor in dBFS, default -35. Adjust for the recording; pauses come from a fresh timeline render. The legacy no-thoughts mode does not use this setting." }, thoughts: { type: "array", description: "authored thoughts from transcript_index: [{id, word_start_i, word_end_i, label, kind: 'answer'|'production', retake_of}] covering every word; without it the split is by pauses alone, which is cruder", items: { type: "object" } }, apply: { type: "boolean", description: "cut now; default false (report only)" }, gap_seconds: { type: "number", description: "fallback split: pause that ends a thought, default 0.6" }, pad_seconds: { type: "number", description: "fallback split: air on each side of a thought, default 0.18" } }, required: [] } },
  { name: "rough_cut", description: "ONE call for 'make me a 9:16 (4:5, 16:9, 1:1) video from this folder'. Fixed order: (1) a uniquely named Cleanup sequence at the shape, footage filled and centred on the face, NO tracking; measured silence removed with source waveform vetoes, preserving takes and detected sound; (2) a native Editorial duplicate, verified against Cleanup clip geometry; (3) only Editorial rendered and transcribed, returned as indexed words. Keep Cleanup intact. All take and story decisions go on Editorial. Then YOU author the thoughts (every word in exactly one thought, in order, labelled, kind answer/production, retake_of for repeats; no winners) and call audio_cut with them: the code validates, measures delivery, picks takes by fluency, cuts failed restarts inside a thought, trims crumbs, and otherwise cuts only between thoughts under the editors' rules. For a duration-limited request, select the story from the report and use keep_only on its selected resolved ranges directly; never apply the full take-cleanup report first. Verify the planned length is below the requested limit. After applying the short story, speaker_check, place_broll and reframe (no bin) once.",
    inputSchema: { type: "object", properties: { bin: { type: "string", description: "bin path of the talking-head footage; omit to use the selected bin or exact selected Project clips" }, aspect: { type: "string", description: "9:16, 4:5, 1:1, 16:9" }, preset: { type: "string", enum: ["vertical", "hd", "uhd", "square", "four_five"] }, width: { type: "number" }, height: { type: "number" }, name: { type: "string" }, language: { type: "string", description: "for Whisper, default en" }, silence_threshold_db: { type: "number", minimum: -100, maximum: 0, description: "Cleanup silence floor, default -35 dBFS" }, min_silence_s: { type: "number", exclusiveMinimum: 0, description: "Minimum measured silence to shorten, default 1 second" }, pad_s: { type: "number", minimum: 0, description: "Sound boundary padding, default 0.18 seconds" } }, required: [] } },
  { name: "find_takes", description: "Repeated takes from the transcript: a line said, stumbled, said again. Groups near-duplicate utterances within a window and picks the most complete take (most content words, fewest fillers, finished ending; later on a tie). Returns the groups with times and the ranges to drop; with apply: true it removes the dropped takes (working copy, one Cmd+Z step per range). Run after remove_silences and before story decisions; the transcript must exist (Premiere's or transcribe_timeline).",
    inputSchema: { type: "object", properties: { window_seconds: { type: "number", description: "how far apart two takes of the same line can be, default 90" }, min_similarity: { type: "number", description: "0-1, default 0.6" }, apply: { type: "boolean", description: "remove the dropped takes now, default false (report only)" }, source: { type: "string", description: "auto | premiere | whisper, default auto" } }, required: [] } },
  { name: "multicam_switch", description: "EXPERIMENTAL, first run pending: switch the camera of a multicam clip at a time through Premiere's own multicam editor (QE sequence.multicam.changeCamera, the number-key switch). Just run it: the tool checks whether the clip under the playhead is a multicam source sequence and says so if not (sequence_overview marks them [MULTICAM SOURCE]). Runs on the working copy; renders the frame before and after and reports whether the picture changed and whether the clip count changed (a switch mid-clip cuts it like the number key does). Needs a multicam source sequence clip on the timeline.",
    inputSchema: { type: "object", properties: { at_seconds: { type: "number" }, camera: { type: "number", description: "1-based camera number" }, record: { type: "boolean", description: "also toggle multicam record around the switch (as the 0 key does), default false" } }, required: ["at_seconds", "camera"] } },
  { name: "visible_at", description: "What the viewer sees at a time, by lookup from the visibility ledger (computed from Premiere's own clip data whenever the timeline changes: Motion position/scale, Crop, Opacity, source size vs sequence frame, Alpha on stills, masks). Reports 'hidden for certain' (footage over the track) and 'possibly' (alpha layers: AE comps, MOGRTs, alpha stills, which geometry cannot classify). With settle: true, every moment where those differ is settled by Premiere's own renderer: the composite is compared with the base track alone, and the share of the frame where they match is how much of the base track the viewer actually sees. Use it before deciding to hold on a face, cover a line, or put a transition on a cut.",
    inputSchema: { type: "object", properties: { at_seconds: { type: "number", description: "omit for the per-cut table" }, base_track: { type: "number", description: "1-based track whose picture is asked about, default 1" }, settle: { type: "boolean", description: "render composite vs base-alone wherever alpha layers leave the answer open (two frames per moment)" } }, required: [] } },
  { name: "sound_events", description: "Laughter, applause, cheering, sighs and gasps, music and keyboard noise on the timeline, with times, from Apple's built-in sound classifier over Premiere's own render of the mix. Free, on this Mac. Use it before removing pauses (a pause next to a laugh is a beat, not dead air), to find reactions worth cutting to, and to see where music runs. Results are saved next to the project for reuse.",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number", description: "default 0" }, end_seconds: { type: "number", description: "default the whole sequence" }, min_confidence: { type: "number", description: "default 0.35" } }, required: [] } },
  { name: "speaker_check", description: "Is the speaker worth staying on here? Renders frames across a span with the b-roll tracks hidden and reads the face with macOS's Vision framework: whether the head is square to the lens, eyes open, mouth mid-word, how big the face is, and Apple's own capture quality. Use it before deciding to hold on the face for a key line, and before covering one. Measured geometry only, no mood: energy comes from the voice.",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number" }, end_seconds: { type: "number" }, step_seconds: { type: "number", description: "default 0.5" }, track: { type: "number", description: "1-based video track holding the speaker, default 1" } }, required: ["start_seconds", "end_seconds"] } },
  { name: "morph_cut", description: "Premiere's own transition on cuts of one video track, through QE: default Morph Cut, the fix for the jump cut that every pause and filler removal leaves on a talking head (any name from the transition list works: Cross Dissolve, Dip to Black...). Give seams (the cut times) or all_seams to do every cut where two clips touch. Only seams the viewer actually sees get one: cover is computed from every clip above the track (Motion position and scale, Opacity, source size, Premiere's Alpha flag for stills), so a side-by-side or picture-in-picture counts by how much it hides; a seam more than 65% hidden on either side is skipped and named. Runs on the working copy; the read-back is the track's transition count before/after. Morph Cut analyses in the background after this returns.",
    inputSchema: { type: "object", properties: { seams: { type: "array", items: { type: "number" }, description: "cut times in seconds (end of the outgoing clip)" }, all_seams: { type: "boolean", description: "every cut on the track where clips touch" }, track: { type: "number", description: "1-based video track, default 1" }, transition: { type: "string", description: "default Morph Cut" }, frames: { type: "number", description: "duration in frames, default 12" } }, required: [] } },
  { name: "subject_path", description: "Where Premiere's Auto Reframe put the subject over time: every keyframed parameter on every clip of one video track, sampled (time=x,y in frame fractions). Read this instead of judging head room from frames. Read-only. Key times are as Premiere returns them; the result says whether they read as sequence or clip time.",
    inputSchema: { type: "object", properties: { track: { type: "number", description: "1-based video track, default 1" }, max_keys: { type: "number", description: "samples per parameter, default 40" } }, required: [] } },
  { name: "scene_cuts", description: "Premiere's own Scene Edit Detection: cuts the clip under a time on a track at every scene change (linked audio follows). Use it on a screen recording or any single clip that holds several shots, before find_on_screen or frames. Runs on the working copy. Returns clips before/after as the CHECK.",
    inputSchema: { type: "object", properties: { at_seconds: { type: "number" }, track: { type: "number", description: "1-based video track, default 1" }, sensitivity: { type: "string", description: "low | medium | high, default medium" } }, required: ["at_seconds"] } },
  { name: "premiere_shortcut", description: "The editor's own keyboard shortcut for a Premiere command (reads their .kys sets; nothing is pressed). Use it to say the exact key when a job is the editor's click (Transcribe, Delete all pauses, Scene Edit Detection...). Query words match the command id: 'extract', 'ripple delete', 'caption', 'transcribe', 'reframe'. The full id list with default keys is premiere-scripting/commands-26.md.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "words that must all appear in the command id" } }, required: ["query"] } },
  { name: "list_analysis", description: "Compact analysis lookup for selected Project clips, then selected bins, otherwise the active timeline. Lists exact-name analysis candidates and short project-guidance titles; verify identity and read only applicable guidance. Omits unrelated chats, renders and debug files. all:true explicitly requests the whole project inventory; never use it just because the scoped lookup has no matches.",
    inputSchema: { type: "object", properties: { all: { type: "boolean", description: "default false; true only for an explicitly needed whole-project inventory" } } } },
  { name: "save_notes", description: "Save your notes (shot descriptions per b-roll clip, decisions, selects) as a markdown file next to the project, so later turns and sessions reuse them instead of looking again.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "file name, e.g. broll-notes" }, text: { type: "string" } }, required: ["text"] } },
  { name: "create_captions", description: "Plain native captions on the active sequence: builds cues from the transcript (the exact timeline transcript when it exists for this cut, else per-clip), writes an SRT next to the project, imports it and creates a caption track. Editable in Premiere's Captions panel. Not undoable (import), so the panel checkpoints first. Defaults come from Settings (a few words per caption, one line, 3 s); pass max_words etc. only when the editor asks for something different.",
    inputSchema: { type: "object", properties: { max_words: { type: "number", description: "words per caption; 0 = fill by characters" }, max_chars: { type: "number" }, max_lines: { type: "number" }, max_seconds: { type: "number" }, source: { type: "string", enum: ["auto", "timeline", "premiere", "whisper"] } } } },
  { name: "transcribe_timeline", description: "Exact transcript of the current cut: renders the sequence's audio mix with Premiere's own 16 kHz preset into the analysis folder and transcribes it (Whisper, local). Words come out in timeline time, so it is right after any edit and covers clips that were never transcribed. Runs in the background; you are told when it is done. Then read_transcript, find_in_transcript and remove_fillers use it automatically for this exact cut. Use before captions or anything that needs exact timing on a cut timeline.",
    inputSchema: { type: "object", properties: { language: { type: "string", description: "default en; 'auto' to detect" } } } },
  { name: "remove_fillers", description: "Basic audio clean-up from the transcript: cuts 'um', 'uh', 'hmm' and immediate repeats or stutters ('I I', 'we were we were'). Plan with dry_run=true (default), show the count in one line, then apply. Needs a transcript (Premiere's saved one, or transcribe_whisper).",
    inputSchema: { type: "object", properties: { start_seconds: { type: "number" }, end_seconds: { type: "number" }, repeats: { type: "boolean", description: "also cut repeated words, default true" }, source: { type: "string", enum: ["auto", "premiere", "whisper"] }, dry_run: { type: "boolean" } } } },
  { name: "mute_clip_audio", description: "Disable (mute) the audio of every clip in the active sequence whose source file is listed. Use it on the files classify_clips called b-roll so their sound never fights the talking head. Undoable per clip.",
    inputSchema: { type: "object", properties: { media_paths: { type: "array", items: { type: "string" } } }, required: ["media_paths"] } },
  { name: "create_sequence", description: "Create a new sequence from exact selected Project clips, or a selected/given bin (nested bins included). Directly selected clips take precedence over selected bins when bin is omitted. No open sequence is needed. Without width/height/fps Premiere matches the first clip's settings; give width, height, fps to force e.g. 1080x1920 @ 23.976 for a vertical social cut. insert_clips=true lays the bin's clips in order as a starting assembly; false creates it empty. Becomes the active sequence. Ask the user for settings and name first.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, bin: { type: "string", description: "bin path; omit for exact selected Project clips, otherwise the selected bin; no selection is refused" }, preset: { type: "string", enum: ["match", "vertical", "hd", "uhd", "square", "four_five"], description: "match = the footage; vertical = 1080x1920; hd = 1920x1080; uhd = 3840x2160; square = 1080x1080; four_five = 1080x1350" }, aspect: { type: "string", description: "any ratio like 9:16, 4:5, 1:1, 2.39:1" }, width: { type: "number" }, height: { type: "number" }, fps: { type: "number" }, insert_clips: { type: "boolean", description: "default true" } }, required: ["name"] } },
  { name: "classify_clips", description: "Cheap first pass over an explicit bin, otherwise exact selected Project clips, otherwise selected bin, otherwise active sequence: speech coverage (voice detection), length, whether a transcript exists, camera-original naming, footage sizes and frame rates, and a guess (talking head / b-roll / mixed / silent) with confidence. Run this first when asked to edit, assemble, or find the talking head. Only clips marked 'look at a frame' need preview_frames.",
    inputSchema: { type: "object", properties: { bin: { type: "string", description: "bin path like 'Footage/Day 2'; omit for selected Project clips or bin, otherwise the active sequence" } } } },
  { name: "project_bins", description: "With a bin selected in Premiere (or given), lists just that bin's media with sizes and frame rates. Otherwise the whole Project panel tree: bins (ending in /, with item counts) and items, including loose items at the root.",
    inputSchema: { type: "object", properties: { bin: { type: "string", description: "bin path; defaults to the bin selected in Premiere" } } } },
  { name: "move_to_bin", description: "Move project items into bins, creating bins as needed. Use this for organizing the Project panel instead of scripts. Each move is one Cmd+Z step. item = name or bin/name path; bin = bin path like '_ASSETS' or 'Footage/Day 2'.",
    inputSchema: { type: "object", properties: { moves: { type: "array", items: { type: "object", properties: { item: { type: "string" }, bin: { type: "string" } }, required: ["item", "bin"] } } }, required: ["moves"] } },
  { name: "media_info", description: "ffprobe a clip's source file (media path from sequence_overview): container, duration, video resolution/fps, audio sample rate/channels.",
    inputSchema: { type: "object", properties: { media_path: { type: "string" } }, required: ["media_path"] } },
];

// ---- claude session ---------------------------------------------------------------------------

function onEvent(event) {
  if (event.kind === "ready") { log(agentName().toLowerCase() + " session " + event.sessionId + " · " + event.model); if (event.model) setStatus("Ready · " + modelLabel(event.model)); }
  else if (event.kind === "delta") {
    if (!liveMessage) liveMessage = addMessage("assistant", "");
    liveMessage.textContent += event.text;
    followBottom(ui.messages);
  }
  else if (event.kind === "text") { if (liveMessage) { liveMessage.textContent = event.text; liveMessage = null; } else addMessage("assistant", event.text); }
  else if (event.kind === "tool_use") { liveMessage = null; log("tool_use " + event.name); }
  else if (event.kind === "turn_done") {
    liveMessage = null;
    readSnapshot().then((snap) => { timeline = snap; }).catch(() => {});
    const modelError = event.isError && /issue with the selected model|not have access|unrecognized_model|model .*not (found|available)/i.test(event.text || "");
    if (modelError && ui.agent.value !== "codex" && ui.model.value !== MODEL_FALLBACK && lastPayload) {
      addMessage("assistant muted", modelLabel(ui.model.value) + " isn't available on this account. Switching to " + modelLabel(MODEL_FALLBACK) + " and sending your message again.");
      ui.model.value = MODEL_FALLBACK;
      const payload = lastPayload;
      restartSession(event.sessionId).then(() => { if (session && !session.busy) { setBusy(true); setStatus("Thinking…"); sendTurn(payload); } });
      return;
    }
    if (event.isError) addMessage("assistant error", event.text || "Claude returned an error.");
    if (pendingProjectRestart) { pendingProjectRestart = false; setTimeout(() => restartSession(session && session.sessionId), 50); }
    const used = (event.modelsUsed || []).filter((m) => [...ui.model.options].some((o) => o.value === m)).map(modelLabel).join(" + "); // helper models (haiku for housekeeping) are not shown
    setStatus("Ready" + (used ? " · " + used : "") + (event.costUsd ? " · $" + event.costUsd.toFixed(3) + " this session" : ""));
    setBusy(false);
    if (queuedNudges.length) nudge(queuedNudges.shift()); // a job finished while Claude was busy
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
    setStatus("Starting " + agentName() + "…");
    setBusy(true);
    if (old) await old.stop();
    try {
      const skillsDir = path.join(extensionRoot, ".claude", "skills");
      const common = {
        mcpUrl: mcp.url, mcpToken: mcp.token, model: ui.model.value, resumeSessionId,
        capabilities: (ui.dupSequence.checked ? "" : "WARNING: the editor turned off duplicate-sequence protection; edits hit the ORIGINAL sequence. Confirm before any edit. ") + "Whisper model: " + whisperState() + (modelReady() ? "" : " (transcribe_whisper will ask the user to download it, " + WHISPER_MODELS[currentModel()].mb + " MB, one time; Premiere's own Transcribe + Cmd+S is the alternative)") + ". Voice silence detection: " + (process.arch === "arm64" ? "ready" : "unavailable on this Mac, level method only") + ".",
        // Events reach the chat only from the session on screen. A parked session (the other agent's chat) is kept
        // quiet; if its process dies while parked, remember the thread so it resumes when the editor comes back.
        onEvent: (event) => {
          if (session === next) { onEvent(event); return; }
          const rec = chats.find((c) => c.session === next);
          if (rec && event.kind === "exit") { rec.session = null; rec.resumeId = next.sessionId; }
        },
      };
      const next = ui.agent.value === "codex"
        ? createCodexSession({ ...common, skillsDir })
        : createClaudeSession({ ...common, cwd: extensionRoot, readPaths: [...new Set([analysisDir(), skillsDir].flatMap((p) => { try { return [p, fs.realpathSync(p)]; } catch (_) { return [p]; } }))] }); // the dev panel is a symlink: allow the real path too
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
  if (!text) return;
  // No chat open (start screen): a message opens one with the agent used last, then waits for it to start.
  if (!activeChat) { newChat(ui.agent.value); if (restarting) await restarting; }
  if (!session || session.busy) return;
  if (buttonJob) { addMessage("assistant error", "Wait for the running job (" + buttonJob + ") to finish first."); return; }
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
    if (!frameNote) { try { await refreshFrameNote(timeline || await readSnapshot()); } catch (_) {} }
    if (frameNote) payload = "[" + frameNote + "]\n" + payload;
    const sel = await host("selectionInfo");
    const bins = await selectedBins();
    const binPath = commonParent(bins);
    log("selection: " + (sel ? sel.split("\u0003").join("; ") : "(none)") + (binPath ? " [bin path " + binPath + (bins.length > 1 ? " = parent of " + bins.join(", ") : "") + "]" : ""));
    const active = project.sequence ? "Open timeline (active sequence): \"" + project.sequence + "\". Anything about the timeline, the sequence, its frame size, cuts, silences or captions means THIS sequence; never switch to another one for those." : "No sequence is open.";
    const selNote = sel && sel.indexOf("ERR:") !== 0 ? " Selected in Premiere: " + sel.split("\u0003").join("; ") + (binPath ? ". The selected bin \"" + binPath + "\" is the scope only for footage inspection and organizing (classify_clips, project_bins, create_sequence default to it)." : ".") : "";
    // The source verdict, so "make a video" never has to guess between the Project panel and the timeline:
    // a selected bin or clips in the Project panel = build from them (a new sequence); otherwise the open sequence.
    const hasProjectSel = !!(binPath || (sel && /Project panel:/.test(sel)));
    const hasTimelineSel = !!(sel && /Timeline: \d+ clip/.test(sel));
    const source = hasProjectSel
      ? " SOURCE: the Project panel selection" + (bins.length > 1 ? " (bins " + bins.map((b) => "\"" + b.split("/").pop() + "\"").join(" and ") + ", together: folder \"" + binPath + "\"; the builder lays the talking head and keeps the b-roll bin out)" : binPath ? " (bin \"" + binPath + "\")" : "") + ". A request to make, build or create a video means a NEW sequence from these items; the open timeline is the target only when the request says 'this timeline', 'this sequence' or 'this cut'."
      : hasTimelineSel ? " SOURCE: the open sequence, the selected clips in particular. Nothing is selected in the Project panel, so there is no other source."
      : project.sequence ? " SOURCE: the open sequence. Nothing is selected anywhere else." : " SOURCE: nothing is open or selected; ask which bin or sequence in one line.";
    payload = "[" + active + selNote + source + " State the source in the first line of your reply.]\n\n" + payload;
  } catch (_) {}
  lastPayload = payload;
  const images = attachments.splice(0).map((a) => ({ mediaType: a.mediaType, data: a.data }));
  renderAttachments();
  setBusy(true);
  setStatus("Thinking…");
  try { sendTurn(payload, images); } catch (error) { addMessage("assistant error", error.message); setBusy(false); }
}

async function boot() {
  try {
    await loadHostScript();
    // Every tool result's first line goes to the log, so a pasted log explains what the model saw, not just what it called.
    // Tool calls run one at a time: Premiere's host is single-threaded, and two frame renders in flight at once
    // (the model likes to call tools in parallel) only make both slow.
    let toolQueue = Promise.resolve();
    mcp = await createMcpServer({ tools: TOOL_DEFS, onCall: (name, args, signal) => {
      // The rhythm rules monitor every edit rather than waiting to be asked: if a tool changed the timeline, the
      // cut is checked (holes on V1, flash gaps and blinks on the b-roll tracks, scroll stop on vertical) and any
      // finding is appended to that tool's own result, where the model cannot miss it.
      const run = async () => { if (signal && signal.aborted) return { text: "CLAUDE_FOR_ADOBE_ERROR:This call was abandoned before it ran; nothing ran.", isError: true }; const t0 = Date.now(); const fpBefore = timelineFingerprint(timeline); const out = await TOOLS[name](args, { signal });
        if (timelineFingerprint(timeline) !== fpBefore) { refreshLedgerSoon(); const note = require(path.join(extensionRoot, "src", "rhythm.cjs")).rhythmReport(timeline); if (note) { if (typeof out.text === "string") out.text += note; else if (Array.isArray(out.content)) out.content.push({ type: "text", text: note.trim() }); log("rhythm " + note.split("\n").filter(Boolean).length + " line(s) after " + name); } } const first = String(out.text || (out.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ") || "").split("\n").find((l) => l.trim()) || ""; log("tool " + name + " " + ((Date.now() - t0) / 1000).toFixed(1) + "s " + (out.isError ? "ERROR " : "-> ") + first.slice(0, 180)); return out; };
      const next = toolQueue.then(run, run);
      toolQueue = next.catch(() => {});
      return next;
    }, onLog: log });
    log("mcp server at " + mcp.url);
    await refreshProject();
    setInterval(() => { refreshProject().catch(() => {}); }, PROJECT_POLL_MS);
    await bindHostEvents();
    await snapshotTimeline();
    renderCopies();
    // No chat until the editor opens one (+ Claude / + Codex, a start chip, or a message): the start screen shows.
    if (activeChat) await restartSession(); else { setStatus("Ready"); setBusy(false); }
  } catch (error) {
    setStatus(error.message, "error");
    log("boot failed: " + error.message);
  }
}

// Buttons: the same scripts the tools run, with no model in the loop. Plan, confirm, apply.
// One button job at a time: they share the quiet card and the active sequence, and chat waits too.
let buttonJob = "";
function beginButtonJob(label) {
  if (session && session.busy) { addMessage("assistant error", "Wait for Claude to finish (or press Stop) first."); return false; }
  if (buttonJob) { addMessage("assistant error", "Wait for the running job (" + buttonJob + ") to finish first."); return false; }
  buttonJob = label; cancelRequested = false;
  [ui.btnCut, ui.btnRunCut, ui.btnCaptions, ui.btnMakeCaptions].forEach((b) => { b.disabled = true; });
  ui.stop.disabled = false; // Stop ends the job at its next range or step
  return true;
}
// Stop for long jobs: Cut silences, Captions and rough_cut check this between ranges and between steps.
let cancelRequested = false;
function requestCancel() { cancelRequested = true; setStatus("Stopping after the current step…"); }
function endButtonJob() { buttonJob = ""; quietCard = null; cancelRequested = false; [ui.btnCut, ui.btnRunCut, ui.btnCaptions, ui.btnMakeCaptions].forEach((b) => { b.disabled = false; }); }
// Start at the measured 24-pair batch; verified insertion failures fall back to 16 then 8.
const SILENCE_REBUILD_BATCH_SIZE = 24;
async function runCutButton(params, label) {
  if (!beginButtonJob(label)) return;
  const card = addTool(label, ""); card.open(); quietCard = card;
  const startedAt = Date.now();
  try {
    project = await readProject();
    const expectedSnapshot = await host("snapshot");
    const before = parseSnapshot(expectedSnapshot);
    if (before.error) throw new Error(before.error);
    const directory = analysisDir(), transcript = freshTimelineWords(before);
    // CEP cannot enumerate caption tracks. A saved project is not evidence about the live timeline.
    if (!await askInline("Use this rebuild only on footage without caption tracks. Caption timing cannot be checked automatically. Confirm this sequence has no captions.", "No captions — continue")) {
      card.done("Cancelled; nothing rebuilt.", true); return;
    }
    card.progress(0, 1, "finding silences ");
    const plan = await removeSilences({ ...params, dry_run: true, _planOnly: true });
    if (plan.isError) throw new Error(plan.text.replace(/^CLAUDE_FOR_ADOBE_ERROR:/, ""));
    if (timelineFingerprint(plan.snap) !== timelineFingerprint(before)) throw new Error("Timeline changed during silence detection; nothing rebuilt");
    if (!plan.cuts.length) { card.done("Nothing to cut. " + plan.summary, true); return; }
    const { rebuildSequence, mapRetainedWords } = require(path.join(extensionRoot, "src", "silence-rebuild.cjs"));
    refreshSuspended = true; clearTimeout(snapshotTimer); clearTimeout(ledgerTimer);
    const result = await rebuildSequence((action, payload) => host("rebuildSilences", action, payload),
      { cuts: plan.cuts, expectedSnapshot, batchSize: SILENCE_REBUILD_BATCH_SIZE }, () => cancelRequested,
      (completed, total, batchSize, estimate) => {
        const seconds = estimate.remainingMs == null ? null : Math.max(1, Math.ceil(estimate.remainingMs / 1000));
        const eta = seconds == null ? "Estimating…" : "~" + (seconds >= 60 ? Math.ceil(seconds / 60) + " min" : seconds + " sec") + " left to build";
        const status = estimate.phase === "checking" ? "Checking source ranges and framing…" : eta + " · batch " + batchSize;
        card.progress(completed, total, status + " "); setStatus(status);
      });
    // Keep actual read-back source ranges, not the requested cut arithmetic. Mapped words are evidence,
    // not a fresh transcript: clipped words are flagged and require listening at the corresponding seam.
    const evidence = { ...result, originalSequenceId: before.id, originalFingerprint: timelineFingerprint(before),
      requestedCuts: plan.cuts, detectorSummary: plan.summary, createdAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
      transcriptStatus: transcript ? "mapped from original; audio not reverified" : "no matching original transcript",
      words: transcript ? mapRetainedWords(transcript.words || [], result.mapping) : [] };
    const file = path.join(directory, result.name.replace(/[\/\\:]/g, "_") + ".silence-rebuild.json");
    try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(file, JSON.stringify(evidence)); }
    catch (error) { throw new Error("Rebuild verified on \"" + result.name + "\", but source mapping could not be saved: " + error.message); }
    card.done("CHECK PASS: rebuilt \"" + result.name + "\" (" + result.duration.toFixed(2) + "s). Linked audio/video and source ranges verified. Original preserved. Source mapping saved; dialogue quality has not been checked.", true);
    setStatus("Ready");
  } catch (error) { card.done("Failed: " + error.message, false); log("button job " + label + " failed: " + (error.stack || error.message)); }
  finally {
    refreshSuspended = false;
    try { project = await readProject(); timeline = await readSnapshot(); refreshLedgerSoon(); } catch (_) {}
    endButtonJob(); setStatus("Ready");
  }
}
// Captions button: render the mix, transcribe, build cues, import as a caption track. One card, no model.
// Captions button toggles the options strip under the toolbar; Make captions runs the job.
function syncStrips() { const open = [ui.cutOptions, ui.captionOptions].filter((e) => !e.hidden).length; const v = document.getElementById("view-chat"); v.classList.toggle("with-options", open >= 1); v.classList.toggle("with-options-2", open >= 2); }
function toggleCaptionOptions(show) { ui.captionOptions.hidden = show === undefined ? !ui.captionOptions.hidden : !show; syncStrips(); if (!ui.captionOptions.hidden) ui.capWords.focus(); }
function toggleCutOptions(show) { ui.cutOptions.hidden = show === undefined ? !ui.cutOptions.hidden : !show; syncStrips(); if (!ui.cutOptions.hidden) ui.minSilence.focus(); }
async function runCaptionsButton() {
  if (!beginButtonJob("Captions")) return;
  toggleCaptionOptions(false);
  const opts = captionSettings();
  const card = addTool("Captions", ""); card.open();
  try {
    if (!modelReady()) {
      // Asked before the quiet card takes over, so the Download / Not now buttons are on screen.
      const go = await askInline("Captions need the Whisper model (" + currentModel() + ", " + WHISPER_MODELS[currentModel()].mb + " MB, one time; change the model in Settings). Download it now?", "Download", "Not now");
      if (!go) { card.done("cancelled: Whisper model not installed", false); return; }
      if (!await downloadWhisperModel()) { card.done("model download failed", false); return; }
    }
    quietCard = card;
    let snap; try { snap = await readSnapshot(); if (snap.error) throw new Error(snap.error); } catch (error) { card.done(error.message, false); return; }
    if (!freshTimelineWords(snap)) {
      card.progress(0, 3, "rendering timeline audio ");
      const wav = seqFile(".mix.wav");
      fs.mkdirSync(analysisDir(), { recursive: true });
      try { fs.unlinkSync(wav); } catch (_) {}
      const preset = wavPreset();
      if (!preset) { card.done("could not find Premiere's WAV export preset under /Applications", false); return; }
      const out = await host("exportSequenceAudio", wav, preset);
      if (out.indexOf("ERR:") === 0 || !fs.existsSync(wav)) { card.done("audio render failed: " + out.replace(/^ERR:/, ""), false); return; }
      card.progress(1, 3, "transcribing (" + currentModel() + ") ");
      await transcribeRenderedTimeline(wav, snap, "en");
    }
    card.progress(2, 3, "building captions ");
    const r = await createCaptions(opts);
    card.done(r.isError ? r.text.replace(/^CLAUDE_FOR_ADOBE_ERROR:/, "") : r.text, !r.isError);
    setStatus("Ready");
  } catch (error) { card.done(error.message, false); }
  finally { endButtonJob(); }
}
ui.btnCaptions.onclick = () => toggleCaptionOptions();
ui.btnMakeCaptions.onclick = runCaptionsButton;
ui.btnCancelCaptions.onclick = () => toggleCaptionOptions(false);
// One click: the method and thresholds live in Settings (the options strip is gone; the hidden run/cancel buttons keep old references harmless).
ui.btnCut.onclick = () => runCutButton({ method: ui.cutMethod.value, min_silence_s: Number(ui.minSilence.value), pad_s: Number(ui.pad.value) }, "Cut silences " + (ui.cutMethod.value === "vad" ? "by voice" : "by level"));
["cutMethod", "minSilence", "pad"].forEach((k) => { try { const v = localStorage.getItem("cut." + k); if (v) ui[k].value = v; } catch (_) {} ui[k].onchange = () => { try { localStorage.setItem("cut." + k, ui[k].value); } catch (_) {} }; });
// The bundled voice model is Apple Silicon only: on other Macs default to the level method and say why.
if (process.arch !== "arm64") { ui.cutMethod.value = "db"; ui.cutMethod.querySelector('[value="vad"]').disabled = true; ui.cutMethod.title = "Voice detection needs an Apple Silicon Mac; using the level method."; }


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
  if (session && session.busy) { addMessage("assistant muted", "Wait for Claude to finish (or press Stop), then update."); return; }
  ui.checkUpdates.disabled = true; ui.checkUpdates.textContent = "Updating…";
  try {
    // Stop the Claude process and the local server BEFORE files change under them.
    try { if (session) { const old = session; session = null; await old.stop(); } } catch (_) {}
    try { if (mcp) mcp.close(); } catch (_) {}
    const v = await installUpdate(update, extensionRoot);
    pendingUpdate = null;
    setVersionRow("v" + v + " installed, restarting");
    ui.checkUpdates.textContent = "Restarting…"; ui.checkUpdates.className = "accent"; ui.checkUpdates.disabled = true;
    setTimeout(() => location.reload(), 400);
  } catch (error) {
    // The previous version was restored (or never touched); the session and server were stopped, so reload to come back whole.
    addMessage("assistant error", "Update failed: " + error.message + " Restarting the panel on the current version.");
    setTimeout(() => location.reload(), 1500);
  }
}
// Dev panel (a git checkout linked into the extensions folder): the same button pulls the repo instead of
// downloading a release. The repo root is where the linked panel.js really lives.
const devRepo = (() => { try { return fs.existsSync(path.join(extensionRoot, ".git")) ? path.dirname(fs.realpathSync(path.join(extensionRoot, "panel.js"))) : null; } catch (_) { return null; } })();
function gitDev(...args) {
  const r = require("node:child_process").spawnSync("git", ["-C", devRepo, ...args], { encoding: "utf8", env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + (process.env.PATH || "") } });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "git failed").trim().slice(-300));
  return r.stdout.trim();
}
async function checkDevUpdates(announce) {
  ui.checkUpdates.disabled = true; ui.checkUpdates.textContent = "Checking…";
  try {
    gitDev("fetch", "--quiet");
    const local = gitDev("rev-parse", "--short", "HEAD"), branch = gitDev("rev-parse", "--abbrev-ref", "HEAD");
    const behind = Number(gitDev("rev-list", "--count", "HEAD..@{u}")) || 0;
    pendingUpdate = behind ? { dev: true, behind } : null;
    setVersionRow("dev " + local + " (" + branch + ") · " + (behind ? behind + " commit" + (behind === 1 ? "" : "s") + " behind" : "up to date"));
    // Premiere keeps a closed panel alive, so reopening never loads new code: the button always reloads.
    ui.checkUpdates.textContent = behind ? "Pull " + behind + " commit" + (behind === 1 ? "" : "s") + " & reload" : "Reload panel";
    ui.checkUpdates.className = behind ? "accent" : "utility";
    tabSettings.textContent = behind ? "Settings · update" : "Settings"; tabSettings.classList.toggle("attention", !!behind);
    if (announce && behind) addMessage("assistant muted", behind + " new commit" + (behind === 1 ? "" : "s") + " in the repo. Use the Pull button at the bottom.");
    log("dev repo " + local + (behind ? " is " + behind + " behind" : " up to date"));
  } catch (error) { log("dev update check failed: " + error.message); ui.checkUpdates.textContent = "Reload panel"; if (announce) addMessage("assistant muted", "Could not check the repo: " + error.message); }
  ui.checkUpdates.disabled = false;
}
// Dev: pull if behind (fast-forward only), then reload the panel either way.
async function installDevPending() {
  if (session && session.busy) { addMessage("assistant muted", "Wait for " + agentName() + " to finish (or press Stop), then reload."); return; }
  ui.checkUpdates.disabled = true; ui.checkUpdates.textContent = pendingUpdate ? "Pulling…" : "Reloading…";
  try {
    try { if (session) { const old = session; session = null; await old.stop(); } } catch (_) {}
    try { if (mcp) mcp.close(); } catch (_) {}
    let changed = "";
    if (pendingUpdate) { const before = gitDev("rev-parse", "HEAD"); gitDev("pull", "--ff-only", "--quiet"); changed = gitDev("diff", "--name-only", before, "HEAD"); }
    pendingUpdate = null;
    if (/^host\//m.test(changed)) { addMessage("assistant error", "The host script changed: restart Premiere to load it. Reloading the panel now."); setTimeout(() => location.reload(), 2500); return; }
    setVersionRow("dev " + gitDev("rev-parse", "--short", "HEAD") + " reloading");
    setTimeout(() => location.reload(), 300);
  } catch (error) { addMessage("assistant error", "Pull failed: " + error.message + " Reloading the panel as it is."); setTimeout(() => location.reload(), 1500); }
}
setVersionRow(devRepo ? "dev" : "v" + currentVersion(extensionRoot));

// Dev: inventory what this Premiere build exposes (host reflection + QE lists) and copy the .kys shortcut files
// next to it, so the native-mechanism catalog is written from what is actually there, not from memory.
async function dumpSurface() {
  ui.dumpSurface.disabled = true; ui.dumpSurface.textContent = "Dumping…";
  try {
    const raw = await host("enumerateSurface");
    if (!raw || raw.indexOf("ERR:") === 0) throw new Error(raw || "empty result");
    const rows = raw.split(ROW).map((r) => { const [label, kind, names] = r.split(COL); return { label, kind, names: names ? names.split(",") : [] }; });
    const version = (rows.find((r) => r.label === "app.version") || {}).names.join(",") || "unknown";
    const dir = path.join(os.homedir(), "Library", "Application Support", "claude-for-adobe", "surface");
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, "premiere-" + version + ".json");
    fs.writeFileSync(out, JSON.stringify({ version, date: new Date().toISOString(), rows }, null, 1));
    let kys = 0;
    const docs = path.join(os.homedir(), "Documents", "Adobe", "Premiere Pro");
    for (const v of fs.existsSync(docs) ? fs.readdirSync(docs) : []) {
      const mac = path.join(docs, v);
      const walk = (d, depth) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory() && depth < 3) walk(f, depth + 1); else if (/\.kys$/i.test(e.name)) { fs.copyFileSync(f, path.join(dir, v + "-" + e.name)); kys++; } } };
      try { walk(mac, 0); } catch (_) {}
    }
    addMessage("assistant muted", "Premiere " + version + ": " + rows.length + " objects/lists written to " + out + (kys ? ", " + kys + " shortcut file(s) copied beside it" : "") + ".");
    log("surface dump " + out + " rows=" + rows.length + " kys=" + kys);
  } catch (error) { addMessage("assistant error", "Surface dump failed: " + error.message); }
  ui.dumpSurface.disabled = false; ui.dumpSurface.textContent = "Dump Premiere surface";
}
// A bug report the editor can hand to anyone: redacted at the source (src/redact.cjs), written next to the project,
// copied to the clipboard, never sent by the panel. In dev mode the same file is what the developer's session reads.
async function buildBugReport() {
  ui.bugReport.disabled = true;
  try {
    const { redact, timelineShape } = require(path.join(extensionRoot, "src", "redact.cjs"));
    const snap = timeline || (await readSnapshot().catch(() => null));
    const names = [];
    if (snap && !snap.error) snap.clips.forEach((c) => { names.push(c.name); if (c.mediaPath) names.push(path.basename(c.mediaPath)); });
    if (project.name) names.push(project.name.replace(/\.prproj$/i, ""));
    if (snap && snap.name) names.push(snap.name);
    let premiere = ""; try { premiere = await evalScript("app.version"); } catch (_) {}
    let devRev = ""; try { devRev = devRepo ? gitDev("rev-parse", "--short", "HEAD") : ""; } catch (_) {}
    const settings = ["duplicate sequence=" + ui.dupSequence.checked, "ask before scripts=" + ui.askScripts.checked, "file checkpoints=" + ui.requireCheckpoint.checked, "cut method=" + ui.cutMethod.value, "min silence=" + ui.minSilence.value, "pad=" + ui.pad.value, "whisper=" + currentModel(), "media analysis=" + mediaAnalysisState].join(", ");
    let trace = ""; try { const t = fs.readFileSync(seqFile(".extract-trace.txt"), "utf8"); trace = t.split("\n").slice(-40).join("\n"); } catch (_) {}
    const logTail = fullLog.slice(-600).join("\n");
    const body = [
      "# Claude for Adobe bug report", "",
      "Panel " + (devRepo ? "dev " + devRev : "v" + currentVersion(extensionRoot)) + " | Premiere " + premiere + " | macOS " + os.release() + " " + process.arch + " | agent " + agentName() + " model " + (ui.model.value || ""),
      "Settings: " + settings,
      "Timeline: " + timelineShape(snap), "",
      "## What happened", "", "(describe in a sentence; what you asked, what you expected, what you saw)", "",
      "## Recent log (redacted)", "", "```", redact(logTail, { names }), "```", "",
      trace ? "## Extract trace tail (redacted)\n\n```\n" + redact(trace, { names }) + "\n```\n" : "",
      "Redaction: media and clip names are stable tags, paths are shortened to root + tag, emails/urls/keys removed, transcript lines dropped.",
    ].join("\n");
    fs.mkdirSync(analysisDir(), { recursive: true });
    const out = path.join(analysisDir(), "bug-report-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".md");
    fs.writeFileSync(out, body);
    try { require("node:child_process").execSync("pbcopy", { input: body }); } catch (_) {}
    addMessage("assistant muted", "Bug report written to " + out + " and copied to the clipboard. Read it first; then paste it into a GitHub issue" + (devRepo ? ", or just say 'read the bug report' in the developer session" : "") + ".");
    log("bug report " + out + " (" + body.length + " chars)");
  } catch (error) { addMessage("assistant error", "Could not build the report: " + error.message); }
  ui.bugReport.disabled = false;
}
ui.bugReport.addEventListener("click", buildBugReport);
ui.openIssues.addEventListener("click", () => { try { window.cep.util.openURLInDefaultBrowser("https://github.com/dandjlab-cell/claude-for-adobe/issues/new"); } catch (_) { addMessage("assistant muted", "Open https://github.com/dandjlab-cell/claude-for-adobe/issues/new in your browser."); } });

async function probeLeads() {
  ui.probeLeads.disabled = true;
  try {
    const raw = await host("probeLeads");
    if (!raw || raw.indexOf("ERR:") === 0) throw new Error(raw || "empty result");
    const lines = raw.split(ROW).map((r) => r.split(COL).join(" = "));
    const dir = path.join(os.homedir(), "Library", "Application Support", "claude-for-adobe", "surface");
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, "leads-" + new Date().toISOString().slice(0, 10) + ".txt");
    fs.writeFileSync(out, lines.join("\n"));
    addMessage("assistant muted", "Leads probe (read-only):\n" + lines.join("\n") + "\n\nSaved to " + out);
  } catch (error) { addMessage("assistant error", "Probe failed: " + error.message); }
  ui.probeLeads.disabled = false;
}
if (devRepo) { ui.dumpSurface.hidden = false; ui.dumpSurface.addEventListener("click", dumpSurface); ui.probeLeads.hidden = false; ui.probeLeads.addEventListener("click", probeLeads); }
ui.checkUpdates.onclick = () => (devRepo ? installDevPending() : (pendingUpdate ? installPending() : checkUpdates(true)));
// Checked at launch, then every 20 minutes and whenever the panel gets focus again (at most every 5 minutes),
// so "up to date" never stays on screen after a release without anyone pressing the button.
const recheck = () => (devRepo ? checkDevUpdates(false) : checkUpdates(false));
setTimeout(recheck, 4000);
setInterval(() => { if (!pendingUpdate) recheck(); }, 20 * 60 * 1000);
let lastRecheck = Date.now();
window.addEventListener("focus", () => { if (!pendingUpdate && Date.now() - lastRecheck > 5 * 60 * 1000) { lastRecheck = Date.now(); recheck(); } });
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
  const bar = ui.selectionBar;
  if (!sel || sel.indexOf("ERR:") === 0) { bar.innerHTML = ""; return; }
  // Compact: the bin name and item count, then a clip count for the timeline. Details travel with the message.
  const parts = [];
  const bin = /bin "([^"]+)" \((\d+) items?\)/.exec(sel); if (bin) parts.push(bin[1] + " (" + bin[2] + ")");
  const items = sel.split("\u0003").find((p) => p.startsWith("Project panel:")); if (!bin && items) parts.push(items.replace("Project panel: ", ""));
  const tl = /Timeline: (\d+) clip/.exec(sel); if (tl) parts.push(tl[1] + " clip" + (tl[1] === "1" ? "" : "s") + " on the timeline");
  bar.innerHTML = "";
  const b = document.createElement("b"); b.textContent = "Selected ";
  bar.append(b, document.createTextNode(parts.join(" · ")));
}
function showAttachmentsRow() { ui.attachments.style.display = attachments.length ? "flex" : "none"; }
setInterval(() => { if (!(session && session.busy)) refreshSelectionLine(); }, 2000);
["mouseenter", "focus"].forEach((ev) => window.addEventListener(ev, refreshSelectionLine, true));

// Drops and pastes. Without this, dropping a file makes the embedded browser navigate to it and the panel is gone.
const attachments = []; // [{ name, mediaType, data }]
function renderAttachments() {
  ui.attachments.innerHTML = "";
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
// Tabs: one per chat (any mix of Claude and Codex chats) plus Settings. "+ Claude" / "+ Codex" open a new chat.
const tabsNav = document.getElementById("tabs"), tabSettings = document.getElementById("tab-settings");
let chatView = true;
function showView(which) {
  chatView = which === "chat";
  document.getElementById("view-chat").classList.toggle("active", chatView);
  document.getElementById("view-settings").classList.toggle("active", !chatView);
  tabSettings.classList.toggle("active", !chatView);
  renderTabs();
  if (chatView) ui.input.focus();
}
tabSettings.onclick = () => showView("settings");
// Copy the log for support: system clipboard via pbcopy (reliable inside CEP), with the browser API as fallback.
document.getElementById("copy-log").onclick = () => {
  const text = fullLog.join("\n") + (logFileOk ? "\n(full session log also at " + LOG_FILE + ")" : "");
  try { const p = require("node:child_process").spawn("pbcopy"); p.stdin.end(text); addMessage("assistant muted", "Log copied (" + text.split("\n").length + " lines)."); }
  catch (_) { try { navigator.clipboard.writeText(text); addMessage("assistant muted", "Log copied."); } catch (e) { addMessage("assistant error", "Could not copy: " + e.message); } }
};
document.getElementById("clear-log").onclick = () => { ui.log.textContent = ""; };
ui.send.onclick = sendMessage;
ui.input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
ui.stop.onclick = () => { if (buttonJob) { requestCancel(); return; } cancelRequested = true; restartSession(session && session.sessionId); };
// The whole chat on screen as markdown: your messages, the agent's, and every tool card with its result. To the
// clipboard and to a file next to the project, so it can be pasted anywhere or read by the developer session.
function chatAsMarkdown() {
  const out = [];
  for (const el of ui.messages.children) {
    if (el.classList.contains("tool")) {
      const sum = (el.querySelector("summary") || {}).textContent || "";
      const code = (el.querySelector(".code") || {}).textContent || "";
      const res = (el.querySelector(".result") || {}).textContent || "";
      out.push("**Tool** " + sum.replace(/^▸\s*/, "") + (code.trim() ? "\n```\n" + code.trim() + "\n```" : "") + (res.trim() ? "\n```\n" + res.trim() + "\n```" : ""));
    } else if (el.classList.contains("message")) {
      const who = el.classList.contains("user") ? "**You:**" : el.classList.contains("muted") ? "**Panel:**" : "**" + agentName() + ":**";
      out.push(who + " " + (el.textContent || "").trim());
    }
  }
  return "# Chat " + (activeChat ? activeChat.label : "") + " (" + new Date().toLocaleString() + ")\n\n" + out.join("\n\n") + "\n";
}
ui.copyChat.addEventListener("click", () => {
  const text = chatAsMarkdown();
  try { require("node:child_process").execSync("pbcopy", { input: text }); } catch (_) {}
  let file = "";
  try { fs.mkdirSync(analysisDir(), { recursive: true }); file = path.join(analysisDir(), "chat-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".md"); fs.writeFileSync(file, text); } catch (_) {}
  addMessage("assistant muted", "Chat copied (" + text.split("\n").length + " lines)" + (file ? " and saved to " + file : "") + ".");
});
ui.model.onchange = () => restartSession(session && session.sessionId);
// Chats are tabs. Each holds its own agent, model, messages and session; switching parks the one on screen
// (its session stays alive) and shows another. New chats open next to it. Not while a turn is running.
const chats = []; let chatSeq = 0; let activeChat = null;
let mediaAnalysisAsked = false;
function renderTabs() {
  document.body.classList.toggle("landing", !activeChat); // no chat open: the landing page, not the chat UI
  // The media-analysis question is a chat card, and the landing page hides the chat: ask when a chat first shows.
  if (activeChat && !mediaAnalysisAsked) { mediaAnalysisAsked = true; setTimeout(() => { checkMediaAnalysis().catch(() => {}); }, 800); }
  const tabs = chats.map((c) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = c.label;
    b.classList.toggle("active", chatView && c === activeChat);
    b.classList.toggle("attention", c !== activeChat && c.nodes.length > 0); // a parked chat with content
    b.title = agentName(c.agent) + " chat" + (c.model ? " · " + modelLabel(c.model) : "");
    const x = document.createElement("span"); x.className = "close"; x.textContent = "×"; x.title = "Close this chat"; x.onclick = (e) => { e.stopPropagation(); closeChat(c); };
    b.appendChild(x); b.onclick = () => showChat(c);
    return b;
  });
  tabsNav.replaceChildren(...tabs, tabSettings);
}
// Numbered by the lowest free number, so closing the last chat gives "Claude 1" again, not "Claude 9".
function makeChat(agent) {
  let num = 1; while (chats.some((c) => c.num === num)) num += 1;
  chatSeq += 1;
  const c = { id: chatSeq, num, agent, label: agentName(agent) + " " + num, nodes: [], session: null, resumeId: null, model: null };
  chats.push(c); return c;
}
const busyNow = () => !!((session && session.busy) || buttonJob);
function parkActive() {
  if (!activeChat) return;
  Object.assign(activeChat, { session, nodes: [...ui.messages.childNodes], model: ui.model.value });
  session = null; liveMessage = null; lastPayload = "";
}
function showChat(c) {
  if (c !== activeChat) {
    if (busyNow()) { addMessage("assistant error", "Wait for " + agentName() + " to finish (or press Stop) before switching chats."); showView("chat"); return; }
    parkActive();
    activeChat = c;
    ui.agent.value = c.agent; try { localStorage.setItem("agent", c.agent); } catch (_) {}
    fillModels();
    if (c.model && [...ui.model.options].some((o) => o.value === c.model)) ui.model.value = c.model;
    ui.messages.replaceChildren(...c.nodes); c.nodes = [];
    followBottom(ui.messages);
    log("chat " + c.label + " shown (session " + (c.session ? "alive" : c.resumeId ? "resume " + c.resumeId : "new") + ")");
    if (c.session) { session = c.session; c.session = null; setStatus("Ready · " + modelLabel(ui.model.value)); setBusy(false); }
    else restartSession(c.resumeId || undefined);
  }
  showView("chat");
}
function newChat(agent) {
  if (busyNow()) { addMessage("assistant error", "Wait for " + agentName() + " to finish (or press Stop) before opening a chat."); return; }
  parkActive();
  activeChat = makeChat(agent);
  ui.agent.value = agent; try { localStorage.setItem("agent", agent); } catch (_) {}
  fillModels();
  ui.messages.replaceChildren();
  allowScriptsThisSession = false;
  showView("chat");
  restartSession();
}
async function closeChat(c) {
  const s = c === activeChat ? session : c.session;
  if (s && s.busy) { addMessage("assistant error", "That chat is still working; press Stop first."); return; }
  const idx = chats.indexOf(c); if (idx < 0) return;
  chats.splice(idx, 1);
  if (c === activeChat) { activeChat = null; session = null; liveMessage = null; ui.messages.replaceChildren(); }
  if (s) { try { await s.stop(); } catch (_) {} }
  // Closing the last chat shows the start screen; a new chat opens only on + Claude / + Codex (or a message).
  const next = chats[idx - 1] || chats[0];
  if (next) showChat(next); else { setStatus("Ready"); setBusy(false); showView("chat"); }
  renderTabs();
}
ui.newChat.onclick = () => newChat(activeChat ? activeChat.agent : ui.agent.value); // same agent as the chat on screen
ui.newClaude.onclick = () => newChat("claude");
ui.newCodex.onclick = () => newChat("codex");
showView("chat");

boot();
