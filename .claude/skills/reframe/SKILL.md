---
name: reframe
description: Use for any frame-size or aspect change (9:16, 4:5, 1:1, 16:9) and for "check the framing". The fixed order of operations: picture first on visible frames only, then captions, then graphics.
---

# Reframe

The order is fixed. Do not start a later step until the earlier one is right.

## 1. Picture first, visible frames only

1. `set_sequence_size` with the aspect asked for (footage fills, graphics fit; the panel checkpoints first).
2. `snapshot_moments`. It only picks moments where a shot is the visible picture. A talking head buried under b-roll is not judged there; its own visible moments are.
3. For each footage track that has clips (V1, V2...): `layer_frames` with that track. That is the layer alone: judge its placement for the shot alone. Subject where it belongs for the shape, head room, nothing cropped. Fix with `nudge_clip` and always pass the track. Look again.
4. `seam_frames`: the frame just before and just after every cut where the picture changes. The subject must not jump across a cut. Fix the shot that is off, not both.
5. Ignore captions and graphics in this step. Never move the subject to dodge a caption band or a title.

## 2. Captions

The caption band is a Premiere track setting; the panel cannot move it. Say once, in one line: put it at the bottom safe-zone line, as low as it fits, clear of everything (Captions panel, select all, position). If a caption sits over the subject after step 1, that is the caption's problem: say so and leave the framing alone.

## 3. Graphics

For each graphic track (V3, V4, V5...): `layer_frames` with that track. A layer that shows nothing alone is a mask or a hidden helper: leave it. Otherwise `nudge_clip` with that track into clear space: title zone at the top, never over a face, never in the caption zone, not overlapping another graphic. Check the composite with `preview_frames` at that time.

## 4. Report

One line: what frame it is now, which copy it is on, and that the original is untouched.
