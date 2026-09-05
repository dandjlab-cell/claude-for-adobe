# Premiere first: which of Premiere's own features to use, and when ours

The rule: if Premiere has a feature for the job, use it. Scriptable features are wrapped in a tool. Features that
cannot be triggered from a panel are the editor's click: say the exact menu path in one line, then continue
when it is done (the panel watches the project file). The panel's own engines exist for what Premiere cannot be
told to do from a panel, or for numbers Premiere does not give back.

| Job | Premiere's feature | From the panel | Panel's own | Use which |
|---|---|---|---|---|
| Change aspect (9:16, 4:5, 16:9) | Auto Reframe (Sensei subject tracking, keyframed motion) | scriptable: `reframe` (default `motion: track`) | static fill-and-centre (`motion: static`); `fit_region` for a named action | Premiere's by default. `fit_region` when the editor names what must be seen or tracking follows the wrong thing. Static for a locked-off shot. |
| Transcript of source clips | Speech to Text (Text panel > Transcribe) | read from the saved project (`read_transcript`); cannot be triggered | Whisper: `transcribe_whisper` | Premiere's when it exists or the editor can click Transcribe + Cmd+S. Whisper when there is none and the editor prefers not to click. |
| Exact transcript of a cut timeline | none (Premiere's is per clip) | `transcribe_timeline` renders the mix with Premiere's own WAV preset | Whisper on that render | Ours; Premiere renders, Whisper reads. |
| Remove pauses / silences | Text panel > Delete all pauses (gaps in the transcript, 0.75 s default) | cannot be triggered from a panel | `remove_pauses` (same definition), `remove_silences` (voice detection on the audio, works without a transcript) | Premiere's if the editor is in the Text panel anyway: say "Text panel > ... > Delete all pauses". Otherwise ours: same numbers, one History step per range, and it works before any transcript exists. |
| Remove filler words (um, uh) | Text panel filler-word detection and delete | cannot be triggered from a panel | `remove_fillers` (also stutters and repeats) | Premiere's when the editor is in the Text panel and the transcript is Premiere's: say the click. Ours when the transcript is Whisper's, when repeats and stutters matter, or when the editor asked the panel to do it. |
| Captions | Text panel > Create captions from transcript | cannot be triggered; SRT import + `createCaptionTrack` is | `create_captions` (SRT -> native caption track) | Ours, landing as a native caption track the editor edits in Premiere. |
| Caption band position / size | Captions track style, Essential Graphics | not scriptable through any panel API; the project file holds it (decoded) but rewriting needs a project reopen | none shipped yet | Editor's click for now (track style or position in the Captions panel). Candidates: captions placed on import (TTML regions), track styles. |
| Cut a range, keep ranges | Extract (QE) | `extract_ranges`, `keep_only` | | Premiere's Extract through the tools; never rebuild cuts by script. |
| Place b-roll | overwrite edit | `place_broll` (Premiere's overwriteClip, other tracks locked) | | Premiere's. |
| A frame as an image | Export Frame | `preview_frames`, `snapshot_moments`, `frames_across`, `layer_frames`, `seam_frames` | | Premiere's renderer, always. |
| Audio of the timeline | Export with Premiere's preset | `transcribe_timeline`, `analyze_audio` | | Premiere's renderer. |
| Where a subject is over time | Auto Reframe's generated Motion keyframes | `clip_transforms` (static values today; keyframe read unverified) | none yet | Premiere's. Reading keyframes is the next step; a face detector would be the fallback, not the first choice. |
| Text on screen, when it appears | none | | `find_on_screen` (macOS's text recognizer) | Ours, built on macOS. |
| Speech coverage, talking head vs b-roll | none | | `classify_clips` (voice detection) | Ours. |
| Scene cuts inside one clip | Scene Edit Detection | not scriptable (unverified) | none | Editor's click; then the cuts are clips and `seam_frames` sees them. |
| Sound quality (Enhance Speech, loudness, ducking) | Essential Sound | effects can be added by QE with the editor's click; names must be enumerated first (unverified per effect) | `analyze_audio` for numbers only | Premiere's, applied by the editor or by a QE script after enumeration. |
| Stabilise, colour, match colour | Warp Stabilizer, Lumetri auto buttons | effect add by QE (unverified); auto buttons not scriptable | none | Premiere's, editor's click. |
| Undo | History | every tool step is one History step; non-undoable calls are checkpointed first | file checkpoints | Premiere's; the panel adds checkpoints for what History cannot undo. |

"Cannot be triggered" means: no ExtendScript or QE call reaches it from a panel. Do not write scripts to
imitate those features; say the click. "Unverified" means: nobody has run it from this panel; enumerate names
with a read-only script first (premiere-scripting SKILL.md), never guess.
