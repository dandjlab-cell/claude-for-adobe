# Lumetri Color parameters (Premiere 26.x)

Read live from `AE.ADBE Lumetri` on a BRAW clip, 2026-09-15: **130 properties**, flat, in panel order.
Many are section headers (`false`), `Active` flags, or unnamed blobs. Index by `displayName` and
**always verify the read-back** — indices are a version-specific convenience, names are the contract.

```js
var lum = null;
for (var i = 0; i < clip.components.numItems; i++) {
  if (clip.components[i].displayName.indexOf("Lumetri") >= 0) { lum = clip.components[i]; }
}
var p = null;
for (var j = 0; j < lum.properties.numItems; j++) {
  if (lum.properties[j].displayName === "Exposure") { p = lum.properties[j]; }
}
p.setValue(1, 1);            // second argument 1 = update the UI
p.getValue();                // ALWAYS read back: a refused value comes back unchanged
```

Adding the effect first: `qeClip.addVideoEffect(qe.project.getVideoEffectByName("Lumetri Color"))`.

## Scalars — these work with the measure/solve/write loop today (`src/grade.cjs`)

| # | Name | Neutral | Section |
|---|---|---|---|
| 14 | Temperature | 0 | Basic Correction › White Balance |
| 15 | Tint | 0 | Basic Correction › White Balance |
| 16 | Saturation | 100 | Basic Correction |
| 19 | Exposure | 0 | Basic Correction › Tone |
| 20 | Contrast | 0 | Basic Correction › Tone |
| 21 | Highlights | 0 | Basic Correction › Tone |
| 22 | Shadows | 0 | Basic Correction › Tone |
| 23 | Whites | 0 | Basic Correction › Tone |
| 24 | Blacks | 0 | Basic Correction › Tone |
| 38 | Intensity | 100 | Creative › Look |
| 40 | Faded Film | 0 | Creative › Adjustments |
| 41 | Sharpen | 0 | Creative › Adjustments |
| 42 | Vibrance | 0 | Creative › Adjustments |
| 43 | Saturation | 100 | Creative › Adjustments |
| 45 | Tint Balance | 0 | Creative › Adjustments |
| 95 | Denoise | 0 | HSL Secondary › Refine |
| 96 | Blur | 0 | HSL Secondary › Refine |
| 101-105 | Temperature, Tint, Contrast, Sharpen, Saturation | 0/0/0/0/100 | HSL Secondary › Correction |
| 110-113 | Amount, Midpoint, Roundness, Feather | 0/50/0/50 | Vignette |

Verified to write and read back exactly, full range, no clamping: **Exposure, Temperature, Contrast**
(sweeps at ±100 / ±2). The rest are the same kind of control and are expected to behave the same way;
confirm with a sweep before leaning on one.

**Which statistic each one moves** is not guessable — measure it. The three that were measured:

| Parameter | Moves | Barely moves |
|---|---|---|
| Exposure | luma median (20.8 → 58.8 over -2..+2) | — but `max` saturates near 100, never steer on it |
| Temperature | R mean 37.0 → 60.6, B mean 34.9 → 18.3, cast Cr -0.1 → 13.8 | luma median (2.3 over the whole range) |
| Contrast | luma p99-p1 spread 59.6 → 87.1 | luma median (39.2 → 36.1) |

Steering Contrast by brightness, or Temperature by luma, reads as "nothing is happening".

## Not scalars — these need their value format decoded first

| # | Name | Observed value |
|---|---|---|
| 57, 60, 63, 66, 69 | Hue/Luma/Sat curve selectors | packed 64-bit-looking number (`18374686479671623000`) |
| 58, 61, 64, 67, 70 | Hue vs Sat / Hue / Luma, Luma vs Sat, Sat vs Sat | empty string — a blob |
| 84, 85, 86 | HSL Secondary Set / Add / Remove color | same packed form as the selectors |
| 13 | White Balance (the eyedropper) | packed (`18374897589125431000`) |
| 50-54 | RGB Curves | header + blob |
| 73-80 | Color Wheels & Match | header, `Face Detection`, `HDR White`, unnamed |
| 122-124, 128, 129 | Embedded LUTs, LUTAsset, LookAsset | blobs |

Curves and wheels are the obvious next capability; they are a format-decoding job, not a loop job.

## Premiere's own auto grade

| # | Name | Observed |
|---|---|---|
| 125 | SemanticAutoTone Progress | -1 (idle) |
| 126 | Auto Tone Analytics Data | JSON: `{"mAutoTonePressed":false,"mBlacks":0,...}` |

This is the **Auto** button in Basic Correction — Adobe's own ML pass. Untested from a script. If it can
be triggered, it is the obvious first move on a shot: let Adobe's model set the starting point, then
measure and refine from there rather than starting at zero.
