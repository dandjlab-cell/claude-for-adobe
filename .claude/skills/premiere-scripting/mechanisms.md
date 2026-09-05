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
| Where the subject is over time | Auto Reframe's Motion keyframes | listed | `qeComponent.getParamKeyframes(paramName)` on the clip's Auto Reframe / Motion component; ExtendScript `param.getKeys()` + `getValueAtKey()` | replaces every "look at the frame and judge head room" step once read |
| Cut a clip at scene changes | `Sequence.performSceneEditDetectionOnSelection(action, linkedAudio, sensitivity)` | listed (present on 26.3.2 ExtendScript; the old note said UXP-only) | select the clip (`clip.setSelected(1,1)`), call it, count clips before/after | clips after > before; the cuts are then clips for `seam_frames` |
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
| Remove a range and ripple | Extract | verified (`extract_ranges`, `keep_only`) | `seq.setInPoint/setOutPoint` then `qeSeq.extract()`; a range reaching the end is a tail trim instead (Extract at the last frame wipes the timeline) | removed length vs wanted, per range |
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
| Transitions by name | `qeClip.addTransition(transition, ...)`; 144 video, 3 audio in `surface-26.3.2.md`. **Morph Cut** is in the list: Premiere's own fix for the jump cut every filler removal leaves | listed | | `qeTrack.numTransitions` |
| Remix (retime music) | `cmd.clip.remix.*`, tool `cmd.tools.16Remix` | key | | |
| Multicam | `qeClip.setMulticam`, `canDoMulticam`; angle switching is not exposed | listed / none | | |

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

## The next five to verify, in order (one at a time, on a working copy, with a read-back)

1. **Auto Reframe keyframe read** (`getParamKeyframes` / `getKeys`): removes eye-work from the reframe skill.
2. **Scene Edit Detection** (`performSceneEditDetectionOnSelection`): a screen recording becomes cuts without OCR.
3. **Morph Cut by QE** (`addTransition`): the jump cut after every pause and filler removal, fixed by Premiere.
4. **Razor / ripple delete by QE**: closes the two "no" rows in reference.md (split, move to track).
5. **Audio effect by name** (DeNoise, Hard Limiter): sound cleanup as a tool with `numComponents` read-back.

Each becomes a tool with a CHECK line, then its row here moves to verified. Do not promote a row without a run.
