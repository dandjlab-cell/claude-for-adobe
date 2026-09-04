# Snippets (ES3, pass the panel gate, end in a result expression)

**verified** = the same calls run in a production CEP host script. **unverified** = assembled from docs or the capability
note, not yet run from this panel: run the read part first and check the result. Every edit here waits for the user's click.
`findParam` (snippets 2, 3, 9) locates an intrinsic param by display name instead of trusting component indexes.

## 1. Enumerate clips of the active sequence, ticks to seconds (verified)

```javascript
var T = 254016000000, NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
var seq = app.project.activeSequence, out = [];
function scan(list, prefix) {
  for (var t = 0; t < list.numTracks; t++) {
    var clips = list[t].clips;
    for (var c = 0; c < clips.numItems; c++) {
      var cl = clips[c], mp = "";
      try { mp = cl.projectItem ? cl.projectItem.getMediaPath() : ""; } catch (e) {}
      out.push([prefix + (t + 1), cl.name, (Number(cl.start.ticks) / T).toFixed(2), (Number(cl.end.ticks) / T).toFixed(2),
        (Number(cl.inPoint.ticks) / T).toFixed(2), cl.disabled ? "off" : "on", mp].join(TAB));
      if (out.length > 500) return;
    }
  }
}
if (seq) { scan(seq.videoTracks, "V"); scan(seq.audioTracks, "A"); }
seq ? seq.name + " " + (Number(seq.end) / T).toFixed(2) + "s" + NL + out.join(NL) : "no active sequence";
```

## 2. Set scale and position on a clip via the Motion component (unverified: value units)

```javascript
var seq = app.project.activeSequence, clip = seq.videoTracks[0].clips[0];   // pick from snippet 1
function findParam(item, compName, propName) {
  for (var i = 0; i < item.components.numItems; i++) { var comp = item.components[i]; if (comp.displayName !== compName) continue;
    for (var j = 0; j < comp.properties.numItems; j++) if (comp.properties[j].displayName === propName) return comp.properties[j]; }
  return null;
}
var scale = findParam(clip, "Motion", "Scale"), pos = findParam(clip, "Motion", "Position"), msg = [];
if (scale && !scale.isTimeVarying()) { scale.setValue(80, 1); msg.push("scale=80"); } else msg.push("scale: missing or keyframed");
if (pos && !pos.isTimeVarying()) { pos.setValue([0.5, 0.5], 1); msg.push("position=centre"); } else msg.push("position: missing or keyframed");
clip.name + ": " + msg.join(", ") + " (2 undo steps)";
```
Unsure of units: swap the `setValue` lines for `msg.push(String(scale.getValue()))` and read the current values first.

## 3. Keyframes at a time: opacity fade-in (unverified: sequence time vs clip time for keys)

```javascript
var T = 254016000000, seq = app.project.activeSequence, clip = seq.videoTracks[0].clips[0];
function findParam(item, compName, propName) {
  for (var i = 0; i < item.components.numItems; i++) { var comp = item.components[i]; if (comp.displayName !== compName) continue;
    for (var j = 0; j < comp.properties.numItems; j++) if (comp.properties[j].displayName === propName) return comp.properties[j]; }
  return null;
}
function at(sec) { var t = new Time(); t.ticks = String(Math.round(sec * T)); return t; }
var p = findParam(clip, "Opacity", "Opacity"), t0 = clip.start.seconds, t1 = t0 + 1, res = "no Opacity param";
if (p && p.areKeyframesSupported()) {
  p.setTimeVarying(true);
  p.addKey(at(t0)); p.setValueAtKey(at(t0), 0, 1);
  p.addKey(at(t1)); p.setValueAtKey(at(t1), 100, 1);
  var keys = p.getKeys(), ks = [];
  for (var k = 0; keys && k < keys.length; k++) ks.push(keys[k].seconds.toFixed(2));
  res = "fade in on " + clip.name + ", keys at " + ks.join(", ") + "s";
}
res;
```
If the reported key times sit near 0 rather than near `clip.start`, keys are clip-relative: use `at(0)` and `at(1)`.

## 4. Add a sequence marker (verified calls; colour list from docs)

```javascript
var seq = app.project.activeSequence, sec = 12.5, dur = 2;
var m = seq.markers.createMarker(sec);
m.name = "Check this cut";
m.comments = "Jump cut here";
m.end = sec + dur;                 // seconds, not a Time
m.setTypeAsComment();
m.setColorByIndex(0, 0);           // 0 green 1 red 2 purple 3 orange 4 yellow 5 white 6 blue 7 cyan
"marker at " + m.start.seconds.toFixed(2) + "s (" + m.name + ")";
```

## 5. Markers on a clip's source at timeline times (unverified in panel; docs)

```javascript
var seq = app.project.activeSequence, clip = seq.videoTracks[0].clips[0];
var times = [3.0, 7.5, 12.0], labels = ["one", "two", "three"], mk = clip.projectItem.getMarkers(), n = 0;
for (var i = 0; i < times.length; i++) {
  var srcSec = clip.inPoint.seconds + (times[i] - clip.start.seconds);   // source time, not timeline time
  if (srcSec < 0) continue;
  var m = mk.createMarker(srcSec); m.name = labels[i]; m.setTypeAsComment(); n++;
}
n + " clip markers on " + clip.name + " (" + n + " undo steps)";
```

## 6. Import an SRT and create a caption track (verified in another CEP host; importFiles is non-undoable)

```javascript
var srtPath = "/path/to/captions.srt", seq = app.project.activeSequence, root = app.project.rootItem;
var stem = srtPath.substring(srtPath.lastIndexOf("/") + 1); stem = stem.substring(0, stem.lastIndexOf("."));
var res = "no active sequence";
if (seq) {
  var ok = app.project.importFiles([srtPath], true, root, false), item = null;
  for (var i = root.children.numItems - 1; i >= 0 && !item; i--) if (String(root.children[i].name).indexOf(stem) === 0) item = root.children[i];
  if (!ok) res = "import failed (file missing?)";
  else if (!item) res = "imported but item not found";
  else res = seq.createCaptionTrack(item, 0, Sequence.CAPTION_FORMAT_SUBTITLE) ? "caption track created from " + item.name : "createCaptionTrack returned false";
}
res;
```

## 7. Overwrite a project item onto a track at a time (unverified: time argument type)

```javascript
var seq = app.project.activeSequence, want = "/path/to/broll.mov", atSec = 30, vIdx = 1;   // V2 must exist
function findByPath(bin, path) {
  for (var i = 0; i < bin.children.numItems; i++) {
    var c = bin.children[i];
    if (c.type === 2) { var r = findByPath(c, path); if (r) return r; } else { try { if (c.getMediaPath() === path) return c; } catch (e) {} }
  }
  return null;
}
var item = findByPath(app.project.rootItem, want), track = seq.videoTracks[vIdx], res = "item or track missing";
if (item && track) {
  var before = track.clips.numItems, placed = null;
  track.overwriteClip(item, atSec);   // docs example passes seconds; if nothing lands, try seq.insertClip(item, timeObj, vIdx, 0)
  for (var k = 0; k < track.clips.numItems; k++) if (Math.abs(track.clips[k].start.seconds - atSec) < 1) placed = track.clips[k];
  res = placed ? "placed " + placed.name + " at " + placed.start.seconds.toFixed(2) + "s on V" + (vIdx + 1)
               : "clip count " + before + " -> " + track.clips.numItems + ", nothing near " + atSec + "s";
}
res;
```

## 8. Nest the selected clips (unverified in panel; adapted from the docs example)

```javascript
var seq = app.project.activeSequence, sel = seq.getSelection(), res = "nothing selected";
function trackIndexOf(nodeId) {
  for (var t = 0; t < seq.videoTracks.numTracks; t++)
    for (var c = 0; c < seq.videoTracks[t].clips.numItems; c++) if (seq.videoTracks[t].clips[c].nodeId === nodeId) return t;
  return 0;
}
if (sel && sel.length) {
  var inSec = Number(seq.getInPoint()), outSec = Number(seq.getOutPoint());
  var start = sel[0].start.seconds, end = sel[sel.length - 1].end.seconds, tIdx = trackIndexOf(sel[0].nodeId);
  seq.setInPoint(start); seq.setOutPoint(end);
  var nested = seq.createSubsequence(true);          // new sequence only; the overwrite below is the nest
  if (nested) seq.videoTracks[tIdx].overwriteClip(nested.projectItem, start);
  if (inSec >= 0) seq.setInPoint(inSec); if (outSec >= 0) seq.setOutPoint(outSec);
  res = nested ? "nested " + sel.length + " clips into " + nested.name + " on V" + (tIdx + 1) : "createSubsequence failed";
}
res;
```
Everything on every track between `start` and `end` goes into the nest, not only the selected clips.

## 9. Set clip volume in dB (unverified: dB mapping; the script reports the value before and after)

```javascript
var seq = app.project.activeSequence, clip = seq.audioTracks[0].clips[0], dB = -6;
function findParam(item, compName, propName) {
  for (var i = 0; i < item.components.numItems; i++) { var comp = item.components[i]; if (comp.displayName !== compName) continue;
    for (var j = 0; j < comp.properties.numItems; j++) if (comp.properties[j].displayName === propName) return comp.properties[j]; }
  return null;
}
var level = findParam(clip, "Volume", "Level"), res = "no Volume/Level param";
if (level && level.isTimeVarying()) res = "Level has keyframes; setValue would be ignored";
else if (level) {
  var cur = level.getValue();                          // about 1 on an untouched clip if 0 dB = 1.0
  level.setValue(Math.pow(10, dB / 20), 1);
  res = clip.name + ": level " + cur + " -> " + level.getValue() + " (" + dB + " dB, 1 undo step)";
}
res;
```

## 10. Import a MOGRT, then set its text (verified calls in another CEP host; regex edit replaces JSON parsing)

Two runs: the new clip may not be visible in the same script and there is no sleep.

```javascript
// A: import
var T = 254016000000, seq = app.project.activeSequence, path = "/path/to/title.mogrt", atSec = 5, vIdx = 2, counts = [];
for (var t = 0; t < seq.videoTracks.numTracks; t++) counts.push(seq.videoTracks[t].clips.numItems);
seq.importMGT(path, String(Math.round(atSec * T)), vIdx, -1);
"requested V" + (vIdx + 1) + " at " + atSec + "s; clip counts before: " + counts.join(",") + " (run B next)";
```

```javascript
// B: find the clip (any track, within 1 s) and set its text
var seq = app.project.activeSequence, atSec = 5, newText = "Episode One", clip = null, best = 9e9, res = "";
for (var t = 0; t < seq.videoTracks.numTracks; t++)
  for (var c = 0; c < seq.videoTracks[t].clips.numItems; c++) {
    var d = Math.abs(seq.videoTracks[t].clips[c].start.seconds - atSec);
    if (d < best && d < 1) { best = d; clip = seq.videoTracks[t].clips[c]; }
  }
var comp = clip ? clip.getMGTComponent() : null;
if (!clip) res = "no clip within 1s of " + atSec + "s (track fallback or drift)";
else if (!comp) res = clip.name + " has no MOGRT component";
else {
  var names = [], param = null, tryNames = ["Source Text", "Text", "Title", "Name"];
  for (var p = 0; p < comp.properties.numItems; p++) names.push(comp.properties[p].displayName);
  for (var n = 0; n < tryNames.length && !param; n++) { try { param = comp.properties.getParamForDisplayName(tryNames[n]); } catch (e) {} }
  var cur = param ? String(param.getValue()) : "";
  var next = cur.replace(/"textEditValue"\s*:\s*"[^"]*"/, '"textEditValue":"' + newText + '"')
                .replace(/"fontTextRunLength"\s*:\s*\[[^\]]*\]/, '"fontTextRunLength":[' + newText.length + ']');
  if (!param) res = "no text param; available: " + names.join(", ");
  else if (next === cur) res = "value had no textEditValue; starts: " + cur.substring(0, 120);
  else { param.setValue(next, true); res = "text set on " + clip.name + " (params: " + names.join(", ") + ")"; }
}
res;
```
Keep `newText` ASCII with no quotes. Non-ASCII needs `\uXXXX` escapes; build the backslash with `String.fromCharCode(92)`.

## 11. Find a project item by media path (verified walk; docs alternative in the comment)

```javascript
var want = "/path/to/interview.mov", NL = String.fromCharCode(10), hits = [];
function walk(bin, depth, prefix) {
  if (depth > 10) return;
  for (var i = 0; i < bin.children.numItems; i++) {
    var c = bin.children[i];
    if (c.type === 2) walk(c, depth + 1, prefix + c.name + "/");
    else { try { if (c.getMediaPath() === want) hits.push(prefix + c.name + " [" + c.nodeId + "]"); } catch (e) {} }
  }
}
walk(app.project.rootItem, 0, "");
// alternative: var arr = app.project.rootItem.findItemsMatchingMediaPath(want, 1);  (array, or 0 when none)
hits.length ? hits.join(NL) : "not in project: " + want;
```

## 12. Rename timeline clips by name (verified property)

```javascript
var seq = app.project.activeSequence, oldName = "A001_C003.mov", newName = "Interview wide", n = 0;
for (var t = 0; t < seq.videoTracks.numTracks; t++)
  for (var c = 0; c < seq.videoTracks[t].clips.numItems; c++) { var cl = seq.videoTracks[t].clips[c]; if (cl.name === oldName) { cl.name = newName; n++; } }
n ? "renamed " + n + " clip(s) to " + newName + " (" + n + " undo steps)" : "no clip named " + oldName;
```
Bins: `bin.renameBin("New name")`. Bin items: `item.name = "New name"` (renames the source clip, not timeline instances).
