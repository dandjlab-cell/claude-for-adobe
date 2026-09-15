---
name: colour
description: Use when the editor asks to grade, colour correct, color correct, fix the exposure, contrast or white balance, match shots, or make footage look better, cinematic or consistent - including "grade this video". The procedure, which tool at each step, what the numbers mean, and what correct is as a number.
---

# Colour

You cannot see. `preview_frames` gives you a small JPEG and you will misjudge colour from it — the
picture is for composition and framing, not for grade decisions. **The scopes are your eyes.** Every
judgement below is a number you can measure and a number you can drive.

## "Grade this video" / "balance everything"

One call: `grade_sequence`. It does the whole job deterministically, on the working copy - every
footage clip on V1, read once, the canon by rule: white balance (Temperature, only when the whole
parade shares a cast) and each end's wheel pad for what is left, then Whites to the white point,
Contrast only if flat or harsh, Blacks to the black point last, Exposure only for a face's skin.
Knobs from the calibration model, written as one set and confirmed once; then one correction (a
rollback of what damaged the frame beyond what the source had, else a direction-aware pad nudge)
and one confirm of that - two renders a clip. The read is decoded from the clip's own file
(verified identical to Premiere's render on BRAW: parade to the decimal, median within 0.4), so
only the confirms render; `confirm: false` makes it render-free at the price of taking the model's
word, and it then withholds the balanced count. You decide nothing per shot; say the one-line plan, call it, then relay its
table and the undo line (Discard copy removes all of it). Stop ends it after the current clip.

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
  (whites). A cast the whole parade shares is the white balance: **Temperature** first, solved to
  line the whites up. What is left at each end is that end's wheel: blacks with the **Shadows
  wheel**, whites with the **Highlights wheel**. Temperature is a gain, large at the top and small at
  the bottom, so on its own it cannot fix a shadow cast, and a shadow cast is what the eye is most
  sensitive to.
- **Skin**: hue on the vectorscope skin line - the I-line, ~123° (116-126° across the industry),
  the same line for every complexion because hue comes from blood and melanin sets brightness.
  Luma **40-70**: light skin 60-70, dark skin 40-60; a lit face is at its most alive around 60-65
  and loses it under 50. Saturation **20-50%**, ~30% reads natural on a calibrated Rec.709 display.
- **Order** - each move changes the next, so: white balance → black point → white point → midtones →
  neutralise what is left on the parade (shadows wheel, highlights wheel) → saturation → skin onto
  the line → match shots (waveform first, then parade, then vectorscope) → only then the look.
  Balance every shot to neutral before any look, even when the look is meant to be warm.
  The panel cancels the casts BEFORE it moves the black point: the pad model reads the parade's
  bottoms, and once Blacks has put the black point at 4 a warm bottom's blue channel is on the floor
  and nothing reads linearly there. Blacks, Whites and Contrast do not tint, so the balance holds.
- Everything above is judged on the **whole frame** except skin, which is judged on the **face**.
  A subject's own spread says nothing about contrast - a bottle is naturally flat.

Sources: Larry Jordan on Van Hurkman's skin findings; the Adobe community neutralising sequence
(black point, white point, gamma, white balance, saturation, skin line, look); CineD and Warren
Eagles on balancing with the parade; Frame.io and Color Finale on the skin line and skin luma; Keith
Jack, *Video Demystified*, on the 123° I-axis. Links in the handoff's colour section.

## What the panel drives today, against that list

| Step | The tool | Status |
|---|---|---|
| white balance (whole-parade cast) | Temperature | calibrated; solved on the whites, capped at ±50 |
| shadow cast (what is left) | Shadows wheel pad | 2x2 model fitted at sat 0.15; pad ≤ 0.3, one direction-aware nudge |
| highlight cast (what is left) | Highlights wheel pad | same |
| white point | Whites, then Highlights | Whites clips past +50, an automatic pass stops there; Highlights (bright areas, never clipped in its sweep) finishes, capped at 60 |
| contrast | Contrast | calibrated; capped at ±60 |
| lifted black point (beyond 12) | Shadows | a dark-areas control (Adobe): -100 = p1 8.2 → 4.7 but the median 41.6 → 31, so capped at 60 |
| black point | Blacks, last | a toe control (Adobe: "black clipping"); calibrated to -20 only, takes what Shadows leaves |
| a face's skin luma | Exposure | calibrated (±2 stops, highlight-protected); used for nothing else |
| skin hue / midtones | Midtones wheel | calibrated, not yet driven |
| saturation | Saturation / Vibrance | writable, not calibrated |

Exposure never sets a white point: a frame whose brightest thing is a mid-grey wall has no white to
put at 92, and two stops of gain to force one lifts the blacks with it. The wheels' luma sliders
stay centred - the tonal work is the sliders' job, and a wheel luma pinned at its end is the wrong
tool showing. Wheels are written live through QE by name (dot decimals); the same door reads and
writes `RGB Curves` and `HSL Secondary`, which are next.

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
