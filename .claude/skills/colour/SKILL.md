---
name: colour
description: Use when the editor asks to grade, colour correct, color correct, fix the exposure, contrast or white balance, match shots, or make footage look better, cinematic or consistent - including "grade this video". The procedure, which tool at each step, what the numbers mean, and what correct is as a number.
---

# Colour

You cannot see. `preview_frames` gives you a small JPEG and you will misjudge colour from it — the
picture is for composition and framing, not for grade decisions. **The scopes are your eyes.** Every
judgement below is a number you can measure and a number you can drive.

## "Grade this video" / "balance everything"

One call: `grade_sequence`. It does the whole job deterministically - every footage clip on V1, read
once, goals by rule (white balance first, then exposure into the band for what the subject is, then
contrast only if flat or harsh), knobs from the calibration model, one confirm render per clip. The read is
decoded from the clip's own file (verified identical to Premiere's render on BRAW: parade to the
decimal, median within 0.4), so only the confirm renders - about 0.7 s a clip, well under a minute
for twenty; `confirm: false` makes it render-free at the price of taking the model's word. You
decide nothing per shot; say the one-line plan, call
it, then relay its table and the undo line (the grade is on the working copy; Discard copy removes
all of it). Stop ends it after the current clip.

Then taste, if the editor asks for it, on top of the balanced base: `grade_shot` for a shot,
`grade` for one knob - "warmer", "more contrast on the interview", "match these two" (measure the one
they like, drive the other to its numbers; same-kind shots only).

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

Everything is 0-100, except cast, which is -50..50. Our numbers matched Lumetri's own scopes on colour
bars, so **read them as IRE / percent directly**: 0 is black, 100 is reference white.

| Reading | What it is |
|---|---|
| `luma p1` / `p99` | black point / white point - the honest ends, ignoring stray pixels |
| `luma median` | overall brightness of what you measured |
| `spread` (p99 − p1) | contrast |
| `red/green/blue p1` | the parade's bottoms: equal when the blacks are neutral |
| `red/green/blue p99` | the parade's tops: equal when the whites are neutral |
| `blacksRB` / `whitesRB` | blue minus red at the bottoms / tops; 0 = neutral, > 0 blue, < 0 warm |
| `cast Cr` / `Cb` | mean chroma; skin hue = the angle of (Cb, Cr) on the vectorscope |
| `saturation median` | colourfulness, % of the vectorscope radius |
| `clipped %` / `crushed %` | pixels pinned at 255 / at the floor. **Unrecoverable** |

## What correct is (the canon, not invented numbers)

From the colourist standard - Van Hurkman's *Color Correction Handbook*, Warren Eagles, and the
broadcast conventions the scopes were built around:

- **Black point** at 0-5, not crushed flat. **White point** 90-95 when nothing in shot is true
  white, never clipped. Peak white just under 100 gains nothing past that: it only greys the whites.
- **Neutral means the parade lines up**: the three bottoms equal (blacks), the three tops equal
  (whites). Blacks are balanced with the **Shadows wheel**, whites with the **Highlights wheel**.
  Temperature/tint act on the white point only - large effect in highlights, almost none in shadows -
  so they cannot fix a shadow cast, and a shadow cast is what the eye is most sensitive to.
- **Skin**: hue on the vectorscope skin line - the I-line, ~123° (116-126° across the industry),
  the same line for every complexion because hue comes from blood and melanin sets brightness.
  Luma **40-70**: light skin 60-70, dark skin 40-60; a lit face is at its most alive around 60-65
  and loses it under 50. Saturation **20-50%**, ~30% reads natural on a calibrated Rec.709 display.
- **Order** - each move changes the next, so: black point → white point → midtones → neutralise
  the casts on the parade (shadows wheel, highlights wheel) → saturation → skin onto the line →
  match shots (waveform first, then parade, then vectorscope) → only then the look. Balance every
  shot to neutral before any look, even when the look is meant to be warm.
- Everything above is judged on the **whole frame** except skin, which is judged on the **face**.
  A subject's own spread says nothing about contrast - a bottle is naturally flat.

Sources: Larry Jordan on Van Hurkman's skin findings; the Adobe community neutralising sequence
(black point, white point, gamma, white balance, saturation, skin line, look); CineD and Warren
Eagles on balancing with the parade; Frame.io and Color Finale on the skin line and skin luma; Keith
Jack, *Video Demystified*, on the 123° I-axis. Links in the handoff's colour section.

## What the panel can drive today, against that list

| Step | The right tool | Driveable now? |
|---|---|---|
| black point / white point | Blacks / Whites (or Shadows / Highlights) sliders | writable, **not calibrated** - one sweep each |
| shadow cast | Shadows wheel | **not yet** - pending the wheel write probe |
| highlight cast | Highlights wheel | **not yet** - same gate; temperature is the weak stand-in |
| midtones / skin | Midtones wheel, exposure | exposure calibrated; wheel pending |
| contrast | Contrast | calibrated; cap an automatic pass at ±60 |
| saturation | Saturation / Vibrance | writable, not calibrated |

Until the wheels are writable, say plainly when a shot needs one ("blacks are blue by 6: needs the
Shadows wheel") rather than reaching for temperature to fake it.

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
