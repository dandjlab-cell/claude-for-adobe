const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { BUNDLE_ID, currentVersion, installUpdate, isNewer, pickAsset } = require("../src/update.cjs");
const crypto = require("node:crypto");

test("isNewer compares semver-ish versions", () => {
  assert.equal(isNewer("0.2.0", "0.1.9"), true);
  assert.equal(isNewer("v1.0.0", "0.9.9"), true);
  assert.equal(isNewer("0.1.0", "0.1.0"), false);
  assert.equal(isNewer("0.1.0", "0.1.1"), false);
});

test("pickAsset finds the zip and GitHub's sha256 digest", () => {
  const d = "sha256:" + "a".repeat(64);
  const rel = { tag_name: "v0.2.0", html_url: "u", assets: [{ name: "notes.txt" }, { name: "ClaudeForAdobe-0.2.0.zip", browser_download_url: "https://x/z.zip", digest: d }] };
  assert.deepEqual(pickAsset(rel), { version: "0.2.0", url: "https://x/z.zip", digest: "a".repeat(64), notesUrl: "u" });
  assert.equal(pickAsset({ assets: [] }), null);
  assert.equal(pickAsset({ tag_name: "v0.2.0", assets: [{ name: "ClaudeForAdobe-0.2.0.zip", browser_download_url: "https://x/z.zip" }] }), null, "no digest, no update");
  assert.equal(pickAsset({ tag_name: "v0.2.0", assets: [{ name: "evil.zip", browser_download_url: "https://x/z.zip", digest: d }] }), null, "wrong asset name");
});

test("installUpdate verifies the checksum, refuses dev checkouts and symlinks, and syncs cleanly", async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "pcx-upd-"));
  const manifest = '<ExtensionManifest ExtensionBundleId="' + BUNDLE_ID + '"/>';
  const src = path.join(work, "Claude for Adobe"); fs.mkdirSync(path.join(src, "CSXS"), { recursive: true });
  fs.writeFileSync(path.join(src, "CSXS", "manifest.xml"), manifest); fs.writeFileSync(path.join(src, "package.json"), JSON.stringify({ version: "9.9.9" })); fs.writeFileSync(path.join(src, "panel.js"), "new");
  const zip = path.join(work, "u.zip"); spawnSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", src, zip]);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(zip)).digest("hex");
  const root = path.join(work, "installed"); fs.mkdirSync(path.join(root, "CSXS"), { recursive: true });
  fs.writeFileSync(path.join(root, "CSXS", "manifest.xml"), manifest); fs.writeFileSync(path.join(root, "panel.js"), "old"); fs.writeFileSync(path.join(root, "stale.txt"), "x");
  await assert.rejects(installUpdate({ url: zip, digest: "0".repeat(64) }, root), /checksum/);
  await assert.rejects(installUpdate({ url: zip, digest: null }, root), /checksum/);
  assert.equal(fs.readFileSync(path.join(root, "panel.js"), "utf8"), "old");
  fs.mkdirSync(path.join(root, ".git")); await assert.rejects(installUpdate({ url: zip, digest }, root), /git checkout/); fs.rmdirSync(path.join(root, ".git"));
  const link = path.join(work, "link"); fs.symlinkSync(root, link); await assert.rejects(installUpdate({ url: zip, digest }, link), /symlink/);
  assert.equal(await installUpdate({ url: zip, digest }, root), "9.9.9");
  assert.equal(fs.readFileSync(path.join(root, "panel.js"), "utf8"), "new");
  assert.equal(fs.existsSync(path.join(root, "stale.txt")), false);
  // a zip with a symlink inside is refused before anything is touched
  fs.symlinkSync("/etc/passwd", path.join(src, "evil")); const bad = path.join(work, "bad.zip"); spawnSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", src, bad]);
  await assert.rejects(installUpdate({ url: bad, digest: crypto.createHash("sha256").update(fs.readFileSync(bad)).digest("hex") }, root), /symlink/);
  assert.equal(currentVersion(root), "9.9.9");
  fs.rmSync(work, { recursive: true, force: true });
});
