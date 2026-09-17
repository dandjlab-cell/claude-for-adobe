# The colour control map

Every Lumetri control the grade can touch, what has been **measured** about it, and what is **assumed**.
Companion to `docs/color-process.md` (what the pass does) and `.claude/skills/color/SKILL.md` (the canon
it is aimed at). Sources: `src/lumetri_sweeps.json`, `src/grade_rules.cjs`, `src/curves.cjs`,
`src/wheels.cjs`, `src/grade.cjs`, `src/grade_model.cjs`, `src/scopes.cjs`, `panel.js`.

---

## 1. How to read this

**Every model in here is fitted on one frame of one clip.** Most of it is `C220 @0.5 s` on the owner's
test timeline ("clip 1": the Blacks / Whites / Shadows / Highlights / Tint / wheelBands / curve frame).
The Exposure, Temperature, Contrast and older `wheels` sweeps are a *different* frame — `C222` at
`00:00:01:08–09` / timeline 1 s — which is why their zero rows do not match the others
(`lumetri_sweeps.json._source`). The three HSL Secondary sweeps are `C227 @4.44 s`; the Contrast body
addendum is `C193 @15.39 s`; the black-point residual is `C229 @9.57 s`. **No control has had its full
sweep repeated on a second frame.** That is the single biggest known limit, and `_blackPointResidual`
is the file's own conclusion that a 1.99 IRE miss on a different clip is exactly this — model error
carried from a one-clip calibration, not an unmodelled knob. Where a number below is not in a file, it
says **not measured**; nothing here is guessed.

---

## 2. What a frame measurement contains

`src/scopes.cjs measure()` on one decoded RGB24 frame (Premiere's `exportFramePNG`, or the clip's own
source file, cropped to the subject box or masked when a region was asked for). Read as SDR Rec.709
full range — itself an assumption, stated at the top of `scopes.cjs` and never verified against
Lumetri's own readout. All values 0–100 except `cast` (−50..50).

| Field | What it is | Paired? |
|---|---|---|
| `luma.min/p1/p10/p50/p90/p99/max` | nearest-rank percentiles of `0.2126R+0.7152G+0.0722B` | — (own histogram) |
| `red/green/blue.mean` | channel means over the frame | — |
| `red/green/blue.p1`, `.p99` | **independent** per-channel percentiles — the RGB parade's ends as drawn | **NO** |
| `bands.{blacks,blacks1,whites,whites1}` | by RANK: darkest/brightest 3% (and 1%) of pixels by luma | **YES** |
| `bands.{shadows,midtones,highlights}` | by LEVEL: luma 5–30 / 30–65 / 65–95 | **YES** |
| `bands.*.rb` | median `B−R` over those same pixels; >0 blue, <0 warm | **YES** |
| `bands.*.g` | median `G−(R+B)/2` over those same pixels | **YES** |
| `bands.*.levels.{red,green,blue}` | median level of each channel over **every** pixel in the band, no exclusion | **YES** |
| `bands.*.share` | % of the whole frame those cast-readable pixels are | — |
| `bands.*.readable` | % of the band that still had a readable cast (see below) | — |
| `clipped.{r,g,b}` | % of pixels with that channel at 255 | — |
| `floor.{r,g,b}` | % of pixels with that channel at 0 | — |
| `crushed` | % of pixels at luma code 0–1; `pureBlack` = % at R=G=B=0 | — |
| `saturation.p50`, `.p99` | `hypot(Cb,Cr)/127.5×100`; pure red ≈103, pure green ≈119 (not capped at 100) | — |
| `cast.cb`, `.cr` | whole-frame mean chroma, −50..50; skin hue = `atan2(cr, cb)` | — |

**Why paired vs independent matters — it has caused two shipped regressions.**

- `bands.*.rb/.g/.levels` come from the *same pixels*: one pass accumulates per-luma-code histograms of
  `B−R` and `G−(R+B)/2`, so a band's cast is a median over one common sample. That is what a cast *is*.
- `red.p1`, `green.p1`, `blue.p1` are three separately ranked percentiles. They need not describe the
  same pixels at all. `curves.cjs` (l.186–192): **0.1.80 shipped `neutralBottoms` fed with each channel's
  own p1 and made the grade worse — balanced fell from 8 clips to 4, C220's black point was crushed
  4.3 → 1.6, and the blacks cast grew 0.4 → 3.9 blue.** "Green's p1 sitting above red's says their
  distributions differ, not that the blacks are green." `bottomsFor` is fed `bands.blacks.levels` now.
- `channelToe._caution` repeats the warning for the product bug: the 00:00:09:10 frame's "+8 blue floor"
  reading came from a **parade** — independent percentiles — "the exact statistic that misled 0.1.80."
- The cast histograms **exclude any pixel with a channel at 0 or 255** (`r>0&&g>0&&b>0&&…<255` guard).
  So `bands.blacks.rb` goes blind as a channel crushes: in `curveToe` it drifts
  `−1.6 → −1.2 → 0 → +1.6 → +2 → null` with **no cast having changed** — survivorship, the sample
  shrinking to the pixels blue survived in; at x=0.2 the band is empty. `channelToe` shows the same thing
  with the number attached: `readable` falls `100 → 100 → 80 → 35 → 5 → 0` while `blacksRB` slides
  `−1.6 → −10.6` **and the levels stay exact throughout**. Rule, from `_readable`: drive the fix from
  `levels`; treat `blacksRB` as unusable below ~80% `readable`.
- `bands.*.levels` has none of this problem — it is computed over every pixel in the band, and a channel
  on the floor reads 0, which is the truth about it.

---

## 3. Every control

`Accuracy` is against the sweep it was fitted on, on that one frame. `Sweep block` is the key in
`src/lumetri_sweeps.json` unless stated.

### Basic Correction sliders

| Control | What it moves | Measured model | Accuracy | Cost / side effect | Sweep block |
|---|---|---|---|---|---|
| **Temperature** (−100..100) | red against blue, gain, strongest at the top | 7-point sweep; `grade_model.cjs` interpolates the sweep and transfers to the clip as a ratio (scaling stats) or offset (cast). Red mean 37.0→60.6, blue 34.9→18.3 across the range; luma p50 barely moves (35.3→37.6) | no residual measured. Live note (`panel.js` l.1883): "transfers a little strong on the −24..−37 moves (whites still blue by 3–5 on the 21:50 run)" — the confirm rescales by least squares | `redP99` reaches 100 at +100, `blueP99` 100 at −50 and −100: **clips past ±50** on this frame. `sat` 12→41 | `temperature` |
| **Tint** (−100..100) | green against magenta, gain on the top | same interpolation. Whites-band G-mid runs **+29.4 → −32.2**, ~0.31 per unit, near-linear | not measured as a residual | **luma untouched** — `p1` is 8.2 at all seven values. Red and blue clip past +50. `max` 91.4 → 83.1 at +100 | `tint` |
| **Exposure** (−5..5 stops) | whole-picture gain | 7-point sweep, −2..+2. p50 20.8→58.8, p1 11→19.6, p99 48.2→99.6 | not measured as a residual | `max` reaches 100 and p99 99.6 at +2: **clipping**. Only ever used for a face's skin luma (`goalsFor` step 1) — never to set a white point | `exposure` |
| **Contrast** (−100..100) | pivot around the midtones | 7-point sweep on p1/p99, plus a second-frame p10/p90 addendum | ends modelled from the sweep; body from an extrapolated fit (see cost) | p1 **11.4 → 5.1** at +100 and → 18.4 at −100: contrast *is* a black-point move. `_body` (C193 @15.39, six values −40..60, ±100/±50 extrapolated): body (p90−p10) moves **~0.14 a point** — 63 at −40, 69 at 0, 77 at 60 — and **the floor crushes 0.9% at +40, 2.8% at +60**. "A weak, crush-prone tool for a flat body; the ratio transfers, the absolute frame does not" | `contrast`, `contrast._body` |
| **Highlights** (−100..100) | bright areas | p99 58.8 → 87.8 across the range, peak 95.7 at +100 | not measured as a residual | **nothing clips** at either end; black point stays 8.2–9.0. Median moves with it (41.6 → 51.4 at +100) | `highlights` |
| **Shadows** (−100..100) | dark areas | p1 4.7 → 17.6; near zero the slope is **0.08 p1-points per unit** (+20 takes 8.2 → 9.8) | not measured as a residual | **the median moves far more than the black point**: 41.6 → 52.9 (+100) / 31.0 (−100). Nothing crushes or clips at either end. Used only to lift a dark *subject*, capped +30, with a ceiling at black point 8 / spread 55 | `shadows` |
| **Whites** (−100..100) | top gain | p99 56.5 → 99.6, p50 31 → 55.3 | not measured as a residual | `max` hits 100 at +50: **clipping begins near +50**. Black point barely moves (6.3 → 11.4) | `whites` |
| **Blacks** (−100..100) | toe control ("black clipping" — Adobe), not a lift | p1 0 → 20.4; the usable slope is the −20..0 leg, **0.41 per unit** (`BLACKS_SLOPE`) | the −20..0 slope is "a lower bound taken on a clipped sample" (`grade_rules.cjs` l.67–72) | **p1 sits at 0 from −20 downward — nothing below −20 is calibrated.** The pass only ever *lifts* crushed blacks with it; lowering is not automatic (the 20:05 run: the same move took one clip 12 → 1 and the next 12 → 10) | `blacks` |
| **Saturation** (0..200) | global saturation | **not measured** — `PARAMS.saturation.tested: false`, no sweep block | — | — | none |
| **Vibrance** (−100..100) | global vibrance | **not measured** — `PARAMS.vibrance.tested: false`, no sweep block | — | — | none |

`goalsFor` never emits a Saturation or Vibrance goal, so the automatic pass never writes either.

### Colour wheels — hue/sat pads

Written through QE as `Shadows:h,s,l;Midtones:h,s,l;Highlights:h,s,l` (hue in degrees, 0 red / 90 green /
180 cyan / 270 magenta; sat 0..1; luma 0..1 centred at 0.50). **Reads come back with comma decimals;
writes must use dots or Premiere accepts them and does nothing** (probed 2026-09-15).

| Control | What it moves | Measured model | Accuracy | Cost / side effect | Sweep block |
|---|---|---|---|---|---|
| **Shadows pad** | the blacks' cast | 2×2 least-squares matrix fitted on four hues at sat 0.15, on the **paired** `bands.blacks` statistic: `[[−43.0, −18.3],[−21.0, +31.3]]` (`d(B−R)/dx`, `d(B−R)/dy` / `dG/dx`, `dG/dy`) | worst residual across the four fitted rows: **0.85** (recomputed from the block). `SKILL.md` says "within 0.8"; `wheels.cjs` l.19 says "~1.3 points" — that comment refers to the **older** channel-end statistic, not `wheelBands` | **Not used by the pass any more.** `padsFor` loops over `[["highlights","whites"]]` only. It was removed because it *authored* the blue blacks: on C229 @9.42 s it ran to its 0.3 cap over two corrections (0.27 → 0.4 → 0.34), took paired blacks from R 21.6 / G 13.3 / B 8.6 to R 5.5 / G 8.2 / B 10.6 — sign flipped, blue by 5.1 — with 0.48% of red on the floor | `wheelBands.shadows` |
| **Highlights pad** | the whites' cast | same fit on `bands.whites` (or `whites1` when its share ≥0.5%): `[[−36.3, −19.7],[−18.3, +28.7]]` | worst residual **0.25** | cap `MAX_SAT = 0.3` — twice the sampled radius; more cast than that is reported, not chased. A `COLORED` end (>20 off neutral) gets no pad at all | `wheelBands.highlights` |
| **Midtones pad** | the midtones' cast | **not usable.** `castMatrix("midtones")` falls back to the older `wheels` block and the channel-end statistic keyed `redP50/greenP50/blueP50` — **those keys do not exist in the data**, so the matrix evaluates to `[[null,null],[null,null]]` | n/a | never called: `padsFor` skips it and `predictPads` explicitly `continue`s on midtones. `SKILL.md` calls it "calibrated, not yet driven"; it is in fact **not** calibrated on the banded statistic | `wheels.midtones` (4 hues at sat 0.15) |

Live calibration for the pads' *nudge* step uses `NUDGE_MAX_SAT = 0.5` — "the correction step is driven
by a real reading, not the fitted line, so it may use the wheel's room past the model's cap."

### Colour wheels — luma sliders

| Control | What it moves | Measured model | Accuracy | Cost / side effect | Sweep block |
|---|---|---|---|---|---|
| **Shadows wheel luma** | an **offset** on the whole lower range — Lumetri's Lift | 6-point sweep 0.5 → 0.25. The grade uses a straight interpolation of the measured p1 table `WHEEL_LUMA_P1 = [[0.5,8.2],[0.45,6.3],[0.4,4.7],[0.35,3.1],[0.3,2.4],[0.25,1.6]]` — **interpolated from the swept rows, not fitted**; ~1.3 p1-points per 0.05 over 0.5..0.35, tapering below. `wheels.cjs lumaSlope` separately gives 38.8 p1-points per unit (linear fit, unused by the pass) | exact on the swept rows by construction; no second frame | **~20× cheaper clipping than the Master toe**, but **it drags the midtones**: the 2026-09-15 `wheels` block has luma 0.4 → p50 38.4 (vs its own neutral 41.2; `_caveat` quotes 41.6 → 38.4 against the `wheelBands` neutral). About 3.2 points of median for 3.5 of black point — "an offset on the whole lower range". Cast *tightens* slightly with it (`blacksRB` −1.6 → −0.4), so it does not fight the black balance. `readable` stays 100% down to 0.35 | `shadowsWheelLuma` |
| **Midtones wheel luma** | gamma, treated as a gain on p50 | linear fit from the older sweep: ratio slope **0.857 per unit of luma** | not measured as a residual | **never written by the pass**; `solveLuma`/`nudgeLuma` are imported or exported but unused | `wheels.midtones` (sat 0 rows) |
| **Highlights wheel luma** | a **gain** on the top | linear fit: ratio slope **0.503 per unit** (p99 reads ×0.90 at 0.3 and ×1.10 at 0.7 of neutral) | not measured as a residual | **never written by the pass.** `SKILL.md`: "a wheel luma pinned at its end is the wrong tool showing" — the Shadows one is now the documented exception | `wheels.highlights` (sat 0 rows) |

### RGB Curves

QE text `Master:N:x,y,…;Red:…;Green:…;Blue:…` — comma decimals on read, dots on write. Verified live
2026-09-15 20:28: every write accepted, read back, restore matched.

| Control | What it moves | Measured model | Accuracy | Cost / side effect | Sweep block |
|---|---|---|---|---|---|
| **Master curve bottom point** (`[[x,0]]`) | the black point, all three channels together | **`out = (in − 100x) / (1 − x)`, floored at 0** — the published levels line. ~1.0 IRE of fall per 0.01 of x. `blackInFor` inverts it; anchored at A: `x = A(p1−t)/(A−t)` | **within 0.6 IRE** on every unclamped row, and always a touch high (the soft toe). Swept again **with the anchor the grade actually writes** (pinned at the median and 0.8, four-point spline): p1 `8.2 / 6.7 / 4.3 / 0.4 / 0 / 0` vs the unanchored `8.2 / 6.7 / 3.9 / 0.4 / 0 / 0` — `predictLevels`' anchored form predicts it **to within 0.24**. "The anchor changes the midtones, not the black point, and it is not a source of model error" | **It is a RIGID TRANSLATION of the parade.** R−B spacing across the rows is `4.70 → 4.80 → 4.30` (the last already clamping) against a starting 4.70 — it **cannot close a gap between the channel floors**, only push the whole parade down until the lowest channel clamps. Usable on this frame to **x = 0.05** and no further (blue's own p1 is 4.7, so x > 0.047 puts it on the floor): floor share `0.92% at 0.05, 5.76% at 0.1, 16.69% at 0.15, 28.99% at 0.2`. Capped at `LEVELS_CAP = 0.25` and at `floorCap = (lowest channel p1 − 1.5)/100` | `curveToe` |
| **Master curve top point** (`[[x,1]]`) | the white point | `out = in / x`, "to the decimal": p99 75.7 → 82 / 86.7 / 94.5 at x 0.92 / 0.87 / 0.80; the peak clips once `max/x > 100`. Code comment in `curves.cjs` l.11–13 — **there is no block in `lumetri_sweeps.json` for it** | "to the decimal" on three points; no residual table | **Never written.** `levelsFor` always calls `levels(blackIn, 1, …)`; `whiteInFor` is referenced only by `test/curves.test.cjs`. The white point is a slider job (Whites, then Highlights) | none (code comment only) |
| **Per-channel curve toe** (`Red/Green/Blue [[x,0]]`) | **one channel's** bottom, down | same line `(in − 100x)/(1 − x)` | **within 0.15 IRE** on the paired statistic across every row (5.9 vs 5.92, 3.1 vs 2.95, 0 vs 0) — tighter than Master's, because a band median is a steadier statistic than a percentile | **Moves EXACTLY ONE CHANNEL**: `pairedRed 10.2` and `pairedGreen 8.6` identical on all six rows while blue goes 7.8 → 0, and `redP1`/`greenP1` never move either. So the three toes compose exactly. **Crush is governed by the channel's OWN p1, not its paired median**: at x=0.05 blue's paired bottom is a healthy 3.1 while blue's own p1 is 0.4 and 0.91% of the frame is floored (`floorBlue` by `blueP1`: 2.7 → 0.02%, 0.4 → 0.91%, 0 → 5.9%). Cap `x ≤ (ownP1 − MARGIN)/(100 − MARGIN)`, `MARGIN = max(TOE_MARGIN 2, FLOOR_MIN+2 = 3.5)`. The old flat 0.12 cap is called out as "unrelated to any of this and far too loose" | `channelToe` |
| **Per-channel curve lift** (`Red/Green/Blue [[0,y]]`) | **one channel's** floor, up | **`out = 100y + v(1 − y)`**, the mirror of the toe | **within 0.3 IRE** on every row (paired blue 7.8 → 9.8 / 12.5 / 17.3 / 21.6 / 26.3 against 9.64 / 12.41 / 17.02 / 21.63 / 26.24); the channel's own p1 tracks the same line | **A lift costs NO floor**: `floorRed/Green/Blue = 0/0/0` at every setting including y=0.2, and `readable` stays 100% throughout — it moves pixels *off* the floor, so the cast statistic gets *more* trustworthy as it rises. Isolated like the toe. ~0.93 points of B−R cast per 0.01 of lift on this frame | `channelLift` |

The pass writes toes and lifts as one object: `bottomsFor` solves **where** the three should meet
(`meet = max(floor, lowest reachable of each channel)`), then `movesFor` toes the channels above it down
and lifts the ones below it up; `levelsFor` composes the Master bottom point onto the same curve object.

### Hue Saturation Curves

Single curves through the same QE door: `N:x,y,…` with x the position 0..1 and y a **signed** offset,
`"0:"` = empty. Premiere draws a **cubic spline**, so a sparse shape bows — ends at −0.5 with zeros at
0.15/0.85 rendered as a flat +0.5 (`curves.cjs` l.111–117, probed live 2026-09-16 00:10–00:20; a natural
cubic spline reproduced the +0.51 bow).

| Control | What it moves | Measured model | Accuracy | Cost / side effect | Sweep block |
|---|---|---|---|---|---|
| **Luma vs Sat roll-off** | saturation in the deepest shadows and near-whites | shape from `satRolloff()`: `[[0,−d],[0.06,−0.43d],[0.12,0], 0.25/0.5/0.75 pinned, [0.88,0],[0.94,−0.43d],[1,−d]]`, `ROLLOFF_DEPTH = 0.35`. On the ±0.5 probe a flat ±0.5 moved the saturation median 28 → 45 / 12; seven pinned points held it at 28 while the ends desaturated | **NEGATIVE result, kept as one**: at depths 0.02–0.2 it does **nothing** to the black end. luma p1 is 8.2 on every row; paired bottoms 10.2 / 8.6 / 7.8 on every row, unchanged to the digit; only red's own p1 twitches 9.4 → 9.0 at the two deepest settings | so it is **not** the unmodelled 1.99 in the black-point chain, and it needs no black-point model. **Swept only to 0.2 where the grade writes 0.35** — the trend is *flat*, not shallow, so the extrapolation is called safe, but 0.35 and 0.5 have not been read. Never applied to a `COLORED` end, never over a curve the clip already carries | `satRolloffBlacks` |
| **Hue vs Hue (skin)** | rotates one slice of the hue wheel — `hueBump(centre, shift, width=0.08)`, five points, zeros pinned either side | **a positive offset lowers the vectorscope angle, every time**, measured on the first live run (15:53) across four clips: C223 +0.028 → 128.7→122.3 (229°/unit); C198 +0.040 → 135.3→124.4 (272); C209 +0.031 → 131.2→123.7 (242); C227 +0.031 → 128.3→122.7 (181). `SKIN_HUE_GAIN = 220` | **clip-to-clip gain spread 181–272 °/unit** — the first write is a solved guess, then up to 3 secant tries against the real render; removed entirely if it ends further from the line | **A hue rotation is not luma-neutral** — see §4. `SKIN_HUE_CAP = 0.12`, `SKIN_HUE_MIN = 0.008`, `SKIN_HUE_DONE = 2°`. `HUE_BUMP_WIDTH = 0.08` is **invented** | none in `lumetri_sweeps.json` (live-run notes in `panel.js` l.1264–1270) |
| Hue vs Sat / Hue vs Luma / Sat vs Sat | — | **not measured** — named in `curves.cjs` as reachable through the same door, never swept, never written | — | — | none |

### HSL Secondary

Key and its wheels through QE by name (`"HSL Secondary"`, `"Correction"`); the scalars and Show Mask by
**property index** — the names collide with Basic/Creative. All three scalar sweeps are `C227 @4.44 s`
inside a **hand key** `H:0.06,0.01,0.03; S:0.44,0.20,0.23; L:0.34,0.13,0.16`, measured on the biggest
hand box.

| Control | What it moves | Measured model | Accuracy | Cost / side effect | Sweep block |
|---|---|---|---|---|---|
| **The key itself** (H/S/L centre+inner+outer) | which pixels the correction reaches | **not measured as a response model.** Learned per clip by `skinKeyFor` from Vision's face/hand boxes; the pass reports "too few skin-colored pixels" when it cannot | — | on this footage a key cannot separate a hand from an oak table — narrowing it catches only the rims, and "colouring a rim is the worst outcome available". The skin write moved to Hue vs Hue for this reason | none |
| **HSL Temperature** (index 101) | red/blue inside the key | 7-point sweep. Keyed red mean 53.7 → 55.9 (+100) / 50.1 (−100); `sat` 19 → 23 / 13 | not measured as a residual | **about a quarter of the global slider's reach** (`PARAMS` comment). Keyed luma p50 44.7 → 43.5 / 41.6. The frame's p1 (13.3) and max (75.3) do not move | `hslTemperature` |
| **HSL Tint** (index 102) | green/magenta inside the key | 7-point sweep; keyed hue `atan2(cr,cb)` runs **143° → 119°, ~0.12° a point**, crossing the I-line at about +60 | not measured as a residual | **rejected for skin**: "HSL Tint was a magenta wash over every keyed pixel" (the owner, 2026-09-16 12:21). Keyed p50 44.7 → 40.4 / 39.6 at the ends | `hslTint` |
| **HSL Saturation** (index 105, 100 = neutral) | saturation inside the key | sweep at 0/50/100/150/200 → keyed sat 9 / 13 / 19 / 21 / 22. `_source`: usable 0–100, compressed above 100 | **the sweep and the shipped constant disagree.** `HSL_SAT_GAIN = 0.8` per 100 points (measured 14:12 on the pass's own, wider keys) predicts 19 → 3.8 at 0; the sweep's hand key gave 19 → 9, i.e. an effective gain of ~0.53. Different keys, unreconciled | **only ever allowed DOWN.** Saturation 198 on a hand at 14 made it bright pink (the owner, 14:45): "amplifying a pale hand amplifies whatever tint it carries" | `hslSaturation` |
| **HSL Midtones wheel pad** | rotates the keyed colour | 2×2 fitted 2026-09-16 12:54 on C227's hands inside their key: pad at sat 0.25 at 0/90/180/270° moved keyed (Cb,Cr) by (−0.3,+1.3) (−0.8,−0.3) (0,−0.9) (+0.8,+0.7). `HSL_PAD.m = [[−1.5,−8.0],[11.0,−5.0]]`, **scaled by 2.5** because the pass's own (hand-covering) keys rotated 2.5–3× further per unit on the first live run (C223 0.23 for −5.7° got −14.5; C209 0.39 for −8.2 got −24) | the 2.5 scale is one fitted factor over a 2.5–3× observed spread; "the confirm's secant covers the rest" | cap **0.3, not 0.6**: at the cap, on a key that had caught only the rims of two hands, those rims went bright pink (the owner's mask screenshot, 14:50). **Computed by `skinFor` but not written** — the panel calls `skinFor` only to decide *whether* skin needs a move, then writes a Hue vs Hue bump instead | none (live-run notes in `grade_rules.cjs` l.483–494) |
| **Show Mask** (index 88), **Denoise** (95), **Blur** (96) | the mask view; key refinement | reachable, read 15:05; Denoise and Blur are numeric and 0 by default | — | `scopes` `region: "keyed"` measures only what the key selects, which requires Show Mask on | none |

---

## 4. The push–pull map

Five places where two controls fight, with the numbers.

**1. Master curve toe vs Shadows wheel luma — the same black point, opposite bills.**

| | reaches luma p1 | floor cost | `readable` | midtones |
|---|---|---|---|---|
| Master toe `x=0.05` | **3.9** | **0.92%** of blue on the floor | not recorded — `curveToe` has no `readable` column; `blacksRB` already drifting −1.6 → 0 | held (pinned at the median and 0.8) |
| Shadows wheel luma `0.40` | **4.7** | **0.04%** | 100% | **dragged**: p50 −2.8 to −3.2 |
| Shadows wheel luma `0.35` | **3.1** | **0.08%** | 100% | dragged further |

`shadowsWheelLuma._headline`: "about 20× lower" clipping for the same black point. (It quotes the toe's
floor cost as 0.89%; the `curveToe` row itself says 0.92 — a rounding difference between the two writes,
not two measurements.) `_caveat`: "the curve
holds the midtones and clips, the wheel spares the shadows and darkens the picture" — roughly **3.2 points
of median for 3.5 of black point**, nearly parallel. The pass resolves it by order: the curve goes first
as far as its floor cap allows, the wheel takes only what is left (`shadowsLiftFor`), on the reasoning
that "clipping cannot be undone, a dragged median can — Contrast and Shadows run after this."

**2. Channel toes vs the Master curve — spacing vs level, on one shared floor budget.**

- The Master toe is a **rigid translation**: R−B spacing `4.70 → 4.80 → 4.30` across `curveToe`'s rows
  against a starting 4.70. It can set a level; it cannot change spacing.
- A channel toe changes **only** spacing: `pairedRed 10.2` / `pairedGreen 8.6` identical on all six
  `channelToe` rows while blue goes 7.8 → 0.
- They compete for the same headroom. `bottomsFor` caps each toe at `(ownP1 − 3.5)/96.5`; `levelsFor`
  then needs `floorCap = (lowest channel p1 − 1.5)/100 ≥ 0.02`, i.e. a surviving channel floor of ≥3.5.
  **The 17:59 run is the proof**: red's toe hit its (then flat 0.12) cap, took red's own p1 to **2.0**,
  left `floorCap = 0.005` against the 0.02 needed, **and no black point was set at all** — the row read
  "black point 9.8 lifted". The fix was `channelLift`: a lift spends **zero** floor, so channels below
  the meeting level are raised instead of everything being dragged down to the lowest one.

**3. Contrast vs the black point — they are the same knob wearing two hats.**

`contrast` sweep p1: `18.4 / 14.9 / 12.5 / 11.4 / 9.8 / 7.8 / 5.1` at −100…+100. The panel's own note
(l.1723): "contrast +40 moves it **DOWN about 2.9**" — interpolating the sweep, 11.4 → 8.47. And
`_body`: the floor **crushes 0.9% at +40 and 2.8% at +60**. So the contrast goal fired for a flat body
will quietly undo the black point the curve just set, and can crush past `GUARD.crushed = 1.0` on its
own. `SPREAD.harsh` was raised 85 → 93 for the mirror of this: "harsh was 85 — which the targets
themselves exceed (black 4, white 92 = 88), so Contrast −60 fired on five clips of the 21:05 run and
**lifted the black points the curve had just set**."

**4. Shadows slider vs the black point — the wrong lever for it.**

Shadows moves p1 by **0.08 per unit** near zero (8.2 → 9.8 at +20) but the median by **~0.11 per unit**
(41.6 → 43.9 at +20; 41.6 → 52.9 at +100). Over the full range it buys 9.4 points of black point for
11.3 points of median. That is why `goalsFor` uses Shadows only to lift a dark *subject* — capped at +30
with a ceiling at frame black point ≤8 and spread ≥55 — and never to set a black point: "+51 on C220
(12:18) took the subject to 57 and the picture went flat (the owner: 'lost any dynamism')."

**5. Skin Hue vs Hue vs luma — a hue rotation is not luma-neutral.**

Luma is `0.2126R + 0.7152G + 0.0722B`. Changing the R:G:B ratio changes that weighted sum. Measured
consequence, `docs/handoff.md` item 4: **C228** (`A056_05072246_C228.braw` @7.735 s) read
`black 3.5 / body 45.5 ✓` on the 0.1.78 run and **`body 40, flat`** on the 0.1.85 run after the
skin-corridor change — `SPREAD.bodyFlat` is 45, so the hue move pushed it across a verdict threshold.
Open: accept it, or compensate Contrast when the skin curve fires. The skin step also runs **after** the
confirm and the corrections, so nothing re-reads the body afterwards.

---

## 5. The order the pass uses, and why it differs from the canon

**The canon** (`SKILL.md` l.108–115, from Van Hurkman / Eagles / the Adobe neutralising sequence):

> white balance → black point → white point → midtones → neutralise what is left on the parade (shadows
> wheel, highlights wheel) → saturation → skin onto the line → match shots → only then the look.

**What `gradeSequenceTool` implements** (`panel.js` l.1694–1769) — decisions first, then one batched write:

| # | Decision | Function | Written as |
|---|---|---|---|
| 1 | white balance | `gradeTemperatureFor` | Temperature, then Tint |
| 2 | the whites' residual cast | `gradePadsFor` | **Highlights wheel pad only** |
| 3 | the blacks' residual cast | `gradeBottomsFor` | per-channel RGB curve toes **and lifts** |
| 4 | black point | `gradeLevelsFor` | Master curve bottom point, composed onto the same curve object |
| 5 | what the curve could not reach | `gradeShadowsLiftFor` | Shadows wheel **luma** |
| 6 | tonal goals | `gradeGoalsFor` | Exposure (face only) → Shadows (dark subject) → Whites → Highlights → Contrast → Blacks, via `planShot` |
| 7 | saturation cleanup | `gradeSatCurveFor` (decided on the frame **as read**) | Luma vs Sat roll-off, written **in the first batch** |
| 8 | one confirm render, then ≤2 corrections from the real reading | | |
| 9 | skin | `gradeSkinFor` (decision only) | **Hue vs Hue** bump, up to 3 probe renders |

**Three documented deviations:**

1. **Parade neutralisation moves BEFORE the black point** (canon puts it after). Reason, stated in
   `grade_rules.cjs` l.10–15, `SKILL.md` l.112–115 and `color-process.md` §4: *the cast statistics read
   the parade's ends as pixels, and once the black point sits at 4 a warm bottom's blue channel is on
   the floor — the response is then clamped, not linear.* Read the casts where there is room, cancel
   them, then move the ends with the tonal sliders, which are equal-channel operations. The confirm
   re-reads the casts rather than assuming the balance held. `curveToe._bandBlind` is the measurement
   that vindicates this: reading `bands.blacks` after a deep black point reads a biased subset.
2. **The blacks' cast goes to per-channel curves, not the Shadows wheel** (canon says Shadows wheel).
   Reason, `grade_rules.cjs` l.164–181: a wheel is a hue-and-saturation rotation of a whole tonal range —
   it cancels warm by *adding blue*, which lifts blue's floor, and cannot lower red without dragging the
   range. On C229 @9.42 s the wheel path ran to its cap and **flipped** the cast (R 21.6/G 13.3/B 8.6 →
   R 5.5/G 8.2/B 10.6, 0.48% of red floored): "THE PASS WAS THE AUTHOR OF THE BLUE BLACKS." Per-channel
   curves are also higher in the colorists' own hierarchy ("Primaries, Custom curves, Hue vs Hue curves,
   HSL qualifier" — Cullen Kelly).
3. **The Shadows wheel's luma is used** where `SKILL.md` says wheel lumas stay centred ("a wheel luma
   pinned at its end is the wrong tool showing"). Reason: `shadowsWheelLuma` measured it at ~20× less
   clipping than the Master toe, and it only ever fires where the curve already gave up. The skill file
   has not been updated for this.

The Luma vs Sat roll-off is written with the **first** batch, not last, because "the 00:27 run wrote it
last and the blacks cast moved 1–3 points on the final read that nothing then corrected (C200 and C228
lost their tick)".

---

## 6. Constants: measured, canon, or invented

| Constant | Value | Where it came from |
|---|---|---|
| `BLACK_POINT` / `WHITE_POINT` | `[0,5]` / `[88,95]` | **canon** (Van Hurkman, Eagles, broadcast convention) |
| `ACCEPT` | black ≤6, white 85–95 | derived from the above + "the tolerance one render's reading has" — **invented tolerance** |
| `SKIN_LUMA` / `SKIN_SAT` | `[40,70]` / `[20,50]` | **canon** |
| `SKIN_HUE` | `[116,132]` | 116 is canon; **132 is from owner feedback** (was 140, lowered 2026-09-16 14:30 after "way too pink" at a 123° target) |
| `SKIN_HUE_TARGET_LO/HI` | 123 / 132 | asymmetric aim: 123 from the red side, 132 from the yellow side — **a rule adopted after the 22:23 incident**, not measured |
| `SPREAD` | flat 55, harsh 93, target 70, bodyFlat 45, bodyTarget 52 | **invented**; `harsh` raised 85→93 because the canon's own targets exceed 85 |
| `NEUTRAL` / `MIDTONE_CAST` / `COLORED` | 1.5 / 4 / 20 | **invented** thresholds, each traced to a named clip in the comments |
| `PAD_REACH` | 12 | **measured-derived**: "about what a pad at its cap (0.3) cancels, from the 21:00 sweep (6.5 per 0.15)" |
| `MAX_SAT` | 0.3 | **policy on a measured fit**: twice the sampled radius (0.15); 0.5 was 3.3× and named as what broke the 18:03 run |
| `BLACKS_REACH` / `BLACKS_SLOPE` | 20 / 0.41 | **measured** from the `blacks` sweep's −20..0 leg. **Defined and exported but never used** in the pass |
| `TEMPERATURE_CAP` | 50 | **superseded** — `balanceAxis` has no fixed cap; referenced only by `test/grade_rules.test.cjs` |
| `FLOOR_MIN` / `TOP_MAX` | 1.5 / 98.5 | **invented** guards |
| `TOE_MARGIN` | 2 | **measured** (`channelToe._crushCap`: blue's own p1 at 2.7 left 0.02% floored, at 0.4 left 0.91%) |
| `LEVELS_CAP` | 0.25 | **invented** ("a black point above ~28 is not a lifted black, it is a picture with no black in it") |
| `WHEEL_LUMA_P1` / `WHEEL_LUMA_FLOOR` | table / 0.3 | **measured** (`shadowsWheelLuma`), interpolated rather than fitted |
| `ROLLOFF_DEPTH` | 0.35 | "one depth for both ends, from the ±0.5 sweep" — marked `ponytail`; **the black-end sweep only reached 0.2** |
| `HUE_BUMP_WIDTH` | 0.08 | **invented** |
| `SKIN_HUE_GAIN` / `_CAP` / `_MIN` / `_DONE` | 220 / 0.12 / 0.008 / 2 | gain **measured** across 4 clips (spread 181–272); the rest **invented** |
| `HSL_PAD.m` / `.cap` | `[[−1.5,−8],[11,−5]]` ×2.5 / 0.3 | **measured** on one key, then **scaled by a single fitted factor** from a 2.5–3× live spread; cap from owner feedback |
| `HSL_SAT_GAIN` / `HSL_SAT_RANGE` | 0.8 / `[50,100]` | gain **measured** on the live keys; range is **policy** (down only) |
| `LOG_SIGNATURE` | black ≥8, white ≤78, sat p99 ≤15, sat p50 ≤6 | **measured** on an A7S II XAVC S file and a dim Blackmagic clip, 2026-09-16 23:10 / 23:23 |
| `GUARD` / `FLOOR_SHARE` / `WHITE_CEILING` / `MAX_RENDERS` | 0.5·1.0 / 5 / 95 / 3 | **invented** policy; `WHITE_CEILING` raised from 92 because "92 blocked moves that were safe" |
| `SCENE_SAT_FLOOR` / `SCENE_SHARE` | 0.7 / 0.5 | **invented** ("half of it comes out, the rest is the objects") |
| `CRUSH_PCT` / `CLIP_PCT` / `FLAT_RANGE` / `CAST` / `RANK_SHARE` / `LEVEL_BANDS` | 1.0 / 0.5 / 60 / 2.5 / 0.03 / 5-30·30-65·65-95 | **invented** reading thresholds in `scopes.cjs` |

---

## 7. Known limits and open questions

- **One-clip calibration.** Every `_source` in `lumetri_sweeps.json` names a single frame. The
  Exposure/Temperature/Contrast frame is not even the same one as the Blacks/Whites/Shadows/Highlights/
  Tint/wheelBands/curve frame — `lumetri_sweeps.json._source` says so explicitly ("a different frame,
  not drift"). Nothing in this document has been cross-validated on a second picture.
- **No slider sweep exists on a second frame.** The only second-frame data in the whole file is
  Contrast's `p10/p90` addendum (C193 @15.39, six values −40..60, ±100/−50 **extrapolated**), and its own
  note says "**the ratio transfers, the absolute frame does not**."
- **`_blackPointResidual`: 1.99 IRE unexplained, and nothing explains it.** The 19:11 chain on C229
  @9.57 s ran `14.1 as read → 11.2 black balance → 9.58 curve 0.02 → 9.01 sliders → 11 read`. Every
  write in the batch was then measured against the black point on C220 @0.5 s and every one is **flat**:
  Tint p1 8.2 at all seven values; the Highlights wheel p1 8.2 at all four hues; the Luma vs Sat roll-off
  p1 8.2 at every depth to 0.2; the Master curve modelled to within 0.24 anchored or not. Shadows moves
  p1 0.08 a unit and was at 2.06; Contrast +40 moves it **down** ~2.9. **No single write accounts for
  1.99.** Conclusion in the file: it is model error from the one-clip calibration. **Open:** a
  whole-sequence run gives 18 `MODEL OFF BY` figures — whether they share a sign says whether there is a
  bias to fit or just per-picture spread. Not yet run.
- **`bands.blacks` goes blind as a channel crushes.** `readable` falls `100 → 80 → 35 → 5 → 0` in
  `channelToe` while `blacksRB` slides `−1.6 → −10.6` and the levels stay exact. `curveToe._bandBlind`:
  at x=0.2 the band is empty (`null`). "Do not 'correct' that drift" (`scopes.cjs` l.52–56). The pass
  reads the *levels*, but `verdict()`, `castAt()` and the pad nudges still read `rb`/`g` — **after** the
  black point has been set. There is no guard that refuses a cast reading below a `readable` threshold.
- **The wheel luma's behaviour when a channel is ALREADY near zero is unmeasured.** `shadowsLiftFor`
  l.267–272 says so outright: the sweep barely floors anything across its whole range (blue 0.01% at
  neutral, 0.35% at 0.25), so its bottom is **soft** and the straight-offset guard the code uses
  *overstates* the damage — "but that was measured on a frame whose lowest channel started at 4.7. How
  it behaves when a channel is already near zero is NOT measured, and guessing the second half is what
  got two changes reverted." The dry run on C229 (red's own p1 at 3.5) asked for an offset of 5.58 and
  would have put red at 0.
- **`shadowsWheelLuma._openQuestion`, unanswered:** does the median drag come back with the Contrast and
  Shadows sliders that run after it, or does it cost picture? "That is a live question, not an
  arithmetic one." `curve_sweep` now records p50 and p99 on every row so the next sweep need not borrow
  them from the 2026-09-15 block.
- **The Luma vs Sat roll-off is written at 0.35 and swept only to 0.2.** The trend is flat rather than
  shallow, so the extrapolation is argued safe, but 0.35 and 0.5 have not been read.
- **The Midtones pad has no usable matrix.** `castMatrix("midtones")` returns `[[null,null],[null,null]]`
  because it reads `redP50/greenP50/blueP50` keys that the `wheels` block does not contain. Nothing calls
  it today (`padsFor` is highlights-only, `predictPads` skips midtones), so it is latent, not live — but
  `SKILL.md`'s "calibrated, not yet driven" is wrong as written. The midtones cast is also the one thing
  `verdict()` reports as a *hint* rather than a note, because no measure separates a cast from the
  objects there.
- **The Shadows pad is calibrated and deliberately unused.** Its matrix is still fitted and still the
  best-measured of the three; the pass stopped using it for cause (§5 deviation 2). If a shadow cast ever
  needs a wheel again, the model is there — with a worst residual of 0.85 on the fitted rows.
- **`skinFor` is called with three arguments and accepts two.** `panel.js` l.1998 passes
  `key.attenuation` as a third argument; `grade_rules.cjs` l.502 declares `skinFor(m, from)`. The
  attenuation is silently dropped. Its outputs (`pad`, `saturation`) are also computed and then not
  written — only its null/non-null verdict is used, and the actual write is a Hue vs Hue bump.
- **`HSL_SAT_GAIN` and the `hslSaturation` sweep disagree by ~1.5×** (0.8 vs ~0.53 per 100 points
  downward). They were measured on different keys — the thin eyedropper key vs the pass's own
  hand-covering keys — and have never been reconciled.
- **The Master curve's top point is modelled but never written**, and `whiteInFor` exists only for the
  tests. The white point is set by sliders, which clip (Whites past +50) where the curve would not.
- **The scopes' colour space is an assumption.** `scopes.cjs` l.2–4 and l.11–12: values are read as SDR
  Rec.709 full range, "that is an assumption about the export, not verified against Lumetri's own
  readout", and a log/HDR/wide-gamut working space would need a calibration pass against Lumetri colour
  patches before these numbers could be quoted as Lumetri's. `SKILL.md` claims the numbers matched
  Lumetri's scopes on colour bars; the two statements have not been squared.
- **Global Saturation and Vibrance have no model and are never written.** `tested: false`, no sweep,
  no goal. A saturation problem is currently answered with white balance, contrast, or the keyed
  HSL Saturation — never the global slider.
- **Interactions are composed, not measured.** `grade_model.cjs` l.8–11: "the sweeps were measured one
  knob at a time from zero, so knobs applied together are composed sequentially and interactions are
  approximate; Premiere's tone mapping depends on content, so highlights predicted near 100 are less
  reliable than midtones." The confirm render is the only check on this.

---

# The relationship map — derived, 2026-09-17

The point of measuring every control is not a lookup table per frame. It is to know the **form** of each
control and how they interfere, so that given a reading the moves and their order are *calculated* rather
than searched for. Renders then confirm an answer instead of finding one.

## Each control's collateral

Computed from the sweep blocks in `src/lumetri_sweeps.json`: the largest move each slider makes on the
statistic it steers, against the total it makes on the other two tonal statistics.

| control | steers | moves it | tonal collateral | collateral / effect |
|---|---|---|---|---|
| exposure | median | 21.9 | 46.3 | **2.11** |
| shadows | black point | 9.4 | 16.0 | **1.70** |
| contrast | spread | 14.5 | 16.4 | 1.13 |
| temperature | Cb | 5.5 | 4.8 | 0.87 |
| whites | white point | 23.9 | 16.9 | 0.71 |
| highlights | white point | 16.9 | 10.6 | 0.63 |
| tint | Cr | 9.8 | 4.4 | 0.45 |
| blacks | black point | 12.2 | 4.0 | **0.33** |

Two things in that table are worth saying out loud:

- **Shadows is a bad black-point tool.** It moves the median *more* than the black point (+11.3 against
  +9.4). The code comment in `grade_rules.cjs` says this; the number is where it comes from.
- **Blacks is the most surgical control we have** (0.33) and the pass barely uses it — "lowering is not
  used automatically" in `SKILL.md`, from a run where it went 12 → 1 on one clip and 12 → 10 on the next.
  That instability is worth re-measuring as a *form* rather than left as a table, because if it has a
  clean form it is the best black-point slider by this measure.

## Order is set by three constraints, not one

A single "collateral" ranking is not the answer, and pretending it is would put white balance in the
middle of the pass. There are three independent reasons one move has to precede another:

1. **Collateral** — do not run a high-collateral tool *after* a low-collateral one, or it undoes what was
   just set. This is what the table above ranks. Exposure and Shadows are the ones to place early.
2. **Readability** — do not run a tool that *blinds* the statistic another tool needs before that reading
   is taken. A black point crushes the cast reading: `bands.*.rb` drops any pixel with a channel at 0, and
   measured on C229 it does not merely go blind but **inverts**, reading −12.5 → +0.4 as the frame is
   destroyed. This is why the pass cancels casts before it moves the black point, inverting the canon's
   order, and why `castTrust` exists.
3. **Headroom** — several controls spend the same finite resource, the distance between the lowest channel
   and zero. The channel toes (the only tool that can change parade *spacing*), the Master curve and the
   Shadows wheel luma all draw on it, and what one takes another cannot have. Measured across three
   frames, what each costs is frame-dependent: the curve's clean ceiling is luma p1 3.9 on C220, 18.8 on
   C187 and 11.0 on C229, while the wheel's cost runs 0.04 %, 0.01 % and *zero*.

Constraint 1 is a ranking, 2 is a partial order, and 3 is an allocation problem. Only 3 needs solving
rather than ordering, and it is the joint solve that is still unwritten.

## What a complete rule set buys

Every form known means the pass computes the whole move set from one reading, instead of writing, re-
reading and correcting. The current pass spends about three renders a clip — one to read, one to confirm,
often one to correct — and the correction passes exist precisely because the models are imperfect. The
19:24 run's chain showed ten of fourteen clips landing within ±1.1 of prediction with the corrections
absorbing the rest; the four that missed were the ones where a *headroom* allocation went wrong, not where
a form was unknown.

So the remaining work is not more calibration. It is: finish the forms (contrast done, whites and shadows
in flight), then solve constraint 3 properly.

---

# What we actually know, in picture terms — audit 2026-09-17, 22:00

The question "do we know the table exactly" has a short answer: **no — seven of roughly twenty-nine
controls have a FORM, and only those transfer.** Everything else is a table of levels measured on one
frame, or nothing. This is that audit, stated in what each control does to the *picture* rather than to a
statistic.

A **form** means we know the shape of the operation (a gain, a pivot, an offset, a toe) and can compute it
on footage nobody has swept. A **table** means we know what happened on one frame and are extrapolating.

## Known as a form — computable on any footage

| control | what it does to the picture | form | frames |
|---|---|---|---|
| **Whites** | Scales the whole picture about black. Brightens everything proportionally — a pixel at 80 moves four times as far as one at 20. Blows the top before it lifts the bottom. | `out = in × k`, no pivot. k: −100 0.750, −50 0.865, −20 0.945, +20 1.060, +50 1.152, +100 1.33 | C220, C202 |
| **Contrast** | Pushes the picture away from mid-grey. Darks get darker, lights lighter, and **the midtones move in whichever direction they already sit** relative to ~48. | `out = P + (in − P)k`, P≈48. k: −100 0.80 … +100 1.18 | C220, C202 |
| **Shadows** | Lifts or crushes the dark end while barely touching the top. Approximately a gain about the white point, but the midtones run ahead of it at the extremes. | `out = P + (in − P)k`, P≈95–100, **residual up to 1.7 IRE on the median** | C202 (+C220 table) |
| **Master curve bottom point** | Sets the black point exactly, holding the midtones if anchored. Clips everything below the point — the cost lands entirely on whichever channel is lowest. | `out = (v − 100x)/(1 − x)`, ≤0.6 IRE | C220, C187, C229 |
| **Channel curve toe** | Lowers **one** channel's bottom and nothing else. The only tool that changes the *spacing* between the parade's floors. Clips that channel. | same line, ≤0.21 IRE, isolation exact to the digit | C220, C229 |
| **Channel curve lift** | Raises one channel's floor. Clips nothing at all. The other half of a black balance. | `out = 100y + v(1 − y)`, ≤0.3 IRE | C220 |
| **Shadows wheel luma** | Lowers the shadow end as an offset. Costs essentially no clipping — but drags the midtones down with it, roughly a point for a point. | offset, frame-dependent magnitude (**does not transfer**: 6.6 vs 9.4 for the same move) | C220, C187, C229 |

## Known only as a one-frame table — do not trust off that frame

**Exposure, Temperature, Tint, Highlights, Blacks** — seven-point tables on C220 @0.5s. None has been
swept anywhere else, so none has a form. Two are worth naming:

- **Blacks** is the most surgical control in the set by collateral (0.33) and the pass barely uses it, on
  the strength of one unstable run (12 → 1 on one clip, 12 → 10 on the next). If it has a clean form it is
  the best black-point slider we have. Unmeasured.
- **Highlights** and **Whites** both steer the white point and must interact; nothing measures how.

**The three colour wheels' hue/sat pads** — a 2×2 response matrix fitted on C220 (`wheelBands`). The
**Midtones** matrix is *broken*, not merely unmeasured: `castMatrix("midtones")` reads `redP50/greenP50/
blueP50` keys that the block does not contain and evaluates to `[[null,null],[null,null]]`. Latent only
because `padsFor` is highlights-only since the black balance landed — but `SKILL.md` calls that wheel
"calibrated".

**HSL Secondary's temperature / tint / saturation** — swept on C227's hands inside a hand key only.
`HSL_SAT_GAIN = 0.8` disagrees with its own sweep by about 1.5× (the sweep implies ~0.53 per 100 points);
measured on different keys, never reconciled.

## Not measured at all

Global **Saturation** and **Vibrance** (`tested: false` in `PARAMS`). The **Master curve's top point**
(analytic only — `whiteInFor` is defined, exported and unused). **Hue vs Sat**, **Hue vs Luma**,
**Sat vs Sat**. The **HSL key** itself, **Show Mask**, **Denoise**, **Blur**.

## The interactions we have measured

- **Tonal sliders move the colour balance** (`castCoupling`): `blacksRB` shifts 4.7 across Shadows' range
  — 3.1× the 1.5 tolerance the balance was solved to — 2.3 across Whites, 1.6 across Contrast.
- **The black-point tools compete for one finite resource**, the distance from the lowest channel to zero,
  and what each costs is frame-dependent (`blackEndC229`, `curveToeC187`).
- **Skin hue rotation is not luma-neutral** — it cost C228 ~3 points of body contrast.
- **The cast statistic is destroyed by the black point**, and inverts rather than merely fading
  (`castTrust`).

## What is missing to "calculate it all"

1. A form for **Exposure, Temperature, Tint, Highlights, Blacks** — five sweeps on a second frame.
2. A form for the **wheel pads**, and a repair of the Midtones matrix.
3. The **headroom allocation** solved rather than ordered — the one genuinely unsolved problem.
4. **Interaction terms**: the cast coupling above is measured but not modelled, so it is still discovered
   by a confirm render instead of pre-compensated.
