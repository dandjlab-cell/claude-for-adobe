const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','panel.js'),'utf8');
const body=source.slice(source.indexOf('async function roughCut('),source.indexOf('// The exact timeline transcript as indexed words'));

function harness({failCleanup=false, cancelAfterCleanup=false, badClone=false,selectedClips=false}={}) {
  const calls=[], files=new Map();
  let snap;
  const ctx={require:p=>p.endsWith('silence_map.cjs')?{measureWav:()=>({duration:8,silences:[{start:2,end:5}]})}:require(p),
    path,extensionRoot:path.join(__dirname,'..'),timelineFingerprint:s=>JSON.stringify(s),
    ownSequences:new Set(),workingCopies:new Map(),project:{path:'/test.prproj'},cancelRequested:false,
    fs:{existsSync:p=>p==='/fixture.wav'||files.has(p),mkdirSync(){},unlinkSync:p=>files.delete(p),writeFileSync:(p,s)=>files.set(p,s),readFileSync:p=>files.get(p)},
    addTool:()=>({open(){},progress(){},done(){}}),setStatus(){},renderCopies(){},log(){},addMessage(){},
    selectedBin:async()=>selectedClips ? '' : 'Footage/TALKING HEAD',
    createSequence:async args=>{
      snap={id:'cleanup',name:args.name,width:1080,height:1920,duration:8,clips:['V1','A1'].map(track=>({id:track,track,start:0,end:8,inPoint:0,mediaPath:'/fixture.wav',kind:''}))};
      ctx.ownSequences.add(snap.id); await ctx.refreshProject();calls.push('create'); return {text:'created'};
    },
    readSnapshot:async()=>structuredClone(snap),refreshProject:async()=>Object.assign(ctx.project,{sequenceId:snap.id,sequence:snap.name}),
    fillFrame:async()=> 'filled',focusFaces:async()=>[],
    audioClipsIn:async()=>({snap:structuredClone(snap),clips:[{...snap.clips[1],s0:0,s1:8,pek:'peak',rate:16000}]}),
    parsePeakFile:()=>({}),peakWindows:()=>[{t:0,peak:.5},{t:7.9,peak:.5}],
    loudIntervals:require('../src/silence.cjs').loudIntervals,
    applyCuts:async (_card,cuts,_dry,_summary,expected)=>{
      assert.equal(expected.id,"cleanup");
      calls.push('cleanup');if(failCleanup)return {isError:true,text:'CHECK FAIL'};
      const removed=cuts.reduce((n,c)=>n+c.end-c.start,0);snap.duration-=removed;snap.clips.forEach(c=>c.end-=removed);
      if(cancelAfterCleanup)ctx.cancelRequested=true;
      return {text:'CHECK PASS'};
    },
    host:async (name,...args)=>{
      calls.push(name);
      if(name==='binMedia')return selectedClips ? 'selected media' : '';
      if(name==='exportSequenceAudio'){files.set(args[0],Buffer.from('wav'));return 'ok';}
      if(name==='cloneActive'){
        snap=structuredClone(snap);snap.id='editorial';snap.name=args[0];snap.clips.forEach(c=>c.id+='copy');
        if(badClone)snap.clips[0].inPoint=1;
        return snap.id+'|'+snap.name;
      }
      if(name==='openSequence')return 'ok';
      throw new Error('Unexpected host '+name);
    },
    seqFile:suffix=>ctx.project.sequence+suffix,analysisDir:()=>'/analysis',wavPreset:()=>'/preset',
    listTranscripts:()=>[],transcriptForClip:()=>null,modelReady:()=>true,
    transcribeRenderedTimeline:async (_wav,s)=>{calls.push('transcribe:'+s.id);return {words:[{text:'speech'}]};},
    transcriptIndex:async()=>({text:'indexed Editorial'}),
  };
  vm.createContext(ctx);vm.runInContext(body,ctx);
  return {ctx,calls,files,run:()=>ctx.roughCut({aspect:'9:16'})};
}

test('rough cut cleans before one Editorial clone and transcribes only Editorial',async()=>{
  const h=harness(),r=await h.run();
  assert.ok(!r.isError,r.text);
  assert.equal(h.calls.filter(c=>c==='cloneActive').length,1);
  assert.ok(h.calls.indexOf('cleanup')<h.calls.indexOf('cloneActive'));
  assert.ok(h.calls.includes('transcribe:editorial'));
  assert.equal(h.ctx.project.sequenceId,'editorial');
  assert.ok(Math.abs(JSON.parse(JSON.parse([...h.files.entries()].find(([p])=>p.endsWith('.stages.json'))[1]).cleanup.fingerprint).duration-5.36)<1e-6);
  assert.equal(h.ctx.ownSequences.has('cleanup'),false);
  assert.equal(h.ctx.ownSequences.has('editorial'),true);
  assert.equal(h.ctx.workingCopies.get('editorial').originalId,'cleanup');
  assert.match(r.text,/Cleanup/); assert.match(r.text,/Editorial/);
});

test('cleanup failure or cancellation stops before Editorial is created',async()=>{
  for(const options of [{failCleanup:true},{cancelAfterCleanup:true}]){
    const h=harness(options),r=await h.run();assert.equal(r.isError,true);
    assert.ok(!h.calls.includes('cloneActive'));
    assert.ok(!h.calls.some(c=>c.startsWith('transcribe:')));
  }
});

test('a mismatched clone stops before transcription and reopens Cleanup',async()=>{
  const h=harness({badClone:true}),r=await h.run();
  assert.equal(r.isError,true);assert.ok(h.calls.includes('openSequence'));
  assert.ok(!h.calls.some(c=>c.startsWith('transcribe:')));
});

test('bound cleanup refuses a stale plan before making a working copy',async()=>{
  const code=source.slice(source.indexOf('async function applyCuts('),source.indexOf('async function removeSilences('));
  const ctx={readSnapshot:async()=>({id:'other'}),timelineFingerprint:JSON.stringify,err:(_c,text)=>({text,isError:true})};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const result=await ctx.applyCuts({},[{start:1,end:2}],false,'cleanup',{id:'cleanup'});
  assert.equal(result.isError,true);assert.match(result.text,/changed/);
});

test('collision suffix keeps an existing working copy registered',async()=>{
  const start=source.indexOf('async function ensureWorkingCopy('),end=source.indexOf('\n}',start)+2;
  const ctx={ui:{dupSequence:{checked:true}},readProject:async()=>({sequenceId:'copy',sequence:'Interview [Claude] v2'}),ownSequences:new Set(),workingCopies:new Map([['copy',{originalId:'original'}]]),renderCopies(){},log(){},host(){throw new Error('must not clone again');}};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
  await ctx.ensureWorkingCopy();assert.equal(ctx.workingCopies.has('copy'),true);
});

test('rough cut starts from selected Project clips without a bin or open timeline',async()=>{
  const h=harness({selectedClips:true}),r=await h.run();
  assert.ok(!r.isError,r.text);assert.ok(h.calls.includes('binMedia'));
  assert.equal(h.ctx.project.sequence,'Selected clips 9x16 Editorial');
});

test('classify_clips reads selected source media without asking for a timeline',async()=>{
  const seen=[],rows=Array.from({length:9},(_,i)=>['clip'+i,'/selected'+i+'.mov',String(i),'1920x1080','25','10'].join('\u0002')).join('\u0003');
  const ctx={path,selectedBin:async()=>{throw new Error('selected clips must take precedence over selected bins');},host:async(name,...args)=>{assert.equal(name,'binMedia');assert.equal(args[2],'true');return rows;},readSnapshot(){throw new Error('no active sequence');},addTool:()=>({open(){},progress(){},done(){}}),parseDuration:Number,project:{},timeline:null,vadModule:{speechSegments:()=>({segments:[{start:0,end:5}]})},mediaDurationFromPeak:()=>10,transcriptForClip:()=>null,cachedWords:()=>null,classifyMedia:x=>{seen.push(x.name);return {...x,ratio:.5};},formatClassification:x=>String(x.length)+' selected clips',writeAnalysis(){},setStatus(){}};
  vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function classifyClips('),source.indexOf('function mediaDurationFromPeak(')),ctx);
  const r=await ctx.classifyClips({});assert.match(r.text,/9 selected clips/);assert.equal(seen.length,9);
});
