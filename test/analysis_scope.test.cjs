const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','panel.js'),'utf8');
const body=source.slice(source.indexOf('async function listAnalysis('),source.indexOf('// Claude\'s own notes'));
function harness({selected='C1.mov\u0002/media/C1.mov\u00021',bins=[],snap={name:'Other edit',clips:[],id:'t'}}={}) {
  const files=new Map(Object.entries({
    'C1.mov.transcript.md':'selected transcript', 'C10.mov.transcript.md':'unrelated transcript',
    'Shoot.classification.md':'bin classification', 'Other edit.timeline.json':'{}',
    'Other edit.transcript.md':'<!-- timeline old -->\nold words',
    'selected-clips.classification.md':'unbound old selection', 'chat-old.md':'old chat',
    'C1.mov.mix.wav':'audio', 'C1.mov.visibility.json':'{}',
    '9x16-safe-zone.md':'# Approved safe area\n'+ 'long rule '.repeat(1000),
    'unrelated-handoff.md':'# Developer notes', 'snapshots':'directory'
  }));
  const ctx={path,project:{path:'/project.prproj'},analysisDir:()=>'/analysis',
    fs:{readdirSync:()=>[...files.keys()],statSync:p=>({isFile:()=>path.basename(p)!=='snapshots',size:20,mtime:new Date(0)}),readFileSync:p=>files.get(path.basename(p))},
    readSnapshot:async()=>snap,timeline:snap,timelineFingerprint:s=>s?.id||'',cachedWords:()=>null,
    selectedBins:async()=>bins,host:async(_name,bin)=>bin?'C1.mov\u0002/media/C1.mov\u00021':selected,
    addTool:()=>({done(){}}),err:(_,text)=>({text,isError:true})};
  vm.createContext(ctx);vm.runInContext(body,ctx);return ctx;
}
test('analysis defaults to exact selected clips and compact guidance, never the unrelated active edit',async()=>{
  const r=await harness().listAnalysis({});
  assert.match(r.text,/C1.mov.transcript.md/); assert.match(r.text,/9x16-safe-zone.md/);
  for(const name of ['C10.mov','Other edit.timeline','chat-old','mix.wav','visibility.json','selected-clips.classification','unrelated-handoff','long rule']) assert.ok(!r.text.includes(name),name);
});
test('analysis supports selected bins, active timeline, explicit full listing, and selection errors',async()=>{
  let r=await harness({selected:'',bins:['Shoot']}).listAnalysis({});assert.match(r.text,/Shoot.classification.md/);
  r=await harness({selected:''}).listAnalysis({});assert.match(r.text,/Other edit.timeline.json/);assert.match(r.text,/STALE/);
  r=await harness().listAnalysis({all:true});assert.match(r.text,/chat-old.md/);assert.match(r.text,/C10.mov/);
  r=await harness({selected:'ERR:selection unavailable'}).listAnalysis({});assert.equal(r.isError,true);assert.doesNotMatch(r.text,/Other edit/);
  r=await harness({selected:'',snap:null}).listAnalysis({});assert.doesNotMatch(r.text,/Other edit\.|C1.mov/);
});
