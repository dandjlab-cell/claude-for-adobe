// Reading the clipboard without the keyboard and without Chromium.
//
// Inside Premiere the panel cannot count on Cmd+V: Premiere claims the editing shortcuts, and asking
// for them (registerKeyEventsInterest, index.html) does not move every host. So the panel reads the
// system clipboard itself, through the OS. Text only - images and files still arrive through the
// paste and drop handlers in panel.js, which do get clipboard data when the event reaches them.
"use strict";
const { spawnSync } = require("node:child_process");

// ponytail: macOS only, like the rest of the product (README: Apple Silicon, no Windows build).
// A Windows build adds a `powershell -Command Get-Clipboard -Raw` branch here and nothing else.
const defaultRun = () => spawnSync("pbpaste", [], { encoding: "utf8", maxBuffer: 1 << 24 });

// Returns the clipboard's text, or "" when it holds no text (an image, a file, nothing at all).
// Never throws: a failed read must not take the panel's input box down with it.
function readText(run = defaultRun) {
  let r;
  try { r = run(); } catch (_) { return ""; }
  if (!r || r.error || r.status !== 0) return "";
  return String(r.stdout || "").replace(/\r\n/g, "\n");
}

// Put text into a textarea at the cursor, replacing any selection, and leave the cursor after it -
// what a real paste does. Returns the new value so a caller can act on it without re-reading.
function insertAtCursor(el, text) {
  if (!text) return el.value;
  const start = Number.isInteger(el.selectionStart) ? el.selectionStart : el.value.length;
  const end = Number.isInteger(el.selectionEnd) ? el.selectionEnd : start;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const caret = start + text.length;
  el.selectionStart = el.selectionEnd = caret;
  return el.value;
}

module.exports = { readText, insertAtCursor };
