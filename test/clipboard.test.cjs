"use strict";
// The clipboard is read through the OS because Cmd+V cannot be relied on inside Premiere. The tests
// inject the reader rather than writing to the real clipboard: a test must never clobber whatever the
// editor has copied. One live call is made read-only, to prove the command exists on this machine.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readText, insertAtCursor } = require("../src/clipboard.cjs");

const fake = (out, extra = {}) => () => ({ status: 0, stdout: out, ...extra });

test("clipboard text comes back with newlines normalised", () => {
  assert.equal(readText(fake("one\r\ntwo")), "one\ntwo");
  assert.equal(readText(fake("plain")), "plain");
});

test("a clipboard with no text reads as empty, never as a crash", () => {
  assert.equal(readText(fake("")), "");
  assert.equal(readText(() => ({ status: 1, stdout: "" })), "", "a failed command");
  assert.equal(readText(() => ({ error: new Error("ENOENT"), status: null })), "", "no pbpaste on this host");
  assert.equal(readText(() => { throw new Error("spawn blew up"); }), "", "a throwing reader");
});

test("reading the real clipboard does not throw and returns a string", () => {
  assert.equal(typeof readText(), "string"); // read-only: nothing is written to the clipboard
});

const box = (value, start, end) => ({ value, selectionStart: start, selectionEnd: end === undefined ? start : end });

test("paste lands at the cursor and leaves the caret after it", () => {
  const el = box("hello world", 5);
  assert.equal(insertAtCursor(el, " there"), "hello there world");
  assert.equal(el.selectionStart, 11, "caret sits after the pasted text");
  assert.equal(el.selectionEnd, 11);
});

test("paste replaces a selection, like a real paste does", () => {
  const el = box("keep THIS end", 5, 9);
  assert.equal(insertAtCursor(el, "that"), "keep that end");
  assert.equal(el.selectionStart, 9);
});

test("empty clipboard text leaves the box exactly as it was", () => {
  const el = box("untouched", 3);
  assert.equal(insertAtCursor(el, ""), "untouched");
  assert.equal(el.selectionStart, 3, "the caret does not move");
});

test("a box with no cursor information appends", () => {
  const el = { value: "tail" };
  assert.equal(insertAtCursor(el, "ed"), "tailed");
});
