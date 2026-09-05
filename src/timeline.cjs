// Live timeline model: snapshot text from ExtendScript -> objects, and a diff between snapshots.
// Pure Node; the ExtendScript that produces the snapshot lives in panel.js.
const TICKS = 254016000000;
const COL = "", ROW = "";

// Snapshot wire format (one row per clip): id|track|name|start|end|inPoint|mediaPath ; first row is the sequence header.
function parseSnapshot(raw) {
  const rows = String(raw || "").split(ROW).filter(Boolean);
  if (!rows.length || rows[0].indexOf("ERR:") === 0) return { error: rows[0] || "empty snapshot", clips: [] };
  const [name, id, width, height, endTicks] = rows[0].split(COL);
  const clips = rows.slice(1).map((r) => {
    const [nodeId, track, clipName, start, end, inPoint, mediaPath] = r.split(COL);
    return { id: nodeId, track, name: clipName, start: Number(start) / TICKS, end: Number(end) / TICKS, inPoint: Number(inPoint) / TICKS, mediaPath };
  });
  return { name, id, width: Number(width), height: Number(height), duration: Number(endTicks) / TICKS, clips };
}

const f = (n) => n.toFixed(2) + "s";

function describeClip(c) { return `${c.track} "${c.name}" ${f(c.start)}-${f(c.end)}`; }

// Human-readable list of changes between two snapshots (for Claude). Empty array = no change.
function diffSnapshots(prev, next) {
  if (!prev || prev.error || next.error) return [];
  const out = [];
  if (prev.id !== next.id) { out.push(`active sequence is now "${next.name}" (${next.width}x${next.height}, ${f(next.duration)})`); return out; }
  if (prev.width !== next.width || prev.height !== next.height) out.push(`frame size ${prev.width}x${prev.height} -> ${next.width}x${next.height}`);
  const before = new Map(prev.clips.map((c) => [c.id, c]));
  const after = new Map(next.clips.map((c) => [c.id, c]));
  next.clips.forEach((c) => {
    const p = before.get(c.id);
    if (!p) { out.push("added " + describeClip(c)); return; }
    const moved = Math.abs(p.start - c.start) > 1e-4, trimmed = Math.abs((p.end - p.start) - (c.end - c.start)) > 1e-4 || Math.abs(p.inPoint - c.inPoint) > 1e-4;
    if (p.track !== c.track) out.push(`moved ${describeClip(p)} -> ${c.track} ${f(c.start)}`);
    else if (moved && !trimmed) out.push(`moved ${describeClip(p)} -> ${f(c.start)}-${f(c.end)}`);
    else if (trimmed) out.push(`trimmed ${describeClip(p)} -> ${f(c.start)}-${f(c.end)} (in ${f(c.inPoint)})`);
    if (p.name !== c.name) out.push(`renamed "${p.name}" -> "${c.name}"`);
  });
  prev.clips.forEach((c) => { if (!after.has(c.id)) out.push("removed " + describeClip(c)); });
  if (out.length && Math.abs(prev.duration - next.duration) > 1e-4) out.push(`sequence duration ${f(prev.duration)} -> ${f(next.duration)}`);
  return out;
}

function formatSnapshot(s, limit = 300) {
  if (s.error) return s.error;
  const lines = [`Sequence "${s.name}" ${s.width}x${s.height}, duration ${f(s.duration)}, ${s.clips.length} clips`];
  const byTrack = new Map();
  s.clips.forEach((c) => { if (!byTrack.has(c.track)) byTrack.set(c.track, []); byTrack.get(c.track).push(c); });
  let n = 0;
  byTrack.forEach((clips, track) => {
    lines.push(track + ":");
    clips.forEach((c) => { if (n++ < limit) lines.push(`  ${f(c.start)}-${f(c.end)} "${c.name}" in ${f(c.inPoint)}${c.mediaPath ? " <" + c.mediaPath + ">" : ""}`); });
  });
  if (n > limit) lines.push(`  ... ${n - limit} more clips`);
  return lines.join("\n");
}

// Folds a list of change lines into a few grouped lines for Claude and for the panel card:
// 17 x `removed A1 "clip" 374.92s-433.60s` -> `removed 17 ranges of A1 "clip" (374.92s-712.47s)`.
function summarizeChanges(lines) {
  const groups = new Map();
  const rest = [];
  lines.forEach((line) => {
    const m = /^(added|removed) (\S+) "(.*)" ([\d.]+)s-([\d.]+)s$/.exec(line);
    if (!m) { rest.push(line); return; }
    const key = m[1] + "|" + m[2] + "|" + m[3];
    const g = groups.get(key) || { verb: m[1], track: m[2], name: m[3], n: 0, lo: Infinity, hi: -Infinity };
    g.n++; g.lo = Math.min(g.lo, Number(m[4])); g.hi = Math.max(g.hi, Number(m[5])); groups.set(key, g);
  });
  const out = [...groups.values()].map((g) => g.n === 1
    ? g.verb + " " + g.track + " \"" + g.name + "\" " + g.lo.toFixed(2) + "s-" + g.hi.toFixed(2) + "s"
    : g.verb + " " + g.n + " ranges of " + g.track + " \"" + g.name + "\" (" + g.lo.toFixed(2) + "s-" + g.hi.toFixed(2) + "s)");
  return out.concat(rest);
}

// ---- What is visible: the picture is the topmost footage clip at a time; graphics sit over it. ----
const isGraphic = (c) => !c.mediaPath || /\.(png|jpe?g|gif|tiff?|psd|ai|svg|mogrt|aep)$/i.test(c.mediaPath);
const trackNo = (c) => Number(String(c.track).slice(1)) || 0;
const videoClips = (snap) => snap.clips.filter((c) => c.track[0] === "V");
// Highest video track with a footage (opaque) clip covering t, or null.
function topFootageAt(snap, t) {
  let top = null;
  videoClips(snap).forEach((c) => { if (!isGraphic(c) && t >= c.start && t < c.end && (!top || trackNo(c) > trackNo(top))) top = c; });
  return top;
}
// First time inside a footage clip where it is the visible picture (not buried under b-roll), or null.
function firstVisibleTime(snap, c, step = 0.5) {
  for (let t = c.start + 0.1; t < c.end; t += step) { const top = topFootageAt(snap, t); if (top && top.id === c.id) return t; }
  return null;
}
// Cuts where the visible picture changes: [{ t, from, to }] with the clip names either side, in time order.
function seams(snap, eps = 0.04) {
  const times = new Set();
  videoClips(snap).filter((c) => !isGraphic(c)).forEach((c) => { times.add(Number(c.start.toFixed(3))); times.add(Number(c.end.toFixed(3))); });
  const out = [];
  [...times].sort((a, b) => a - b).forEach((t) => {
    if (t <= 0 || t >= snap.duration) return;
    const a = topFootageAt(snap, t - eps), b = topFootageAt(snap, t + eps);
    if ((a && a.id) === (b && b.id)) return;
    if (out.length && t - out[out.length - 1].t < eps * 2) return;
    out.push({ t, from: a ? a.track + " \"" + a.name + "\"" : "nothing", to: b ? b.track + " \"" + b.name + "\"" : "nothing" });
  });
  return out;
}

module.exports = { summarizeChanges, COL, ROW, TICKS, diffSnapshots, formatSnapshot, parseSnapshot, isGraphic, topFootageAt, firstVisibleTime, seams };
