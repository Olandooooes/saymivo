import test from 'node:test';import assert from 'node:assert/strict';
import {emphasisGeometry,emphasisLineGeometry} from '../src/emphasis-layout.mjs';
import {tagAnimationEnvelope,tagLineEnvelope} from '../src/tag-animation.mjs';
const tag={text:'执行一项任务',x:.69,y:.12,atMs:1000,endMs:4000};
test('unspecified animation preserves the previously shipped entry, hold, exit and stagger samples',()=>{
 const expected=[[1100,.599941682461,19.202799241872,5.600816445546],[2000,1,0,0],[3900,.05689576695493859,30.179335457441965,-9.431042330450614]];
 for(const [ms,opacity,x,y]of expected){const value=emphasisGeometry(tag,1920,1080,ms);for(const [a,b]of [[value.opacity,opacity],[value.x,x],[value.y,y]])assert.ok(Math.abs(a-b)<1e-10);}
 assert.deepEqual(emphasisLineGeometry(tag,2,3,1200),{opacity:.3077492034592627,y:12.46051433773327});
});
test('phase durations change only motion inside the existing source window',()=>{
 const before=structuredClone(tag),tuned={...tag,animation:{inMs:200,outMs:120}};
 assert.ok(emphasisGeometry(tuned,1920,1080,1100).opacity>emphasisGeometry(tag,1920,1080,1100).opacity);
 assert.equal(emphasisGeometry(tuned,1920,1080,1000).opacity,0);assert.equal(emphasisGeometry(tuned,1920,1080,4000).opacity,0);
 assert.deepEqual([tuned.atMs,tuned.endMs],[before.atMs,before.endMs]);assert.deepEqual(tag,before);
});
test('zero phase durations and tiny windows remain finite and obey inclusive entry/exclusive exit',()=>{
 for(const kind of ['label','kinetic'])for(const duration of [0,1,40,600]){
  const t={atMs:1000,endMs:1000+duration,animation:{inMs:0,outMs:0,lineDelayMs:0}};
  for(const ms of [999,1000,1000+duration/2,1000+duration]){
   const state=tagAnimationEnvelope(t,ms,kind);assert.ok(Object.values(state).every(Number.isFinite));assert.equal(state.opacity,ms>=t.atMs&&ms<t.endMs?1:0);
  }
 }
});
test('authored long phases fit a short cue and leave a fully visible reading interval',()=>{
 const t={atMs:1000,endMs:1100,animation:{inMs:2000,outMs:2000}};
 for(const kind of ['label','kinetic']){const state=tagAnimationEnvelope(t,1050,kind);assert.equal(state.opacity,1);assert.ok(state.inMs+state.outMs<100);}
});
test('explicit line anchors wait for the next spoken phrase and animate each whole line once',()=>{
 const t={atMs:2212,endMs:3542,lineAtMs:[2212,2932],animation:{inMs:200,outMs:120}};
 assert.equal(tagLineEnvelope(t,1,2,2900).opacity,0);assert.equal(tagLineEnvelope(t,1,2,2932).opacity,0);
 assert.equal(tagLineEnvelope(t,1,2,3150).opacity,1);assert.equal(tagLineEnvelope(t,1,2,3400).opacity,1);
 assert.equal(tagLineEnvelope(t,1,2,3542).opacity,0);assert.equal(tagLineEnvelope(t,0,2,2400).y,0);
 const halfExit=tagLineEnvelope(t,1,2,3482);assert.ok(Math.abs(halfExit.opacity-.125)<1e-12);
 assert.deepEqual(t.lineAtMs,[2212,2932]);
});
