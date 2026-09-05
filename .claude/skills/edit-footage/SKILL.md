---
name: edit-footage
description: Use when the editor asks to edit, assemble, rough-cut, or "do something with" footage, a bin, or clips. The core workflow: transcript, decisions, silences, understand the shots, lay b-roll.
---

# Edit footage

Work like an editor at the timeline. Short sentences, timecodes as m:ss, one question at a time. Prefer the tools; scripts only for what they don't cover.

1. **What's already known.** `list_analysis`. If transcripts, notes, prosody, or diarization files exist (from this panel or anything else), read them with a subagent before doing new work.
2. **Inspect.** The selected bin is the scope. `classify_clips` (no arguments) reports footage sizes and rates, speech coverage, and talking head vs b-roll.
3. **Ask once.** If no sequence exists or none was named: ONE question with concrete choices for settings (match the footage, `vertical`, `hd`) and a name. Then `create_sequence` with `insert_clips` true.
4. **Transcript.** `read_transcript` if Premiere has one (saved), else `transcribe_whisper`. Long transcripts: a subagent reads the file and returns what you ask for (the story beats, the best takes, where a phrase is). `find_in_transcript` for exact moments.
5. **Mute the b-roll.** `mute_clip_audio` on every file classify_clips called b-roll or silent. Say so in one line.
6. **Decide the story.** From the transcript: what to keep, in what order. This is the judgment step; write it down with `save_notes` (name: selects). Propose it in a few lines with timecodes and wait for the go.
7. **Cut the talking head.** `keep_only` with the chosen ranges, then `remove_fillers` (ums, stutters, repeats; plan then apply), then `remove_silences` with `preset: "social"` (looser only if asked). Report the new duration.
8. **Understand the b-roll.** For each b-roll clip, `preview_frames` at one moment (a quarter in) and write one line per clip: what it shows, motion, mood. `save_notes` (name: broll-notes). Reuse these notes next time instead of looking again.
9. **Check what you made.** After any reframe or b-roll placement, follow the `reframe` skill's order: picture first on visible frames only (`snapshot_moments`, `layer_frames`, `seam_frames`, fix with `nudge_clip`), then captions, then graphics.
10. **Lay the b-roll.** Where the words call for a picture, `place_broll` on V2, 3-6 s each, sound off, matching the shot to the sentence. Don't cover the first sentence or the last. Say what went where.
11. **Captions (when asked).** `transcribe_timeline` on the finished cut, then `create_captions`. Plain native captions, editable in the Captions panel.
12. **Report.** Two or three lines: what the piece is now, duration, and how to undo (Cmd+Z per step; the original sequence is untouched).

Never look at every frame. Pixels only where the words and the classification leave a question.
