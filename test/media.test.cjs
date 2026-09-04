const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeLevels, formatLevels, formatPeakWindows } = require("../src/media.cjs");

test("analyzeLevels finds tone and silence windows", () => {
  const rate = 8000;
  const samples = new Int16Array(rate * 3); // 1s tone, 1s silence, 1s tone
  for (let i = 0; i < rate; i++) samples[i] = samples[i + 2 * rate] = Math.round(Math.sin(i / 10) * 16000);
  const a = analyzeLevels(samples, rate, 100, 10);
  assert.equal(a.windows.length, 30);
  assert.ok(a.windows[0].rmsDb > -10 && a.windows[0].rmsDb < 0);
  assert.equal(a.silences.length, 1);
  assert.ok(Math.abs(a.silences[0].start - 11) < 0.11 && Math.abs(a.silences[0].end - 12) < 0.11, JSON.stringify(a.silences));
  const text = formatLevels(a, "clip");
  assert.match(text, /30 windows of 100 ms/);
  assert.match(text, /silences .*11\.00-12\.00s/);
});

test("analyzeLevels caps window count on long input", () => {
  const a = analyzeLevels(new Int16Array(8000 * 600), 8000, 10);
  assert.ok(a.windows.length <= 401);
  assert.equal(a.silences.length, 1);
});

test("formatPeakWindows adapts threshold to the noise floor and merges tiny gaps", () => {
  // 40 windows: room tone at -50 dB, speech at -10 dB from 1.0-2.0s with one 100 ms dip at 1.5s, tone again after
  const w = [];
  for (let i = 0; i < 40; i++) { const t = i * 0.1; const speech = t >= 1 && t < 2 && Math.abs(t - 1.5) > 0.01; w.push({ t, peak: speech ? 0.3 : 0.003 }); }
  w[15].peak = 0.002; // dip inside speech, shorter than MIN_SILENCE_S -> dropped
  const text = formatPeakWindows(w, 0.1, "clip");
  assert.match(text, /below -42 dBFS peak/);
  assert.match(text, /silences .*: 0\.00-1\.00s, 2\.00-4\.00s$/);
});
