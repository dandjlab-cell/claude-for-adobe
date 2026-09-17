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

const HOME = path.join(os.homedir(), "Library", "Application Support", "claude-for-adobe", "luts");

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
const localPath = (id) => { const e = REGISTRY[id]; return e && e.file ? path.join(HOME, e.maker, e.file) : null; };
const isLocal = (id) => { const p = localPath(id); return !!(p && fs.existsSync(p)); };

// Fetch one entry onto this machine. Returns { path } or { page } when there is no direct link, throws on failure.
async function fetchLut(id) {
  const e = REGISTRY[id];
  if (!e) throw new Error("no LUT " + id);
  if (!e.url) return { page: e.page, note: e.label + " has no direct link: open the page, accept the maker's terms, save the zip, and drop the .cube into " + path.join(HOME, e.maker) };
  const dir = path.join(HOME, e.maker);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, e.file);
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
  return { path: dest };
}

module.exports = { REGISTRY, HOME, forMaker, localPath, isLocal, fetchLut };
