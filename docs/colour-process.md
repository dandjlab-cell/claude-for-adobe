# How "grade this video" works

This describes the panel's colour pass as it runs today: what it measures, what it decides, and what it still gets wrong. Where a step has not been proven live yet, that is said plainly.

## 1. What it does, in one paragraph

Saying "grade this video" runs one deterministic pass, not a judgement call per shot. The panel works clip by clip on every piece of footage on the V1 track of a duplicated "[Claude]" copy of the sequence, so the original is never touched. For each clip it reads the picture from the clip's own source file wherever it can, rather than waiting on a Premiere render, because the two have been checked to agree and the source read is faster. It decides the moves for that clip from the numbers it measured, using a fixed set of rules. Those moves are written into Premiere and the panel renders the frame once to confirm they landed as expected. If the confirmed picture is still off, it corrects itself up to two more times from what it actually measured, not from its original prediction. The AI relaying the result decides nothing about any individual shot; it only reports the table the pass produced.

## 2. What it measures, and where the numbers come from

Every reading comes from one video frame near the middle of each clip, decoded from the camera file where possible, or a Premiere render otherwise. From that frame the pass computes the same kind of scopes a colourist reads off a waveform or vectorscope:

- **Luma** at the 1st and 99th percentile of pixels — the honest black point and white point, ignoring a few stray dark or bright specks.
- **The colour parade's ends** — the darkest and brightest few percent of pixels taken together, so the reading reflects real parts of the picture rather than three unrelated extremes.
- **Casts by brightness band** — whether shadows, midtones or highlights lean warm, cool, green or magenta.
- **The vectorscope reading** — colour angle and strength, used to judge skin tone.
- **Clipped and crushed shares** — pixels pinned at pure white or pure black, unrecoverable by any grading move.

Alongside the picture measurement, the pass runs Apple's Vision framework over the frame to find faces, hands and the general subject (a person, a product, whatever the shot is about). A warm wall, a sunset window or a red jacket can drag a whole-frame average far from what the subject looks like, so wherever a subject is present the pass measures the subject, not the frame, and reports which region it used. White balance and the tonal readings still look at the whole frame's parade, because those describe the light in the room, not one object; only skin tone and a dark subject's own brightness are judged on the subject itself.

## 3. What "correct" is

The pass does not invent its own idea of a good picture; its targets come from standard colour-correction references and broadcast convention, cited in the panel's internal colour notes.

| Reading | Target |
|---|---|
| Black point | 0 to 5 (not crushed flat) |
| White point | 88 to 95 (never clipped) |
| Parade bottoms (blacks) | The three channels equal — neutral black |
| Parade tops (whites) | The three channels equal — neutral white |
| Skin hue | 116° to 126° (123° at centre) |
| Skin brightness | 40 to 70 (60–70 light skin, 40–60 darker skin) |
| Skin saturation | 20% to 50% |
| Contrast | Not flat, not harsh |

## 4. The order of moves, and why that order

Each move changes what the next one sees, so the pass works in this order:

1. **White balance** — Temperature, then Tint, solved from the brightest 1% of the picture: usually a shiny highlight reflecting the room's actual light, a better reference than the brightest 3%, which can just be a light-coloured surface.
2. **The Shadows and Highlights wheel pads** — small colour nudges cleaning up whatever cast is left at the dark and bright ends after the white balance.
3. **The black point**, set with the Master curve's bottom point — a precise, targeted move, unlike Blacks or Shadows, which move more of the picture than just the black point.
4. **The Luma vs Sat roll-off** — a small saturation reduction in the deepest shadows and near-whites, so noise there doesn't carry a visible colour cast.
5. **The sliders**: Shadows (only for a notably dark subject, see below), Whites, Highlights, Contrast, Blacks — each fires only when a measurement calls for it.
6. **Confirm** — one render in Premiere, since a written value and its visible effect are not always identical.
7. **Correction passes** — up to two, from the real numbers just measured.
8. **The verdict** — pass or fail against the same targets, printed on each clip's line.

White balance and the wheel pads happen before the black point and the sliders. This is because the colour-cleanup tools read the darkest and brightest pixels; once the black point has already been pulled down, those same pixels are pinned at the floor of the scale and can no longer be read properly.

## 5. Every rule that says "leave it alone"

Knowing when not to touch something matters as much as the moves themselves. Each rule below came from a specific piece of test footage doing the wrong thing.

- **A shot's own colour is not a light cast.** If a parade end stays warm or cool by more than about 20 points even after white balance, that is treated as the object's own colour and left alone — one test shot read warm by 25–32 points across nearly every brightness band with only its shiny highlights near neutral, and neutralising it would have drained the warmth out of the objects.
- **A coloured parade end gets no wheel pad.** The same 20-point rule applies per wheel: a pad can only part-neutralise an object's colour, and tints whatever the black-point curve has already crushed underneath it.
- **Mixed light is split, not chased with one knob.** When the brightest pixels lean one way by more than a wheel pad can cover and the darkest lean the other way, one white-balance move that lines up the highlights pushes the shadows further off. The white balance takes only the part both ends share; the wheel pads take what's left at each end.
- **A shared cast at both ends is the room, not the light.** If shadows and highlights lean the same way by more than about 20 points, that is the scene's own colour and no white balance is applied, stated in the result. Forcing one on an oak-table shot once drained it to pale grey-beige and washed out the skin.
- **A strongly coloured top over shadows leaning the other way is an object, not the light.** The brightest pixels of that same oak shot are the wood's sheen, warm by 25, while a blue cloth in its shadows reads cool. Splitting the difference made the whole shot pale, so a top more than about 20 points off neutral gets no white balance whatever the shadows do; the pads take the shadows.
- **The damage guard, and its backoff to half.** Every write is checked against what the frame looked like before that clip was touched. A move that causes new clipping or crushing beyond what the source already had gets pulled back to half its intended value, rather than undone entirely or left at full strength.
- **The Shadows cap and ceiling for a dark subject.** When the subject itself (a hand, a product) sits below 35 out of 100 while the rest of the frame is already balanced, it is lifted with Shadows, capped at +30, and scaled back before the frame's black point would pass 8 or its contrast would go flat — an earlier uncapped lift once flattened a shot noticeably.
- **The floor share rule for a channel pinned at zero.** A channel at zero across a small share of the frame is normal — a saturated object like a blue cloth simply has no room left in one channel. Only when a channel is pinned at zero across a broad share (roughly 5% or more) is that treated as damage from the grade itself.

## 6. Shot match

When the same source file is cut into the timeline more than once, it is graded only once. The cut with the most typical whites (not the brightest or darkest) is chosen as the reference and graded fully; every other cut of that file then receives an identical copy of that grade and one confirming render, rather than being graded from scratch.

If applying the shared grade to a later cut would clip, crush, or push its white point too close to clipping, the whole shot's tone is turned down by half across every cut, including ones already graded, and all are rewritten to match. This exists because cuts of the same shot, seconds apart, must never end up looking visibly different in colour from each other — brightness may vary a little; colour should not.

## 7. Skin

Any clip where Vision found a face or a hand gets a step aimed at skin tone. The tool is a hue curve, not a colour key, and that choice follows what colourists actually do.

- **Why a curve.** The working hierarchy is primaries first, then curves, then Hue vs Hue, and only then a colour key using as few controls as possible. The key is the last resort, not the first. A curve also needs no key, no mask and no tracking, which matters for an automatic pass.
- **What it writes.** Vision's boxes give the skin's own hue. The pass writes a bump on the Hue vs Hue curve centred there, pinned back to zero on either side so nothing else in the picture rotates.
- **How much.** The curve's units are not the vectorscope's degrees and its response is not published, so the first write is a small probe, the clip's own response rescales it, and it tries up to three times within a cap. A move that leaves the skin further from the line than it started is removed.
- **Why not a mask.** A key plus a tracked shape mask is the other professional answer, and it is closed to an automatic tool: no documented scripting surface creates, assigns or edits a mask in either of Premiere's scripting systems. By hand it is a good tool. From a script it cannot be reached.
- **Why the key was abandoned.** On footage where the surroundings share skin's colour, a wooden table or cream cabinets, no key holds the skin without also holding the room. Narrowing it until it does catches only the rims of a hand, and colouring a rim is the worst outcome available.
- **Saturation only comes down, never up.** Pushing pale skin up amplifies whatever tint it already carries and turns it pink. Pale skin sits low on the line legitimately: complexions differ in saturation and brightness but not in hue, which is why one line serves everyone. When pale skin genuinely is wrong, the order is white balance, then contrast, and saturation last.

## 8. How to read a result row

Each clip produces one line. Shortened, one example reads:

```
clip @1.6s [subject] black 10.6 / white 87.8 / blacks 1.2 / whites 2.4 / spread 77.2
  → white balance: temperature 4.8
  → curve black 0.06 (black point 10.6 → 4)
  → whites 69.6 (white point 75.7 → 92.5)
  → corrected: curve black 0.12 → 0.18 (black point read 11.4)
  → black 3.5 / white 92.5 / blacks -0.4 / whites 0.4 ✓
```

Left to right: the opening block is the **starting reading** (`black`/`white` = black and white point; `blacks`/`whites` = how far shadows and highlights lean blue versus warm, positive is blue, negative is warm; `spread` = contrast). The middle blocks are the **moves made**, in the order from section 4. `corrected:` (and `corrected again:`) marks a self-correction pass. The final block is the **confirmed reading**, ending in a checkmark if every target was met, or a note naming what's still off.

## 9. What it still gets wrong, or does not do yet

- **Adjustment layers and LUTs are not detected.** A separate adjustment layer with its own Lumetri grade, or an Input LUT inside a clip's own Lumetri, is not currently noticed, so the pass can be reading a picture that isn't really the footage's own look.
- **The Whites slider's damage backoff is coarse** — a clipping move is currently just cut in half, not scaled precisely.
- **The colour wheels' brightness control is not used**, even though it has now been measured: its response is uneven across the tested footage, sometimes darkening a subject overall instead of cleanly lifting shadows, so a dark-subject lift still uses the ordinary Shadows slider for now.
- **The learned skin key can still come out too narrow**, leaving part of a visible hand or face outside the correction. The pass reports it as a thin key but does not widen it further on that clip.
- **On this footage the skin step rarely acts.** In the run of 2026-09-16 at 15:09, three clips were already on the skin line and needed nothing, four reported that no key separates the skin from the room, and none were corrected. The step is proven to work end to end, on earlier runs where a key did separate, but a colour key is the wrong tool for a hand on a wooden table. The right tool there is a shape mask around the face or hands, which Lumetri supports and which Vision already locates. That is not built.
- **Rendering slows down over a long session** — Premiere's confirm render tends to creep from well under a second toward several seconds the longer a session runs, independent of anything the pass does; restarting Premiere resets it.
