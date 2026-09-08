// Real bundle check: node scripts/check-whisper-metal.cjs <16k mono speech.wav> [model.bin]
// Removing Metal, breaking its relocatable linkage, or returning no words must fail.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const W = require("../src/whisper.cjs");
const { parseSegments } = require("../src/vad.cjs");
assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
assert.ok(process.argv[2], "provide a short 16k mono WAV containing speech");
const wav = path.resolve(process.argv[2]);
const model = path.resolve(process.argv[3] || W.modelPath());
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-metal-"));
try {
  fs.cpSync(path.join(__dirname, "..", "bin"), path.join(stage, "bin"), { recursive: true });
  const help = spawnSync(path.join(stage, "bin", "whisper-cli"), ["--help"], {
    cwd: stage, env: { PATH: "/usr/bin:/bin", HOME: os.homedir() }, encoding: "utf8", timeout: 120000,
  });
  assert.equal(help.status, 0, String(help.error || help.stderr));
  assert.match(help.stderr, /loaded MTL backend/, "copied bundle cannot load its Metal backend");
  for (const cpu of [false, true]) {
    const out = path.join(stage, cpu ? "cpu" : "metal");
    const start = Date.now();
    const r = spawnSync(path.join(stage, "bin", "whisper-cli"), ["-m", model, "-f", wav,
      "-l", "en", "-t", "1", "-ml", "1", "-sow", "-oj", "-of", out, ...W.KNOBS,
      ...(cpu ? ["-ng"] : [])], {
      cwd: stage, env: { PATH: "/usr/bin:/bin", HOME: os.homedir() },
      // CPU Turbo is slow; allow five minutes for the short speech fixture.
      encoding: "utf8", timeout: 300000, maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(r.status, 0, String(r.error || r.stderr));
    if (!cpu) assert.match(r.stderr, /using (?:Metal|MTL\d*) backend/, "bundle did not select Metal:\n" + r.stderr);
    else assert.doesNotMatch(r.stderr, /using (?:Metal|MTL\d*) backend/, "-ng must use CPU");
    const words = W.wordsFromWhisperCpp(JSON.parse(fs.readFileSync(out + ".json", "utf8")));
    assert.ok(words.length > 0, "speech must produce words");
    assert.ok(words.every((w, i) => w.end >= w.start && (!i || w.start >= words[i - 1].end)));
    console.log(JSON.stringify({ backend: cpu ? "CPU" : "Metal", seconds: (Date.now() - start) / 1000,
      words: words.length, text: words.map((w) => w.text).join(" ") }));
  }
  const vad = spawnSync(path.join(stage, "bin", "whisper-vad-speech-segments"), ["-vm",
    path.join(__dirname, "..", "assets", "silero-vad-v6.2.0-ggml.bin"), "-f", wav], {
    cwd: stage, env: { PATH: "/usr/bin:/bin", HOME: os.homedir() }, encoding: "utf8", timeout: 120000,
  });
  assert.equal(vad.status, 0, String(vad.error || vad.stderr));
  assert.ok(parseSegments(vad.stdout).length > 0, "adding Metal must not silence the VAD output");
  console.log("VAD: speech detected");
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
