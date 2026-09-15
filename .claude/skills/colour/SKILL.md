---
name: colour
description: Use when the editor asks to grade, colour correct, color correct, fix the exposure, contrast or white balance, match shots, or make footage look better, cinematic or consistent - including "grade this video". The procedure, which tool at each step, what the numbers mean, and what correct is as a number.
---

# Colour

You cannot see. `preview_frames` gives you a small JPEG and you will misjudge colour from it — the
picture is for composition and framing, not for grade decisions. **The scopes are your eyes.** Every
judgement below is a number you can measure and a number you can drive.

## "Grade this video"

Balance every shot from its own scopes, in one go each. Say the plan in three lines, then do it; do
not ask which shot to start from unless the editor named one.

1. `sequence_overview` — the clips. Grade the footage on V1 at each clip's midpoint; graphics, titles
   and generated layers are not footage and are left alone. Do not solo tracks to find out what
   renders: measure the composite.
2. **Read every shot once**: `scopes` at each midpoint, `region: "subject"` (and `face` where a face
   is the subject). One render per shot.
3. **Set goals per shot from what its parade and waveform say** — a colourist's order, white balance
   first:
   - **White balance** — the parade's three whites must line up. `whitesRB` (blue minus red at the
     whites) → **0** with `temperature`. Read it off the parade: R p99 56 / B p99 64 is blue whites,
     and the fix is a modest warm move, not a hunt. (`tint` → `whitesG` 0 once it is calibrated; until
     then leave tint alone unless the whites are clearly green or magenta.)
   - **Exposure** — put the subject where it belongs: a face at brightness **53-66**; hands or a
     product **40-55**. Do NOT force every shot's subject to one number - a dark bottle and a bright
     hand are different things, and matching them is what produced +3 stops. A shot already inside
     its band is left alone.
   - **Contrast** — only if the spread is flat (< 55) or harsh (> 85); target **65-75**. Otherwise
     leave it.
   - Keep the white point (`luma p99`) at or under **92** and the black point (`luma p1`) at or over
     **4**; if a goal would push past those, lower the goal, do not fight the guard.
4. **One `grade_shot` per clip** with those goals in that order (temperature, exposure, contrast).
   Two renders per shot: one to read, one to confirm. Its report shows before → predicted → confirmed
   per knob; the residual is stated, not chased.
5. **Report** one table — clip, region, whitesRB / brightness / spread before → after, knobs set,
   anything skipped or that backed off — and one line on undo (the grade is on the working copy;
   Discard copy removes all of it). Then, only for shots of the same kind (two faces, two shots of the
   same table) that still differ by more than 3 in brightness, one `grade exposure` to match them.

Cost: two renders per shot, about 1.5 s; a 20-clip sequence is under a minute. Say so once and keep
going; do not stop between clips.

## Measure the subject, not the frame

`scopes` and `grade` both take a `region`:

- `subject` — Vision's foreground mask: whatever the subject is (a face, hands, a product, a dog),
  measured to the pixel. **The default for any shot that has a subject.**
- `face` — the biggest face box only: skin without hair and clothes. The right region for skin
  tone and white balance when a face is in shot.
- `frame` — the whole picture. Right for landscapes, graphics, and matching two shots of the
  same scene.

This is not a detail. A warm wall, a sunset window or a red jacket drags the frame's average cast
far from the subject, and "neutralising the frame" then drains the skin grey. Hands are skin too:
on how-to footage, `subject` puts the numbers on the hands.

The panel says which region it actually measured and the share of the frame it covered. If it
fell back to the whole frame because nothing was found, treat the cast reading with suspicion.

## The scale

Everything is 0-100 (the 8-bit frame read full-range as SDR Rec.709), except cast, which is -50..50.

| Reading | What it is |
|---|---|
| `luma median` | overall brightness of what you measured |
| `luma p1` / `p99` | where the shadows and highlights sit; the honest ends, ignoring stray pixels |
| `luma min` / `max` | the actual ends |
| `spread` (p99 − p1) | contrast |
| `R/G/B means` | the parade; their differences are the cast |
| `cast Cr` / `Cb` | warm↔cyan / blue↔yellow. 0 is neutral |
| `saturation median` | colourfulness |
| `clipped %` | pixels pinned at 255. **Unrecoverable** |
| `crushed %` | pixels at the floor. **Unrecoverable** |

Broadcast IRE converts to this scale as `16 + IRE × 2.19` in 8-bit, then `/2.55`. So IRE 70 ≈ **66**
here and IRE 55 ≈ **53**. A normally exposed face lands in that 53-66 band; that is the one absolute
target worth remembering.

## Order of operations

Work in this order and re-measure after each step — the controls interact, which is why `grade`
measures rather than predicts. (Live example: after exposure was raised, contrast's spread had
already moved from 74 to 79.6 before contrast was touched at all.)

1. **Exposure** — put the subject in range. Face in 53-66; a landscape's median around 45-55.
2. **Contrast / whites / blacks** — set the ends. Spread 60-80 is normal; under 55 reads flat and
   over 85 is aggressive. Watch `clipped` and `crushed`: 0% is the goal, and `grade` refuses to pass
   0.5% clipped or 1% crushed by default. Getting a target by blowing highlights is not a win.
3. **White balance** — temperature then tint, on the FACE. Neutral is cast 0, but **skin is not
   neutral**: a healthy face reads warm. Driving a face's warmth to 0 makes a corpse. Drive a grey
   card or a white wall to 0; drive a face to a warm target. The right warm number for skin on this
   scale has NOT been measured yet — calibrate it by measuring a face the editor agrees looks right
   (`scopes`, region face) and use that Cr as the target, rather than a figure from memory. Until
   then, matching to a reference shot is safer than an absolute warmth target.
4. **Saturation / vibrance** — last, and gently.

## Matching two shots

For two shots of the SAME thing (the same face, the same table), measure the one you like and drive
the other to its numbers - no theory needed. Never match different subjects to each other: that is
how a dark object gets pushed three stops to look like a bright one.

```
scopes at the reference time, region subject (or face)
scopes at the target time, the same region
grade exposure   → the reference's brightness
grade contrast   → the reference's spread
grade temperature→ the reference's warmth
```

Match brightness and warmth before anything else; a 2-point brightness difference across a cut is
visible, a 2-point saturation difference is not.

## What to distrust

- **A cast reading from a whole frame with a person in it.** Measure the face.
- **Any target that needed clipping.** The tool backs off and says so; do not widen the guard to
  "succeed".
- **`max` as a steering statistic on exposure.** It saturates near 100 and stops responding, so the
  answer becomes meaningless. `grade` flags this as low confidence — believe it, and steer the
  median instead.
- **Parameters marked untested in the result.** Exposure, contrast and temperature were swept live;
  the rest have a steering statistic inferred from what the control is for. If a grade on one of
  those does nothing, the statistic is probably wrong, not the parameter.
- **Your own eye on a JPEG.** Report what you measured.

## What is not reachable

Curves, colour wheels and HSL secondaries are packed values, not numbers, and `grade` cannot drive
them. Basic Correction, Creative's adjustments and Vignette are plain scalars and can be driven.
Full map: `premiere-scripting/lumetri.md`.

The grade is always the editor's to keep or undo; say what you changed and how many Cmd+Z steps it
takes to back out.
