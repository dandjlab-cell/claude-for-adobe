// Whisper large-v3-turbo (mlx_whisper, Apple Silicon) on a clip's source audio, cached per media file,
// plus a converter to Premiere's transcript JSON so the Text panel can import it (Import transcript).
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FFMPEG = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((p) => fs.existsSync(p)) || "ffmpeg";
const MLX_WHISPER = ["/opt/homebrew/bin/mlx_whisper", path.join(os.homedir(), ".local", "bin", "mlx_whisper")].find((p) => fs.existsSync(p)) || "mlx_whisper";
const MODEL = process.env.PCX_WHISPER_MODEL || "mlx-community/whisper-large-v3-turbo";
const CACHE_DIR = path.join(os.homedir(), "Library", "Caches", "claude-for-adobe", "whisper");
const CACHE_VERSION = "v2"; // bump when decoding knobs change
// Decoding knobs (temperature 0, no
// conditioning on previous text, VAD) plus Whisper's own hallucination guards. VAD is done outside
// Whisper: the caller passes speech regions (from Premiere's waveform) as --clip-timestamps.
const KNOBS = ["--temperature", "0", "--condition-on-previous-text", "False", "--no-speech-threshold", "0.6",
  "--compression-ratio-threshold", "2.4", "--logprob-threshold", "-1.0", "--hallucination-silence-threshold", "2"];
// CEP's Node starts with PATH=/usr/bin:/bin:/usr/sbin:/sbin; mlx_whisper shells out to ffmpeg.
const ENV = { ...process.env, PATH: ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local", "bin"), process.env.PATH || ""].join(":") };

function cachePath(mediaPath) {
  const st = fs.statSync(mediaPath);
  const key = crypto.createHash("sha1").update(CACHE_VERSION + "|" + mediaPath + "|" + st.size + "|" + st.mtimeMs).digest("hex").slice(0, 12);
  return path.join(CACHE_DIR, path.basename(mediaPath) + "." + key + ".whisper.json");
}

function cachedWords(mediaPath) {
  try { const f = cachePath(mediaPath); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; } catch (_) { return null; }
}

// Whisper JSON -> flat words [{text,start,end,probability,segment}] in source seconds.
function flattenWhisper(json) {
  const out = [];
  (json.segments || []).forEach((s, si) => (s.words || []).forEach((w) => {
    const text = String(w.word || "").trim();
    if (text) out.push({ text, start: Number(w.start), end: Number(w.end), probability: Number(w.probability ?? 1), segment: si });
  }));
  return out;
}

// Runs (or reuses) a transcription of the whole media file. Returns { words, language, cached }.
// speechRegions: [{start,end}] in source seconds (a VAD result); Whisper only decodes inside them.
function clipTimestamps(speechRegions) {
  return speechRegions.map((r) => Math.max(0, r.start).toFixed(2) + "," + r.end.toFixed(2)).join(",");
}

function transcribe(mediaPath, { language = "", speechRegions = null, onLog = () => {} } = {}) {
  const cached = cachedWords(mediaPath);
  if (cached) return { ...cached, cached: true };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const wav = path.join(os.tmpdir(), "pcx-whisper-" + Date.now().toString(36) + ".wav");
  const outDir = path.join(os.tmpdir(), "pcx-whisper-out-" + Date.now().toString(36));
  try {
    require("./vad.cjs").extractWav16k(mediaPath, wav);
    onLog("whisper: transcribing " + path.basename(mediaPath));
    const args = [wav, "--model", MODEL, "--word-timestamps", "True", "--output-format", "json", "--output-dir", outDir, ...KNOBS];
    if (language) args.push("--language", language);
    if (speechRegions && speechRegions.length) args.push("--clip-timestamps", clipTimestamps(speechRegions));
    const r = spawnSync(MLX_WHISPER, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: ENV });
    if (r.status !== 0) throw new Error("mlx_whisper failed: " + (r.stderr || r.stdout || "").trim().slice(-400));
    const jsonFile = fs.existsSync(outDir) && fs.readdirSync(outDir).find((f) => f.endsWith(".json"));
    if (!jsonFile) throw new Error("mlx_whisper produced no JSON: " + (r.stdout + r.stderr).trim().slice(-300));
    const json = JSON.parse(fs.readFileSync(path.join(outDir, jsonFile), "utf8"));
    const result = { words: flattenWhisper(json), language: json.language || language || "en", model: MODEL, knobs: KNOBS.join(" "), vad: !!(speechRegions && speechRegions.length), createdAt: new Date().toISOString() };
    fs.writeFileSync(cachePath(mediaPath), JSON.stringify(result));
    return { ...result, cached: false };
  } finally {
    try { fs.unlinkSync(wav); } catch (_) {}
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) {}
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

module.exports = { CACHE_DIR, KNOBS, LANGUAGE_CODES, MLX_WHISPER, MODEL, cachedWords, clipTimestamps, flattenWhisper, premiereLanguage, toPremiereTranscript, transcribe };
