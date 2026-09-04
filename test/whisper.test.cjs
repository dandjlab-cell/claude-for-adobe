const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { KNOBS, MODELS, currentModel, setModel, premiereLanguage, toPremiereTranscript, wordsFromWhisperCpp } = require("../src/whisper.cjs");
// Adobe's transcript JSON schema is not redistributed; fetch it once into a gitignored cache, skip offline.
const specPath = path.join(__dirname, "..", ".cache", "transcript_format_spec.json");
let spec = null;
try { spec = JSON.parse(fs.readFileSync(specPath, "utf8")); } catch (_) {
  try { const { execFileSync } = require("node:child_process"); fs.mkdirSync(path.dirname(specPath), { recursive: true }); execFileSync("curl", ["-fsSL", "--max-time", "10", "https://schemas.adobe.com/transcript/v1.0.0", "-o", specPath]); spec = JSON.parse(fs.readFileSync(specPath, "utf8")); } catch (__) { spec = null; }
}

// Minimal validator for Adobe's spec: required keys, no extra keys, enums, numeric bounds, uuid.
function validate(obj, def, where, errors) {
  const props = def.properties || {};
  (def.required || []).forEach((k) => { if (!(k in obj)) errors.push(where + " missing " + k); });
  Object.keys(obj).forEach((k) => {
    if (!(k in props)) { if (def.additionalProperties === false) errors.push(where + " extra key " + k); return; }
    const p = props[k], v = obj[k];
    const ref = p.$ref ? spec.definitions[p.$ref.split("/").pop()] : null;
    if (ref && ref.enum && !ref.enum.includes(v)) errors.push(where + "." + k + " not in enum: " + v);
    if (p.type === "number" && (typeof v !== "number" || (p.minimum !== undefined && v < p.minimum) || (p.maximum !== undefined && v > p.maximum))) errors.push(where + "." + k + " bad number " + v);
    if (p.type === "boolean" && typeof v !== "boolean") errors.push(where + "." + k + " not boolean");
    if (p.type === "string" && typeof v !== "string") errors.push(where + "." + k + " not string");
    if (p.format === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) errors.push(where + "." + k + " not uuid v4");
    if (p.enum && !p.enum.includes(v)) errors.push(where + "." + k + " not in enum: " + v);
    if (p.type === "array") {
      if (p.minItems && v.length < p.minItems) errors.push(where + "." + k + " too few items");
      const itemDef = p.items && p.items.$ref ? spec.definitions[p.items.$ref.split("/").pop()] : p.items;
      v.forEach((it, i) => { if (itemDef && itemDef.type === "object") validate(it, itemDef, where + "." + k + "[" + i + "]", errors); else if (itemDef && itemDef.enum && !itemDef.enum.includes(it)) errors.push(where + "." + k + "[" + i + "] not in enum"); });
    }
  });
}
const { pausesFromWords } = require("../src/transcript.cjs");

const whisperJson = { language: "en", segments: [
  { words: [{ word: " Hello", start: 0.2, end: 0.5, probability: 0.9 }, { word: " there.", start: 0.6, end: 1.0, probability: 0.8 }] },
  { words: [{ word: " Next", start: 2.5, end: 2.9, probability: 0.95 }, { word: "  ", start: 2.9, end: 3.0 }] },
] };

test("wordsFromWhisperCpp: one word per segment, sentence and gap boundaries, fill rule", () => {
  const json = { transcription: [
    { text: " Hi", offsets: { from: 500, to: 700 } }, { text: " there.", offsets: { from: 700, to: 1000 } },
    { text: " Next", offsets: { from: 1200, to: 1400 } }, { text: "  ", offsets: { from: 1400, to: 1500 } },
    { text: " later", offsets: { from: 3000, to: 3200 } }, { text: " glitch", offsets: { from: 3100, to: 3000 } },
  ] };
  const w = wordsFromWhisperCpp(json);
  assert.deepEqual(w.map((x) => [x.text, x.start, x.end, x.segment]), [["Hi", 0.5, 0.7, 0], ["there.", 0.7, 1.0, 0], ["Next", 1.2, 1.4, 1], ["later", 3.0, 3.2, 2], ["glitch", 3.2, 3.2, 2]]);
});

test("toPremiereTranscript matches Premiere's export shape", () => {
  const t = toPremiereTranscript(wordsFromWhisperCpp({ transcription: [{ text: " Hello", offsets: { from: 0, to: 400 } }, { text: " world.", offsets: { from: 450, to: 900 } }] }), "en");
  assert.equal(t.language, "en-us");
  assert.equal(t.speakers.length, 1);
  assert.match(t.speakers[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(t.segments.length, 1);
  const s = t.segments[0];
  assert.deepEqual(Object.keys(s).sort(), ["duration", "language", "speaker", "start", "words"]);
  assert.equal(s.speaker, t.speakers[0].id);
  assert.equal(s.start, 0); assert.equal(s.duration, 0.9);
  assert.deepEqual(Object.keys(s.words[0]).sort(), ["confidence", "duration", "eos", "start", "tags", "text", "type"]);
  assert.equal(s.words[0].eos, false); assert.equal(s.words[1].eos, true); assert.equal(s.words[0].type, "word");
  assert.equal(s.words[0].confidence, 1);
});

test("decoding knobs: deterministic, no fallback, no context carry-over", () => {
  assert.ok(KNOBS.includes("-nf") && KNOBS[KNOBS.indexOf("-tp") + 1] === "0" && KNOBS[KNOBS.indexOf("-mc") + 1] === "0");
  assert.equal(currentModel(), "large-v3-turbo"); assert.equal(setModel("small"), "small"); assert.equal(setModel("nope"), "small"); setModel("large-v3-turbo"); assert.equal(Object.keys(MODELS).length, 3);
});

test("generated transcript validates against Adobe's transcript format spec", { skip: !spec && "schema not reachable" }, () => {
  const t = toPremiereTranscript(wordsFromWhisperCpp({ transcription: [{ text: " Hello", offsets: { from: 0, to: 400 } }, { text: " world.", offsets: { from: 450, to: 900 } }] }), "en");
  const errors = [];
  validate(t, spec, "root", errors);
  assert.deepEqual(errors, []);
  assert.equal(premiereLanguage("en"), "en-us"); assert.equal(premiereLanguage("pt"), "pt-br"); assert.equal(premiereLanguage("de-de"), "de-de"); assert.equal(premiereLanguage("xx"), "??-??");
});
