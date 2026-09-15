---
name: colour
description: Grading footage in Premiere by measurement - what the numbers mean, what order to work in, and what "correct" looks like as a number. Use whenever the job is exposure, contrast, white balance, matching two shots, or "make this look better".
---

# Colour

You cannot see. `preview_frames` gives you a small JPEG and you will misjudge colour from it — the
picture is for composition and framing, not for grade decisions. **The scopes are your eyes.** Every
judgement below is a number you can measure and a number you can drive.

## "Grade this video"

The whole job, start to finish. Say the plan in three lines, then do it; do not ask which shot to
start from unless the editor named one.

1. `sequence_overview` — the clips and their ranges.
2. **Measure every clip once**: `scopes` at each clip's midpoint, `region: "subject"`. Note which
   region actually came back (the panel says: subject, face, or whole frame because nothing was
   found) and how much of the frame it covered. Where a face is the subject, measure `face` too —
   that is the skin reading.
3. **Pick the reference.** The shot the editor named; otherwise the best-exposed face shot (face
   brightness nearest 53-66, nothing clipped or crushed); otherwise the best-exposed subject shot.
   Say which one and why in one line. Everything else is matched to it.
4. **Grade every other clip to the reference**, in timeline order, same region it was measured
   with: `grade exposure` → the reference's brightness, then `grade contrast` → its spread, then
   `grade temperature` → its warmth. Skip a step when the clip is already within 1 of the target -
   that saves renders and leaves good footage alone. A reading that backed off because it would
   have clipped stays where the tool left it; do not widen the guard.
5. **Verify**: `scopes` at each graded clip again. Report one table - clip, region, before → after
   for brightness / spread / warmth, what was set, anything that backed off or fell back to the
   whole frame - and one line on how to undo (the grade is on the working copy; Discard copy
   removes all of it).

Cost: each `grade` is 3-5 renders at about 0.7 s, so a 20-clip sequence takes a few minutes. Say
so once at the start and keep going; do not stop to ask between clips.

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

This is most of real grading, and it needs no theory at all: measure the shot you like, then drive
the other one to those numbers.

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
