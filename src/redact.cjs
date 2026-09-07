// Redaction for bug reports. A report leaves the editor's machine only by the editor's own hand, but it must
// already be safe when it is written: paths shortened, media and clip names replaced by consistent short tags
// (so a report still reads coherently), emails removed, transcript text dropped. Same rule as everywhere else in
// this project: redact at the source, never trust a downstream filter.
"use strict";
const crypto = require("node:crypto");

function tag(name) { return "item-" + crypto.createHash("sha1").update(String(name)).digest("hex").slice(0, 5); }

// Names of media files and clips seen in the log get a stable tag; the extension is kept so a BRAW stays a BRAW.
function redactNames(text, names) {
  let out = text;
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const n of sorted) {
    const ext = /\.[A-Za-z0-9]{2,5}$/.exec(n);
    const stem = ext ? n.slice(0, -ext[0].length) : n;
    const replacement = tag(stem) + (ext ? ext[0].toLowerCase() : "");
    out = out.split(n).join(replacement);
    if (stem !== n) out = out.split(stem).join(tag(stem));
  }
  return out;
}

function redact(text, { names = [] } = {}) {
  let out = String(text || "");
  // transcript-bearing tool lines are dropped whole: quoted words are the editor's content
  out = out.split("\n").filter((l) => !/tool (read_transcript|find_in_transcript|transcribe_\w+|remove_fillers|remove_pauses|save_notes|list_analysis)/.test(l)).join("\n");
  out = redactNames(out, names);
  // Any absolute path under /Users or /Volumes (spaces included) becomes root + tag(basename) + extension. A path
  // in a log line runs to the closing quote when quoted, else to the end of the line.
  out = out.split("\n").map((line) => {
    let l = line;
    for (const root of ["/Volumes/", "/Users/"]) {
      let i = l.indexOf(root);
      while (i >= 0) {
        const quoted = i > 0 && /["']/.test(l[i - 1]);
        const end = quoted ? l.indexOf(l[i - 1], i) : l.length;
        const pathText = l.slice(i, end < 0 ? l.length : end);
        const base = pathText.split("/").pop() || "";
        const ext = /\.[A-Za-z0-9]{2,7}$/.exec(base);
        const repl = root + "…/" + (base ? tag(ext ? base.slice(0, -ext[0].length) : base) : "") + (ext ? ext[0].toLowerCase() : "");
        l = l.slice(0, i) + repl + l.slice(i + pathText.length);
        i = l.indexOf(root, i + repl.length);
      }
    }
    return l;
  }).join("\n");
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
  out = out.replace(/(https?:\/\/)[^\s"']+/g, "$1[url]");
  out = out.replace(/\b(sk-ant-|sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g, "[key]");
  return out;
}

// Timeline shape without names: track counts, clip counts, durations.
function timelineShape(snap) {
  if (!snap || snap.error) return "no timeline";
  const byTrack = {};
  (snap.clips || []).forEach((c) => { byTrack[c.track] = (byTrack[c.track] || 0) + 1; });
  return snap.width + "x" + snap.height + ", " + Number(snap.duration || 0).toFixed(2) + "s, " + (snap.clips || []).length + " clips: " + Object.keys(byTrack).sort().map((t) => t + "=" + byTrack[t]).join(" ");
}

module.exports = { redact, redactNames, timelineShape, tag };
