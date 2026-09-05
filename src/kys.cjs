// Premiere .kys keyboard-shortcut files: read which key the editor has for a command. Read-only; the panel never
// sends keystrokes. Format (PremiereData XML): per context, <item.N> with <virtualkey>, four <modifier.*> flags and
// <commandname>. virtualkey = 0x80000000 + key code for character keys (letters/digits are ASCII; punctuation uses
// Adobe's own codes, a few known below), or a plain Windows virtual-key code for named keys.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Adobe's own codes, read off the default set (Space = play/stop, Delete = clear, F5 = capture, Left = step back...).
const NAMED = { 1: "Space", 2: "Delete", 3: "Tab", 4: "Return", 35: "ForwardDelete", 36: "Home", 37: "End", 38: "PageUp", 39: "PageDown", 42: "Left", 43: "Right", 44: "Up", 45: "Down" };
for (let i = 0; i < 12; i++) NAMED[7 + i] = "F" + (i + 1);
const CHAR = { 192: ";", 217: "'", 188: ",", 190: ".", 191: "/", 219: "[", 221: "]", 220: "\\", 187: "=", 189: "-", 186: "`" }; // 192/217 read off Lift/Extract defaults; the rest are the Windows OEM codes, unverified

function keyName(vk, mods) {
  if (vk == null) return "";
  let k;
  if (vk >= 0x80000000) { const c = vk - 0x80000000; k = CHAR[c] || ((c >= 32 && c < 127) ? String.fromCharCode(c).toUpperCase() : "key" + c); }
  else k = NAMED[vk] || "key" + vk;
  return (mods.ctrl ? "Ctrl+" : "") + (mods.opt ? "Opt+" : "") + (mods.shift ? "Shift+" : "") + (mods.command ? "Cmd+" : "") + k;
}

function parseKys(xml) {
  const out = [];
  // contexts nest inside <shortcuts>; walk each <context.*> block, then items inside it
  const blocks = [...String(xml).matchAll(/<(context\.[\w.]+)[^>]*>([\s\S]*?)<\/\1>/g)];
  for (const [, ctx, body] of blocks) {
    for (const m of body.matchAll(/<item\.\d+[^>]*>([\s\S]*?)<\/item\.\d+>/g)) {
      const it = m[1]; const g = (tag) => { const r = new RegExp("<" + tag + ">([^<]*)<").exec(it); return r ? r[1] : ""; };
      const command = g("commandname"); if (!command) continue;
      const vk = g("virtualkey") === "" ? null : Number(g("virtualkey"));
      const mods = { command: g("modifier.command") === "true", opt: g("modifier.opt") === "true", shift: g("modifier.shift") === "true", ctrl: g("modifier.ctrl") === "true" };
      out.push({ command, context: ctx.replace(/^context\./, ""), key: keyName(vk, mods) });
    }
  }
  return out;
}

// The editor's shortcut files for a Premiere major version (Documents/Adobe/Premiere Pro/<major>.0/Profile-*/Mac/*.kys).
function userKysFiles(majorVersion) {
  const base = path.join(os.homedir(), "Documents", "Adobe", "Premiere Pro", String(majorVersion).split(".")[0] + ".0");
  const files = [];
  try { for (const prof of fs.readdirSync(base)) { const mac = path.join(base, prof, "Mac"); try { for (const f of fs.readdirSync(mac)) if (/\.kys$/i.test(f)) files.push(path.join(mac, f)); } catch (_) {} } } catch (_) {}
  return files;
}

// Commands whose id contains every word of the query (or the query as a regex), with the key in each set.
function findShortcuts(query, files) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const bySet = new Map();
  for (const f of files) {
    let rows = []; try { rows = parseKys(fs.readFileSync(f, "utf8")); } catch (_) { continue; }
    bySet.set(path.basename(f, ".kys"), rows);
  }
  const cmds = new Map();
  for (const [set, rows] of bySet) for (const r of rows) {
    if (!words.every((w) => r.command.toLowerCase().includes(w))) continue;
    const e = cmds.get(r.command) || { command: r.command, keys: {} };
    if (r.key) (e.keys[set] = e.keys[set] || []).push(r.key + (r.context !== "global" ? " (" + r.context + ")" : ""));
    cmds.set(r.command, e);
  }
  return [...cmds.values()].sort((a, b) => a.command.localeCompare(b.command));
}

module.exports = { parseKys, keyName, userKysFiles, findShortcuts, NAMED, CHAR };
