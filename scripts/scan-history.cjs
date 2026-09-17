// The commits a push would publish, scanned for private data - not the working tree.
//
// The tree test cannot see this: a commit that ADDS a client's path and a later commit that removes it
// leaves a clean tree, passes, and the push publishes the first commit anyway. On a public repo that is not
// recoverable by deleting the branch afterwards - GitHub caches it and third parties index it. So the
// pre-push hook reads the refs git hands it on stdin and scans the range itself (2026-09-17: a 166-commit
// branch went out after a by-hand check, which is not a guard).
//
// Usage: scripts/scan-history.cjs <range>...   e.g. "origin/main..HEAD" or "abc123 --not --remotes=origin"
"use strict";
const { execFileSync } = require("node:child_process");
const { patterns } = require("./privacy-patterns.cjs");

const ranges = process.argv.slice(2);
if (!ranges.length) { console.error("usage: scan-history.cjs <git log range>..."); process.exit(2); }

let patch = "";
try {
  patch = execFileSync("git", ["log", "-p", "--no-color", "--unified=0", ...ranges], { encoding: "utf8", maxBuffer: 1 << 28 });
} catch (error) {
  console.error("scan-history: could not read the range (" + ranges.join(" ") + "): " + error.message);
  process.exit(2);
}

// Only what the commits ADD. A diff line removing a private path is the fix, not the offence, and the
// commit header lines (+++ b/file) are not content.
const hits = [];
let file = "", commit = "";
for (const line of patch.split("\n")) {
  if (line.startsWith("commit ")) { commit = line.slice(7, 14); continue; }
  if (line.startsWith("+++ b/")) { file = line.slice(6); continue; }
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  for (const [re, what] of patterns()) {
    re.lastIndex = 0;
    const m = re.exec(line);
    if (m) hits.push(commit + " " + file + ": " + what + " " + JSON.stringify(m[0].slice(0, 60)));
  }
}

if (hits.length) {
  console.error("Private data in commits this push would publish:");
  for (const h of hits.slice(0, 25)) console.error("  " + h);
  if (hits.length > 25) console.error("  ... and " + (hits.length - 25) + " more");
  console.error("\nA public push cannot be taken back: rewrite the history (git rebase -i) before pushing.");
  process.exit(1);
}
