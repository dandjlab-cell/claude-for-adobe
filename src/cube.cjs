// A .cube 3D LUT written from a function of (r, g, b) in 0..1: the file format Lumetri's Input LUT custom
// slot loads, and the container for any log-to-Rec.709 conversion this pass builds itself (the owner,
// 23:25: no built-in LUTs - the maker's official file, or our own transform).
"use strict";
function cube(title, size, fn) {
  const lines = ["TITLE \"" + title + "\"", "LUT_3D_SIZE " + size, "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const out = fn(r / (size - 1), g / (size - 1), b / (size - 1));
    lines.push(out.map((v) => Math.max(0, Math.min(1, v)).toFixed(6)).join(" "));
  }
  return lines.join("\n") + "\n";
}
const identity = (size = 17) => cube("identity", size, (r, g, b) => [r, g, b]);
const inverted = (size = 17) => cube("inverted (a probe: unmistakable)", size, (r, g, b) => [1 - r, 1 - g, 1 - b]);
module.exports = { cube, identity, inverted };
