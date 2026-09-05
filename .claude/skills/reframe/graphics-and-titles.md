# Reframe: graphics, titles and guides

Companion to SKILL.md. Read this before any `set_sequence_size` on a sequence with graphic, title or guide tracks. Distilled from a 9:16 to 4:5 session on 2026-09-05 that spent 25 calls re-placing one title by eye.

## The one rule

A graphic's placement is an editorial decision that already exists in the project. Never re-place a graphic by eye. Read where it is, keep it there, move it only when the crop pushed it out of the safe zone, and say so.

## What the tools do now

- `set_sequence_size` reframes FOOTAGE only (fill or fit, centred). Graphics, titles and guides keep their position fraction, and their scale follows the frame width, so a title laid out against the width stays the same size when only the height changes. The result lists every graphic's before/after position and scale.
- `clip_transforms` is the ground truth: every video clip's Motion Position (frame fractions, 0.5,0.5 = centre) and Scale (% of native), GRAPHIC or footage, for the active sequence or a named one. Call it before and after `set_sequence_size` when graphics matter. To see the untouched original after the panel duplicated, pass the original's name.
- `nudge_clip` takes absolutes (`x`, `y`, `scale_to`) as well as deltas. A restore is one call, no arithmetic.
- `snapshot_moments` marks GUIDE clips and never picks a moment for them.

## Restoring, if ever needed

Proportional is the default: keep the position fraction. Crop-consistent (`y_new = (y_old * H_old * s - crop_top) / H_new`, `s = max(W_new/W_old, H_new/H_old)`, `crop_top = (H_old * s - H_new) / 2`) only for something pinned to the picture (an arrow, a callout). For a 1080x1920 to 1080x1350 crop it puts a title at 0.190 to 0.059, hard against the top edge, which is why it is not the default.

Then leave it alone. A 9:16 placement stands in the new frame unless the crop pushed it out of the safe zone. A title over a face in the first seconds is the editor's call: say it in one line, do not move it unasked.

## Guides

A clip named like `*mask*`, `*placement*`, `*safe*`, `*guide*`, `*template*` that spans the whole sequence is the editor's safe-zone template. It is never picture, never judged, never moved. If it renders when soloed, it beats any generic safe-zone number for where graphics may sit.

## What is a caption and what is a graphic

1. `sequence_overview` says what exists. Text listed as a clip on a video track is a graphic and can be nudged. Text on screen that is absent from the overview is a Premiere caption track.
2. Any one of these settles it: the text is not in `sequence_overview`; the selection line reports `"SyntheticCaption"`; the text shows at a time where no graphic clip exists; the text does not move when the suspected clip is nudged.
3. A render is not evidence about a graphic. Caption text appears in every render, solo or not, because captions are not a video track. A solo frame that still shows a title means the solo was not honoured (the tool says so) or the title is a caption; read `clip_transforms`.
4. The caption band is a Premiere track setting the panel cannot move. Say once where it should go (bottom safe-zone line, as low as it fits) and continue.

## Inside a MOGRT

Moving a MOGRT with `nudge_clip` moves the whole comp. Text position inside it is a Graphic Parameters (`AE.ADBE Capsule`) property (Offset, Anchor X/Y), not a nudge. List the parameter names first, then read the one you need; never dump values wholesale.

## A correction is a claim too

Before saying where something was, or what something is, read it (`clip_transforms`, `sequence_overview`). Before reversing yourself, read it again. Say "that's where the reframe put it" when that is all you know.

## Fast path

About eight calls for a cut with graphics:

1. `sequence_overview`: what exists, which text is caption-track, which clips are guides.
2. `clip_transforms`: where everything is.
3. `set_sequence_size`: footage reframed, graphics kept; read its before/after list.
4. `snapshot_moments`: visible frames only; picture judged here.
5. `nudge_clip` on picture only, only where the crop actually cuts something.
6. `seam_frames`: subject continuity across cuts.
7. Graphics: nothing, unless step 3 shows one outside the safe zone; then `nudge_clip` with `x`/`y` from step 2.
8. `snapshot_moments`: one composite check.

Graphics get zero look-nudge-look loops.
