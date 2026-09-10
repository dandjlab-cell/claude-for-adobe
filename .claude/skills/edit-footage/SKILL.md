---
name: edit-footage
description: Use when the editor asks to edit, assemble, rough-cut, or "do something with" footage, a bin, or clips. The core workflow: transcript, decisions, silences, understand the shots, lay b-roll.
---

# Edit footage

Work like an editor at the timeline. Short sentences, timecodes as m:ss, one question at a time. Prefer the tools; scripts only for what they don't cover.

Read `transcript_index` before authoring thoughts: it presents intact dialogue, available measured delivery and optional scoped speaker annotations, followed by the original word indices. `rough_cut` already returns this presentation. Use dialogue as the primary evidence; measurements are fallible context, never emotion labels or permission to delete. Missing diarization is UNKNOWN, not evidence of one speaker. Do not infer cross-clip identity from repeated speaker labels.

**The order for "make me a 9:16 (or 4:5, 16:9) video from this folder".** Detailed tracking and frame checks come last, once, on what survives. The requested duration guides story selection before applying editorial cuts. Never run Auto Reframe,
snapshot_moments or seam_frames on six minutes of raw footage that will become one.
1. `rough_cut` with the talking-head bin and the shape. For individually selected Project clips, omit `bin`: classification and creation use those exact clips and do not require an open sequence. ONE call: a named Cleanup sequence at the shape without tracking, measured silence cleanup preserving takes and detected sound, then a verified native Editorial duplicate. Only Editorial is transcribed and returned as indexed words. Both sequences stay with the footage, preferring an existing nearby sequences/cuts/edits bin. Preserve Cleanup; all following decisions belong on Editorial. Do not run another silence pass.
2. **Author the thoughts** (your recall pass, the one model step): every word in exactly one thought, in source order; label = what was said, a concrete action or idea, never a sentiment; kind = answer, or production for between-take chatter, greetings, crew talk, false starts you can see; retake_of = the id of the earlier thought that makes the same point, in the same words or in other words ("a lot of room to go" and "more room to grow" are one point twice: link them). Do not pick winners; the code measures fluency and delivery and chooses.
3. `audio_cut` with those thoughts, report first: the code validates the indices, measures delivery per word, chooses each take by fluency (fewer restarts, less pause, faster), cuts failed restarts inside a thought, trims crumbs only when the audio agrees, and cuts only between thoughts under the editors' rules (cut-in after a 0.3 s pause; never a cut that removes only a second of silence; 1-2 s pauses kept and flagged). Read it for complete meaning. **For a duration-limited request, keep this report unapplied:** choose the coherent story from its resolved kept ranges, including all pieces needed to preserve each selected thought. Do not apply a broad intermediate take-cleanup cut. Without a duration limit, apply the full report with `audio_cut` only when that is the requested edit. No further silences, fillers or takes pass.
4. The story: choose the complete lines that carry one point within the requested length. Use the report's resolved boundaries; never invent new word cut points.
5. For a duration-limited request, `keep_only` dry_run with only those story ranges; confirm the planned result is below the limit with room for frame rounding, then apply the same ranges. Confirm the actual duration before `speaker_check` on the surviving key line. The plan labels REMOVE ranges: those are discarded gaps, not inputs to keep_only. `sound_events` before cutting any pause on a conversation.
6. B-roll from its bin over the lines that call for it (`place_broll`), to the rhythm rules.
7. Only now `reframe` (tracking) on the cut, then `subject_path`, one `snapshot_moments`, `seam_frames` at the real seams (`visible_at`), captions last.

For an audio cut on an existing timeline: `transcribe_timeline`, `transcript_index`, author, `audio_cut`. Never `remove_silences` + `remove_fillers` + `find_takes` one after another: that leaves words hanging. If `rough_cut` fails, say what it reported and stop; never rebuild its steps by hand.

**B-roll lives in its bin.** A bin named like b-roll (B-roll, Broll, cutaways) IS b-roll: `create_sequence` and `rough_cut` never lay its clips on V1 (they wait for `place_broll` over the talking head) and `classify_clips` need not prove it. With such a bin selected, the talking head is its sibling bin or the parent bin's other clips. Tell the editor once that keeping b-roll in its own bin or track makes every later step more accurate.

**Transcripts belong to source clips, not timelines.** A new or re-cut sequence from the same footage already has its transcript: `read_transcript` maps each clip's words into the new timeline. Never re-transcribe source clips because the timeline changed. For an exact transcript of a CUT timeline (captions, precise timing, clips without transcripts) use `transcribe_timeline`; the other transcript tools then use it for that cut. A transcript file `list_analysis` marks STALE describes an older cut: call `read_transcript` again instead of reading it. If `read_transcript` reports no transcript or a stale save, tell the editor exactly: transcribe in the Text panel, then Cmd+S, then ask again.

**Premiere first.** If Premiere has a feature for the job, use it: the scriptable ones are tools (`reframe` = Auto Reframe, `extract_ranges` = Extract, `frames` = Export Frame, `place_broll` = overwrite edit); the ones a panel cannot trigger (Transcribe, Delete all pauses, filler-word delete, Create captions, caption style, Enhance Speech) are the editor's click: say the menu path and their key (`premiere_shortcut`) in one line and continue when it is done. `premiere-scripting/mechanisms.md` is the catalog.

**Read-heavy steps go to a subagent** (a long transcript, many clips, a long overview): it has the same tools on a cheaper model and returns a short answer. Keep the main conversation to decisions and edits.

The full workflow when the request is open-ended:

1. **What's already known.** `list_analysis` once, with default scoped lookup. It follows selected clips/bins or the active timeline. Reuse only matching transcripts, notes, prosody or diarization after verifying identity. Read relevant project guidance from its titles; skip unrelated chats, tests, old edits and handoffs. No matching files is a valid result: continue with the footage, never expand to `all:true` merely to find something to read.
2. **Inspect.** The selected bin is the scope. `classify_clips` (no arguments) reports footage sizes and rates, speech coverage, and talking head vs b-roll.
3. **Ask once.** If no sequence exists or none was named: ONE question with concrete choices for settings (match the footage, `vertical`, `hd`) and a name. Then use the two-sequence `rough_cut` workflow above.
4. **Transcript.** `read_transcript` if Premiere has one (saved), else `transcribe_whisper`. Long transcripts: a subagent reads the file and returns what you ask for (the story beats, the best takes, where a phrase is). `find_in_transcript` for exact moments.
5. **Mute the b-roll.** `mute_clip_audio` on every file classify_clips called b-roll or silent. Say so in one line.
6. **Decide the story.** From the transcript: what to keep, in what order. This is the judgment step; write it down with `save_notes` (name: selects). Propose it in a few lines with timecodes and wait for the go.
7. **Cut the talking head.** On Editorial, author thoughts and run `audio_cut` report. For a duration-limited video, select the story from its resolved ranges and plan/apply only those with `keep_only`; otherwise apply the requested full audio cut as above. Preserve Cleanup. Report the new duration.
8. **Understand the b-roll.** For each b-roll clip, `preview_frames` at one moment (a quarter in) and write one line per clip: what it shows, motion, mood. `save_notes` (name: broll-notes). Reuse these notes next time instead of looking again.
9. **Check what you made.** After any reframe or b-roll placement, follow the `reframe` skill's order: picture first on visible frames only (`snapshot_moments`, `layer_frames`, `seam_frames`, fix with `nudge_clip`), then captions, then graphics.
9b. **Find the line that carries the video, then check the speaker on it.** Read the transcript and pick the one or two sentences the whole cut exists for: the claim, the turn, the payoff. Not the longest, the one a viewer would quote. Then `speaker_check` across that span, with the track the speaker is on. It reads the face with macOS's own vision: head square to the lens, eyes open, mid-word, face size, and Apple's capture quality per frame.
    - Usable frames and the head square to the lens: stay on the face for that line. That is the moment the person sells it, and b-roll over it throws the line away.
    - Turned away, blinking, soft or badly lit: cover it with b-roll and keep the voice. Say why in one line.
    - No face at all: the wrong track was read, or the shot is not a talking head.
    The tool measures geometry and image quality, never mood. Conviction is in the voice and the words: `analyze_audio` for how loud and fast the line is against its neighbours, and the sentence itself for what it says. A line that is louder, slower and followed by a pause is usually the one to hold on.

10. **Lay the b-roll, to a rhythm.** Where the words call for a picture, `place_broll` on V2, 3-6 s each, sound off, matching the shot to the sentence. Don't cover the last sentence. The rhythm rules are not preferences and the panel checks every edit against them, reporting any breach in the tool's own result:
    - **Never leave a few frames of face between two b-roll clips.** A gap under half a second reads as a flicker. Either hold the talking head for at least half a second, or extend the earlier clip so the two meet.
    - **Nothing on screen for less than a second.** Under that nobody reads it. Lengthen it or drop it.
    - **Vertical is a scroll stop.** If the video is taller than it is wide and b-roll exists, something must move inside the first second. The face alone rarely holds an open on social.
    - **No holes on V1.** Black between talking-head moments is a bug in the cut, not a beat. Fix it before judging anything else.
    A RHYTHM block in a tool result is work to do, not a note. Fix it in the same turn and say what you changed.
11. **Captions (when asked).** `transcribe_timeline` on the finished cut, then `create_captions`. Plain native captions, editable in the Captions panel.
12. **Report.** Two or three lines: what the piece is now, duration, and how to undo (Cmd+Z per step; the original sequence is untouched).

Never look at every frame. Pixels only where the words and the classification leave a question.
