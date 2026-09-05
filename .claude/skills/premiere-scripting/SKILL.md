---
name: premiere-scripting
description: "Use before writing or debugging any ExtendScript for Premiere: what the API can and cannot do, exact property names, ticks, and proven snippets"
---

# Premiere scripting (ExtendScript through run_extendscript)

## When to use

Only when no panel tool covers the request. The tools are deterministic and undoable; a script is the
escape hatch. Check first: `sequence_overview`, `classify_clips`, `find_in_transcript`, `extract_ranges`,
`keep_only`, `remove_silences`, `create_sequence`, `project_bins`, `move_to_bin`, `mute_clip_audio`,
`preview_frames`. Never rebuild what a tool does (cuts, silence removal, bins, sequence creation) with a script.

Premiere first: `native-first.md` is the map of Premiere's own features (Auto Reframe, Speech to Text, Extract,
Export Frame, Essential Sound...) versus the panel's engines, and which to use when. Read it before deciding
how to do a job at all.

Before writing a script: read `reference.md` for the can/cannot table and the exact property names, then copy
the closest snippet from `snippets.md` and adapt it. Do not guess API shapes. If a name is uncertain, write a
read-only script that enumerates `displayName` / `matchName` first, then write the edit.

## Rules the panel enforces (a script that breaks one is refused before it runs)

1. ES3 only: `var`, `function`, string concatenation, `for` loops with `.numItems` / `.numTracks` /
   `.length`. No `let`, `const`, arrows, `JSON`, `forEach`, `map`, `indexOf` on arrays, trailing commas,
   or reserved words as property names (`x.default`, `x.in`, `x.class`).
2. Refused words anywhere in code (string literals and comments are exempt): `this`; `eval`, `Function`,
   `constructor`, `callee`, `caller`, `toSource`, `evalFile`, `with`, `call`, `apply`, `bind`; `File`,
   `Folder`, `Socket`, `BridgeTalk`, `ExternalObject`, `system`, `callSystem`, `XML`, `reflect`,
   `Reflection`, `Window`, `ScriptUI`, `Palette`, `Dialog`, `$` (so no `$.sleep`, `$.writeln`);
   `scheduleTask`; `#include`-style directives.
3. Refused methods: `.quit`, `.openDocument`, `.newProject`, `.closeDocument`, `.save`, `.saveAs`,
   anything starting with `.export` or `.encode`, `encoder`, `renderQueue`. Never save; the panel saves.
4. No backslash escapes `\u`, `\x`, `\0`-`\7`. Avoid backslashes entirely: build newlines with
   `String.fromCharCode(10)` and tabs with `String.fromCharCode(9)`. Comments are fine.
5. Anything that edits waits for the user's click. Edits are: property assignments, and any call starting
   with add/attach/change/clear/create/delete/execute/import/insert/move/overwrite/remove/rename/set.
   Only the plainest reads (no strings, no comments, allowlisted getters) run without a click, so expect a
   click for nearly every script; that is normal. Non-undoable calls (importFiles, setSettings,
   deleteSequence, setXMPMetadata, changeMediaPath, refreshMedia, setOverrideFrameRate, attachProxy)
   trigger a project checkpoint first; say so before running them.
6. Time is in ticks: 254016000000 per second. `Time.ticks` is a String, `Time.seconds` a Number;
   `sequence.end` and `sequence.timebase` are tick Strings. Convert with `Number(x)`.
7. A script must end with a result expression (a string is best). No `return` at top level; `return` inside
   your own functions is fine. `alert` is not a result. Errors come back as `CLAUDE_FOR_ADOBE_ERROR:`.
8. QE (`app.enableQE(); qe.project.getActiveSequence()`) is allowed with a warning: undocumented and can
   crash Premiere. Use it only for extract/ripple work the way the panel already does.
9. Each API call is one History step; tell the user how many Cmd+Z steps an edit made.

## Files

- `reference.md`: the three API surfaces, object and property names, the can/cannot table by task with
  the exact call and trap per row, what is UXP-only or impossible, and the verification legend.
- `snippets.md`: twelve complete ES3 scripts that pass the panel's gate (enumerate clips, scale/position,
  keyframe, sequence marker, clip markers, SRT caption track, insert at time, nest, volume, MOGRT text,
  find item by path, rename). Each is tagged verified or unverified.
