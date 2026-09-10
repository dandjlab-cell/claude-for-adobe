"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { readFrame, summarise, usable } = require("../src/face.cjs");

const face = (o = {}) => ({ faces: [Object.assign({ box: [0.3, 0.2, 0.7, 0.75], yaw: 0, pitch: null, roll: 0, quality: 0.5, eyes: 0.28, mouth: 0.1, facing: 0.01, tilt: 0.47 }, o)] });

test("reads a square, open-eyed frame as usable", () => {
  const r = readFrame(face(), 3);
  assert.ok(r.face && usable(r));
  assert.ok(r.notes.includes("looking at the lens"));
});
test("a turned head is not usable", () => {
  const r = readFrame(face({ facing: 0.14 }), 3);
  assert.ok(r.notes.includes("turned away"));
  assert.strictEqual(usable(r), false);
});
test("a blink and a poor frame are both caught", () => {
  assert.strictEqual(usable(readFrame(face({ eyes: 0.05 }), 1)), false);
  assert.strictEqual(usable(readFrame(face({ quality: 0.1 }), 1)), false);
});
test("the biggest face is taken as the speaker", () => {
  const two = { faces: [face().faces[0], Object.assign({}, face().faces[0], { box: [0.0, 0.0, 0.1, 0.1], facing: 0.4 })] };
  assert.ok(readFrame(two, 1).notes.includes("looking at the lens"));
});
test("no face is reported, not guessed", () => {
  const r = readFrame({ faces: [] }, 2);
  assert.strictEqual(r.face, false);
  assert.ok(/No face in any/.test(summarise([r]).text));
});
test("a span with nothing usable says to cover it", () => {
  const rows = [readFrame(face({ facing: 0.3 }), 1), readFrame(face({ eyes: 0.02 }), 2)];
  const s = summarise(rows);
  assert.strictEqual(s.usableShare, 0);
  assert.ok(/cover this line with b-roll/.test(s.text));
});
test("the best frame is the sharpest usable one", () => {
  const s = summarise([readFrame(face({ quality: 0.4 }), 1), readFrame(face({ quality: 0.9 }), 2)]);
  assert.strictEqual(s.best.t, 2);
});

test("speaker_check ignores solo status headers and preserves sample timestamps across batches", async () => {
  const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'..','panel.js'),'utf8');
  const start=source.indexOf('async function speakerCheck('), end=source.indexOf('\nasync function ',start+1);
  const requested=[];
  const ctx={path,os:require('node:os'),extensionRoot:path.join(__dirname,'..'),OCR_BIN:'/ocr',FACE_MAX_FRAMES:60,ROW:'\u0003',COL:'\u0002',
    fs:{existsSync:()=>true,unlinkSync(){}},addTool:()=>({open(){},progress(){},done(){}}),err:(_,text)=>({text,isError:true}),
    readSnapshot:async()=>({duration:100}),
    host:async(name,json,base)=>{assert.equal(name,'frames');const times=JSON.parse(json);requested.push(...times);return ['SOLO\u00022\u00022',...times.map((t,i)=>base+'_'+i+'\u0002'+t)].join('\u0003');},
    require:p=>p==='node:child_process'?{execFileSync:(_bin,args)=>args.slice(1).map(file=>JSON.stringify({file,...face()})).join('\n')}:require(p)};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
  const r=await ctx.speakerCheck({start_seconds:67.11,end_seconds:71.57});
  assert.ok(!r.isError,r.text);
  assert.deepEqual([...r.text.matchAll(/^(\d+\.\d+)s  facing/gm)].map(m=>Number(m[1])),requested);
  assert.equal(requested.length,9);
});
