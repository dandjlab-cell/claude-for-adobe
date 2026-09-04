const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DIR_NAME = "_claude-for-adobe_checkpoints";

function sha1(file) {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

function checkpointDir(projectPath) {
  return path.join(path.dirname(projectPath), DIR_NAME);
}

function manifestPath(projectPath) {
  return path.join(checkpointDir(projectPath), "manifest.json");
}

function readManifest(projectPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(projectPath), "utf8"));
  } catch (_) {
    return [];
  }
}

function assertCheckpointable(projectPath) {
  const p = String(projectPath || "");
  if (!p) throw new Error("Project is not saved. Save it as a local .prproj before mutating scripts can run.");
  if (path.extname(p).toLowerCase() !== ".prproj") throw new Error("Only local .prproj files can be checkpointed (got " + p + ").");
  if (!fs.existsSync(p)) throw new Error("Project file does not exist on disk: " + p);
  // ponytail: cloud projects and Productions are not detected specially; a missing/odd path fails above.
}

function createCheckpoint(projectPath, label) {
  assertCheckpointable(projectPath);
  const dir = checkpointDir(projectPath);
  fs.mkdirSync(dir, { recursive: true });
  const id = Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex");
  const file = path.join(dir, id + ".prproj");
  fs.copyFileSync(projectPath, file);
  const entry = {
    id,
    label: String(label || "").slice(0, 200),
    sourcePath: projectPath,
    file,
    bytes: fs.statSync(file).size,
    sha1: sha1(file),
    createdAt: new Date().toISOString(),
  };
  const manifest = readManifest(projectPath);
  manifest.push(entry);
  fs.writeFileSync(manifestPath(projectPath), JSON.stringify(manifest, null, 2));
  return entry;
}

function listCheckpoints(projectPath) {
  if (!projectPath) return [];
  return readManifest(projectPath).map((entry) => ({
    ...entry,
    intact: fs.existsSync(entry.file) && sha1(entry.file) === entry.sha1,
  }));
}

function getIntactCheckpoint(projectPath, id) {
  const entry = listCheckpoints(projectPath).find((e) => e.id === id);
  if (!entry) throw new Error("Unknown checkpoint " + id);
  if (!entry.intact) throw new Error("Checkpoint " + id + " is corrupt (hash mismatch); refusing to revert.");
  return entry;
}

// Copies the checkpoint over the project file. Caller must ensure Premiere does not have that
// path open (see panel.js revert: it parks Premiere on a holding project first).
function revertCheckpoint(projectPath, id) {
  const entry = getIntactCheckpoint(projectPath, id);
  fs.copyFileSync(entry.file, entry.sourcePath);
  return entry;
}

// A throwaway copy of a checkpoint that Premiere can open while the original path is rewritten.
function createHoldingCopy(projectPath, id) {
  const entry = getIntactCheckpoint(projectPath, id);
  const file = path.join(checkpointDir(projectPath), ".holding-" + id + "-" + Date.now().toString(36) + ".prproj");
  fs.copyFileSync(entry.file, file);
  return file;
}

module.exports = { DIR_NAME, createCheckpoint, createHoldingCopy, listCheckpoints, revertCheckpoint, checkpointDir };
