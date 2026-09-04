# Premiere ExtendScript reference for the panel

Legend for the source tag on each row:
- **panel**: the panel's own host script runs this in production.
- **cep**: proven in another CEP panel's host script (MOGRT text, SRT captions).
- **docs**: community ExtendScript docs (ppro-scripting.docsforadobe.dev), not run from this panel.
- **note**: an internal capability matrix; treat as a lead, verify with a read first.
- **unverified**: signature or behaviour not confirmed anywhere; write an enumerating read before relying on it.

## The three surfaces, and which one you have

| Surface | From this panel | Notes |
|---|---|---|
| ExtendScript (ES3, synchronous) | yes, via `run_extendscript` | Supported through 2026, then deprecated. Blocks the UI while running. |
| QE DOM (`qe.*`) | yes, with a warning | Undocumented, unstable, can crash Premiere. Used for extract / ripple only. |
| UXP (`require("premierepro")`) | no | A separate plugin type. Nothing in this table needs it; see the UXP-only list at the end. |

## Time and collections

- 1 second = 254016000000 ticks. `var T = 254016000000;`
- `new Time()` then `t.ticks = String(ticks)` or `t.seconds = 12.5`. `t.ticks` is a String; `t.seconds` a Number.
- `clip.start`, `clip.end`, `clip.inPoint`, `clip.outPoint` are Time objects (read/write). `clip.duration` read-only.
- `seq.end` (String ticks), `seq.timebase` (String ticks per frame). Frame duration in seconds = `Number(seq.timebase) / T`.
- `seq.getPlayerPosition()` returns Time; `seq.setPlayerPosition(String(ticks))`.
- `seq.setInPoint(seconds)`, `seq.setOutPoint(seconds)`; `seq.getInPoint()` / `getOutPoint()` return seconds as strings.
- Collections index with `[i]` and count with `.numItems` (clips, children), `.numTracks`, `.numSequences`; `getSelection()` returns an array with `.length`.
- Snap a seconds value to a frame edge before setting in/out points: `Math.round(sec / F) * F` where `F = Number(seq.timebase) / T`.

## Objects and property names

**app / project**: `app.project`, `.name`, `.path`, `.activeSequence`, `.rootItem`, `.sequences[i]` / `.numSequences`,
`.openSequence(sequenceID)`, `.createNewSequenceFromClips(name, arrayOfItems, bin)`, `.createNewSequence(name, idString)`,
`.deleteSequence(seq)` (non-undoable), `.importFiles([paths], suppressUI, targetBin, asNumberedStills)` (non-undoable),
`app.getCurrentProjectViewSelection()` (array of ProjectItems selected in the Project panel), `app.enableQE()`.

**ProjectItem**: `.name` (r/w), `.nodeId`, `.type` (1 clip, 2 bin, 3 root, 4 file; the panel compares numbers), `.children`,
`.createBin(name)`, `.moveBin(targetBin)`, `.renameBin(name)`, `.getMediaPath()`, `.findItemsMatchingMediaPath(path, 1)`,
`.getProjectColumnsMetadata()` (string; regex out `Column.Intrinsic.VideoInfo`, `MediaTimebase`, `MediaDuration`),
`.getXMPMetadata()` / `.setXMPMetadata(xml)` (non-undoable), `.getColorLabel()` / `.setColorLabel(i)`, `.isSequence()`,
`.isMultiCamClip()`, `.getMarkers()`, `.createSubClip(name, start, end, hasHardBoundaries, takeVideo, takeAudio)`.
Never change a project item's in/out points from the panel.

**Sequence**: `.name` (r/w), `.sequenceID`, `.projectItem`, `.videoTracks`, `.audioTracks`, `.markers`, `.end`, `.timebase`,
`.getSettings()` (object with `videoFrameWidth`, `videoFrameHeight`, `videoFrameRate`, ...), `.setSettings(obj)` (non-undoable),
`.clone()` (duplicate appears in `app.project.sequences`; find it by a sequenceID you did not see before), `.getSelection()`,
`.createSubsequence(ignoreTrackTargeting)`, `.createCaptionTrack(item, startSeconds, Sequence.CAPTION_FORMAT_SUBTITLE)`,
`.importMGT(path, ticksString, videoTrackIndex, audioTrackIndex)`, `.insertClip(item, time, vIdx, aIdx)`, `.linkSelection()`, `.unlinkSelection()`.

**Track**: `.clips`, `.setMute(bool)`, `.isMuted()`, `.setLocked(0|1)`, `.isLocked()`, `.setTargeted(bool, updateUI)`, `.isTargeted()`,
`.insertClip(item, time)`, `.overwriteClip(item, time)`.

**TrackItem (clip on the timeline)**: `.name` (r/w), `.nodeId`, `.projectItem`, `.mediaType` ("Video" | "Audio"), `.type` (1 video, 2 audio),
`.start` / `.end` / `.inPoint` / `.outPoint` (Time, r/w), `.duration`, `.disabled` (r/w; disabled audio = muted clip), `.components`,
`.getMGTComponent()`, `.getSpeed()` (read-only), `.isSpeedReversed()`, `.isSelected()`, `.setSelected(1, 1)`, `.isAdjustmentLayer()`,
`.getMatchName()`, `.remove(ripple, alignToVideo)`, `.move(TimeDelta)`.

**Component / ComponentParam**: `clip.components[i].displayName`, `.matchName`, `.properties[j].displayName`, `.getValue()`,
`.setValue(value, 1)`, `.isTimeVarying()`, `.setTimeVarying(bool)`, `.areKeyframesSupported()`, `.addKey(Time)`,
`.setValueAtKey(Time, value, 1)`, `.getValueAtKey(Time)`, `.getKeys()` (array of Time), `.removeKey(Time)`,
`.removeKeyRange(Time, Time)`, `.setInterpolationTypeAtKey(Time, type, 1)` with 0 linear, 4 hold, 5 bezier.

**Markers** (`seq.markers` or `item.getMarkers()`): `.createMarker(seconds)`, `.deleteMarker(m)`, `.getFirstMarker()`, `.getNextMarker(m)`,
`.getLastMarker()`; marker `.name`, `.comments`, `.start` (Time), `.end` (assign seconds, not a Time), `.type`, `.guid`,
`.setTypeAsComment()` / `Chapter` / `Segmentation` / `WebLink`, `.setColorByIndex(colorIndex, 0)`, `.getColorByIndex()`.

**QE**: `app.enableQE(); var q = qe.project.getActiveSequence();` then `q.extract()` (removes the in/out range and ripples),
`q.getVideoTrackAt(i)` / `q.getAudioTrackAt(i)`, `qt.isSyncLocked()`, `qt.setSyncLock(bool)`, `q.CTI.timecode`. Anything else on `qe` is unverified.

## Can / cannot, by task

| Task | Answer | Exact call | Trap |
|---|---|---|---|
| List clips with times | yes (panel) | loop `seq.videoTracks[t].clips[c]`, read `.name`, `.start.ticks`, `.end.ticks`, `.inPoint.ticks`, `.projectItem.getMediaPath()` | Wrap `getMediaPath` in try: synthetic items (colour matte, adjustment layer) throw. Cap output; the panel truncates at 64 KB. |
| Scale / position / rotation | yes (note, docs) | find the component whose `displayName === "Motion"` (or `matchName` containing "Motion"), then the property by `displayName` "Scale", "Position", "Rotation", "Anchor Point"; `param.setValue(v, 1)` | Do not hardcode indexes. The note says `components[0]` is Opacity and `components[1]` Motion with Position[0], Scale[1], Scale Width[2], Rotation[4], Anchor Point[5], but effects can reorder. Scale is a percent number; Position is an `[x, y]` array in 0-1 frame units (0.5, 0.5 = centre); Rotation is degrees (values per the note, unverified in this panel). `setValue` fails silently on a param that already has keyframes; check `isTimeVarying()`. |
| Opacity | yes (note) | component `displayName === "Opacity"`, property "Opacity", percent 0-100 | Same index caveat. |
| Keyframes | yes (note, docs) | `p.setTimeVarying(true); p.addKey(t); p.setValueAtKey(t, v, 1)` with `t` a Time object | Whether `t` is sequence time or clip-relative time is unverified; set two keys, read `getKeys()`, compare with `clip.start`. `addKey` can throw "Unknown error" on params that do not support keys; check `areKeyframesSupported()`. |
| Sequence markers | yes (docs, note) | `var m = seq.markers.createMarker(seconds); m.name = ...; m.comments = ...; m.end = seconds + dur; m.setTypeAsComment(); m.setColorByIndex(i, 0)` | Colour indexes per docs: 0 green, 1 red, 2 purple, 3 orange, 4 yellow, 5 white, 6 blue, 7 cyan (the note uses a different list; read back with `getColorByIndex()`). Assign `m.end` a seconds Number, not a Time. |
| Clip (source) markers | yes (docs) | `clip.projectItem.getMarkers().createMarker(sourceSeconds)` | Time is relative to the source media, not the timeline: `sourceSeconds = clip.inPoint.seconds + (timelineSec - clip.start.seconds)`. Markers land on the project item, so every instance of that media shows them. |
| Captions from an SRT | yes (cep) | `app.project.importFiles([srtPath], true, app.project.rootItem, false)`; find the new item by name scanning `rootItem.children` from the end; `seq.createCaptionTrack(item, 0, Sequence.CAPTION_FORMAT_SUBTITLE)` | `importFiles` is non-undoable (checkpoint). Cannot test file existence from the panel (`File` is refused); check the import return value and that the item was found. The panel cannot write the SRT; it must already exist on disk. |
| Create a sequence | yes (panel) | `app.project.createNewSequenceFromClips(name, items, bin)`; then `getSettings()` / `setSettings()` for size or rate | Prefer the `create_sequence` tool. `setSettings` is non-undoable. `createNewSequence(name, id)` makes an empty sequence with default settings. |
| Duplicate a sequence | yes (panel) | `seq.clone()` then diff `app.project.sequences` by `sequenceID`; `copy.name = ...`; `copy.projectItem.moveBin(bin)`; `app.project.openSequence(copy.sequenceID)` | The panel already does this before the first edit; do not clone again. |
| Add a track | unverified | no documented ExtendScript call; QE `q.addTracks(...)` exists in community notes | `importMGT` and `insertClip` need the target track to exist. Ask the user to add one, or use a track that exists. |
| Insert / overwrite a clip at a time | yes (docs) | `track.overwriteClip(item, seconds)` (docs example passes seconds); `seq.insertClip(item, timeObject, vIdx, aIdx)`; `track.insertClip(item, ticksString)` | The docs give three different time types. Try seconds on `track.overwriteClip` first, then read the track back. Insert ripples later clips; overwrite does not. |
| Remove a clip | yes (panel, cep) | `clip.remove(ripple, alignToVideo)` with 0/1 or booleans | Iterate from the last clip to the first; indexes shift. One History step per clip. |
| Remove a time range (extract) | yes (panel) | `seq.setInPoint(a); seq.setOutPoint(b); app.enableQE(); qe.project.getActiveSequence().extract()` | Prefer `extract_ranges` / `keep_only`. Process ranges in descending time order, target and unlock every track, sync-lock via QE so audio follows video, snap to frame edges, and restore in/out afterwards. Expect occasional one-frame holes. |
| Disable / mute a clip | yes (panel) | `clip.disabled = true` on the audio or video item | Prefer `mute_clip_audio`. Track-level: `track.setMute(true)`. |
| Rename a clip / bin / item | yes (docs) | `clip.name = "..."`; `item.name = "..."`; `bin.renameBin("...")` | Plain assignment; one History step. |
| Bins and moving items | yes (panel) | `bin.createBin(name)`, `item.moveBin(bin)`, walk `rootItem.children` with `.type === 2` for bins | Prefer `project_bins` / `move_to_bin`. |
| Find a project item by media path | yes (panel, docs) | walk `rootItem.children` comparing `getMediaPath()`; or `app.project.rootItem.findItemsMatchingMediaPath(path, 1)` returns an array or 0 | Compare full paths; image sequences return the first frame's path. |
| Media path and metadata | yes (panel) | `item.getMediaPath()`, `item.getProjectColumnsMetadata()`, `item.getXMPMetadata()` | Prefer `media_info` for ffprobe facts. `setXMPMetadata` is non-undoable. |
| Selection | yes (panel, docs) | `seq.getSelection()` (timeline), `app.getCurrentProjectViewSelection()` (Project panel), `clip.setSelected(1, 1)` | The user message already carries the selection; do not re-derive it unless you need the objects. |
| Nest clips | yes (docs), unverified here | set in/out around the selection, `var n = seq.createSubsequence(true)`, then `track.overwriteClip(n.projectItem, startSeconds)`, restore in/out | `createSubsequence` alone only creates a new sequence; the overwrite is what nests. Clips on other tracks in that range are included. |
| Link / unlink audio and video | yes (docs), unverified here | `seq.linkSelection()`, `seq.unlinkSelection()` | Operates on the current selection only. |
| Set clip volume | yes (note), mapping unverified | audio clip component `displayName === "Volume"`, property "Level"; `p.setValue(v, 1)` | The stored value is not dB. Read the current value on an untouched clip first (expect about 1 for 0 dB); the usual mapping is `v = Math.pow(10, dB / 20)`, unverified here. Gain keyframes make `setValue` a no-op. |
| MOGRT: import | yes (cep) | `seq.importMGT(path, String(ticks), videoTrackIndex, -1)` | Silent track fallback: if the index exceeds the track count the MOGRT lands on the last track. Placement can drift up to a second. The clip may not be visible in the same script (no sleep available); find it in a second script, matching `clip.start.seconds` within 1.0 s. |
| MOGRT: set text | yes (cep) | `clip.getMGTComponent().properties.getParamForDisplayName(name)`; `p.getValue()` is a JSON string; change `"textEditValue"` and `"fontTextRunLength"` by regex; `p.setValue(str, true)` | No `JSON` and no `eval` in the panel, so edit the string. Enumerate `properties[i].displayName` to learn the field name. Non-ASCII text can be corrupted by the encoding; keep it ASCII or escape to `\uXXXX` built with `String.fromCharCode(92)`. |
| Speed / duration change | no in ExtendScript | `clip.getSpeed()` is read-only; QE `qeClip.setSpeed(...)` is undocumented and flaky | Tell the user; do not loop on QE variants. |
| Transitions | QE only, flaky | `qeTrack.addTransition(...)` (unverified) | Say it is unreliable; the user can apply it in the UI. |
| Effects | QE only from here | `qeClip.addVideoEffect(qe.project.getVideoEffectByName(name))` (unverified) | Existing intrinsic components (Motion, Opacity, Volume) are editable without QE. |
| Split / razor a clip | no | none | Workaround: overwrite the same project item twice with different in/out points, then remove the original. Usually better to ask the user to razor. |
| Move a clip to another track | no | none | Overwrite on the new track, remove from the old. |
| Playback | no | `setPlayerPosition` only; no play/stop | |
| Multicam angle switching | no | none | `clip.disabled` per clip on separate tracks is the workaround. |
| Type Tool / Essential Graphics text | no | `Source Text` on a Text component is not writable from ExtendScript or UXP | MOGRT text is the only scriptable on-screen text. |
| Transcript / Text panel | no | not exposed to ExtendScript; the panel reads the saved project file | Use `read_transcript` / `find_in_transcript`; ask the user to press Cmd+S if stale. |
| Save, export, render, frame grab, open project | refused by the panel | `.save`, `.export*`, `.encode*`, `.openDocument` are rejected before running | `preview_frames` is the tool for frames. The panel saves on its own. |
| File I/O, sleep, dialogs, events | refused by the panel | `File`, `$.sleep`, `alert`-style UI, `app.bind` | Return everything as the result string; split multi-step work into separate scripts instead of sleeping. |

## UXP-only (not reachable from this panel; do not try)

`project.executeTransaction` (compound undo), `exportAsOpenTimelineIO`, `exportSequenceFrame`, `SequenceEditor.createRemoveItemsAction`,
`VideoComponentChain.createAppendComponentAction`, `ClipProjectItem.setScaleToFrameSize`, `performSceneEditDetectionOnSelection` (also
listed for ExtendScript, unverified), UXP `Transcript` / `TextSegments` readers (return nothing for third-party plugins anyway).
UXP cannot set MOGRT text or create caption tracks; those are ExtendScript jobs, which is why this panel exists.

## Writing a script that gets through the gate

- Start with `var seq = app.project.activeSequence; if (!seq) ...` and return a string on failure rather than throwing.
- Keep strings ASCII, no backslashes; build separators with `String.fromCharCode`.
- Use `Number(x)` on tick strings before arithmetic and `String(n)` when passing ticks back.
- Use `try { } catch (e) { }` around per-item calls that can throw (`getMediaPath`, `getValue`) and keep going.
- End with one expression: `out.join(NL)` or a status string like `"scaled 3 clips"`.
- Say how many History steps the edit created (one per assignment or mutating call).
