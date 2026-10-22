import test from 'node:test';import assert from 'node:assert/strict';import {captionVisibility} from '../src/caption-visibility.mjs';
test('legacy hold remains 700ms, a reviewed cue can have a shorter or zero hold',()=>{
 const c={startMs:1000,endMs:2000};assert.equal(captionVisibility(c).visibleEndMs,2700);assert.equal(captionVisibility({...c,holdMs:120}).visibleEndMs,2120);assert.equal(captionVisibility({...c,holdMs:0}).durationInFrames,30);assert.deepEqual(c,{startMs:1000,endMs:2000});
});
test('next cue and clip end stop visual holds, including a cue rounding onto the cut',()=>{
 const c={startMs:1000,endMs:2000,holdMs:1000,holdMaxMs:2200};assert.equal(captionVisibility(c,2100).visibleEndMs,2100);assert.equal(captionVisibility(c).visibleEndMs,2200);
 const edge=captionVisibility({startMs:2199,endMs:2200,holdMaxMs:2200});assert.equal(edge.durationInFrames,0);
});
test('frame placement uses absolute endpoints and invalid/oversized holds cannot escape bounds',()=>{
 const c={startMs:16,endMs:34,holdMs:0};const v=captionVisibility(c);assert.equal(v.from,0);assert.equal(v.durationInFrames,1);
 assert.equal(captionVisibility({...c,holdMs:NaN}).holdMs,700);assert.equal(captionVisibility({...c,holdMs:-5}).holdMs,0);assert.equal(captionVisibility({...c,holdMs:9999}).holdMs,1000);assert.throws(()=>captionVisibility(c,Infinity,0));
});
