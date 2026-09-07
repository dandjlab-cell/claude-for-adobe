# Premiere's own mechanisms: what the panel can call, and what is the editor's key

The rule this file serves: **if Premiere already does it, call Premiere and spend reasoning on the result.** A job in
this list is never re-implemented by script or by looking at frames. Auto Reframe is the model: one call, Premiere's
subject tracking, a CHECK line, and the agent only judges the frames it returns.

Every name here was read from a live Premiere 26.3.2 (`surface-26.3.2.md`, dumped 2026-09-05) or from Premiere's own
shortcut table (`commands-26.md`). Nothing is from memory.

Status legend:
- **verified**: the panel runs it today and checks the result.
- **listed**: the method exists on this build (seen by reflection) but has not been run from this panel. Run it once
  on a working copy with a read-back before relying on it; then promote it here.
- **key**: no panel route. A command id with the editor's shortcut (default in `commands-26.md`, the editor's own via
  `premiere_shortcut`). Say the key or the menu path in one line and continue when it is done.
- **none**: not on any surface; do not look for a workaround unless the editor asks.

Two facts that decide the shape of everything below:
1. **Command ids are not callable.** All 1,231 `cmd.*` ids are keystrokes or menu clicks; premiere-map proved the
   dispatcher is never exposed to a panel. So the panel can never "press" Transcribe, Create captions, Remix or
   Scene Edit Detection through its command id. What it can call is the ExtendScript and QE object methods.
2. **QE reaches what ExtendScript does not.** Effects, transitions, razor, speed, move to track, render status,
   playback, undo. It is undocumented and can crash Premiere; every QE call goes through a tool with a read-back,
   never a loop of guesses.

## Picture

| Job | Premiere mechanism | Status | Call | CHECK / where reasoning starts |
|---|---|---|---|---|
| Reframe to 9:16, 4:5, 1:1 | Auto Reframe effect (Sensei subject tracking) per clip | verified | `reframe` tool: `qeClip.addVideoEffect(qe.project.getVideoEffectByName("Auto Reframe"))` on every footage clip, then `seq.isDoneAnalyzingForVideoEffects()` | applied/verified counts; the agent judges only the returned visible-moment frames |
| Reframe as a new sequence | `Sequence.autoReframeSequence(num, den, preset, name, nest)` | verified (builds a new sequence; needs a source sequence, so `reframe` uses the effect instead) | | |
| Where the subject is over time | Auto Reframe's keyframes | verified 2026-09-05 (`subject_path`) | ExtendScript `param.getKeys()` + `getValueAtKey()` on the clip's **Auto Reframe** component (params "Position" and "Generated Keyframes", identical); values are frame fractions; key times are **source time** (first key = in point + 5 frames), the tool converts to timeline time | key count and time base; the agent reads the path instead of judging head room from frames |
| Cut a clip at scene changes | `Sequence.performSceneEditDetectionOnSelection("ApplyCuts", true, "MediumSensitivity")` | verified 2026-09-05 (`scene_cuts`): a flattened export of a 5-cut edit came back as 6 clips on the exact cuts | select only that clip (`setSelected(1,1)`), call it, re-count for up to 90 s | clips after > before; the cuts are then clips for `seam_frames` and `morph_cut` |
| Stabilise | Warp Stabilizer effect | listed | `qeClip.addVideoEffect(getVideoEffectByName("Warp Stabilizer"))`, wait on `isDoneAnalyzingForVideoEffects()` | component present on the clip; analysis done |
| Fit / fill frame | `qeClip.setScaleToFrameSize()`, `projectItem.setScaleToFrameSize()` | listed | | Motion Scale read-back |
| Flip, crop, blur, key, colour | effects by name (`surface-26.3.2.md` lists 224 video effects: Crop, Horizontal Flip, Gaussian Blur, Ultra Key, Lumetri Color, Track Matte Key, Transform...) | listed | `addVideoEffect(getVideoEffectByName(name))`, then `qeComponent.setParamValue(param, value)` | `getParamValue` read-back |
| Lumetri preset | `app.project.applyLumetriPreset(...)`, `getAllLumetriPresetsList()` | listed | | |
| Auto Color / Auto Tone / Color Match | none scriptable; `cmd.clip.autocolor` (unbound), `cmd.color.autotone` (unbound) | key | | |
| Speed / duration, reverse, optical flow | `qeClip.setSpeed(...)`, `setReverse`, `setTimeInterpolationType`, `setFrameBlend` | listed (ExtendScript `getSpeed` is read-only) | | `qeClip.speed` read-back |
| Freeze frame | `cmd.clip.videooptions.addframehold` (unbound) | key | | |
| Generative Extend | `cmd.clip.genextend.*` | key | | |
| Frame as image | `qeSeq.exportFramePNG(time, path)` | verified (`preview_frames`, `snapshot_moments`, `layer_frames`, `seam_frames`) | | |
| Render status | `qeSeq.getRedBarTimes()` / `getYellowBarTimes()` / `getGreenBarTimes()` / `getEmptyBarTimes()`; `renderAll`, `renderPreview` | listed | | |

## Cut

| Job | Premiere mechanism | Status | Call | CHECK |
|---|---|---|---|---|
| Remove a range and ripple | Extract | verified (`extract_ranges`, `keep_only`); the 2026-09 wipes were the gap-closing pass, fixed 09-07 | `seq.setInPoint/setOutPoint`, read both back, then `qeSeq.extract()`; a range reaching the end is a tail trim; one-frame holes afterwards are closed by extending the previous clip's `.end`, never by Extract | removed length vs wanted, per range, with a trace of every call next to the project |
| Remove a range, leave a gap | Lift | listed | `qeSeq.left()` (QE's Lift; name as reflected) | |
| Close gaps | `cmd.sequence.close.gaps` (unbound) | key (the panel closes gaps its own way) | | |
| Razor at a time | `qeSeq.razor(time)` / `qeTrack.razor(time)` | listed (ExtendScript has none) | | clip count +1 |
| Ripple delete a clip | `qeClip.rippleDelete()` | listed | | |
| Trim, slip, slide, roll | `qeClip.roll`, `slip`, `slide`, `setStartPosition`, `setEndPosition`; ExtendScript `clip.start/end/inPoint/outPoint` assignment | listed (end assignment verified in `trimTail`) | | |
| Move a clip to another track | `qeClip.moveToTrack(...)`, `qeClip.move(...)` | listed (ExtendScript: `clip.move(time)` only) | | |
| Add / remove tracks | `qeSeq.addTracks(...)`, `removeVideoTrack`, `removeEmptyVideoTracks`, `removeEmptyAudioTracks` | listed | | `numVideoTracks` read-back |
| Insert / overwrite | `track.overwriteClip(item, seconds)`, `track.insertClip`, `seq.insertClip` | verified (`place_broll`) | | |
| Nest | `seq.createSubsequence(true)` then overwrite | listed | | |
| Link / unlink | `seq.linkSelection()`, `unlinkSelection()` | listed | | |
| Join through edits | `cmd.sequence.jointhroughedits` (unbound) | key | | |
| Default transition on every cut | `cmd.sequence.applydefaulttransitions` — Shift+D | key | | |
| Transitions by name | `qeClip.addTransition(qe.project.getVideoTransitionByName(name, true), atStart, "HH:MM:SS:FF")` (the shape shipped panels use); 144 video, 3 audio in `surface-26.3.2.md`. **Morph Cut** is Premiere's own fix for the jump cut every filler removal leaves | verified 2026-09-07 (`morph_cut`: ten Morph Cuts on a ten-cut talking head in 0.7 s); display name then match name (`matchnames.md`); only on seams the viewer sees (cover from the ledger) | | `qeTrack.numTransitions` before/after |
| Remix (retime music) | `cmd.clip.remix.*`, tool `cmd.tools.16Remix` | key | | |
| Multicam angle switch | **QE `sequence.multicam.changeCamera(n)`** with `enable`, `record`, `play`, `stop` on the same object (found by reflection 2026-09-07; the April note saying no surface exposes multicam was wrong) | verified 2026-09-07 (`multicam_switch`): on a nested sequence, `qeItem.setMulticam(true)` then `multicam.enable()` true, `multicam.changeCamera(2)` (a Number) true, a new piece cut at the playhead, the switch visible in Premiere | playhead to t, select the clip alone, `setMulticam(true)`, `enable()`, `changeCamera(n)` | Premiere's return values + V1 clip count + clip names after the cut; the frame comparison is supporting only (same-source angles look identical) |

## Sound

| Job | Premiere mechanism | Status | Call | CHECK |
|---|---|---|---|---|
| Timeline audio to a file | `seq.exportAsMediaDirect(path, preset, ENCODE_ENTIRE)` with Premiere's WAV preset | verified (`transcribe_timeline`, `analyze_audio`) | | |
| Enhance Speech | `cmd.clip.enableenhancespeech` (unbound); Essential Sound panel | key | | |
| Auto ducking, loudness match, tagging | Essential Sound panel; `cmd.clip.audiocategorization` (unbound) | key | | |
| Audio effects by name | `qeClip.addAudioEffect(getAudioEffectByName(name))`, also per track `qeTrack.addAudioEffect`; 94 listed: DeNoise, DeReverb, Vocal Enhancer, Hard Limiter, Dynamics, Parametric Equalizer, Loudness Meter, Multiband Compressor... | listed | | `numComponents` read-back |
| Clip gain / volume | `qeClip.staticClipGain`; Volume component "Level" via `setValue` | listed | | |
| Normalize track | `cmd.sequence.normalizetrack` (unbound) | key | | |
| Mute / solo tracks | `track.setMute(1|0)`; `qeSeq.muteTracks(...)` | verified (frames solo) | | |
| Auto Dub | `cmd.clip.autodub` (unbound) | key | | |
| Playback | `qe.startPlayback()`, `stopPlayback()`, `app.sourceMonitor.play(speed)`; `seq.setPlayerPosition(ticks)` | listed (position verified) | | |

## Words

| Job | Premiere mechanism | Status | Call | CHECK |
|---|---|---|---|---|
| Transcribe | Speech to Text: `cmd.clip.transcribeasset` / `cmd.sequence.transcribeasset` (unbound), Text panel > Transcribe | key; then `read_transcript` reads the saved project (Cmd+S) | | |
| Transcript job progress | `qe.getProgressContainerJSON()`, `qe.project.numActiveProgressItems` | listed: the doorbell for "transcription finished" without polling the file | | |
| Delete pauses / fillers | Text panel (`cmd.text.display.pauses`, `cmd.text.display.disfluencies`, `cmd.text.ripple.delete`) | key; the panel's `remove_pauses` / `remove_fillers` use the same definitions | | |
| Captions from the transcript | `cmd.text.create.captions` / `cmd.sequence.generatecaptions` (unbound) | key; the panel's `create_captions` lands the same native track from an SRT | | |
| Caption track from a file | `seq.createCaptionTrack(item, 0, format)` after `importFiles` | verified | | |
| Caption band position / style | Captions track style; `cmd.sequence.captiontracksettings` (unbound); project-file rewrite works but needs a reopen | key (held back) | | |
| Upgrade captions to graphics | `cmd.graphics.upgrade.caption.to.graphic` (unbound) | key | | |
| Translate captions | `cmd.text.translate.captions` | key | | |
| MOGRT text | `clip.getMGTComponent().properties.getParamForDisplayName(name)` | verified elsewhere (see reference.md) | | |
| Type-tool text (Source Text) | not writable from a panel | none | | |

## Project

| Job | Premiere mechanism | Status | Call | CHECK |
|---|---|---|---|---|
| New sequence from clips | `app.project.createNewSequenceFromClips(name, items, bin)` | verified (`create_sequence`, `reframe` from a bin) | | |
| Duplicate a sequence | `seq.clone()` | verified (working copies) | | |
| Sequence size / rate | `seq.getSettings()` + `setSettings(s)` | verified (`set_sequence_size`) | | |
| Bins, move, rename | `createBin`, `moveBin`, `renameBin`, `createSmartBin` | verified / listed | | |
| Import media | `app.project.importFiles(paths, 1, bin, 0)` | verified | | |
| Import a project / sequence | `app.project.importSequences(path, ids)`, `qe.project.importProject(...)` | listed (candidate for caption-style import without reopen) | | |
| Consolidate duplicates | `app.project.consolidateDuplicates()` | listed | | |
| Proxies | `item.canProxy()`, `hasProxy()`, `attachProxy(path, 0)`, `app.setEnableProxies(1)`; `cmd.clip.createproxies` is the editor's | listed (attach), key (create) | | |
| Colour labels | `item.setColorLabel(i)`, `getColorLabel()` | listed | | |
| Subclip | `item.createSubClip(name, in, out, ...)` | listed | | |
| Interpretation | `getFootageInterpretation()` (frameRate, pixelAspectRatio, alpha, VR), `setOverrideFrameRate`, `setOverridePixelAspectRatio` | listed | | |
| Metadata | `getProjectColumnsMetadata()` (verified), `getXMPMetadata` / `setXMPMetadata` (listed) | | | |
| Snapshot / checkpoint | `app.project.saveProjectSnapshot()`, `applyProjectSnapshot()` | listed (the panel checkpoints by copying the file) | | |
| Undo from script | `qe.project.undo()`, `redo()`, `undoStackIndex()` | listed | | |
| Synthetic items | `qe.project.newColorMatte`, `newBlackVideo`, `newTransparentVideo`, `newBarsAndTone` | listed | | |
| Export / encode | `app.encoder.encodeSequence(...)`, `qeSeq.exportToAME`, `exportDirect` | refused by the panel's script gate (only the WAV render tool uses it) | | |
| Workspaces / windows | `app.setWorkspace(name)`, `getWorkspaces()`, `isWindowVisible(id)` | listed | | |
| Feature flags | `qe.isFeatureEnabled(name)` | listed | | |

## When to use which, and in what order

The catalog is the vocabulary; this is the grammar. A job is a chain of Premiere's mechanisms with the agent's
judgement only at the joints. Each chain names the signal that selects it.

| Signal (what the agent can see) | Chain | Where judgement goes |
|---|---|---|
| One long clip whose source is a render or a screen recording (one clip, many shots; `media_info` or the name) | `scene_cuts` first, so shots become clips. Then everything below works per shot. | none until the cuts exist |
| Asked shape differs from the sequence shape (9:16, 4:5, 1:1) | `reframe` (Auto Reframe per clip) then `subject_path` per footage track, then `layer_frames` only to confirm, `seam_frames` at cuts. | only a y outside the band for the shape, or a jump across a seam; fix with `nudge_clip` |
| A named action on a screen recording ("they must see the dropdown") | `scene_cuts` (if one clip) then `find_on_screen` for the beat, `fit_region` for the placement, `keep_only` around it, `frames_across` to confirm | region choice and cap; never a nudge by eye |
| Two takes of the same line in the footage | none in Premiere | `find_takes` (utterances from the transcript, content-word overlap within a window, most complete take kept: words, fillers, finished ending) | the KEEP is a proposal: completeness plus delivery (energy, pitch movement, pace from the timeline render, ported from VO Studio); overrule with keep_only |
| Talking head, "tighten it" / "remove ums" | transcript (`read_transcript` if Premiere's exists, else `transcribe_whisper`) then `remove_pauses` / `remove_fillers`, then `morph_cut` with `all_seams` on the talking-head track | which pauses are breath and which are thought; the tool decides nothing about meaning |
| What the viewer sees at a moment (how much of V1 is hidden, by what) | Premiere's own clip data: Motion, Crop, Opacity, source size vs frame, Video Info Alpha, mask presence; for alpha layers (AE comps, MOGRTs) Premiere's renderer, composite vs base alone, once per file | verified 2026-09-07 (`visible_at`, `settle: true`): six cuts under two full-frame comps settled at 4% show-through, cached, instant on the second run | none: it is a lookup; masks remain the one case still settled by eye |
| Laughs, applause, reactions, music on the timeline | none in Premiere | `sound_events` (Apple's 303-class sound classifier over Premiere's own WAV render; segments per group with peak confidence; cached per cut). Calibrated in Premiere 2026-09-07: on a talking head with no music the classifier put "music" at 0.38 to 0.58 under "speech" at 0.8 to 0.9, so a label now counts only as the strongest in its window (music, noise) or above a higher bar under speech (laughter 0.55, applause 0.55, reactions 0.6); needs one run on a cut with a real laugh | which reaction becomes a cut, which pause is a beat |
| Premiere's own embeddings per clip (visual per sampled frame, audio per 0.3125 s) | Media Intelligence, preference `BE.Prefs.MediaIntelligence.AnalyzeImportedMediaForMISO`; cache decoded in premiere-map Round 249 | preference read/write verified (`getPref`/`setPref`, the panel asks once to turn it on); a reading tool is next | similar shots, scene grouping, b-roll to a reference frame; text search stays Premiere's |
| Deciding whether to hold on the speaker | none in Premiere | `speaker_check` (macOS Vision: head square to the lens, eyes, mouth, face size, Apple capture quality, per frame, other tracks hidden) | picking which line matters, and covering the line when the frames say the speaker is not selling it |
| Any edit at all | the panel re-checks the cut against the rhythm rules after every tool that changed the timeline and appends a RHYTHM block to that tool's result: holes on V1, gaps under half a second between b-roll (a flash), anything on screen under a second, and on vertical no b-roll inside the first second | fixing what it reports, in the same turn |
| A folder of raw footage and a shape or length ("make a 9:16 video", "a 20 s cut") | `rough_cut` (one call: sequence at the shape without tracking, render, Whisper, indexed transcript back), the model authors thoughts (recall pass), `audio_cut` with them (code: validate, measure, choose takes by fluency, cut restarts, trim crumbs, cut only between thoughts under the editors' rules; ported from House Tour Cut), then the story with `keep_only` on whole thoughts, `place_broll`, `reframe` (no bin) once, captions last. Tracking and frames are the expensive steps: never on the raw length | which lines carry the story and in what order, which b-roll covers which line |
| Shaky handheld shot | Warp Stabilizer by name (listed, not yet a tool) | none |
| Room noise or echo on the voice | audio effect by name: DeNoise, DeReverb (listed, not yet a tool); Enhance Speech is the editor's key | none |
| Captions asked for | `create_captions` after every cut is final; band position is the editor's Captions panel until the import route is verified | wording only |
| Anything with a command id and no method | `premiere_shortcut` for the editor's key, one line, continue on the DIRTY event | none |

Order inside a chain is fixed: cut before place, place before frame checks, captions last. A frame is looked at to
confirm a number Premiere gave, never to invent one.

## The next five to verify, in order (one at a time, on a working copy, with a read-back)

1. ~~Auto Reframe keyframe read~~ verified 2026-09-05: `subject_path`.
2. ~~Scene Edit Detection~~ verified 2026-09-05: `scene_cuts`.
3. ~~Morph Cut by QE~~ verified 2026-09-07: `morph_cut`.
4. **Razor / ripple delete by QE**: closes the two "no" rows in reference.md (split, move to track).
5. **Audio effect by name** (DeNoise, Hard Limiter): sound cleanup as a tool with `numComponents` read-back.

Each becomes a tool with a CHECK line, then its row here moves to verified. Do not promote a row without a run.
