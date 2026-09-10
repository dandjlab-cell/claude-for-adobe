const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const P = require('../src/transcript_presentation.cjs');

test('panel transcript_index uses intact presentation and discards stale speaker annotations', async () => {
  const vm=require('node:vm'), source=fs.readFileSync(path.join(__dirname,'..','panel.js'),'utf8');
  const body=source.slice(source.indexOf('async function transcriptIndex('),source.indexOf('// The thought-level audio cut:'));
  const words=[{text:'Hello',start:0,end:.4},{text:'again.',start:.5,end:1}];
  const files=new Map([['.mix.json',JSON.stringify({timeline:'t'})],['.mix.wav','wav'],['.diarization.json','{"schema":"bad"}']]);
  let calls=0, exports=0, failExport=false, switched=false, switchDuringExport=false;
  const ctx={path,extensionRoot:'/',require:()=>({...P,delivery:()=>{calls++;return {perWord:words.map(()=>({energyDb:null,f0Median:null,pauseBefore:0}))};}}),
    fs:{existsSync:p=>files.has(p),unlinkSync:p=>files.delete(p),readFileSync:p=>{if(!files.has(p))throw Error('missing');return files.get(p);},writeFileSync:(p,v)=>files.set(p,v)},
    wavPreset:()=>'/preset',host:async(name,wav)=>{assert.equal(name,'exportSequenceAudio');exports++;if(failExport)return 'ERR:export failed';files.set(wav,'fresh');if(switchDuringExport)switched=true;return 'ok';},
    seqFile:s=>s,readSnapshot:async()=>({duration:1,id:switched?'other':'t'}),timelineFingerprint:s=>s.id,freshTimelineWords:()=>({words}),
    addTool:()=>({done(){}}),err:(_,text)=>({text,isError:true})};
  vm.createContext(ctx); vm.runInContext(body,ctx);
  let result=await ctx.transcriptIndex({});
  assert.equal(exports,1); assert.equal(calls,1); assert.match(result.text,/DIALOGUE: Hello again\./); assert.match(result.text,/diarization.*unavailable/i);
  assert.match(result.text,/identity mismatch/); assert.match(result.text,/INDEX: 0:Hello 1:again\./);
  failExport=true;
  result=await ctx.transcriptIndex({});
  assert.equal(calls,1); assert.match(result.text,/Prosody: unavailable/);
  failExport=false; switchDuringExport=true;
  result=await ctx.transcriptIndex({});
  assert.equal(result.isError,true); assert.match(result.text,/Sequence changed/); assert.equal(calls,1);
});

test('intact dialogue retains repeats and indices despite speaker switches and range filtering', () => {
  const words = 'Oh shoot the milk was supposed to be divided. Oh shoot.'.split(' ').map((text, i) => ({text, start:i, end:i+.3}));
  const before = JSON.stringify(words);
  const speakers = words.map((_, i) => i === 1 ? null : {scope:'clip-a', speaker:'SPEAKER_00'});
  const sidecar = {schema:'cfa-diarization', version:1, timeline:'t', wordsSha256:P.wordsHash(words), speakers};
  const text = P.render(words, {timeline:'t', diarization:sidecar, start:2, end:3});
  assert.match(text, /DIALOGUE: Oh shoot the milk was supposed to be divided\./);
  assert.match(text, /UNKNOWN: shoot/);
  assert.match(text, /0:Oh 1:shoot 2:the/);
  assert.doesNotMatch(text, /9:Oh/);
  assert.equal(JSON.stringify(words), before);
  assert.match(P.render(words), /DIALOGUE: Oh shoot\./);
  assert.throws(() => P.render(words, {timeline:'other', diarization:sidecar}), /identity/);
  assert.throws(() => P.render(words, {timeline:'t', diarization:{...sidecar, speakers:[]}}), /alignment/);
  assert.notEqual(P.wordsHash(words), P.wordsHash(words.map((w,i)=>i? w : {...w,start:.1})));
  assert.equal(P.wordsHash(words),P.wordsHash(words.map(w=>({end:w.end,start:w.start,text:w.text,confidence:.9}))));
  const unpunctuated=Array.from({length:30},(_,i)=>({text:'word',start:i,end:i+.5}));
  const whole=P.render(unpunctuated,{start:15,end:16});
  assert.equal((whole.match(/^DIALOGUE:/gm)||[]).length,1); assert.match(whole,/29:word/); assert.match(whole,/0:word/);
});

test('delivery is measured, cached against audio and words, and remains optional', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfa-dialogue-'));
  try {
    const wav = path.join(dir,'mix.wav'), cache = path.join(dir,'delivery.json');
    const n = 32000, b = Buffer.alloc(44+n*2);
    b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16);
    b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(16000,24); b.writeUInt32LE(32000,28);
    b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*2,40);
    for(let i=16000;i<n;i++) b.writeInt16LE(Math.round(6000*Math.sin(2*Math.PI*200*i/16000)),44+i*2);
    fs.writeFileSync(wav,b);
    const words = [{text:'Hello',start:1,end:1.2},{text:'there',start:1.3,end:1.5},{text:'again.',start:1.6,end:1.9}];
    const r = P.delivery(wav, words, 't', 2, cache);
    assert.ok(r.perWord[0].pauseBefore >= 1);
    assert.ok(r.perWord[0].f0Median > 0);
    assert.match(P.render(words,{perWord:r.perWord}), /measured pause before/);
    const saved = fs.readFileSync(cache,'utf8');
    assert.deepEqual(P.delivery(wav,words,'t',2,cache),r);
    assert.equal(fs.readFileSync(cache,'utf8'),saved);
    b.fill(0,44); fs.writeFileSync(wav,b);
    const changed = P.delivery(wav,words,'t',2,cache);
    assert.notEqual(changed.audioSha256,r.audioSha256);
    assert.equal(changed.perWord[0].f0Median,null);
    assert.throws(()=>P.delivery(wav,words,'t',9,cache),/duration/);
    fs.writeFileSync(wav,b.subarray(0,60));
    assert.throws(()=>P.delivery(wav,words,'t',2,cache),/truncated/);
    assert.match(P.render(words),/unavailable/);
    const observations = [{f0Median:100,energyDb:-20,pauseBefore:0},{f0Median:120,energyDb:-18,pauseBefore:0},{f0Median:140,energyDb:-15,pauseBefore:0}];
    const out = P.render(words,{perWord:observations});
    assert.match(out,/pitch is higher/); assert.match(out,/signal level is higher/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
