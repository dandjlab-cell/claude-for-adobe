// Log footage: which conversion, decided from the picture, not from a profile nobody remembers.
//
// The owner, 2026-09-17: "we normally won't know what the shoot was done on … we have to make our best
// judgement." So the pass does what an editor does with the Interpret Footage list: try the plausible
// entries, look, keep the one that looks like a picture. Measured on a Sony A7S II XAVC S file that
// declared nothing (eight overrides, tone mapper on, 10:15): S-Log3/S-Gamut3.Cine gave black 9.0 /
// white 85.1 / color p99 29 with nothing crushed; S-Log2 LIFTED the floor to 21.6 (the wrong curve on
// S-Log3 data); Canon Log3 and V-Log crushed 0.3-0.4%; ARRI LogC3 scored as well as the Sony one on the
// numbers - which is why the maker named by the container (XAVC = Sony) breaks the tie.
"use strict";

// What the file DECLARES about its color, before any frame is decoded. A tagged log file says so in its
// transfer characteristic, and then there is nothing to guess: the maker and the curve are both known.
// Untagged camera MP4s (a Sony A7S II's XAVC S, checked 2026-09-17) declare nothing, which is why the
// picture test exists at all. Returns { space, maker } or null.
const DECLARED = [
  [/arib[-_ ]?std[-_ ]?b67|hlg/i, null, null], // HLG is a broadcast transfer, not a maker log space: never converted here
  [/^s[-_ ]?log ?2$|slog2/i, "sony", "Sony S-Log2/S-Gamut"],
  [/^s[-_ ]?log ?3$|slog3/i, "sony", "Sony S-Log3/S-Gamut3.Cine"],
  [/log ?c ?4|logc4/i, "arri", "ARRI LogC4/Wide Gamut4"],
  [/log ?c|logc/i, "arri", "ARRI LogC3/Wide Gamut3"],
  [/c[-_ ]?log ?3|clog3/i, "canon", "Canon Log3/Cinema Gamut"],
  [/c[-_ ]?log ?2|clog2/i, "canon", "Canon Log2/Cinema Gamut"],
  [/v[-_ ]?log|vlog/i, "panasonic", "Panasonic V-Log/V-Gamut"],
  [/f[-_ ]?log ?2|flog2/i, "fuji", "Fuji F-Log2/F-GamutC"],
  [/f[-_ ]?log|flog/i, "fuji", "Fuji F-Log/Rec. 2020"],
  [/n[-_ ]?log|nlog/i, "nikon", "Nikon N-Log/Rec2020"],
  [/d[-_ ]?log|dlog/i, "dji", "DJI D-Log/D-Gamut"],
  [/apple ?log/i, "apple", "Apple Log/Rec. 2020"],
  [/log ?3g10|log3g10/i, "red", "Red Log3G10/Wide Gamut"],
];
function declaredSpace(tags = {}) {
  const text = Object.entries(tags).map(([k, v]) => k + "=" + v).join("\n");
  for (const [re, maker, space] of DECLARED) if (re.test(text)) return space && maker ? { space, maker } : null;
  return null;
}

// What the file says about its maker. ffprobe tags and the path; null when nothing says.
function cameraHint({ tags = {}, path = "" } = {}) {
  const t = Object.entries(tags).map(([k, v]) => (k + "=" + v).toLowerCase()).join("\n");
  const p = String(path).toLowerCase();
  if (/\.braw$/.test(p)) return "blackmagic";
  if (/\.r3d$/.test(p)) return "red";
  if (/\.(ari|mxf)$/.test(p) && /arri|alexa|amira/.test(t)) return "arri";
  if (/xavc|sony|ilce|pxw|fx3|fx6|fx9|a7s|venice/.test(t)) return "sony";
  if (/canon|eos|cinema eos|c70|c300|c500|r5c/.test(t)) return "canon";
  if (/panasonic|lumix|varicam|eva1|gh5|gh6|s1h|s5/.test(t)) return "panasonic";
  if (/fujifilm|fuji|x-t|x-h|gfx/.test(t)) return "fuji";
  if (/apple|iphone|com\.apple\.quicktime/.test(t)) return "apple";
  if (/dji|osmo|mavic|ronin/.test(t)) return "dji";
  if (/nikon|z ?[6-9]/.test(t)) return "nikon";
  if (/leica/.test(t)) return "leica";
  if (/arri|alexa|amira/.test(t)) return "arri";
  if (/red digital|redcode|komodo|raptor/.test(t)) return "red";
  return null;
}

// Which entries of Premiere's override list are log conversions worth trying, and which maker each is.
const MAKER_OF = [
  [/^sony /i, "sony"], [/^canon /i, "canon"], [/^panasonic /i, "panasonic"], [/^arri /i, "arri"],
  [/^red /i, "red"], [/^fuji /i, "fuji"], [/^apple /i, "apple"], [/^dji /i, "dji"], [/^nikon /i, "nikon"], [/^leica /i, "leica"],
];
const makerOf = (name) => { for (const [re, m] of MAKER_OF) if (re.test(name)) return m; return null; };

// The list to try, in order: the hinted maker's entries first, then every other maker's. Display and
// container spaces (Rec., sRGB, P3, DCDM, ACES) are never candidates.
function candidates(names, hint = null) {
  const log = names.filter((n) => makerOf(n));
  const own = hint ? log.filter((n) => makerOf(n) === hint) : [];
  const rest = log.filter((n) => !own.includes(n));
  return own.concat(rest);
}

// How far a converted read sits from a display picture. Lower is better; a real conversion of the right
// curve scores under ~12 on this scale, the wrong curve well above. Crushing and clipping are penalised
// hard: a conversion that puts pixels on the floor has the wrong black.
const TARGET = { black: 4, white: 91, satLo: 25, satHi: 45, bodyMin: 45 };
function score(m, { maker = null, hint = null } = {}) {
  const f = m.frame || m;
  let s = Math.abs(f.luma.p1 - TARGET.black) + Math.abs(f.luma.p99 - TARGET.white);
  const sat = f.saturation.p99;
  if (sat < TARGET.satLo) s += TARGET.satLo - sat; else if (sat > TARGET.satHi) s += sat - TARGET.satHi;
  const crushed = Math.max(f.crushed || 0, ...["red", "green", "blue"].map((c) => (f.floor && f.floor[c]) || 0));
  const clipped = Math.max(f.clipped.red, f.clipped.green, f.clipped.blue);
  s += crushed * 20 + clipped * 20;
  if (f.luma.p10 !== undefined && f.luma.p90 - f.luma.p10 < TARGET.bodyMin) s += (TARGET.bodyMin - (f.luma.p90 - f.luma.p10)) / 2;
  if (hint && maker === hint) s -= 5; // the maker the file names breaks a tie, never overrides a bad picture
  return Math.round(s * 10) / 10;
}

// The winner among tried conversions: [{ name, m }] -> { name, score, rows } or null when none looks like a picture.
const ACCEPT = 14;
function pick(tried, hint = null) {
  const rows = tried.map(({ name, m }) => ({ name, score: score(m, { maker: makerOf(name), hint }) })).sort((a, b) => a.score - b.score);
  const best = rows[0];
  return best && best.score <= ACCEPT ? { name: best.name, score: best.score, rows } : { name: null, score: best ? best.score : null, rows };
}

module.exports = { declaredSpace, cameraHint, makerOf, candidates, score, pick, TARGET, ACCEPT };
