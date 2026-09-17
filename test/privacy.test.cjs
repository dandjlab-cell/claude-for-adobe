const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// The repo is public. Nothing personal may enter the tree: home paths, mounted drives, emails, client or
// project names. What counts as private lives in scripts/privacy-patterns.cjs, shared with the pre-push
// history scan, so there is one answer and not two that drift apart. Test fixtures use /Volumes/X.
const ROOT = path.join(__dirname, "..");
const { patterns, TEXT, PRIVATE_WORDS, EXCLUDE } = require("../scripts/privacy-patterns.cjs");
const PATTERNS = patterns();

test("no private paths, emails, or client names in tracked files", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && TEXT.test(f) && !EXCLUDE.includes(f));
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    src.split("\n").forEach((line, i) => {
      for (const [re, what] of PATTERNS) {
        re.lastIndex = 0;
        const m = re.exec(line);
        if (m) hits.push(`${f}:${i + 1}: ${what}: ${m[0]}`);
      }
    });
  }
  assert.deepEqual(hits, [], "private data in the tree:\n" + hits.join("\n"));
});

// A push publishes COMMITS, not the working tree. The tree test above cannot see a commit that added a
// client's path if a later commit removed it: the tree is clean, the test passes, and the push puts the
// first commit on a public repo anyway - where deleting the branch afterwards does not reliably unpublish
// it. On 2026-09-17 a 166-commit branch went out on a by-hand check, which is not a guard.
test("the pre-push hook scans the commits being pushed, not just the tree", () => {
  const hook = fs.readFileSync(path.join(ROOT, ".githooks", "pre-push"), "utf8");
  assert.match(hook, /--test test\/privacy\.test\.cjs/, "the tree");
  assert.match(hook, /scripts\/scan-history\.cjs/, "and the range");
  assert.match(hook, /while read -r _local_ref local_sha _remote_ref remote_sha/, "reads the refs git gives it on stdin");
  assert.match(hook, /--not --remotes/, "a branch new to the remote scans everything no remote already has");
  assert.match(hook, /\[ "\$local_sha" = "\$ZERO" \] && continue/, "a deletion publishes nothing");
});

test("the history scan flags a private path a later commit removed, and exits non-zero", () => {
  const os2 = require("node:os");
  const dir = fs.mkdtempSync(path.join(os2.tmpdir(), "cfa-scan-"));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    git("init", "-q", "."); git("config", "user.email", "t@t.t"); git("config", "user.name", "t");
    fs.writeFileSync(path.join(dir, "a.txt"), "clean\n"); git("add", "a.txt"); git("commit", "-qm", "base");
    fs.writeFileSync(path.join(dir, "a.txt"), 'p = "/Volumes/Client Drive/Secret/x.prproj"\n'); git("add", "a.txt"); git("commit", "-qm", "oops");
    fs.writeFileSync(path.join(dir, "a.txt"), "clean\n"); git("add", "a.txt"); git("commit", "-qm", "removed it");
    const first = git("rev-list", "--max-parents=0", "HEAD").trim();
    const r = require("node:child_process").spawnSync(process.execPath, [path.join(ROOT, "scripts", "scan-history.cjs"), first + "..HEAD"], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 1, "a clean tree must not make a dirty history pass");
    assert.match(r.stderr, /mounted drive path/);
    assert.match(r.stderr, /cannot be taken back/, "and it says what to do about it");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("nothing private is in the guard itself: the terms live outside the repo", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts", "privacy-patterns.cjs"), "utf8");
  assert.match(src, /\.claude-for-adobe-private-words/, "client names are read from the home folder, never listed here");
  assert.ok(!PRIVATE_WORDS.startsWith(ROOT), "and that file is outside the repo");
  for (const f of ["scripts/privacy-patterns.cjs", "scripts/scan-history.cjs", ".githooks/pre-push"]) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const [re, what] of PATTERNS) { re.lastIndex = 0; assert.ok(!re.test(text), f + " contains a " + what); }
  }
});
