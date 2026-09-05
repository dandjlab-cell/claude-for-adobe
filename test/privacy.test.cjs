const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// The repo is public. Nothing personal may enter the tree: home paths, mounted drives, emails,
// client or project names. Test fixtures use /Volumes/X; everything else is flagged.
const ROOT = path.join(__dirname, "..");
const PATTERNS = [
  [/\/Users\/[A-Za-z0-9_.-]+/g, "home path"],
  [/\/Volumes\/(?!X\/)[^\s"'`)]+/g, "mounted drive path"],
  [/[A-Za-z0-9._%+-]+@(?!anthropic\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "email"],
];
// Client and project names are private themselves, so they live OUTSIDE the repo: one term per line in
// ~/.claude-for-adobe-private-words. Absent on other machines; present on the maintainer's.
const PRIVATE_WORDS = path.join(os.homedir(), ".claude-for-adobe-private-words");
if (fs.existsSync(PRIVATE_WORDS)) {
  const terms = fs.readFileSync(PRIVATE_WORDS, "utf8").split("\n").map((t) => t.trim()).filter(Boolean);
  if (terms.length) PATTERNS.push([new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi"), "private term"]);
}
const TEXT = /\.(cjs|js|jsx|json|md|sh|command|html|css|txt|xml|yml|yaml)$/i;

test("no private paths, emails, or client names in tracked files", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && TEXT.test(f) && f !== "test/privacy.test.cjs");
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
