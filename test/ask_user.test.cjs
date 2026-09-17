/**
 * ask_user: the panel's question card as a tool the model can reach for.
 *
 * The owner, 2026-09-17 12:52: "the question panel should be more of a tool that it has available to it -
 * similar to how that is available for the desktop Claude Code version ... don't need to reinvent the
 * wheel", and 12:58: "I want to avoid hard coding it to one specific ask." So the control is general
 * (askChoice: any labels, any count) and the log question is one caller of it, not its own widget.
 *
 * panel.js runs inside CEP with a DOM and cannot be required here, so these read it as text - the same way
 * the other panel guards do.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
const between = (from, to) => panel.slice(panel.indexOf(from), panel.indexOf(to));

test("askChoice is the general control: any number of labels, resolves the one clicked", () => {
  const fn = between("function askChoice(", "// ask_user: the model's own door");
  assert.match(fn, /labels\.forEach\(\(label, i\) =>/, "the buttons come from the list, not from named yes/no arguments");
  assert.match(fn, /resolve\(label\)/, "it resolves the label itself, so callers read an answer and not a boolean");
  assert.match(fn, /addMessage\("assistant muted"/, "the question lands in the chat, not in a system dialog");
  assert.match(fn, /signal[\s\S]*?finish\(null, "Cancelled: the call was abandoned"\)/, "an abandoned call stops being clickable");
});

test("ask_user is registered as a tool, takes 2-4 options and returns the label chosen", () => {
  assert.match(panel, /const TOOLS = \{ ask_user: askUserTool,/, "it is in the tool table");
  const def = between('{ name: "ask_user"', '{ name: "log_lut"');
  assert.match(def, /required: \["question", "options"\]/);
  assert.match(def, /USE THIS INSTEAD OF WRITING OUT A LIST OF OPTIONS/, "the description tells the model when to reach for it");
  assert.match(def, /One decision per call/, "one question at a time, so the answer is unambiguous");
  const fn = between("async function askUserTool(", "async function readProject(");
  assert.match(fn, /\.slice\(0, 4\)/, "four answers at most - past that a question is really two questions");
  assert.match(fn, /labels\.length < 2/, "and at least two, or it is not a question");
  assert.match(fn, /The user did not answer/, "an unanswered question is reported as unanswered, never guessed");
});
