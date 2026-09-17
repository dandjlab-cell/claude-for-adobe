// What must never reach a public repo, in one place: the tree test and the pre-push history scan both read
// it, so there is one answer to "what counts as private" and not two that can drift apart.
//
// Client and project names are private themselves, so they are NOT in this file. They live outside the repo,
// one term per line in ~/.claude-for-adobe-private-words: present on the maintainer's machine, absent
// everywhere else, and the scans simply have one fewer pattern where it is absent.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PRIVATE_WORDS = path.join(os.homedir(), ".claude-for-adobe-private-words");

function patterns() {
  const out = [
    [/\/Users\/[A-Za-z0-9_.-]+/g, "home path"],
    [/\/Volumes\/(?!X\b)[^\s"'`)]+/g, "mounted drive path"],
    [/[A-Za-z0-9._%+-]+@(?!anthropic\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "email"],
  ];
  if (fs.existsSync(PRIVATE_WORDS)) {
    const terms = fs.readFileSync(PRIVATE_WORDS, "utf8").split("\n").map((t) => t.trim()).filter(Boolean);
    if (terms.length) out.push([new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi"), "private term"]);
  }
  return out;
}

const TEXT = /\.(cjs|js|jsx|json|md|sh|command|html|css|txt|xml|yml|yaml|swift)$/i;

// The guard's own files. They have to contain a private-LOOKING path to prove they can spot a real one:
// the test plants a fake client drive path in a throwaway repo and requires the scan to fail on it. Scanning
// these files therefore flags the fixture and blocks every push - which is what happened the first time this
// hook ran (14:05). They are excluded by name, and a test checks they hold nothing that matches for real.
const EXCLUDE = ["test/privacy.test.cjs", "scripts/scan-history.cjs", "scripts/privacy-patterns.cjs"];

module.exports = { patterns, TEXT, PRIVATE_WORDS, EXCLUDE };
