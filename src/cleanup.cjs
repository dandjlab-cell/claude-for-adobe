"use strict";
const { planCuts, silencesFrom } = require('./silence.cjs');

function planCleanup(silences, snapshot, {minSilence=1, pad=.18, sourceEvidence=[]}={}) {
  if (!Number.isFinite(minSilence) || minSilence<=0 || !Number.isFinite(pad) || pad<0)
    throw new Error('cleanup minimum silence must be positive and padding nonnegative');
  if (!snapshot || snapshot.error || !Number.isFinite(snapshot.duration) || snapshot.duration<=0)
    throw new Error('cleanup needs a valid timeline');
  const audio=snapshot.clips.filter(c=>/^A\d+$/.test(c.track));
  if (!audio.length) throw new Error('cleanup needs audio clips');
  const valid=r=>r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.start>=0 && r.end>r.start && r.end<=snapshot.duration+.001;
  if (!Array.isArray(silences) || !silences.every(valid)) throw new Error('invalid measured silence');
  const vetoes=[],protectedClips=[];
  for (const clip of audio) {
    const evidence=sourceEvidence.find(e=>e.id===clip.id);
    if (!evidence || !Array.isArray(evidence.sound) || !evidence.sound.length || !evidence.sound.every(valid)) {
      vetoes.push({start:clip.start,end:clip.end}); protectedClips.push(clip.name || clip.mediaPath || clip.id);
    } else vetoes.push(...evidence.sound);
  }
  // Only measured silence covered by an audio clip is eligible; preserve video-only spans.
  const coverage=audio.flatMap(c=>silences.map(s=>({start:Math.max(c.start,s.start),end:Math.min(c.end,s.end)})).filter(s=>s.end>s.start));
  const quiet=silencesFrom(coverage,vetoes,0,snapshot.duration);
  return {cuts:planCuts(quiet,{minLen:minSilence,pad,rangeStart:0,rangeEnd:snapshot.duration}),protectedClips};
}

// Native clone geometry only; snapshots do not expose effects, mute/gain or markers.
function sameContents(a,b) {
  if (!a || !b || a.error || b.error || !Array.isArray(a.clips) || !Array.isArray(b.clips)) return false;
  const content=s=>[s.width,s.height,s.duration,s.clips.map(c=>[c.track,c.start,c.end,c.inPoint,c.mediaPath,c.kind||''])];
  return JSON.stringify(content(a))===JSON.stringify(content(b));
}

module.exports={planCleanup,sameContents};
