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
  // solo: 0-based video track index to render ALONE (every other video track hidden for the render, then restored);
  // "" or -1 renders the composite. Caption tracks are not video tracks and stay visible either way.
  function frames(json, base, solo) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var q = null;
    try { app.enableQE(); q = qe.project.getActiveSequence(); } catch (e) {}
    if (!q) return "ERR:QE unavailable";
    var secs = parse(json);
    var prev = s.getPlayerPosition().ticks;
    var soloIdx = (solo === undefined || solo === "" || solo === null) ? -1 : Number(solo);
    var hidden = [];
    if (soloIdx >= 0) {
      if (soloIdx >= s.videoTracks.numTracks) return "ERR:no video track V" + (soloIdx + 1);
      for (var v = 0; v < s.videoTracks.numTracks; v++) {
        if (v === soloIdx) continue;
        var vt = s.videoTracks[v], was = false;
        try { was = !!vt.isMuted(); } catch (e0) {}
        if (!was) { try { vt.setMute(true); hidden.push(vt); } catch (e1) {} }
      }
    }
    var outs = [];
    // Honest solo: the first row says how many of the other video tracks were actually hidden.
    if (soloIdx >= 0) outs.push("SOLO" + COL + hidden.length + COL + (s.videoTracks.numTracks - 1));
    for (var i = 0; i < secs.length; i++) {
      s.setPlayerPosition(String(Math.round(secs[i] * T)));
      var b = base + "_" + i, ok = false, tc = "";
      try { tc = String(q.CTI.timecode); ok = q.exportFramePNG(tc, b); } catch (e) { ok = "ERR " + e; }
      outs.push(b + COL + ok + COL + tc);
    }
    for (var hi = 0; hi < hidden.length; hi++) { try { hidden[hi].setMute(false); } catch (e2) {} }
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
  function binMedia(binPath, withMeta) {
    var bin = binPath ? binByPath(binPath, false) : app.project.rootItem;
    if (!bin) return "ERR:no bin " + binPath;
    var rows = [];
    var meta0 = withMeta === "false" ? function () { return ""; } : null;
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
        rows.push([c.name, mp, c.nodeId, meta0 ? "" : meta(c, "Column.Intrinsic.VideoInfo"), meta0 ? "" : meta(c, "Column.Intrinsic.MediaTimebase"), meta0 ? "" : meta(c, "Column.Intrinsic.MediaDuration")].join(COL));
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
    return "sequence is now " + s.getSettings().videoFrameWidth + "x" + s.getSettings().videoFrameHeight + reframeClips(s, w, h, oldW, oldH, mode);
  }

  // Reframe the ACTIVE sequence's clips at its current size (footage fills or fits and is centred; graphics
  // untouched). For a sequence just built from raw footage of another shape.
  function reframeActive(mode) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var st = s.getSettings(), w = num(st.videoFrameWidth), h = num(st.videoFrameHeight);
    return "sequence " + w + "x" + h + reframeClips(s, w, h, w, h, mode || "fill");
  }

  function reframeClips(s, w, h, oldW, oldH, mode) {
    var done = 0, skipped = 0, kept = [];
    if (mode === "fill" || mode === "fit") {
      for (var t = 0; t < s.videoTracks.numTracks; t++) {
        var tr = s.videoTracks[t];
        for (var c = 0; c < tr.clips.numItems; c++) {
          var cl = tr.clips[c];
          try {
            var motion = findMotion(cl);
            if (!motion) { skipped++; continue; }
            var pos = motion.properties[0], scale = motion.properties[1];
            var p = pos.getValue(), norm = isNormalized(p), cur = num(scale.getValue());
            var vi = ""; try { vi = String(cl.projectItem.getProjectColumnsMetadata()); } catch (e0) {}
            if (isGraphicItem(cl.projectItem, vi)) {
              // Graphics, titles and guides keep the editor's placement: same position fraction, scale scaled
              // with the frame WIDTH (text and lower thirds are laid out against the width). Nothing is centred.
              var fx0 = norm ? p[0] : p[0] / oldW, fy0 = norm ? p[1] : p[1] / oldH;
              var ns = cur * (w / oldW);
              scale.setValue(ns, true);
              pos.setValue(norm ? [fx0, fy0] : [fx0 * w, fy0 * h], true);
              kept.push("V" + (t + 1) + " \"" + cl.name + "\" position " + fx0.toFixed(3) + "," + fy0.toFixed(3) + " kept, scale " + cur.toFixed(1) + " -> " + ns.toFixed(1));
            } else {
              // Footage: source frame from the clip's metadata ("1920 x 1080 (1.0)"), else the old sequence size.
              var srcW = oldW, srcH = oldH;
              var m = /<Column\.Intrinsic\.VideoInfo>(\d+)\s*x\s*(\d+)/.exec(vi); if (m) { srcW = Number(m[1]); srcH = Number(m[2]); }
              var fx = w / srcW, fy = h / srcH;
              // Scale 100 = source pixels, so the target is absolute; the previous zoom is not carried over.
              scale.setValue(100 * (mode === "fill" ? Math.max(fx, fy) : Math.min(fx, fy)), true);
              pos.setValue(norm ? [0.5, 0.5] : [w / 2, h / 2], true);
            }
            done++;
          } catch (e1) { skipped++; }
        }
      }
    }
    return (mode === "fill" || mode === "fit" ? "; " + done + " clip(s) reframed (footage " + mode + " and centred; " + kept.length + " graphic(s) kept in place)" + (skipped ? ", " + skipped + " skipped" : "") + (kept.length ? "\n" + kept.join("\n") : "") : "");
  }

  function findMotion(cl) {
    for (var k = 0; k < cl.components.numItems; k++) { var comp = cl.components[k]; if (comp.displayName === "Motion" || comp.matchName === "AE.ADBE Motion") return comp; }
    return null;
  }

  // Every video clip's Motion Position and Scale, for the active sequence or one named. Read-only.
  // Rows: track|index|name|x|y|scale|graphic|startSec|endSec ; header: SEQ|name|w|h
  function clipTransforms(seqName) {
    var s = null;
    if (seqName) { for (var i = 0; i < app.project.sequences.numSequences; i++) { if (app.project.sequences[i].name === seqName) { s = app.project.sequences[i]; break; } } if (!s) return "ERR:no sequence named " + seqName; }
    else s = seq();
    if (!s) return "ERR:no active sequence";
    var st = s.getSettings(), W = num(st.videoFrameWidth), H = num(st.videoFrameHeight);
    var rows = ["SEQ" + COL + s.name + COL + W + COL + H];
    for (var t = 0; t < s.videoTracks.numTracks; t++) {
      var tr = s.videoTracks[t];
      for (var c = 0; c < tr.clips.numItems; c++) {
        var cl = tr.clips[c];
        var motion = findMotion(cl);
        var x = "", y = "", sc = "";
        if (motion) { try { var p = motion.properties[0].getValue(); var n = isNormalized(p); x = (n ? p[0] : p[0] / W).toFixed(4); y = (n ? p[1] : p[1] / H).toFixed(4); sc = num(motion.properties[1].getValue()).toFixed(2); } catch (e0) {} }
        var vi = ""; try { vi = String(cl.projectItem.getProjectColumnsMetadata()); } catch (e1) {}
        rows.push(["V" + (t + 1), c, cl.name, x, y, sc, isGraphicItem(cl.projectItem, vi) ? 1 : 0, (num(cl.start.ticks) / T).toFixed(2), (num(cl.end.ticks) / T).toFixed(2)].join(COL));
      }
    }
    return rows.join(ROW);
  }

  // Graphics, stills, titles and alpha media FIT a new frame; footage and nested sequences FILL it. One place
  // for the rule: project item type first, then the Video Info column ("1920 x 1080 (1.0), Alpha"), then extension.
  function isGraphicItem(pi, videoInfo) {
    if (!pi) return true;
    try { if (typeof pi.isSequence === "function" && pi.isSequence()) return false; } catch (e0) {}
    if (/alpha/i.test(String(videoInfo || ""))) return true;
    var mp = ""; try { mp = String(pi.getMediaPath() || ""); } catch (e1) {}
    return !mp || /\.(png|jpe?g|gif|tiff?|psd|ai|svg|mogrt|aep)$/i.test(mp);
  }
  // Motion position is 0-1 fractions in some Premiere builds and pixels in others. A fraction pushed off frame
  // can pass 1.5, so the cut is at 4: no pixel position of a real clip sits inside (0..4, 0..4).
  function isNormalized(p) { return !!(p && p.length === 2 && Math.abs(p[0]) <= 4 && Math.abs(p[1]) <= 4); }

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

  // Frame sizes and start timecodes for just the given media paths (json array). Cheap: metadata only for matches.
  function mediaFrames(json) {
    var want = parse(json), set = {}, rows = [];
    for (var i = 0; i < want.length; i++) set[want[i]] = true;
    function meta(item, key) { try { var xml = String(item.getProjectColumnsMetadata()); var m = new RegExp("<" + key + ">([^<]*)</" + key + ">").exec(xml); return m ? m[1] : ""; } catch (e) { return ""; } }
    function walk(b) { for (var k = 0; k < b.children.numItems; k++) { var c = b.children[k]; if (c.type === 2) { walk(c); continue; } var mp = ""; try { mp = c.getMediaPath(); } catch (e) {} if (mp && set[mp]) { rows.push([mp, meta(c, "Column.Intrinsic.VideoInfo"), meta(c, "Column.Intrinsic.MediaTimebase"), meta(c, "Column.Intrinsic.MediaStart"), meta(c, "Column.Intrinsic.MediaDuration")].join(COL)); delete set[mp]; } } }
    walk(app.project.rootItem);
    return rows.join(ROW);
  }

  // Render the active sequence's audio mix to a 16 kHz mono WAV using Premiere's own preset (in-app export).
  // Returns the output path. This is a read of the timeline, not an edit.
  function exportSequenceAudio(outPath, preset) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    if (!preset) return "ERR:no export preset path given";
    var r = null;
    try { r = s.exportAsMediaDirect(outPath, preset, 0); } catch (e2) { return "ERR:exportAsMediaDirect " + e2; }
    return String(r) === "No Error" || String(r) === "" || String(r) === "0" ? outPath : "ERR:" + r;
  }

  // Import an SRT and add it as a caption track on the active sequence. importFiles is not undoable (checkpoint first).
  function importCaptions(srtPath) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var root = app.project.rootItem;
    var before = root.children.numItems;
    var ok = false;
    try { ok = app.project.importFiles([srtPath], true, root, false); } catch (e) { return "ERR:importFiles " + e; }
    if (!ok) return "ERR:importFiles refused " + srtPath;
    var item = null;
    for (var i = root.children.numItems - 1; i >= 0; i--) { var c = root.children[i]; var mp = ""; try { mp = c.getMediaPath(); } catch (e2) {} if (mp === srtPath || (i >= before && c.type !== 2)) { item = c; break; } }
    if (!item) return "ERR:imported item not found";
    var made = false;
    try { made = s.createCaptionTrack(item, 0, Sequence.CAPTION_FORMAT_SUBTITLE); } catch (e3) { return "ERR:createCaptionTrack " + e3; }
    return made ? "caption track created from " + item.name : "ERR:createCaptionTrack returned false";
  }

  // Move a clip's picture inside the frame: the video clip under `atSec` on track V(trackIndex+1) (or the first
  // video track that has a clip there). dx/dy are fractions of the frame (+x right, +y down); scale is a multiplier
  // (1 = keep). Uses the Motion component; position units are detected (0-1 or pixels). Undo: Cmd+Z.
  // Absolute targets (x, y as frame fractions; scaleAbs as a percentage) win over the deltas when given.
  function nudgeClip(atSec, trackIndex, dx, dy, scaleMul, x, y, scaleAbs) {
    var s = seq();
    if (!s) return "ERR:no active sequence";
    var at = Number(atSec), idx = Number(trackIndex);
    var st = s.getSettings(); var W = num(st.videoFrameWidth), H = num(st.videoFrameHeight);
    // Without a track, every video track is searched; more than one hit (a graphic over the subject) is an
    // error that names them, so the caller says which one instead of the tool guessing V1.
    var hits = [];
    for (var t = 0; t < s.videoTracks.numTracks; t++) {
      if (!isNaN(idx) && idx >= 0 && t !== idx) continue;
      var tr = s.videoTracks[t];
      for (var c = 0; c < tr.clips.numItems; c++) { var cl = tr.clips[c]; var a = num(cl.start.ticks) / T, b = num(cl.end.ticks) / T; if (at >= a - 0.001 && at < b) { hits.push({ clip: cl, t: t }); break; } }
    }
    if (!hits.length) return "ERR:no video clip at " + at.toFixed(2) + "s" + (!isNaN(idx) && idx >= 0 ? " on V" + (idx + 1) : "");
    if (hits.length > 1) { var names = []; for (var hh = 0; hh < hits.length; hh++) names.push("V" + (hits[hh].t + 1) + " \"" + hits[hh].clip.name + "\""); return "ERR:" + hits.length + " clips at " + at.toFixed(2) + "s (" + names.join(", ") + "); pass track to say which one"; }
    var found = hits[0].clip, tIdx = hits[0].t;
    var motion = null;
    for (var k = 0; k < found.components.numItems; k++) { var comp = found.components[k]; if (comp.displayName === "Motion" || comp.matchName === "AE.ADBE Motion") { motion = comp; break; } }
    if (!motion) return "ERR:no Motion component on " + found.name;
    var pos = motion.properties[0], scale = motion.properties[1];
    var p = pos.getValue();
    var normalized = isNormalized(p);
    var hasX = x !== undefined && x !== "" && x !== null, hasY = y !== undefined && y !== "" && y !== null;
    var nx = hasX ? (normalized ? Number(x) : Number(x) * W) : (normalized ? p[0] + Number(dx || 0) : p[0] + Number(dx || 0) * W);
    var ny = hasY ? (normalized ? Number(y) : Number(y) * H) : (normalized ? p[1] + Number(dy || 0) : p[1] + Number(dy || 0) * H);
    try { pos.setValue([nx, ny], true); } catch (e) { return "ERR:position " + e; }
    var sm = Number(scaleMul), sa = (scaleAbs !== undefined && scaleAbs !== "" && scaleAbs !== null) ? Number(scaleAbs) : NaN;
    var finalScale = num(scale.getValue());
    if (!isNaN(sa) && sa > 0) { try { scale.setValue(sa, true); finalScale = sa; } catch (e3) { return "ERR:scale " + e3; } }
    else if (sm && sm !== 1) { try { finalScale = finalScale * sm; scale.setValue(finalScale, true); } catch (e2) { return "ERR:scale " + e2; } }
    // Read back what Premiere actually stored: the report is a fact, not the intent.
    var rp = pos.getValue(), rs = num(scale.getValue());
    var rx = normalized ? rp[0] : rp[0] / W, ry = normalized ? rp[1] : rp[1] / H;
    var wanted = [normalized ? nx : nx / W, normalized ? ny : ny / H];
    var okPos = Math.abs(rx - wanted[0]) < 0.002 && Math.abs(ry - wanted[1]) < 0.002, okScale = Math.abs(rs - finalScale) < 0.05;
    return "nudged " + found.name + " on V" + (tIdx + 1) + ": position now " + rx.toFixed(3) + "," + ry.toFixed(3) + " (frame fractions), scale now " + rs.toFixed(1) + (okPos && okScale ? " | CHECK PASS (read back)" : " | CHECK FAIL: asked " + wanted[0].toFixed(3) + "," + wanted[1].toFixed(3) + " scale " + finalScale.toFixed(1));
  }

  return {
    nudgeClip: nudgeClip, clipTransforms: clipTransforms, reframeActive: reframeActive, importCaptions: importCaptions, exportSequenceAudio: exportSequenceAudio, mediaFrames: mediaFrames, resizeSequence: resizeSequence, overlayClip: overlayClip, selectedBinPaths: selectedBinPaths, muteAudioFor: muteAudioFor, selectionInfo: selectionInfo, listBins: listBins, moveToBin: moveToBin, binMedia: binMedia, createSequenceFromBin: createSequenceFromBin,
    projectInfo: projectInfo, save: save, openProject: openProject, snapshot: snapshot,
    cloneActive: cloneActive, deleteSequence: deleteSequence, openSequence: openSequence,
    extractRanges: extractRanges, closeGaps: closeGapsActive, frames: frames, isMediaPath: isMediaPath, bindEvents: bindEvents
  };
}());
"PCX loaded";
