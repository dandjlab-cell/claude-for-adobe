// In-panel updates: check GitHub Releases for a newer version, download the zip, verify it, unpack it
// over the installed folder. The panel then asks the user to close and reopen it. No Finder, no Terminal.
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const UPDATE_REPO = "dandjlab-cell/claude-for-adobe"; // owner/repo on GitHub; releases must carry the zip as an asset

const parse = (v) => String(v || "").replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
function isNewer(candidate, current) {
  const a = parse(candidate), b = parse(current);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return false;
}

function currentVersion(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version || "0.0.0"; } catch (_) { return "0.0.0"; }
}

// The release's zip asset (first .zip), with GitHub's own sha256 digest when present.
function pickAsset(release) {
  if (!release || !Array.isArray(release.assets)) return null;
  const a = release.assets.find((x) => /^ClaudeForAdobe-\d+\.\d+\.\d+\.zip$/.test(x.name || ""));
  if (!a) return null;
  const digest = typeof a.digest === "string" && /^sha256:[0-9a-f]{64}$/.test(a.digest) ? a.digest.slice(7) : null;
  if (!digest) return null; // no checksum, no update
  return { version: String(release.tag_name || release.name || "").replace(/^v/, ""), url: a.browser_download_url, digest, notesUrl: release.html_url || "" };
}

const ALLOWED_HOSTS = /^(?:api\.github\.com|github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)$/;
function get(url, { json = false, dest = null, hops = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const host = (() => { try { return new URL(url).host; } catch (_) { return ""; } })();
    if (!url.startsWith("https://") || !ALLOWED_HOSTS.test(host)) return reject(new Error("refusing non-GitHub download: " + url));
    if (hops > 5) return reject(new Error("too many redirects"));
    const req = https.get(url, { headers: { "User-Agent": "premiere-claude-panel", Accept: json ? "application/vnd.github+json" : "*/*" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return get(res.headers.location, { json, dest, hops: hops + 1 }).then(resolve, reject); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " for " + url)); }
      if (dest) { const out = fs.createWriteStream(dest); res.pipe(out); out.on("finish", () => resolve(dest)); out.on("error", reject); return; }
      let body = ""; res.setEncoding("utf8"); res.on("data", (c) => { body += c; }); res.on("end", () => { try { resolve(json ? JSON.parse(body) : body); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
}

// null when up to date or offline; otherwise { version, url, digest, notesUrl }.
async function checkForUpdate(root, repo = UPDATE_REPO) {
  const release = await get("https://api.github.com/repos/" + repo + "/releases/latest", { json: true });
  const asset = pickAsset(release);
  return asset && isNewer(asset.version, currentVersion(root)) ? asset : null;
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// Downloads (or copies, when `url` is a local path) the zip, verifies, unpacks, and syncs it over `root`.
const BUNDLE_ID = "com.claude-for-adobe.premiere";

// Refuses to touch anything that is not a plain installed copy of this panel.
function assertUpdatableRoot(root) {
  const st = fs.lstatSync(root);
  if (st.isSymbolicLink()) throw new Error("this is a development install (symlink); update from git instead");
  if (fs.existsSync(path.join(root, ".git"))) throw new Error("this folder is a git checkout; update from git instead");
  const manifest = path.join(root, "CSXS", "manifest.xml");
  if (!fs.existsSync(manifest) || !new RegExp('ExtensionBundleId="' + BUNDLE_ID.replace(/\./g, "\\.") + '"').test(fs.readFileSync(manifest, "utf8"))) throw new Error("this folder is not an installed copy of the panel");
}

// Walks the unpacked tree: no symlinks, no odd entries, and the manifest must be ours.
function assertSafeTree(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw new Error("update archive contains a symlink (" + e.name + "); not installing");
    if (!e.isFile() && !e.isDirectory()) throw new Error("update archive contains an unsupported entry (" + e.name + ")");
    if (e.isDirectory()) assertSafeTree(p);
  }
}

// Downloads (or copies, when `url` is a local path, tests only) the zip, verifies the checksum, unpacks into a temp
// dir, checks the tree, then syncs it over `root` with a backup that is restored if the sync fails.
async function installUpdate({ url, digest }, root) {
  if (!digest) throw new Error("release has no checksum; not installing");
  assertUpdatableRoot(root);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "claude-for-adobe-update-"));
  try {
    const zip = path.join(work, "update.zip");
    if (url.startsWith("/")) fs.copyFileSync(url, zip); else await get(url, { dest: zip });
    if (sha256(zip) !== digest) throw new Error("downloaded file does not match the release checksum; not installing");
    const stage = path.join(work, "stage"); fs.mkdirSync(stage);
    // Inspect the archive listing before anything is extracted: no absolute or parent paths, no symlinks.
    const listing = spawnSync("/usr/bin/zipinfo", [zip], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    if (listing.status !== 0) throw new Error("could not read the update archive");
    for (const line of listing.stdout.split("\n").slice(1)) {
      const m = /^([-dl][rwxst-]{9}).*\s(\S.*)$/.exec(line);
      if (!m) continue;
      if (m[1][0] === "l") throw new Error("update archive contains a symlink (" + m[2] + "); not installing");
      if (m[2].startsWith("/") || m[2].split("/").includes("..")) throw new Error("update archive contains an unsafe path (" + m[2] + "); not installing");
    }
    const un = spawnSync("/usr/bin/ditto", ["-x", "-k", zip, stage], { encoding: "utf8" });
    if (un.status !== 0) throw new Error("could not unpack the update: " + (un.stderr || "").trim());
    assertSafeTree(stage);
    const manifestDir = findManifestDir(stage);
    const idRe = new RegExp('ExtensionBundleId="' + BUNDLE_ID.replace(/\./g, "\\.") + '"');
    if (!manifestDir || !idRe.test(fs.readFileSync(path.join(manifestDir, "CSXS", "manifest.xml"), "utf8"))) throw new Error("the update zip is not this panel (bundle id mismatch)");
    const backup = path.join(work, "backup");
    const bk = spawnSync("/usr/bin/ditto", [root, backup], { encoding: "utf8" });
    if (bk.status !== 0) throw new Error("could not back up the current install: " + (bk.stderr || "").trim());
    const sync = spawnSync("/usr/bin/rsync", ["-a", "--delete", "--ignore-times", manifestDir + "/", root + "/"], { encoding: "utf8" });
    if (sync.status !== 0) {
      const restore = spawnSync("/usr/bin/rsync", ["-a", "--delete", "--ignore-times", backup + "/", root + "/"], { encoding: "utf8" });
      if (restore.status !== 0) throw new Error("update failed AND the previous version could not be restored; reinstall from the release zip. " + (sync.stderr || "").trim());
      throw new Error("could not copy the update into place (previous version restored): " + (sync.stderr || "").trim());
    }
    spawnSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", root]);
    return currentVersion(root);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

function findManifestDir(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, "CSXS", "manifest.xml"))) return dir;
  if (depth > 2) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith("__MACOSX")) { const r = findManifestDir(path.join(dir, e.name), depth + 1); if (r) return r; }
  }
  return null;
}

module.exports = { BUNDLE_ID, UPDATE_REPO, assertSafeTree, assertUpdatableRoot, checkForUpdate, currentVersion, installUpdate, isNewer, pickAsset };
