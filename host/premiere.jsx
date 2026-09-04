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

  return {
    listBins: listBins, moveToBin: moveToBin,
    projectInfo: projectInfo, save: save, openProject: openProject, snapshot: snapshot,
    cloneActive: cloneActive, deleteSequence: deleteSequence, openSequence: openSequence,
    extractRanges: extractRanges, closeGaps: closeGapsActive, frames: frames, isMediaPath: isMediaPath, bindEvents: bindEvents
  };
}());
"PCX loaded";
