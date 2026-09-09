const test = require('node:test');
const assert = require('node:assert/strict');
const { planCleanup, sameContents } = require('../src/cleanup.cjs');

const snapshot = (duration=8) => ({ id:'cleanup', width:1080, height:1920, duration,
  clips:[{ id:'v',track:'V1',start:0,end:duration,inPoint:0,mediaPath:'/fixture.mov',kind:'' },
         { id:'a',track:'A1',start:0,end:duration,inPoint:0,mediaPath:'/fixture.mov',kind:'' }] });
const evidence={sourceEvidence:[{id:'a',sound:[{start:0,end:1},{start:4,end:4.05},{start:7,end:8}]}]};

test('cleanup preserves a short detected response between long silences', () => {
  const plan=planCleanup([{start:1,end:4},{start:4.05,end:7}],snapshot(),evidence);
  assert.equal(plan.cuts.length,2);
  assert.ok(plan.cuts.every(c=>c.end<=4 || c.start>=4.05));
  assert.deepEqual(plan.cuts.map(c=>({start:+c.start.toFixed(6),end:+c.end.toFixed(6)})),[{start:4.23,end:6.82},{start:1.18,end:3.82}]);
});

test('cleanup leaves an entirely quiet source clip untouched', () => {
  const s=snapshot();
  s.clips.push({id:'a2',track:'A1',start:8,end:12,inPoint:0,mediaPath:'/quiet.mov',kind:''});
  s.duration=12;
  const plan=planCleanup([{start:1,end:4},{start:8,end:12}],s,evidence);
  assert.equal(plan.protectedClips.length,1);
  assert.ok(plan.cuts.every(c=>c.end<=8));
  assert.equal(planCleanup([{start:0,end:8}],snapshot()).cuts.length,0);
});

test('source waveform vetoes cancelled mix audio and unknown overlapping clips protect their span',()=>{
  const s=snapshot();
  assert.equal(planCleanup([{start:1,end:7}],s,{sourceEvidence:[{id:'a',sound:[{start:0,end:8}]}]}).cuts.length,0);
  s.clips.push({id:'unknown',track:'A2',start:0,end:8,inPoint:0,mediaPath:'/unknown.mov',kind:''});
  assert.equal(planCleanup([{start:1,end:7}],s,evidence).cuts.length,0);
});

test('cleanup rejects invalid settings and malformed silence evidence', () => {
  for (const settings of [{minSilence:NaN},{minSilence:0},{pad:-1},{pad:Infinity}])
    assert.throws(()=>planCleanup([],snapshot(),settings));
  assert.throws(()=>planCleanup([{start:3,end:2}],snapshot()));
  assert.throws(()=>planCleanup([{start:0,end:9}],snapshot()));
  assert.throws(()=>planCleanup([],{...snapshot(),clips:[]}));
});

test('clone comparison ignores IDs and names but checks every source and trim', () => {
  const a=snapshot(), b=structuredClone(a);
  b.id='editorial'; b.name='Editorial'; b.clips.forEach(c=>c.id+='copy');
  assert.equal(sameContents(a,b),true);
  b.clips[1].inPoint=.1;
  assert.equal(sameContents(a,b),false);
  b.clips[1].inPoint=0; b.width=1920;
  assert.equal(sameContents(a,b),false);
  assert.equal(sameContents(a,{error:'no active sequence'}),false);
});

 test('cleanup preserves video-only spans before and after audio',()=>{
  const s=snapshot(15);s.clips[1].start=5;s.clips[1].end=10;
  const plan=planCleanup([{start:0,end:6},{start:9,end:15}],s,{sourceEvidence:[{id:'a',sound:[{start:6,end:9}]}]});
  assert.ok(plan.cuts.length);
  assert.ok(plan.cuts.every(c=>c.start>=5&&c.end<=10));
});
