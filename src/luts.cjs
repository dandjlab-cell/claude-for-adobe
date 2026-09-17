// The makers' official log-to-Rec.709 conversion LUTs: where they live, and where they go on this machine.
//
// NOT BUNDLED, and the question of whether they could be was settled by reading the terms rather than
// guessing (the owner, 13:55: "is it just better to have them inside the library already? we're not
// repackaging it - I don't know if it's considered redistribution"). Canon's, the strictest, says: "You may
// download and use the Content solely for your personal, non-commercial use ... You shall not distribute,
// assign, license, sell, rent, broadcast, transmit, publish or transfer the Content to any other party."
// Repackaging is not the test - who hands the file to the editor is. Shipping it in this repo would be us
// publishing it; fetching it is the maker handing it to their own user, which is what the terms allow. So
// every LUT comes down from the maker's own site, onto that editor's machine, at their click.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

// A visible folder, not the hidden Library: the editor has to be able to reach these files for Lumetri's
// Browse (the owner, 11:38: "getting to that lut is difficult because it's behind a hidden folder").
const HOME = path.join(os.homedir(), "Documents", "Claude for Premiere", "LUTs");

// id -> { maker, label, space (Premiere's override name it corresponds to), url (direct zip, .gz or .cube),
// pick (which file inside an archive of many - a case-insensitive fragment of its name), file (what the
// stored copy is called), page (where a human goes when url is null) }
//
// Every url below was fetched and opened on 2026-09-17: status, content type, size and the names inside the
// archive all checked by hand, not taken from a search result. Where a maker ships a pack, `pick` names the
// straight log-to-709 conversion in it and not the looks that sit beside it (Canon's WideDR, Fuji's ETERNA
// and WDR, Sony's Cine+709 are looks; the entries here are the plain transform).
const REGISTRY = {
  "sony-slog3-sgamut3cine-to-709": {
    maker: "sony", label: "Sony S-Log3/S-Gamut3.Cine → Rec.709 (s709 v2.00, official)", space: "Sony S-Log3/S-Gamut3.Cine",
    url: "https://77snszqv.media.zestyio.com/Slog3-S-Gamut3.Cine_To_s709_V200.zip", file: "Slog3-S-Gamut3.Cine_To_s709_V200.cube",
    page: "https://sony-cinematography.com/resources/luts/",
  },
  "sony-slog2-sgamut-to-709": {
    maker: "sony", label: "Sony S-Log2/S-Gamut → Rec.709 (official)", space: "Sony S-Log2/S-Gamut",
    url: "https://support.d-imaging.sony.co.jp/download/NEX/ciOkozszIz/Look_profile_for_resolve_S-Gamut_Slog2.zip?fm=en",
    pick: "To_SLog2-709_", file: "From_SLog2SGamut_To_SLog2-709.cube",
    page: "https://support.d-imaging.sony.co.jp/support/ilc/movie/en/grading/03.html",
  },
  "canon-clog3-cinemagamut-to-709": {
    maker: "canon", label: "Canon Log3/Cinema Gamut → BT.709 (Wide DR 33-grid, official)", space: "Canon Log3/Cinema Gamut",
    url: "https://gdlp01.c-wss.com/gds/2/0200007512/01/canon-lut-202510.zip", // 80 MB: Canon's whole LUT pack
    pick: "CinemaGamut_CanonLog3-to-BT709_WideDR_33_FF", file: "CinemaGamut_CanonLog3_to_BT709_33.cube",
    page: "https://asia.canon/en/support/0200751202", // the version in the url rots; the page has the current one
    // Canon's terms, read 2026-09-17, are the strictest of the set and the reason nothing here is bundled:
    // "You may download and use the Content solely for your personal, non-commercial use ... You shall not
    // distribute, assign, license, sell, rent, broadcast, transmit, publish or transfer the Content to any
    // other party." Fetching it onto the editor's own machine is Canon handing it to their own user, which
    // those terms allow; shipping it inside this repo would be the publishing they forbid.
    terms: "Canon licenses this LUT for personal, non-commercial use. Grading paid client work with it is between you and Canon.",
  },
  "panasonic-vlog-to-v709": {
    maker: "panasonic", label: "Panasonic V-Log → V-709 (official)", space: "Panasonic V-Log/V-Gamut",
    url: "https://av.jpn.support.panasonic.com/support/share2/eww/en/dsc/lut/VLog_to_V709_forV35_EN.zip",
    pick: "VLog_to_V709_forV35_ver100.cube", file: "VLog_to_V709.cube",
    page: "https://av.jpn.support.panasonic.com/support/global/cs/dsc/download/lut/index.html",
  },
  "arri-logc3-to-709": {
    maker: "arri", label: "ARRI LogC3 → Rec.709 gamma 2.4 (33-grid, from ARRI's own LUT generator)", space: "ARRI LogC3/Wide Gamut3",
    url: "https://tools.arri.com/fileadmin/adapps/lutgenerator/php/lutconv.php?srcfmt=logc&destfmt=video&colorspace=rec709D65Gamma24&peakW=1000&diffuseW=200&type=3dlut&format=adobe3d&size=33",
    file: "ARRI_LogC3_to_Rec709_33.cube", // the generator returns it gzipped
    page: "https://www.arri.com/en/learn-help/learn-help-camera-system/tools/lut-generator",
  },
  "fuji-flog-to-709": {
    maker: "fuji", label: "Fujifilm F-Log/F-Gamut → BT.709 (33-grid, official)", space: "Fuji F-Log/Rec. 2020",
    url: "https://dl.fujifilm-x.com/lut/x-h2s-3d-lut-v100.zip", // Fujifilm publishes per body; the transform is the same
    pick: "_to_FLog_BT.709_33grid", file: "FLog_FGamut_to_BT709_33.cube",
    page: "https://fujifilm-x.com/en-us/support/download/lut/",
  },
  "dji-dlog-to-709": {
    maker: "dji", label: "DJI D-Log → Rec.709 (official)", space: "DJI D-Log/D-Gamut",
    url: "https://terra-1-g.djicdn.com/851d20f7b9f64838a34cd02351370894/260%20downloads/DJI%20Mavic%203%20D-Log%20to%20Rec.709%20V1.cube",
    file: "DJI_DLog_to_Rec709.cube", page: "https://www.dji.com/downloads/softwares/transcoding-mavic-3",
  },
  "dji-dlogm-to-709": {
    maker: "dji", label: "DJI D-Log M → Rec.709 (official)", space: null,
    url: "https://terra-1-g.djicdn.com/851d20f7b9f64838a34cd02351370894/M3/DJI%20Mavic%203%20D-Log%20M%20to%20Rec.709%20V1.cube",
    file: "DJI_DLogM_to_Rec709.cube", page: "https://www.dji.com/downloads/softwares/dji-mavic-3-d-log-m-709-lut",
  },
  "nikon-nlog-to-709": {
    maker: "nikon", label: "Nikon N-Log → Rec.709 (official, v2.00)", space: "Nikon N-Log/Rec2020",
    url: null, file: null, // Nikon ships it as a .dmg installer behind a per-release token: a human has to run it
    page: "https://downloadcenter.nikonimglib.com/en/download/sw/258.html",
  },
  "blackmagic-gen5-film-to-video": {
    maker: "blackmagic", label: "Blackmagic Design Film Gen 5 → Extended Video", space: null,
    url: null, file: null, // no standalone download exists: the cubes ship inside the free DaVinci Resolve
    page: "https://www.blackmagicdesign.com/support/family/davinci-resolve-and-fusion",
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
//
// What comes back down the wire is decided by its first bytes, not by the URL: Sony's zip ends in "?fm=en",
// ARRI's generator has no extension at all and answers with gzip, DJI serves a bare .cube. All three, and a
// pack of 300 cubes, land the same way - one file, normalised, under the maker's folder.
async function fetchLut(id) {
  const e = REGISTRY[id];
  if (!e) throw new Error("no LUT " + id);
  if (!e.url) return { page: e.page, note: e.label + " has no direct download: open " + e.page + ", accept the maker's terms, and drop the .cube into " + path.join(HOME, e.maker) };
  const dir = path.join(HOME, e.maker);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, safeName(e.file));
  if (fs.existsSync(dest)) return { path: dest, cached: true };
  const tmp = path.join(dir, ".download-" + id);
  const r = spawnSync("curl", ["-sL", "-A", "Mozilla/5.0", "--max-time", "600", "-o", tmp, e.url], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(tmp) || fs.statSync(tmp).size < 1000) throw new Error("download failed from " + e.url);
  const head = Buffer.alloc(4); const fd = fs.openSync(tmp, "r"); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
  try {
    if (head[0] === 0x50 && head[1] === 0x4b) {            // PK: a zip, of one file or of hundreds
      const work = path.join(dir, ".unpack-" + id);
      fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
      const u = spawnSync("unzip", ["-o", "-j", "-q", tmp, "-d", work], { encoding: "utf8" });
      if (u.status !== 0 && !fs.readdirSync(work).length) throw new Error("unzip failed: " + (u.stderr || "").trim());
      const cubes = fs.readdirSync(work).filter((f) => /\.(cube|itx|look)$/i.test(f));
      const want = e.pick ? cubes.find((f) => f.toLowerCase().indexOf(e.pick.toLowerCase()) >= 0) : (cubes.length === 1 ? cubes[0] : null);
      if (!want) { fs.rmSync(work, { recursive: true, force: true }); throw new Error("could not find " + (e.pick || "a single .cube") + " in the archive (" + cubes.length + " files)"); }
      fs.renameSync(path.join(work, want), dest);
      fs.rmSync(work, { recursive: true, force: true });
    } else if (head[0] === 0x1f && head[1] === 0x8b) {      // gzip: ARRI's generator answers with one
      const g = spawnSync("sh", ["-c", "gunzip -c " + JSON.stringify(tmp) + " > " + JSON.stringify(dest)], { encoding: "utf8" });
      if (g.status !== 0) throw new Error("gunzip failed: " + (g.stderr || "").trim());
    } else {
      fs.renameSync(tmp, dest);                             // the cube itself
    }
  } finally { fs.rmSync(tmp, { force: true }); }
  // Canon's pack stores its cubes read-only (mode 444) and unzip keeps that, so the rewrite below failed
  // with EACCES on a file that had just downloaded fine. The copy on this machine is ours to rewrite.
  try { fs.chmodSync(dest, 0o644); } catch (_) {}
  // Rewritten only when Premiere would otherwise refuse it. Sony's own s709 file (CRLF, comments and a blank
  // line before LUT_3D_SIZE) was rejected on selection, 11:21 - but a file Premiere accepts as it stands is
  // left exactly as the maker wrote it, which also keeps clear of Canon's "shall not reformat".
  const raw = fs.readFileSync(dest, "utf8");
  if (needsRewrite(raw)) fs.writeFileSync(dest, normaliseCube(raw, e.label));
  return { path: dest, terms: e.terms || null };
}

// Premiere's cube parser is strict: Sony's own s709 file (CRLF line endings, two comment lines and a blank
// line before LUT_3D_SIZE, no DOMAIN lines) was rejected on selection and the menu fell back to the
// previous entry (11:21). Rewritten the way Adobe's own cubes are laid out, values untouched.
// Also drops LUT_3D_INPUT_RANGE (a Resolve-ism Premiere rejects outright), any 1D/shaper block and the BOM
// - the documented causes of a LUT that lists but will not load (researched 2026-09-17).
// What Premiere refuses: a BOM, CRLF, comments or blank lines before LUT_3D_SIZE, LUT_3D_INPUT_RANGE, a
// shaper block. A file with none of those is already in the shape Adobe's own cubes are in - leave it alone.
const needsRewrite = (text) => /^﻿/.test(text) || /\r/.test(text) ||
  /^(LUT_3D_INPUT_RANGE|LUT_1D_SIZE|SHAPER)/im.test(text) ||
  /^(#|\s*$)/m.test(text.slice(0, text.search(/^LUT_3D_SIZE/im) + 1 || 1));

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

module.exports = { REGISTRY, HOME, forMaker, localPath, isLocal, fetchLut, normaliseCube, needsRewrite, safeName, site, resolve };
