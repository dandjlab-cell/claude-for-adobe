---
name: edit-footage
description: Use when the editor asks to edit, assemble, rough-cut, or "do something with" footage, a bin, or a set of clips, including finding the talking head or picking b-roll. Repeatable inspect-ask-create-diagnose-propose flow.
---

# Edit footage

Work like an editor sitting at the timeline. Short sentences, timecodes as m:ss, one question at a time.

1. **Inspect.** If the message carries a Premiere selection, that is the bin or the clips to work on. `project_bins` to see the tree, then `classify_clips` with the named bin (or without a bin if a sequence is already active). This reports footage sizes and frame rates, which files carry speech, and a talking head / b-roll / mixed / silent guess with confidence.
2. **Ask once.** If no sequence exists yet, or the editor did not name one, ask ONE short question with concrete choices: sequence settings (match the footage as reported in step 1, or 9:16 1080x1920, or something else) and a name. Do not create anything before the answer.
3. **Create.** `create_sequence` with the chosen settings; `insert_clips` true gives a starting assembly in bin order.
4. **Diagnose.** `transcribe_whisper` (or `read_transcript` when Premiere already has one, saved with Cmd+S). `preview_frames` only on clips marked "look at a frame", one frame each, about a quarter of the way in. `analyze_audio` only if levels matter.
5. **Mute the b-roll.** Every clip classify_clips called "b-roll / little dialogue" or "silent / music": `mute_clip_audio` with those source files, on the working copy. Tell the editor in one line that you muted the b-roll audio and why: keeping the talking head's sound alone makes silence cuts, pauses, and transcript work accurate. Recommend keeping b-roll apart from the talking head, on its own track (V2 with muted audio) or in its own bin, because every later step gets easier.
6. **Propose.** Two or three lines: what the footage is, what you would keep, the cut points with timecodes. Wait for the go.
7. **Cut, deterministically.** Known timecodes: `keep_only` or `extract_ranges`. A phrase: `find_in_transcript` first, then the range tools. Air: `remove_silences` with `preset: "social"`.
8. **Cut, social-tight by default.** Unless the editor asks for a looser feel, cut like a social edit: almost no air. `remove_silences` with `method: "vad"`, `min_silence_s: 0.3`, `pad_s: 0.04` (the same engine as the Cut silences button, just tighter). Dry run, one line, go, apply. Then the panel tools for moves; `run_extendscript` only for what no tool covers. Say what changed, the new duration, and how to undo it.

Never look at every frame. Pixels are for questions the audio and metadata could not answer.
