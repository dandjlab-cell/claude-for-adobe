// Whisper large-v3-turbo through the bundled whisper.cpp (bin/whisper-cli), Apple Silicon, fully local.
// The model (~570 MB) is downloaded on first use into the user's cache, with progress, and reused after that.
// Recipe mirrors VO Studio's: 16 kHz mono, VAD in front (bundled Silero) so silence never becomes words,
// temperature 0 with no fallback, no context carried between segments. Word timing comes from whisper.cpp's
// per-token timestamps (one word per segment), roughly tens of milliseconds.
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");

const BIN = process.env.PCX_WHISPER_BIN || path.join(__dirname, "..", "bin", "whisper-cli");
const MODEL_NAME = process.env.PCX_WHISPER_MODEL || "ggml-large-v3-turbo-q5_0.bin";
const MODEL = MODEL_NAME.replace(/^ggml-|\.bin$/g, "");
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/" + MODEL_NAME;
const MODEL_DIR = path.join(os.homedir(), "Library", "Caches", "claude-for-adobe", "models");
const MODEL_PATH = path.join(MODEL_DIR, MODEL_NAME);
const VAD_MODEL = path.join(__dirname, "..", "assets", "silero-vad-v6.2.0-ggml.bin");
const CACHE_DIR = path.join(os.homedir(), "Library", "Caches", "claude-for-adobe", "whisper");
const CACHE_VERSION = "v3-whispercpp"; // bump when decoding knobs change
// Decoding knobs: deterministic, no fallback sweep, no context carry-over, Whisper's own guards.
const KNOBS = ["-tp", "0", "-nf", "-mc", "0", "-nth", "0.6", "-et", "2.4", "-lpt", "-1.0", "-bo", "5"];

function modelReady() { return fs.existsSync(MODEL_PATH); }
function available() { return fs.existsSync(BIN) && process.arch === "arm64"; }

// Downloads the model once. onProgress(receivedBytes, totalBytes). Uses the page's fetch when present.
async function ensureModel(onProgress = () => {}) {
  if (modelReady()) return MODEL_PATH;
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const part = MODEL_PATH + ".part";
  if (typeof fetch === "function") {
    const res = await fetch(MODEL_URL, { redirect: "follow" });
    if (!res.ok) throw new Error("model download failed: HTTP " + res.status);
    const total = Number(res.headers.get("content-length")) || 0;
    const out = fs.openSync(part, "w");
    const reader = res.body.getReader();
    let got = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; fs.writeSync(out, value); got += value.length; onProgress(got, total); }
    } finally { fs.closeSync(out); }
  } else {
    await new Promise((resolve, reject) => {
      const go = (url, hops) => https.get(url, { headers: { "User-Agent": "claude-for-adobe-panel" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); return go(res.headers.location, hops + 1); }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error("model download failed: HTTP " + res.statusCode)); }
        const total = Number(res.headers["content-length"]) || 0; let got = 0;
        const out = fs.createWriteStream(part);
        res.on("data", (c) => { got += c.length; onProgress(got, total); });
        res.pipe(out); out.on("finish", resolve); out.on("error", reject);
      }).on("error", reject);
      go(MODEL_URL, 0);
    });
  }
  if (fs.statSync(part).size < 100 * 1024 * 1024) { fs.unlinkSync(part); throw new Error("model download was incomplete"); }
  fs.renameSync(part, MODEL_PATH);
  return MODEL_PATH;
}

function cachePath(mediaPath) {
  const st = fs.statSync(mediaPath);
  const key = crypto.createHash("sha1").update(CACHE_VERSION + "|" + mediaPath + "|" + st.size + "|" + st.mtimeMs).digest("hex").slice(0, 12);
  return path.join(CACHE_DIR, path.basename(mediaPath) + "." + key + ".whisper.json");
}

function cachedWords(mediaPath) {
  try { const f = cachePath(mediaPath); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; } catch (_) { return null; }
}

// whisper.cpp JSON (one word per segment via -ml 1 -sow) -> [{text,start,end,probability,segment}] in seconds.
// Segments (for Premiere's transcript shape) restart after sentence punctuation or a gap over 1 s.
function wordsFromWhisperCpp(json) {
  const out = [];
  let seg = 0, lastEnd = null, lastText = "";
  (json.transcription || []).forEach((t) => {
    const text = String(t.text || "").trim();
    if (!text) return;
    const start = Number(t.offsets.from) / 1000, end = Number(t.offsets.to) / 1000;
    if (lastEnd !== null && (start - lastEnd > 1 || /[.!?]$/.test(lastText))) seg++;
    out.push({ text, start, end, probability: 1, segment: seg });
    lastEnd = end; lastText = text;
  });
  // VO Studio's fill rule: no word may end before it starts or start before the previous one ends.
  for (let i = 0; i < out.length; i++) { if (i && out[i].start < out[i - 1].end) out[i].start = out[i - 1].end; if (out[i].end < out[i].start) out[i].end = out[i].start; }
  return out;
}

// Transcribes a whole media file (or reuses the cache). Returns { words, language, model, cached }.
async function transcribe(mediaPath, { language = "en", onLog = () => {}, onProgress = () => {} } = {}) {
  const cached = cachedWords(mediaPath);
  if (cached) return { ...cached, cached: true };
  if (!available()) throw new Error("Whisper needs an Apple Silicon Mac (bundled whisper.cpp)");
  await ensureModel(onProgress);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const wav = path.join(os.tmpdir(), "cfa-whisper-" + Date.now().toString(36) + ".wav");
  const outBase = path.join(os.tmpdir(), "cfa-whisper-out-" + Date.now().toString(36));
  try {
    require("./vad.cjs").extractWav16k(mediaPath, wav);
    onLog("whisper: transcribing " + path.basename(mediaPath));
    const args = ["-m", MODEL_PATH, "-f", wav, "-l", language || "auto", "-t", String(Math.max(2, Math.min(8, os.cpus().length - 2))),
      "--vad", "-vm", VAD_MODEL, "-vt", "0.5", "-ml", "1", "-sow", "-oj", "-of", outBase, "-np", ...KNOBS];
    const r = spawnSync(BIN, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error("whisper failed: " + (r.stderr || r.stdout || "").trim().slice(-400));
    const json = JSON.parse(fs.readFileSync(outBase + ".json", "utf8"));
    const result = { words: wordsFromWhisperCpp(json), language: (json.result && json.result.language) || language || "en", model: MODEL, knobs: KNOBS.join(" "), vad: true, createdAt: new Date().toISOString() };
    fs.writeFileSync(cachePath(mediaPath), JSON.stringify(result));
    return { ...result, cached: false };
  } finally {
    try { fs.unlinkSync(wav); } catch (_) {}
    try { fs.unlinkSync(outBase + ".json"); } catch (_) {}
  }
}

// Adobe's transcript format spec (schemas.adobe.com/transcript/v1.0.0)
// only accepts these language codes; anything else must be "??-??".
const LANGUAGE_CODES = ["en-us", "en-gb", "zh-hk", "cmn-hans", "cmn-hant", "es-es", "de-de", "fr-fr", "ja-jp", "pt-pt", "pt-br", "ko-kr", "it-it", "ru-ru", "hi-in", "nb-no", "sv-se", "nl-nl", "da-dk", "id-id", "th-th", "vi-vn", "ms-my", "tr-tr", "pl-pl", "fil-ph", "te-in", "ml-in", "pa-in"];
const ISO_TO_PREMIERE = { en: "en-us", zh: "cmn-hans", yue: "zh-hk", es: "es-es", de: "de-de", fr: "fr-fr", ja: "ja-jp", pt: "pt-br", ko: "ko-kr", it: "it-it", ru: "ru-ru", hi: "hi-in", no: "nb-no", nb: "nb-no", nn: "nb-no", sv: "sv-se", nl: "nl-nl", da: "da-dk", id: "id-id", th: "th-th", vi: "vi-vn", ms: "ms-my", tr: "tr-tr", pl: "pl-pl", tl: "fil-ph", te: "te-in", ml: "ml-in", pa: "pa-in" };
function premiereLanguage(code) {
  const c = String(code || "").toLowerCase();
  if (LANGUAGE_CODES.includes(c)) return c;
  return ISO_TO_PREMIERE[c.split("-")[0]] || "??-??";
}

// Premiere's transcript JSON per Adobe's spec (what Transcript.importFromJSON and Import transcript read).
function toPremiereTranscript(words, language = "en") {
  const lang = premiereLanguage(language);
  const speakerId = crypto.randomUUID();
  const segments = [];
  words.forEach((w) => {
    let seg = segments[segments.length - 1];
    if (!seg || seg._index !== w.segment) { seg = { _index: w.segment, start: w.start, duration: 0, language: lang, speaker: speakerId, words: [] }; segments.push(seg); }
    seg.words.push({ confidence: Math.max(0, Math.min(1, w.probability)), duration: Math.max(0, w.end - w.start), eos: /[.!?]["')\]]*$/.test(w.text), start: w.start, tags: [], text: w.text, type: "word" });
    seg.duration = Math.max(seg.duration, w.end - seg.start);
  });
  segments.forEach((s) => { delete s._index; });
  return { language: lang, segments, speakers: [{ id: speakerId, name: "Speaker 1" }] };
}

module.exports = { BIN, CACHE_DIR, KNOBS, LANGUAGE_CODES, MODEL, MODEL_PATH, MODEL_URL, available, cachedWords, ensureModel, modelReady, premiereLanguage, toPremiereTranscript, transcribe, wordsFromWhisperCpp };
