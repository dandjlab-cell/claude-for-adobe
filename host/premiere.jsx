// Premiere host functions for the panel. ExtendScript = ES3: no JSON, no forEach, no let/const,
// no reserved words as property names (in, class, default ...). Loaded once at panel boot;
// the last expression is the load check. Every function returns a string.
var PCX = (function () {
  var T = 254016000000;
  var COL = "\u0002";
  var ROW = "\u0003";

  function num(x) { return Number(x); }
  function seq() { return app.project ? app.project.activeSequence : null; }
  function parse(json) { return eval("(" + json + ")"); }

  function projectInfo() {
    var p = app.project;
    if (!p) return "";
    var s = p.activeSequence;
    return p.path + COL + p.name + COL + (s ? s.name : "") + COL + (s ? s.sequenceID : "");
  }

  function save() {
    try { app.project.save(); return "ok"; } catch (e) { return "ERR:" + e; }
  }

  function openProject(path) {
    try {
      var ok = app.openDocument(path, false, false, false, false);
      return String(ok) + "|" + (app.project ? app.project.path : "");
    } catch (e) { return "ERR:" + e; }
  }

  // Sequence header row + one row per clip: nodeId|track|name|startTicks|endTicks|inPointTicks|mediaPath
  function snapshot() {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var st = s.getSettings();
    var rows = [[s.name, s.sequenceID, st.videoFrameWidth, st.videoFrameHeight, s.end].join(COL)];
    function tracks(list, prefix) {
      for (var t = 0; t < list.numTracks; t++) {
        var tr = list[t];
        for (var c = 0; c < tr.clips.numItems; c++) {
          var cl = tr.clips[c];
          var mp = "";
          try { mp = cl.projectItem ? cl.projectItem.getMediaPath() : ""; } catch (e) {}
          rows.push([cl.nodeId, prefix + (t + 1), cl.name, cl.start.ticks, cl.end.ticks, cl.inPoint.ticks, mp].join(COL));
          if (rows.length > 600) return;
        }
      }
    }
    tracks(s.videoTracks, "V");
    tracks(s.audioTracks, "A");
    return rows.join(ROW);
  }

  function parentBinOf(nodeId) {
    function walk(bin) {
      for (var i = 0; i < bin.children.numItems; i++) {
        var c = bin.children[i];
        if (c.nodeId === nodeId) return bin;
        if (c.type === 2) { var r = walk(c); if (r) return r; }
      }
      return null;
    }
    return walk(app.project.rootItem);
  }

  // Duplicate the active sequence next to the original, rename it, make it active. Returns id|name.
  function cloneActive(newName) {
    var p = app.project;
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var ids = {};
    for (var i = 0; i < p.sequences.numSequences; i++) ids[p.sequences[i].sequenceID] = 1;
    if (!s.clone()) return "ERR:clone failed";
    var copy = null;
    for (var j = 0; j < p.sequences.numSequences; j++) if (!ids[p.sequences[j].sequenceID]) copy = p.sequences[j];
    if (!copy) return "ERR:copy not found";
    copy.name = newName;
    try {
      var oi = s.projectItem, ci = copy.projectItem;
      if (oi && ci) {
        var op = parentBinOf(oi.nodeId), cp = parentBinOf(ci.nodeId);
        if (op && cp && op.nodeId !== cp.nodeId) ci.moveBin(op);
      }
    } catch (e) {}
    if (p.activeSequence.sequenceID !== copy.sequenceID) p.openSequence(copy.sequenceID);
    return copy.sequenceID + "|" + copy.name;
  }

  function deleteSequence(id, openId) {
    var p = app.project;
    var target = null;
    for (var i = 0; i < p.sequences.numSequences; i++) if (p.sequences[i].sequenceID === id) target = p.sequences[i];
    try { if (openId) p.openSequence(openId); } catch (e) {}
    if (!target) return "already gone";
    return "deleted=" + p.deleteSequence(target);
  }

  function openSequence(id) { try { return String(app.project.openSequence(id)); } catch (e) { return "ERR:" + e; } }

  // Premiere's own Extract per range (ranges: [[startSec, endSec], ...] in descending order), all
  // tracks targeted and sync-locked so linked video+audio go together. One History step per range.
  function extractRanges(json) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var q = null;
    try { app.enableQE(); q = qe.project.getActiveSequence(); } catch (e) {}
    if (!q || typeof q.extract !== "function") return "ERR:QE extract unavailable";
    var R = parse(json);
    var F = num(s.timebase) / T;
    var saved = { inPt: null, outPt: null, tracks: [] };
    try { saved.inPt = num(s.getInPoint()); saved.outPt = num(s.getOutPoint()); } catch (e) {}
    function prep(list, kind) {
      for (var t = 0; t < list.numTracks; t++) {
        var tr = list[t];
        var qt = null;
        try { qt = kind === "v" ? q.getVideoTrackAt(t) : q.getAudioTrackAt(t); } catch (e) {}
        var st = { tr: tr, qt: qt, locked: false, targeted: false, sync: true };
        try { st.locked = !!tr.isLocked(); } catch (e) {}
        try { st.targeted = !!tr.isTargeted(); } catch (e) {}
        try { st.sync = qt ? !!qt.isSyncLocked() : true; } catch (e) {}
        saved.tracks.push(st);
        try { tr.setLocked(0); } catch (e) {}
        try { tr.setTargeted(true, true); } catch (e) {}
        try { if (qt) qt.setSyncLock(true); } catch (e) {}
      }
    }
    prep(s.videoTracks, "v");
    prep(s.audioTracks, "a");
    var before = num(s.end) / T;
    var done = 0, errs = [];
    for (var i = 0; i < R.length; i++) {
      var a = Math.ceil(R[i][0] / F - 0.000001) * F;
      var b = Math.floor(R[i][1] / F + 0.000001) * F;
      if (b - a < F * 0.5) continue;
      try {
        s.setInPoint(a);
        s.setOutPoint(b);
        var d0 = num(s.end);
        q.extract();
        if (num(s.end) === d0) errs.push(a.toFixed(2) + ": no change"); else done++;
      } catch (e) { errs.push(a.toFixed(2) + ": " + e); }
    }
    var closed = closeGaps(q, s);
    for (var k = 0; k < saved.tracks.length; k++) {
      var w = saved.tracks[k];
      try { if (w.qt) w.qt.setSyncLock(w.sync); } catch (e) {}
      try { w.tr.setTargeted(w.targeted, true); } catch (e) {}
      try { w.tr.setLocked(w.locked ? 1 : 0); } catch (e) {}
    }
    try { if (saved.inPt >= 0) s.setInPoint(saved.inPt); if (saved.outPt >= 0) s.setOutPoint(saved.outPt); } catch (e) {}
    var after = num(s.end) / T;
    var mismatches = 0;
    var vt = s.videoTracks[0], at = s.audioTracks[0];
    for (var j = 0; j < Math.min(vt.clips.numItems, at.clips.numItems); j++) if (vt.clips[j].start.ticks !== at.clips[j].start.ticks) mismatches++;
    return "extracted=" + done + "/" + R.length + " before=" + before.toFixed(2) + "s after=" + after.toFixed(2) + "s frame-gaps closed=" + closed + " V1/A1 start mismatches=" + mismatches + (errs.length ? " ERRORS: " + errs.join("; ") : "");
  }

  // Extract leaves an occasional one-frame hole where a range edge rounds to a frame. Find gaps under
  // two frames between consecutive clips on any video track and extract them (ripples all tracks).
  // Returns "closed=N".
  function closeGaps(q, s) {
    var F = num(s.timebase);
    var gaps = [];
    function scan(list) {
      for (var t = 0; t < list.numTracks; t++) {
        var c = list[t].clips;
        for (var i = 1; i < c.numItems; i++) {
          var g0 = num(c[i - 1].end.ticks), g1 = num(c[i].start.ticks);
          if (g1 - g0 > 0 && g1 - g0 < F * 3) gaps.push([g0, g1]);
        }
      }
    }
    scan(s.videoTracks);
    scan(s.audioTracks);
    gaps.sort(function (x, y) { return y[0] - x[0]; });
    var closed = 0;
    for (var k = 0; k < gaps.length; k++) {
      try {
        s.setInPoint(gaps[k][0] / T);
        s.setOutPoint(gaps[k][1] / T);
        var d0 = num(s.end);
        q.extract();
        if (num(s.end) !== d0) closed++;
      } catch (e) {}
    }
    return closed;
  }

  function closeGapsActive() {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var q = null;
    try { app.enableQE(); q = qe.project.getActiveSequence(); } catch (e) {}
    if (!q) return "ERR:QE unavailable";
    return "closed=" + closeGaps(q, s) + " after=" + (num(s.end) / T).toFixed(2) + "s";
  }

  // Render frames of the active sequence via QE to base_<i>.png. Returns rows of base|ok|timecode.
  function frames(json, base) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var q = null;
    try { app.enableQE(); q = qe.project.getActiveSequence(); } catch (e) {}
    if (!q) return "ERR:QE unavailable";
    var secs = parse(json);
    var prev = s.getPlayerPosition().ticks;
    var outs = [];
    for (var i = 0; i < secs.length; i++) {
      s.setPlayerPosition(String(Math.round(secs[i] * T)));
      var b = base + "_" + i, ok = false, tc = "";
      try { tc = String(q.CTI.timecode); ok = q.exportFramePNG(tc, b); } catch (e) { ok = "ERR " + e; }
      outs.push(b + COL + ok + COL + tc);
    }
    s.setPlayerPosition(prev);
    return outs.join(ROW);
  }

  function isMediaPath(want) {
    function walk(it, d) {
      if (d > 10) return false;
      for (var i = 0; i < it.children.numItems; i++) {
        var c = it.children[i];
        if (c.type === 2) { if (walk(c, d + 1)) return true; }
        else { try { if (c.getMediaPath() === want) return true; } catch (e) {} }
      }
      return false;
    }
    return walk(app.project.rootItem, 0) ? "ok" : "no";
  }

  // app.bind host events -> CSXSEvent relay to the panel. Returns the names that bound.
  function bindEvents(eventType, namesJson, extensionId) {
    try { new ExternalObject("lib:PlugPlugExternalObject"); } catch (e) { return "ERR:PlugPlug " + e; }
    function fire(n) {
      return function (a, b) {
        try { var ev = new CSXSEvent(); ev.type = eventType; ev.data = n + (b && b.name ? ":" + b.name : ""); ev.dispatch(); } catch (e) {}
      };
    }
    var names = parse(namesJson), ok = [];
    for (var i = 0; i < names.length; i++) { try { if (app.bind(names[i], fire(names[i])) !== false) ok.push(names[i]); } catch (e) {} }
    try { app.setExtensionPersistent(extensionId, 1); } catch (e) {}
    return ok.join(",");
  }

  // Project panel tree: one line per node, depth-indented. Bins end with "/" and show item counts.
  function listBins() {
    var out = [];
    function walk(bin, depth, path) {
      for (var i = 0; i < bin.children.numItems; i++) {
        var c = bin.children[i];
        var pad = "";
        for (var d = 0; d < depth; d++) pad += "  ";
        if (c.type === 2) { out.push(pad + c.name + "/  (" + c.children.numItems + ")"); walk(c, depth + 1, path + c.name + "/"); }
        else out.push(pad + c.name + (c.type === 1 ? "" : (c.type === 4 ? "  [file]" : "")));
      }
    }
    walk(app.project.rootItem, 0, "");
    return out.join("\n");
  }

  function binByPath(path, create) {
    var bin = app.project.rootItem;
    var parts = String(path || "").split("/");
    for (var i = 0; i < parts.length; i++) {
      var name = parts[i];
      if (!name) continue;
      var found = null;
      for (var j = 0; j < bin.children.numItems; j++) { var c = bin.children[j]; if (c.type === 2 && c.name === name) { found = c; break; } }
      if (!found) { if (!create) return null; found = bin.createBin(name); }
      bin = found;
    }
    return bin;
  }

  function findItemByPath(path) {
    var parts = String(path || "").split("/");
    var name = parts.pop();
    var bin = parts.length ? binByPath(parts.join("/"), false) : app.project.rootItem;
    if (!bin) return null;
    for (var i = 0; i < bin.children.numItems; i++) if (bin.children[i].name === name) return bin.children[i];
    // not found at that level: search the whole tree by name (first match)
    function walk(b) { for (var k = 0; k < b.children.numItems; k++) { var c = b.children[k]; if (c.name === name) return c; if (c.type === 2) { var r = walk(c); if (r) return r; } } return null; }
    return parts.length ? null : walk(app.project.rootItem);
  }

  // moves: [[itemPath, binPath], ...]. Bins are created when missing. Returns one line per move.
  function moveToBin(json) {
    var moves = parse(json), out = [];
    for (var i = 0; i < moves.length; i++) {
      var it = findItemByPath(moves[i][0]);
      var bin = binByPath(moves[i][1], true);
      if (!it) { out.push("not found: " + moves[i][0]); continue; }
      if (!bin) { out.push("no bin: " + moves[i][1]); continue; }
      try { it.moveBin(bin); out.push("moved " + it.name + " -> " + bin.name + "/"); } catch (e) { out.push("failed " + it.name + ": " + e); }
    }
    return out.join("\n");
  }

  // Media inside a bin (nested bins included): name, path, video info, timebase, per item.
  function binMedia(binPath) {
    var bin = binPath ? binByPath(binPath, false) : app.project.rootItem;
    if (!bin) return "ERR:no bin " + binPath;
    var rows = [];
    function meta(item, key) {
      try {
        var xml = String(item.getProjectColumnsMetadata());
        var m = new RegExp("<" + key + ">([^<]*)</" + key + ">").exec(xml);
        return m ? m[1] : "";
      } catch (e) { return ""; }
    }
    function walk(b) {
      for (var i = 0; i < b.children.numItems; i++) {
        var c = b.children[i];
        if (c.type === 2) { walk(c); continue; }
        var mp = ""; try { mp = c.getMediaPath(); } catch (e) {}
        if (!mp) continue;
        rows.push([c.name, mp, c.nodeId, meta(c, "Column.Intrinsic.VideoInfo"), meta(c, "Column.Intrinsic.MediaTimebase"), meta(c, "Column.Intrinsic.MediaDuration")].join(COL));
        if (rows.length > 400) return;
      }
    }
    walk(bin);
    return rows.join(ROW);
  }

  // New sequence from a bin's clips (Premiere matches the first clip's settings), optional size/rate override.
  // Returns id|name|WxH@fps. Undo: Cmd+Z (a project action).
  function createSequenceFromBin(binPath, name, width, height, fps, insertClips) {
    var bin = binPath ? binByPath(binPath, false) : app.project.rootItem;
    if (!bin) return "ERR:no bin " + binPath;
    var items = [];
    (function walk(b) { for (var i = 0; i < b.children.numItems; i++) { var c = b.children[i]; if (c.type === 2) walk(c); else { var mp = ""; try { mp = c.getMediaPath(); } catch (e) {} if (mp) items.push(c); } } })(bin);
    if (!items.length) return "ERR:no media in " + (binPath || "root");
    var s = null;
    try { s = app.project.createNewSequenceFromClips(name, items, bin); } catch (e) { return "ERR:" + e; }
    if (!s) return "ERR:could not create the sequence";
    if (insertClips === "false") {
      try { for (var t = 0; t < s.videoTracks.numTracks; t++) { var tr = s.videoTracks[t]; for (var k = tr.clips.numItems - 1; k >= 0; k--) tr.clips[k].remove(false, false); }
            for (var a = 0; a < s.audioTracks.numTracks; a++) { var ta = s.audioTracks[a]; for (var q = ta.clips.numItems - 1; q >= 0; q--) ta.clips[q].remove(false, false); } } catch (e) {}
    }
    var w = Number(width), h = Number(height), f = Number(fps);
    if ((w && h) || f) {
      try {
        var st = s.getSettings();
        if (w && h) { st.videoFrameWidth = w; st.videoFrameHeight = h; }
        if (f) { if (st.videoFrameRate && typeof st.videoFrameRate === "object") st.videoFrameRate.seconds = 1 / f; else st.videoFrameRate = 1 / f; }
        s.setSettings(st);
      } catch (e) { return "ERR:sequence created but settings could not be applied: " + e; }
    }
    var fin = s.getSettings();
    try { app.project.openSequence(s.sequenceID); } catch (e) {}
    return s.sequenceID + "|" + s.name + "|" + fin.videoFrameWidth + "x" + fin.videoFrameHeight;
  }

  // What the editor has highlighted right now: Project panel items (bins, clips) and timeline clips.
  function selectionInfo() {
    var out = [];
    var items = null;
    try { if (typeof app.getCurrentProjectViewSelection === "function") items = app.getCurrentProjectViewSelection(); } catch (e) {}
    if (!items || !items.length) {
      try {
        var ids = app.getProjectViewIDs();
        for (var v = 0; ids && v < ids.length; v++) { var sel0 = app.getProjectViewSelection(ids[v]); if (sel0 && sel0.length) { items = sel0; break; } }
      } catch (e2) {}
    }
    try {
      if (items && items.length) {
        var parts = [];
        for (var i = 0; i < items.length && i < 12; i++) {
          var it = items[i];
          if (it.type === 2) parts.push("bin \"" + it.name + "\" (" + it.children.numItems + " items)");
          else parts.push("\"" + it.name + "\"");
        }
        if (items.length > 12) parts.push("+" + (items.length - 12) + " more");
        out.push("Project panel: " + parts.join(", "));
      }
    } catch (e) {}
    try {
      var s = seq();
      var sel = s ? s.getSelection() : null;
      if (sel && sel.length) {
        var names = [];
        for (var k = 0; k < sel.length && k < 8; k++) names.push("\"" + sel[k].name + "\" " + (num(sel[k].start.ticks) / T).toFixed(2) + "s");
        if (sel.length > 8) names.push("+" + (sel.length - 8) + " more");
        out.push("Timeline: " + sel.length + " clip(s) selected: " + names.join(", "));
      }
    } catch (e) {}
    return out.join(ROW);
  }

  // Mute (disable) the audio track items whose source media is in the list. json: [mediaPath, ...]. Cmd+Z undoes.
  function muteAudioFor(json) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var want = parse(json), set = {}, n = 0, names = [];
    for (var i = 0; i < want.length; i++) set[want[i]] = true;
    for (var t = 0; t < s.audioTracks.numTracks; t++) {
      var tr = s.audioTracks[t];
      for (var c = 0; c < tr.clips.numItems; c++) {
        var cl = tr.clips[c];
        var mp = ""; try { mp = cl.projectItem ? cl.projectItem.getMediaPath() : ""; } catch (e) {}
        if (mp && set[mp] && !cl.disabled) { try { cl.disabled = true; n++; if (names.length < 12) names.push(cl.name); } catch (e2) {} }
      }
    }
    return "muted " + n + " audio clip(s)" + (names.length ? ": " + names.join(", ") : "");
  }

  // Paths ("A/B") of the bins selected in the Project panel, newline-separated. Empty when none.
  function selectedBinPaths() {
    var items = null;
    try { if (typeof app.getCurrentProjectViewSelection === "function") items = app.getCurrentProjectViewSelection(); } catch (e) {}
    if (!items || !items.length) { try { var ids = app.getProjectViewIDs(); for (var v = 0; ids && v < ids.length; v++) { var s0 = app.getProjectViewSelection(ids[v]); if (s0 && s0.length) { items = s0; break; } } } catch (e2) {} }
    if (!items || !items.length) return "";
    var want = {}; for (var i = 0; i < items.length; i++) if (items[i].type === 2) want[items[i].nodeId] = true;
    var out = [];
    function walk(bin, prefix) {
      for (var k = 0; k < bin.children.numItems; k++) {
        var c = bin.children[k];
        if (c.type !== 2) continue;
        var p = prefix ? prefix + "/" + c.name : c.name;
        if (want[c.nodeId]) out.push(p);
        walk(c, p);
      }
    }
    walk(app.project.rootItem, "");
    return out.join("\n");
  }

  // Change the active sequence's frame size (and optionally rate), then reframe every video clip: "fill" scales
  // each clip up to cover the new frame and centres it; "fit" scales to fit; "none" leaves clips alone.
  // Scale is multiplied (unit-agnostic), position is set to centre. Not undoable: the panel checkpoints first.
  function resizeSequence(width, height, fps, mode) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var w = Number(width), h = Number(height), f = Number(fps);
    var st = s.getSettings();
    var oldW = num(st.videoFrameWidth), oldH = num(st.videoFrameHeight);
    if (!(w && h)) { w = oldW; h = oldH; }
    try {
      st.videoFrameWidth = w; st.videoFrameHeight = h;
      if (f) { if (st.videoFrameRate && typeof st.videoFrameRate === "object") st.videoFrameRate.seconds = 1 / f; else st.videoFrameRate = 1 / f; }
      s.setSettings(st);
    } catch (e) { return "ERR:setSettings " + e; }
    if (w === oldW && h === oldH) mode = "none";
    var done = 0, skipped = 0;
    if (mode === "fill" || mode === "fit") {
      for (var t = 0; t < s.videoTracks.numTracks; t++) {
        var tr = s.videoTracks[t];
        for (var c = 0; c < tr.clips.numItems; c++) {
          var cl = tr.clips[c];
          try {
            var motion = null;
            for (var k = 0; k < cl.components.numItems; k++) { var comp = cl.components[k]; if (comp.displayName === "Motion" || comp.matchName === "AE.ADBE Motion") { motion = comp; break; } }
            if (!motion) { skipped++; continue; }
            var pos = motion.properties[0], scale = motion.properties[1];
            // Source frame from the clip's metadata: "1920 x 1080 (1.0)"; fall back to the old sequence size.
            var srcW = oldW, srcH = oldH;
            try { var vi = String(cl.projectItem.getProjectColumnsMetadata()); var m = /<Column\.Intrinsic\.VideoInfo>(\d+)\s*x\s*(\d+)/.exec(vi); if (m) { srcW = Number(m[1]); srcH = Number(m[2]); } } catch (e0) {}
            var fx = w / srcW, fy = h / srcH;
            var factor = mode === "fill" ? Math.max(fx, fy) : Math.min(fx, fy);
            var cur = num(scale.getValue());
            scale.setValue(cur * factor / Math.max(oldW / srcW, oldH / srcH), true);
            var p = pos.getValue();
            var normalized = p && p.length === 2 && p[0] <= 1.5 && p[1] <= 1.5;
            pos.setValue(normalized ? [0.5, 0.5] : [w / 2, h / 2], true);
            done++;
          } catch (e1) { skipped++; }
        }
      }
    }
    var fin = s.getSettings();
    return "sequence is now " + fin.videoFrameWidth + "x" + fin.videoFrameHeight + (mode === "fill" || mode === "fit" ? "; " + done + " clip(s) reframed (" + mode + ", centred)" + (skipped ? ", " + skipped + " skipped" : "") : "");
  }

  function findItemByMedia(mediaPath) {
    function walk(b) { for (var k = 0; k < b.children.numItems; k++) { var c = b.children[k]; if (c.type === 2) { var r = walk(c); if (r) return r; } else { var mp = ""; try { mp = c.getMediaPath(); } catch (e) {} if (mp === mediaPath) return c; } } return null; }
    return walk(app.project.rootItem);
  }

  // Lay a clip on a video track at a time for a duration (overwrite), sound off. trackIndex 0-based (1 = V2).
  // Follows Adobe's PProPanel sample: overwriteClip(projectItem, seconds). The project item's own marks are not
  // touched; the placed clip is trimmed afterwards (end, and inPoint when a source offset is asked for).
  function overlayClip(mediaPath, atSec, durSec, trackIndex, inSec) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var item = findItemByMedia(mediaPath);
    if (!item) return "ERR:no project item for " + mediaPath;
    var idx = Number(trackIndex); if (isNaN(idx)) idx = 1;
    if (s.videoTracks.numTracks <= idx) return "ERR:video track V" + (idx + 1) + " does not exist (add it in the timeline)";
    var track = s.videoTracks[idx];
    var at = Number(atSec), dur = Number(durSec), inPt = Number(inSec) || 0;
    // Fingerprint every OTHER track so we can prove nothing moved (an overwrite must never ripple or replace).
    function fingerprint() {
      var out = [];
      function list(tracks, skipIdx, prefix) { for (var t = 0; t < tracks.numTracks; t++) { if (t === skipIdx) continue; var tr = tracks[t]; var row = [prefix + t]; for (var c = 0; c < tr.clips.numItems; c++) row.push(tr.clips[c].name + "@" + tr.clips[c].start.ticks + "-" + tr.clips[c].end.ticks); out.push(row.join("|")); } }
      list(s.videoTracks, idx, "V"); list(s.audioTracks, -1, "A");
      return out.join("\n");
    }
    var before = fingerprint();
    // Lock everything except the target track so the linked audio cannot land on A1 over the talking head.
    var locks = [];
    function lockAll(tracks, skipIdx) { for (var t = 0; t < tracks.numTracks; t++) { if (t === skipIdx) continue; var tr = tracks[t]; var was = false; try { was = !!tr.isLocked(); } catch (e) {} locks.push({ tr: tr, was: was }); try { tr.setLocked(1); } catch (e2) {} } }
    lockAll(s.videoTracks, idx); lockAll(s.audioTracks, -1);
    var ok = false, err = "";
    try { ok = track.overwriteClip(item, at); } catch (e) { err = String(e); }
    for (var L = 0; L < locks.length; L++) { try { locks[L].tr.setLocked(locks[L].was ? 1 : 0); } catch (e3) {} }
    if (err) return "ERR:overwriteClip " + err;
    if (!ok) return "ERR:overwriteClip refused";
    var placed = null;
    for (var c = 0; c < track.clips.numItems; c++) { var cl = track.clips[c]; if (Math.abs(num(cl.start.ticks) / T - at) < 0.05) { placed = cl; } }
    if (!placed) return "ERR:clip was inserted but not found at " + at.toFixed(2) + "s on V" + (idx + 1);
    var notes = [];
    if (inPt > 0) { try { var ti = new Time(); ti.seconds = inPt; placed.inPoint = ti; } catch (e1) { notes.push("source offset not applied: " + e1); } }
    if (dur > 0) { try { var te = new Time(); te.seconds = at + dur; placed.end = te; } catch (e2) { notes.push("could not trim: " + e2); } }
    // Any audio the overwrite still created for this clip is removed, not muted: b-roll never carries sound here.
    var removed = 0;
    for (var a = 0; a < s.audioTracks.numTracks; a++) { var tra = s.audioTracks[a]; for (var k = tra.clips.numItems - 1; k >= 0; k--) { var ac = tra.clips[k]; var mp = ""; try { mp = ac.projectItem ? ac.projectItem.getMediaPath() : ""; } catch (e) {} if (mp === mediaPath && Math.abs(num(ac.start.ticks) / T - at) < 0.05) { try { ac.remove(0, 0); removed++; } catch (e4) { try { ac.disabled = true; } catch (e5) {} } } } }
    var after = fingerprint();
    var sync = after === before ? "" : " WARNING: other tracks changed during the overwrite (sync at risk). Cmd+Z and tell the editor.";
    return "placed " + placed.name + " V" + (idx + 1) + " " + at.toFixed(2) + "-" + (num(placed.end.ticks) / T).toFixed(2) + "s" + (removed ? " (its audio removed)" : "") + (notes.length ? " [" + notes.join("; ") + "]" : "") + sync;
  }

  return {
    resizeSequence: resizeSequence, overlayClip: overlayClip, selectedBinPaths: selectedBinPaths, muteAudioFor: muteAudioFor, selectionInfo: selectionInfo, listBins: listBins, moveToBin: moveToBin, binMedia: binMedia, createSequenceFromBin: createSequenceFromBin,
    projectInfo: projectInfo, save: save, openProject: openProject, snapshot: snapshot,
    cloneActive: cloneActive, deleteSequence: deleteSequence, openSequence: openSequence,
    extractRanges: extractRanges, closeGaps: closeGapsActive, frames: frames, isMediaPath: isMediaPath, bindEvents: bindEvents
  };
}());
"PCX loaded";
