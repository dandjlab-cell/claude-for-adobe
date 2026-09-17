// The makers' official log-to-Rec.709 conversion LUTs: where they live, and where they go on this machine.
//
// Not bundled: the makers license these for use, not redistribution, so the panel fetches each from the
// maker's own page onto the editor's machine (the owner, 2026-09-17: "they give it to editors to get the
// colour right" - and it should be requested and explained, not searched for). Direct links only; when a
// maker gates the download behind a click-through, the entry says so and gives the page instead.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

// A visible folder, not the hidden Library: the editor has to be able to reach these files for Lumetri's
// Browse (the owner, 11:38: "getting to that lut is difficult because it's behind a hidden folder").
const HOME = path.join(os.homedir(), "Documents", "Claude for Premiere", "LUTs");

// id -> { maker, label, space (Premiere's override name it corresponds to), url (direct zip or cube),
// file (the .cube inside), page (where a human downloads it when url is null) }
const REGISTRY = {
  "sony-slog3-sgamut3cine-to-709": {
    maker: "sony", label: "Sony S-Log3/S-Gamut3.Cine → Rec.709 (s709 v2.00, official)", space: "Sony S-Log3/S-Gamut3.Cine",
    url: "https://77snszqv.media.zestyio.com/Slog3-S-Gamut3.Cine_To_s709_V200.zip", file: "Slog3-S-Gamut3.Cine_To_s709_V200.cube",
    page: "https://sony-cinematography.com/resources/luts/",
  },
  "sony-slog2-sgamut-to-709": {
    maker: "sony", label: "Sony S-Log2/S-Gamut → Rec.709 (Look Profile, official)", space: "Sony S-Log2/S-Gamut",
    url: null, file: null,
    page: "https://www.sony.co.in/electronics/support/software/00263050", // click-through; the page refuses automated downloads
  },
  "canon-clog3-cinemagamut-to-709": {
    maker: "canon", label: "Canon Log3/Cinema Gamut → Rec.709 (official)", space: "Canon Log3/Cinema Gamut",
    url: null, file: null, page: "https://www.canon-europe.com/support/business-product-support/professional-video-luts/",
  },
  "panasonic-vlog-to-v709": {
    maker: "panasonic", label: "Panasonic V-Log → V-709 (official)", space: "Panasonic V-Log/V-Gamut",
    url: null, file: null, page: "https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/lut/",
  },
  "blackmagic-gen5-film-to-video": {
    maker: "blackmagic", label: "Blackmagic Design Film Gen 5 → Video (ships with DaVinci Resolve / the BRAW SDK)", space: null,
    url: null, file: null, page: "https://www.blackmagicdesign.com/support",
  },
};

const forMaker = (maker) => Object.entries(REGISTRY).filter(([, e]) => e.maker === maker).map(([id, e]) => ({ id, ...e }));

// Premiere's own bundled LUTs are NOT an alternative and are not offered: the SpeedLooks camera "profiles"
// in Lumetri's menu are a look, not a maker's conversion, and the owner's verdict on them is flat (13:10:
// "we should actually not use any Premiere's LUTs, they are no good - it shouldn't even be an option, we
// always download"). Every conversion offered here comes from the maker's own page. If the editor ASKS for
// one of Premiere's by name, that is their call and the panel obliges (13:26: "if the user wants a built in
// option they can, but it's not something we will offer") - resolve() below finds any file they name, in
// Premiere's own LUT folders or anywhere on disk. Nothing calls it unless they ask.
const lumetriDirs = () => {
  let names = []; try { names = fs.readdirSync("/Applications").filter((n) => /^Adobe Premiere Pro/.test(n)); } catch (_) { return []; }
  return names.sort().reverse().flatMap((n) => ["Technical", "Legacy", "Creative"].map((sub) => path.join("/Applications", n, n + ".app", "Contents", "Lumetri", "LUTs", sub))).filter((d) => fs.existsSync(d));
};
// A LUT the editor named: an absolute path, or a file name inside Premiere's own folders ("SLOG3 - SL -
// PROFILE.itx"), or a fragment of one. Returns the path or null.
function resolve(nameOrPath) {
  const want = String(nameOrPath || "").trim();
  if (!want) return null;
  if (want.indexOf("/") >= 0) return fs.existsSync(want) ? want : null;
  for (const dir of lumetriDirs()) {
    const files = fs.readdirSync(dir);
    const hit = files.find((f) => f === want) || files.find((f) => f.toLowerCase().indexOf(want.toLowerCase()) >= 0);
    if (hit) return path.join(dir, hit);
  }
  return null;
}

// Where a LUT comes from, for the question that asks permission to fetch it: the site, not a URL nobody
// reads. "the editor can see where it's going to download from" (the owner, 13:10).
const site = (entry) => { const u = entry && (entry.url || entry.page); const m = u && /^https?:\/\/([^/]+)/.exec(u); return m ? m[1].replace(/^www\./, "") : null; };
// A file name Premiere is happy with: spaces, + and - in a LUT's name are a documented cause of it not
// applying, so the stored copy is plain (researched 2026-09-17).
const safeName = (name) => String(name).replace(/[^A-Za-z0-9._]+/g, "_").replace(/_+/g, "_");
const localPath = (id) => { const e = REGISTRY[id]; return e && e.file ? path.join(HOME, e.maker, safeName(e.file)) : null; };
const isLocal = (id) => { const p = localPath(id); return !!(p && fs.existsSync(p)); };

// Fetch one entry onto this machine. Returns { path } or { page } when there is no direct link, throws on failure.
async function fetchLut(id) {
  const e = REGISTRY[id];
  if (!e) throw new Error("no LUT " + id);
  if (!e.url) return { page: e.page, note: e.label + " has no direct link: open the page, accept the maker's terms, save the zip, and drop the .cube into " + path.join(HOME, e.maker) };
  const dir = path.join(HOME, e.maker);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, safeName(e.file));
  if (fs.existsSync(dest)) return { path: dest, cached: true };
  const zip = path.join(dir, path.basename(e.url));
  const r = spawnSync("curl", ["-sL", "-A", "Mozilla/5.0", "-o", zip, e.url], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(zip) || fs.statSync(zip).size < 1000) throw new Error("download failed from " + e.url);
  if (/\.zip$/i.test(zip)) {
    const u = spawnSync("unzip", ["-o", "-j", "-q", zip, "-d", dir], { encoding: "utf8" });
    if (u.status !== 0) throw new Error("unzip failed: " + (u.stderr || "").trim());
    try { fs.rmSync(zip, { force: true }); } catch (_) {}
  }
  if (!fs.existsSync(dest)) { const cubes = fs.readdirSync(dir).filter((f) => /\.cube$/i.test(f)); if (cubes.length === 1) fs.renameSync(path.join(dir, cubes[0]), dest); }
  if (!fs.existsSync(dest)) throw new Error("the archive did not contain " + e.file);
  fs.writeFileSync(dest, normaliseCube(fs.readFileSync(dest, "utf8"), e.label));
  return { path: dest };
}

// Premiere's cube parser is strict: Sony's own s709 file (CRLF line endings, two comment lines and a blank
// line before LUT_3D_SIZE, no DOMAIN lines) was rejected on selection and the menu fell back to the
// previous entry (11:21). Rewritten the way Adobe's own cubes are laid out, values untouched.
// Also drops LUT_3D_INPUT_RANGE (a Resolve-ism Premiere rejects outright), any 1D/shaper block and the BOM
// - the documented causes of a LUT that lists but will not load (researched 2026-09-17).
function normaliseCube(text, title = "converted") {
  const lines = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  let size = null; const data = [];
  for (const l of lines) {
    if (/^LUT_3D_SIZE/i.test(l)) { size = Number(l.split(/\s+/)[1]); continue; }
    if (/^(TITLE|DOMAIN_MIN|DOMAIN_MAX|LUT_1D_SIZE|LUT_1D_INPUT_RANGE|LUT_3D_INPUT_RANGE|SHAPER)/i.test(l)) continue;
    const v = l.split(/\s+/).map(Number);
    if (v.length === 3 && v.every(Number.isFinite)) data.push(v.map((n) => n.toFixed(6)).join(" "));
  }
  if (!size || data.length !== size * size * size) throw new Error("not a 3D cube I can read (size " + size + ", " + data.length + " entries)");
  return ["TITLE \"" + title + "\"", "LUT_3D_SIZE " + size, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0", ...data].join("\n") + "\n";
}

module.exports = { REGISTRY, HOME, forMaker, localPath, isLocal, fetchLut, normaliseCube, safeName, site, resolve };
