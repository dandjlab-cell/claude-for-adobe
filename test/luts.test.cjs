/**
 * The makers' official conversion LUTs: the registry, and the links in it.
 *
 * Every url here was fetched and opened by hand on 2026-09-17 - status, content type, size, and the names
 * inside the archive. The reachability test below re-runs that check with HEAD requests, so a link that
 * rots (Canon's carries a version string that has already moved once, Nikon's tokens are per-release) is
 * caught here rather than in the middle of a grade. It is skipped without a network.
 */

"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { REGISTRY, forMaker, site, normaliseCube, needsRewrite, safeName } = require("../src/luts.cjs");

test("every entry is either a direct download or a page a human can use - never neither", () => {
  for (const [id, e] of Object.entries(REGISTRY)) {
    assert.ok(e.maker && e.label, id + " needs a maker and a label");
    assert.ok(e.page, id + " needs a page: a direct link can rot, and then a human has to go and get it");
    assert.equal(!!e.url, !!e.file, id + ": a direct link and the name it is stored under go together");
    if (e.url) assert.match(e.url, /^https:\/\//, id + " must be https");
    assert.ok(site(e), id + " must resolve to a site the editor can be shown before anything downloads");
  }
});

test("a pack of many LUTs names the one it wants; a single-file download does not have to", () => {
  // Canon, Fuji and Sony's S-Log2 ship whole libraries, and the neutral conversion sits beside the looks.
  for (const id of ["canon-clog3-cinemagamut-to-709", "fuji-flog-to-709", "sony-slog2-sgamut-to-709", "panasonic-vlog-to-v709"]) {
    assert.ok(REGISTRY[id].pick, id + " downloads a pack, so it must say which file in it is the conversion");
  }
  // And none of the picks is one of the looks that sit next to it.
  assert.doesNotMatch(REGISTRY["canon-clog3-cinemagamut-to-709"].pick + REGISTRY["fuji-flog-to-709"].pick, /ETERNA|Cine\+/i);
});

test("the makers an editor is likely to hand us are covered", () => {
  for (const maker of ["sony", "canon", "panasonic", "arri", "fuji", "dji", "nikon", "blackmagic"]) {
    assert.ok(forMaker(maker).length, "no entry for " + maker);
  }
  // Blackmagic and Nikon are honestly page-only: no standalone file exists to fetch.
  assert.equal(forMaker("blackmagic")[0].url, null);
  assert.equal(forMaker("nikon")[0].url, null);
});

test("a downloaded cube is rewritten the way Adobe's own are laid out", () => {
  const size = 2, body = [];
  for (let i = 0; i < size * size * size; i++) body.push("0.5 0.25 0.125");
  const messy = "﻿# a comment\r\n\r\nTITLE \"x\"\r\nLUT_3D_INPUT_RANGE 0 1\r\nLUT_3D_SIZE " + size + "\r\n" + body.join("\r\n") + "\r\n";
  const out = normaliseCube(messy, "Test LUT").split("\n");
  assert.equal(out[0], 'TITLE "Test LUT"');
  assert.equal(out[1], "LUT_3D_SIZE 2");
  assert.deepEqual(out.slice(2, 4), ["DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]);
  assert.equal(out[4], "0.500000 0.250000 0.125000");
  assert.throws(() => normaliseCube("LUT_3D_SIZE 4\n0 0 0\n"), /not a 3D cube/, "a truncated cube is refused, not half-written");
  assert.equal(safeName("A Lut - v1.0+x.cube"), "A_Lut_v1.0_x.cube", "spaces, + and - keep Premiere from applying a LUT");
});

test("a maker's file is rewritten only when Premiere would refuse it as it stands", () => {
  // Canon's terms forbid reformatting as well as redistributing, so a file Premiere already accepts is
  // stored byte for byte as the maker wrote it. Only the documented blockers earn a rewrite.
  assert.equal(needsRewrite("LUT_3D_SIZE 2\n0 0 0\n"), false, "clean LF, no header junk: left alone");
  assert.equal(needsRewrite("LUT_3D_SIZE 2\r\n0 0 0\r\n"), true, "CRLF");
  assert.equal(needsRewrite("\ufeffLUT_3D_SIZE 2\n0 0 0\n"), true, "BOM");
  assert.equal(needsRewrite("# Sony\n\nLUT_3D_SIZE 2\n0 0 0\n"), true, "comments and a blank line before the size");
  assert.equal(needsRewrite("LUT_3D_INPUT_RANGE 0 1\nLUT_3D_SIZE 2\n0 0 0\n"), true, "a Resolve-ism Premiere rejects");
});

test("a licence that restricts more than redistribution is carried with the file, not hidden", () => {
  // Canon licenses for personal, non-commercial use. An editor grading paid work should hear that from us.
  assert.match(REGISTRY["canon-clog3-cinemagamut-to-709"].terms, /non-commercial/);
  for (const [id, e] of Object.entries(REGISTRY)) if (e.terms) assert.ok(e.terms.length < 200, id + "'s terms line is a sentence, not a EULA");
});

test("every direct link still answers", (t) => {
  // Offline is not a failure, and it is read off the calls themselves rather than from a probe of some
  // unrelated host: curl exits 6/7 when DNS or the connection is the problem, and a run where EVERY link
  // fails that way is a machine with no network, not eight makers moving their files on the same day.
  const bad = [], offline = [];
  for (const [id, e] of Object.entries(REGISTRY)) {
    if (!e.url) continue;
    const r = spawnSync("curl", ["-sIL", "-A", "Mozilla/5.0", "--max-time", "30", "-o", "/dev/null",
      "-w", "%{http_code}", e.url], { encoding: "utf8" });
    if ([6, 7, 28, 35].includes(r.status)) { offline.push(id); continue; }
    if (String(r.stdout || "").trim() !== "200") bad.push(id + " -> " + (String(r.stdout || "").trim() || r.status) + " (" + e.url + ")");
  }
  if (offline.length && !bad.length && offline.length === Object.values(REGISTRY).filter((e) => e.url).length) return t.skip("no network");
  assert.deepEqual(bad.concat(offline.map((id) => id + " -> could not be reached")), [],
    "a maker moved a file: fix the url from its page (" + Object.values(REGISTRY).map((e) => e.page).join(", ") + ")");
});
