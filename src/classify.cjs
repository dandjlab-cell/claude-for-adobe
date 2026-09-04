// Cheap footage classification: speech coverage + duration + transcript presence + camera-style naming.
// Pixels are only for the ambiguous middle; Claude looks at a frame there, not everywhere.
function classifyMedia({ name = "", duration = 0, speechSeconds = 0, hasTranscript = false, method = "vad" }) {
  const ratio = duration > 0 ? Math.min(1, speechSeconds / duration) : 0;
  const camera = /^[A-Z]\d{3}_|\.(braw|r3d|mxf|arw|crm)$/i.test(name);
  let kind, confidence;
  if (duration > 0 && speechSeconds === 0) { kind = "silent / music"; confidence = "high"; }
  else if (ratio >= 0.5) { kind = "talking head / interview"; confidence = ratio >= 0.7 || hasTranscript ? "high" : "medium"; }
  else if (ratio >= 0.15) { kind = "mixed (dialogue + b-roll)"; confidence = "low"; }
  else { kind = "b-roll / little dialogue"; confidence = ratio <= 0.05 ? "high" : "medium"; }
  return { name, duration, speechSeconds, ratio, hasTranscript, camera, method, kind, confidence, lookAtFrame: confidence === "low" };
}

const mmss = (s) => { const m = Math.floor(s / 60); return m + ":" + String(Math.round(s - m * 60)).padStart(2, "0"); };
function formatClassification(rows) {
  return rows.map((r) => r.name + "  " + mmss(r.duration) + "  speech " + Math.round(r.ratio * 100) + "% (" + r.method + ")"
    + (r.hasTranscript ? "  transcript" : "") + (r.camera ? "  camera-original" : "") + "  -> " + r.kind + " [" + r.confidence + "]" + (r.lookAtFrame ? "  look at a frame" : "")).join("\n");
}

module.exports = { classifyMedia, formatClassification };
