const test = require('node:test');
const assert = require('node:assert/strict');
const { rebuildSequence, mapRetainedWords } = require('../src/silence-rebuild.cjs');

test('rebuild sends exact cuts once, yields between batches, and requires final verification', async () => {
  const calls=[], cuts=[{start:1.123456789,end:2.987654321}]; let steps=0;
  const result=await rebuildSequence(async(action,payload)=>{
    calls.push([action,payload]);
    if(action==='begin')return JSON.stringify({done:false,completed:0,total:9});
    if(action==='step')return JSON.stringify({done:++steps===2,completed:steps===1?8:9,total:9});
    return JSON.stringify({done:true,sequenceId:'copy',name:'copy',mapping:[{sourceId:'m',sourceIn:0,sourceOut:3,originalStart:0,originalEnd:3,start:0,end:3}],duration:3});
  },{cuts,expectedSnapshot:'bound'},()=>false,()=>{});
  assert.deepEqual(calls.map(c=>c[0]),['begin','step','step','finish']);
  assert.deepEqual(JSON.parse(calls[0][1]),{cuts,expectedSnapshot:'bound',batchSize:24});
  assert.equal(result.sequenceId,'copy');
});

test('stop and host failures cancel the partial output and never finish',async()=>{
  for(const failure of ['stop','host']){
    const calls=[];let stopped=false;
    await assert.rejects(rebuildSequence(async(action)=>{
      calls.push(action);
      if(action==='begin'){stopped=failure==='stop';return failure==='host'?'ERR:source changed':JSON.stringify({done:false,completed:0,total:9});}
      return '{}';
    },{},()=>stopped,()=>{}),failure==='stop'?/Stopped/:/source changed/);
    assert.deepEqual(calls,['begin','cancel']);
  }
});

test('retained words use actual original and destination ranges and flag sliced words',()=>{
  const words=[{start:1,end:2,text:'whole',speaker:'A',delivery:{pitch:120}}, {start:2.8,end:3.2,text:'sliced'}, {start:4,end:4.5,text:'gone'}, {start:6,end:7,text:'later'}];
  const mapping=[{sourceId:'a',sourceIn:11,originalStart:1,originalEnd:3,start:0,end:2}, {sourceId:'b',sourceIn:20,originalStart:6,originalEnd:8,start:2,end:4}];
  const mapped=mapRetainedWords(words,mapping);
  assert.deepEqual(mapped.map(w=>[w.text,w.start,w.end,w.partial]),[['whole',0,1,false],['sliced',1.7999999999999998,2,true],['later',2,3,false]]);
  assert.equal(mapped[0].speaker,'A'); assert.deepEqual(mapped[0].delivery,{pitch:120});
  assert.equal(mapped[2].sourceStart,20);assert.equal(mapped[2].originalStart,6);
  assert.deepEqual(words[1],{start:2.8,end:3.2,text:'sliced'});
});

test('Cut silences button uses one structured detector plan and the native rebuild, never legacy apply',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../panel.js'),'utf8');
  const body=source.slice(source.indexOf('async function runCutButton('),source.indexOf('// Captions button:'));
  let detections=0, rebuilt=false;const messages=[], labels=[];
  const card={open(){},progress(done,total,label){labels.push(label);},done(text){messages.push(text);}};
  const context={beginButtonJob:()=>true,addTool:()=>card,quietCard:null,askInline:async()=>true,
    SILENCE_REBUILD_BATCH_SIZE:24,host:async()=> 'bound',readProject:async()=>({}),parseSnapshot:()=>({id:'source'}),
    timelineFingerprint:()=> 'fp', freshTimelineWords:()=>null,
    removeSilences:async args=>{detections++;assert.equal(args._planOnly,true);return {cuts:[{start:1,end:2}],snap:{id:'source'},summary:'test'};},
    require:()=>({rebuildSequence:async(call,plan,cancel,progress)=>{progress(0,10,24,{phase:"building",remainingMs:null});progress(5,10,24,{phase:"building",remainingMs:90000});progress(10,10,24,{phase:"checking",remainingMs:null});assert.equal(plan.expectedSnapshot,'bound');assert.equal(plan.cuts[0].start,1);rebuilt=true;return {name:'copy',sequenceId:'copy',duration:2,mapping:[]};},mapRetainedWords}),
    path:require('node:path'),extensionRoot:'/',cancelRequested:false,
    analysisDir:()=>'/analysis',fs:{mkdirSync(){},writeFileSync(){}},
    refreshSuspended:false,clearTimeout(){},snapshotTimer:null,ledgerTimer:null,
    readSnapshot:async()=>({id:'copy'}),refreshLedgerSoon(){},setStatus(){},log(){},endButtonJob(){},Date,JSON};
  vm.createContext(context);vm.runInContext(body,context);
  await context.runCutButton({},'Cut silences');
  assert.equal(detections,1);assert.equal(rebuilt,true);assert.match(messages.at(-1),/CHECK PASS/);
  assert.equal(labels.some(x=>x.includes('Estimating')),true);assert.equal(labels.some(x=>x.includes('~2 min left to build')),true);assert.equal(labels.some(x=>x.includes('Checking source ranges')),true);
  context.askInline=async()=>false; detections=0; rebuilt=false;
  await context.runCutButton({},'Cut silences');
  assert.equal(detections,0);assert.equal(rebuilt,false);assert.match(messages.at(-1),/Cancelled/);
});

test('a stalled host response cancels instead of looping indefinitely', async()=>{
  const calls=[];
  await assert.rejects(rebuildSequence(async action=>{
    calls.push(action);return JSON.stringify({done:false,completed:0,total:8});
  },{},()=>false,()=>{}),/no valid progress/);
  assert.deepEqual(calls,['begin','step','cancel']);
});

test('missing and malformed source mapping cannot produce success',async()=>{
  for(const mapping of [[],[{}],[{sourceId:'m',sourceIn:0,sourceOut:3,originalStart:0,originalEnd:3,start:1,end:4}]]) {
    const calls=[];
    await assert.rejects(rebuildSequence(async(action)=>{
      calls.push(action); return JSON.stringify(action==='begin'?{done:true}:{done:true,sequenceId:'c',name:'copy',duration:3,mapping});
    },{},()=>false,()=>{}),/mapping/);
    assert.deepEqual(calls,['begin','finish','cancel']);
  }
});

test('recoverable insert failures reduce batches 24 to 16 to 8 without restarting',async()=>{
  const sizes=[],updates=[];let steps=0;
  const result=await rebuildSequence(async(action,payload)=>{
    if(action==='begin'){assert.equal(JSON.parse(payload).batchSize,24);return JSON.stringify({done:false,completed:0,total:3});}
    if(action==='step') {sizes.push(payload ? JSON.parse(payload).batchSize : 24);steps++;return JSON.stringify(steps<3?{done:false,completed:steps-1,total:3,retryable:true,retryBatchSize:steps===1?16:8}:{done:true,completed:3,total:3});}
    assert.equal(action,'finish');return JSON.stringify({done:true,sequenceId:'c',name:'copy',duration:3,mapping:[{sourceId:'m',sourceIn:0,sourceOut:3,originalStart:0,originalEnd:3,start:0,end:3}]});
  },{},()=>false,(...args)=>updates.push(args));
  assert.deepEqual(sizes,[24,16,8]);assert.equal(result.batchSize,8);assert.equal(result.initialBatchSize,24);
  assert.equal(updates.some(args=>args[2]===16),true);
});

test('fallback is bounded and never retries ambiguous failures or invalid progress',async()=>{
  for(const mode of ['exhausted','error','regressed','done','wrongBatch']) {
    const calls=[];
    await assert.rejects(rebuildSequence(async(action)=>{
      calls.push(action);
      if(action==='begin')return JSON.stringify({done:false,completed:1,total:3});
      if(action==='cancel')return '{}';
      if(mode==='error')return 'ERR:inserted pair did not verify';
      return JSON.stringify({done:mode==='done',completed:mode==='regressed'?0:1,total:3,retryable:true,retryBatchSize:mode==='wrongBatch'?24:calls.filter(x=>x==='step').length===1?16:8});
    },{},()=>false,()=>{}),mode==='error'?/did not verify/:mode==='exhausted'?/smallest batch/:mode==='wrongBatch'?/Invalid smaller-batch/:/valid progress/);
    assert.equal(calls.filter(x=>x==='step').length,mode==='exhausted'?3:1);assert.equal(calls.at(-1),'cancel');
  }
});

test('Stop wins over a pending smaller-batch retry',async()=>{
  const calls=[];let stopped=false;
  await assert.rejects(rebuildSequence(async action=>{
    calls.push(action);
    if(action==='begin')return JSON.stringify({done:false,completed:0,total:3});
    if(action==='step'){stopped=true;return JSON.stringify({done:false,completed:0,total:3,retryable:true,retryBatchSize:16});}
    return '{}';
  },{},()=>stopped,()=>{}),/Stopped/);
  assert.deepEqual(calls,['begin','step','cancel']);
});

test('remaining assembly estimate uses recent batches and switches to verification',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');let clock=0;
  const context={module:{exports:{}},Date:{now:()=>clock}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/silence-rebuild.cjs'),'utf8'),context);
  const updates=[];let step=0;
  await context.module.exports.rebuildSequence(async action=>{
    if(action==='begin')return JSON.stringify({done:false,completed:0,total:6});
    if(action==='step'){clock+=++step*1000;return JSON.stringify({done:step===3,completed:step*2,total:6});}
    return JSON.stringify({done:true,sequenceId:'c',name:'copy',duration:3,mapping:[{sourceId:'m',sourceIn:0,sourceOut:3,originalStart:0,originalEnd:3,start:0,end:3}]});
  },{},()=>false,(done,total,batch,estimate)=>updates.push(estimate));
  assert.equal(updates[0].remainingMs,null);
  assert.equal(updates[1].remainingMs,2000);
  assert.equal(updates[2].remainingMs,1500);
  assert.equal(updates[3].phase,'checking');
  assert.equal(updates[3].remainingMs,null);
});
