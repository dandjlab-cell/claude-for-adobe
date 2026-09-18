# Brief: animate the forward guard

Build a single self-contained HTML file at `docs/anim/forward-guard.html` (relative to the repo root,
`~/DevApps/claude-for-adobe`) that ANIMATES, in code, how the colour-grading safety guard works. No
external files, no CDN, no network: one HTML file with inline CSS and vanilla JS driving a `<canvas>`. It
must open in Safari by double-click and run.

The audience is the person who commissioned the code. He is smart, not a programmer. He wants to *see* the
mechanism, not read about it. Favour animated diagrams over text. Keep prose to short captions.

## The system being explained

A Premiere Pro panel grades video automatically. For each clip it must choose values for sliders (contrast,
whites, shadows, ...). The danger is picking a value that destroys the picture: pushing so far that bright
pixels "clip" (hit pure white, 255, and lose all detail) or dark pixels "floor" (hit pure black, 0, same
loss). Both are irreversible.

### The OLD way, and why it was wrong

The code predicted what a slider would do by looking up a TABLE of percentages measured on a DIFFERENT
frame. Percentiles of one picture were used to forecast another picture's response.

This failed in production. A table had been built on a frame whose brightest pixel was only 91.4 out of 100
— a "railed" frame, already near the ceiling — so the measured gain ratios read 1.069 / 1.119 / 1.159 when
the true gains were 1.155 / 1.335 / 1.782. The solver trusted the table, asked for the top of the range,
and the real gain of 1.78 took a white point of 76.5 to 136 — far past 100, blown out. The score went from
5 good clips out of 18 to 0 out of 18. Show this failure as a concrete animated scene.

### The NEW way: the forward model

Instead of predicting a statistic from another statistic, apply the candidate move to ACTUAL PIXELS of THIS
frame and count the damage.

1. **Retain a sample.** The panel already decodes one frame of each clip to read its scopes. It now keeps
   120,000 pixels of it — about 360 KB, roughly 6% of a 1080p frame — sampled with a FRACTIONAL stride.
   Explain the fractional stride visually: an integer stride of `floor(n/want)` only covers the first 80%
   of the buffer, and pixels are stored in scanline order, so that is the TOP 80% of the picture. A bright
   highlight in the bottom fifth would never be sampled and the guard would report no clipping for a move
   that clips. This was a real bug, caught by a test frame with its bright tail at the end. Show a picture
   with the bottom fifth greyed out under the broken stride, then evenly sampled under the fixed one.

2. **Replay the state.** By the time a slider is chosen, other moves have already been written to the clip
   (white balance; per-channel curve bottom points). So the retained pixels are put through those same
   moves first, so the guard is looking at the picture the slider will actually act on.

3. **Judge the candidate.** Apply the candidate slider value to those pixels, then count what fraction of
   each channel landed on 0 or on 255.

4. **Back off if needed.** If the damage exceeds what the untouched source already had, pull the value 20%
   of the way back toward where it started and test again — up to 12 times, or until the move is within 1
   unit of not moving at all, in which case it is abandoned. When a value is held back, the row prints
   `held by the pixels: ...`.

The whole judgement takes about 6 milliseconds and needs no render.

### The honest limit — this matters, give it its own scene

The guard is only fed pixels when the already-written state can be reproduced FAITHFULLY. Only moves whose
pixel behaviour was actually measured by sweep are replayed:

- temperature and tint (per-channel gains)
- the per-channel curve bottom points, bare two-point curves matching the measured line exactly:
  `out = (v - 100x) / (1 - x)`

If something else was written — a colour-wheel pad, the Shadows wheel luma (no measured pixel form), or an
ANCHORED master curve (a 3- or 4-point curve, where only the unanchored 2-point case was measured) — the
guard is handed NOTHING rather than an approximation. The stated reason, which should appear as a caption:
*a guard fed a picture the frame is not in would refuse safe moves and pass unsafe ones, which is worse
than no guard.*

## The actual code (be faithful to it)

The sampler:

```js
function sample(rgb, want = 120000) {
  const n = Math.floor(rgb.length / 3);
  if (n <= want) return rgb;
  const step = n / want;              // FRACTIONAL, not floor()
  const out = Buffer.allocUnsafe(want * 3);
  for (let i = 0, j = 0; i < want; i++, j += 3) {
    const k = Math.floor(i * step) * 3;
    out[j] = rgb[k]; out[j+1] = rgb[k+1]; out[j+2] = rgb[k+2];
  }
  return out;
}
```

Applying an op, with the clamp where Premiere puts it — per channel:

```js
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
for (let i = 0; i < rgb.length; i += 3) {
  out[i]   = clamp255(Math.round(f(rgb[i],   "red")));
  out[i+1] = clamp255(Math.round(f(rgb[i+1], "green")));
  out[i+2] = clamp255(Math.round(f(rgb[i+2], "blue")));
}
```

Counting the damage:

```js
function damageOf(rgbSample, op, amount, extra) {
  if (!rgbSample || !OPS[op]) return null;   // null = UNKNOWN, not SAFE
  const m = measure(apply(rgbSample, op, amount, extra));
  return {
    clipped: Math.max(m.clipped.red, m.clipped.green, m.clipped.blue),
    floored: Math.max(m.floor.red,   m.floor.green,   m.floor.blue),
  };
}
```

The back-off loop:

```js
let v = value, tries = 0, caught = null;
for (;;) {
  const d = FORWARD.damageOf(buf, g.param, v);
  if (!d) break;
  if (d.clipped <= allow.clipped && d.floored <= allow.crushed) break;
  caught = d;
  if (Math.abs(v - from) <= 1 || tries++ >= 12) { v = from; break; }
  v = from + (v - from) * 0.8;          // 20% back toward where it started
}
```

The gate that decides whether pixels are handed over at all:

```js
const guardPixelsFor = () => {
  if (!pixels || padMoves.length || lift) return null;
  const anchored = lev && lev.anchor !== null
    && lev.anchor > lev.blackIn + 0.05 && lev.anchor < 0.95;
  if (anchored) return null;
  const ops = [];
  if (temp && temp.value !== tempFrom) ops.push(["temperature", temp.value]);
  if (temp && temp.tint !== null && temp.tint !== tintFrom) ops.push(["tint", temp.tint]);
  for (const ch of ["red", "green", "blue"]) {
    const mv = bot && bot.toes ? bot.toes[ch] : null;
    if (mv && mv.toe  > 0.002) ops.push(["channelToe",  mv.toe,  ch]);
    else if (mv && mv.lift > 0.002) ops.push(["channelLift", mv.lift, ch]);
  }
  if (lev && lev.blackIn > 0.002) ops.push(["masterToe", lev.blackIn]);
  try { let b = pixels; for (const [op, a, extra] of ops) b = applyRgb(b, op, a, extra); return b; }
  catch (_) { return null; }
};
```

## What the animation must contain

Scenes, advanced by Next/Back buttons AND playable straight through, with a visible scene counter:

1. **The problem.** A frame, a slider being pushed, highlights blowing out. A histogram piling up against
   the right wall.
2. **The old way fails.** Two different frames side by side. The table is measured on frame A (railed, max
   91.4), then applied to frame B. Animate the wrong prediction and the 76.5 → 136 overshoot. End on the
   score 5/18 → 0/18.
3. **Retaining the sample.** A grid of pixels, 120k of them picked out of the frame. Include the
   fractional-vs-integer stride comparison described above.
4. **Replaying the state.** The sample passing through white balance and the channel curves, arriving at
   the picture the slider will act on.
5. **Judging a candidate.** Apply the value to the pixels, animate individual pixels hitting the 0 and 255
   walls, and count them into a running percentage.
6. **Backing off.** The 20% retreat loop, iterating visibly, until the damage falls under the allowance.
   Print the resulting `held by the pixels:` line.
7. **When the guard sits out.** The gate returning null, with the reason caption.

Genuinely ANIMATE — real `requestAnimationFrame` motion on a canvas with pixels/histograms/curves moving.
Do not produce a static diagram with fade transitions. Simulate a small synthetic image in JS (a gradient
plus a bright highlight region and a dark region) and run the REAL arithmetic on it — the actual clamp, the
actual counting, the actual 0.8 back-off loop — so the numbers on screen are computed, not hard-coded. That
is the whole point of the piece being explained.

Dark background, restrained typography, colour used to mean something (red = clipped, blue = floored).
Label axes. Aim for something a person watches once and understands.

Write the file, then reply with a one-paragraph summary of what you built and any place you had to guess.
