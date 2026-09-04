const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCheckpoint, createHoldingCopy, listCheckpoints, revertCheckpoint } = require("../src/checkpoint.cjs");

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ckpt-"));
  const file = path.join(dir, "Demo.prproj");
  fs.writeFileSync(file, "version-1");
  return file;
}

test("refuses unsaved and non-prproj projects", () => {
  assert.throws(() => createCheckpoint("", "x"), /not saved/);
  assert.throws(() => createCheckpoint("/tmp/nope.txt", "x"), /\.prproj/);
  assert.throws(() => createCheckpoint("/tmp/does-not-exist.prproj", "x"), /does not exist/);
});

test("create -> list -> revert round trip", () => {
  const file = tempProject();
  const entry = createCheckpoint(file, "before edit");
  fs.writeFileSync(file, "version-2");
  const listed = listCheckpoints(file);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].intact, true);
  assert.equal(listed[0].label, "before edit");
  revertCheckpoint(file, entry.id);
  assert.equal(fs.readFileSync(file, "utf8"), "version-1");
});

test("detects hash mismatch and refuses revert", () => {
  const file = tempProject();
  const entry = createCheckpoint(file, "x");
  fs.writeFileSync(entry.file, "tampered");
  assert.equal(listCheckpoints(file)[0].intact, false);
  assert.throws(() => revertCheckpoint(file, entry.id), /corrupt/);
});

test("holding copy is a separate .prproj with the checkpoint contents", () => {
  const file = tempProject();
  const entry = createCheckpoint(file, "x");
  const holding = createHoldingCopy(file, entry.id);
  assert.notEqual(holding, entry.file);
  assert.equal(fs.readFileSync(holding, "utf8"), "version-1");
  assert.match(path.basename(holding), /^\.holding-.*\.prproj$/);
});
