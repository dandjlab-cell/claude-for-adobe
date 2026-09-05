---
name: reframe
description: Use for any frame-size or aspect change (9:16, 4:5, 1:1, 16:9) and for "check the framing". The fixed order of operations: picture first on visible frames only, then captions, then graphics.
---

# Reframe

The order is fixed. Do not start a later step until the earlier one is right.

## 1. Picture first, visible frames only

1. `reframe` with the aspect asked for, and `bin` when building from raw footage. One call: Premiere's own Auto Reframe tracks the subject into a new `<name> <aspect> [Claude]` sequence (the original is untouched), graphics are put back where the editor had them, and it returns the visible moments and the seams with CHECK lines. `motion: "static"` gives the panel's fill-and-centre instead. (`set_sequence_size`, `snapshot_moments`, `seam_frames` are its parts; use them alone only for a re-check.)
2. Read the moments it returned. It only picks moments where a shot is the visible picture. A talking head buried under b-roll is not judged there; its own visible moments are.
3. For each footage track that has clips (V1, V2...): `layer_frames` with that track. That is the layer alone: judge its placement for the shot alone. Subject where it belongs for the shape, head room, nothing cropped. Fix with `nudge_clip` and always pass the track. Look again.
4. `seam_frames`: the frame just before and just after every cut where the picture changes. The subject must not jump across a cut. Fix the shot that is off, not both.
5. Ignore captions and graphics in this step. Never move the subject to dodge a caption band or a title.

## 2. Captions

The caption band is a Premiere track setting; the panel cannot move it. Say once, in one line: put it at the bottom safe-zone line, as low as it fits, clear of everything (Captions panel, select all, position). If a caption sits over the subject after step 1, that is the caption's problem: say so and leave the framing alone.

## 3. Graphics

`set_sequence_size` kept every graphic, title and guide where the editor put it (position fraction kept, scale following the frame width) and listed each one's before/after. Read that list and `clip_transforms`. Move a graphic only if the crop pushed it out of the safe zone, with `nudge_clip` and its track (absolute `x`/`y` from `clip_transforms`). A title over a face is the editor's call: say it in one line, do not move it unasked. Guides (a mask, placement or safe-zone clip spanning the sequence) are never judged and never moved. Never re-place a graphic by eye; see `graphics-and-titles.md`.

## Named action (screen recordings, "make sure they see the dropdown")

When the editor names what the viewer must see, placement is arithmetic, not eye-work:
1. `list_analysis`: read the project's RULE files (safe-zone measurements, procedures). Print the safe rect in one line.
2. Find the beat: `find_on_screen` with the label that appears ("Codex"), then a smaller step around the span for the exact frame. `find_in_transcript` if it is spoken.
3. Define the region: the panel or window that holds the control, cursor travel and any open menu, in source pixels (from `clip_transforms`' source size and one look at a frame). Tight vs whole panel is the editor's call; default whole panel.
4. `fit_region` with that region and the safe band as target, `max_scale` 100 so text keeps its size. It applies the transform, reads it back, and reports CHECK and any blank canvas. Never nudge by eye after it; if CHECK fails, change the region or the cap.
5. Cut with `keep_only` around the beat (place first, then cut, so check frames are in final time).
6. `frames_across` at: before the beat, menu open, selection landing, after. Frames confirm; they do not measure.

## 4. Report

One line: what frame it is now, which copy it is on, and that the original is untouched.

## Files

- `graphics-and-titles.md`: what the tools keep for you, restoring by arithmetic when needed, the deterministic caption test, guides, MOGRT internals, and the 8-call fast path. Read it before reframing any sequence with graphic, title or guide tracks.
