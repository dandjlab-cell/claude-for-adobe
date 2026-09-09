const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("native sequence cloning uses a distinct name and leaves the source active content alone", () => {
  const vm = require("node:vm");
  const original = { sequenceID: "source", name: "Cleanup", clone() {
    sequences.push({ sequenceID:"copy", name:"Cleanup Copy" }); sequences.numSequences=sequences.length;
    return true;
  } };
  const sequences=[original,{sequenceID:"old",name:"Editorial"}]; sequences.numSequences=sequences.length;
  const project={activeSequence:original,sequences,openSequence(id){this.activeSequence=sequences.find(s=>s.sequenceID===id);}};
  const context=vm.createContext({app:{project}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"..","host","premiere.jsx"),"utf8"),context);
  assert.equal(context.PCX.cloneActive("Editorial"),"copy|Editorial v2");
  assert.equal(project.activeSequence.sequenceID,"copy");
  assert.equal(original.name,"Cleanup");
});

// The host script is ES3 that Premiere evaluates once at panel boot. If any exported name is not defined,
// PCX never initialises and every tool breaks. Parse it and check the export table against the definitions.
test("host/premiere.jsx parses and every exported host function is defined", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  assert.doesNotThrow(() => new Function(src), "host script must parse");
  const ret = /return \{([^{}]*)\};\s*\}\(\)\);/.exec(src);
  assert.ok(ret, "export table not found");
  const names = [...ret[1].matchAll(/(\w+):\s*(\w+)/g)].map((m) => m[2]);
  assert.ok(names.length > 10);
  const missing = names.filter((n) => !new RegExp("function " + n + "\\(").test(src));
  assert.deepEqual(missing, [], "exported but not defined");
  const dupes = names.filter((n) => (src.match(new RegExp("function " + n + "\\(", "g")) || []).length !== 1);
  assert.deepEqual(dupes, [], "exported function defined more than once");
  assert.ok(names.length >= 21, "export table shrank below the known-good baseline of 21");
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const called = [...panel.matchAll(/host\("(\w+)"/g)].map((m) => m[1]);
  const unknown = [...new Set(called)].filter((n) => !names.includes(n));
  assert.deepEqual(unknown, [], "panel calls host functions that are not exported");
});

// place_broll must not warn about its own work. The overwrite adds the b-roll's audio, the host removes it, and
// Premiere may append an empty audio track to hold it: none of that is a sync problem. The warning fired on every
// placement until 2026-09-06 because it compared whole-timeline strings. Guard the shape of the new comparison.
test("overlayClip's sync check compares clips, not whole-timeline strings", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "host", "premiere.jsx"), "utf8");
  const fn = /function overlayClip\([\s\S]*?\n  \}\n/.exec(src);
  assert.ok(fn, "overlayClip not found");
  const body = fn[0];
  assert.ok(!/after === before/.test(body), "must not compare fingerprints as one string");
  assert.ok(/lost\.length \?/.test(body), "warning must be driven by clips that went missing");
  assert.ok(/return out;\n    \}/.test(body), "fingerprint must return a list of clips");
});

// CEP resolves a relative require against the panel's URL, which carries %20 for the space in
// "Application Support", so require("./src/x.cjs") fails inside Premiere while passing in Node. Eight lazy
// requires did exactly that on 2026-09-07 and every feature behind them failed silently. Only the absolute form.
test("panel.js never requires by relative path", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "panel.js"), "utf8");
  const bad = [...panel.matchAll(/require\((["'])\.\.?\//g)].length;
  assert.strictEqual(bad, 0, "use require(path.join(extensionRoot, \"src\", ...))");
});

test("native creation also avoids existing sequence names",()=>{
  const vm=require("node:vm"),children=[{type:1,getMediaPath:()=>"/fixture.mov"}];children.numItems=1;
  const sequences=[{name:"Cleanup"},{name:"Cleanup v2"}];sequences.numSequences=2;
  const project={rootItem:{children},sequences,openSequence(){},createNewSequenceFromClips(name){
    return {sequenceID:"new",name,getSettings:()=>({videoFrameWidth:1080,videoFrameHeight:1920})};
  }};
  const context=vm.createContext({app:{project}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"..","host","premiere.jsx"),"utf8"),context);
  assert.equal(context.PCX.createSequenceFromBin("","Cleanup","","","","true"),"new|Cleanup v3|1080x1920|1|0");
});

test("bound native extraction rejects stale geometry before enabling QE",()=>{
  const vm=require("node:vm"),empty={numTracks:0};
  const sequence={name:"Cleanup",sequenceID:"c",end:8,videoTracks:empty,audioTracks:empty,getSettings:()=>({videoFrameWidth:1080,videoFrameHeight:1920})};
  const context=vm.createContext({app:{project:{activeSequence:sequence},enableQE(){throw new Error("must not reach QE");}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"..","host","premiere.jsx"),"utf8"),context);
  assert.match(context.PCX.extractRanges("[[1,2]]","stale snapshot"),/ERR:.*changed/);
});

test("selected project clips can be inspected and assembled without an active sequence",()=>{
  const vm=require("node:vm");
  const clip=(id)=>({type:1,nodeId:id,name:id,getMediaPath:()=>"/"+id+".mov",getProjectColumnsMetadata:()=>""});
  const selected=Array.from({length:9},(_,i)=>clip("selected"+i)),other=clip("unselected");
  const children=[...selected,other];children.numItems=children.length;
  const sequences=[];sequences.numSequences=0;let laid;
  const project={rootItem:{children},sequences,openSequence(){},createNewSequenceFromClips(name,items){laid=items;return {sequenceID:"new",name,getSettings:()=>({videoFrameWidth:1080,videoFrameHeight:1920})};}};
  const app={project,getCurrentProjectViewSelection:()=>[...selected,{type:2,name:"Other bin",nodeId:"bin",children:[other]}]};
  const context=vm.createContext({app});vm.runInContext(fs.readFileSync(path.join(__dirname,"..","host","premiere.jsx"),"utf8"),context);
  const rows=context.PCX.binMedia("","true","true").split("\u0003");
  assert.equal(rows.length,9);assert.ok(rows.every(r=>!r.includes("unselected")));
  assert.match(context.PCX.createSequenceFromBin("","Selected Cleanup","","","","true","true"),/\|9\|0$/);
  assert.deepEqual(Array.from(laid,x=>x.nodeId),selected.map(x=>x.nodeId));
  app.getCurrentProjectViewSelection=()=>[];laid=null;
  assert.match(context.PCX.createSequenceFromBin("","Empty","","","","true","true"),/^ERR:/);assert.equal(laid,null);
});
