import {test}from'node:test';import assert from'node:assert/strict';import {pauseSegments}from'../scripts/pause-plan.mjs';
test('quiet first syllable is protected by cached source word timings',()=>{const c={inSec:0,outSec:19.379},w=[{startMs:2000,endMs:2720},{startMs:17600,endMs:18260}];const segs=pauseSegments(c,[[0,1.461],[1.467,2.351],[18.585,19.379]],w);assert.equal(segs.length,1);assert(segs[0].inSec<=1.82);assert(segs[0].outSec>=18.26);assert(!segs.some(s=>s.inSec>2&&s.inSec<2.72));});
test('acoustic-only cutting keeps breath margins around real pauses',()=>{const segs=pauseSegments({inSec:0,outSec:5.5},[[2,3.5]]);assert.deepEqual(segs,[{inSec:0,outSec:2.12},{inSec:3.38,outSec:5.5}]);});
test('a short spoken word is retained even when shorter than noise threshold',()=>{const segs=pauseSegments({inSec:0,outSec:2},[[0,.9],[1.1,2]],[{startMs:900,endMs:1100}]);assert(segs.some(s=>s.inSec<=.9&&s.outSec>=1.1));});
test('long non-speech pause is shortened even when VAD edges overlap an anchored word',()=>{
 const clip={inSec:0,outSec:22};const words=[{startMs:1000,endMs:2000},{startMs:18000,endMs:20000}];
 const segments=pauseSegments(clip,[[2.1,18.2]],words);
 assert.equal(segments.length,2);assert(segments[0].outSec>=2.08);assert(segments[1].inSec<=17.92);
 assert(segments.reduce((n,s)=>n+s.outSec-s.inSec,0)<7);
});
test('speech inside a proposed gap remains intact between independently removed pauses',()=>{
 const clip={inSec:0,outSec:20};const words=[{startMs:1000,endMs:2000},{startMs:9000,endMs:10000},{startMs:18000,endMs:19000}];
 const segments=pauseSegments(clip,[[2.2,17.9]],words);
 assert(segments.some(s=>s.inSec<=9&&s.outSec>=10));
 for(const word of words)assert(segments.some(s=>s.inSec<=word.startMs/1000&&s.outSec>=word.endMs/1000));
});
test('the quiet English opening keeps at least 150ms before its reviewed word onset',()=>{
 const segments=pauseSegments({inSec:0,outSec:8},[[.2,3.328]],[{startMs:3250,endMs:3950},{startMs:3950,endMs:4450},{startMs:4510,endMs:6310}]);
 assert(segments[0].inSec<=3.1);
});
