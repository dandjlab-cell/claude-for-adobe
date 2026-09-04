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
5. **Propose.** Two or three lines: what the footage is, what you would keep, the cut points with timecodes. Wait for the go.
6. **Cut.** `remove_silences` for dead air; the panel tools for moves; `run_extendscript` only for what no tool covers. Say what changed and how to undo it.

Never look at every frame. Pixels are for questions the audio and metadata could not answer.
