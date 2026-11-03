import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWordDecisions,groupTimedWords,quietCutBounds,previewEligibility} from '../scripts/codex-retake-benchmark.mjs';
const words=Array.from({length:8},(_,id)=>({id,word:'词',startMs:id*200,endMs:id*200+100}));
const cut=(first=0,last=1,replacementFirst=4,replacementLast=7)=>({first,last,replacementFirst,replacementLast,kind:'retake',reason:'完整重说'});
test('rejects invented word IDs, invalid evidence, overlapping cuts and deletion of replacement',()=>{
  assert.throws(()=>validateWordDecisions({cuts:[cut(0,90)]},words));
  assert.throws(()=>validateWordDecisions({cuts:[cut()]},words.map(w=>({...w,endMs:w.startMs}))));
  assert.throws(()=>validateWordDecisions({cuts:[cut(),cut(1,2)]},words));
  assert.throws(()=>validateWordDecisions({cuts:[cut(),{...cut(4,5),kind:'filler',replacementFirst:-1,replacementLast:-1}]},words));
  assert.throws(()=>validateWordDecisions({cuts:[cut(0,2,2,7)]},words));
});
test('retakes require a later retained replacement; filler decisions do not manufacture timing',()=>{
  assert.deepEqual(validateWordDecisions({cuts:[cut()]},words),[cut()]);
  assert.throws(()=>validateWordDecisions({cuts:[{...cut(),replacementLast:9}]},words));
  assert.throws(()=>validateWordDecisions({cuts:[{...cut(),kind:'filler'}]},words));
  assert.equal(validateWordDecisions({cuts:[{...cut(),kind:'filler',replacementFirst:-1,replacementLast:-1}]},words).length,1);
});
test('zero-duration alignment tokens become indivisible observed groups, never interpolated character times',()=>{
 const raw=[{id:0,word:'一',startMs:0,endMs:0},{id:1,word:'个',startMs:0,endMs:0},{id:2,word:'词',startMs:0,endMs:100},{id:3,word:'尾',startMs:100,endMs:100}];
 const grouped=groupTimedWords(raw);
 assert.equal(grouped.length,1);assert.equal(grouped[0].word,'一个词尾');assert.equal(grouped[0].endMs,100);assert.deepEqual(grouped[0].memberIds,[0,1,2,3]);
 assert.equal(raw[2].word,'词');
 assert.throws(()=>groupTimedWords([{id:0,word:'词',startMs:10,endMs:10}]));
 assert.throws(()=>groupTimedWords([{id:0,word:'甲',startMs:0,endMs:100},{id:1,word:'乙',startMs:50,endMs:150}]));
});
test('quiet boundary refinement cannot consume adjacent retained words or force absent quiet anchors',()=>{
 const w=[{startMs:0,endMs:500},{startMs:1000,endMs:1500},{startMs:2000,endMs:2500}];
 const cut={first:1,last:1};
 const bounds=quietCutBounds(cut,w,[[.5,.9],[1.6,1.9]],[0,3]);
 assert.equal(bounds.boundaryStatus,'word-clock-and-quiet-checked');assert.ok(bounds.startSec>=.5&&bounds.startSec<=1);assert.ok(bounds.endSec>=1.5&&bounds.endSec<=2);
 assert.equal(quietCutBounds(cut,w,[[0,.4],[2.1,2.4]],[0,3]).boundaryStatus,'needs-review');
});
test('context clipped at a sample edge never becomes an automatically removed false start',()=>{
 const words=[{startMs:25000,endMs:25080},{startMs:26000,endMs:27000}];
 assert.equal(previewEligibility({first:0,last:0,boundaryStatus:'word-clock-and-quiet-checked'},words,[25,85]),'sample-edge-context-missing');
 assert.equal(previewEligibility({first:1,last:1,boundaryStatus:'needs-review'},words,[25,85]),'quiet-boundary-unresolved');
 assert.equal(previewEligibility({first:1,last:1,boundaryStatus:'word-clock-and-quiet-checked'},words,[25,85]),null);
});
